"""Caderno Bíblico — imagens anexadas às notas.

Privacidade (fé é dado sensível, LGPD art. 11):

- o arquivo NUNCA vai para a área pública de ``content/`` do LearnHouse
  (``orgs/...`` e ``users/...``, que o roteador de conteúdo libera a qualquer
  um). Fica na pasta ``LEARNHOUSE_NOTE_MEDIA_DIR`` (padrão
  ``content/private/note_media/``) ou, com S3, no prefixo
  ``private/note_media/`` — fora de ``content/``, que é o único prefixo que
  o roteador de conteúdo S3 serve. O padrão local fica DENTRO de ``content/``
  de propósito: é a pasta que o deploy persiste (volume ``/app/api/content``
  no compose oficial), então as imagens sobrevivem ao redeploy sem
  configuração extra. ``content/private/`` é recusado com 404 pelos dois
  roteadores de ``/content`` (``local_content`` e ``content_files``), para
  qualquer usuário, e há teste para isso;
- o nome no disco é gerado pelo servidor (``<org>/<user>/<hex>.<ext>``); nada
  do nome enviado pelo cliente chega ao caminho;
- leitura só por endpoint: o dono (sessão), o link privado ``/n/<token>``
  (valida escopo, validade e revogação, e só serve imagens citadas pela nota
  compartilhada) ou, para a cópia publicada, quem pode ler a discussion;
- tipo validado pelo CONTEÚDO (assinatura + Pillow), metadados EXIF/GPS
  removidos ao regravar a imagem;
- limites: 5 MB por arquivo e quota por pessoa (``LEARNHOUSE_NOTE_MEDIA_QUOTA_MB``).

Publicar na comunidade COPIA cada imagem citada para um anexo
``scope='discussion'`` (outro arquivo, outro uuid). A publicação é uma cópia
da nota: apagar a nota ou a imagem dela depois não quebra a discussion, e o
anexo privado continua sem nenhum caminho público.
"""

import asyncio
import io
import json
import logging
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Dict, Iterable, List, Optional, Set, Tuple
from uuid import uuid4

from fastapi import HTTPException, Request, UploadFile
from sqlalchemy import delete, func, or_
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.db.notes import (
    ATTACHMENT_SCOPE_DISCUSSION,
    ATTACHMENT_SCOPE_NOTE,
    AttachmentRead,
    AttachmentUsage,
    Note,
    NoteAttachment,
    NoteTemplate,
)

logger = logging.getLogger(__name__)

MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_PIXELS = 40_000_000
MAX_SIDE = 2560
GRACE_HOURS = 24
_DEFAULT_QUOTA_MB = 100

# assinatura → (formato Pillow, mime, extensão)
_FORMATS = {
    "JPEG": ("image/jpeg", "jpg"),
    "PNG": ("image/png", "png"),
    "WEBP": ("image/webp", "webp"),
    "GIF": ("image/gif", "gif"),
}
_UUID_RE = re.compile(r"^noteatt_[0-9a-f\-]{36}$")
_KEY_RE = re.compile(r"^\d+/\d+/[0-9a-f]{32}\.(jpg|png|webp|gif)$")


# ---------------------------------------------------------------------------
# Configuração
# ---------------------------------------------------------------------------


def quota_bytes() -> int:
    try:
        mb = int(os.environ.get("LEARNHOUSE_NOTE_MEDIA_QUOTA_MB", _DEFAULT_QUOTA_MB))
    except ValueError:
        mb = _DEFAULT_QUOTA_MB
    return max(1, mb) * 1024 * 1024


# Relativo ao cwd da API (/app/api no container): content/ é o volume persistido.
_DEFAULT_MEDIA_DIR = os.path.join("content", "private", "note_media")


def _media_root() -> str:
    return os.path.realpath(os.environ.get("LEARNHOUSE_NOTE_MEDIA_DIR") or _DEFAULT_MEDIA_DIR)


def _use_s3() -> bool:
    try:
        from config.config import get_learnhouse_config

        return get_learnhouse_config().hosting_config.content_delivery.type == "s3api"
    except Exception:  # pragma: no cover - sem config (testes)
        return False


def _s3():  # pragma: no cover - exercitado só com S3 de verdade
    import boto3
    import botocore.config
    from config.config import get_learnhouse_config

    cfg = get_learnhouse_config().hosting_config.content_delivery.s3api
    client = boto3.client(
        "s3",
        endpoint_url=cfg.endpoint_url,
        config=botocore.config.Config(connect_timeout=10, read_timeout=60, retries={"max_attempts": 2}),
    )
    return client, (cfg.bucket_name or "learnhouse-media")


