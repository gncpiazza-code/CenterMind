# -*- coding: utf-8 -*-
"""
scheduler.py
============
Proceso siempre activo para ejecutar motores RPA en horario Argentina.

Zona: America/Argentina/Buenos_Aires (independiente de la región del host, ej. us-west).

Horarios:
  07:30  Padrón (única corrida diaria)
  08:00  13:30  17:30  20:00  Cuentas corrientes (CHESS saldos)

Ventas queda deshabilitado temporalmente en el scheduler.

Monitorear CPU/RAM y “Accesos concurrentes” en CHESS según uso real.

Inicio: python scheduler.py
"""

import asyncio
import logging
import os
from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import time

# ── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)-12s | %(levelname)-8s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("SCHEDULER")

AR_TZ = ZoneInfo("America/Argentina/Buenos_Aires")

# Cuentas corrientes (AR): 08:00, 13:30, 17:30, 20:00
_SLOTS_CUENTAS = [(8, 0), (13, 30), (17, 30), (20, 0)]


def job_cuentas():
    logger.info("⏰ Trigger CUENTAS")
    try:
        asyncio.run(_run_cuentas())
    except Exception as e:
        logger.error(f"Error en job_cuentas: {e}")


def job_padron():
    """Ejecuta el motor local de padrón."""
    logger.info("⏰ Trigger PADRÓN")
    try:
        asyncio.run(_run_padron())
    except Exception as e:
        logger.error(f"Error en job_padron: {e}")


# ── Runners async ─────────────────────────────────────────────────────────────


async def _run_cuentas():
    from motores.cuentas_corrientes import run
    resumen = await run()
    logger.info(
        f"CUENTAS completo — ok={resumen.get('ok', '?')}, "
        f"errores={resumen.get('errores', '?')}"
    )


async def _run_padron():
    from motores.padron import run
    resumen = await run()
    logger.info(
        f"PADRÓN completo — ok={resumen.get('ok', '?')}, "
        f"errores={resumen.get('errores', '?')}, "
        f"sin_cambios={resumen.get('sin_cambios', '?')}"
    )


async def _run_ventas():
    from motores.ventas import run
    resumen = await run()
    logger.info(
        f"VENTAS completo — ok={resumen.get('ok', '?')}, "
        f"errores={resumen.get('errores', '?')}, "
        f"sin_cambios={resumen.get('sin_cambios', '?')}"
    )


def job_ventas():
    logger.info("⏰ Trigger VENTAS")
    try:
        asyncio.run(_run_ventas())
    except Exception as e:
        logger.error(f"Error en job_ventas: {e}")


# ── Main ──────────────────────────────────────────────────────────────────────


def main():
    logger.info("=" * 60)
    logger.info("  ShelfMind RPA Scheduler — PADRÓN + CUENTAS (VENTAS deshabilitado)")
    from lib.shelfy_config import get_shelfy_base_url, get_shelfy_api_key
    from lib.vault_client import get_secret

    _b = get_shelfy_base_url()
    _k = "sí" if (get_shelfy_api_key() or "").strip() else "no"
    sb_url = (
        os.environ.get("SUPABASE_URL")
        or os.environ.get("supabase_url")
        or ""
    ).strip()
    sb_key = (
        os.environ.get("SUPABASE_SERVICE_KEY")
        or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("SUPABASE_KEY")
        or ""
    ).strip()
    consolido_user = get_secret("consolido_usuario") or get_secret("consolido_tabaco_usuario")
    consolido_pass = get_secret("consolido_password") or get_secret("consolido_tabaco_password")
    logger.info(f"  SHELFY base URL: {_b}  |  clave API: {_k}")
    logger.info(f"  Supabase Vault  : {'sí' if (sb_url and sb_key) else 'no'}")
    logger.info(
        "  Consolido creds: "
        f"user={'sí' if bool(consolido_user) else 'no'} "
        f"pass={'sí' if bool(consolido_pass) else 'no'}"
    )
    logger.info(f"  RPA_HEADLESS   : {os.environ.get('RPA_HEADLESS', 'true')}")
    logger.info(f"  Zona jobs AR   : {AR_TZ.key} (independiente de la región del host)")
    logger.info("=" * 60)

    scheduler = BackgroundScheduler(timezone=AR_TZ)

    scheduler.add_job(job_padron, CronTrigger(hour=7, minute=30, timezone=AR_TZ), id="padron_0730")

    for hi, mi in _SLOTS_CUENTAS:
        scheduler.add_job(
            job_cuentas,
            CronTrigger(hour=hi, minute=mi, timezone=AR_TZ),
            id=f"cuentas_{hi:02d}{mi:02d}",
        )

    scheduler.start()

    logger.info("Scheduler activo. Jobs programados (orden por próxima ejecución):")
    jobs = sorted(
        scheduler.get_jobs(),
        key=lambda j: (j.next_run_time is None, j.next_run_time or ""),
    )
    for job in jobs:
        logger.info(f"  [{job.id}] próxima ejecución: {job.next_run_time}")

    logger.info("Esperando... (Ctrl+C para detener)")
    try:
        while True:
            time.sleep(60)
    except (KeyboardInterrupt, SystemExit):
        logger.info("Deteniendo scheduler...")
        scheduler.shutdown()
        logger.info("Scheduler detenido.")


if __name__ == "__main__":
    main()