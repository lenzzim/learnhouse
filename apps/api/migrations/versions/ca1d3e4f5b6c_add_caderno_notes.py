"""Caderno Bíblico: tabelas de notas pessoais

Cria as tabelas do caderno, separadas das discussions (uma nota privada
nunca aparece em tela antiga de comunidade):

- ``note_collection`` (grupos aninhados), ``note`` (nota/TCD/estudo, lixeira),
- ``note_tag`` + ``note_tag_map``, ``note_link`` (``[[ligações]]``/backlinks),
- ``note_bible_ref`` (versículos citados), ``note_share`` (link privado:
  token de 128 bits guardado só como hash SHA-256, com escopo, validade e
  revogação).

Só no PostgreSQL: tenta ``CREATE EXTENSION unaccent`` (num SAVEPOINT — sem
permissão, segue sem ela), cria o wrapper IMMUTABLE ``discipulei_unaccent``
(sem a extensão, o corpo vira ``lower($1)``) e o índice GIN de busca
full-text em português ``ix_note_fts``.

Idempotente: bancos criados pelo ``create_all`` já podem ter as tabelas;
só o que falta é criado.

Migração dos cadernos antigos (discussions com ``visibility='private'``):
NÃO é feita aqui. Os originais ficam intactos e a cópia para ``note`` é feita
por um destes caminhos (idempotentes, por ``legacy_discussion_id``):

- ``POST /api/v1/notes/migrate-legacy?org_id=...`` — a própria pessoa copia as
  suas notas (a interface chama ao abrir o caderno);
- ``uv run python cli.py migrate-notebook-to-notes`` — no servidor, copia de
  todas as pessoas, sem ninguém ler o conteúdo.

Revision ID: ca1d3e4f5b6c
Revises: c2d3e4f5a6b7
Create Date: 2026-11-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel  # noqa: F401


# revision identifiers, used by Alembic.
revision: str = 'ca1d3e4f5b6c'
down_revision: Union[str, None] = 'c2d3e4f5a6b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_FTS_INDEX = 'ix_note_fts'
_UNACCENT_FN = 'discipulei_unaccent'


def _tables(bind) -> set:
    return set(sa.inspect(bind).get_table_names())


def _indexes(bind, table: str) -> set:
    return {ix['name'] for ix in sa.inspect(bind).get_indexes(table)}


def _create_index(bind, name: str, table: str, cols, unique: bool = False) -> None:
    if name not in _indexes(bind, table):
        op.create_index(name, table, cols, unique=unique)


def upgrade() -> None:
    bind = op.get_bind()
    existing = _tables(bind)

    if 'note_collection' not in existing:
        op.create_table(
            'note_collection',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('collection_uuid', sa.String(64), nullable=False),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
            sa.Column('org_id', sa.Integer(), sa.ForeignKey('organization.id', ondelete='CASCADE'), nullable=False),
            sa.Column('name', sa.String(200), nullable=False),
            sa.Column('parent_id', sa.Integer(), sa.ForeignKey('note_collection.id', ondelete='SET NULL'), nullable=True),
            sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('created_at', sa.String(40), nullable=False),
            sa.Column('updated_at', sa.String(40), nullable=False),
        )
    _create_index(bind, 'ix_note_collection_collection_uuid', 'note_collection', ['collection_uuid'], unique=True)
    _create_index(bind, 'ix_note_collection_user_org', 'note_collection', ['user_id', 'org_id'])

    if 'note' not in existing:
        op.create_table(
            'note',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('note_uuid', sa.String(64), nullable=False),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
            sa.Column('org_id', sa.Integer(), sa.ForeignKey('organization.id', ondelete='CASCADE'), nullable=False),
            sa.Column('title', sa.String(300), nullable=False),
            sa.Column('content_json', sa.Text(), nullable=False),
            sa.Column('content_text', sa.Text(), nullable=False),
            sa.Column('kind', sa.String(10), nullable=False, server_default='note'),
            sa.Column('tcd_date', sa.String(10), nullable=True),
            sa.Column('collection_id', sa.Integer(), sa.ForeignKey('note_collection.id', ondelete='SET NULL'), nullable=True),
            sa.Column('visibility', sa.String(12), nullable=False, server_default='private'),
            sa.Column('published_discussion_id', sa.Integer(), sa.ForeignKey('discussion.id', ondelete='SET NULL'), nullable=True),
            sa.Column('legacy_discussion_id', sa.Integer(), nullable=True),
            sa.Column('created_at', sa.String(40), nullable=False),
            sa.Column('updated_at', sa.String(40), nullable=False),
            sa.Column('deleted_at', sa.String(40), nullable=True),
            sa.UniqueConstraint('user_id', 'org_id', 'tcd_date', name='uq_note_user_org_tcd_date'),
        )
    _create_index(bind, 'ix_note_note_uuid', 'note', ['note_uuid'], unique=True)
    _create_index(bind, 'ix_note_user_org_deleted', 'note', ['user_id', 'org_id', 'deleted_at'])
    _create_index(bind, 'ix_note_user_org_updated', 'note', ['user_id', 'org_id', 'updated_at'])

    if 'note_tag' not in existing:
        op.create_table(
            'note_tag',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('tag_uuid', sa.String(64), nullable=False),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
            sa.Column('org_id', sa.Integer(), sa.ForeignKey('organization.id', ondelete='CASCADE'), nullable=False),
            sa.Column('name', sa.String(60), nullable=False),
            sa.Column('name_lower', sa.String(60), nullable=False),
            sa.UniqueConstraint('user_id', 'org_id', 'name_lower', name='uq_note_tag_user_org_name'),
        )
    _create_index(bind, 'ix_note_tag_tag_uuid', 'note_tag', ['tag_uuid'], unique=True)

    if 'note_tag_map' not in existing:
        op.create_table(
            'note_tag_map',
            sa.Column('note_id', sa.Integer(), sa.ForeignKey('note.id', ondelete='CASCADE'), nullable=False),
            sa.Column('tag_id', sa.Integer(), sa.ForeignKey('note_tag.id', ondelete='CASCADE'), nullable=False),
            sa.PrimaryKeyConstraint('note_id', 'tag_id', name='pk_note_tag_map'),
        )
    _create_index(bind, 'ix_note_tag_map_tag_id', 'note_tag_map', ['tag_id'])

    if 'note_link' not in existing:
        op.create_table(
            'note_link',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('source_note_id', sa.Integer(), sa.ForeignKey('note.id', ondelete='CASCADE'), nullable=False),
            sa.Column('target_note_id', sa.Integer(), sa.ForeignKey('note.id', ondelete='SET NULL'), nullable=True),
            sa.Column('target_title', sa.String(300), nullable=False),
            sa.Column('target_title_lower', sa.String(300), nullable=False),
        )
    _create_index(bind, 'ix_note_link_source_note_id', 'note_link', ['source_note_id'])
    _create_index(bind, 'ix_note_link_target_note_id', 'note_link', ['target_note_id'])
    _create_index(bind, 'ix_note_link_target_title', 'note_link', ['target_title_lower'])

    if 'note_bible_ref' not in existing:
        op.create_table(
            'note_bible_ref',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('note_id', sa.Integer(), sa.ForeignKey('note.id', ondelete='CASCADE'), nullable=False),
            sa.Column('book', sa.String(3), nullable=False),
            sa.Column('chapter', sa.Integer(), nullable=False),
            sa.Column('verse_start', sa.Integer(), nullable=True),
            sa.Column('verse_end', sa.Integer(), nullable=True),
        )
    _create_index(bind, 'ix_note_bible_ref_note_id', 'note_bible_ref', ['note_id'])
    _create_index(bind, 'ix_note_bible_ref_book_chapter', 'note_bible_ref', ['book', 'chapter'])

    if 'note_share' not in existing:
        op.create_table(
            'note_share',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('share_uuid', sa.String(64), nullable=False),
            sa.Column('note_id', sa.Integer(), sa.ForeignKey('note.id', ondelete='CASCADE'), nullable=False),
            sa.Column('token_hash', sa.String(64), nullable=False),
            sa.Column('scope', sa.String(20), nullable=False),
            sa.Column('created_by', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
            sa.Column('created_at', sa.String(40), nullable=False),
            sa.Column('expires_at', sa.String(40), nullable=True),
            sa.Column('revoked_at', sa.String(40), nullable=True),
        )
    _create_index(bind, 'ix_note_share_share_uuid', 'note_share', ['share_uuid'], unique=True)
    _create_index(bind, 'ix_note_share_token_hash', 'note_share', ['token_hash'], unique=True)
    _create_index(bind, 'ix_note_share_note_id', 'note_share', ['note_id'])

    if bind.dialect.name == 'postgresql':
        _upgrade_postgres_search(bind)


def _upgrade_postgres_search(bind) -> None:
    """unaccent (se der), wrapper IMMUTABLE e índice GIN de busca em português."""
    has_unaccent = False
    try:
        with bind.begin_nested():
            bind.execute(sa.text('CREATE EXTENSION IF NOT EXISTS unaccent'))
        has_unaccent = True
    except Exception:  # sem permissão para criar a extensão: busca sem tirar acento
        has_unaccent = bool(bind.execute(sa.text(
            "SELECT 1 FROM pg_extension WHERE extname = 'unaccent'"
        )).scalar())

    if has_unaccent:
        body = "SELECT public.unaccent('public.unaccent'::regdictionary, $1)"
    else:
        body = 'SELECT lower($1)'
    bind.execute(sa.text(
        f'CREATE OR REPLACE FUNCTION {_UNACCENT_FN}(text) RETURNS text '
        f'LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $fn$ {body} $fn$'
    ))
    bind.execute(sa.text(
        f'CREATE INDEX IF NOT EXISTS {_FTS_INDEX} ON note USING gin '
        f"(to_tsvector('portuguese', {_UNACCENT_FN}(coalesce(title, '') || ' ' || coalesce(content_text, ''))))"
    ))


def downgrade() -> None:
    bind = op.get_bind()

    if bind.dialect.name == 'postgresql':
        bind.execute(sa.text(f'DROP INDEX IF EXISTS {_FTS_INDEX}'))
        bind.execute(sa.text(f'DROP FUNCTION IF EXISTS {_UNACCENT_FN}(text)'))

    for table in (
        'note_share',
        'note_bible_ref',
        'note_link',
        'note_tag_map',
        'note_tag',
        'note',
        'note_collection',
    ):
        if table in _tables(bind):
            op.drop_table(table)
