"""Funções puras do caderno: texto do TipTap, [[ligações]], #tags,
referências bíblicas, exportação em Markdown e hash de token.

Nada aqui toca banco nem loga conteúdo.
"""

import hashlib
import json
import re
from typing import Any, Iterable, List, Optional

# Os 66 livros (códigos USFM), na ordem canônica protestante.
USFM_BOOKS = (
    "GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO "
    "ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL "
    "MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB "
    "JAS 1PE 2PE 1JN 2JN 3JN JUD REV"
).split()
_USFM_SET = frozenset(USFM_BOOKS)
MAX_REFS = 200

_BLOCK_TYPES = {
    "paragraph", "heading", "blockquote", "codeBlock", "listItem", "bulletList",
    "orderedList", "taskList", "taskItem", "horizontalRule", "table", "tableRow",
    "tableCell", "tableHeader", "callout", "image", "youtube", "vimeo",
}

_LINK_RE = re.compile(r"\[\[([^\[\]\n]{0,300})\]\]")
_TAG_RE = re.compile(r"(?<![\w&/#])#([\wÀ-ÿ][\w\-/À-ÿ]{0,49})", re.UNICODE)


def parse_doc(content_json: str) -> Optional[dict]:
    """JSON do TipTap → dict (``None`` se vazio, inválido ou não for um doc)."""
    if not content_json:
        return None
    try:
        doc = json.loads(content_json)
    except (ValueError, TypeError):
        return None
    if isinstance(doc, dict) and doc.get("type") == "doc":
        return doc
    return None


def _inline_text(node: dict) -> str:
    if node.get("type") == "text":
        return node.get("text") or ""
    if node.get("type") == "hardBreak":
        return "\n"
    return "".join(_inline_text(c) for c in node.get("content") or [] if isinstance(c, dict))


def _collect_blocks(node: dict, out: List[str]) -> None:
    children = [c for c in node.get("content") or [] if isinstance(c, dict)]
    has_block_child = any(c.get("type") in _BLOCK_TYPES for c in children)
    if node.get("type") != "doc" and not has_block_child:
        out.append(_inline_text(node))
        return
    for child in children:
        if child.get("type") in _BLOCK_TYPES or child.get("content"):
            _collect_blocks(child, out)
        else:
            text = _inline_text(child)
            if text:
                out.append(text)


def tiptap_to_text(content_json: str) -> str:
    """Texto puro (blocos separados por quebra de linha). Texto que não é doc
    do TipTap volta como está."""
    doc = parse_doc(content_json)
    if doc is None:
        return content_json or ""
    blocks: List[str] = []
    _collect_blocks(doc, blocks)
    return "\n".join(b for b in blocks if b != "")


def extract_links(text: str) -> List[str]:
    """Títulos de ``[[Título]]`` / ``[[Título|apelido]]``, sem repetir (sem caixa)."""
    seen = set()
    out: List[str] = []
    for m in _LINK_RE.finditer(text or ""):
        title = m.group(1).split("|", 1)[0].strip()
        if not title:
            continue
        title = title[:300]
        key = title.lower()
        if key not in seen:
            seen.add(key)
            out.append(title)
    return out


def extract_tags(text: str) -> List[str]:
    """``#tags`` fora de ``[[...]]`` e de URLs/entidades, sem repetir (sem caixa)."""
    cleaned = _LINK_RE.sub(" ", text or "")
    seen = set()
    out: List[str] = []
    for m in _TAG_RE.finditer(cleaned):
        tag = m.group(1).rstrip("-/")
        if not tag:
            continue
        key = tag.lower()
        if key not in seen:
            seen.add(key)
            out.append(tag)
    return out


def _tag_pattern(old: str) -> re.Pattern:
    return re.compile(r"(?<![\w&/#])#" + re.escape(old) + r"(?![\w\-/À-ÿ])", re.IGNORECASE | re.UNICODE)


