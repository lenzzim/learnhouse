"""Caderno Bíblico — regras de negócio das notas pessoais.

Privacidade antes de tudo (fé é dado sensível, LGPD art. 11):

- toda consulta filtra por ``user_id`` da pessoa logada; nota de outra pessoa
  é 404, igual a "não existe" (admin e moderador inclusive);
- tokens de API e visitantes não acessam o caderno;
- o link compartilhado guarda só o hash SHA-256 do token (128 bits), com
  escopo, validade e revogação imediata;
- nada de conteúdo das notas em log.
"""

import hmac
import json
import re
import secrets
import unicodedata
from datetime import date, datetime, timedelta, timezone
from typing import Dict, Iterable, List, Optional, Sequence, Tuple, Union
from uuid import uuid4

from fastapi import HTTPException, Request
from sqlalchemy import delete, func, literal_column, or_, text, update
from sqlalchemy.exc import IntegrityError
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.db.communities.communities import Community
from src.db.communities.discussions import DISCUSSION_VISIBILITY_PRIVATE, Discussion
from src.db.notes import (
    CONTENT_MAX,
    NOTE_KIND_NOTE,
    NOTE_KIND_TCD,
    NOTE_KINDS,
    NOTE_VISIBILITY_COMMUNITY,
    NOTE_VISIBILITY_LINK,
    NOTE_VISIBILITY_PRIVATE,
    SHARE_SCOPE_MEMBERS,
    SHARE_SCOPES,
    TITLE_MAX,
    BibleRefOut,
    CollectionRead,
    Note,
    NoteBibleRef,
    NoteCollection,
    NoteLink,
    NoteLinkOut,
    NoteListResponse,
    NoteRead,
    NoteShare,
    NoteSummary,
    NoteTag,
    NoteTagMap,
    PublishResult,
    ShareCreated,
    ShareRead,
    SharedNoteRead,
    TagRead,
    TcdCalendar,
)
from src.db.user_organizations import UserOrganization
from src.db.users import AnonymousUser, APITokenUser, PublicUser, User
from src.security.rbac import authorization_verify_if_user_is_anon
from src.services.notes.parsing import (
    extract_links,
    extract_tags,
    hash_token,
    parse_doc,
    rename_tag_in_content,
    rename_tag_in_text,
    tiptap_to_markdown,
    tiptap_to_text,
    validate_bible_refs,
)

CurrentUser = Union[PublicUser, AnonymousUser, APITokenUser]

TRASH_DAYS = 30
NOT_FOUND = "Note not found"
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
_TAG_NAME_RE = re.compile(r"^[\wÀ-ÿ][\w\-/À-ÿ]{0,49}$", re.UNICODE)
_WORD_RE = re.compile(r"[\wÀ-ÿ]+", re.UNICODE)


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_uuid(prefix: str) -> str:
    return f"{prefix}_{uuid4()}"


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _parse_date(value: str, field: str = "date") -> date:
    if not isinstance(value, str) or not _DATE_RE.match(value):
        raise HTTPException(status_code=422, detail=f"Invalid {field}: expected YYYY-MM-DD")
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid {field}: expected YYYY-MM-DD")


def _excerpt(text_: str) -> str:
    return " ".join((text_ or "").split())[:160]


def _slug(title: str) -> str:
    norm = unicodedata.normalize("NFKD", title or "").encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", norm).strip("-").lower()
    return slug[:80] or "nota"


async def require_user_id(current_user: CurrentUser) -> int:
    """Só sessão de pessoa: token de API (403) e visitante (403) ficam de fora."""
    if isinstance(current_user, APITokenUser):
        raise HTTPException(status_code=403, detail="API tokens cannot access the notebook")
    user_id = int(getattr(current_user, "id", 0) or 0)
    await authorization_verify_if_user_is_anon(user_id)
    return user_id


async def require_member(db: AsyncSession, user_id: int, org_id: int) -> None:
    row = (await db.execute(
        select(UserOrganization.id).where(
            UserOrganization.user_id == user_id, UserOrganization.org_id == org_id
        )
    )).first()
    if not row:
        raise HTTPException(status_code=403, detail="You are not a member of this organization")


async def get_owned_note(db: AsyncSession, note_uuid: str, user_id: int) -> Note:
    note = (await db.execute(
        select(Note).where(Note.note_uuid == note_uuid, Note.user_id == user_id)
    )).scalars().first()
    if not note:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return note


def _validate_title(title: Optional[str]) -> str:
    title = (title or "").strip()
    if len(title) > TITLE_MAX:
        raise HTTPException(status_code=422, detail=f"Title too long (max {TITLE_MAX})")
    return title


def _validate_content(content: Optional[str]) -> str:
    content = content or ""
    if len(content) > CONTENT_MAX:
        raise HTTPException(status_code=422, detail="Content too large")
    return content


async def _collection_id(db: AsyncSession, collection_uuid: Optional[str], user_id: int, org_id: int) -> Optional[int]:
    if not collection_uuid:
        return None
    col = (await db.execute(
        select(NoteCollection.id).where(
            NoteCollection.collection_uuid == collection_uuid,
            NoteCollection.user_id == user_id,
            NoteCollection.org_id == org_id,
        )
    )).first()
    if not col:
        raise HTTPException(status_code=404, detail="Collection not found")
    return col[0]


# ---------------------------------------------------------------------------
# Leitura (montagem das respostas)
# ---------------------------------------------------------------------------


async def _tags_by_note(db: AsyncSession, note_ids: Sequence[int]) -> Dict[int, List[str]]:
    out: Dict[int, List[str]] = {nid: [] for nid in note_ids}
    if not note_ids:
        return out
    rows = (await db.execute(
        select(NoteTagMap.note_id, NoteTag.name)
        .join(NoteTag, NoteTag.id == NoteTagMap.tag_id)
        .where(NoteTagMap.note_id.in_(list(note_ids)))  # type: ignore[attr-defined]
        .order_by(NoteTag.name_lower)
    )).all()
    for nid, name in rows:
        out.setdefault(nid, []).append(name)
    return out


