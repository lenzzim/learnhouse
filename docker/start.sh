#!/bin/sh

# Set environment variables for proper Python logging
export PYTHONUNBUFFERED=1
export PYTHONIOENCODING=utf-8

# Wait for database and redis if connection strings point to external services
# (In docker-compose, depends_on handles this, but useful for standalone)
if [ -n "$LEARNHOUSE_SQL_CONNECTION_STRING" ]; then
    DB_HOST=$(echo "$LEARNHOUSE_SQL_CONNECTION_STRING" | sed -n 's/.*@\([^:]*\):\([0-9]*\)\/.*/\1/p')
    if [ -n "$DB_HOST" ] && [ "$DB_HOST" != "localhost" ] && [ "$DB_HOST" != "127.0.0.1" ] && [ "$DB_HOST" != "db" ]; then
        echo "Waiting for external database at $DB_HOST..."
        timeout 30 sh -c 'until nc -z '"$DB_HOST"' 5432; do sleep 1; done' || true
    fi
fi

# Discipulei: aplica as migrações do banco antes de subir a API.
# O LearnHouse original pede para rodar o Alembic à mão a cada atualização;
# esquecer isso derrubou as discussões em produção (coluna `visibility`
# ausente). Só migra se o banco já tem versão registrada no Alembic; um banco
# sem versão (instalação nova, tabelas criadas pelo próprio app) é pulado com
# aviso, para não tentar recriar tabelas existentes. Falha não impede a
# subida: fica no log para alguém olhar.
if [ -x /app/api/.venv/bin/alembic ]; then
    ATUAL=$(cd /app/api && .venv/bin/alembic current 2>/dev/null | grep -Eo '^[0-9a-f]{12}' | head -1)
    if [ -n "$ATUAL" ]; then
        echo "Migrações: banco em $ATUAL, aplicando até a head..."
        (cd /app/api && .venv/bin/alembic upgrade head) || echo "AVISO: migração automática falhou; veja o log acima."
        # Busca por passagem: quando a versão do banco mudou (ex.: chegada da
        # v5), refaz o índice de referências das discussões públicas. É
        # idempotente e leve (só lê título e texto); tem limite de tempo e
        # nunca impede a subida. A Bíblia (indexar-biblia) é pesada e fica manual.
        NOVA=$(cd /app/api && .venv/bin/alembic current 2>/dev/null | grep -Eo '^[0-9a-f]{12}' | head -1)
        if [ -n "$NOVA" ] && [ "$NOVA" != "$ATUAL" ]; then
            echo "Busca: banco mudou de $ATUAL para $NOVA, indexando referências das discussões..."
            (cd /app/api && timeout 180 .venv/bin/python cli.py indexar-referencias-discussoes)                 || echo "AVISO: indexação das referências falhou; rode cli.py indexar-referencias-discussoes à mão."
        fi
    else
        echo "AVISO: banco sem versão do Alembic; migração automática pulada."
    fi
fi

# Start the services
# Use server-wrapper.js for runtime environment variable injection
pm2 start server-wrapper.js --cwd /app/web --name learnhouse-web > /dev/null 2>&1
pm2 start uv --cwd /app/api --name learnhouse-api -- run app.py
pm2 start node --cwd /app/collab --name learnhouse-collab -- dist/index.js

# Check if the services are running and log the status
pm2 status

# Start Nginx in the background
nginx -g 'daemon off;' &

# Tail PM2 logs with proper formatting
pm2 logs --raw