def rename_tag_in_text(text: str, old: str, new: str) -> str:
    return _tag_pattern(old).sub("#" + new, text or "")


def rename_tag_in_content(content_json: str, old: str, new: str) -> str:
    """Troca ``#old`` por ``#new`` nos nós de texto (ou no texto puro)."""
    doc = parse_doc(content_json)
    if doc is None:
        return rename_tag_in_text(content_json, old, new)
    pattern = _tag_pattern(old)

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            if node.get("type") == "text" and isinstance(node.get("text"), str):
                node["text"] = pattern.sub("#" + new, node["text"])
            for c in node.get("content") or []:
                walk(c)

    walk(doc)
    return json.dumps(doc, ensure_ascii=False)


def validate_bible_refs(refs: Iterable[Any]) -> List[dict]:
    """Valida e deduplica referências vindas do cliente; inválidas são descartadas."""
    out: List[dict] = []
    seen = set()
    for ref in refs or []:
        if hasattr(ref, "model_dump"):
            ref = ref.model_dump()
        if not isinstance(ref, dict):
            continue
        book = str(ref.get("book") or "").upper()
        chapter = ref.get("chapter")
        vs = ref.get("verse_start")
        ve = ref.get("verse_end")
        if book not in _USFM_SET:
            continue
        if not isinstance(chapter, int) or isinstance(chapter, bool) or not 1 <= chapter <= 150:
            continue
        if vs is not None and (not isinstance(vs, int) or not 1 <= vs <= 176):
            continue
        if ve is not None:
            if vs is None or not isinstance(ve, int) or not 1 <= ve <= 176 or ve < vs:
                continue
        key = (book, chapter, vs, ve)
        if key in seen:
            continue
        seen.add(key)
        out.append({"book": book, "chapter": chapter, "verse_start": vs, "verse_end": ve})
        if len(out) >= MAX_REFS:
            break
    return out


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Markdown
# ---------------------------------------------------------------------------


CORES_CADERNO = ("verde", "azul", "rosa", "grafite")
COR_MARCA_PADRAO = "verde"


def _md_inline(nodes: List[dict]) -> str:
    out = []
    for n in nodes or []:
        if not isinstance(n, dict):
            continue
        t = n.get("type")
        if t == "hardBreak":
            out.append("  \n")
            continue
        if t != "text":
            out.append(_md_inline(n.get("content") or []))
            continue
        text = n.get("text") or ""
        marks = {m.get("type"): m for m in n.get("marks") or [] if isinstance(m, dict)}
        if "code" in marks:
            text = f"`{text}`"
        if "bold" in marks:
            text = f"**{text}**"
        if "italic" in marks:
            text = f"*{text}*"
        if "strike" in marks:
            text = f"~~{text}~~"
        # Marca-texto e cor do texto do Caderno: só os tons da paleta
        # (apps/web/lib/caderno/cores.ts). ==texto== é o marca-texto do
        # Obsidian (tom padrão, verde); outro tom e a cor usam HTML com data-cor.
        if "highlight" in marks:
            cor = (marks["highlight"].get("attrs") or {}).get("cor")
            if cor in CORES_CADERNO and cor != COR_MARCA_PADRAO:
                text = f'<mark data-cor="{cor}">{text}</mark>'
            else:
                text = f"=={text}=="
        if "corTexto" in marks:
            cor = (marks["corTexto"].get("attrs") or {}).get("cor")
            if cor in CORES_CADERNO:
                text = f'<span data-cor="{cor}">{text}</span>'
        if "link" in marks and (marks["link"].get("attrs") or {}).get("href"):
            text = f"[{text}]({marks['link']['attrs']['href']})"
        out.append(text)
    return "".join(out)


def _md_cell(cell: dict) -> str:
    parts = []
    for child in cell.get("content") or []:
        if isinstance(child, dict):
            parts.append(" ".join(_md_block(child)).strip())
    return " ".join(p for p in parts if p).replace("|", r"\|")


