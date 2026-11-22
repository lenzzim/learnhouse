"""Propriedades das notas (metadados estilo Obsidian) — funções puras.

Uma nota guarda ``properties`` como lista ordenada de pares
``{"key": ..., "value": ...}``. Aqui ficam a validação/normalização, o
frontmatter YAML da exportação ``.md`` e um leitor simples de frontmatter
(espelho do leitor do cliente, ``lib/caderno/frontmatter.ts``).

Sem dependência nova: o YAML aceito é o subconjunto que o Obsidian grava para
propriedades simples (``chave: valor``, listas ``- item`` e ``[a, b]``).
Nada aqui toca banco nem loga conteúdo.
"""

import re
from typing import Any, Iterable, List, Optional, Tuple

from fastapi import HTTPException

from src.db.notes import PROPERTIES_MAX, PROPERTY_KEY_MAX, PROPERTY_VALUE_MAX

# Chaves sugeridas pela interface (a pessoa pode criar outras).
KNOWN_KEYS = ("tipo", "livro", "tema", "autor", "data", "status")

_KEY_RE = re.compile(r"^[\wÀ-ÿ][\w À-ÿ\-]*$", re.UNICODE)
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")


def _clean_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        value = ", ".join(str(v).strip() for v in value if str(v).strip())
    text = _CONTROL_RE.sub("", str(value)).replace("\n", " ").strip()
    return text


def normalize_properties(items: Optional[Iterable[Any]]) -> List[dict]:
    """Valida e normaliza a lista vinda do cliente.

    - chave: 1..40 caracteres (letras, números, espaço, ``_`` e ``-``);
    - valor: texto de até 200 caracteres (listas viram "a, b");
    - chaves repetidas (sem diferenciar caixa) ficam só na primeira;
    - até 30 propriedades.
    Chave inválida ou excesso → 422 (é erro de quem chamou, não do conteúdo).
    """
    out: List[dict] = []
    seen = set()
    for item in items or []:
        if hasattr(item, "model_dump"):
            item = item.model_dump()
        if not isinstance(item, dict):
            raise HTTPException(status_code=422, detail="Invalid property")
        key = _CONTROL_RE.sub("", str(item.get("key") or "")).strip()
        if not key or len(key) > PROPERTY_KEY_MAX or not _KEY_RE.match(key):
            raise HTTPException(status_code=422, detail="Invalid property key")
        value = _clean_value(item.get("value"))
        if len(value) > PROPERTY_VALUE_MAX:
            raise HTTPException(status_code=422, detail=f"Property value too long (max {PROPERTY_VALUE_MAX})")
        lower = key.lower()
        if lower in seen:
            continue
        seen.add(lower)
        out.append({"key": key, "value": value})
    if len(out) > PROPERTIES_MAX:
        raise HTTPException(status_code=422, detail=f"Too many properties (max {PROPERTIES_MAX})")
    return out


def index_rows(properties: Optional[List[dict]]) -> List[Tuple[str, str, str]]:
    """(key_lower, value, value_lower) para o índice ``note_property``.

    Valores separados por vírgula viram uma linha cada ("graça, fé" filtra
    por "graça" e por "fé"); o valor inteiro também entra.
    """
    rows: List[Tuple[str, str, str]] = []
    seen = set()
    for p in properties or []:
        key = str(p.get("key") or "").strip().lower()
        value = str(p.get("value") or "").strip()
        if not key or not value:
            continue
        parts = [value] + [v.strip() for v in value.split(",") if v.strip()]
        for v in parts:
            item = (key, v[:PROPERTY_VALUE_MAX], v[:PROPERTY_VALUE_MAX].lower())
            if (item[0], item[2]) in seen:
                continue
            seen.add((item[0], item[2]))
            rows.append(item)
    return rows


# ---------------------------------------------------------------------------
# Frontmatter YAML
# ---------------------------------------------------------------------------

_PLAIN_SAFE = re.compile(r"^[^\s\-?:,\[\]{}#&*!|>'\"%@`][^:#]*$")
_YAML_RESERVED = {"true", "false", "yes", "no", "on", "off", "null", "~"}


