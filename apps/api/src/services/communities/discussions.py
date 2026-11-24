from typing import List, Union, Optional
from uuid import uuid4
from datetime import datetime, timezone
from enum import Enum
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from fastapi import HTTPException, Request

from src.db.users import PublicUser, AnonymousUser, APITokenUser, User, UserReadAuthor
from src.security.auth import resolve_acting_user_id
from src.db.communities.communities import Community
from src.services.analytics.analytics import track
from src.services.analytics import events as analytics_events
from src.services.webhooks.dispatch import dispatch_webhooks
from src.db.communities.discussions import (
    Discussion,
    DiscussionReadWithVoteStatus,
    DiscussionUpdate,
    DISCUSSION_LABELS,
    LEGACY_DISCUSSION_LABELS,
    DISCUSSION_VISIBILITY_PUBLIC,
)
from src.db.communities.discussion_votes import DiscussionVote
from src.db.communities.discussion_comments import DiscussionComment
from sqlalchemy import func
from src.security.rbac import (
    check_resource_access,
    AccessAction,
    authorization_verify_if_user_is_anon,
    authorization_verify_based_on_org_admin_status,
)
from src.services.communities.moderation import (
    validate_discussion_content,
    enforce_posting_limits,
)
from src.services.communities.social import notify_mentions
from src.services.communities.publicacao import ensure_can_post
from src.services.communities.visibility import (
    apply_visibility,
    announce_publication,
    ensure_discussion_visible,
    is_private,
    privacy_viewer_id,
    validate_visibility,
    visible_discussions_clause,
)


class DiscussionSortBy(str, Enum):
    RECENT = "recent"      # ORDER BY creation_date DESC
    UPVOTES = "upvotes"    # ORDER BY upvote_count DESC
    HOT = "hot"            # ORDER BY hot_score DESC


def calculate_hot_score(upvotes: int, creation_date: str) -> float:
    """
    Calculate hot score using Hacker News algorithm.

    Formula: (votes - 1) / (hours + 2)^1.8

    This ensures:
    - New posts get initial visibility
    - Posts decay naturally over time
    - High-voted posts stay visible longer
    """
    GRAVITY = 1.8  # Higher = faster decay
    BASE_HOURS = 2  # Prevents division issues for new posts

    try:
        created = datetime.fromisoformat(creation_date.replace("Z", "+00:00"))
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
    except (ValueError, AttributeError):
        created = datetime.now(timezone.utc)

    now = datetime.now(timezone.utc)
    hours = max(0, (now - created).total_seconds() / 3600)

    return (upvotes - 1) / pow(hours + BASE_HOURS, GRAVITY)


def validate_label(label: str) -> str:
    """Validate that the label is a valid discussion label."""
    valid_labels = {
        label_def["id"] for label_def in (*DISCUSSION_LABELS, *LEGACY_DISCUSSION_LABELS)
    }
    if label not in valid_labels:
        return "general"
    return label


