# -*- coding: utf-8 -*-
"""
runner.py
=========
Motores disponibles:
    python runner.py padron          <- Padrón de Clientes (Consolido)
    python runner.py cuentas         <- Cuentas corrientes (CHESS)
    python runner.py informe_ventas  <- Informe de Ventas enriquecido (Consolido) — fuente ventas_enriched_v2
    python runner.py informe_ventas 01/06/2026 07/06/2026  <- rango custom (PADRON_DEBUG_TENANT=tabaco)
    python runner.py sigo            <- Reporte Sigo (Nextbyn)
    python runner.py rendcalle       <- Rendimiento en calle (Nextbyn)
    python runner.py todos           <- Motores activos en secuencia

Informe ventas: mtd | hoy | 7d | DD/MM/YYYY DD/MM/YYYY
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
    """Motor 1: Padrón de Clientes (Consolido/Nextbyn). Cron: 04:00 y 14:00."""
    _banner("PADRON -- Consolido Reporteador")
    _verificar_vault_o_salir()
    from motores.padron import run as _run
    resumen = await _run()
    _log_resumen(resumen, "PADRON")


async def correr_cuentas() -> None:
    """Motor 3: Cuentas Corrientes / Saldos Totales (CHESS). Scheduler: 07:30 y 17:30 AR."""
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


async def correr_rendcalle() -> None:
    """Motor 5: Rendimiento en calle (Nextbyn)."""
    _banner("RENDIMIENTO EN CALLE -- Nextbyn")
    _verificar_vault_o_salir()
    from motores.rendimiento_calle import run as _run
    resumen = await _run(os.environ.get("RENDCALLE_TENANT") or None)
    _log_resumen(resumen, "RENDCALLE")


def _arg_parece_fecha(s: str) -> bool:
    s = (s or "").strip()
    return "/" in s or (
        len(s) == 10 and s[4] == "-" and s[7] == "-"
    )


async def correr_informe_ventas(
    usar_fecha_hoy: bool = False,
    modo_rango: str | None = None,
    fecha_desde: str | None = None,
    fecha_hasta: str | None = None,
) -> None:
    """Motor 6: Informe de Ventas (Consolido Reporteador)."""
    _banner("INFORME VENTAS -- Consolido Reporteador")
    _verificar_vault_o_salir()
    from motores.informe_ventas import _parse_fecha_es, run as _run

    fd = _parse_fecha_es(fecha_desde) if fecha_desde else None
    fh = _parse_fecha_es(fecha_hasta) if fecha_hasta else None
    resumen = await _run(
        usar_fecha_hoy=usar_fecha_hoy,
        modo_rango=modo_rango,
        fecha_desde=fd,
        fecha_hasta=fh,
    )
    _log_resumen(resumen, "INFORME_VENTAS")


async def main() -> None:
    if len(sys.argv) < 2:
        logger.error(
            "Falta el argumento del motor.\n"
            "Uso: python runner.py padron|cuentas|informe_ventas|sigo|rendcalle|todos\n"
            "Informe ventas: python runner.py informe_ventas [mtd|hoy|7d|DD/MM/YYYY DD/MM/YYYY]"
        )
        sys.exit(1)

    motor       = sys.argv[1].lower().strip()
    fecha_desde = sys.argv[2] if len(sys.argv) > 2 else None
    fecha_hasta = sys.argv[3] if len(sys.argv) > 3 else None

    if motor == "padron":
        await correr_padron()
    elif motor == "ventas":
        logger.error(
            "Motor CHESS comprobantes (runner.py ventas) retirado. "
            "Usar: python runner.py informe_ventas"
        )
        sys.exit(1)
    elif motor == "cuentas":
        await correr_cuentas()
    elif motor == "sigo":
        await correr_sigo()
    elif motor == "rendcalle":
        await correr_rendcalle()
    elif motor == "informe_ventas":
        # rolling7 | hoy | mtd | DD/MM/YYYY DD/MM/YYYY (custom)
        usar_hoy = False
        modo_rango = None
        iv_desde = None
        iv_hasta = None
        args_iv = sys.argv[2:]
        i = 0
        while i < len(args_iv):
            arg = args_iv[i]
            a = arg.lower().strip()
            if (
                _arg_parece_fecha(arg)
                and i + 1 < len(args_iv)
                and _arg_parece_fecha(args_iv[i + 1])
            ):
                iv_desde, iv_hasta = arg, args_iv[i + 1]
                modo_rango = "custom"
                i += 2
                continue
            if a in ("hoy", "today", "1", "true"):
                usar_hoy = True
            elif a in ("mtd", "full_mtd", "mayo"):
                modo_rango = "full_mtd"
                usar_hoy = True
            elif a in ("7d", "rolling7"):
                modo_rango = "rolling7"
            i += 1
        await correr_informe_ventas(
            usar_fecha_hoy=usar_hoy,
            modo_rango=modo_rango,
            fecha_desde=iv_desde,
            fecha_hasta=iv_hasta,
        )
    elif motor == "todos":
        logger.info("Corriendo todos los motores en secuencia...")
        await correr_padron()
        await asyncio.sleep(30)
        await correr_cuentas()
        await asyncio.sleep(30)
        await correr_sigo()
        await asyncio.sleep(30)
        await correr_rendcalle()
        await asyncio.sleep(30)
        await correr_informe_ventas()
    else:
        logger.error(
            f"Motor desconocido: '{motor}'. "
            "Validos: padron, cuentas, informe_ventas, sigo, rendcalle, todos"
        )
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
