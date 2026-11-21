"""Modelos de nota do usuário (note_template).

Privados ao dono, como as notas: toda consulta filtra por ``user_id`` da
sessão; qualquer outra pessoa (admin incluído) recebe 404. O conteúdo nunca
vai para log.
"""

import json
from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.db.notes import (
    CONTENT_MAX,
    NOTE_KINDS,
    TEMPLATE_NAME_MAX,
    TEMPLATES_PER_USER_ORG,
    NoteTemplate,
    TemplateCreate,
    TemplateRead,
    TemplateUpdate,
)
from src.services.notes.notes import CurrentUser, _new_uuid, now_iso, require_member, require_user_id

NOT_FOUND = "Template not found"


def _validate_name(name: Optional[str]) -> str:
    name = (name or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="Template name is required")
    if len(name) > TEMPLATE_NAME_MAX:
        raise HTTPException(status_code=422, detail=f"Template name too long (max {TEMPLATE_NAME_MAX})")
    return name


def _validate_content(content: Optional[str]) -> str:
    """Vazio ou um documento TipTap (``{"type": "doc", ...}``) em JSON."""
    content = content or ""
    if len(content) > CONTENT_MAX:
        raise HTTPException(status_code=422, detail="Content too large")
    if not content.strip():
        return ""
    try:
        doc = json.loads(content)
    except ValueError:
        raise HTTPException(status_code=422, detail="content_json must be a TipTap document")
    if not isinstance(doc, dict) or doc.get("type") != "doc":
        raise HTTPException(status_code=422, detail="content_json must be a TipTap document")
    return content


def _validate_kind(kind: Optional[str]) -> Optional[str]:
    if kind is None or kind == "":
        return None
    if kind not in NOTE_KINDS:
        raise HTTPException(status_code=422, detail=f"Invalid kind. Allowed: {', '.join(NOTE_KINDS)}")
    return kind


def _read(t: NoteTemplate) -> TemplateRead:
    return TemplateRead(
        template_uuid=t.template_uuid,
        name=t.name,
        kind=t.kind,
        content_json=t.content_json or "",
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


async def _owned(db: AsyncSession, template_uuid: str, user_id: int) -> NoteTemplate:
    t = (await db.execute(
        select(NoteTemplate).where(NoteTemplate.template_uuid == template_uuid, NoteTemplate.user_id == user_id)
    )).scalars().first()
    if not t:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return t


async def list_templates(db: AsyncSession, current_user: CurrentUser, org_id: int) -> List[TemplateRead]:
    user_id = await require_user_id(current_user)
    await require_member(db, user_id, org_id)
    rows = (await db.execute(
        select(NoteTemplate)
        .where(NoteTemplate.user_id == user_id, NoteTemplate.org_id == org_id)
        .order_by(func.lower(NoteTemplate.name), NoteTemplate.id)
    )).scalars().all()
    return [_read(t) for t in rows]


async def create_template(db: AsyncSession, current_user: CurrentUser, data: TemplateCreate) -> TemplateRead:
    user_id = await require_user_id(current_user)
    await require_member(db, user_id, data.org_id)
    name = _validate_name(data.name)
    content = _validate_content(data.content_json)
    kind = _validate_kind(data.kind)
    total = (await db.execute(
        select(func.count()).select_from(NoteTemplate).where(
            NoteTemplate.user_id == user_id, NoteTemplate.org_id == data.org_id
        )
    )).scalar_one()
    if total >= TEMPLATES_PER_USER_ORG:
        raise HTTPException(status_code=409, detail=f"Template limit reached ({TEMPLATES_PER_USER_ORG})")
    now = now_iso()
    t = NoteTemplate(
        template_uuid=_new_uuid("notetpl"),
        user_id=user_id,
        org_id=data.org_id,
        name=name,
        content_json=content,
        kind=kind,
        created_at=now,
        updated_at=now,
    )
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return _read(t)


async def update_template(
    db: AsyncSession, current_user: CurrentUser, template_uuid: str, data: TemplateUpdate
) -> TemplateRead:
    user_id = await require_user_id(current_user)
    t = await _owned(db, template_uuid, user_id)
    fields = data.model_fields_set
    if "name" in fields:
        t.name = _validate_name(data.name)
    if "content_json" in fields:
        t.content_json = _validate_content(data.content_json)
    if "kind" in fields:
        t.kind = _validate_kind(data.kind)
    t.updated_at = now_iso()
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return _read(t)


async def delete_template(db: AsyncSession, current_user: CurrentUser, template_uuid: str) -> dict:
    user_id = await require_user_id(current_user)
    t = await _owned(db, template_uuid, user_id)
    await db.delete(t)
    await db.commit()
    return {"ok": True}
