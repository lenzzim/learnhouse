"""Desafio atual da comunidade (Discipulei, decisão de 22/11/2026).

Um *desafio* não tem tabela própria: é um curso nativo com uma comunidade
ligada a ele pelo campo nativo ``Community.course_id``. Inscrever-se no
desafio é o "começar curso" nativo (``add_course_to_trail``), que dá acesso às
aulas e, pela regra de ``ResourceAccessChecker._apply_course_enrollment_gate``,
às discussões da comunidade ligada.

Regra do "desafio atual" (sem migração):

1. curso **publicado** da org;
2. com uma comunidade ligada (``Community.course_id == Course.id``);
3. que a pessoa **pode ver** (mesmas regras de leitura do curso: público,
   grupo vinculado — "Homens"/"Mulheres" — ou membros da org);
4. entre os que sobram, o **criado mais recentemente** (desempate pelo id).

Abrir um desafio = publicar o curso (com a comunidade já ligada). Fechar =
despublicar o curso (as conversas ficam para quem participou) ou desligar a
comunidade. Desafio separado por gênero = curso não público com o grupo do
gênero vinculado; quem é do outro grupo nem vê o desafio.
"""

from typing import Optional, Union

from fastapi import Request
from pydantic import BaseModel
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.db.communities.communities import Community
from src.db.courses.courses import Course
from src.db.users import AnonymousUser, APITokenUser, PublicUser
from src.security.rbac import AccessAction, check_resource_access, is_enrolled_in_course

# Quantos candidatos olhar antes de desistir (cada um custa uma checagem de
# acesso; na prática há um ou dois desafios abertos por vez).
MAX_CANDIDATOS = 20


class DesafioAtualRead(BaseModel):
    course_uuid: str
    course_name: str
    course_description: Optional[str] = None
    course_thumbnail_image: Optional[str] = None
    community_uuid: str
    community_name: str
    is_enrolled: bool = False


async def get_current_challenge(
    request: Request,
    org_id: int,
    current_user: Union[PublicUser, AnonymousUser, APITokenUser],
    db_session: AsyncSession,
) -> Optional[DesafioAtualRead]:
    """O desafio atual que a pessoa pode ver, ou ``None``.

    Só para quem entrou: visitantes e tokens de API recebem ``None`` (o
    desafio vive dentro da comunidade, atrás do login).
    """
    if not isinstance(current_user, PublicUser) or not current_user.id:
        return None

    rows = (await db_session.execute(
        select(Course, Community)
        .join(Community, Community.course_id == Course.id)  # type: ignore[arg-type]
        .where(
            Course.org_id == org_id,
            Course.published == True,  # noqa: E712
            Community.org_id == org_id,
        )
        .order_by(Course.creation_date.desc(), Course.id.desc())  # type: ignore[union-attr]
        .limit(MAX_CANDIDATOS)
    )).all()

    for course, community in rows:
        decision = await check_resource_access(
            request, db_session, current_user, course.course_uuid,
            AccessAction.READ, raise_on_deny=False,
        )
        if not decision.allowed:
            continue
        return DesafioAtualRead(
            course_uuid=course.course_uuid,
            course_name=course.name,
            course_description=course.description,
            course_thumbnail_image=course.thumbnail_image or None,
            community_uuid=community.community_uuid,
            community_name=community.name,
            is_enrolled=await is_enrolled_in_course(db_session, course.id or 0, current_user.id),
        )
    return None
