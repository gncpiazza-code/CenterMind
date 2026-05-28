# -*- coding: utf-8 -*-
"""
Motor: Informe de Ventas (Consolido / Reporteador Genérico)

Reglas clave:
- Reutiliza tenants de `rpa_consolido_tenants` (mismo modelo que padrón).
- Consolido: UN usuario/password; por tenant solo cambia el checkbox «Empresas» (id_empresa).
- Un solo login por corrida (sin re-login entre tenants).
- Siempre consulta día anterior (fecha desde = fecha hasta = ayer).
"""

from __future__ import annotations

import asyncio
import os
from datetime import datetime, timedelta
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


def _fecha_ayer_label_es() -> str:
    meses = [
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
    ]
    d = datetime.now(AR_TZ).date() - timedelta(days=1)
    return f"{d.day} de {meses[d.month - 1]} de {d.year}"


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


async def _set_fechas_ayer(page: Page) -> None:
    await _cerrar_overlays(page)
    label = _fecha_ayer_label_es()
    t = COMBO_TIMEOUT_MS
    for campo in ("Fecha Desde", "Fecha Hasta"):
        await page.locator("mat-form-field").filter(has_text=campo).get_by_label(
            "Open calendar"
        ).click(timeout=t)
        await page.wait_for_timeout(400)
        await page.get_by_role("button", name=label, exact=True).click(timeout=t)
        await _cerrar_overlays(page)
        await page.wait_for_timeout(300)
    logger.info(f"  ✅ Fecha desde/hasta fijada en ayer: {label}")


async def _preparar_siguiente_tenant(page: Page) -> None:
    """Tras exportar, cerrar overlays para el próximo tenant en la misma sesión."""
    await _cerrar_overlays(page)
    await page.wait_for_timeout(400)


async def run() -> dict:
    resumen = {"ok": 0, "errores": 0, "sin_cambios": 0, "detalle": []}
    tenants = _filtrar_tenants_para_debug(_cargar_tenants_desde_supabase())
    if not tenants:
        return resumen

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
                        await _set_fechas_ayer(page)
                        await _esperar_comboboxes_parametros(page, min_count=1)
                        await _set_empresa_padron(page, tenant)
                        await _ejecutar_reporte(page)
                        archivo = await _descargar_excel(
                            page, {"id": f"ventas_enriched_{tid}"}
                        )
                        if not archivo:
                            raise RuntimeError("No se pudo descargar excel de informe de ventas")

                        hk = f"ventas_enriched_{tid}"
                        if es_duplicado(hk, str(archivo)):
                            logger.info("  ⏭️  Sin cambios (hash igual al anterior)")
                            resumen["sin_cambios"] += 1
                            item["sin_cambios"] = 1
                        else:
                            ok = await subir_ventas_enriched(archivo, tid)
                            if not ok:
                                raise RuntimeError("Upload ventas-enriched rechazado por API")
                            guardar_hash(hk, str(archivo))
                            resumen["ok"] += 1
                            item["ok"] = 1
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
