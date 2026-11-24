"""Migração e1b7c3d9a2f4 (destaques e favoritos do leitor): sobe, é
idempotente, desce e volta a subir (Alembic ``Operations`` num SQLite)."""

import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

_PATH = Path(__file__).resolve().parents[3] / "migrations" / "versions" / "e1b7c3d9a2f4_bible_verse_marks.py"


def _load():
    spec = importlib.util.spec_from_file_location("mig_e1b7c3d9a2f4", _PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _run(conn, fn):
    ctx = MigrationContext.configure(conn)
    with Operations.context(ctx):
        fn()


def test_upgrade_downgrade_roundtrip():
    mod = _load()
    assert mod.revision == "e1b7c3d9a2f4"
    assert mod.down_revision == "dd4e5f6a7b8c"
    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE user (id INTEGER PRIMARY KEY)"))
        conn.execute(sa.text("INSERT INTO user (id) VALUES (1)"))
        _run(conn, mod.upgrade)
        insp = sa.inspect(conn)
        assert "bible_verse_mark" in insp.get_table_names()
        cols = {c["name"] for c in insp.get_columns("bible_verse_mark")}
        assert cols == {"id", "user_id", "book", "chapter", "verse", "color", "favorite", "created_at", "updated_at"}
        idx = {i["name"] for i in insp.get_indexes("bible_verse_mark")}
        assert {"ix_bible_verse_mark_user_chapter", "ix_bible_verse_mark_user_updated"} <= idx
        conn.execute(sa.text("INSERT INTO bible_verse_mark (user_id, book, chapter, verse) VALUES (1, 'JHN', 3, 16)"))
        assert conn.execute(sa.text("SELECT favorite FROM bible_verse_mark")).scalar() in (0, False)

        _run(conn, mod.upgrade)  # idempotente
        assert conn.execute(sa.text("SELECT COUNT(*) FROM bible_verse_mark")).scalar() == 1

        _run(conn, mod.downgrade)
        assert "bible_verse_mark" not in sa.inspect(conn).get_table_names()
        _run(conn, mod.downgrade)  # descer de novo é inofensivo
        _run(conn, mod.upgrade)
        assert "bible_verse_mark" in sa.inspect(conn).get_table_names()
