"""Caderno Bíblico — /api/v1/notes.

Tudo aqui é da própria pessoa logada (sessão; tokens de API e visitantes
recusados). A única rota aberta é ``GET /shared/{token}``, que lê uma nota
compartilhada por link com token válido.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlmodel.ext.asyncio.session import AsyncSession

from src.core.events.database import get_db_session
from src.db.notes import (
    CollectionCreate,
    CollectionRead,
    CollectionUpdate,
    MigrateLegacyResult,
    NoteCreate,
    NoteListResponse,
    NoteRead,
    NoteSummary,
    NoteUpdate,
    PublishRequest,
    PublishResult,
    ShareCreate,
    ShareCreated,
    ShareRead,
    SharedNoteRead,
    TagRead,
    TagRename,
    TcdCalendar,
    TcdRequest,
)
from src.security.auth import get_current_user
from src.services.notes import notes as svc

router = APIRouter()


# --- rotas fixas (antes de /{note_uuid}) -----------------------------------


@router.get("", response_model=NoteListResponse, summary="List my notes")
async def api_list_notes(
    org_id: int = Query(...),
    collection_uuid: Optional[str] = Query(default=None),
    tag: Optional[str] = Query(default=None),
    kind: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None, max_length=200),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    trash: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    return await svc.list_notes(db, current_user, org_id, collection_uuid, tag, kind, q,
                                date_from, date_to, trash, page, limit)


@router.post("", response_model=NoteRead, summary="Create a note")
async def api_create_note(body: NoteCreate, current_user=Depends(get_current_user),
                          db: AsyncSession = Depends(get_db_session)):
    return await svc.create_note(db, current_user, body)


@router.get("/resolve", response_model=NoteSummary, summary="Find my note by exact title")
async def api_resolve(org_id: int = Query(...), title: str = Query(..., max_length=300),
                      current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db_session)):
    return await svc.resolve_title(db, current_user, org_id, title)


@router.post("/tcd", response_model=NoteRead, summary="Get or create the TCD of a day")
async def api_tcd(body: TcdRequest, current_user=Depends(get_current_user),
                  db: AsyncSession = Depends(get_db_session)):
    return await svc.get_or_create_tcd(db, current_user, body.org_id, body.date)


@router.get("/tcd-calendar", response_model=TcdCalendar, summary="TCD days of a month and streak")
async def api_tcd_calendar(org_id: int = Query(...), month: str = Query(...), today: Optional[str] = Query(default=None),
                           current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db_session)):
    return await svc.tcd_calendar(db, current_user, org_id, month, today)


@router.get("/tcd/{date}", response_model=NoteRead, summary="Get the TCD of a day")
async def api_get_tcd(date: str, org_id: int = Query(...), current_user=Depends(get_current_user),
                      db: AsyncSession = Depends(get_db_session)):
    return await svc.get_tcd(db, current_user, org_id, date)


@router.get("/collections", response_model=List[CollectionRead], summary="List my collections")
async def api_list_collections(org_id: int = Query(...), current_user=Depends(get_current_user),
                               db: AsyncSession = Depends(get_db_session)):
    return await svc.list_collections(db, current_user, org_id)


@router.post("/collections", response_model=CollectionRead, summary="Create a collection")
async def api_create_collection(body: CollectionCreate, current_user=Depends(get_current_user),
                                db: AsyncSession = Depends(get_db_session)):
    return await svc.create_collection(db, current_user, body)


@router.put("/collections/{collection_uuid}", response_model=CollectionRead, summary="Rename/move a collection")
async def api_update_collection(collection_uuid: str, body: CollectionUpdate, current_user=Depends(get_current_user),
                                db: AsyncSession = Depends(get_db_session)):
    return await svc.update_collection(db, current_user, collection_uuid, body)


@router.delete("/collections/{collection_uuid}", summary="Delete a collection (notes are kept)")
async def api_delete_collection(collection_uuid: str, current_user=Depends(get_current_user),
                                db: AsyncSession = Depends(get_db_session)):
    return await svc.delete_collection(db, current_user, collection_uuid)


@router.get("/tags", response_model=List[TagRead], summary="List my tags")
async def api_list_tags(org_id: int = Query(...), current_user=Depends(get_current_user),
                        db: AsyncSession = Depends(get_db_session)):
    return await svc.list_tags(db, current_user, org_id)


@router.put("/tags/{tag_uuid}", response_model=TagRead, summary="Rename (or merge) a tag")
async def api_rename_tag(tag_uuid: str, body: TagRename, current_user=Depends(get_current_user),
                         db: AsyncSession = Depends(get_db_session)):
    return await svc.rename_tag(db, current_user, tag_uuid, body.name)


@router.post("/migrate-legacy", response_model=MigrateLegacyResult,
             summary="Copy my old private discussions into the notebook")
async def api_migrate_legacy(org_id: int = Query(...), current_user=Depends(get_current_user),
                             db: AsyncSession = Depends(get_db_session)):
    return MigrateLegacyResult(copied=await svc.migrate_legacy(db, current_user, org_id))


@router.get("/shared/{token}", response_model=SharedNoteRead, summary="Read a note shared by link")
async def api_read_shared(token: str, response: Response, current_user=Depends(get_current_user),
                          db: AsyncSession = Depends(get_db_session)):
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    response.headers["Referrer-Policy"] = "no-referrer"
    return await svc.read_shared(db, current_user, token)


# --- nota ------------------------------------------------------------------


@router.get("/{note_uuid}", response_model=NoteRead, summary="Get my note")
async def api_get_note(note_uuid: str, current_user=Depends(get_current_user),
                       db: AsyncSession = Depends(get_db_session)):
    return await svc.get_note(db, current_user, note_uuid)


@router.put("/{note_uuid}", response_model=NoteRead, summary="Update my note (parse-on-save)")
async def api_update_note(note_uuid: str, body: NoteUpdate, current_user=Depends(get_current_user),
                          db: AsyncSession = Depends(get_db_session)):
    return await svc.update_note(db, current_user, note_uuid, body)


@router.delete("/{note_uuid}", summary="Move my note to the trash")
async def api_trash_note(note_uuid: str, current_user=Depends(get_current_user),
                         db: AsyncSession = Depends(get_db_session)):
    return await svc.trash_note(db, current_user, note_uuid)


@router.post("/{note_uuid}/restore", response_model=NoteRead, summary="Restore from the trash (30 days)")
async def api_restore_note(note_uuid: str, current_user=Depends(get_current_user),
                           db: AsyncSession = Depends(get_db_session)):
    return await svc.restore_note(db, current_user, note_uuid)


@router.delete("/{note_uuid}/permanent", summary="Delete a trashed note forever")
async def api_delete_permanent(note_uuid: str, current_user=Depends(get_current_user),
                               db: AsyncSession = Depends(get_db_session)):
    return await svc.delete_note_permanently(db, current_user, note_uuid)


@router.get("/{note_uuid}/backlinks", response_model=List[NoteSummary], summary="Notes linking here")
async def api_backlinks(note_uuid: str, current_user=Depends(get_current_user),
                        db: AsyncSession = Depends(get_db_session)):
    return await svc.backlinks(db, current_user, note_uuid)


@router.get("/{note_uuid}/export", summary="Export my note as Markdown")
async def api_export(note_uuid: str, current_user=Depends(get_current_user),
                     db: AsyncSession = Depends(get_db_session)):
    content, filename = await svc.export_markdown(db, current_user, note_uuid)
    return Response(
        content=content,
        media_type="text/markdown; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


@router.get("/{note_uuid}/shares", response_model=List[ShareRead], summary="Active share links")
async def api_list_shares(note_uuid: str, current_user=Depends(get_current_user),
                          db: AsyncSession = Depends(get_db_session)):
    return await svc.list_shares(db, current_user, note_uuid)


@router.post("/{note_uuid}/shares", response_model=ShareCreated, summary="Create a private share link")
async def api_create_share(note_uuid: str, body: ShareCreate, response: Response,
                           current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db_session)):
    response.headers["Cache-Control"] = "no-store"
    return await svc.create_share(db, current_user, note_uuid, body)


@router.delete("/{note_uuid}/shares/{share_uuid}", summary="Revoke a share link")
async def api_revoke_share(note_uuid: str, share_uuid: str, current_user=Depends(get_current_user),
                           db: AsyncSession = Depends(get_db_session)):
    return await svc.revoke_share(db, current_user, note_uuid, share_uuid)


@router.post("/{note_uuid}/publish", response_model=PublishResult, summary="Publish a copy in a community")
async def api_publish(note_uuid: str, body: PublishRequest, request: Request,
                      current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db_session)):
    return await svc.publish_note(request, db, current_user, note_uuid, body)