def _s3_key(storage_key: str) -> str:
    return f"private/note_media/{storage_key}"


# ---------------------------------------------------------------------------
# Armazenamento (chave gerada pelo servidor; nunca caminho do cliente)
# ---------------------------------------------------------------------------


def _fs_path(storage_key: str) -> str:
    if not _KEY_RE.match(storage_key or ""):
        raise HTTPException(status_code=400, detail="Invalid storage key")
    root = _media_root()
    full = os.path.realpath(os.path.join(root, *storage_key.split("/")))
    if not full.startswith(root + os.sep):
        raise HTTPException(status_code=400, detail="Invalid storage key")
    return full


def _write_file(path: str, data: bytes) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, path)


def _read_file(path: str) -> bytes:
    with open(path, "rb") as f:
        return f.read()


async def store_bytes(storage_key: str, data: bytes) -> None:
    if _use_s3():  # pragma: no cover
        client, bucket = _s3()
        await asyncio.to_thread(client.put_object, Bucket=bucket, Key=_s3_key(storage_key), Body=data)
        return
    await asyncio.to_thread(_write_file, _fs_path(storage_key), data)


async def load_bytes(storage_key: str) -> bytes:
    if _use_s3():  # pragma: no cover
        client, bucket = _s3()
        try:
            resp = await asyncio.to_thread(client.get_object, Bucket=bucket, Key=_s3_key(storage_key))
            return await asyncio.to_thread(resp["Body"].read)
        except Exception:
            raise HTTPException(status_code=404, detail="Attachment not found")
    path = _fs_path(storage_key)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Attachment not found")
    return await asyncio.to_thread(_read_file, path)


async def remove_bytes(storage_key: str) -> None:
    try:
        if _use_s3():  # pragma: no cover
            client, bucket = _s3()
            await asyncio.to_thread(client.delete_object, Bucket=bucket, Key=_s3_key(storage_key))
            return
        path = _fs_path(storage_key)
        if os.path.isfile(path):
            await asyncio.to_thread(os.remove, path)
    except Exception:
        # Sem detalhes do conteúdo no log; a chave é um nome aleatório.
        logger.warning("Falha ao remover anexo de nota %s", storage_key)


def _new_storage_key(org_id: int, user_id: int, ext: str) -> str:
    return f"{int(org_id)}/{int(user_id)}/{secrets.token_hex(16)}.{ext}"


def new_attachment_uuid() -> str:
    return f"noteatt_{uuid4()}"


# ---------------------------------------------------------------------------
# Validação e limpeza da imagem
# ---------------------------------------------------------------------------


def _sniff(data: bytes) -> Optional[str]:
    """Formato pela assinatura dos primeiros bytes (não pela extensão)."""
    if data[:3] == b"\xff\xd8\xff":
        return "JPEG"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "PNG"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "GIF"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "WEBP"
    return None


def process_image(data: bytes) -> Tuple[bytes, str, str, int, int]:
    """Valida e regrava a imagem sem metadados → (bytes, mime, ext, largura, altura).

    - assinatura e formato do Pillow precisam concordar (jpg, png, webp, gif);
    - imagens enormes (bomba de descompressão) são recusadas;
    - JPEG/PNG/WEBP estáticos são regravados (sai EXIF, GPS, XMP e textos
      do PNG; a orientação do EXIF é aplicada antes) e reduzidos a no máximo
      2560 px no lado maior;
    - GIF e WEBP animados são regravados quadro a quadro, sem metadados.
    """
    from PIL import Image, ImageOps, UnidentifiedImageError

    sniffed = _sniff(data)
    if sniffed is None:
        raise HTTPException(status_code=415, detail="Unsupported image type (use jpg, png, webp or gif)")
    try:
        with Image.open(io.BytesIO(data)) as probe:
            fmt = probe.format
            width, height = probe.size
            probe.verify()
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError):
        raise HTTPException(status_code=415, detail="Invalid image")
    if fmt != sniffed or fmt not in _FORMATS:
        raise HTTPException(status_code=415, detail="Unsupported image type (use jpg, png, webp or gif)")
    if width <= 0 or height <= 0 or width * height > MAX_PIXELS:
        raise HTTPException(status_code=413, detail="Image dimensions too large")

    mime, ext = _FORMATS[fmt]
    try:
        img = Image.open(io.BytesIO(data))
        animated = bool(getattr(img, "is_animated", False))
        out = io.BytesIO()
        if animated:
            frames = []
            durations = []
            for i in range(getattr(img, "n_frames", 1)):
                img.seek(i)
                frames.append(img.convert("RGBA") if fmt == "WEBP" else img.copy())
                durations.append(img.info.get("duration", 100))
            params = {"save_all": True, "append_images": frames[1:], "duration": durations,
                      "loop": img.info.get("loop", 0)}
            if fmt == "WEBP":
                params["quality"] = 85
            frames[0].save(out, format=fmt, **params)
            width, height = frames[0].size
        else:
            img = ImageOps.exif_transpose(img)
            if fmt == "JPEG" and img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
            if max(img.size) > MAX_SIDE:
                img.thumbnail((MAX_SIDE, MAX_SIDE))
            width, height = img.size
            if fmt == "JPEG":
                img.save(out, format="JPEG", quality=88, optimize=True)
            elif fmt == "PNG":
                img.save(out, format="PNG", optimize=True)
            elif fmt == "WEBP":
                img.save(out, format="WEBP", quality=88)
            else:
                img.save(out, format="GIF")
        cleaned = out.getvalue()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=415, detail="Invalid image")
    return cleaned, mime, ext, width, height


