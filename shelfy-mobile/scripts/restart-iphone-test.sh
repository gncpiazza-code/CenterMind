#!/usr/bin/env bash
# Reinicia todo para test en iPhone físico (USB) + API local en LAN.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CM="$(cd "$ROOT/.." && pwd)/CenterMind"
API_LOG="/tmp/shelfy-api.log"
FLUTTER_LOG="/tmp/shelfy-flutter.log"
API_PID="/tmp/shelfy-api.pid"
FLUTTER_PID="/tmp/shelfy-flutter.pid"

log() { echo "[iphone-test] $*"; }

log "Deteniendo procesos anteriores..."
kill $(cat "$FLUTTER_PID" 2>/dev/null) 2>/dev/null || true
kill $(cat "$API_PID" 2>/dev/null) 2>/dev/null || true
lsof -ti :8000 | xargs kill -9 2>/dev/null || true
sleep 2

LAN=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")
if [[ -z "$LAN" ]]; then
  log "ERROR: no se detectó IP LAN (WiFi). Conectá el Mac a la misma red que el iPhone."
  exit 1
fi

log "IP LAN del Mac: $LAN"
python3 -c "import json; print(json.dumps({'API_SCHEME':'http','API_HOST':'$LAN','API_PORT':'8000','FLAVOR':'tabaco'}, indent=2))" \
  > "$ROOT/config/dev-device.json"
mkdir -p "$ROOT/assets/config"
cp "$ROOT/config/dev-device.json" "$ROOT/assets/config/dev-device.json"
log "API destino iPhone: http://${LAN}:8000"

log "Levantando backend..."
(
  cd "$CM"
  nohup env SHELFY_SKIP_BOTS=1 "$CM/.venv/bin/python" -m uvicorn api:app --host 0.0.0.0 --port 8000 \
    >>"$API_LOG" 2>&1 &
  echo $! >"$API_PID"
)
for i in $(seq 1 30); do
  curl -sf --max-time 2 "http://127.0.0.1:8000/health" >/dev/null && break
  sleep 2
done
curl -sf "http://127.0.0.1:8000/health" >/dev/null || {
  log "ERROR: API no arrancó — tail $API_LOG"
  tail -20 "$API_LOG" || true
  exit 1
}
log "API online en :8000"

DEVICE_ID="$("$ROOT/scripts/flutter-device-id.sh" physical | xargs || true)"

if [[ -z "$DEVICE_ID" ]]; then
  log "ERROR: iPhone físico no detectado (USB + confiar en dispositivo)"
  flutter devices --device-timeout 45 2>&1 || true
  exit 1
fi

log "iPhone: $DEVICE_ID"
log "Compilando e instalando (2-4 min) → $FLUTTER_LOG"

cd "$ROOT"
flutter pub get >/dev/null
: > "$FLUTTER_LOG"
nohup flutter run \
  --dart-define-from-file="$ROOT/config/dev-device.json" \
  --device-timeout 60 \
  -d "$DEVICE_ID" >>"$FLUTTER_LOG" 2>&1 &
echo $! >"$FLUTTER_PID"

for i in $(seq 1 90); do
  if grep -q "Flutter run key commands" "$FLUTTER_LOG" 2>/dev/null; then
    log "App instalada en iPhone"
    break
  fi
  if grep -qE "BUILD FAILED|Error launching|No development certificates" "$FLUTTER_LOG" 2>/dev/null; then
    log "ERROR build — tail $FLUTTER_LOG"
    tail -30 "$FLUTTER_LOG"
    exit 1
  fi
  sleep 3
done

cat <<EOF

╔══════════════════════════════════════════════════════════╗
║  iPhone listo — SHELFYAPP                                ║
╚══════════════════════════════════════════════════════════╝

  API Mac:  http://${LAN}:8000
  iPhone:   misma WiFi que el Mac
  Key:      sapp_... completa del portal

  Logs:
    API:     $API_LOG
    Flutter: $FLUTTER_LOG

  Detener:
    kill \$(cat $API_PID) \$(cat $FLUTTER_PID) 2>/dev/null

EOF