async def create_discussion(
    request: Request,
    community_uuid: str,
    title: str,
    content: str,
    label: str,
    current_user: Union[PublicUser, AnonymousUser, APITokenUser],
    db_session: AsyncSession,
    emoji: Optional[str] = None,
    visibility: str = DISCUSSION_VISIBILITY_PUBLIC,
) -> DiscussionReadWithVoteStatus:
    """
    Create a new discussion in a community.

    Requires authenticated user who can read the community.
    Author automatically upvotes their own discussion.
    ``visibility='private'`` keeps it in the author's notebook (only they see it).
    """
    # Verify user is not anonymous
    await authorization_verify_if_user_is_anon(current_user.id)

    visibility = validate_visibility(visibility or DISCUSSION_VISIBILITY_PUBLIC)

    # Check if user can read the community
    await check_resource_access(
        request, db_session, current_user, community_uuid, AccessAction.READ
    )

    # Get the community
    community_statement = select(Community).where(
        Community.community_uuid == community_uuid
    )
    community = (await db_session.execute(community_statement)).scalars().first()

    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    # Blog só para autores (N45): espaço com "quem pode publicar" = grupo.
    # Notas privadas do Caderno não publicam nada, então só o público conta.
    if visibility == DISCUSSION_VISIBILITY_PUBLIC:
        await ensure_can_post(db_session, current_user.id, community)

    # Apply per-user posting limits (slow mode, daily caps, account age, email)
    await enforce_posting_limits(current_user.id, community, db_session)

    # Check content moderation
    await validate_discussion_content(title, content, community.id, db_session)

    # Validate label
    validated_label = validate_label(label)

    # Create discussion
    discussion = Discussion(
        title=title,
        content=content,
        label=validated_label,
        emoji=emoji,
        community_id=community.id,
        org_id=community.org_id,
        author_id=current_user.id,
        discussion_uuid=f"discussion_{uuid4()}",
        upvote_count=1,  # Author's auto-upvote
        is_pinned=False,
        is_locked=False,
        visibility=visibility,
        creation_date=str(datetime.now()),
        update_date=str(datetime.now()),
    )

    db_session.add(discussion)
    # Flush to assign discussion.id without ending the transaction, so the
    # author's auto-upvote vote row is written atomically with the discussion.
    # Previously the vote was committed in a *second* transaction after the
    # discussion was already persisted; if that second commit failed the
    # discussion was left with upvote_count=1 but no matching vote row — a
    # permanently inflated, unremovable phantom upvote.
    await db_session.flush()

    # Create auto-upvote from author in the same transaction
    vote = DiscussionVote(
        discussion_id=discussion.id,
        user_id=current_user.id,
        vote_uuid=f"vote_{uuid4()}",
        creation_date=str(datetime.now()),
    )
    db_session.add(vote)

    await db_session.commit()
    await db_session.refresh(discussion)

    # Caderno privado: nada sai para analytics/webhooks (o título iria para
    # integrações externas). O anúncio acontece se/quando for publicada.
    if not is_private(discussion):
        await _announce_new_discussion(discussion, community, community_uuid, validated_label, current_user)
        # Menções @nome (N39): só notifica quem pode ler este espaço.
        await notify_mentions(request, db_session, current_user.id, discussion, discussion.content)

    # Get author info
    author_statement = select(User).where(User.id == discussion.author_id)
    author = (await db_session.execute(author_statement)).scalars().first()

    return DiscussionReadWithVoteStatus(
        **discussion.model_dump(),
        author=UserReadAuthor.model_validate(author.model_dump()) if author else None,
        has_voted=True,
    )


async def _announce_new_discussion(discussion, community, community_uuid, validated_label, current_user) -> None:
    # Track discussion posted event
    await track(
        event_name=analytics_events.DISCUSSION_POSTED,
        org_id=community.org_id,
        user_id=current_user.id,
        properties={
            "community_uuid": community_uuid,
            "discussion_uuid": discussion.discussion_uuid,
            "label": validated_label,
        },
    )
    await dispatch_webhooks(
        event_name=analytics_events.DISCUSSION_POSTED,
        org_id=community.org_id,
        data={
            "user": {"user_uuid": current_user.user_uuid, "email": current_user.email, "username": current_user.username},
            "discussion": {"discussion_uuid": discussion.discussion_uuid, "title": discussion.title},
            "community": {"community_uuid": community_uuid},
        },
    )


async def get_discussion(
    request: Request,
    discussion_uuid: str,
    current_user: Union[PublicUser, AnonymousUser, APITokenUser],
    db_session: AsyncSession,
) -> DiscussionReadWithVoteStatus:
    """
    Get a discussion by UUID.
    """
    # Get discussion
    statement = select(Discussion).where(Discussion.discussion_uuid == discussion_uuid)
    discussion = (await db_session.execute(statement)).scalars().first()

    if not discussion:
        raise HTTPException(status_code=404, detail="Discussion not found")

    # Caderno privado: só o autor lê (404 para os demais, inclusive admins)
    ensure_discussion_visible(discussion, current_user)

    # Get community and check access
    community_statement = select(Community).where(Community.id == discussion.community_id)
    community = (await db_session.execute(community_statement)).scalars().first()

    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    await check_resource_access(request, db_session, current_user, community.community_uuid, AccessAction.READ)

    # Get author info
    author_statement = select(User).where(User.id == discussion.author_id)
    author = (await db_session.execute(author_statement)).scalars().first()

    # Check if user has voted
    has_voted = False
    if current_user.id != 0:
        vote_statement = select(DiscussionVote).where(
            DiscussionVote.discussion_id == discussion.id,
            DiscussionVote.user_id == current_user.id,
        )
        vote = (await db_session.execute(vote_statement)).scalars().first()
        has_voted = vote is not None

    accepted_uuid = None
    if discussion.accepted_comment_id:
        accepted_uuid = (await db_session.execute(
            select(DiscussionComment.comment_uuid).where(
                DiscussionComment.id == discussion.accepted_comment_id,
                DiscussionComment.discussion_id == discussion.id,
            )
        )).scalars().first()

    return DiscussionReadWithVoteStatus(
        **discussion.model_dump(),
        author=UserReadAuthor.model_validate(author.model_dump()) if author else None,
        has_voted=has_voted,
        accepted_comment_uuid=accepted_uuid,
    )


