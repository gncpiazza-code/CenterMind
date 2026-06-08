#!/usr/bin/env bash
# Corre SHELFYAPP en iPhone físico (USB) apuntando al backend local en LAN.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LAN=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "192.168.1.100")
python3 -c "import json; print(json.dumps({'API_SCHEME':'http','API_HOST':'$LAN','API_PORT':'8000','FLAVOR':'tabaco'}, indent=2))" \
  > "$ROOT/config/dev-device.json"
mkdir -p "$ROOT/assets/config"
cp "$ROOT/config/dev-device.json" "$ROOT/assets/config/dev-device.json"

DEFINES="$ROOT/config/dev-device.json"
if [[ ! -f "$DEFINES" ]]; then
  echo "❌ Falta $DEFINES — ejecutá primero ./scripts/setup-ios-dev.sh"
  exit 1
fi

API_URL="$(python3 -c "import json; c=json.load(open('$DEFINES')); print(f\"{c.get('API_SCHEME','http')}://{c.get('API_HOST')}:{c.get('API_PORT','8000')}\")")"

echo "==> iPhone físico + API $API_URL"
echo "    Backend: ./scripts/run-backend-local.sh (otra terminal)"
echo ""

# Health check backend
if ! curl -sf --max-time 2 "http://127.0.0.1:8000/health" >/dev/null 2>&1; then
  echo "⚠️  Backend no responde en :8000 — levantalo primero con run-backend-local.sh"
fi

DEVICE_ID="$("$ROOT/scripts/flutter-device-id.sh" physical | xargs || true)"

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