# ---------------------------------------------------------------------------
# Referências no conteúdo
# ---------------------------------------------------------------------------


def attachment_uuids_in_doc(content_json: str) -> List[str]:
    """uuids de anexos citados por nós ``image`` (attrs.anexo) do documento."""
    try:
        doc = json.loads(content_json or "")
    except (ValueError, TypeError):
        return []
    found: List[str] = []

    def walk(node):
        if isinstance(node, dict):
            if node.get("type") == "image":
                ref = (node.get("attrs") or {}).get("anexo")
                if isinstance(ref, str) and _UUID_RE.match(ref) and ref not in found:
                    found.append(ref)
            for c in node.get("content") or []:
                walk(c)

    walk(doc)
    return found


def rewrite_attachment_uuids(content_json: str, mapping: Dict[str, Optional[str]]) -> str:
    """Troca attrs.anexo pelo uuid novo (cópia); ``None`` remove o nó."""
    try:
        doc = json.loads(content_json or "")
    except (ValueError, TypeError):
        return content_json or ""

    def walk(node):
        if not isinstance(node, dict):
            return node
        children = node.get("content")
        if isinstance(children, list):
            kept = []
            for c in children:
                if isinstance(c, dict) and c.get("type") == "image":
                    ref = (c.get("attrs") or {}).get("anexo")
                    if ref:
                        new = mapping.get(ref)
                        if not new:
                            continue
                        c = {**c, "attrs": {**(c.get("attrs") or {}), "anexo": new}}
                kept.append(walk(c))
            node["content"] = kept
        return node

    return json.dumps(walk(doc), ensure_ascii=False)


# ---------------------------------------------------------------------------
# Regras de negócio
# ---------------------------------------------------------------------------


def _read(att: NoteAttachment) -> AttachmentRead:
    return AttachmentRead(attachment_uuid=att.attachment_uuid, mime=att.mime, size=att.size,
                          width=att.width, height=att.height)


async def used_bytes(db: AsyncSession, user_id: int) -> int:
    return int((await db.execute(
        select(func.coalesce(func.sum(NoteAttachment.size), 0)).where(
            NoteAttachment.user_id == user_id, NoteAttachment.scope == ATTACHMENT_SCOPE_NOTE
        )
    )).scalar() or 0)


async def usage(db: AsyncSession, user_id: int) -> AttachmentUsage:
    return AttachmentUsage(used=await used_bytes(db, user_id), quota=quota_bytes(), max_file=MAX_FILE_BYTES)


async def _referenced_uuids(db: AsyncSession, user_id: int, candidates: Iterable[str]) -> Set[str]:
    """Quais dos uuids ainda aparecem em alguma nota (inclusive na lixeira) ou
    modelo da pessoa. Busca textual: o uuid é longo e aleatório."""
    wanted = list(candidates)
    if not wanted:
        return set()
    found: Set[str] = set()
    for chunk_start in range(0, len(wanted), 50):
        chunk = wanted[chunk_start:chunk_start + 50]
        likes = [Note.content_json.like(f"%{u}%") for u in chunk]  # type: ignore[union-attr]
        rows = (await db.execute(
            select(Note.content_json).where(Note.user_id == user_id, or_(*likes))
        )).scalars().all()
        tlikes = [NoteTemplate.content_json.like(f"%{u}%") for u in chunk]  # type: ignore[union-attr]
        rows += (await db.execute(
            select(NoteTemplate.content_json).where(NoteTemplate.user_id == user_id, or_(*tlikes))
        )).scalars().all()
        for content in rows:
            for u in chunk:
                if u in (content or ""):
                    found.add(u)
    return found


