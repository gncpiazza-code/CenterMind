#!/usr/bin/env bash
# Configura code signing para correr en iPhone físico (cuenta Apple gratuita alcanza).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Code signing iOS (una vez)"
echo ""
echo "1. Se abrirá Xcode en el proyecto iOS."
echo "2. Seleccioná target «Runner» → pestaña «Signing & Capabilities»"
echo "3. Marcá «Automatically manage signing»"
echo "4. Team: tu Apple ID personal (Add Account si no aparece)"
echo "5. Bundle Identifier: cambialo a algo único si falla, ej:"
echo "   com.shelfy.tabaco.dev.$(whoami | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9')"
echo ""
echo "6. Conectá el iPhone → Run (▶) una vez desde Xcode, o volvé a:"
echo "   ./scripts/run-ios-device.sh"
echo ""

open "$ROOT/ios/Runner.xcworkspace"
