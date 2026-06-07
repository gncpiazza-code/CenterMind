#!/usr/bin/env bash
# /testmobile — levanta API local + SHELFYAPP (simulador o iPhone físico).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$ROOT/.." && pwd)"
CM="$REPO/CenterMind"
VENV="$CM/.venv"
API_LOG="/tmp/shelfy-api.log"
FLUTTER_LOG="/tmp/shelfy-flutter.log"
API_PID_FILE="/tmp/shelfy-api.pid"
FLUTTER_PID_FILE="/tmp/shelfy-flutter.pid"
WORKTREE_GDART="$REPO/.claude/worktrees/performance-mobile-2026-06-07/shelfy-mobile/lib/core/offline/upload_queue.g.dart"
TARGET="${1:-auto}" # auto | simulator | device

log() { echo "[testmobile] $*"; }

kill_port() {
  lsof -ti :8000 | xargs kill -9 2>/dev/null || true
}

ensure_venv() {
  if [[ ! -x "$VENV/bin/python" ]]; then
    log "Creando venv en CenterMind/.venv..."
    python3 -m venv "$VENV"
    "$VENV/bin/pip" install -q -U pip
    "$VENV/bin/pip" install -q -r "$CM/requirements.txt"
  fi
  "$VENV/bin/python" -c "from supabase import create_client" >/dev/null
}

ensure_drift_stub() {
  local gdart="$ROOT/lib/core/offline/upload_queue.g.dart"
  if [[ ! -f "$gdart" ]]; then
    if [[ -f "$WORKTREE_GDART" ]]; then
      cp "$WORKTREE_GDART" "$gdart"
      log "Restaurado upload_queue.g.dart"
    else
      log "ERROR: falta upload_queue.g.dart — dart run build_runner build en shelfy-mobile"
      exit 1
    fi
  fi
}

refresh_config() {
  local lan
  lan=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "127.0.0.1")
  python3 -c "import json; print(json.dumps({'API_BASE_URL': f'http://${lan}:8000', 'FLAVOR': 'tabaco'}, indent=2))" > "$ROOT/config/dev-device.json"
  log "dev-device.json → http://${lan}:8000"
}

start_api() {
  if curl -sf --max-time 2 http://127.0.0.1:8000/health >/dev/null; then
    log "API ya online en :8000"
    return 0
  fi

  if [[ ! -f "$CM/.env" ]]; then
    log "ERROR: falta CenterMind/.env (copiá .env.example)"
    exit 1
  fi

  kill_port
  ensure_venv
  log "Levantando API → $API_LOG"
  (cd "$CM" && nohup "$VENV/bin/python" -m uvicorn api:app --host 0.0.0.0 --port 8000 --reload >>"$API_LOG" 2>&1 & echo $! >"$API_PID_FILE")

  for i in $(seq 1 45); do
    if curl -sf --max-time 2 http://127.0.0.1:8000/health >/dev/null; then
      log "API OK (health)"
      return 0
    fi
    sleep 2
  done
  log "ERROR: API no respondió — tail $API_LOG"
  tail -30 "$API_LOG" || true
  exit 1
}

has_signing_certs() {
  security find-identity -p codesigning -v 2>/dev/null | grep -q "Apple Development"
}

