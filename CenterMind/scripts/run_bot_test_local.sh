#!/usr/bin/env bash
# Bot Distribuidora Test (dist 1) — solo local, con validación de cartera.
# No restaura webhook a Railway; Real (dist 3) no se toca.
set -euo pipefail
cd "$(dirname "$0")/.."

export BOT_VALIDACION_CARTERA=1

echo "→ Quitando webhook de Test (dist 1) para usar polling local..."
python - <<'PY'
import requests
from db import sb

token = sb.table("distribuidores").select("token_bot").eq("id_distribuidor", 1).single().execute().data["token_bot"]
r = requests.post(
    f"https://api.telegram.org/bot{token}/deleteWebhook",
    json={"drop_pending_updates": False},
    timeout=30,
)
r.raise_for_status()
print("  deleteWebhook:", r.json().get("description", r.json()))
PY

LOG="/tmp/shelfy-bot-test-1.log"
echo "→ Arrancando @test_SQL_real_bot (dist 1) en segundo plano"
echo "   Log: $LOG"
nohup env BOT_VALIDACION_CARTERA=1 python bot_worker.py --distribuidor-id 1 >> "$LOG" 2>&1 &
sleep 3
if pgrep -f "bot_worker.py --distribuidor-id 1" >/dev/null; then
  echo "✅ Bot online (polling). Probá en TEST GROUP (-5125535838)"
  echo "   tail -f $LOG"
else
  echo "❌ No arrancó — revisá $LOG"
  exit 1
fi
