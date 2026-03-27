# -*- coding: utf-8 -*-
"""
runner.py
=========
Motores disponibles:
    python runner.py padron          <- Motor 1: Padron de Clientes (Consolido)
    python runner.py ventas          <- Motor 2: Comprobantes de Ventas (CHESS)
    python runner.py cuentas         <- Motor 3: Cuentas Corrientes (CHESS)
    python runner.py sigo            <- Motor 4: Reporte Sigo (Nextbyn)
    python runner.py todos           <- Todos los motores en secuencia

Ventas con fechas custom:
    python runner.py ventas 01/03/2026 14/03/2026
"""

import asyncio
import sys
import os
from datetime import datetime
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lib.logger import get_logger
from lib.vault_client import verificar_vault

logger = get_logger("RUNNER")
AR_TZ = ZoneInfo("America/Argentina/Buenos_Aires")


def _banner(motor: str) -> None:
    now = datetime.now(AR_TZ).strftime("%Y-%m-%d %H:%M:%S")
    logger.info("=" * 60)
    logger.info(f"  ShelfMind RPA -- Motor: {motor}")
    logger.info(f"  Inicio: {now}")
    logger.info("=" * 60)


def _verificar_vault_o_salir() -> None:
    logger.info("Verificando Supabase Vault...")
    if not verificar_vault():
        logger.error("Vault no configurado. Revisar lib/vault_client.py")
        sys.exit(1)


def _log_resumen(resumen: dict, nombre: str) -> None:
    errores = resumen.get("errores", 0)
    ok      = resumen.get("ok", 0)
    sc      = resumen.get("sin_cambios", 0)
    if errores == 0:
        logger.info(f"Motor {nombre} finalizado sin errores.")
    elif errores < ok + sc:
        logger.warning(f"Motor {nombre}: {errores} error(es). Ver logs/errors/")
    else:
        logger.error(f"Motor {nombre}: demasiados errores ({errores}).")


async def correr_padron() -> None:
    """Motor 1: Padron de Clientes (Consolido). Cron: 04:00 y 14:00."""
    _banner("PADRON -- Consolido")
    _verificar_vault_o_salir()
    from motores.padron import run as _run
    resumen = await _run()
    _log_resumen(resumen, "PADRON")


async def correr_ventas(fecha_desde: str = None, fecha_hasta: str = None) -> None:
    """Motor 2: Comprobantes de Ventas (CHESS). Cron: 13:30, 18:30, 23:00."""
    _banner("VENTAS -- CHESS ERP")
    _verificar_vault_o_salir()
    from motores.ventas import run as _run
    resumen = await _run(fecha_desde, fecha_hasta)
    _log_resumen(resumen, "VENTAS")


async def correr_cuentas() -> None:
    """Motor 3: Cuentas Corrientes / Saldos Totales (CHESS). Cron: 07:00."""
    _banner("CUENTAS CORRIENTES -- CHESS ERP")
    _verificar_vault_o_salir()
    from motores.cuentas_corrientes import run as _run
    resumen = await _run()
    _log_resumen(resumen, "CUENTAS")


async def correr_sigo() -> None:
    """Motor 4: Reporte Sigo (Nextbyn). Cron: 07:00."""
    _banner("SIGO -- Nextbyn")
    _verificar_vault_o_salir()
    from motores.sigo import run as _run
    resumen = await _run()
    _log_resumen(resumen, "SIGO")


async def main() -> None:
    if len(sys.argv) < 2:
        logger.error(
            "Falta el argumento del motor.\n"
            "Uso: python runner.py padron|ventas|cuentas|sigo|todos\n"
            "Ventas con fechas: python runner.py ventas DD/MM/YYYY DD/MM/YYYY"
        )
        sys.exit(1)

    motor       = sys.argv[1].lower().strip()
    fecha_desde = sys.argv[2] if len(sys.argv) > 2 else None
    fecha_hasta = sys.argv[3] if len(sys.argv) > 3 else None

    if motor == "padron":
        await correr_padron()
    elif motor == "ventas":
        await correr_ventas(fecha_desde, fecha_hasta)
    elif motor == "cuentas":
        await correr_cuentas()
    elif motor == "sigo":
        await correr_sigo()
    elif motor == "todos":
        logger.info("Corriendo todos los motores en secuencia...")
        await correr_padron()
        await asyncio.sleep(30)
        await correr_ventas()
        await asyncio.sleep(30)
        await correr_cuentas()
        await asyncio.sleep(30)
        await correr_sigo()
    else:
        logger.error(f"Motor desconocido: '{motor}'. Validos: padron, ventas, cuentas, sigo, todos")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
