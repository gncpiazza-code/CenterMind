#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== Flutter doctor ==="
flutter doctor -v

echo ""
echo "=== Dispositivos ==="
flutter devices

echo ""
echo "=== Config activa (dev-device) ==="
if [[ -f config/dev-device.json ]]; then
  cat config/dev-device.json
else
  echo "(no existe — correr setup-ios-dev.sh)"
fi

echo ""
echo "=== API health (local) ==="
curl -sf http://127.0.0.1:8000/health && echo " OK local" || echo " ❌ backend local no responde"

echo ""
echo "=== API health (Railway prod) ==="
curl -sf https://api.shelfycenter.com/health && echo " OK prod" || echo " ❌ prod no responde"

echo ""
echo "=== vendedor-app en prod ==="
curl -sf "https://api.shelfycenter.com/openapi.json" \
  | python3 -c "import sys,json; p=[x for x in json.load(sys.stdin).get('paths',{}) if 'vendedor-app' in x]; print('endpoints:', len(p)); print('⚠️  deploy pendiente' if not p else 'OK')" \
  2>/dev/null || echo "no openapi"
