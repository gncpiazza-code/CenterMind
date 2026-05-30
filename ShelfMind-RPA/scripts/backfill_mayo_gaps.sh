#!/usr/bin/env bash
# Rellena huecos de mayo 2026 en ventas_enriched (auditoría 2026-05-30).
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -f .env ]]; then set -a; source .env; set +a; fi

export RPA_HEADLESS="${RPA_HEADLESS:-true}"
export RPA_VENTAS_INGEST_LOCAL="${RPA_VENTAS_INGEST_LOCAL:-1}"

LOG="logs/backfill_mayo_gaps_$(date +%Y%m%d_%H%M%S).log"
echo "Log: $LOG"

run_tenant() {
  local tenant="$1"
  local desde="$2"
  local hasta="$3"
  echo ""
  echo "========== INICIO $tenant ($desde → $hasta) $(date '+%H:%M:%S') =========="
  echo "========== INICIO $tenant ($desde → $hasta) $(date '+%H:%M:%S') ==========" >>"$LOG"
  PADRON_DEBUG_TENANT="$tenant" python3 runner.py informe_ventas "$desde" "$hasta" 2>&1 | tee -a "$LOG"
  local ec=${PIPESTATUS[0]}
  echo "========== FIN $tenant exit=$ec $(date '+%H:%M:%S') =========="
  echo "========== FIN $tenant exit=$ec $(date '+%H:%M:%S') ==========" >>"$LOG"
  return "$ec"
}

# aloma: mayo completo en DB — omitido
# tabaco/real 03-may: domingo sin movimientos (0 filas en ERP/DB; Consolido no exporta)
echo "SKIP tabaco/real 03/05/2026 — domingo, sin ventas en Consolido"
run_tenant liver     "01/05/2026" "06/05/2026" || true
run_tenant extra     "01/05/2026" "06/05/2026" || true
run_tenant beltrocco "01/05/2026" "10/05/2026" || true
run_tenant hugo_cena "01/05/2026" "26/05/2026" || true

echo ""
echo "========== BACKFILL MAYO GAPS TERMINADO $(date '+%H:%M:%S') =========="
echo "========== BACKFILL MAYO GAPS TERMINADO $(date '+%H:%M:%S') ==========" >>"$LOG"