async def _collection_uuids(db: AsyncSession, ids: Iterable[Optional[int]]) -> Dict[int, str]:
    wanted = [i for i in set(ids) if i]
    if not wanted:
        return {}
    rows = (await db.execute(
        select(NoteCollection.id, NoteCollection.collection_uuid).where(
            NoteCollection.id.in_(wanted)  # type: ignore[union-attr]
        )
    )).all()
    return {i: u for i, u in rows}


async def summaries(db: AsyncSession, notes: Sequence[Note]) -> List[NoteSummary]:
    tags = await _tags_by_note(db, [n.id for n in notes])
    cols = await _collection_uuids(db, [n.collection_id for n in notes])
    return [
        NoteSummary(
            note_uuid=n.note_uuid,
            title=n.title,
            kind=n.kind,
            tcd_date=n.tcd_date,
            collection_uuid=cols.get(n.collection_id) if n.collection_id else None,
            visibility=n.visibility,
            excerpt=_excerpt(n.content_text),
            tags=tags.get(n.id, []),
            created_at=n.created_at,
            updated_at=n.updated_at,
            deleted_at=n.deleted_at,
        )
        for n in notes
    ]


async def note_read(db: AsyncSession, note: Note) -> NoteRead:
    tags = (await _tags_by_note(db, [note.id])).get(note.id, [])
    cols = await _collection_uuids(db, [note.collection_id])
    link_rows = (await db.execute(
        select(NoteLink.target_title, Note.note_uuid)
        .outerjoin(Note, Note.id == NoteLink.target_note_id)
        .where(NoteLink.source_note_id == note.id)
        .order_by(NoteLink.id)
    )).all()
    ref_rows = (await db.execute(
        select(NoteBibleRef).where(NoteBibleRef.note_id == note.id).order_by(NoteBibleRef.id)
    )).scalars().all()
    published_discussion_uuid = None
    published_community_uuid = None
    if note.published_discussion_id:
        row = (await db.execute(
            select(Discussion.discussion_uuid, Community.community_uuid)
            .join(Community, Community.id == Discussion.community_id)
            .where(Discussion.id == note.published_discussion_id)
        )).first()
        if row:
            published_discussion_uuid, published_community_uuid = row
    return NoteRead(
        note_uuid=note.note_uuid,
        org_id=note.org_id,
        title=note.title,
        content_json=note.content_json,
        kind=note.kind,
        tcd_date=note.tcd_date,
        collection_uuid=cols.get(note.collection_id) if note.collection_id else None,
        visibility=note.visibility,
        tags=tags,
        links=[NoteLinkOut(target_title=t, target_note_uuid=u) for t, u in link_rows],
        bible_refs=[
            BibleRefOut(book=r.book, chapter=r.chapter, verse_start=r.verse_start, verse_end=r.verse_end)
            for r in ref_rows
        ],
        published_discussion_uuid=published_discussion_uuid,
        published_community_uuid=published_community_uuid,
        created_at=note.created_at,
        updated_at=note.updated_at,
        deleted_at=note.deleted_at,
    )


# ---------------------------------------------------------------------------
# Parse-on-save
# ---------------------------------------------------------------------------


async def _replace_links(db: AsyncSession, note: Note, titles: List[str]) -> None:
    await db.execute(delete(NoteLink).where(NoteLink.source_note_id == note.id))
    for title in titles:
        target = (await db.execute(
            select(Note.id).where(
                Note.user_id == note.user_id,
                Note.org_id == note.org_id,
                Note.deleted_at.is_(None),  # type: ignore[union-attr]
                Note.id != note.id,
                func.lower(Note.title) == title.lower(),
            ).order_by(Note.id)
        )).first()
        db.add(NoteLink(
            source_note_id=note.id,
            target_note_id=target[0] if target else None,
            target_title=title,
            target_title_lower=title.lower(),
        ))


async def _delete_orphan_tags(db: AsyncSession, user_id: int, org_id: int) -> None:
    used = select(NoteTagMap.tag_id)
    await db.execute(delete(NoteTag).where(
        NoteTag.user_id == user_id,
        NoteTag.org_id == org_id,
        NoteTag.id.not_in(used),  # type: ignore[union-attr]
    ))


async def _replace_tags(db: AsyncSession, note: Note, names: List[str]) -> None:
    await db.execute(delete(NoteTagMap).where(NoteTagMap.note_id == note.id))
    for name in names:
        tag = (await db.execute(
            select(NoteTag).where(
                NoteTag.user_id == note.user_id,
                NoteTag.org_id == note.org_id,
                NoteTag.name_lower == name.lower(),
            )
        )).scalars().first()
        if not tag:
            tag = NoteTag(
                tag_uuid=_new_uuid("notetag"), user_id=note.user_id, org_id=note.org_id,
                name=name, name_lower=name.lower(),
            )
            db.add(tag)
            await db.flush()
        db.add(NoteTagMap(note_id=note.id, tag_id=tag.id))
    await db.flush()
    await _delete_orphan_tags(db, note.user_id, note.org_id)


async def _replace_refs(db: AsyncSession, note: Note, refs) -> None:
    await db.execute(delete(NoteBibleRef).where(NoteBibleRef.note_id == note.id))
    for r in validate_bible_refs(refs):
        db.add(NoteBibleRef(note_id=note.id, **r))


async def _apply_content(db: AsyncSession, note: Note) -> None:
    note.content_text = tiptap_to_text(note.content_json)
    await _replace_links(db, note, extract_links(note.content_text))
    await _replace_tags(db, note, extract_tags(note.content_text))