async def get_discussions_by_community(
    request: Request,
    community_uuid: str,
    current_user: Union[PublicUser, AnonymousUser, APITokenUser],
    db_session: AsyncSession,
    sort_by: DiscussionSortBy = DiscussionSortBy.RECENT,
    page: int = 1,
    limit: int = 10,
    label: Optional[str] = None,
    author_uuid: Optional[str] = None,
) -> List[DiscussionReadWithVoteStatus]:
    """
    Get paginated list of discussions for a community with sorting.
    Pinned discussions are always returned first.

    ``author_uuid`` (Discipulei, N39): "posts de…" / "meus posts". É só um
    filtro sobre o que a pessoa já pode ler aqui (a checagem de leitura da
    comunidade e a de privacidade continuam valendo).
    """
    # Check if user can read the community
    await check_resource_access(
        request, db_session, current_user, community_uuid, AccessAction.READ
    )

    # Get the community
    community_statement = select(Community).where(
        Community.community_uuid == community_uuid
    )
    community = (await db_session.execute(community_statement)).scalars().first()

    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    offset = (page - 1) * limit

    author_id: Optional[int] = None
    if author_uuid:
        author_id = (await db_session.execute(
            select(User.id).where(User.user_uuid == author_uuid)
        )).scalars().first()
        if author_id is None:
            return []

    # Caderno privado: públicas + as privadas do próprio usuário
    visible = visible_discussions_clause(current_user)

    # For first page, get pinned discussions first
    pinned_discussions = []
    if page == 1:
        pinned_query = select(Discussion).where(
            Discussion.community_id == community.id,
            Discussion.is_pinned == True,
            visible,
        )
        if label:
            pinned_query = pinned_query.where(Discussion.label == label)
        if author_id is not None:
            pinned_query = pinned_query.where(Discussion.author_id == author_id)
        pinned_discussions = list((await db_session.execute(pinned_query)).scalars().all())

    # Get non-pinned discussions with sorting
    non_pinned_query = select(Discussion).where(
        Discussion.community_id == community.id,
        Discussion.is_pinned == False,
        visible,
    )
    if label:
        non_pinned_query = non_pinned_query.where(Discussion.label == label)
    if author_id is not None:
        non_pinned_query = non_pinned_query.where(Discussion.author_id == author_id)

    # Apply sorting
    if sort_by == DiscussionSortBy.RECENT:
        non_pinned_query = non_pinned_query.order_by(Discussion.creation_date.desc())  # type: ignore
    elif sort_by == DiscussionSortBy.UPVOTES:
        non_pinned_query = non_pinned_query.order_by(Discussion.upvote_count.desc())  # type: ignore
    # For HOT sorting, we'll fetch all and sort in Python

    # Calculate adjusted offset and limit for non-pinned discussions
    pinned_count = len(pinned_discussions) if page == 1 else 0
    adjusted_offset = max(0, offset - pinned_count) if page > 1 else 0
    adjusted_limit = limit - pinned_count if page == 1 else limit

    if adjusted_limit > 0:
        non_pinned_query = non_pinned_query.offset(adjusted_offset).limit(adjusted_limit)
        non_pinned_discussions = list((await db_session.execute(non_pinned_query)).scalars().all())
    else:
        non_pinned_discussions = []

    # If hot sorting, calculate scores and sort
    if sort_by == DiscussionSortBy.HOT and non_pinned_discussions:
        discussions_with_scores = [
            (d, calculate_hot_score(d.upvote_count, d.creation_date))
            for d in non_pinned_discussions
        ]
        discussions_with_scores.sort(key=lambda x: x[1], reverse=True)
        non_pinned_discussions = [d[0] for d in discussions_with_scores]

    # Combine: pinned first (only on page 1), then non-pinned
    discussions = (pinned_discussions if page == 1 else []) + non_pinned_discussions

    # Get all discussion IDs for batch operations
    discussion_ids = [d.id for d in discussions]
    author_ids = [d.author_id for d in discussions]

    # Batch fetch authors
    if author_ids:
        authors_query = select(User).where(User.id.in_(author_ids))  # type: ignore
        authors = (await db_session.execute(authors_query)).scalars().all()
        authors_map = {a.id: a for a in authors}
    else:
        authors_map = {}

    # Batch fetch user votes
    user_votes = set()
    if current_user.id != 0 and discussion_ids:
        votes_query = select(DiscussionVote).where(
            DiscussionVote.discussion_id.in_(discussion_ids),  # type: ignore
            DiscussionVote.user_id == current_user.id,
        )
        votes = (await db_session.execute(votes_query)).scalars().all()
        user_votes = {v.discussion_id for v in votes}

    # Contagem de comentários em lote (antes o front pedia uma por post).
    comment_counts: dict = {}
    if discussion_ids:
        comment_counts = dict((await db_session.execute(
            select(DiscussionComment.discussion_id, func.count(DiscussionComment.id))
            .where(DiscussionComment.discussion_id.in_(discussion_ids))  # type: ignore[attr-defined]
            .group_by(DiscussionComment.discussion_id)
        )).all())

    # Build response
    result = []
    for discussion in discussions:
        author = authors_map.get(discussion.author_id)
        has_voted = discussion.id in user_votes

        result.append(
            DiscussionReadWithVoteStatus(
                **discussion.model_dump(),
                author=UserReadAuthor.model_validate(author.model_dump()) if author else None,
                has_voted=has_voted,
                comment_count=int(comment_counts.get(discussion.id, 0)),
            )
        )

    return result


