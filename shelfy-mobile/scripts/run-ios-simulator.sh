#!/usr/bin/env bash
# Corre SHELFYAPP en simulador iOS apuntando al backend local.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DEFINES="$ROOT/config/dev-simulator.json"
if [[ ! -f "$DEFINES" ]]; then
  echo "❌ Falta $DEFINES"
  exit 1
fi

echo "==> Simulador iOS + API $(python3 -c "import json; print(json.load(open('$DEFINES'))['API_BASE_URL'])")"
echo "    Asegurate de tener ./scripts/run-backend-local.sh corriendo en otra terminal."
echo ""

SIM_ID="$(flutter devices --device-timeout 20 2>/dev/null \
  | grep -i simulator \
  | head -1 \
  | sed -n 's/.*• \([^ ]*\) •.*/\1/p' \
  | xargs || true)"

if [[ -z "$SIM_ID" ]]; then
  echo "==> Abriendo simulador iOS..."
  open -a Simulator
  sleep 8
  SIM_ID="$(flutter devices --device-timeout 30 2>/dev/null \
    | grep -i simulator \
    | head -1 \
    | sed -n 's/.*• \([^ ]*\) •.*/\1/p' \
    | xargs || true)"
fi

if [[ -z "$SIM_ID" ]]; then
  echo "❌ No hay simulador iOS. Instalá un runtime en Xcode → Settings → Platforms"
  exit 1
fi

exec flutter run \
  --dart-define-from-file="$DEFINES" \
  --device-timeout 30 \
  -d "$SIM_ID"