async def _resolve_dangling_links(db: AsyncSession, note: Note) -> None:
    if not note.title:
        return
    owned = select(Note.id).where(Note.user_id == note.user_id, Note.org_id == note.org_id)
    await db.execute(
        update(NoteLink)
        .where(
            NoteLink.target_note_id.is_(None),  # type: ignore[union-attr]
            NoteLink.target_title_lower == note.title.lower(),
            NoteLink.source_note_id.in_(owned),  # type: ignore[attr-defined]
            NoteLink.source_note_id != note.id,
        )
        .values(target_note_id=note.id)
    )


async def _recompute_visibility(db: AsyncSession, note: Note) -> None:
    if note.published_discussion_id:
        note.visibility = NOTE_VISIBILITY_COMMUNITY
        return
    now = now_iso()
    active = (await db.execute(
        select(NoteShare.id).where(
            NoteShare.note_id == note.id,
            NoteShare.revoked_at.is_(None),  # type: ignore[union-attr]
            or_(NoteShare.expires_at.is_(None), NoteShare.expires_at > now),  # type: ignore[union-attr]
        )
    )).first()
    note.visibility = NOTE_VISIBILITY_LINK if active else NOTE_VISIBILITY_PRIVATE


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


async def create_note(db: AsyncSession, current_user: CurrentUser, data) -> NoteRead:
    user_id = await require_user_id(current_user)
    await require_member(db, user_id, data.org_id)
    if data.kind not in NOTE_KINDS or data.kind == NOTE_KIND_TCD:
        raise HTTPException(status_code=422, detail="Invalid kind (use /notes/tcd for TCD)")
    title = _validate_title(data.title)
    content = _validate_content(data.content_json)
    collection_id = await _collection_id(db, data.collection_uuid, user_id, data.org_id)
    now = now_iso()
    note = Note(
        note_uuid=_new_uuid("note"), user_id=user_id, org_id=data.org_id, title=title,
        content_json=content, kind=data.kind, collection_id=collection_id,
        created_at=now, updated_at=now,
    )
    db.add(note)
    await db.flush()
    await _apply_content(db, note)
    if data.bible_refs is not None:
        await _replace_refs(db, note, data.bible_refs)
    await _resolve_dangling_links(db, note)
    await db.commit()
    await db.refresh(note)
    return await note_read(db, note)


async def get_note(db: AsyncSession, current_user: CurrentUser, note_uuid: str) -> NoteRead:
    user_id = await require_user_id(current_user)
    note = await get_owned_note(db, note_uuid, user_id)
    return await note_read(db, note)


async def update_note(db: AsyncSession, current_user: CurrentUser, note_uuid: str, data) -> NoteRead:
    user_id = await require_user_id(current_user)
    note = await get_owned_note(db, note_uuid, user_id)
    fields = data.model_fields_set
    title_changed = False
    if data.title is not None:
        title = _validate_title(data.title)
        title_changed = title != note.title
        note.title = title
    if data.content_json is not None:
        note.content_json = _validate_content(data.content_json)
    if "collection_uuid" in fields:
        note.collection_id = await _collection_id(db, data.collection_uuid, user_id, note.org_id)
    note.updated_at = now_iso()
    db.add(note)
    if data.content_json is not None:
        await _apply_content(db, note)
    if data.bible_refs is not None:
        await _replace_refs(db, note, data.bible_refs)
    if title_changed:
        await _resolve_dangling_links(db, note)
    await db.commit()
    await db.refresh(note)
    return await note_read(db, note)


async def trash_note(db: AsyncSession, current_user: CurrentUser, note_uuid: str) -> dict:
    user_id = await require_user_id(current_user)
    note = await get_owned_note(db, note_uuid, user_id)
    if not note.deleted_at:
        note.deleted_at = now_iso()
        db.add(note)
        await db.commit()
    return {"ok": True}


def _trash_expired(note: Note, now: Optional[datetime] = None) -> bool:
    deleted = _parse_iso(note.deleted_at)
    if not deleted:
        return False
    now = now or datetime.now(timezone.utc)
    return deleted < now - timedelta(days=TRASH_DAYS)


async def restore_note(db: AsyncSession, current_user: CurrentUser, note_uuid: str) -> NoteRead:
    user_id = await require_user_id(current_user)
    note = await get_owned_note(db, note_uuid, user_id)
    if note.deleted_at:
        if _trash_expired(note):
            raise HTTPException(status_code=410, detail="Trash retention expired")
        note.deleted_at = None
        note.updated_at = now_iso()
        db.add(note)
        await db.commit()
        await db.refresh(note)
    return await note_read(db, note)


async def _hard_delete(db: AsyncSession, note_ids: List[int]) -> None:
    """Apaga de vez (explícito: o SQLite dos testes não aplica ON DELETE)."""
    if not note_ids:
        return
    await db.execute(delete(NoteTagMap).where(NoteTagMap.note_id.in_(note_ids)))  # type: ignore[attr-defined]
    await db.execute(delete(NoteLink).where(NoteLink.source_note_id.in_(note_ids)))  # type: ignore[attr-defined]
    await db.execute(
        update(NoteLink).where(NoteLink.target_note_id.in_(note_ids)).values(target_note_id=None)  # type: ignore[union-attr]
    )
    await db.execute(delete(NoteBibleRef).where(NoteBibleRef.note_id.in_(note_ids)))  # type: ignore[attr-defined]
    await db.execute(delete(NoteShare).where(NoteShare.note_id.in_(note_ids)))  # type: ignore[attr-defined]
    await db.execute(delete(Note).where(Note.id.in_(note_ids)))  # type: ignore[union-attr]