async def update_discussion(
    request: Request,
    discussion_uuid: str,
    discussion_object: DiscussionUpdate,
    current_user: Union[PublicUser, AnonymousUser, APITokenUser],
    db_session: AsyncSession,
) -> DiscussionReadWithVoteStatus:
    """
    Update a discussion.

    Requires discussion author or admin role.
    Authors can edit their discussions up to 2 times.
    """
    # Resolve API tokens to their creator so admin/author checks run against
    # a real user id rather than the token id (which is 0).
    acting_user_id = resolve_acting_user_id(current_user)

    # Verify user is not anonymous
    await authorization_verify_if_user_is_anon(acting_user_id)

    # Get discussion
    statement = select(Discussion).where(Discussion.discussion_uuid == discussion_uuid)
    discussion = (await db_session.execute(statement)).scalars().first()

    if not discussion:
        raise HTTPException(status_code=404, detail="Discussion not found")

    # Caderno privado: admins não editam (nem enxergam) notas de outros
    ensure_discussion_visible(discussion, current_user)

    # Get community
    community_statement = select(Community).where(Community.id == discussion.community_id)
    community = (await db_session.execute(community_statement)).scalars().first()

    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    # Check if user is author or admin
    is_author = discussion.author_id == acting_user_id
    is_admin = await authorization_verify_based_on_org_admin_status(
        request, acting_user_id, "update", community.community_uuid, db_session
    )

    if not is_author and not is_admin:
        raise HTTPException(status_code=403, detail="You don't have permission to update this discussion")

    # Visibilidade: só o próprio autor publica/despublica
    new_visibility = None
    if discussion_object.visibility is not None:
        new_visibility = validate_visibility(discussion_object.visibility)
        if new_visibility != discussion.visibility and discussion.author_id != privacy_viewer_id(current_user):
            raise HTTPException(
                status_code=403,
                detail="Only the author can change the visibility of this discussion",
            )

    if new_visibility == DISCUSSION_VISIBILITY_PUBLIC and is_private(discussion):
        await ensure_can_post(db_session, acting_user_id, community)

    # Check edit limit for authors (admins can edit unlimited)
    is_author = discussion.author_id == acting_user_id
    max_edits = 2
    # Notas privadas não têm público, então editar o caderno não consome edições;
    # mudar só a visibilidade também não conta como edição.
    was_private = is_private(discussion)
    content_changed = any(
        value is not None
        for value in (discussion_object.title, discussion_object.content,
                      discussion_object.label, discussion_object.emoji)
    )
    counts_as_edit = is_author and content_changed and not was_private

    if counts_as_edit and discussion.edit_count >= max_edits:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "EDIT_LIMIT_REACHED",
                "message": f"You have reached the maximum number of edits ({max_edits}). You can no longer edit this discussion.",
                "edit_count": discussion.edit_count,
                "max_edits": max_edits,
            }
        )

    # Check content moderation for updated fields
    title_to_check = discussion_object.title if discussion_object.title is not None else discussion.title
    content_to_check = discussion_object.content if discussion_object.content is not None else discussion.content
    await validate_discussion_content(title_to_check, content_to_check or "", discussion.community_id, db_session)

    old_content = discussion.content

    # Update fields
    if discussion_object.title is not None:
        discussion.title = discussion_object.title
    if discussion_object.content is not None:
        discussion.content = discussion_object.content
    if discussion_object.label is not None:
        discussion.label = validate_label(discussion_object.label)
    if discussion_object.emoji is not None:
        # Allow setting emoji to empty string to clear it
        discussion.emoji = discussion_object.emoji if discussion_object.emoji else None

    # Increment edit count for authors
    if counts_as_edit:
        discussion.edit_count += 1

    discussion.update_date = str(datetime.now())

    just_published = False
    if new_visibility is not None and new_visibility != discussion.visibility:
        just_published = apply_visibility(discussion, new_visibility)

    db_session.add(discussion)
    await db_session.commit()
    await db_session.refresh(discussion)

    if just_published:
        await announce_publication(discussion, community, current_user)

    # Menções novas (ao publicar, todas contam como novas).
    if not is_private(discussion):
        await notify_mentions(
            request, db_session, discussion.author_id, discussion, discussion.content,
            None if (just_published or was_private) else old_content,
        )

    # Get author info
    author_statement = select(User).where(User.id == discussion.author_id)
    author = (await db_session.execute(author_statement)).scalars().first()

    # Check if user has voted
    vote_statement = select(DiscussionVote).where(
        DiscussionVote.discussion_id == discussion.id,
        DiscussionVote.user_id == acting_user_id,
    )
    vote = (await db_session.execute(vote_statement)).scalars().first()

    return DiscussionReadWithVoteStatus(
        **discussion.model_dump(),
        author=UserReadAuthor.model_validate(author.model_dump()) if author else None,
        has_voted=vote is not None,
    )

