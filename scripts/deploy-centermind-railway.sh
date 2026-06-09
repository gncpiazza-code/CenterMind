#!/usr/bin/env bash
# Deploy API CenterMind a Railway prod.
#
# El monorepo tiene .railwayignore pensado para engines (solo ShelfMind-RPA).
# CenterMind debe subirse desde CenterMind/CenterMind con el path de config
# que espera el dashboard: /CenterMind/railway.toml
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API="$ROOT/CenterMind"

if [[ ! -f "$API/api.py" ]]; then
  echo "ERROR: no existe $API/api.py" >&2
  exit 1
fi

cd "$API"

# Railway (dashboard) busca config en /CenterMind/railway.toml dentro del tarball CLI.
mkdir -p CenterMind
cp -f railway.toml CenterMind/railway.toml

echo "[deploy] Subiendo CenterMind → Railway (prod)..."
if ! railway deployment up --detach --no-gitignore "$@"; then
  echo "[deploy] CLI falló — redeploy desde GitHub (main)..." >&2
  railway deployment redeploy --from-source -s CenterMind -y
fi

echo "[deploy] Listo. Verificar:"
echo "  curl -sf https://api.shelfycenter.com/health"
echo "  railway deployment list | head -3"
