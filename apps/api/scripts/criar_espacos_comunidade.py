#!/usr/bin/env python3
"""Cria os 4 espaços da comunidade (decisão N39), se ainda não existirem.

Opcional: o admin também pode criar pelo painel (Painel > Comunidades > Nova
comunidade). Este script só chama a API pública do LearnHouse com a sessão de
um admin; não mexe no banco direto e não cria nada que já exista (compara o
nome, sem diferenciar maiúsculas). Sem ``--aplicar``, só mostra o que faria.

Uso (de qualquer pasta, só com a biblioteca padrão do Python):

    LH_API=https://comunidade.discipulei.com/api/v1 \\
    LH_ORG_ID=1 \\
    LH_TOKEN=<access token de um admin> \\
    python apps/api/scripts/criar_espacos_comunidade.py            # simulação
    python apps/api/scripts/criar_espacos_comunidade.py --aplicar  # cria

O token é o ``access_token`` da sessão do admin (DevTools > Application >
Cookies, ou a resposta de /auth/login). Não deixe o token em arquivo.
"""

import json
import os
import sys
import urllib.error
import urllib.request

ESPACOS = [
    ("Dúvidas", "Perguntas sobre a Bíblia e a fé. Marque a resposta que mais ajudou."),
    ("Anotações de culto", "O que você anotou no culto ou na pregação desta semana."),
    ("Testemunhos", "O que Deus tem feito. Conte para encorajar alguém."),
    ("Pedidos de oração", "Peça oração e ore pelos outros. Toque em “Orando” para avisar."),
]


def _chamar(metodo: str, url: str, token: str, corpo=None):
    dados = json.dumps(corpo).encode("utf-8") if corpo is not None else None
    req = urllib.request.Request(url, data=dados, method=metodo)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8") or "null")


def main() -> int:
    api = os.environ.get("LH_API", "").rstrip("/")
    org_id = os.environ.get("LH_ORG_ID", "")
    token = os.environ.get("LH_TOKEN", "")
    aplicar = "--aplicar" in sys.argv
    if not api or not org_id or not token:
        print("Defina LH_API, LH_ORG_ID e LH_TOKEN (veja o topo do arquivo).")
        return 2

    try:
        existentes = _chamar("GET", f"{api}/communities/org/{org_id}/page/1/limit/100", token) or []
    except urllib.error.HTTPError as e:
        print(f"Não consegui listar as comunidades: HTTP {e.code}")
        return 1
    nomes = {(c.get("name") or "").strip().lower() for c in existentes}

    for nome, descricao in ESPACOS:
        if nome.lower() in nomes:
            print(f"= já existe: {nome}")
            continue
        if not aplicar:
            print(f"+ criaria: {nome}")
            continue
        try:
            criada = _chamar(
                "POST", f"{api}/communities/?org_id={org_id}", token,
                {"name": nome, "description": descricao, "public": True},
            )
            print(f"+ criada: {nome} ({criada.get('community_uuid')})")
        except urllib.error.HTTPError as e:
            print(f"! falhou: {nome}: HTTP {e.code}")
            return 1
    if not aplicar:
        print("Simulação. Rode de novo com --aplicar para criar.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