async def pin_discussion(
    request: Request,
    discussion_uuid: str,
    is_pinned: bool,
    current_user: Union[PublicUser, AnonymousUser, APITokenUser],
    db_session: AsyncSession,
) -> DiscussionReadWithVoteStatus:
    """
    Pin or unpin a discussion.

    Requires community admin or maintainer role. Authors cannot pin.
    """
    acting_user_id = resolve_acting_user_id(current_user)
    await authorization_verify_if_user_is_anon(acting_user_id)

    statement = select(Discussion).where(Discussion.discussion_uuid == discussion_uuid)
    discussion = (await db_session.execute(statement)).scalars().first()

    if not discussion:
        raise HTTPException(status_code=404, detail="Discussion not found")

    # Caderno privado: invisível para moderadores; fixar/bloquear não se aplica
    ensure_discussion_visible(discussion, current_user)
    if is_private(discussion):
        raise HTTPException(status_code=403, detail="Private discussions cannot be pinned or locked")

    community_statement = select(Community).where(Community.id == discussion.community_id)
    community = (await db_session.execute(community_statement)).scalars().first()

    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    is_admin = await authorization_verify_based_on_org_admin_status(
        request, acting_user_id, "update", community.community_uuid, db_session
    )

    if not is_admin:
        raise HTTPException(status_code=403, detail="Only community moderators can pin discussions")

    discussion.is_pinned = is_pinned
    discussion.update_date = str(datetime.now())

    db_session.add(discussion)
    await db_session.commit()
    await db_session.refresh(discussion)

    await dispatch_webhooks(
        event_name="discussion_pinned",
        org_id=community.org_id,
        data={
            "discussion_uuid": discussion.discussion_uuid,
            "title": discussion.title,
            "is_pinned": is_pinned,
            "community_uuid": community.community_uuid,
        },
    )

    # Get author info
    author_statement = select(User).where(User.id == discussion.author_id)
    author = (await db_session.execute(author_statement)).scalars().first()

    # Check if user has voted
    vote_statement = select(DiscussionVote).where(
        DiscussionVote.discussion_id == discussion.id,
        DiscussionVote.user_id == acting_user_id,
    )
    vote = (await db_session.execute(vote_statement)).scalars().first()

    return DiscussionReadWithVoteStatus(
        **discussion.model_dump(),
        author=UserReadAuthor.model_validate(author.model_dump()) if author else None,
        has_voted=vote is not None,
    )