async def delete_note_permanently(db: AsyncSession, current_user: CurrentUser, note_uuid: str) -> dict:
    user_id = await require_user_id(current_user)
    note = await get_owned_note(db, note_uuid, user_id)
    if not note.deleted_at:
        raise HTTPException(status_code=409, detail="Move the note to the trash first")
    user, org = note.user_id, note.org_id
    await _hard_delete(db, [note.id])
    await _delete_orphan_tags(db, user, org)
    await db.commit()
    return {"ok": True}


async def purge_expired_trash(
    db: AsyncSession,
    now: Optional[datetime] = None,
    days: int = TRASH_DAYS,
    user_id: Optional[int] = None,
) -> int:
    """Apaga de vez as notas na lixeira há mais de ``days`` dias. Retorna quantas."""
    now = now or datetime.now(timezone.utc)
    cutoff = (now - timedelta(days=days)).isoformat()
    stmt = select(Note.id, Note.user_id, Note.org_id, Note.deleted_at).where(
        Note.deleted_at.is_not(None)  # type: ignore[union-attr]
    )
    if user_id is not None:
        stmt = stmt.where(Note.user_id == user_id)
    rows = (await db.execute(stmt)).all()
    expired = []
    owners = set()
    for nid, uid, oid, deleted_at in rows:
        dt = _parse_iso(deleted_at)
        if dt and dt.isoformat() < cutoff:
            expired.append(nid)
            owners.add((uid, oid))
    if expired:
        await _hard_delete(db, expired)
        for uid, oid in owners:
            await _delete_orphan_tags(db, uid, oid)
        await db.commit()
    return len(expired)


# ---------------------------------------------------------------------------
# Lista + busca
# ---------------------------------------------------------------------------

_fts_available: Dict[str, bool] = {}


async def _has_fts(db: AsyncSession) -> bool:
    bind = db.bind if db.bind is not None else db.get_bind()
    if bind.dialect.name != "postgresql":
        return False
    key = str(bind.url)
    if key not in _fts_available:
        try:
            row = (await db.execute(text("SELECT 1 FROM pg_proc WHERE proname = 'discipulei_unaccent'"))).first()
            _fts_available[key] = bool(row)
        except Exception:
            _fts_available[key] = False
    return _fts_available[key]


_FTS_VECTOR = (
    "to_tsvector('portuguese', discipulei_unaccent("
    "coalesce(note.title, '') || ' ' || coalesce(note.content_text, '')))"
)


async def _search_clause(db: AsyncSession, q: str):
    words = [w.lower() for w in _WORD_RE.findall(q or "")][:8]
    if not words:
        return None
    if await _has_fts(db):
        tsquery = " & ".join(f"{w}:*" for w in words)
        vector = literal_column(_FTS_VECTOR)
        fts = vector.op("@@")(
            func.to_tsquery(literal_column("'portuguese'::regconfig"), func.discipulei_unaccent(tsquery))
        )
        return or_(fts, func.lower(Note.title).like(f"%{q.strip().lower()}%"))
    clauses = [
        or_(func.lower(Note.title).like(f"%{w}%"), func.lower(Note.content_text).like(f"%{w}%"))
        for w in words
    ]
    from sqlalchemy import and_
    return and_(*clauses)


async def list_notes(
    db: AsyncSession,
    current_user: CurrentUser,
    org_id: int,
    collection_uuid: Optional[str] = None,
    tag: Optional[str] = None,
    kind: Optional[str] = None,
    q: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    trash: bool = False,
    page: int = 1,
    limit: int = 50,
) -> NoteListResponse:
    user_id = await require_user_id(current_user)
    await require_member(db, user_id, org_id)
    page = max(1, page)
    limit = max(1, min(limit, 100))

    if trash:
        await purge_expired_trash(db, user_id=user_id)

    conds = [Note.user_id == user_id, Note.org_id == org_id]
    conds.append(Note.deleted_at.is_not(None) if trash else Note.deleted_at.is_(None))  # type: ignore[union-attr]
    if collection_uuid == "none":
        conds.append(Note.collection_id.is_(None))  # type: ignore[union-attr]
    elif collection_uuid:
        conds.append(Note.collection_id == await _collection_id(db, collection_uuid, user_id, org_id))
    if kind:
        if kind not in NOTE_KINDS:
            raise HTTPException(status_code=422, detail="Invalid kind")
        conds.append(Note.kind == kind)
    if tag:
        tagged = (
            select(NoteTagMap.note_id)
            .join(NoteTag, NoteTag.id == NoteTagMap.tag_id)
            .where(NoteTag.user_id == user_id, NoteTag.org_id == org_id,
                   NoteTag.name_lower == tag.lstrip("#").lower())
        )
        conds.append(Note.id.in_(tagged))  # type: ignore[union-attr]
    if date_from or date_to:
        d_from = _parse_date(date_from, "date_from") if date_from else None
        d_to = _parse_date(date_to, "date_to") if date_to else None
        if kind == NOTE_KIND_TCD:
            if d_from:
                conds.append(Note.tcd_date >= d_from.isoformat())
            if d_to:
                conds.append(Note.tcd_date <= d_to.isoformat())
        else:
            if d_from:
                conds.append(Note.updated_at >= d_from.isoformat())
            if d_to:
                conds.append(Note.updated_at < (d_to + timedelta(days=1)).isoformat())
    if q and q.strip():
        clause = await _search_clause(db, q)
        if clause is not None:
            conds.append(clause)

    total = (await db.execute(select(func.count()).select_from(Note).where(*conds))).scalar() or 0
    notes = (await db.execute(
        select(Note).where(*conds)
        .order_by(Note.updated_at.desc(), Note.id.desc())  # type: ignore[union-attr]
        .offset((page - 1) * limit).limit(limit)
    )).scalars().all()
    return NoteListResponse(items=await summaries(db, notes), total=total, page=page, limit=limit)


