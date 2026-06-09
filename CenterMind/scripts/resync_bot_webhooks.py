#!/usr/bin/env python3
"""Re-registra webhooks Telegram con allowed_updates para todos los dist activos."""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

from core.bot_registry import configure_bot_webhook, fetch_active_distribuidores  # noqa: E402
from core.config import WEBHOOK_URL  # noqa: E402


async def _resync(dist_ids: list[int] | None) -> int:
    if not WEBHOOK_URL:
        print("WEBHOOK_URL no configurada")
        return 1
    rows = fetch_active_distribuidores(max_retries=3)
    if dist_ids:
        wanted = set(dist_ids)
        rows = [r for r in rows if int(r["id_distribuidor"]) in wanted]
    if not rows:
        print("Sin distribuidores activos")
        return 1

    from telegram import Bot

    ok = 0
    for row in rows:
        d_id = int(row["id_distribuidor"])
        token = (row.get("token_bot") or "").strip()
        nombre = row.get("nombre_empresa") or d_id
        if not token:
            print(f"SKIP dist={d_id} ({nombre}) sin token")
            continue
        bot = Bot(token)
        await configure_bot_webhook(bot, d_id)
        info = await bot.get_webhook_info()
        print(
            f"OK dist={d_id} ({nombre}) url={info.url} "
            f"allowed={list(info.allowed_updates or [])}"
        )
        ok += 1
    print(f"Listo: {ok}/{len(rows)} webhooks")
    return 0 if ok == len(rows) else 2


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--dist-id", type=int, action="append", dest="dist_ids")
    args = p.parse_args()
    raise SystemExit(asyncio.run(_resync(args.dist_ids)))


if __name__ == "__main__":
    main()