pick_device() {
  local mode="$1"
  local sim_id phys_id

  sim_id="$(flutter devices --device-timeout 30 2>/dev/null \
    | grep -i simulator \
    | head -1 \
    | sed -n 's/.*• \([^ ]*\) •.*simulator.*/\1/p' \
    | xargs || true)"

  phys_id="$(flutter devices --device-timeout 30 2>/dev/null \
    | grep -iE 'iphone.*\(mobile\)' \
    | grep -vi simulator \
    | head -1 \
    | sed -n 's/.*• \([^ ]*\) • ios.*/\1/p' \
    | xargs || true)"

  case "$mode" in
    simulator)
      if [[ -z "$sim_id" ]]; then
        open -a Simulator 2>/dev/null || true
        sleep 12
        sim_id="$(flutter devices --device-timeout 30 2>/dev/null \
          | grep -i simulator | head -1 \
          | sed -n 's/.*• \([^ ]*\) •.*simulator.*/\1/p' | xargs || true)"
      fi
      [[ -n "$sim_id" ]] || { log "ERROR: no hay simulador iOS — Xcode → Platforms"; exit 1; }
      echo "simulator:$sim_id"
      ;;
    device)
      [[ -n "$phys_id" ]] || { log "ERROR: iPhone físico no detectado — ./scripts/pair-iphone.sh"; exit 1; }
      has_signing_certs || { log "ERROR: sin certificados — ./scripts/configure-ios-signing.sh"; exit 1; }
      echo "device:$phys_id"
      ;;
    auto|*)
      if [[ -n "$phys_id" ]] && has_signing_certs; then
        echo "device:$phys_id"
      elif [[ -n "$sim_id" ]]; then
        echo "simulator:$sim_id"
      else
        open -a Simulator 2>/dev/null || true
        sleep 12
        sim_id="$(flutter devices --device-timeout 30 2>/dev/null \
          | grep -i simulator | head -1 \
          | sed -n 's/.*• \([^ ]*\) •.*simulator.*/\1/p' | xargs || true)"
        [[ -n "$sim_id" ]] || { log "ERROR: no hay simulador ni iPhone listo"; exit 1; }
        echo "simulator:$sim_id"
      fi
      ;;
  esac
}

start_flutter() {
  local kind id defines
  read -r kind id <<<"$(pick_device "$TARGET" | tr ':' ' ')"

  if [[ "$kind" == "simulator" ]]; then
    defines="$ROOT/config/dev-simulator.json"
    log "Target: simulador ($id)"
  else
    defines="$ROOT/config/dev-device.json"
    log "Target: iPhone físico ($id)"
  fi

  if [[ -f "$FLUTTER_PID_FILE" ]] && kill -0 "$(cat "$FLUTTER_PID_FILE")" 2>/dev/null; then
    log "Deteniendo flutter run anterior (pid $(cat "$FLUTTER_PID_FILE"))"
    kill "$(cat "$FLUTTER_PID_FILE")" 2>/dev/null || true
    sleep 2
  fi

  cd "$ROOT"
  flutter pub get >/dev/null
  log "Compilando app (2-4 min primera vez) → $FLUTTER_LOG"

  nohup flutter run \
    --dart-define-from-file="$defines" \
    --device-timeout 60 \
    -d "$id" >>"$FLUTTER_LOG" 2>&1 &
  echo $! >"$FLUTTER_PID_FILE"

  for i in $(seq 1 120); do
    if grep -q "Flutter run key commands" "$FLUTTER_LOG" 2>/dev/null; then
      log "App corriendo en $kind"
      return 0
    fi
    if grep -qE "BUILD FAILED|Error launching|No development certificates" "$FLUTTER_LOG" 2>/dev/null; then
      log "ERROR build Flutter — tail $FLUTTER_LOG"
      tail -40 "$FLUTTER_LOG"
      exit 1
    fi
    sleep 3
  done
  log "Build en progreso (más de 6 min) — tail -f $FLUTTER_LOG"
}

print_next_steps() {
  cat <<EOF

╔══════════════════════════════════════════════════════════════╗
║  SHELFYAPP — listo para testear                              ║
╚══════════════════════════════════════════════════════════════╝

  API:     http://127.0.0.1:8000/health  (log: $API_LOG)
  Flutter: log $FLUTTER_LOG

  1. Portal → Fuerza de Ventas → App Móvil → generar key sapp_...
  2. Pegar key en la app
  3. Probar: Captura | Cartera | Stats | Objetivos

  Simulador GPS: Xcode → Debug → Simulate Location
  iPhone físico: misma WiFi que Mac (dev-device.json)

  Detener:
    kill \$(cat $API_PID_FILE 2>/dev/null) 2>/dev/null; kill \$(cat $FLUTTER_PID_FILE 2>/dev/null) 2>/dev/null

EOF
}

main() {
  log "SHELFYAPP /testmobile"
  [[ -d "/Applications/Xcode.app" ]] || { log "ERROR: instalá Xcode desde App Store"; exit 1; }

  refresh_config
  ensure_drift_stub
  start_api
  start_flutter
  print_next_steps
}

main "$@"
