#!/usr/bin/env bash
# Configura el entorno Mac/iPhone para desarrollo SHELFYAPP.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/.." && pwd)"
cd "$ROOT"

echo "==> SHELFYAPP — setup iOS dev (Mac)"
echo "    Proyecto: $ROOT"
echo ""

# ── Python venv backend ────────────────────────────────────────────────────────
CM_VENV="$REPO_ROOT/CenterMind/.venv"
if [[ ! -x "$CM_VENV/bin/python" ]]; then
  echo "==> Creando venv backend (supabase 2.31.0)..."
  python3 -m venv "$CM_VENV"
  "$CM_VENV/bin/pip" install -q -U pip
  "$CM_VENV/bin/pip" install -q -r "$REPO_ROOT/CenterMind/requirements.txt"
fi

# ── Xcode ──────────────────────────────────────────────────────────────────────
if [[ ! -d "/Applications/Xcode.app" ]]; then
  echo "❌ Xcode NO instalado."
  echo "   1. App Store → instalar Xcode (~12 GB)"
  echo "   2. Abrir Xcode una vez y aceptar licencia"
  echo "   3. Ejecutar:"
  echo "      sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer"
  echo "      sudo xcodebuild -runFirstLaunch"
  echo ""
  echo "   Sin Xcode no podés correr en iPhone ni simulador iOS."
  exit 1
fi

if [[ "$(xcode-select -p 2>/dev/null || true)" != "/Applications/Xcode.app/Contents/Developer" ]]; then
  echo "⚠️  Ajustando xcode-select a Xcode.app..."
  sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
  sudo xcodebuild -runFirstLaunch
fi

# ── CocoaPods ──────────────────────────────────────────────────────────────────
if ! command -v pod >/dev/null 2>&1; then
  echo "==> Instalando CocoaPods (Homebrew)..."
  brew install cocoapods
fi

# ── Flutter deps ───────────────────────────────────────────────────────────────
echo "==> flutter pub get"
flutter pub get

echo "==> drift codegen (si hace falta)"
dart run build_runner build --delete-conflicting-outputs 2>/dev/null || true

echo "==> pod install (iOS, si hay Podfile)"
if [[ -f ios/Podfile ]]; then
  cd ios
  pod install
  cd "$ROOT"
else
  echo "ℹ️  Sin Podfile — Flutter 3.44+ usa Swift Package Manager para plugins iOS."
fi

# ── Config dev iPhone físico ───────────────────────────────────────────────────
DEVICE_CFG="$ROOT/config/dev-device.json"
if [[ ! -f "$DEVICE_CFG" ]]; then
  LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "192.168.1.100")"
  cat > "$DEVICE_CFG" <<EOF
{
  "API_BASE_URL": "http://${LAN_IP}:8000",
  "FLAVOR": "tabaco"
}
EOF
  echo "✅ Creado $DEVICE_CFG con IP LAN $LAN_IP"
  echo "   (Mac e iPhone deben estar en la misma WiFi)"
else
  LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "192.168.1.100")"
  python3 -c "import json; print(json.dumps({'API_BASE_URL': f'http://${LAN_IP}:8000', 'FLAVOR': 'tabaco'}, indent=2))" > "$DEVICE_CFG"
  echo "✅ Actualizado $DEVICE_CFG → http://${LAN_IP}:8000"
fi

echo ""
flutter doctor -v
echo ""
echo "✅ Setup listo. Próximos pasos:"
echo "   Terminal 1: ./scripts/run-backend-local.sh"
echo "   Terminal 2 (simulador, sin signing): ./scripts/run-ios-simulator.sh"
echo "   iPhone físico (requiere signing una vez): ./scripts/configure-ios-signing.sh"
echo "   Luego: ./scripts/run-ios-device.sh"
echo "   Si iPhone «unpaired»: ./scripts/pair-iphone.sh"