async def _delete_attachments(db: AsyncSession, atts: List[NoteAttachment]) -> int:
    if not atts:
        return 0
    keys = [a.storage_key for a in atts]
    await db.execute(delete(NoteAttachment).where(
        NoteAttachment.id.in_([a.id for a in atts])  # type: ignore[union-attr]
    ))
    for key in keys:
        await remove_bytes(key)
    return len(atts)


async def collect_garbage(
    db: AsyncSession,
    user_id: int,
    *,
    grace_hours: int = GRACE_HOURS,
    only_note_ids: Optional[List[int]] = None,
    only_attachment_ids: Optional[List[int]] = None,
    now: Optional[datetime] = None,
) -> int:
    """Apaga anexos privados que nenhuma nota/modelo da pessoa cita mais e as
    cópias de discussions que deixaram de existir. Não faz commit.

    ``only_note_ids`` (exclusão definitiva): olha só os anexos enviados para
    essas notas, sem carência. Sem ele, considera os anexos com mais de
    ``grace_hours`` (a imagem acabou de subir e a nota ainda vai salvar).

    ``only_attachment_ids`` (exclusão definitiva no Postgres): os ids lidos
    ANTES de apagar a nota. Lá ``note_attachment.note_id`` é ``ON DELETE SET
    NULL``, então depois do DELETE a busca por ``note_id`` não acha mais nada.
    """
    now = now or datetime.now(timezone.utc)
    conds = [NoteAttachment.user_id == user_id, NoteAttachment.scope == ATTACHMENT_SCOPE_NOTE]
    if only_attachment_ids is not None:
        if not only_attachment_ids:
            return 0
        conds.append(NoteAttachment.id.in_(only_attachment_ids))  # type: ignore[union-attr]
    elif only_note_ids is not None:
        if not only_note_ids:
            return 0
        conds.append(NoteAttachment.note_id.in_(only_note_ids))  # type: ignore[union-attr]
    else:
        cutoff = (now - timedelta(hours=grace_hours)).isoformat()
        conds.append(NoteAttachment.created_at < cutoff)
    candidates = (await db.execute(select(NoteAttachment).where(*conds))).scalars().all()
    referenced = await _referenced_uuids(db, user_id, [a.attachment_uuid for a in candidates])
    removed = await _delete_attachments(db, [a for a in candidates if a.attachment_uuid not in referenced])

    if only_note_ids is None and only_attachment_ids is None:
        from src.db.communities.discussions import Discussion

        orphans = (await db.execute(
            select(NoteAttachment).where(
                NoteAttachment.user_id == user_id,
                NoteAttachment.scope == ATTACHMENT_SCOPE_DISCUSSION,
                or_(
                    NoteAttachment.discussion_id.is_(None),  # type: ignore[union-attr]
                    NoteAttachment.discussion_id.not_in(select(Discussion.id)),  # type: ignore[union-attr]
                ),
            )
        )).scalars().all()
        removed += await _delete_attachments(db, list(orphans))
    return removed


