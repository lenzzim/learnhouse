"""Caderno: funções puras de parse-on-save e exportação."""

import json

from src.services.notes.parsing import (
    extract_links,
    extract_tags,
    hash_token,
    rename_tag_in_content,
    tiptap_to_markdown,
    tiptap_to_text,
    validate_bible_refs,
)


def _doc(*blocks):
    return json.dumps({"type": "doc", "content": list(blocks)})


def _p(*texts):
    return {"type": "paragraph", "content": [{"type": "text", "text": t} for t in texts]}


class TestText:
    def test_blocks_joined_by_newline(self):
        doc = _doc(
            {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Leitura"}]},
            _p("Jo 3:16 ", "amor"),
        )
        assert tiptap_to_text(doc) == "Leitura\nJo 3:16 amor"

    def test_invalid_or_plain_text(self):
        assert tiptap_to_text("") == ""
        assert tiptap_to_text("texto solto") == "texto solto"
        assert tiptap_to_text("{quebrado") == "{quebrado"


class TestLinksAndTags:
    def test_links_with_alias_and_dedupe(self):
        text = "Veja [[Graça]] e [[graça|a graça]] e [[ Fé ]] e [[]]"
        assert extract_links(text) == ["Graça", "Fé"]

    def test_tags_unicode_not_in_links_or_urls(self):
        text = "#oração e #fé-viva, mas não [[#nada]] nem http://x.com/#ancora nem &#39; #1x"
        assert extract_tags(text) == ["oração", "fé-viva", "1x"]

    def test_tags_dedupe_case_insensitive(self):
        assert extract_tags("#Graça #graça") == ["Graça"]

    def test_rename_tag_in_content(self):
        doc = _doc(_p("Sobre #graca e #gracas"))
        out = rename_tag_in_content(doc, "graca", "graça")
        assert tiptap_to_text(out) == "Sobre #graça e #gracas"


class TestBibleRefs:
    def test_validates_and_dedupes(self):
        refs = [
            {"book": "JHN", "chapter": 3, "verse_start": 16, "verse_end": 18},
            {"book": "JHN", "chapter": 3, "verse_start": 16, "verse_end": 18},
            {"book": "XXX", "chapter": 1},
            {"book": "PSA", "chapter": 151},
            {"book": "GEN", "chapter": 1, "verse_start": 5, "verse_end": 2},
            {"book": "psa", "chapter": 23},
        ]
        out = validate_bible_refs(refs)
        assert out == [
            {"book": "JHN", "chapter": 3, "verse_start": 16, "verse_end": 18},
            {"book": "PSA", "chapter": 23, "verse_start": None, "verse_end": None},
        ]

    def test_max_200(self):
        refs = [{"book": "PSA", "chapter": c % 150 + 1, "verse_start": v} for c in range(150) for v in range(1, 4)]
        assert len(validate_bible_refs(refs)) == 200


class TestMarkdown:
    def test_export(self):
        doc = json.dumps({"type": "doc", "content": [
            {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Oração"}]},
            {"type": "paragraph", "content": [
                {"type": "text", "text": "Deus é "},
                {"type": "text", "text": "amor", "marks": [{"type": "bold"}]},
                {"type": "hardBreak"},
                {"type": "text", "text": "fim", "marks": [{"type": "italic"}]},
            ]},
            {"type": "bulletList", "content": [
                {"type": "listItem", "content": [_p("um")]},
                {"type": "listItem", "content": [_p("dois")]},
            ]},
            {"type": "orderedList", "content": [{"type": "listItem", "content": [_p("primeiro")]}]},
            {"type": "blockquote", "content": [_p("citação")]},
            {"type": "codeBlock", "content": [{"type": "text", "text": "x = 1"}]},
        ]})
        md = tiptap_to_markdown(doc)
        assert md == (
            "## Oração\n\nDeus é **amor**  \n*fim*\n\n- um\n- dois\n\n1. primeiro\n\n> citação\n\n```\nx = 1\n```\n"
        )


def test_hash_token_is_sha256_hex():
    h = hash_token("abc")
    assert len(h) == 64 and h == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
