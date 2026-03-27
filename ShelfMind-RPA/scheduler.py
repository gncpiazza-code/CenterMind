# -*- coding: utf-8 -*-
"""
scheduler.py
============
Proceso siempre activo que ejecuta los motores RPA en horario fijo.

Horarios (hora Argentina — America/Argentina/Buenos_Aires):
  04:00  Padrón de Clientes
  07:00  Cuentas Corrientes
  13:30  Ventas
  18:30  Ventas
  23:00  Ventas

Inicio: python scheduler.py
"""

import asyncio
import logging
import os
import sys
from datetime import datetime
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


# ── Wrappers síncronos para APScheduler ──────────────────────────────────────

def job_ventas():
    logger.info("⏰ Trigger VENTAS")
    try:
        asyncio.run(_run_ventas())
    except Exception as e:
        logger.error(f"Error en job_ventas: {e}")


def job_cuentas():
    logger.info("⏰ Trigger CUENTAS")
    try:
        asyncio.run(_run_cuentas())
    except Exception as e:
        logger.error(f"Error en job_cuentas: {e}")


def job_padron():
    logger.info("⏰ Trigger PADRÓN")
    try:
        asyncio.run(_run_padron())
    except Exception as e:
        logger.error(f"Error en job_padron: {e}")


# ── Runners async ─────────────────────────────────────────────────────────────

async def _run_ventas():
    from motores.ventas import run
    resumen = await run()
    logger.info(
        f"VENTAS completo — ok={resumen['ok']}, "
        f"sin_cambios={resumen['sin_cambios']}, "
        f"errores={resumen['errores']}, "
        f"duración={resumen['duracion_min']}min"
    )


async def _run_cuentas():
    from motores.cuentas_corrientes import run
    resumen = await run()
    logger.info(
        f"CUENTAS completo — ok={resumen.get('ok', '?')}, "
        f"errores={resumen.get('errores', '?')}"
    )


async def _run_padron():
    """
    El padrón se dispara via API (POST /api/motor/padron-trigger).
    Este job hace un simple HTTP call para que la API lo procese.
    """
    import httpx
    api_url = os.environ.get("SHELFY_API_URL", "").rstrip("/")
    api_key = os.environ.get("SHELFY_API_KEY", "")
    if not api_url:
        logger.warning("SHELFY_API_URL no configurado — saltando padrón")
        return
    try:
        resp = httpx.post(
            f"{api_url}/api/motor/padron-trigger",
            headers={"x-api-key": api_key},
            timeout=30,
        )
        logger.info(f"Padrón trigger → HTTP {resp.status_code}")
    except Exception as e:
        logger.error(f"Error disparando padrón: {e}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    logger.info("=" * 60)
    logger.info("  ShelfMind RPA Scheduler — iniciando")
    logger.info(f"  SHELFY_API_URL : {os.environ.get('SHELFY_API_URL', '(no seteado)')}")
    logger.info(f"  RPA_HEADLESS   : {os.environ.get('RPA_HEADLESS', 'true')}")
    logger.info("=" * 60)

    scheduler = BackgroundScheduler(timezone=AR_TZ)

    # Ventas: 07:00, 15:00 y 23:00 todos los días
    scheduler.add_job(job_ventas, CronTrigger(hour=7,  minute=0, timezone=AR_TZ), id="ventas_0700")
    scheduler.add_job(job_ventas, CronTrigger(hour=15, minute=0, timezone=AR_TZ), id="ventas_1500")
    scheduler.add_job(job_ventas, CronTrigger(hour=23, minute=0, timezone=AR_TZ), id="ventas_2300")

    # Cuentas: 07:00
    scheduler.add_job(job_cuentas, CronTrigger(hour=7, minute=0, timezone=AR_TZ), id="cuentas_0700")

    # Padrón: 04:00
    scheduler.add_job(job_padron, CronTrigger(hour=4, minute=0, timezone=AR_TZ), id="padron_0400")

    scheduler.start()

    logger.info("Scheduler activo. Jobs programados:")
    for job in scheduler.get_jobs():
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
