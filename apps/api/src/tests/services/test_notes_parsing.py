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


def test_markdown_export_editor_v2_nodes():
    """Imagem, vídeo, tarefas, destaque e tabela no .md exportado."""
    doc = json.dumps({"type": "doc", "content": [
        {"type": "image", "attrs": {"anexo": "noteatt_00000000-0000-0000-0000-000000000001", "alt": "Monte"}},
        {"type": "image", "attrs": {"src": "https://exemplo.org/a.png", "alt": "ext"}},
        {"type": "image", "attrs": {"src": "javascript:alert(1)", "alt": "x"}},
        {"type": "youtube", "attrs": {"src": "https://www.youtube.com/watch?v=abc"}},
        {"type": "vimeo", "attrs": {"id": "123456"}},
        {"type": "taskList", "content": [
            {"type": "taskItem", "attrs": {"checked": True}, "content": [
                {"type": "paragraph", "content": [{"type": "text", "text": "Ler Jo 3"}]}]},
            {"type": "taskItem", "attrs": {"checked": False}, "content": [
                {"type": "paragraph", "content": [{"type": "text", "text": "Orar"}]}]},
        ]},
        {"type": "callout", "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": "Deus é fiel"}]}]},
        {"type": "table", "content": [
            {"type": "tableRow", "content": [
                {"type": "tableHeader", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Livro"}]}]},
                {"type": "tableHeader", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Tema"}]}]},
            ]},
            {"type": "tableRow", "content": [
                {"type": "tableCell", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "João"}]}]},
                {"type": "tableCell", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "a|b"}]}]},
            ]},
        ]},
    ]})
    md = tiptap_to_markdown(doc)
    assert md == (
        "![Monte](caderno:anexo/noteatt_00000000-0000-0000-0000-000000000001)\n\n"
        "![ext](https://exemplo.org/a.png)\n\n"
        "https://www.youtube.com/watch?v=abc\n\n"
        "https://vimeo.com/123456\n\n"
        "- [x] Ler Jo 3\n- [ ] Orar\n\n"
        "> [!note]\n> Deus é fiel\n\n"
        "| Livro | Tema |\n| --- | --- |\n| João | a\\|b |\n"
    )
    text = tiptap_to_text(doc)
    assert "Ler Jo 3" in text and "Deus é fiel" in text and "João" in text


def test_markdown_export_marca_texto_e_cor():
    """Marca-texto vira ==texto== (verde) ou <mark data-cor>; cor vira <span data-cor>; fora da paleta, texto puro."""
    def t(text, *marks):
        return {"type": "text", "text": text, "marks": list(marks)}

    doc = _doc({"type": "paragraph", "content": [
        t("graça", {"type": "highlight", "attrs": {"cor": "verde"}}),
        {"type": "text", "text": " e "},
        t("fé", {"type": "highlight", "attrs": {"cor": "azul"}}),
        {"type": "text", "text": " e "},
        t("paz", {"type": "corTexto", "attrs": {"cor": "rosa"}}),
        {"type": "text", "text": " e "},
        t("amor", {"type": "bold"}, {"type": "highlight", "attrs": {"cor": "grafite"}}, {"type": "corTexto", "attrs": {"cor": "verde"}}),
        {"type": "text", "text": " e "},
        t("x", {"type": "corTexto", "attrs": {"cor": "red\" onclick=\"y"}}),
        t("z", {"type": "highlight", "attrs": {"cor": "dourado"}}),
    ]})
    md = tiptap_to_markdown(doc)
    assert md == (
        '==graça== e <mark data-cor="azul">fé</mark> e <span data-cor="rosa">paz</span> e '
        '<span data-cor="verde"><mark data-cor="grafite">**amor**</mark></span> e x==z==\n'
    )
