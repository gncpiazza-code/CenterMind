#!/bin/sh
set -e
cd /app

# RPA_START_MODE: scheduler (default) | cuentas | informe_ventas | padron | sigo | todos
# "scheduler" = APScheduler 24/7 (recomendado en Railway)
mode="${RPA_START_MODE:-scheduler}"

case "$mode" in
  scheduler)
    exec python scheduler.py
    ;;
  cuentas)
    exec python runner.py cuentas
    ;;
  informe_ventas)
    exec python runner.py informe_ventas
    ;;
  padron)
    exec python runner.py padron
    ;;
  sigo)
    exec python runner.py sigo
    ;;
  todos)
    exec python runner.py todos
    ;;
  *)
    echo "RPA_START_MODE desconocido: $mode (válido: scheduler, cuentas, informe_ventas, padron, sigo, todos)" >&2
    exit 1
    ;;
esac
