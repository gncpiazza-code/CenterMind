#!/usr/bin/env bash
# Regenera ios/Flutter/Generated.xcconfig para Xcode con la config correcta.
# Uso:
#   ./scripts/prepare-xcode.sh prod     # iPhone → Railway (default recomendado)
#   ./scripts/prepare-xcode.sh local    # iPhone → API Mac en LAN :8000
#   ./scripts/prepare-xcode.sh simulator
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MODE="${1:-prod}"
CONFIG="$ROOT/config/prod-device.json"

case "$MODE" in
  simulator)
    CONFIG="$ROOT/config/dev-simulator.json"
    echo "→ simulator config: http://127.0.0.1:8000"
    ;;
  local|device)
    LAN=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "192.168.1.100")
    python3 -c "import json; print(json.dumps({'API_SCHEME':'http','API_HOST':'$LAN','API_PORT':'8000','FLAVOR':'tabaco'}, indent=2))" > "$ROOT/config/dev-device.json"
    mkdir -p "$ROOT/assets/config"
    cp "$ROOT/config/dev-device.json" "$ROOT/assets/config/dev-device.json"
    CONFIG="$ROOT/config/dev-device.json"
    echo "→ local config: http://${LAN}:8000"
    ;;
  prod)
    cp "$ROOT/config/prod-device.json" "$ROOT/assets/config/prod-device.json"
    CONFIG="$ROOT/config/prod-device.json"
    echo "→ prod config: https://api.shelfycenter.com"
    ;;
  *)
    echo "Uso: $0 {prod|local|simulator}"
    exit 1
    ;;
esac

flutter pub get >/dev/null
flutter build ios --config-only --debug --dart-define-from-file="$CONFIG" >/dev/null
echo "✅ Xcode listo. Abrí ios/Runner.xcworkspace → Product → Clean → Run"
if [[ "$MODE" == "local" || "$MODE" == "device" ]]; then
  echo "   Backend local: ./scripts/run-backend-local.sh"
fi
