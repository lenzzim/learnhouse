"""Caderno Bíblico: modelos de nota do usuário (note_template)

Cria ``note_template``: modelos salvos pela própria pessoa ("Salvar como
modelo"), privados ao dono como as notas (user_id + org_id), com nome,
conteúdo TipTap JSON e tipo opcional (note|tcd|study). Os modelos prontos
(TCD, S.O.A.P., culto...) ficam no cliente, via i18n — não estão aqui.

Idempotente: se o ``create_all`` já criou a tabela ou os índices, só o que
falta é criado.

Revision ID: cb2e4f5a6c7d
Revises: ca1d3e4f5b6c
Create Date: 2026-11-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel  # noqa: F401


# revision identifiers, used by Alembic.
revision: str = 'cb2e4f5a6c7d'
down_revision: Union[str, None] = 'ca1d3e4f5b6c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_TABLE = 'note_template'
_INDEXES = (
    ('ix_note_template_template_uuid', ['template_uuid'], True),
    ('ix_note_template_user_org', ['user_id', 'org_id'], False),
)


def upgrade() -> None:
    bind = op.get_bind()
    if _TABLE not in sa.inspect(bind).get_table_names():
        op.create_table(
            _TABLE,
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('template_uuid', sa.String(64), nullable=False),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
            sa.Column('org_id', sa.Integer(), sa.ForeignKey('organization.id', ondelete='CASCADE'), nullable=False),
            sa.Column('name', sa.String(120), nullable=False),
            sa.Column('content_json', sa.Text(), nullable=False, server_default=''),
            sa.Column('kind', sa.String(10), nullable=True),
            sa.Column('created_at', sa.String(40), nullable=False),
            sa.Column('updated_at', sa.String(40), nullable=False),
        )
    existing = {ix['name'] for ix in sa.inspect(bind).get_indexes(_TABLE)}
    for name, cols, unique in _INDEXES:
        if name not in existing:
            op.create_index(name, _TABLE, cols, unique=unique)


def downgrade() -> None:
    bind = op.get_bind()
    if _TABLE not in sa.inspect(bind).get_table_names():
        return
    existing = {ix['name'] for ix in sa.inspect(bind).get_indexes(_TABLE)}
    for name, _cols, _unique in _INDEXES:
        if name in existing:
            op.drop_index(name, table_name=_TABLE)
    op.drop_table(_TABLE)
