#!/usr/bin/env bash
# Corre SHELFYAPP en iPhone físico (USB) apuntando al backend local en LAN.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DEFINES="$ROOT/config/dev-device.json"
if [[ ! -f "$DEFINES" ]]; then
  echo "❌ Falta $DEFINES — ejecutá primero ./scripts/setup-ios-dev.sh"
  exit 1
fi

API_URL="$(python3 -c "import json; print(json.load(open('$DEFINES'))['API_BASE_URL'])")"

echo "==> iPhone físico + API $API_URL"
echo "    Backend: ./scripts/run-backend-local.sh (otra terminal)"
echo ""

# Health check backend
if ! curl -sf --max-time 2 "http://127.0.0.1:8000/health" >/dev/null 2>&1; then
  echo "⚠️  Backend no responde en :8000 — levantalo primero con run-backend-local.sh"
fi

DEVICE_ID="$(flutter devices --device-timeout 45 2>/dev/null \
  | grep -iE 'iphone.*\(mobile\)' \
  | head -1 \
  | sed -n 's/.*• \([^ ]*\) • ios.*/\1/p' \
  | xargs || true)"

if [[ -z "$DEVICE_ID" ]]; then
  echo "❌ iPhone no detectado."
  echo ""
  flutter devices --device-timeout 45 2>&1 || true
  echo ""
  echo "Si ves «unpaired» (code -29):"
  echo "  ./scripts/pair-iphone.sh"
  exit 1
fi

echo "📱 Dispositivo: $DEVICE_ID"
echo ""

exec flutter run \
  --dart-define-from-file="$DEFINES" \
  --device-timeout 45 \
  -d "$DEVICE_ID"
