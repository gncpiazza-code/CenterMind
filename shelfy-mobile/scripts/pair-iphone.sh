#!/usr/bin/env bash
# Empareja iPhone con Xcode (error Flutter code -29).
set -euo pipefail

echo "==> Abriendo Xcode → Window → Devices and Simulators"
echo "    1. Conectá el iPhone por USB"
echo "    2. Desbloqueá el iPhone y tocá «Confiar» si aparece"
echo "    3. En Xcode, seleccioná el iPhone y esperá «Connected» / «Ready»"
echo ""

open -a Xcode
sleep 2
open "xcode://devices" 2>/dev/null || true

echo "Esperando detección Flutter (hasta 60s)..."
for i in {1..12}; do
  if flutter devices --device-timeout 10 2>/dev/null | grep -qi "iphone"; then
    echo ""
    flutter devices --device-timeout 10
    echo ""
    echo "✅ iPhone detectado. Corré: ./scripts/run-ios-device.sh"
    exit 0
  fi
  echo "  ... intento $i/12"
  sleep 5
done

echo ""
echo "⚠️  Flutter aún no ve el iPhone."
echo "   En Xcode: Window → Devices and Simulators → seleccionar iPhone → «Use for Development»"
echo "   Luego: flutter devices"
