"""Migração cc3d4e5f6a7b (propriedades + anexos do Caderno): sobe, é
idempotente, desce e volta a subir.

Roda a migração de verdade (Alembic ``Operations``) num SQLite com as tabelas
anteriores mínimas; o Postgres usa JSONB no lugar do JSON.
"""

import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

_PATH = Path(__file__).resolve().parents[3] / "migrations" / "versions" / "cc3d4e5f6a7b_note_properties_and_attachments.py"


def _load():
    spec = importlib.util.spec_from_file_location("mig_cc3d4e5f6a7b", _PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _base_schema(conn):
    for ddl in (
        "CREATE TABLE user (id INTEGER PRIMARY KEY)",
        "CREATE TABLE organization (id INTEGER PRIMARY KEY)",
        "CREATE TABLE discussion (id INTEGER PRIMARY KEY)",
        "CREATE TABLE note (id INTEGER PRIMARY KEY, title VARCHAR(300) NOT NULL DEFAULT '')",
        "CREATE TABLE note_template (id INTEGER PRIMARY KEY, name VARCHAR(120) NOT NULL)",
        "INSERT INTO note (id, title) VALUES (1, 'antiga')",
        "INSERT INTO note_template (id, name) VALUES (1, 'modelo')",
    ):
        conn.execute(sa.text(ddl))


def _run(conn, fn):
    ctx = MigrationContext.configure(conn)
    with Operations.context(ctx):
        fn()


def test_upgrade_downgrade_roundtrip():
    mod = _load()
    assert mod.down_revision == "cb2e4f5a6c7d"
    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        _base_schema(conn)
        _run(conn, mod.upgrade)
        insp = sa.inspect(conn)
        assert {"note_property", "note_attachment"} <= set(insp.get_table_names())
        assert "properties" in {c["name"] for c in insp.get_columns("note")}
        assert "properties" in {c["name"] for c in insp.get_columns("note_template")}
        idx = {i["name"] for i in insp.get_indexes("note_attachment")}
        assert {"ix_note_attachment_attachment_uuid", "ix_note_attachment_user_scope"} <= idx
        # linhas antigas recebem a lista vazia
        assert conn.execute(sa.text("SELECT properties FROM note WHERE id = 1")).scalar() == "[]"

        # idempotente: rodar de novo não quebra nem duplica
        _run(conn, mod.upgrade)

        _run(conn, mod.downgrade)
        insp = sa.inspect(conn)
        assert "note_property" not in insp.get_table_names()
        assert "note_attachment" not in insp.get_table_names()
        assert "properties" not in {c["name"] for c in insp.get_columns("note")}
        assert "properties" not in {c["name"] for c in insp.get_columns("note_template")}
        # dados anteriores intactos
        assert conn.execute(sa.text("SELECT title FROM note WHERE id = 1")).scalar() == "antiga"

        # descer de novo é inofensivo; subir de novo funciona
        _run(conn, mod.downgrade)
        _run(conn, mod.upgrade)
        assert "note_attachment" in sa.inspect(conn).get_table_names()


def test_postgres_uses_jsonb():
    mod = _load()

    class _Bind:
        class dialect:
            name = "postgresql"

    from sqlalchemy.dialects import postgresql

    assert isinstance(mod._json_type(_Bind()), postgresql.JSONB)
