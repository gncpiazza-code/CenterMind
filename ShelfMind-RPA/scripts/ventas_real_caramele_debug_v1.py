#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Debug: Comprobantes de ventas con filtros tipo CARAMELE (empresa + tipos + sucursal).

Credenciales y lista de tenants: mismas reglas que motores/cuentas_corrientes
(Vault chess_*_usuario / chess_*_password, flag activo, etc.).

Tipos de documento: se normalizan con lib.chess_document_types — si el tenant no tiene
FACTURA PRESUPUESTO pero sí FACTURA, se elige FACTURA; igual para devolución.

Uso (desde ShelfMind-RPA):
  RPA_HEADLESS=false python scripts/ventas_real_caramele_debug_v1.py \\
    --tenant real --sucursal "GONZALEZ LUIS ANTONIO" \\
    --fecha-desde 06/04/2026 --fecha-hasta 12/04/2026
"""

from __future__ import annotations

import argparse
import asyncio
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from playwright.async_api import async_playwright, Browser, BrowserContext, Page

from lib.chess_document_types import seleccionar_tipos_documento_normalizado
from motores.cuentas_corrientes import (
    TENANTS,
    _cerrar_accesos_concurrentes,
    _cerrar_popup_nexty,
    _hacer_login,
)
from motores.ventas import (
    TIMEOUT_MS,
    _abrir_modal_exportacion,
    _completar_fechas,
    _configurar_sucursal,
    _descargar_del_modal,
)


def _tenant_por_id(tenant_id: str) -> dict:
    for t in TENANTS:
        if t["id"] == tenant_id:
            return dict(t)
    raise SystemExit(f"Tenant '{tenant_id}' no está en cuentas_corrientes.TENANTS")


async def _seleccionar_mat_option_por_texto(
    page: Page, label_regex: str, option_substring: str
) -> None:
    combo = page.get_by_role("combobox", name=re.compile(label_regex, re.I))
    await combo.first.wait_for(state="visible", timeout=TIMEOUT_MS)
    await combo.first.click()
    await page.wait_for_timeout(400)
    opt = page.locator("mat-option").filter(has_text=re.compile(re.escape(option_substring), re.I))
    await opt.first.wait_for(state="visible", timeout=TIMEOUT_MS)
    await opt.first.click()
    await page.keyboard.press("Escape")
    await page.wait_for_timeout(300)


async def run_debug(
    *,
    tenant_id: str,
    sucursal: str,
    fecha_desde: str,
    fecha_hasta: str,
    empresa_substring: str,
    grupos_tipos: list[tuple[str, list[str]]] | None,  # None → DEFAULT_TIPO_GRUPOS en lib
    headless: bool,
) -> None:
    tenant = _tenant_por_id(tenant_id)
    if not tenant.get("activo", True):
        raise SystemExit(f"Tenant '{tenant_id}' tiene activo=False — no se ejecuta.")

    (ROOT / "downloads").mkdir(parents=True, exist_ok=True)
    (ROOT / "logs" / "errors").mkdir(parents=True, exist_ok=True)

    async with async_playwright() as pw:
        browser: Browser = await pw.chromium.launch(
            headless=headless,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        context: BrowserContext = await browser.new_context(
            locale="es-AR",
            timezone_id="America/Argentina/Buenos_Aires",
            viewport={"width": 1280, "height": 800},
            accept_downloads=True,
        )
        page: Page = await context.new_page()
        page.set_default_timeout(TIMEOUT_MS)

        try:
            await _hacer_login(page, tenant)
            await _cerrar_popup_nexty(page)

            url_reporte = f"{tenant['url_base']}/#/ventas/reportes/comprobantes"
            await page.goto(url_reporte, wait_until="networkidle")
            await _cerrar_accesos_concurrentes(page)
            await page.locator("#mat-input-5").wait_for(state="visible", timeout=TIMEOUT_MS)

            await _seleccionar_mat_option_por_texto(page, r"Empresas?", empresa_substring)
            await seleccionar_tipos_documento_normalizado(page, grupos=grupos_tipos)
            await _configurar_sucursal(page, sucursal)

            await _completar_fechas(page, fecha_desde, fecha_hasta)
            await _abrir_modal_exportacion(page)

            resumido = await _descargar_del_modal(page, "resumido", f"{tenant_id}_debug")
            detallado = await _descargar_del_modal(page, "detallado", f"{tenant_id}_debug")
            print(
                f"OK — resumido={'%d bytes' % len(resumido) if resumido else 'None'}, "
                f"detallado={'%d bytes' % len(detallado) if detallado else 'None'}"
            )
            try:
                await page.locator("button.btn.btn-md.btn-default").click()
            except Exception:
                pass
        finally:
            await context.close()
            await browser.close()


def main() -> None:
    p = argparse.ArgumentParser(description="Debug ventas (mismas reglas tenant que cuentas corrientes)")
    p.add_argument("--tenant", default="real", help="id en TENANTS (tabaco, aloma, liver, real, …)")
    p.add_argument(
        "--sucursal",
        default="GONZALEZ LUIS ANTONIO",
        help='Texto exacto en el mat-select Sucursal (Real / multi-sucursal)',
    )
    p.add_argument("--fecha-desde", default="06/04/2026", help="DD/MM/YYYY")
    p.add_argument("--fecha-hasta", default="12/04/2026", help="DD/MM/YYYY")
    p.add_argument(
        "--empresa",
        default="CARAMELE",
        help="Substring para elegir empresa en el listado",
    )
    p.add_argument(
        "--tipos-manual",
        nargs="*",
        default=None,
        metavar="TIPO",
        help="Opcional: tipos exactos a marcar, uno por flag (sin alias). Sin este flag se usan grupos con normalización FACTURA PRESUPUESTO↔FACTURA, etc.",
    )
    p.add_argument(
        "--headless",
        action="store_true",
        help="Forzar headless (sin esto: misma regla RPA_HEADLESS que el resto de motores)",
    )
    args = p.parse_args()
    headless = True if args.headless else (os.environ.get("RPA_HEADLESS", "true").lower() != "false")

    # None → lib.chess_document_types.DEFAULT_TIPO_GRUPOS (con alias FACTURA PRESUPUESTO / FACTURA, etc.)
    if args.tipos_manual is None:
        grupos_tipos: list[tuple[str, list[str]]] | None = None
    else:
        grupos_tipos = [(f"m{i}", [t]) for i, t in enumerate(args.tipos_manual)]

    asyncio.run(
        run_debug(
            tenant_id=args.tenant,
            sucursal=args.sucursal,
            fecha_desde=args.fecha_desde,
            fecha_hasta=args.fecha_hasta,
            empresa_substring=args.empresa,
            grupos_tipos=grupos_tipos,
            headless=headless,
        )
    )


if __name__ == "__main__":
    main()
