"""Busca bíblica: passagens citadas nas discussões e versículos das versões abertas

- ``discussion_bible_ref``: uma linha por passagem citada numa discussão
  (livro USFM, capítulo, verso inicial/final; nulos = capítulo inteiro), com
  FK em ``discussion`` (ON DELETE CASCADE) e índice (book, chapter,
  verse_start, verse_end) para a busca por passagem.
- ``bible_verse``: versículos das versões abertas (BLIVRE, ONBV, BPM, KJV, WEB,
  RV1909, VBL). No PostgreSQL, coluna ``tsv tsvector`` + índice GIN
  ``ix_bible_verse_tsv`` (dicionário do idioma da versão sobre
  ``discipulei_unaccent``, a função IMMUTABLE criada pela migração do Caderno;
  recriada aqui se faltar).

Os DADOS não são carregados aqui (a migração fica rápida e sem depender dos
JSON do front). Depois de ``alembic upgrade head``, rode no servidor:

    uv run python cli.py indexar-referencias-discussoes
    uv run python cli.py indexar-biblia --dados <apps/web/public/biblia-dados>

Os dois são idempotentes.

Idempotente: o ``create_all`` pode já ter criado as tabelas; só o que falta é
criado. O downgrade remove tudo que esta migração cria (não a função
``discipulei_unaccent``, que é do Caderno).

Revision ID: e3a4b5c6d7e8
Revises: dd4e5f6a7b8c
Create Date: 2026-11-24

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel  # noqa: F401


# revision identifiers, used by Alembic.
revision: str = 'e3a4b5c6d7e8'
down_revision: Union[str, None] = 'dd4e5f6a7b8c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UNACCENT_FN = 'discipulei_unaccent'
_TSV_INDEX = 'ix_bible_verse_tsv'


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

    if 'discussion_bible_ref' not in existing:
        op.create_table(
            'discussion_bible_ref',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('discussion_id', sa.Integer(), sa.ForeignKey('discussion.id', ondelete='CASCADE'), nullable=False),
            sa.Column('org_id', sa.Integer(), nullable=False),
            sa.Column('book', sa.String(3), nullable=False),
            sa.Column('chapter', sa.Integer(), nullable=False),
            sa.Column('verse_start', sa.Integer(), nullable=True),
            sa.Column('verse_end', sa.Integer(), nullable=True),
            sa.Column('trecho', sa.String(80), nullable=False, server_default=''),
        )
    _create_index(bind, 'ix_discussion_bible_ref_discussion_id', 'discussion_bible_ref', ['discussion_id'])
    _create_index(
        bind, 'ix_discussion_bible_ref_passagem', 'discussion_bible_ref',
        ['book', 'chapter', 'verse_start', 'verse_end'],
    )

    if 'bible_verse' not in existing:
        op.create_table(
            'bible_verse',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('version', sa.String(12), nullable=False),
            sa.Column('book', sa.String(3), nullable=False),
            sa.Column('book_order', sa.Integer(), nullable=False),
            sa.Column('chapter', sa.Integer(), nullable=False),
            sa.Column('verse', sa.Integer(), nullable=False),
            sa.Column('text', sa.Text(), nullable=False),
            sa.UniqueConstraint('version', 'book', 'chapter', 'verse', name='uq_bible_verse_ref'),
        )
    _create_index(bind, 'ix_bible_verse_ordem', 'bible_verse', ['version', 'book_order', 'chapter', 'verse'])

    if bind.dialect.name == 'postgresql':
        _upgrade_postgres(bind)


def _upgrade_postgres(bind) -> None:
    has_fn = bool(bind.execute(sa.text(
        "SELECT 1 FROM pg_proc WHERE proname = :n"
    ), {'n': _UNACCENT_FN}).scalar())
    if not has_fn:
        has_unaccent = False
        try:
            with bind.begin_nested():
                bind.execute(sa.text('CREATE EXTENSION IF NOT EXISTS unaccent'))
            has_unaccent = True
        except Exception:  # sem permissão: busca sem tirar acento
            has_unaccent = bool(bind.execute(sa.text(
                "SELECT 1 FROM pg_extension WHERE extname = 'unaccent'"
            )).scalar())
        body = (
            "SELECT public.unaccent('public.unaccent'::regdictionary, $1)"
            if has_unaccent else 'SELECT lower($1)'
        )
        bind.execute(sa.text(
            f'CREATE OR REPLACE FUNCTION {_UNACCENT_FN}(text) RETURNS text '
            f'LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $fn$ {body} $fn$'
        ))
    bind.execute(sa.text('ALTER TABLE bible_verse ADD COLUMN IF NOT EXISTS tsv tsvector'))
    bind.execute(sa.text(f'CREATE INDEX IF NOT EXISTS {_TSV_INDEX} ON bible_verse USING gin (tsv)'))


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == 'postgresql':
        bind.execute(sa.text(f'DROP INDEX IF EXISTS {_TSV_INDEX}'))
    for table in ('bible_verse', 'discussion_bible_ref'):
        if table in _tables(bind):
            op.drop_table(table)
