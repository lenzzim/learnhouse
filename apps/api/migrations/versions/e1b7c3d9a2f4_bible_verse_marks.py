"""Leitor bíblico: destaques e favoritos por versículo (caderno v5, item 4)

- ``bible_verse_mark``: uma linha por versículo marcado de uma pessoa, com o
  tom do destaque (paleta do Caderno) e/ou favorito. Por livro, capítulo e
  versículo, independente da versão. Sem texto bíblico.

Idempotente: se o ``create_all`` já criou a tabela ou os índices, só o que
falta é criado. O downgrade remove a tabela e os índices.

Revision ID: e1b7c3d9a2f4
Revises: dd4e5f6a7b8c
Create Date: 2026-11-24

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel  # noqa: F401


# revision identifiers, used by Alembic.
revision: str = 'e1b7c3d9a2f4'
down_revision: Union[str, None] = 'dd4e5f6a7b8c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_TABLE = 'bible_verse_mark'
_INDEXES = (
    ('ix_bible_verse_mark_user_chapter', ['user_id', 'book', 'chapter']),
    ('ix_bible_verse_mark_user_updated', ['user_id', 'updated_at']),
)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if _TABLE not in set(inspector.get_table_names()):
        op.create_table(
            _TABLE,
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
            sa.Column('book', sa.String(3), nullable=False),
            sa.Column('chapter', sa.Integer(), nullable=False),
            sa.Column('verse', sa.Integer(), nullable=False),
            sa.Column('color', sa.String(12), nullable=True),
            sa.Column('favorite', sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column('created_at', sa.String(40), nullable=False, server_default=''),
            sa.Column('updated_at', sa.String(40), nullable=False, server_default=''),
            sa.UniqueConstraint('user_id', 'book', 'chapter', 'verse', name='uq_bible_verse_mark'),
        )
    inspector = sa.inspect(bind)
    existing = {ix['name'] for ix in inspector.get_indexes(_TABLE)}
    for name, cols in _INDEXES:
        if name not in existing:
            op.create_index(name, _TABLE, cols, unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if _TABLE not in set(inspector.get_table_names()):
        return
    existing = {ix['name'] for ix in inspector.get_indexes(_TABLE)}
    for name, _cols in _INDEXES:
        if name in existing:
            op.drop_index(name, table_name=_TABLE)
    op.drop_table(_TABLE)