async def resolve_title(db: AsyncSession, current_user: CurrentUser, org_id: int, title: str) -> NoteSummary:
    user_id = await require_user_id(current_user)
    await require_member(db, user_id, org_id)
    title = (title or "").strip()
    note = None
    if title:
        note = (await db.execute(
            select(Note).where(
                Note.user_id == user_id, Note.org_id == org_id,
                Note.deleted_at.is_(None),  # type: ignore[union-attr]
                func.lower(Note.title) == title.lower(),
            ).order_by(Note.updated_at.desc())  # type: ignore[union-attr]
        )).scalars().first()
    if not note:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return (await summaries(db, [note]))[0]


async def backlinks(db: AsyncSession, current_user: CurrentUser, note_uuid: str) -> List[NoteSummary]:
    user_id = await require_user_id(current_user)
    note = await get_owned_note(db, note_uuid, user_id)
    match = [NoteLink.target_note_id == note.id]
    if note.title:
        match.append(NoteLink.target_title_lower == note.title.lower())
    sources = select(NoteLink.source_note_id).where(or_(*match))
    rows = (await db.execute(
        select(Note).where(
            Note.user_id == user_id,
            Note.org_id == note.org_id,
            Note.deleted_at.is_(None),  # type: ignore[union-attr]
            Note.id != note.id,
            Note.id.in_(sources),  # type: ignore[union-attr]
        ).order_by(Note.updated_at.desc())  # type: ignore[union-attr]
    )).scalars().all()
    return await summaries(db, rows)


async def export_markdown(db: AsyncSession, current_user: CurrentUser, note_uuid: str) -> Tuple[str, str]:
    user_id = await require_user_id(current_user)
    note = await get_owned_note(db, note_uuid, user_id)
    title = note.title or "Sem título"
    body = tiptap_to_markdown(note.content_json)
    return f"# {title}\n\n{body}", f"{_slug(title)}.md"


# ---------------------------------------------------------------------------
# TCD (Tempo com Deus)
# ---------------------------------------------------------------------------


def _tcd_title(d: date) -> str:
    return f"TCD — {d.strftime('%d/%m/%Y')}"


async def _find_tcd(db: AsyncSession, user_id: int, org_id: int, iso: str) -> Optional[Note]:
    return (await db.execute(
        select(Note).where(Note.user_id == user_id, Note.org_id == org_id, Note.tcd_date == iso)
    )).scalars().first()


async def get_or_create_tcd(db: AsyncSession, current_user: CurrentUser, org_id: int, date_str: str) -> NoteRead:
    user_id = await require_user_id(current_user)
    await require_member(db, user_id, org_id)
    d = _parse_date(date_str)
    if d > datetime.now(timezone.utc).date() + timedelta(days=1):
        raise HTTPException(status_code=422, detail="TCD date cannot be in the future")
    iso = d.isoformat()
    note = await _find_tcd(db, user_id, org_id, iso)
    if note is None:
        now = now_iso()
        note = Note(
            note_uuid=_new_uuid("note"), user_id=user_id, org_id=org_id, title=_tcd_title(d),
            content_json="", content_text="", kind=NOTE_KIND_TCD, tcd_date=iso,
            created_at=now, updated_at=now,
        )
        db.add(note)
        try:
            await db.commit()
        except IntegrityError:
            # outra aba criou o mesmo dia ao mesmo tempo
            await db.rollback()
            note = await _find_tcd(db, user_id, org_id, iso)
            if note is None:
                raise
        else:
            await db.refresh(note)
            await _resolve_dangling_links(db, note)
            await db.commit()
            await db.refresh(note)
    if note.deleted_at:
        note.deleted_at = None
        note.updated_at = now_iso()
        db.add(note)
        await db.commit()
        await db.refresh(note)
    return await note_read(db, note)


async def get_tcd(db: AsyncSession, current_user: CurrentUser, org_id: int, date_str: str) -> NoteRead:
    user_id = await require_user_id(current_user)
    await require_member(db, user_id, org_id)
    d = _parse_date(date_str)
    note = await _find_tcd(db, user_id, org_id, d.isoformat())
    if note is None or note.deleted_at:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return await note_read(db, note)


async def tcd_calendar(
    db: AsyncSession, current_user: CurrentUser, org_id: int, month: str, today: Optional[str] = None
) -> TcdCalendar:
    user_id = await require_user_id(current_user)
    await require_member(db, user_id, org_id)
    if not isinstance(month, str) or not _MONTH_RE.match(month):
        raise HTTPException(status_code=422, detail="Invalid month: expected YYYY-MM")
    today_d = _parse_date(today, "today") if today else datetime.now(timezone.utc).date()

    # Só conta (calendário e sequência) o TCD com corpo escrito: abrir o dia ou
    # deixar a nota vazia não marca o dia.
    base = [
        Note.user_id == user_id, Note.org_id == org_id,
        Note.kind == NOTE_KIND_TCD, Note.deleted_at.is_(None),  # type: ignore[union-attr]
        Note.tcd_date.is_not(None),  # type: ignore[union-attr]
        func.length(func.trim(func.coalesce(Note.content_text, ""))) > 0,
    ]
    in_month = (await db.execute(
        select(Note.tcd_date).where(*base, Note.tcd_date.like(f"{month}-%"))  # type: ignore[union-attr]
        .order_by(Note.tcd_date)
    )).scalars().all()

    since = (today_d - timedelta(days=400)).isoformat()
    recent = set((await db.execute(
        select(Note.tcd_date).where(*base, Note.tcd_date >= since, Note.tcd_date <= today_d.isoformat())
    )).scalars().all())
    cursor = today_d if today_d.isoformat() in recent else today_d - timedelta(days=1)
    streak = 0
    while cursor.isoformat() in recent:
        streak += 1
        cursor -= timedelta(days=1)
    return TcdCalendar(dates=list(in_month), streak=streak)


