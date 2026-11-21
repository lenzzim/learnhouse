"""Add visibility to discussion (caderno privado)

Adds ``visibility`` to ``discussion``: ``'public'`` (default) or ``'private'``.
A private discussion is a personal note ("caderno") readable only by its
author; publishing flips it to ``'public'``.

``server_default='public'`` keeps every pre-existing row public, so the
community feed is unchanged after the upgrade. An index on
``(author_id, visibility)`` backs the "meu caderno" listing.

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-11-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel  # noqa: F401


# revision identifiers, used by Alembic.
revision: str = 'c2d3e4f5a6b7'
down_revision: Union[str, None] = 'b1c2d3e4f5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_INDEX_NAME = 'ix_discussion_author_visibility'


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if 'discussion' not in inspector.get_table_names():
        return

    existing_columns = {col['name'] for col in inspector.get_columns('discussion')}
    if 'visibility' not in existing_columns:
        op.add_column(
            'discussion',
            sa.Column(
                'visibility',
                sa.String(length=20),
                nullable=False,
                server_default='public',
            ),
        )

    existing_indexes = {ix['name'] for ix in inspector.get_indexes('discussion')}
    if _INDEX_NAME not in existing_indexes:
        op.create_index(_INDEX_NAME, 'discussion', ['author_id', 'visibility'])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if 'discussion' not in inspector.get_table_names():
        return

    existing_indexes = {ix['name'] for ix in inspector.get_indexes('discussion')}
    if _INDEX_NAME in existing_indexes:
        op.drop_index(_INDEX_NAME, table_name='discussion')

    existing_columns = {col['name'] for col in inspector.get_columns('discussion')}
    if 'visibility' in existing_columns:
        op.drop_column('discussion', 'visibility')
