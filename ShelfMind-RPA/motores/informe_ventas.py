# -*- coding: utf-8 -*-
"""
Motor: Informe de Ventas (Consolido / Reporteador Genérico)

Reglas clave:
- Reutiliza el MISMO split/tenants que padrón.
- Un solo login por corrida (sin re-login por tenant).
- Siempre consulta día anterior (fecha desde = fecha hasta = ayer).
"""

from __future__ import annotations

import asyncio
import os
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from playwright.async_api import async_playwright, Page, Download

from lib.logger import get_logger
from lib.hash_guard import es_duplicado, guardar_hash
from lib.api_client import subir_ventas_enriched
from motores.padron import (
    _cargar_tenants_desde_supabase,
    _filtrar_tenants_para_debug,
    _resolver_credenciales_consolido,
    _navegar_y_login,
    _ejecutar_reporte,
    _descargar_excel,
    ADMIN_PROCESOS_URL,
    HEADLESS,
    TIMEOUT_MS,
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


async def _abrir_reporteador_y_seleccionar_informe(page: Page) -> None:
    await page.goto(ADMIN_PROCESOS_URL, wait_until="domcontentloaded", timeout=20_000)
    await page.wait_for_timeout(1200)
    selected = await page.evaluate(
        """
        () => {
          const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
          const selects = Array.from(document.querySelectorAll('select'));
          for (const s of selects) {
            const opts = Array.from(s.options || []);
            const target = opts.find(o => norm(o.textContent).includes('informe de ventas') || norm(o.textContent).includes('ventas'));
            if (!target) continue;
            s.value = target.value;
            s.dispatchEvent(new Event('input', { bubbles: true }));
            s.dispatchEvent(new Event('change', { bubbles: true }));
            return { ok: true, selected: target.textContent?.trim() || target.value };
          }
          return { ok: false };
        }
        """
    )
    if not (selected and selected.get("ok")):
        raise RuntimeError("No se pudo seleccionar 'Informe de Ventas' en Reporteador")
    logger.info(f"  ✅ Reporte seleccionado: {selected.get('selected')}")


async def _set_fechas_ayer(page: Page) -> None:
    await _cerrar_overlays(page)
    label = _fecha_ayer_label_es()
    # Fecha Desde
    await page.locator("mat-form-field").filter(has_text="Fecha Desde").get_by_label("Open calendar").click(timeout=5000)
    await page.get_by_role("button", name=label, exact=True).click(timeout=5000)
    # Fecha Hasta
    await page.locator("mat-form-field").filter(has_text="Fecha Hasta").get_by_label("Open calendar").click(timeout=5000)
    await page.get_by_role("button", name=label, exact=True).click(timeout=5000)
    logger.info(f"  ✅ Fecha desde/hasta fijada en ayer: {label}")


async def _cerrar_overlays(page: Page) -> None:
    try:
        backdrops = page.locator(".cdk-overlay-backdrop.cdk-overlay-backdrop-showing")
        n = await backdrops.count()
        for i in range(n):
            await backdrops.nth(i).click(force=True)
            await page.wait_for_timeout(120)
    except Exception:
        pass
    try:
        await page.keyboard.press("Escape")
    except Exception:
        pass
    await page.wait_for_timeout(150)


async def _set_empresa_single(page: Page, tenant: dict) -> None:
    id_emp = str(tenant["id_empresa"])
    await _cerrar_overlays(page)
    # Abrir selector empresas usando el combobox Angular (estable entre tenants)
    await page.locator('[role="combobox"]').last.click(timeout=8000)
    await page.wait_for_timeout(700)

    # Limpiar selección existente (toggle sobre checkboxes marcados)
    # Limpiar selección existente de forma robusta (el DOM cambia en cada click)
    for _ in range(25):
        selected_options = page.locator('[role="option"][aria-selected="true"]')
        if await selected_options.count() == 0:
            break
        await selected_options.first.click(timeout=3000, force=True)
        await page.wait_for_timeout(120)

    # Seleccionar empresa objetivo por ID (mismo split que padrón)
    options = page.locator('[role="option"]')
    count = await options.count()
    selected = False
    for i in range(count):
        opt = options.nth(i)
        txt = ((await opt.text_content()) or "").strip()
        if f"({id_emp})" in txt:
            await opt.click(timeout=5000, force=True)
            selected = True
            break
    if not selected:
        raise RuntimeError(f"No se encontró empresa ({id_emp}) en selector de Empresas")

    # cerrar overlay
    await _cerrar_overlays(page)
    await page.wait_for_timeout(500)
    logger.info(f"  ✅ Empresa seleccionada: {tenant['nombre']} ({id_emp})")


async def run() -> dict:
    resumen = {"ok": 0, "errores": 0, "sin_cambios": 0}
    tenants = _filtrar_tenants_para_debug(_cargar_tenants_desde_supabase())
    usuario, password = _resolver_credenciales_consolido()

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=HEADLESS)
        context = await browser.new_context(accept_downloads=True)
        page = await context.new_page()
        # Login único (sin relogin por tenant)
        await _navegar_y_login(page, tenants[0], usuario, password)
        await _abrir_reporteador_y_seleccionar_informe(page)

        for tenant in tenants:
            try:
                logger.info(f"\n  ┌─ Procesando Informe Ventas: {tenant['nombre']}")
                await _set_fechas_ayer(page)
                await _set_empresa_single(page, tenant)
                await _ejecutar_reporte(page)
                archivo = await _descargar_excel(page, {"id": f"ventas_enriched_{tenant['id']}"})
                if not archivo:
                    raise RuntimeError("No se pudo descargar excel de informe de ventas")

                hk = f"ventas_enriched_{tenant['id']}"
                if es_duplicado(hk, str(archivo)):
                    logger.info("  ⏭️  Sin cambios (hash igual al anterior)")
                    resumen["sin_cambios"] += 1
                    continue

                ok = await subir_ventas_enriched(archivo, tenant["id"])
                if ok:
                    guardar_hash(hk, str(archivo))
                    resumen["ok"] += 1
                else:
                    resumen["errores"] += 1
            except Exception as e:
                logger.error(f"  ❌ Error tenant {tenant.get('id')}: {e}")
                resumen["errores"] += 1
            await asyncio.sleep(2)

        await context.close()
        await browser.close()
    return resumen