def _md_table(node: dict, indent: str) -> List[str]:
    rows = [r for r in node.get("content") or [] if isinstance(r, dict)]
    grid = [[_md_cell(c) for c in r.get("content") or [] if isinstance(c, dict)] for r in rows]
    grid = [r for r in grid if r]
    if not grid:
        return []
    width = max(len(r) for r in grid)
    grid = [r + [""] * (width - len(r)) for r in grid]
    lines = ["| " + " | ".join(grid[0]) + " |", "| " + " | ".join(["---"] * width) + " |"]
    lines += ["| " + " | ".join(r) + " |" for r in grid[1:]]
    return [indent + line for line in lines]


def _md_block(node: dict, indent: str = "") -> List[str]:
    """Linhas de um bloco (sem a linha em branco de separação)."""
    t = node.get("type")
    content = [c for c in node.get("content") or [] if isinstance(c, dict)]
    attrs = node.get("attrs") or {}
    if t == "image":
        alt = str(attrs.get("alt") or "").replace("]", "")
        if attrs.get("anexo"):
            # imagem privada do Caderno: só reabre na conta de quem escreveu
            return [indent + f"![{alt}](caderno:anexo/{attrs['anexo']})"]
        src = str(attrs.get("src") or "")
        return [indent + f"![{alt}]({src})"] if src.startswith("https://") else []
    if t == "youtube":
        src = str(attrs.get("src") or "")
        return [indent + src] if src.startswith("https://") else []
    if t == "vimeo":
        vid = str(attrs.get("id") or "")
        return [indent + f"https://vimeo.com/{vid}"] if vid.isdigit() else []
    if t == "callout":
        lines = ["> [!note]"]
        for child in content:
            lines.extend("> " + line if line else ">" for line in _md_block(child))
        return [indent + line for line in lines]
    if t == "table":
        return _md_table(node, indent)
    if t == "heading":
        level = int((node.get("attrs") or {}).get("level") or 1)
        return [indent + "#" * max(1, min(level, 6)) + " " + _md_inline(content)]
    if t == "paragraph":
        return [indent + line for line in _md_inline(content).split("\n")] if content else [indent]
    if t == "codeBlock":
        code = "".join(c.get("text") or "" for c in content)
        return [indent + "```", *[indent + line for line in code.split("\n")], indent + "```"]
    if t == "blockquote":
        lines: List[str] = []
        for i, child in enumerate(content):
            if i:
                lines.append(">")
            lines.extend("> " + line if line else ">" for line in _md_block(child))
        return [indent + line for line in lines]
    if t in ("bulletList", "orderedList", "taskList"):
        lines = []
        for i, item in enumerate(content, start=1):
            marker = f"{i}. " if t == "orderedList" else "- "
            if t == "taskList":
                marker = "- [x] " if (item.get("attrs") or {}).get("checked") else "- [ ] "
            item_children = [c for c in item.get("content") or [] if isinstance(c, dict)]
            first = True
            for child in item_children:
                child_lines = _md_block(child)
                for line in child_lines:
                    if first:
                        lines.append(indent + marker + line)
                        first = False
                    else:
                        lines.append(indent + " " * len(marker) + line)
            if first:
                lines.append(indent + marker.rstrip())
        return lines
    if t == "horizontalRule":
        return [indent + "---"]
    if content and any(c.get("type") != "text" and c.get("type") != "hardBreak" for c in content):
        lines = []
        for child in content:
            lines.extend(_md_block(child, indent))
        return lines
    return [indent + _md_inline(content)] if content else []


def tiptap_to_markdown(content_json: str) -> str:
    doc = parse_doc(content_json)
    if doc is None:
        text = (content_json or "").strip()
        return text + "\n" if text else ""
    blocks = []
    for child in doc.get("content") or []:
        if isinstance(child, dict):
            lines = _md_block(child)
            if lines:
                blocks.append("\n".join(lines))
    body = "\n\n".join(blocks).strip("\n")
    return body + "\n" if body else ""
