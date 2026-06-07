#!/usr/bin/env bash
# Reinicia sesión de test: backend + checks iPhone + instrucciones.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$ROOT/.." && pwd)"
CM="$REPO/CenterMind"
DEVICE_ID="00008140-001A01C20210801C"

echo "╔══════════════════════════════════════════════════╗"
echo "║  SHELFYAPP — sesión de test                     ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# 1. IP LAN
LAN=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "192.168.1.100")
python3 -c "import json; print(json.dumps({'API_BASE_URL': f'http://${LAN}:8000', 'FLAVOR': 'tabaco'}, indent=2))" > "$ROOT/config/dev-device.json"
echo "✓ config/dev-device.json → http://${LAN}:8000"

# 2. Backend
if curl -sf --max-time 2 http://127.0.0.1:8000/health >/dev/null; then
  echo "✓ API ya corre en :8000"
else
  echo "→ Levantando API..."
  lsof -ti :8000 | xargs kill -9 2>/dev/null || true
  if [[ ! -x "$CM/.venv/bin/python" ]]; then
    python3 -m venv "$CM/.venv"
    "$CM/.venv/bin/pip" install -q -U pip -r "$CM/requirements.txt"
  fi
  (cd "$CM" && nohup .venv/bin/python -m uvicorn api:app --host 0.0.0.0 --port 8000 --reload > /tmp/shelfy-api.log 2>&1 &)
  for i in {1..30}; do
    curl -sf --max-time 2 http://127.0.0.1:8000/health >/dev/null && break
    sleep 2
  done
  curl -sf http://127.0.0.1:8000/health >/dev/null && echo "✓ API online (log: /tmp/shelfy-api.log)" || echo "✗ API no arrancó — ver /tmp/shelfy-api.log"
fi

# 3. iPhone
echo ""
echo "── iPhone ──"
xcrun devicectl list devices 2>/dev/null | head -4 || true
CERTS=$(security find-identity -p codesigning -v 2>/dev/null | grep -c "valid identities" || echo 0)
if flutter devices --device-timeout 20 2>/dev/null | grep -q "$DEVICE_ID"; then
  echo "✓ Flutter ve iPhone de Nacho"
else
  echo "✗ Flutter no ve iPhone — corré: ./scripts/pair-iphone.sh"
fi
if echo "$CERTS" | grep -q "0 valid"; then
  echo "✗ Sin certificado de desarrollo — completá signing en Xcode (ya abierto)"
else
  echo "✓ Certificados de firma disponibles"
fi
if xcrun devicectl list devices 2>/dev/null | grep -q "no DDI"; then
  echo "⚠ iPhone: «no DDI» — en Xcode → Devices, esperá «Ready» (descarga soporte iOS)"
fi

echo ""
echo "── Qué hacer vos (2 min en Xcode) ──"
echo "1. Xcode → Settings → Accounts → «+» → Apple ID"
echo "2. Runner target → Signing & Capabilities → Team = tu Apple ID"
echo "3. iPhone: Ajustes → Privacidad → Modo desarrollador → ON (si aparece)"
echo "4. iPhone: Ajustes → General → Gestión de VPN y dispositivo → Confiar (tras primer build)"
echo ""
echo "── Luego en Warp ──"
echo "  ./scripts/run-ios-device.sh"
echo ""
echo "── Alternativa sin signing (simulador) ──"
echo "  ./scripts/run-ios-simulator.sh"
