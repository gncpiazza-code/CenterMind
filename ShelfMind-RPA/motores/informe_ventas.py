# -*- coding: utf-8 -*-
"""
Motor: Informe de Ventas (Consolido / Reporteador Genérico)

Reglas clave:
- Reutiliza tenants de `rpa_consolido_tenants` (mismo modelo que padrón).
- Consolido: UN usuario/password; por tenant solo cambia el checkbox «Empresas» (id_empresa).
- Un solo login por corrida (sin re-login entre tenants).
- Fecha del reporte (AR):
  - Scheduler 09:30: últimos 7 días → ayer (mín. día 1 del mes).
  - Scheduler 13/17/21: últimos 7 días → hoy (mín. día 1 del mes).
  - Manual `mtd` / RPA_VENTAS_MODO=full_mtd: día 1 del mes → hoy (backfill).
  - Manual custom: `runner.py informe_ventas DD/MM/YYYY DD/MM/YYYY` o RPA_VENTAS_DESDE/HASTA.
"""

from __future__ import annotations

import asyncio
import os
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from playwright.async_api import async_playwright, Page

from lib.logger import get_logger
from lib.hash_guard import es_duplicado, guardar_hash
from lib.api_client import subir_ventas_enriched, notificar_error_motor
from lib.padron_schedule import padron_consolido_lock
from motores.padron import (
    _cargar_tenants_desde_supabase,
    _filtrar_tenants_para_debug,
    _resolver_credenciales_consolido,
    _navegar_y_login,
    _ejecutar_reporte,
    _descargar_excel,
    _cerrar_overlays,
    _esperar_comboboxes_parametros,
    _set_empresa_padron,
    seleccionar_proceso_reporteador,
    ADMIN_PROCESOS_URL,
    HEADLESS,
    COMBO_TIMEOUT_MS,
)

logger = get_logger("INFORME_VENTAS")
AR_TZ = ZoneInfo("America/Argentina/Buenos_Aires")
RPA_BASE_DIR = Path(os.environ.get("RPA_BASE_DIR", str(Path(__file__).resolve().parents[1])))
DOWNLOADS_DIR = RPA_BASE_DIR / "downloads"


_MESES_ES = (
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
)


def _fecha_label_calendario_es(d: date) -> str:
    return f"{d.day} de {_MESES_ES[d.month - 1]} de {d.year}"