# ---------------------------------------------------------------------------
# Coleções
# ---------------------------------------------------------------------------


async def _owned_collection(db: AsyncSession, collection_uuid: str, user_id: int) -> NoteCollection:
    col = (await db.execute(
        select(NoteCollection).where(
            NoteCollection.collection_uuid == collection_uuid, NoteCollection.user_id == user_id
        )
    )).scalars().first()
    if not col:
        raise HTTPException(status_code=404, detail="Collection not found")
    return col


def _validate_collection_name(name: Optional[str]) -> str:
    name = (name or "").strip()
    if not name or len(name) > 200:
        raise HTTPException(status_code=422, detail="Invalid collection name")
    return name


async def list_collections(db: AsyncSession, current_user: CurrentUser, org_id: int) -> List[CollectionRead]:
    user_id = await require_user_id(current_user)
    await require_member(db, user_id, org_id)
    cols = (await db.execute(
        select(NoteCollection).where(NoteCollection.user_id == user_id, NoteCollection.org_id == org_id)
        .order_by(NoteCollection.position, NoteCollection.name)
    )).scalars().all()
    counts = dict((await db.execute(
        select(Note.collection_id, func.count()).where(
            Note.user_id == user_id, Note.org_id == org_id,
            Note.deleted_at.is_(None), Note.collection_id.is_not(None),  # type: ignore[union-attr]
        ).group_by(Note.collection_id)
    )).all())
    by_id = {c.id: c.collection_uuid for c in cols}
    return [
        CollectionRead(
            collection_uuid=c.collection_uuid, name=c.name,
            parent_uuid=by_id.get(c.parent_id) if c.parent_id else None,
            position=c.position, note_count=counts.get(c.id, 0),
        )
        for c in cols
    ]


async def _collection_read(db: AsyncSession, col: NoteCollection) -> CollectionRead:
    parent_uuid = None
    if col.parent_id:
        parent_uuid = (await db.execute(
            select(NoteCollection.collection_uuid).where(NoteCollection.id == col.parent_id)
        )).scalar()
    count = (await db.execute(
        select(func.count()).select_from(Note).where(
            Note.collection_id == col.id, Note.deleted_at.is_(None)  # type: ignore[union-attr]
        )
    )).scalar() or 0
    return CollectionRead(collection_uuid=col.collection_uuid, name=col.name, parent_uuid=parent_uuid,
                          position=col.position, note_count=count)


async def create_collection(db: AsyncSession, current_user: CurrentUser, data) -> CollectionRead:
    user_id = await require_user_id(current_user)
    await require_member(db, user_id, data.org_id)
    name = _validate_collection_name(data.name)
    parent_id = None
    if data.parent_uuid:
        parent = await _owned_collection(db, data.parent_uuid, user_id)
        if parent.org_id != data.org_id:
            raise HTTPException(status_code=404, detail="Collection not found")
        parent_id = parent.id
    now = now_iso()
    position = (await db.execute(
        select(func.count()).select_from(NoteCollection).where(
            NoteCollection.user_id == user_id, NoteCollection.org_id == data.org_id
        )
    )).scalar() or 0
    col = NoteCollection(
        collection_uuid=_new_uuid("notecol"), user_id=user_id, org_id=data.org_id, name=name,
        parent_id=parent_id, position=position, created_at=now, updated_at=now,
    )
    db.add(col)
    await db.commit()
    await db.refresh(col)
    return await _collection_read(db, col)


async def update_collection(db: AsyncSession, current_user: CurrentUser, collection_uuid: str, data) -> CollectionRead:
    user_id = await require_user_id(current_user)
    col = await _owned_collection(db, collection_uuid, user_id)
    if data.name is not None:
        col.name = _validate_collection_name(data.name)
    if "parent_uuid" in data.model_fields_set:
        if not data.parent_uuid:
            col.parent_id = None
        else:
            parent = await _owned_collection(db, data.parent_uuid, user_id)
            if parent.org_id != col.org_id:
                raise HTTPException(status_code=404, detail="Collection not found")
            # sobe a árvore a partir do novo pai: chegar em `col` seria ciclo
            cursor: Optional[NoteCollection] = parent
            seen = set()
            while cursor is not None:
                if cursor.id == col.id:
                    raise HTTPException(status_code=422, detail="A collection cannot be moved inside itself")
                if cursor.id in seen or not cursor.parent_id:
                    break
                seen.add(cursor.id)
                cursor = (await db.execute(
                    select(NoteCollection).where(NoteCollection.id == cursor.parent_id)
                )).scalars().first()
            col.parent_id = parent.id
    if data.position is not None:
        col.position = int(data.position)
    col.updated_at = now_iso()
    db.add(col)
    await db.commit()
    await db.refresh(col)
    return await _collection_read(db, col)


async def delete_collection(db: AsyncSession, current_user: CurrentUser, collection_uuid: str) -> dict:
    user_id = await require_user_id(current_user)
    col = await _owned_collection(db, collection_uuid, user_id)
    await db.execute(
        update(NoteCollection).where(NoteCollection.parent_id == col.id).values(parent_id=col.parent_id)
    )
    await db.execute(update(Note).where(Note.collection_id == col.id).values(collection_id=None))
    await db.execute(delete(NoteCollection).where(NoteCollection.id == col.id))
    await db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Tags
# ---------------------------------------------------------------------------


