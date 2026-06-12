# -*- coding: utf-8 -*-
"""
Arranque y recuperación de bots Telegram (webhook) embebidos en la API.

Si Supabase devuelve PGRST002 al startup, lifespan antes dejaba `bots` vacío
hasta el próximo redeploy manual. Este módulo reintenta y permite refresh periódico.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from core.config import TELEGRAM_WEBHOOK_ALLOWED_UPDATES, WEBHOOK_URL
from db import sb

logger = logging.getLogger("bot_registry")

from core.supabase_errors import is_transient_supabase_error


async def configure_bot_webhook(bot: Any, dist_id: int) -> None:
    """Registra webhook con allowed_updates completos (chat_member + mensajes)."""
    if not WEBHOOK_URL:
        return
    webhook_path = f"{WEBHOOK_URL.rstrip('/')}/api/telegram/webhook/{dist_id}"
    await bot.set_webhook(
        url=webhook_path,
        allowed_updates=TELEGRAM_WEBHOOK_ALLOWED_UPDATES,
    )


def fetch_active_distribuidores(
    *,
    max_retries: int = 8,
    initial_delay: float = 2.0,
) -> list[dict[str, Any]]:
    """Lista distribuidores activos con reintentos (schema cache / red)."""
    delay = initial_delay
    last_exc: Exception | None = None
    for attempt in range(1, max_retries + 1):
        try:
            res = (
                sb.table("distribuidores")
                .select("id_distribuidor, nombre_empresa, token_bot")
                .eq("estado", "activo")
                .execute()
            )
            rows = res.data or []
            if rows:
                logger.info(
                    "[bot_registry] %s distribuidor(es) activo(s) (intento %s/%s)",
                    len(rows),
                    attempt,
                    max_retries,
                )
            return rows
        except Exception as e:
            last_exc = e
            if not is_transient_supabase_error(e) or attempt >= max_retries:
                logger.error(
                    "[bot_registry] fetch distribuidores falló intento %s/%s: %s",
                    attempt,
                    max_retries,
                    e,
                )
                raise
            logger.warning(
                "[bot_registry] Supabase transitorio (intento %s/%s): %s — reintento en %.1fs",
                attempt,
                max_retries,
                e,
                delay,
            )
            time.sleep(delay)
            delay = min(delay * 1.5, 15.0)
    if last_exc:
        raise last_exc
    return []


async def start_bot_for_dist(
    dist: dict[str, Any],
    manager: Any,
    bots: dict[int, Any],
) -> bool:
    """Inicializa un bot y lo registra en `bots`. Idempotente si ya está activo."""
    from bot_worker import BotWorker

    d_id = int(dist["id_distribuidor"])
    nombre = dist.get("nombre_empresa") or dist.get("nombre") or str(d_id)

    if d_id in bots:
        return True

    token = (dist.get("token_bot") or "").strip()
    if not token:
        logger.error("[bot_registry] dist=%s (%s) sin token_bot — omitido", d_id, nombre)
        return False

    try:
        worker = BotWorker(distribuidor_id=d_id, ws_manager=manager)
        ptb_app = worker.build_app()
        await ptb_app.initialize()
        if WEBHOOK_URL:
            await configure_bot_webhook(ptb_app.bot, d_id)
            logger.info(
                "✅ Bot %s (%s) — Webhook OK: %s/api/telegram/webhook/%s",
                d_id,
                nombre,
                WEBHOOK_URL.rstrip("/"),
                d_id,
            )
        else:
            logger.warning("⚠️ Bot %s (%s) — WEBHOOK_URL no definida", d_id, nombre)
        await ptb_app.start()
        bots[d_id] = ptb_app
        return True
    except Exception as e:
        logger.error("❌ Error iniciando bot %s (%s): %s", d_id, nombre, e)
        return False


async def start_all_bots(
    manager: Any,
    bots: dict[int, Any],
    *,
    max_retries: int = 8,
) -> dict[str, Any]:
    """Arranca todos los bots activos. Devuelve resumen para health/logs."""
    try:
        distribuidores = await asyncio.to_thread(
            fetch_active_distribuidores,
            max_retries=max_retries,
        )
    except Exception as e:
        logger.error("[bot_registry] No se pudo listar distribuidores: %s", e)
        return {
            "expected": 0,
            "started": 0,
            "active": len(bots),
            "error": str(e)[:240],
        }

    started = 0
    for dist in distribuidores:
        if await start_bot_for_dist(dist, manager, bots):
            if int(dist["id_distribuidor"]) in bots:
                started += 1

    expected = len(distribuidores)
    active = len(bots)
    if active < expected:
        logger.warning(
            "[bot_registry] bots activos=%s esperados=%s (faltan %s)",
            active,
            expected,
            expected - active,
        )
    else:
        logger.info("[bot_registry] bots activos=%s/%s", active, expected)

    return {
        "expected": expected,
        "started": started,
        "active": active,
        "webhook_url_set": bool(WEBHOOK_URL),
    }


async def ensure_missing_bots(manager: Any, bots: dict[int, Any]) -> None:
    """Job periódico: levanta bots que quedaron fuera tras error transitorio al deploy."""
    try:
        distribuidores = await asyncio.to_thread(fetch_active_distribuidores, max_retries=3)
    except Exception as e:
        logger.debug("[bot_registry] ensure_missing skip: %s", e)
        return

    missing = [d for d in distribuidores if int(d["id_distribuidor"]) not in bots]
    if not missing:
        return

    logger.info("[bot_registry] Recuperando %s bot(s) faltante(s)", len(missing))
    for dist in missing:
        await start_bot_for_dist(dist, manager, bots)