async def lock_discussion(
    request: Request,
    discussion_uuid: str,
    is_locked: bool,
    current_user: Union[PublicUser, AnonymousUser, APITokenUser],
    db_session: AsyncSession,
) -> DiscussionReadWithVoteStatus:
    """
    Lock or unlock a discussion.

    Requires community admin or maintainer role. Authors cannot lock.
    """
    acting_user_id = resolve_acting_user_id(current_user)
    await authorization_verify_if_user_is_anon(acting_user_id)

    statement = select(Discussion).where(Discussion.discussion_uuid == discussion_uuid)
    discussion = (await db_session.execute(statement)).scalars().first()

    if not discussion:
        raise HTTPException(status_code=404, detail="Discussion not found")

    # Caderno privado: invisível para moderadores; fixar/bloquear não se aplica
    ensure_discussion_visible(discussion, current_user)
    if is_private(discussion):
        raise HTTPException(status_code=403, detail="Private discussions cannot be pinned or locked")

    community_statement = select(Community).where(Community.id == discussion.community_id)
    community = (await db_session.execute(community_statement)).scalars().first()

    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    is_admin = await authorization_verify_based_on_org_admin_status(
        request, acting_user_id, "update", community.community_uuid, db_session
    )

    if not is_admin:
        raise HTTPException(status_code=403, detail="Only community moderators can lock discussions")

    discussion.is_locked = is_locked
    discussion.update_date = str(datetime.now())

    db_session.add(discussion)
    await db_session.commit()
    await db_session.refresh(discussion)

    await dispatch_webhooks(
        event_name="discussion_locked",
        org_id=community.org_id,
        data={
            "discussion_uuid": discussion.discussion_uuid,
            "title": discussion.title,
            "is_locked": is_locked,
            "community_uuid": community.community_uuid,
        },
    )

    # Get author info
    author_statement = select(User).where(User.id == discussion.author_id)
    author = (await db_session.execute(author_statement)).scalars().first()

    # Check if user has voted
    vote_statement = select(DiscussionVote).where(
        DiscussionVote.discussion_id == discussion.id,
        DiscussionVote.user_id == acting_user_id,
    )
    vote = (await db_session.execute(vote_statement)).scalars().first()

    return DiscussionReadWithVoteStatus(
        **discussion.model_dump(),
        author=UserReadAuthor.model_validate(author.model_dump()) if author else None,
        has_voted=vote is not None,
    )

async def delete_discussion(
    request: Request,
    discussion_uuid: str,
    current_user: Union[PublicUser, AnonymousUser, APITokenUser],
    db_session: AsyncSession,
) -> dict:
    """
    Delete a discussion.

    Requires discussion author or admin role.
    """
    acting_user_id = resolve_acting_user_id(current_user)

    # Verify user is not anonymous
    await authorization_verify_if_user_is_anon(acting_user_id)

    # Get discussion
    statement = select(Discussion).where(Discussion.discussion_uuid == discussion_uuid)
    discussion = (await db_session.execute(statement)).scalars().first()

    if not discussion:
        raise HTTPException(status_code=404, detail="Discussion not found")

    # Caderno privado: só o autor apaga (admins nem sabem que existe)
    ensure_discussion_visible(discussion, current_user)

    # Get community
    community_statement = select(Community).where(Community.id == discussion.community_id)
    community = (await db_session.execute(community_statement)).scalars().first()

    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    # Check if user is author or admin
    is_author = discussion.author_id == acting_user_id
    is_admin = await authorization_verify_based_on_org_admin_status(
        request, acting_user_id, "delete", community.community_uuid, db_session
    )

    if not is_author and not is_admin:
        raise HTTPException(status_code=403, detail="You don't have permission to delete this discussion")

    await db_session.delete(discussion)
    await db_session.commit()

    return {"detail": "Discussion deleted"}
