#!/usr/bin/env bash
# API local en :8000 — misma Supabase que prod (.env en CenterMind/).
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
CM="$REPO/CenterMind"
VENV="$CM/.venv"

if [[ ! -d "$CM" ]]; then
  echo "❌ No se encuentra $CM"
  exit 1
fi

cd "$CM"

if [[ ! -x "$VENV/bin/python" ]]; then
  echo "==> Creando venv Python en CenterMind/.venv (primera vez)..."
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q -U pip
  "$VENV/bin/pip" install -q -r requirements.txt
  echo "✅ venv listo (supabase==2.31.0)"
fi

if [[ -f .env ]]; then
  echo "ℹ️  Usando CenterMind/.env"
else
  echo "⚠️  Sin CenterMind/.env — copiá .env.example y completá Supabase/JWT"
  exit 1
fi

echo "==> uvicorn en http://0.0.0.0:8000 (SHELFY_SKIP_BOTS=1, sin bots Telegram)"
echo "    Health: http://127.0.0.1:8000/health"
echo "    Vendedor app: http://127.0.0.1:8000/api/vendedor-app/..."
echo "    Python: $VENV/bin/python"
echo ""

export SHELFY_SKIP_BOTS=1
exec "$VENV/bin/python" -m uvicorn api:app --host 0.0.0.0 --port 8000