async def upload(db: AsyncSession, user_id: int, note: Note, file: UploadFile) -> AttachmentRead:
    data = await file.read(MAX_FILE_BYTES + 1)
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="Image too large (max 5 MB)")
    if not data:
        raise HTTPException(status_code=422, detail="Empty file")
    cleaned, mime, ext, width, height = await asyncio.to_thread(process_image, data)

    quota = quota_bytes()
    if await used_bytes(db, user_id) + len(cleaned) > quota:
        # antes de recusar, recolhe o que ninguém cita mais
        if await collect_garbage(db, user_id):
            await db.commit()
        if await used_bytes(db, user_id) + len(cleaned) > quota:
            raise HTTPException(status_code=413, detail={
                "code": "NOTE_MEDIA_QUOTA",
                "message": "Image storage quota reached",
            })

    key = _new_storage_key(note.org_id, user_id, ext)
    await store_bytes(key, cleaned)
    att = NoteAttachment(
        attachment_uuid=new_attachment_uuid(), user_id=user_id, org_id=note.org_id,
        scope=ATTACHMENT_SCOPE_NOTE, note_id=note.id, storage_key=key, mime=mime,
        size=len(cleaned), width=width, height=height,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    db.add(att)
    try:
        await db.commit()
    except Exception:
        await remove_bytes(key)
        raise
    await db.refresh(att)
    return _read(att)


async def owned_attachment(db: AsyncSession, user_id: int, attachment_uuid: str) -> NoteAttachment:
    att = None
    if _UUID_RE.match(attachment_uuid or ""):
        att = (await db.execute(
            select(NoteAttachment).where(
                NoteAttachment.attachment_uuid == attachment_uuid,
                NoteAttachment.user_id == user_id,
                NoteAttachment.scope == ATTACHMENT_SCOPE_NOTE,
            )
        )).scalars().first()
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return att


async def shared_attachment(db: AsyncSession, note: Note, attachment_uuid: str) -> NoteAttachment:
    """Anexo servido pelo link privado: do dono da nota E citado por ela."""
    if not _UUID_RE.match(attachment_uuid or "") or attachment_uuid not in attachment_uuids_in_doc(note.content_json):
        raise HTTPException(status_code=404, detail="Attachment not found")
    att = (await db.execute(
        select(NoteAttachment).where(
            NoteAttachment.attachment_uuid == attachment_uuid,
            NoteAttachment.user_id == note.user_id,
            NoteAttachment.scope == ATTACHMENT_SCOPE_NOTE,
        )
    )).scalars().first()
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return att


async def discussion_attachment(
    request: Request, db: AsyncSession, current_user, attachment_uuid: str
) -> NoteAttachment:
    """Cópia publicada: quem pode ler a discussion pode ver a imagem."""
    from src.db.communities.discussions import Discussion
    from src.services.communities.discussions import get_discussion

    att = None
    if _UUID_RE.match(attachment_uuid or ""):
        att = (await db.execute(
            select(NoteAttachment).where(
                NoteAttachment.attachment_uuid == attachment_uuid,
                NoteAttachment.scope == ATTACHMENT_SCOPE_DISCUSSION,
            )
        )).scalars().first()
    if not att or not att.discussion_id:
        raise HTTPException(status_code=404, detail="Attachment not found")
    discussion_uuid = (await db.execute(
        select(Discussion.discussion_uuid).where(Discussion.id == att.discussion_id)
    )).scalar()
    if not discussion_uuid:
        raise HTTPException(status_code=404, detail="Attachment not found")
    # Mesma checagem da leitura da discussion (privada, comunidade, org).
    await get_discussion(request, discussion_uuid, current_user, db)
    return att


async def copy_for_discussion(
    db: AsyncSession, user_id: int, content_json: str
) -> Tuple[str, List[Tuple[NoteAttachment, str]]]:
    """Prepara a publicação: para cada anexo da pessoa citado no conteúdo,
    gera o uuid da cópia e reescreve o documento. Anexos de outra pessoa ou
    inexistentes saem do conteúdo publicado. Não grava nada ainda."""
    refs = attachment_uuids_in_doc(content_json)
    if not refs:
        return content_json, []
    owned = (await db.execute(
        select(NoteAttachment).where(
            NoteAttachment.attachment_uuid.in_(refs),  # type: ignore[union-attr]
            NoteAttachment.user_id == user_id,
            NoteAttachment.scope == ATTACHMENT_SCOPE_NOTE,
        )
    )).scalars().all()
    by_uuid = {a.attachment_uuid: a for a in owned}
    mapping: Dict[str, Optional[str]] = {}
    plan: List[Tuple[NoteAttachment, str]] = []
    for ref in refs:
        att = by_uuid.get(ref)
        if att is None:
            mapping[ref] = None
            continue
        new_uuid = new_attachment_uuid()
        mapping[ref] = new_uuid
        plan.append((att, new_uuid))
    return rewrite_attachment_uuids(content_json, mapping), plan


async def materialize_discussion_copies(
    db: AsyncSession, discussion_id: int, plan: List[Tuple[NoteAttachment, str]]
) -> None:
    """Copia os arquivos e cria os anexos ``scope='discussion'``. Não faz commit."""
    for src, new_uuid in plan:
        try:
            data = await load_bytes(src.storage_key)
        except HTTPException:
            logger.warning("Anexo de nota sem arquivo ao publicar (%s)", src.attachment_uuid)
            continue
        ext = src.storage_key.rsplit(".", 1)[-1]
        key = _new_storage_key(src.org_id, src.user_id, ext)
        await store_bytes(key, data)
        db.add(NoteAttachment(
            attachment_uuid=new_uuid, user_id=src.user_id, org_id=src.org_id,
            scope=ATTACHMENT_SCOPE_DISCUSSION, note_id=None, discussion_id=discussion_id,
            storage_key=key, mime=src.mime, size=src.size, width=src.width, height=src.height,
            created_at=datetime.now(timezone.utc).isoformat(),
        ))


def image_headers(att: NoteAttachment, *, cache: str) -> Dict[str, str]:
    return {
        "Content-Type": att.mime,
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": f'inline; filename="imagem.{att.storage_key.rsplit(".", 1)[-1]}"',
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": cache,
        "Referrer-Policy": "no-referrer",
    }
