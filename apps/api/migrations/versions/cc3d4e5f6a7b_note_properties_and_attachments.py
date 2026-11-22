"""Caderno Bíblico: propriedades das notas e imagens anexadas

- ``note.properties`` e ``note_template.properties``: lista ordenada de
  pares ``{"key", "value"}`` (metadados estilo Obsidian: tipo, livro, tema...),
  JSONB no Postgres;
- ``note_property``: índice das propriedades para filtrar a lista de notas;
- ``note_attachment``: imagens das notas, guardadas fora da pasta de conteúdo
  pública (``scope='note'``, privadas ao dono) e as cópias feitas ao publicar
  na comunidade (``scope='discussion'``).

Idempotente: se o ``create_all`` já criou colunas, tabelas ou índices, só o
que falta é criado. O downgrade remove tudo (os arquivos das imagens ficam no
armazenamento; apagar a pasta ``note_media`` é manual).

Revision ID: cc3d4e5f6a7b
Revises: cb2e4f5a6c7d
Create Date: 2026-11-22

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import sqlmodel  # noqa: F401


# revision identifiers, used by Alembic.
revision: str = 'cc3d4e5f6a7b'
down_revision: Union[str, None] = 'cb2e4f5a6c7d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_PROPERTY_COLUMNS = ('note', 'note_template')

_INDEXES = {
    'note_property': (
        ('ix_note_property_note_id', ['note_id'], False),
        ('ix_note_property_key_value', ['key_lower', 'value_lower'], False),
    ),
    'note_attachment': (
        ('ix_note_attachment_attachment_uuid', ['attachment_uuid'], True),
        ('ix_note_attachment_note_id', ['note_id'], False),
        ('ix_note_attachment_discussion_id', ['discussion_id'], False),
        ('ix_note_attachment_user_scope', ['user_id', 'scope'], False),
    ),
}


def _json_type(bind):
    return postgresql.JSONB() if bind.dialect.name == 'postgresql' else sa.JSON()


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    for table in _PROPERTY_COLUMNS:
        if table not in tables:
            continue
        cols = {c['name'] for c in inspector.get_columns(table)}
        if 'properties' not in cols:
            op.add_column(
                table,
                sa.Column('properties', _json_type(bind), nullable=False, server_default=sa.text("'[]'")),
            )

    if 'note_property' not in tables:
        op.create_table(
            'note_property',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('note_id', sa.Integer(), sa.ForeignKey('note.id', ondelete='CASCADE'), nullable=False),
            sa.Column('key_lower', sa.String(40), nullable=False),
            sa.Column('value', sa.String(200), nullable=False, server_default=''),
            sa.Column('value_lower', sa.String(200), nullable=False, server_default=''),
        )

    if 'note_attachment' not in tables:
        op.create_table(
            'note_attachment',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('attachment_uuid', sa.String(64), nullable=False),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
            sa.Column('org_id', sa.Integer(), sa.ForeignKey('organization.id', ondelete='CASCADE'), nullable=False),
            sa.Column('scope', sa.String(12), nullable=False, server_default='note'),
            sa.Column('note_id', sa.Integer(), sa.ForeignKey('note.id', ondelete='SET NULL'), nullable=True),
            sa.Column('discussion_id', sa.Integer(), sa.ForeignKey('discussion.id', ondelete='SET NULL'),
                      nullable=True),
            sa.Column('storage_key', sa.String(200), nullable=False),
            sa.Column('mime', sa.String(40), nullable=False),
            sa.Column('size', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('width', sa.Integer(), nullable=True),
            sa.Column('height', sa.Integer(), nullable=True),
            sa.Column('created_at', sa.String(40), nullable=False),
        )

    inspector = sa.inspect(bind)
    for table, indexes in _INDEXES.items():
        existing = {ix['name'] for ix in inspector.get_indexes(table)}
        for name, cols, unique in indexes:
            if name not in existing:
                op.create_index(name, table, cols, unique=unique)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    for table, indexes in _INDEXES.items():
        if table not in tables:
            continue
        existing = {ix['name'] for ix in inspector.get_indexes(table)}
        for name, _cols, _unique in indexes:
            if name in existing:
                op.drop_index(name, table_name=table)
        op.drop_table(table)

    for table in _PROPERTY_COLUMNS:
        if table not in tables:
            continue
        cols = {c['name'] for c in inspector.get_columns(table)}
        if 'properties' in cols:
            with op.batch_alter_table(table) as batch:
                batch.drop_column('properties')
