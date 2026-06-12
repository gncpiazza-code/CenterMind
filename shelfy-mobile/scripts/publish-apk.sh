#!/usr/bin/env bash
# Publica APK tabaco en Supabase + API Shelfy (requiere CenterMind/.env).
# Build recomendado (arm64, ~42MB — cabe en límite upload Storage):
#   cd shelfy-mobile && flutter build apk --release --flavor tabaco \
#     --target-platform android-arm64 --dart-define-from-file=config/prod-device.json
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APK="${1:-$ROOT/shelfy-mobile/build/app/outputs/flutter-apk/app-tabaco-release.apk}"
VERSION_NAME="${2:-1.0.4}"
BUILD_NUMBER="${3:-10}"
CHANGELOG="${4:-Zona geográfica Monchi/Jorge + fix subida exhibiciones + OTA b10}"

cd "$ROOT/CenterMind"
.venv/bin/python scripts/publish_mobile_release.py \
  --apk "$APK" \
  --flavor tabaco \
  --version-name "$VERSION_NAME" \
  --build-number "$BUILD_NUMBER" \
  --changelog "$CHANGELOG"
