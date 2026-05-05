# -*- coding: utf-8 -*-
"""
Motor Cuentas Corrientes v2 (CHESS): Playwright para sesión + filtros + Procesar;
payload desde JSON de red (`ObtenerSaldoTotalDeudores`) si está disponible;
si no, mismo Excel + parser que v1. Real con split sucursal → delega a v1.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from playwright.async_api import Browser, BrowserContext, Page, async_playwright

from .json_heuristic import try_build_datos_from_capture
from .network_capture import ChessNetworkCapture
from .paths import CAPTURE_DIR, ensure_rpa_on_syspath

logger = logging.getLogger("motores.chess_cuentas_v2.motor")
CHROME_MAC_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def _configure_logging() -> None:
    if not logging.root.handlers:
        logging.basicConfig(
            level=os.environ.get("ENGINESV2_LOG_LEVEL", os.environ.get("RPA_LOG_LEVEL", "INFO")),
            format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        )


def _post_procesar_timeout_ms() -> int:
    raw = (os.environ.get("RPA_CUENTAS_V2_POST_MS") or "").strip()
    return int(raw) if raw.isdigit() else 180_000


async def _wait_for_cc_snapshot(
    page: Page,
    capture: ChessNetworkCapture,
    *,
    force_excel: bool,
    timeout_ms: int | None = None,
) -> None:
    """
    Tras Procesar: algunos CHESS muestran el botón Redefinir en DOM pero oculto (sticky toolbar),
    rompiendo wait_for(state=visible).

    Esperamos (en polling):
      - JSON ObtenerSaldoTotalDeudores en captura de red si no es force_excel, o
      - botón Redefinir solo attached (hay datos backend), o vence timeout y el flujo
        sigue hacia Excel (mismo tolerate que v1).
    """
    ensure_rpa_on_syspath()
    from motores.cuentas_corrientes import _cerrar_accesos_concurrentes

    total_ms = timeout_ms if timeout_ms is not None else _post_procesar_timeout_ms()
    t_end = time.monotonic() + total_ms / 1000.0
    loc_redef = page.locator('button.btn.btn-primary:has-text("Redefinir")')

    while time.monotonic() < t_end:
        try:
            await _cerrar_accesos_concurrentes(page)
        except Exception:
            pass

        if not force_excel:
            datos_chk, _ = try_build_datos_from_capture(capture.items)
            if datos_chk and len(datos_chk.get("detalle_cuentas") or []) > 0:
                logger.info(
                    "  CC v2: snapshot listo (JSON en red antes de botón visible) — %s filas",
                    len(datos_chk["detalle_cuentas"]),
                )
                return

        try:
            if await loc_redef.count() > 0:
                await loc_redef.first.wait_for(state="attached", timeout=1500)
                return
        except Exception:
            pass

        await page.wait_for_timeout(400)

    logger.warning(
        "  CC v2: sin JSON estable ni Redefinir en DOM dentro de %ds — continuando (export Excel)",
        total_ms // 1000,
    )


def _fingerprint_cuentas_datos(datos: dict[str, Any]) -> dict[str, Any]:
    import hashlib

    rows = datos.get("detalle_cuentas") or []
    sig: list[tuple[Any, ...]] = []
    for r in rows:
        sig.append(
            (
                str(r.get("cliente") or "").strip().lower(),
                str(r.get("vendedor") or "").strip().lower(),
                str(r.get("sucursal") or "").strip(),
                str(r.get("cod_cliente") or "").strip(),
                round(float(r.get("deuda_total") or 0), 2),
                int(r.get("antiguedad") or 0),
                int(r.get("cantidad_comprobantes") or 0),
            )
        )
    sig.sort()
    raw = json.dumps(sig, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return {
        "md5_detalle": hashlib.md5(raw).hexdigest(),
        "n_filas": len(rows),
        "metadatos": datos.get("metadatos"),
    }


def _tag_ok(resultado: dict[str, Any], datos: dict[str, Any]) -> None:
    resultado["filas"] = len(datos.get("detalle_cuentas") or [])
    resultado["motor_cc"] = "v2"


async def _run_hybrid_single_tenant(
    tenant: dict[str, Any],
    *,
    headless: bool | None,
    sniff_dump_path: Path | None,
    force_excel: bool,
    dry_run: bool,
    return_datos: bool,
) -> dict[str, Any]:
    ensure_rpa_on_syspath()
    from lib.hash_guard import es_duplicado, guardar_hash
    from motores.cuentas_corrientes import (
        TENANTS,
        _abrir_modal_exportacion,
        _cerrar_accesos_concurrentes,
        _cerrar_popup_nexty,
        _descargar_excel,
        _hacer_login,
        _navegar_y_procesar,
        _parsear_excel,
        _screenshot_error,
        _subir_a_api,
        TIMEOUT_MS,
    )
    from motores.cuentas_corrientes import _timestamp as ts_cc

    _ = TENANTS  # noqa: F841
    tenant_id = tenant["id"]
    resultado: dict[str, Any] = {
        "tenant": tenant_id,
        "nombre": tenant["nombre"],
        "estado": "error",
        "error": None,
        "fuente_datos": None,
        "motor_cc": "v2",
    }

    hl = headless if headless is not None else os.environ.get("RPA_HEADLESS", "true").lower() != "false"
    capture = ChessNetworkCapture()

    launch_kwargs: dict[str, Any] = {
        "headless": hl,
        "args": ["--no-sandbox", "--disable-dev-shm-usage"],
    }
    if os.path.exists(CHROME_MAC_PATH):
        launch_kwargs["executable_path"] = CHROME_MAC_PATH

    async with async_playwright() as pw:
        browser: Browser = await pw.chromium.launch(**launch_kwargs)
        context: BrowserContext = await browser.new_context(
            locale="es-AR",
            timezone_id="America/Argentina/Buenos_Aires",
            viewport={"width": 1280, "height": 800},
            accept_downloads=True,
        )
        page: Page = await context.new_page()
        page.set_default_timeout(TIMEOUT_MS)
        capture.attach(page)

        try:
            await _hacer_login(page, tenant)
            await _cerrar_popup_nexty(page)
            await _navegar_y_procesar(page, tenant)
            await _cerrar_accesos_concurrentes(page)
            await _wait_for_cc_snapshot(page, capture, force_excel=force_excel)
            await _cerrar_accesos_concurrentes(page)

            datos: dict | None = None
            fuente = "excel"

            if not force_excel:
                datos, url_json = try_build_datos_from_capture(capture.items)
                if datos and len(datos.get("detalle_cuentas") or []) > 0:
                    fuente = "network"
                    resultado["json_source_url"] = url_json
                    logger.info(
                        "  CC v2: payload desde red (%s filas) — %s",
                        len(datos["detalle_cuentas"]),
                        url_json or "?",
                    )
                else:
                    datos = None

            if not datos:
                await _abrir_modal_exportacion(page)
                file_bytes = await _descargar_excel(page, tenant_id)
                try:
                    await page.locator(
                        "kendo-dialog:not(#error-dialog) button.btn.btn-md.btn-default"
                    ).click()
                except Exception:
                    pass
                if not file_bytes:
                    resultado["error"] = "descarga Excel fallida"
                    await _screenshot_error(page, tenant_id, "descarga_v2")
                    return resultado

                clave_hash = f"cuentas_{tenant_id}"
                if es_duplicado(clave_hash, file_bytes):
                    resultado["estado"] = "sin_cambios"
                    resultado["fuente_datos"] = fuente
                    return resultado

                datos = _parsear_excel(file_bytes, tenant_id)
                if not datos:
                    resultado["error"] = "parseo Excel fallido"
                    return resultado

                if dry_run:
                    resultado["estado"] = "dry_run_ok"
                    resultado["metadatos"] = datos["metadatos"]
                    resultado["fuente_datos"] = fuente
                    resultado["fingerprint"] = _fingerprint_cuentas_datos(datos)
                    _tag_ok(resultado, datos)
                    if return_datos:
                        resultado["__datos"] = datos
                    return resultado

                filename = f"cuentas_{tenant_id}_{ts_cc()}.xlsx"
                ok = await _subir_a_api(tenant, datos, filename)
                if ok:
                    guardar_hash(clave_hash, file_bytes)
                    resultado["estado"] = "subida_ok"
                    resultado["metadatos"] = datos["metadatos"]
                    resultado["fuente_datos"] = fuente
                    _tag_ok(resultado, datos)
                else:
                    resultado["error"] = "subida API fallida"
                return resultado

            clave_hash = f"cuentas_{tenant_id}"
            firma = json.dumps(datos, sort_keys=True, default=str).encode("utf-8")
            if es_duplicado(clave_hash, firma):
                resultado["estado"] = "sin_cambios"
                resultado["fuente_datos"] = fuente
                resultado["metadatos"] = datos.get("metadatos")
                _tag_ok(resultado, datos)
                return resultado

            if dry_run:
                resultado["estado"] = "dry_run_ok"
                resultado["metadatos"] = datos["metadatos"]
                resultado["fuente_datos"] = fuente
                resultado["fingerprint"] = _fingerprint_cuentas_datos(datos)
                _tag_ok(resultado, datos)
                if return_datos:
                    resultado["__datos"] = datos
                return resultado

            filename = f"cuentas_{tenant_id}_{ts_cc()}_network.json"
            ok = await _subir_a_api(tenant, datos, filename)
            if ok:
                guardar_hash(clave_hash, firma)
                resultado["estado"] = "subida_ok"
                resultado["metadatos"] = datos["metadatos"]
                resultado["fuente_datos"] = fuente
                _tag_ok(resultado, datos)
            else:
                resultado["error"] = "subida API fallida"
            return resultado

        except Exception as e:
            resultado["error"] = str(e)[:400]
            logger.exception("run_tenant %s", tenant_id)
            try:
                await _screenshot_error(page, tenant_id, "v2")
            except Exception:
                pass
            return resultado
        finally:
            if sniff_dump_path:
                await capture.dump_jsonl(sniff_dump_path)
            await context.close()
            await browser.close()

    return resultado


async def run_tenant(
    tenant_id: str,
    *,
    headless: bool | None = None,
    sniff_dump: bool = False,
    force_excel: bool = False,
    dry_run: bool = False,
    return_datos: bool = False,
    sucursal_filter: str | None = None,
) -> dict[str, Any]:
    _configure_logging()
    ensure_rpa_on_syspath()
    from motores.cuentas_corrientes import TENANTS, _procesar_tenant

    tenant = next((t for t in TENANTS if t["id"] == tenant_id), None)
    if not tenant:
        return {"tenant": tenant_id, "estado": "error", "error": "tenant desconocido", "motor_cc": "v2"}
    if not tenant.get("activo", True):
        return {"tenant": tenant_id, "estado": "error", "error": "tenant inactivo", "motor_cc": "v2"}

    if tenant.get("split_por_sucursal"):
        logger.info("Tenant %s con split sucursal → motor v1 (Playwright completo).", tenant_id)
        r = await _procesar_tenant(tenant)
        r["motor_cc"] = "v1_split"
        return r

    tenant_eff: dict[str, Any] = dict(tenant)
    if sucursal_filter:
        tenant_eff["sucursal"] = sucursal_filter.strip()
        tenant_eff.pop("sucursales", None)

    dump_path = None
    if sniff_dump:
        CAPTURE_DIR.mkdir(parents=True, exist_ok=True)
        dump_path = CAPTURE_DIR / f"sniff_cuentas_{tenant_id}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.jsonl"

    return await _run_hybrid_single_tenant(
        tenant_eff,
        headless=headless,
        sniff_dump_path=dump_path,
        force_excel=force_excel,
        dry_run=dry_run,
        return_datos=return_datos,
    )


async def run_all_active(
    *,
    headless: bool | None = None,
    sniff_dump: bool = False,
    force_excel: bool = False,
    dry_run: bool = False,
    return_datos: bool = False,
    sucursal_filter: str | None = None,
) -> list[dict[str, Any]]:
    _configure_logging()
    ensure_rpa_on_syspath()
    from motores.cuentas_corrientes import TENANTS

    out: list[dict[str, Any]] = []
    for t in TENANTS:
        if not t.get("activo", True):
            continue
        out.append(
            await run_tenant(
                t["id"],
                headless=headless,
                sniff_dump=sniff_dump,
                force_excel=force_excel,
                dry_run=dry_run,
                return_datos=return_datos,
                sucursal_filter=sucursal_filter,
            )
        )
    return out


def main() -> None:
    _configure_logging()
    p = argparse.ArgumentParser(description="CHESS Cuentas Corrientes v2 (red + fallback Excel)")
    p.add_argument("--tenant", help="id tenant (tabaco, aloma, liver, …)")
    p.add_argument("--all", action="store_true", help="todos los activos")
    p.add_argument("--headed", action="store_true", help="Chromium visible")
    p.add_argument("--sniff-dump", action="store_true", help="Volcar JSON a logs/cuentas_v2_capture/")
    p.add_argument("--force-excel", action="store_true", help="Ignorar JSON de red")
    p.add_argument("--dry-run", action="store_true", help="No subir a API ni guardar hash")
    args = p.parse_args()
    headless = not args.headed

    async def _go() -> None:
        if args.all:
            res = await run_all_active(
                headless=headless,
                sniff_dump=args.sniff_dump,
                force_excel=args.force_excel,
                dry_run=args.dry_run,
            )
        elif args.tenant:
            res = [
                await run_tenant(
                    args.tenant,
                    headless=headless,
                    sniff_dump=args.sniff_dump,
                    force_excel=args.force_excel,
                    dry_run=args.dry_run,
                )
            ]
        else:
            p.error("Indicá --tenant ID o --all")
            return
        print(json.dumps(res, ensure_ascii=False, indent=2, default=str))

    asyncio.run(_go())


if __name__ == "__main__":
    main()