async def list_tags(db: AsyncSession, current_user: CurrentUser, org_id: int) -> List[TagRead]:
    user_id = await require_user_id(current_user)
    await require_member(db, user_id, org_id)
    rows = (await db.execute(
        select(NoteTag.tag_uuid, NoteTag.name, func.count(Note.id))
        .join(NoteTagMap, NoteTagMap.tag_id == NoteTag.id)
        .join(Note, Note.id == NoteTagMap.note_id)
        .where(
            NoteTag.user_id == user_id, NoteTag.org_id == org_id,
            Note.user_id == user_id, Note.deleted_at.is_(None),  # type: ignore[union-attr]
        )
        .group_by(NoteTag.id, NoteTag.tag_uuid, NoteTag.name, NoteTag.name_lower)
        .order_by(NoteTag.name_lower)
    )).all()
    return [TagRead(tag_uuid=u, name=n, count=c) for u, n, c in rows]


async def rename_tag(db: AsyncSession, current_user: CurrentUser, tag_uuid: str, new_name: str) -> TagRead:
    user_id = await require_user_id(current_user)
    tag = (await db.execute(
        select(NoteTag).where(NoteTag.tag_uuid == tag_uuid, NoteTag.user_id == user_id)
    )).scalars().first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    new_name = (new_name or "").strip().lstrip("#")
    if not _TAG_NAME_RE.match(new_name):
        raise HTTPException(status_code=422, detail="Invalid tag name")
    old_name = tag.name

    note_ids = list((await db.execute(
        select(NoteTagMap.note_id).where(NoteTagMap.tag_id == tag.id)
    )).scalars().all())
    notes = (await db.execute(
        select(Note).where(Note.id.in_(note_ids), Note.user_id == user_id)  # type: ignore[union-attr]
    )).scalars().all() if note_ids else []
    for note in notes:
        note.content_json = rename_tag_in_content(note.content_json, old_name, new_name)
        note.content_text = rename_tag_in_text(note.content_text, old_name, new_name)
        db.add(note)

    target = (await db.execute(
        select(NoteTag).where(
            NoteTag.user_id == user_id, NoteTag.org_id == tag.org_id,
            NoteTag.name_lower == new_name.lower(), NoteTag.id != tag.id,
        )
    )).scalars().first()
    if target:
        already = set((await db.execute(
            select(NoteTagMap.note_id).where(NoteTagMap.tag_id == target.id)
        )).scalars().all())
        for nid in note_ids:
            if nid not in already:
                db.add(NoteTagMap(note_id=nid, tag_id=target.id))
        await db.execute(delete(NoteTagMap).where(NoteTagMap.tag_id == tag.id))
        await db.execute(delete(NoteTag).where(NoteTag.id == tag.id))
        result = target
    else:
        tag.name = new_name
        tag.name_lower = new_name.lower()
        db.add(tag)
        result = tag
    await db.commit()
    await db.refresh(result)
    count = (await db.execute(
        select(func.count()).select_from(NoteTagMap)
        .join(Note, Note.id == NoteTagMap.note_id)
        .where(NoteTagMap.tag_id == result.id, Note.deleted_at.is_(None))  # type: ignore[union-attr]
    )).scalar() or 0
    return TagRead(tag_uuid=result.tag_uuid, name=result.name, count=count)


# ---------------------------------------------------------------------------
# Compartilhamento por link
# ---------------------------------------------------------------------------


async def create_share(db: AsyncSession, current_user: CurrentUser, note_uuid: str, data) -> ShareCreated:
    user_id = await require_user_id(current_user)
    note = await get_owned_note(db, note_uuid, user_id)
    if note.deleted_at:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    if data.scope not in SHARE_SCOPES:
        raise HTTPException(status_code=422, detail="Invalid scope")
    expires_at = None
    if data.expires_in_days is not None:
        if not 1 <= int(data.expires_in_days) <= 365:
            raise HTTPException(status_code=422, detail="expires_in_days must be between 1 and 365")
        expires_at = (datetime.now(timezone.utc) + timedelta(days=int(data.expires_in_days))).isoformat()
    token = secrets.token_urlsafe(16)
    share = NoteShare(
        share_uuid=_new_uuid("noteshare"), note_id=note.id, token_hash=hash_token(token),
        scope=data.scope, created_by=user_id, created_at=now_iso(), expires_at=expires_at,
    )
    db.add(share)
    await db.flush()
    await _recompute_visibility(db, note)
    db.add(note)
    await db.commit()
    await db.refresh(share)
    return ShareCreated(share_uuid=share.share_uuid, scope=share.scope, created_at=share.created_at,
                        expires_at=share.expires_at, token=token)


async def list_shares(db: AsyncSession, current_user: CurrentUser, note_uuid: str) -> List[ShareRead]:
    user_id = await require_user_id(current_user)
    note = await get_owned_note(db, note_uuid, user_id)
    now = now_iso()
    rows = (await db.execute(
        select(NoteShare).where(
            NoteShare.note_id == note.id,
            NoteShare.revoked_at.is_(None),  # type: ignore[union-attr]
            or_(NoteShare.expires_at.is_(None), NoteShare.expires_at > now),  # type: ignore[union-attr]
        ).order_by(NoteShare.id)
    )).scalars().all()
    return [ShareRead(share_uuid=s.share_uuid, scope=s.scope, created_at=s.created_at, expires_at=s.expires_at)
            for s in rows]


async def revoke_share(db: AsyncSession, current_user: CurrentUser, note_uuid: str, share_uuid: str) -> dict:
    user_id = await require_user_id(current_user)
    note = await get_owned_note(db, note_uuid, user_id)
    share = (await db.execute(
        select(NoteShare).where(NoteShare.share_uuid == share_uuid, NoteShare.note_id == note.id)
    )).scalars().first()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    if not share.revoked_at:
        share.revoked_at = now_iso()
        db.add(share)
        await db.flush()
    await _recompute_visibility(db, note)
    db.add(note)
    await db.commit()
    return {"ok": True}


