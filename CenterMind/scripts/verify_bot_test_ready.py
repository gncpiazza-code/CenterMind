#!/usr/bin/env python3
"""Verifica que dist 1 esté listo para QA de cartera en Telegram."""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv

load_dotenv()

CHAT_ID = -5125535838
DIST_ID = 1
ERP_OK = "11111"
ERP_BAD = "99999999"


def main() -> int:
    errors = []
    from db import sb
    from core.bot_cliente_cartera import cliente_en_cartera_vendedor
    import requests

    if os.getenv("BOT_VALIDACION_CARTERA", "0") != "1":
        errors.append("BOT_VALIDACION_CARTERA no es 1 en .env")

    ig = (
        sb.table("integrantes_grupo")
        .select("id_vendedor_v2")
        .eq("id_distribuidor", DIST_ID)
        .eq("telegram_group_id", CHAT_ID)
        .not_.is_("id_vendedor_v2", "null")
        .limit(1)
        .execute()
    ).data
    if not ig:
        errors.append("Grupo sin id_vendedor_v2")
    else:
        vid = ig[0]["id_vendedor_v2"]
        if not cliente_en_cartera_vendedor(DIST_ID, vid, ERP_OK, sb):
            errors.append(f"{ERP_OK} debería estar en cartera")
        if cliente_en_cartera_vendedor(DIST_ID, vid, ERP_BAD, sb):
            errors.append(f"{ERP_BAD} no debería estar en cartera")

    token = sb.table("distribuidores").select("token_bot,admin_telegram_id").eq("id_distribuidor", DIST_ID).single().execute().data
    wh = requests.get(f"https://api.telegram.org/bot{token['token_bot']}/getWebhookInfo", timeout=15).json()
    url = wh.get("result", {}).get("url") or ""
    if url:
        errors.append(f"Webhook activo ({url}) — usá run_bot_test_local.sh (polling)")

    admin = token.get("admin_telegram_id")
    if str(admin) != "2037005531":
        errors.append(f"admin_telegram_id={admin} (esperado 2037005531)")

    if errors:
        print("NO LISTO:")
        for e in errors:
            print(" -", e)
        return 1

    print("LISTO para Telegram")
    print(f"  Grupo: {CHAT_ID} (@test_SQL_real_bot)")
    print(f"  NRO OK: {ERP_OK}")
    print(f"  NRO bloqueo: {ERP_BAD}")
    print("  /reset habilitado para vos (admin + QA dist 1)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
