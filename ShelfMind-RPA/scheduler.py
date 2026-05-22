# -*- coding: utf-8 -*-
"""
scheduler.py
============
Proceso siempre activo para ejecutar motores RPA en horario Argentina.

Zona: America/Argentina/Buenos_Aires (independiente de la región del host, ej. us-west).

Horarios productivos (AR):
  - Padrón: 08:30, 11:30, 15:30, 18:30
  - Cuentas corrientes: 07:00, 14:30
  - Informe de ventas enriquecido: 09:30, 13:00, 17:00, 21:00 (cierre)

Monitorear CPU/RAM y “Accesos concurrentes” en CHESS según uso real.

Inicio: python scheduler.py
"""

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
import time

# ── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)-12s | %(levelname)-8s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("SCHEDULER")

AR_TZ = ZoneInfo("America/Argentina/Buenos_Aires")

# Cuentas corrientes (AR): 07:00, 14:30
_SLOTS_CUENTAS = [(7, 0), (14, 30)]
# Padrón (AR): 08:30, 11:30, 15:30, 18:30
_SLOTS_PADRON = [(8, 30), (11, 30), (15, 30), (18, 30)]
# Informe de ventas enriquecido (AR): 09:30, 13:00, 17:00, 21:00
_SLOTS_INFORME_VENTAS = [(9, 30), (13, 0), (17, 0), (21, 0)]


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
    from lib.api_client import enviar_digest_motor

    resumen = await run()
    logger.info(
        f"CUENTAS completo — ok={resumen.get('ok', '?')}, "
        f"errores={resumen.get('errores', '?')}"
    )
    detalle = []
    for r in resumen.get("detalle") or []:
        detalle.append({
            "tenant": r.get("tenant_id") or r.get("tenant"),
            "estado": r.get("estado"),
            "error": r.get("error"),
            "registros": r.get("registros"),
        })
    try:
        await enviar_digest_motor(
            "cuentas_corrientes",
            resumen={
                "ok": resumen.get("ok"),
                "errores": resumen.get("errores"),
                "sin_cambios": resumen.get("sin_cambios"),
                "duracion_min": resumen.get("duracion_min"),
            },
            detalle=detalle,
            since_hours=10,
        )
    except Exception as e:
        logger.warning(f"Digest Telegram CC omitido: {e}")


async def _run_padron():
    from motores.padron import run
    from lib.api_client import enviar_digest_motor

    resumen = await run()
    logger.info(
        f"PADRÓN completo — ok={resumen.get('ok', '?')}, "
        f"errores={resumen.get('errores', '?')}, "
        f"sin_cambios={resumen.get('sin_cambios', '?')}"
    )
    try:
        await enviar_digest_motor(
            "padron",
            resumen={
                "ok": resumen.get("ok"),
                "errores": resumen.get("errores"),
                "sin_cambios": resumen.get("sin_cambios"),
            },
            detalle=[],
            since_hours=10,
        )
    except Exception as e:
        logger.warning(f"Digest Telegram padrón omitido: {e}")


async def _run_ventas():
    from motores.informe_ventas import run
    resumen = await run()
    logger.info(
        f"INFORME_VENTAS completo — ok={resumen.get('ok', '?')}, "
        f"errores={resumen.get('errores', '?')}, "
        f"sin_cambios={resumen.get('sin_cambios', '?')}"
    )


def job_ventas():
    logger.info("⏰ Trigger VENTAS")
    try:
        asyncio.run(_run_ventas())
    except Exception as e:
        logger.error(f"Error en job_ventas: {e}")


def _hours_since_last_motor_run(motors: list[str]) -> float | None:
    """Edad en horas del último motor_run iniciado (padron / padron_global)."""
    url = (
        os.environ.get("SUPABASE_URL")
        or os.environ.get("supabase_url")
        or ""
    ).strip()
    key = (
        os.environ.get("SUPABASE_SERVICE_KEY")
        or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("SUPABASE_KEY")
        or ""
    ).strip()
    if not url or not key:
        return None
    try:
        from supabase import create_client

        sb = create_client(url, key)
        latest: str | None = None
        for motor in motors:
            res = (
                sb.table("motor_runs")
                .select("iniciado_en")
                .eq("motor", motor)
                .order("iniciado_en", desc=True)
                .limit(1)
                .execute()
            )
            row = (res.data or [{}])[0]
            ts = row.get("iniciado_en")
            if ts and (latest is None or str(ts) > str(latest)):
                latest = str(ts)
        if not latest:
            return None
        s = latest.replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - dt).total_seconds() / 3600
    except Exception as e:
        logger.warning("No se pudo consultar motor_runs para catch-up: %s", e)
        return None


def _maybe_schedule_stale_catchup(scheduler: BackgroundScheduler) -> None:
    """
    Si el servicio RPA estuvo caído y se perdieron slots cron, dispara catch-up al arranque.
    """
    if os.environ.get("RPA_DISABLE_STARTUP_CATCHUP", "").strip().lower() in (
        "1",
        "true",
        "yes",
    ):
        return

    padron_h = float(os.environ.get("RPA_PADRON_CATCHUP_HOURS", "10"))
    cc_h = float(os.environ.get("RPA_CC_CATCHUP_HOURS", "20"))

    age_padron = _hours_since_last_motor_run(["padron", "padron_global"])
    if age_padron is not None and age_padron >= padron_h:
        logger.warning(
            "Padrón desactualizado %.1fh (umbral %.1fh) — catch-up al iniciar scheduler",
            age_padron,
            padron_h,
        )
        scheduler.add_job(
            job_padron,
            DateTrigger(run_date=datetime.now(AR_TZ) + timedelta(seconds=45)),
            id="padron_catchup_startup",
            replace_existing=True,
            max_instances=1,
        )

    age_cc = _hours_since_last_motor_run(["cuentas_corrientes"])
    if age_cc is not None and age_cc >= cc_h:
        logger.warning(
            "CC desactualizadas %.1fh (umbral %.1fh) — catch-up al iniciar scheduler",
            age_cc,
            cc_h,
        )
        scheduler.add_job(
            job_cuentas,
            DateTrigger(run_date=datetime.now(AR_TZ) + timedelta(minutes=3)),
            id="cuentas_catchup_startup",
            replace_existing=True,
            max_instances=1,
        )


# ── Main ──────────────────────────────────────────────────────────────────────


def main():
    logger.info("=" * 60)
    logger.info("  ShelfMind RPA Scheduler — PADRÓN + CUENTAS + INFORME_VENTAS")
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

    job_defaults = {
        "coalesce": True,
        "max_instances": 1,
        "misfire_grace_time": 60 * 20,
    }

    for hi, mi in _SLOTS_PADRON:
        scheduler.add_job(
            job_padron,
            CronTrigger(hour=hi, minute=mi, timezone=AR_TZ),
            id=f"padron_{hi:02d}{mi:02d}",
            **job_defaults,
        )

    for hi, mi in _SLOTS_CUENTAS:
        scheduler.add_job(
            job_cuentas,
            CronTrigger(hour=hi, minute=mi, timezone=AR_TZ),
            id=f"cuentas_{hi:02d}{mi:02d}",
            **job_defaults,
        )

    for hi, mi in _SLOTS_INFORME_VENTAS:
        scheduler.add_job(
            job_ventas,
            CronTrigger(hour=hi, minute=mi, timezone=AR_TZ),
            id=f"informe_ventas_{hi:02d}{mi:02d}",
            **job_defaults,
        )

    scheduler.start()
    _maybe_schedule_stale_catchup(scheduler)

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