def _yaml_scalar(value: str) -> str:
    """Escalar YAML: sem aspas quando é seguro, senão entre aspas duplas."""
    if value == "":
        return '""'
    looks_number = re.fullmatch(r"[-+]?\d+(\.\d+)?", value) is not None
    if (
        _PLAIN_SAFE.match(value)
        and value == value.strip()
        and value.lower() not in _YAML_RESERVED
        and not looks_number
        and ": " not in value
        and " #" not in value
    ):
        return value
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def _yaml_key(key: str) -> str:
    return key if re.fullmatch(r"[\wÀ-ÿ][\wÀ-ÿ\-]*", key) else _yaml_scalar(key)


def properties_to_frontmatter(properties: Optional[List[dict]]) -> str:
    """``---\\nchave: valor\\n---\\n`` (vazio se não houver propriedades).

    Datas ``AAAA-MM-DD`` saem sem aspas (o Obsidian as reconhece como data).
    """
    lines = []
    for p in properties or []:
        key = str(p.get("key") or "").strip()
        if not key:
            continue
        value = str(p.get("value") or "")
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            lines.append(f"{_yaml_key(key)}: {value}")
        else:
            lines.append(f"{_yaml_key(key)}: {_yaml_scalar(value)}")
    if not lines:
        return ""
    return "---\n" + "\n".join(lines) + "\n---\n"


def _unquote(raw: str) -> str:
    raw = raw.strip()
    if len(raw) >= 2 and raw[0] == raw[-1] == '"':
        inner = raw[1:-1]
        return re.sub(r'\\(["\\])', r"\1", inner)
    if len(raw) >= 2 and raw[0] == raw[-1] == "'":
        return raw[1:-1].replace("''", "'")
    # comentário no fim da linha
    return re.sub(r"\s+#.*$", "", raw).strip()


def frontmatter_to_properties(markdown: str) -> Tuple[List[dict], str]:
    """Lê o frontmatter do topo do markdown → (propriedades, corpo sem ele).

    Subconjunto do YAML: ``chave: valor``, aspas simples/duplas, listas
    ``[a, b]`` e listas em bloco (``- item``). Estruturas aninhadas são
    ignoradas. Markdown sem frontmatter volta intacto.
    """
    text = (markdown or "").lstrip("﻿")
    m = re.match(r"^---\r?\n(.*?)\r?\n---[ \t]*(?:\r?\n|$)", text, re.S)
    if not m:
        return [], markdown or ""
    body = text[m.end():]
    props: List[dict] = []
    current_key: Optional[str] = None
    current_list: List[str] = []

    def flush():
        nonlocal current_key, current_list
        if current_key is not None:
            props.append({"key": current_key, "value": ", ".join(current_list)})
        current_key, current_list = None, []

    for line in m.group(1).splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        item = re.match(r"^\s+-\s*(.*)$", line) or re.match(r"^-\s+(.*)$", line)
        if item and current_key is not None:
            value = _unquote(item.group(1))
            if value:
                current_list.append(value)
            continue
        kv = re.match(r"^([^\s:#][^:]*?)\s*:\s*(.*)$", line)
        if not kv or line[:1].isspace():
            continue
        flush()
        key = _unquote(kv.group(1))
        raw = kv.group(2).strip()
        if raw == "":
            current_key, current_list = key, []
            continue
        if raw.startswith("[") and raw.endswith("]"):
            values = [_unquote(v) for v in raw[1:-1].split(",")]
            props.append({"key": key, "value": ", ".join(v for v in values if v)})
            continue
        props.append({"key": key, "value": _unquote(raw)})
    flush()
    # descarta chaves inválidas em vez de falhar a importação inteira
    valid = []
    seen = set()
    for p in props:
        key = p["key"].strip()[:PROPERTY_KEY_MAX]
        if not key or not _KEY_RE.match(key) or key.lower() in seen:
            continue
        seen.add(key.lower())
        valid.append({"key": key, "value": _clean_value(p["value"])[:PROPERTY_VALUE_MAX]})
    return valid[:PROPERTIES_MAX], body
