#!/usr/bin/env bash
# Extrae device id de `flutter devices` (segundo campo separado por •).
# Uso: ./scripts/flutter-device-id.sh physical|simulator
set -euo pipefail

MODE="${1:-physical}"
DEVICES="$(flutter devices --device-timeout 45 2>/dev/null || true)"

case "$MODE" in
  physical)
    echo "$DEVICES" | awk -F'•' '
      /\(mobile\)/ && !/simulator/ {
        gsub(/^[ \t]+|[ \t]+$/, "", $2)
        if ($2 != "") { print $2; exit }
      }'
    ;;
  simulator)
    echo "$DEVICES" | awk -F'•' '
      /simulator/ {
        gsub(/^[ \t]+|[ \t]+$/, "", $2)
        if ($2 != "") { print $2; exit }
      }'
    ;;
  *)
    echo "Uso: $0 physical|simulator" >&2
    exit 1
    ;;
esac