_SHARE_NOT_FOUND = HTTPException(status_code=404, detail="Shared note not found")


async def read_shared(db: AsyncSession, current_user: CurrentUser, token: str) -> SharedNoteRead:
    if not token or len(token) > 200:
        raise _SHARE_NOT_FOUND
    digest = hash_token(token)
    share = (await db.execute(select(NoteShare).where(NoteShare.token_hash == digest))).scalars().first()
    if not share or not hmac.compare_digest(share.token_hash, digest):
        raise _SHARE_NOT_FOUND
    if share.revoked_at:
        raise _SHARE_NOT_FOUND
    expires = _parse_iso(share.expires_at)
    if expires and expires <= datetime.now(timezone.utc):
        raise _SHARE_NOT_FOUND
    note = (await db.execute(select(Note).where(Note.id == share.note_id))).scalars().first()
    if not note or note.deleted_at:
        raise _SHARE_NOT_FOUND
    if share.scope == SHARE_SCOPE_MEMBERS:
        viewer_id = 0 if isinstance(current_user, APITokenUser) else int(getattr(current_user, "id", 0) or 0)
        if not viewer_id:
            raise HTTPException(status_code=401, detail={
                "code": "SHARE_REQUIRES_LOGIN",
                "message": "Log in as a member of this community to read this note.",
            })
        member = (await db.execute(
            select(UserOrganization.id).where(
                UserOrganization.user_id == viewer_id, UserOrganization.org_id == note.org_id
            )
        )).first()
        if not member:
            raise _SHARE_NOT_FOUND
    author = (await db.execute(select(User).where(User.id == note.user_id))).scalars().first()
    author_name = ""
    if author:
        author_name = (author.first_name or "").strip() or (author.username or "")
    return SharedNoteRead(title=note.title, content_json=note.content_json, kind=note.kind,
                          tcd_date=note.tcd_date, updated_at=note.updated_at, author_name=author_name,
                          scope=share.scope)


# ---------------------------------------------------------------------------
# Publicar na comunidade
# ---------------------------------------------------------------------------


async def publish_note(request: Request, db: AsyncSession, current_user: CurrentUser, note_uuid: str, data) -> PublishResult:
    from src.services.communities.discussions import create_discussion

    user_id = await require_user_id(current_user)
    note = await get_owned_note(db, note_uuid, user_id)
    if note.deleted_at:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    label = data.label or ("devocional" if note.kind == NOTE_KIND_TCD else "general")
    discussion = await create_discussion(
        request, data.community_uuid, note.title or "Sem título", note.content_json or "",
        label, current_user, db, visibility="public",
    )
    note = await get_owned_note(db, note_uuid, user_id)
    note.published_discussion_id = discussion.id
    note.visibility = NOTE_VISIBILITY_COMMUNITY
    note.updated_at = now_iso()
    db.add(note)
    await db.commit()
    return PublishResult(discussion_uuid=discussion.discussion_uuid, community_uuid=data.community_uuid)


# ---------------------------------------------------------------------------
# Migração do caderno antigo (discussions privadas → note)
# ---------------------------------------------------------------------------


def _legacy_content(content: Optional[str]) -> str:
    if parse_doc(content or "") is not None:
        return content or ""
    paragraphs = []
    for line in (content or "").split("\n"):
        if line.strip():
            paragraphs.append({"type": "paragraph", "content": [{"type": "text", "text": line}]})
        else:
            paragraphs.append({"type": "paragraph"})
    return json.dumps({"type": "doc", "content": paragraphs or [{"type": "paragraph"}]}, ensure_ascii=False)


async def migrate_legacy_for_user(db: AsyncSession, user_id: int, org_id: Optional[int] = None) -> int:
    """Copia as discussions privadas da pessoa para ``note``. Idempotente;
    os originais não são alterados."""
    stmt = select(Discussion).where(
        Discussion.author_id == user_id, Discussion.visibility == DISCUSSION_VISIBILITY_PRIVATE
    )
    if org_id is not None:
        stmt = stmt.where(Discussion.org_id == org_id)
    discussions = (await db.execute(stmt.order_by(Discussion.id))).scalars().all()
    if not discussions:
        return 0
    done = set((await db.execute(
        select(Note.legacy_discussion_id).where(
            Note.user_id == user_id, Note.legacy_discussion_id.is_not(None)  # type: ignore[union-attr]
        )
    )).scalars().all())
    copied = 0
    for d in discussions:
        if d.id in done:
            continue
        created = d.creation_date or now_iso()
        note = Note(
            note_uuid=_new_uuid("note"), user_id=user_id, org_id=d.org_id,
            title=(d.title or "")[:TITLE_MAX], content_json=_legacy_content(d.content),
            kind=NOTE_KIND_NOTE, legacy_discussion_id=d.id,
            created_at=created, updated_at=d.update_date or created,
        )
        db.add(note)
        await db.flush()
        await _apply_content(db, note)
        copied += 1
    await db.commit()
    return copied


async def migrate_legacy(db: AsyncSession, current_user: CurrentUser, org_id: int) -> int:
    user_id = await require_user_id(current_user)
    await require_member(db, user_id, org_id)
    return await migrate_legacy_for_user(db, user_id, org_id)


async def migrate_legacy_all(db: AsyncSession) -> int:
    """Para a CLI: copia o caderno antigo de todas as pessoas (sem ler conteúdo)."""
    authors = (await db.execute(
        select(Discussion.author_id).where(Discussion.visibility == DISCUSSION_VISIBILITY_PRIVATE).distinct()
    )).scalars().all()
    total = 0
    for author_id in authors:
        total += await migrate_legacy_for_user(db, author_id)
    return total