def _parse_fecha_es(value: str) -> date:
    """DD/MM/YYYY o YYYY-MM-DD."""
    v = (value or "").strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(v, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Fecha inválida (use DD/MM/YYYY): {value}")


def _fecha_reporte_label_es(
    usar_fecha_hoy: bool,
    modo: str | None = None,
    *,
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
) -> tuple[date, str]:
    """Compat tests: etiqueta del día «desde» del rango."""
    desde, _, _ = _fecha_reporte_rango_es(
        usar_fecha_hoy,
        modo=modo,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
    )
    return desde, _fecha_label_calendario_es(desde)


def _resolve_modo_rango(modo: str | None, usar_fecha_hoy: bool) -> str:
    explicit = (modo or os.environ.get("RPA_VENTAS_MODO") or "").strip().lower()
    if explicit in ("full_mtd", "mtd", "mes_completo"):
        return "full_mtd"
    if explicit in ("rolling7", "ultimos7", "7d"):
        return "rolling7"
    return "rolling7"


def _fecha_reporte_rango_es(
    usar_fecha_hoy: bool,
    modo: str | None = None,
    *,
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
) -> tuple[date, date, str]:
    """
    Rango Fecha Desde / Fecha Hasta para el Informe de Ventas.

    - rolling7 (scheduler): últimos 7 días calendario, acotado al mes en curso.
    - full_mtd (manual): día 1 del mes → hoy.
    - custom: fechas explícitas (CLI o RPA_VENTAS_DESDE / RPA_VENTAS_HASTA).
    """
    env_desde = (os.environ.get("RPA_VENTAS_DESDE") or "").strip()
    env_hasta = (os.environ.get("RPA_VENTAS_HASTA") or "").strip()
    if fecha_desde is None and env_desde:
        fecha_desde = _parse_fecha_es(env_desde)
    if fecha_hasta is None and env_hasta:
        fecha_hasta = _parse_fecha_es(env_hasta)
    if fecha_desde is not None and fecha_hasta is not None:
        if fecha_desde > fecha_hasta:
            raise ValueError(
                f"Rango inválido: desde {fecha_desde} > hasta {fecha_hasta}"
            )
        return fecha_desde, fecha_hasta, "custom"

    hoy = datetime.now(AR_TZ).date()
    modo_eff = _resolve_modo_rango(modo, usar_fecha_hoy)
    inicio_mes = hoy.replace(day=1)

    if modo_eff == "full_mtd":
        return inicio_mes, hoy, "full_mtd"

    hasta = hoy if usar_fecha_hoy else hoy - timedelta(days=1)
    if hasta < inicio_mes:
        return hasta, hasta, "ayer"
    desde = max(inicio_mes, hasta - timedelta(days=6))
    return desde, hasta, "rolling7"


async def _esperar_panel_informe_ventas(page: Page) -> None:
    """Panel de parámetros: fechas y/o combobox Empresas."""
    await _cerrar_overlays(page)
    await page.wait_for_function(
        """
        () => {
          if (document.querySelectorAll('[role="combobox"]').length >= 1) return true;
          return Array.from(document.querySelectorAll('mat-form-field')).some(
            el => (el.textContent || '').includes('Fecha Desde')
          );
        }
        """,
        timeout=COMBO_TIMEOUT_MS,
    )
    await page.wait_for_timeout(600)


async def _abrir_reporteador_y_seleccionar_informe(page: Page) -> None:
    logger.info("  Seleccionando reporte: Informe de Ventas")

    async def _esperar_ui_reporteador(timeout_ms: int = 12_000) -> bool:
        try:
            await page.locator('select[formcontrolname="idproceso"]').first.wait_for(
                state="attached", timeout=timeout_ms
            )
            return True
        except Exception as e:
            logger.error(f"      _esperar_ui_reporteador: {e}")
            return False

    if "/dashboard" in page.url or "/login" in page.url:
        logger.info("  Navegando directo a administrador de procesos ...")
        try:
            await page.evaluate(
                """
                () => {
                  if (!window.location.href.includes('/parametrizaciones/reportes/administrador-de-procesos')) {
                    window.location.hash = '#/parametrizaciones/reportes/administrador-de-procesos';
                  }
                }
                """
            )
            await page.wait_for_function(
                "() => window.location.href.includes('/parametrizaciones/reportes/administrador-de-procesos')",
                timeout=8_000,
            )
        except Exception:
            await page.goto(ADMIN_PROCESOS_URL, wait_until="domcontentloaded", timeout=20_000)
        await page.wait_for_timeout(700)
    elif ADMIN_PROCESOS_URL.split("#")[-1] not in page.url:
        await page.goto(ADMIN_PROCESOS_URL, wait_until="domcontentloaded", timeout=20_000)
        await page.wait_for_timeout(1200)

    if not await _esperar_ui_reporteador(8_000):
        logger.warning("  UI Reporteador no lista; reintentando goto...")
        await page.goto(ADMIN_PROCESOS_URL, wait_until="domcontentloaded", timeout=20_000)
        await page.wait_for_timeout(1800)
        if not await _esperar_ui_reporteador(15_000):
            raise RuntimeError(
                f"No cargó administrador de procesos. URL: {page.url}"
            )

    try:
        await page.locator("text=/REPORTEADOR|Proceso|Parámetros/i").first.wait_for(
            state="visible", timeout=8_000
        )
        logger.info("  ✅ Página de Reporteador cargada")
    except Exception as e:
        logger.warning(f"  Timeout esperando heading reporteador: {e}")

    selected_label = await seleccionar_proceso_reporteador(
        page,
        must_include=("informe", "ventas"),
        must_exclude=("padron",),
        descripcion="Informe de Ventas",
    )

    await page.wait_for_timeout(1200)
    await _esperar_panel_informe_ventas(page)
    logger.info(f"  ✅ Panel de parámetros listo ({selected_label})")


async def _set_fechas_reporte(
    page: Page,
    *,
    usar_fecha_hoy: bool,
    modo: str | None = None,
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
) -> None:
    await _cerrar_overlays(page)
    desde, hasta, modo = _fecha_reporte_rango_es(
        usar_fecha_hoy,
        modo=modo,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
    )
    t = COMBO_TIMEOUT_MS
    for campo, fecha_obj in (("Fecha Desde", desde), ("Fecha Hasta", hasta)):
        label = _fecha_label_calendario_es(fecha_obj)
        await page.locator("mat-form-field").filter(has_text=campo).get_by_label(
            "Open calendar"
        ).click(timeout=t)
        await page.wait_for_timeout(400)
        await page.get_by_role("button", name=label, exact=True).click(timeout=t)
        await _cerrar_overlays(page)
        await page.wait_for_timeout(300)
    logger.info(
        "  ✅ Fecha desde/hasta (%s): %s → %s",
        modo,
        desde.isoformat(),
        hasta.isoformat(),
    )


async def _reporte_sin_movimientos(page: Page) -> bool:
    """True si el reporteador no devolvió filas (ej. domingo sin ventas)."""
    try:
        heading = await page.locator(
            "text=/Resultados\\s*\\(\\s*0\\s*\\)/i"
        ).first.text_content(timeout=3_000)
        return bool(heading and "0" in heading)
    except Exception:
        pass
    try:
        msg = await page.locator(
            "text=/sin resultados|no se encontraron|0 registros/i"
        ).first.text_content(timeout=2_000)
        return bool(msg)
    except Exception:
        return False


async def _preparar_siguiente_tenant(page: Page) -> None:
    """Tras exportar, cerrar overlays para el próximo tenant en la misma sesión."""
    await _cerrar_overlays(page)
    await page.wait_for_timeout(400)


def _ingest_local_sync(tenant_id: str, archivo: Path) -> dict:
    """Ingesta directa a Supabase (evita timeout Cloudflare en MTD grande)."""
    import sys

    cm = Path(__file__).resolve().parents[2] / "CenterMind"
    if str(cm) not in sys.path:
        sys.path.insert(0, str(cm))
    from services.ventas_enriched_ingestion_service import ingest_enriched

    return ingest_enriched(tenant_id, archivo.read_bytes())


def _force_ingest() -> bool:
    return os.environ.get("RPA_VENTAS_FORCE_INGEST", "").strip().lower() in (
        "1",
        "true",
        "yes",
    )


def _use_ingest_local() -> bool:
    return os.environ.get("RPA_VENTAS_INGEST_LOCAL", "").strip().lower() in (
        "1",
        "true",
        "yes",
    )


async def run(
    *,
    usar_fecha_hoy: bool = False,
    modo_rango: str | None = None,
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
) -> dict:
    """
    Exporta Informe de Ventas por tenant.

    Scheduler: rolling7 (7 días → ayer/hoy).
    Backfill manual: modo_rango=full_mtd o `runner.py informe_ventas mtd`.
    Rango custom: `runner.py informe_ventas 01/05/2026 06/05/2026`.
    """
    resumen = {"ok": 0, "errores": 0, "sin_cambios": 0, "detalle": [], "rango": {}}
    tenants = _filtrar_tenants_para_debug(_cargar_tenants_desde_supabase())
    if not tenants:
        return resumen

    desde, hasta, modo = _fecha_reporte_rango_es(
        usar_fecha_hoy,
        modo=modo_rango,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
    )
    resumen["rango"] = {
        "desde": desde.isoformat(),
        "hasta": hasta.isoformat(),
        "modo": modo,
    }
    logger.info(
        "INFORME_VENTAS inicio — rango=%s → %s (%s)",
        desde.isoformat(),
        hasta.isoformat(),
        modo,
    )

    usuario, password = _resolver_credenciales_consolido()

    with padron_consolido_lock():
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=HEADLESS)
            context = await browser.new_context(accept_downloads=True)
            page = await context.new_page()
            try:
                await _navegar_y_login(page, tenants[0], usuario, password)
                await _abrir_reporteador_y_seleccionar_informe(page)

                for tenant in tenants:
                    tid = str(tenant.get("id", ""))
                    item = {"tenant": tid, "ok": 0, "errores": 0, "sin_cambios": 0, "error_msg": None}
                    try:
                        logger.info(f"\n  ┌─ Procesando Informe Ventas: {tenant['nombre']}")
                        await _preparar_siguiente_tenant(page)
                        await _set_fechas_reporte(
                            page,
                            usar_fecha_hoy=usar_fecha_hoy,
                            modo=modo_rango,
                            fecha_desde=fecha_desde,
                            fecha_hasta=fecha_hasta,
                        )
                        await _esperar_comboboxes_parametros(page, min_count=1)
                        await _set_empresa_padron(page, tenant)
                        await _ejecutar_reporte(page)
                        if await _reporte_sin_movimientos(page):
                            logger.info(
                                "  ℹ️ Sin movimientos en el rango — omitiendo export/ingesta"
                            )
                            resumen["sin_cambios"] += 1
                            item["sin_cambios"] = 1
                            logger.info(
                                "  🏁 Tenant %s terminado — sin movimientos (OK)",
                                tid,
                            )
                            resumen["detalle"].append(item)
                            await asyncio.sleep(2)
                            continue
                        archivo = await _descargar_excel(
                            page, {"id": f"ventas_enriched_{tid}"}
                        )
                        if not archivo:
                            raise RuntimeError("No se pudo descargar excel de informe de ventas")

                        hk = f"ventas_enriched_{tid}"
                        skip_hash = _force_ingest() or modo in ("full_mtd", "custom")
                        if not skip_hash and es_duplicado(hk, str(archivo)):
                            logger.info("  ⏭️  Sin cambios (hash igual al anterior)")
                            resumen["sin_cambios"] += 1
                            item["sin_cambios"] = 1
                        else:
                            if _use_ingest_local():
                                logger.info(
                                    "  📥 Ingesta local Supabase (%s)...",
                                    archivo.name,
                                )
                                ingest_out = await asyncio.to_thread(
                                    _ingest_local_sync, tid, archivo
                                )
                                logger.info("  ✅ Ingesta local: %s", ingest_out)
                                item["ingest"] = ingest_out
                                if not ingest_out.get("ok"):
                                    raise RuntimeError(
                                        f"Ingesta local falló: {ingest_out}"
                                    )
                            else:
                                ok = await subir_ventas_enriched(archivo, tid)
                                if not ok:
                                    raise RuntimeError(
                                        "Upload ventas-enriched rechazado por API"
                                    )
                            guardar_hash(hk, str(archivo))
                            resumen["ok"] += 1
                            item["ok"] = 1
                            item["archivo"] = str(archivo)
                        logger.info(
                            "  🏁 Tenant %s terminado — ok=%s errores=%s sin_cambios=%s",
                            tid,
                            item["ok"],
                            item["errores"],
                            item["sin_cambios"],
                        )
                    except Exception as e:
                        logger.error(f"  ❌ Error tenant {tid}: {e}")
                        resumen["errores"] += 1
                        item["errores"] = 1
                        item["error_msg"] = str(e)[:500]
                        dist = int(tenant.get("id_dist") or tenant.get("id_distribuidor") or 0)
                        try:
                            await notificar_error_motor(
                                "ventas_enriched", dist, item["error_msg"]
                            )
                        except Exception as notify_exc:
                            logger.warning(
                                "No se pudo notificar error ventas dist=%s: %s",
                                dist,
                                notify_exc,
                            )
                        logger.info("  🏁 Tenant %s terminado — ERROR", tid)
                    resumen["detalle"].append(item)
                    await asyncio.sleep(2)
            finally:
                await context.close()
                await browser.close()

    logger.info(
        "INFORME_VENTAS resumen — ok=%s errores=%s sin_cambios=%s",
        resumen["ok"],
        resumen["errores"],
        resumen["sin_cambios"],
    )
    return resumen
