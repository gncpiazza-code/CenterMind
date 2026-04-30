# -*- coding: utf-8 -*-
from __future__ import annotations

import asyncio
import os
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from playwright.async_api import Browser, BrowserContext, Download, Page, async_playwright

from lib.logger import get_logger
from lib.vault_client import get_secret

logger = get_logger("REND_CALLE")
AR_TZ = ZoneInfo("America/Argentina/Buenos_Aires")
BASE_DIR = Path(__file__).resolve().parent.parent
DOWNLOADS_DIR = BASE_DIR / "downloads"
ERRORS_DIR = BASE_DIR / "logs" / "errors"
HEADLESS = os.environ.get("RPA_HEADLESS", "true").lower() != "false"
FAIL_FAST = os.environ.get("RENDCALLE_FAIL_FAST", "true").lower() != "false"
TIMEOUT_MS = 30_000
URL_LOGIN = "https://portal.nextbyn.com/"
URL_SIGO = "https://portal.nextbyn.com/modulos/mapas/sigo.aspx"

TENANTS = [
    {"id": "aloma", "nombre": "ALOMA (ALOMA S. R. L.)", "user_key": "rendcalle_aloma_usuario", "pass_key": "rendcalle_aloma_password", "id_dist": 4},
    {"id": "tabaco", "nombre": "CENA CRISTIAN - CORRIENTES - (TABACO & HNOS S. R. L)", "user_key": "rendcalle_tabaco_usuario", "pass_key": "rendcalle_tabaco_password", "id_dist": 3},
    {"id": "gyg", "nombre": "TATO (GOMEZ MARCOS ARIEL) (GYG)", "user_key": "rendcalle_gyg_usuario", "pass_key": "rendcalle_gyg_password", "id_dist": 6},
    {"id": "liver", "nombre": "URANGA RAMIRO (LIVER S. R. L.)", "user_key": "rendcalle_liver_usuario", "pass_key": "rendcalle_liver_password", "id_dist": 5},
    {
        "id": "real",
        "nombre": "REAL TABACALERA FRANQUICIADOS",
        "user_key": "rendcalle_real_usuario",
        "pass_key": "rendcalle_real_password",
        "id_dist": 2,
        "split_por_sucursal": {
            "uequin rodrigo": 2,
            "oscar ondarreta": 3,
            "jose ignacio biava": 4,
        },
    },
]


def _ts() -> str:
    return datetime.now(AR_TZ).strftime("%Y%m%d_%H%M%S")


def _fecha_ayer() -> str:
    d = datetime.now(AR_TZ) - timedelta(days=1)
    # Formato usado por Nextbyn (sin padding)
    return f"{d.day}/{d.month}/{d.year}"


def _dia_ayer_str() -> str:
    return str((datetime.now(AR_TZ) - timedelta(days=1)).day)


def _norm(s: str) -> str:
    return " ".join((s or "").strip().lower().split())


def _dist_destino(tenant: dict, sucursal: str) -> int:
    split = tenant.get("split_por_sucursal") or {}
    return split.get(_norm(sucursal), tenant["id_dist"])


def _filtrar_sucursales_objetivo(tenant: dict, sucursales: list[str]) -> list[str]:
    """
    Si el tenant define split por sucursal (caso real franquiciados),
    procesamos solo esas sucursales objetivo.
    """
    split = tenant.get("split_por_sucursal") or {}
    if not split:
        return sucursales
    wanted = set(split.keys())
    filtered = [s for s in sucursales if _norm(s) in wanted]
    return filtered


async def _shot(page: Page, name: str) -> None:
    try:
        ERRORS_DIR.mkdir(parents=True, exist_ok=True)
        await page.screenshot(path=str(ERRORS_DIR / f"error_rendcalle_{name}_{_ts()}.png"), full_page=True)
    except Exception:
        pass


async def _download(page: Page, click_locator: str, fallback_name: str) -> bytes | None:
    try:
        await _esperar_ui_lista(page)
        btn = page.locator(click_locator).first
        dl: Download | None = None
        for _ in range(2):
            try:
                async with page.expect_download(timeout=40_000) as info:
                    try:
                        await btn.click(timeout=10_000, no_wait_after=True)
                    except Exception:
                        await btn.click(timeout=10_000, force=True, no_wait_after=True)
                dl = await info.value
                break
            except Exception:
                await _esperar_ui_lista(page)
                continue
        if dl is None:
            raise RuntimeError("No se disparo download")
        DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
        p = DOWNLOADS_DIR / (dl.suggested_filename or fallback_name)
        await dl.save_as(str(p))
        b = p.read_bytes()
        logger.info(f"    ✅ Descargado {p.name} ({len(b)/1024:.1f} KB)")
        return b
    except Exception as e:
        logger.error(f"    ❌ Error descarga {fallback_name}: {e}")
        return None


async def _download_grilla_alertas(page: Page, fallback_name: str) -> bytes | None:
    try:
        await _forzar_fecha_ayer_popup(page)
        await _esperar_ui_lista(page)
        async with page.expect_download(timeout=120_000) as info:
            btn = page.get_by_role("cell", name="Exportar a XLSX Exportar a").locator("span").first
            try:
                await btn.click(timeout=10_000, no_wait_after=True)
            except Exception:
                await btn.click(timeout=10_000, force=True, no_wait_after=True)
        dl: Download = await info.value
        DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
        p = DOWNLOADS_DIR / (dl.suggested_filename or fallback_name)
        await dl.save_as(str(p))
        b = p.read_bytes()
        logger.info(f"    ✅ Descargado {p.name} ({len(b)/1024:.1f} KB)")
        return b
    except Exception as e:
        logger.error(f"    ❌ Error descarga {fallback_name}: {e}")
        return None


async def _download_pdv(page: Page, fallback_name: str) -> bytes | None:
    """
    En PDV, en algunos tenants el export no dispara hasta aplicar cambios.
    """
    try:
        # Flujo literal del codegen para PDV.
        dia = _dia_ayer_str()
        await _forzar_fecha_ayer_popup(page)
        await _esperar_ui_lista(page)
        try:
            await page.locator("#ContentPlaceHolder2_popupClientes_deFechaDesdeC_B-1").first.click(timeout=6_000)
            await page.get_by_role("cell", name=dia, exact=True).first.click(timeout=8_000)
            await page.locator("#ContentPlaceHolder2_popupClientes_deFechaHastaC_B-1").first.click(timeout=6_000)
            await page.get_by_role("cell", name=dia, exact=True).first.click(timeout=8_000)
            await page.locator("#ContentPlaceHolder2_popupClientes_btnAplicarAlertasC_CD").first.click(timeout=8_000)
            await _esperar_ui_lista(page)
        except Exception:
            try:
                await page.get_by_role("cell", name="Aplicar cambios Aplicar").locator("span").first.click(timeout=8_000)
                await _esperar_ui_lista(page)
            except Exception:
                pass
        # Selector del codegen para este popup.
        try:
            await _esperar_ui_lista(page)
            async with page.expect_download(timeout=60_000) as info:
                await page.get_by_role("cell", name="Exportar a XLS Exportar a XLS").locator("span").first.click()
            dl: Download = await info.value
            DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
            p = DOWNLOADS_DIR / (dl.suggested_filename or fallback_name)
            await dl.save_as(str(p))
            b = p.read_bytes()
            logger.info(f"    ✅ Descargado {p.name} ({len(b)/1024:.1f} KB)")
            return b
        except Exception:
            return await _download(page, "#ContentPlaceHolder2_popupClientes_btnXlsExportC_CD", fallback_name)
    except Exception as e:
        logger.error(f"    ❌ Error descarga {fallback_name}: {e}")
        return None


async def _download_rutas(page: Page, fallback_name: str) -> bytes | None:
    # Intento 1: id conocido XLSX
    b = await _download(page, "#ContentPlaceHolder2_popupRuta_btnXlsxExportR_CD", fallback_name)
    if b:
        return b
    # Intento 2: selector de celda por texto (codegen-like)
    try:
        await _esperar_ui_lista(page)
        async with page.expect_download(timeout=60_000) as info:
            await page.get_by_role("cell", name="Exportar a XLSX Exportar a").locator("span").first.click()
        dl: Download = await info.value
        DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
        p = DOWNLOADS_DIR / (dl.suggested_filename or fallback_name)
        await dl.save_as(str(p))
        b = p.read_bytes()
        logger.info(f"    ✅ Descargado {p.name} ({len(b)/1024:.1f} KB)")
        return b
    except Exception:
        pass
    # Intento 3: XLS
    return await _download(page, "#ContentPlaceHolder2_popupRuta_btnXlsExportR_CD", fallback_name.replace(".xlsx", ".xls"))


async def _download_dispositivos(page: Page, fallback_name: str) -> bytes | None:
    # Flujo literal del codegen para este popup en Real.
    try:
        await _esperar_ui_lista(page)
        async with page.expect_download(timeout=60_000) as info:
            await page.get_by_role("cell", name="Exportar a XLSX Exportar a").locator("span").first.click()
        dl: Download = await info.value
        DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
        p = DOWNLOADS_DIR / (dl.suggested_filename or fallback_name)
        await dl.save_as(str(p))
        b = p.read_bytes()
        logger.info(f"    ✅ Descargado {p.name} ({len(b)/1024:.1f} KB)")
        return b
    except Exception:
        pass
    # Fallback por IDs conocidos
    b = await _download(page, "#ContentPlaceHolder2_popupGrilla_btnXlsxExport_CD", fallback_name)
    if b:
        return b
    return await _download(page, "#ContentPlaceHolder2_popupGrilla_btnXlsExport_CD", fallback_name.replace(".xlsx", ".xls"))


def _secret_user(tenant: dict) -> str:
    return get_secret(tenant["user_key"]) or get_secret(tenant["user_key"].replace("rendcalle_", "sigo_"))


def _secret_pass(tenant: dict) -> str:
    return get_secret(tenant["pass_key"]) or get_secret(tenant["pass_key"].replace("rendcalle_", "sigo_"))


async def _login(page: Page, tenant: dict) -> None:
    user, pwd = _secret_user(tenant), _secret_pass(tenant)
    if not user or not pwd:
        raise RuntimeError(f"Credenciales faltantes para tenant={tenant['id']} en env/vault")
    await page.goto(URL_LOGIN, wait_until="networkidle")
    await page.get_by_role("textbox", name="Ingrese su usuario...").fill(user)
    await page.get_by_role("textbox", name="Ingrese su password...").fill(pwd)
    await page.get_by_role("button", name="Ingresar").click()
    try:
        await page.get_by_text("Aceptar", exact=False).first.click(timeout=4_000)
    except Exception:
        pass
    await _esperar_ui_lista(page)


async def _abrir_modulo(page: Page) -> None:
    try:
        await page.goto(URL_SIGO, wait_until="domcontentloaded")
        await page.get_by_role("link", name="Entorno").first.wait_for(state="visible", timeout=20_000)
        await _esperar_ui_lista(page)
        return
    except Exception:
        await page.get_by_role("button", name="Toggle navigation").click()
        await page.get_by_role("link", name="Sigo").click()
        await page.get_by_role("link", name="Seguimiento Diario").click()


async def _leer_sucursales(page: Page) -> list[str]:
    await _abrir_popup_entorno(page)
    opened = False
    for opener in (
        page.locator("#ContentPlaceHolder2_Popup_cmbxSucursal_B-1Img").first,
        page.locator("#ContentPlaceHolder2_Popup_cmbxSucursal_B-1").first,
        page.get_by_role("textbox", name="Sucursal:").first,
    ):
        try:
            await opener.click(timeout=6_000)
            opened = True
            break
        except Exception:
            continue
    if not opened:
        raise RuntimeError("No se pudo abrir dropdown de sucursales en Entorno")
    rows = page.locator("[id^='ContentPlaceHolder2_Popup_cmbxSucursal_DDD_L_LBI']")
    n = await rows.count()
    suc = []
    for i in range(n):
        t = (await rows.nth(i).inner_text()).strip()
        if t:
            suc.append(t)
    await page.keyboard.press("Escape")
    return suc


async def _set_sucursal(page: Page, sucursal: str) -> None:
    # Replica del codegen real: Entorno -> open combo (varias formas) -> cell -> Aplicar.
    await _abrir_popup_entorno(page)

    openers = [
        page.locator("#ContentPlaceHolder2_Popup_cmbxSucursal_B-1"),
        page.locator("#ContentPlaceHolder2_Popup_cmbxSucursal_B-1Img"),
        page.get_by_role("textbox", name="Sucursal:"),
    ]

    selected = False
    for opener in openers:
        try:
            await opener.first.click(timeout=6_000)
            await _esperar_ui_lista(page)
            cell = page.get_by_role("cell", name=sucursal, exact=True).first
            try:
                await cell.click(timeout=8_000)
            except Exception:
                await cell.click(timeout=8_000, force=True)
            selected = True
            break
        except Exception:
            continue

    if not selected:
        raise RuntimeError(f"No se pudo seleccionar sucursal '{sucursal}'")
    await _esperar_ui_lista(page)

    # Fecha de entorno = ayer (evita que a las 00:00 tome hoy por defecto).
    await _set_fecha_entorno_ayer(page)


async def _abrir_popup_entorno(page: Page) -> None:
    suc_textbox = page.get_by_role("textbox", name="Sucursal:").first
    try:
        await suc_textbox.wait_for(state="visible", timeout=1200)
        return
    except Exception:
        pass
    for opener in (
        page.get_by_role("link", name="Entorno").first,
        page.locator("#ContentPlaceHolder2_btnEntorno").first,
    ):
        try:
            await opener.click(timeout=8_000)
            await _esperar_ui_lista(page)
            await suc_textbox.wait_for(state="visible", timeout=8_000)
            return
        except Exception:
            continue
    # ultimo intento: volver a inicio y reabrir
    await page.get_by_text("Inicio", exact=False).first.click(timeout=8_000)
    await _esperar_ui_lista(page)
    await page.locator("#ContentPlaceHolder2_btnEntorno").first.click(timeout=8_000)
    await _esperar_ui_lista(page)
    await suc_textbox.wait_for(state="visible", timeout=8_000)


async def _esperar_ui_lista(page: Page) -> None:
    """
    Nextbyn levanta un overlay de carga (lpGeneral_LD) que bloquea clicks.
    Esperamos su desaparicion antes de interactuar.
    """
    overlay = page.locator("#lpGeneral_LD")
    try:
        await overlay.wait_for(state="hidden", timeout=15_000)
    except Exception:
        # fallback corto para estados intermedios de render
        await page.wait_for_timeout(500)


async def _forzar_fecha_ayer_popup(page: Page) -> None:
    """
    Evita que a las 00:00 quede fecha de hoy por defecto:
    fuerza Desde/Hasta a ayer en el popup activo.
    """
    fecha = _fecha_ayer()
    selectors = [
        "input[id*='deFechaDesde']:visible",
        "input[id*='deFechaHasta']:visible",
    ]
    changed = 0
    for sel in selectors:
        loc = page.locator(sel)
        n = await loc.count()
        for i in range(n):
            inp = loc.nth(i)
            try:
                await inp.click(timeout=2000)
                await inp.press("Control+a")
                await inp.fill(fecha)
                await page.keyboard.press("Tab")
                changed += 1
            except Exception:
                continue

    if changed:
        # Intentar aplicar cambios para refrescar grilla.
        botones = [
            page.get_by_role("cell", name="Aplicar cambios Aplicar").locator("span").first,
            page.get_by_text("Aplicar Aplicar", exact=False).first,
            page.locator("#ContentPlaceHolder2_popupClientes_btnAplicarAlertasC_I"),
            page.locator("#ContentPlaceHolder2_popupAlertasGrilla_btnAplicarAlertas_I"),
            page.locator("#ContentPlaceHolder2_popupVentaFueraRuta_btnAplicarAlertaFR_I"),
        ]
        for b in botones:
            try:
                await b.click(timeout=2500)
                break
            except Exception:
                continue
        await _esperar_ui_lista(page)


async def _set_fecha_entorno_ayer(page: Page) -> None:
    """
    Flujo literal del codegen del usuario en popup Entorno:
    click Fecha -> abrir calendario -> elegir dia (ayer) -> Aplicar.
    """
    d = datetime.now(AR_TZ) - timedelta(days=1)
    dia = str(d.day)

    fecha_txt = f"{d.day:02d}/{d.month:02d}/{d.year}"
    inp = page.get_by_role("textbox", name="Fecha:").first

    # 1) Flujo exacto compartido por usuario: fill + Enter + HCB-1
    await inp.click(timeout=8_000)
    await inp.press("Control+a")
    await inp.fill(fecha_txt)
    await inp.press("Enter")
    try:
        await page.locator("#ContentPlaceHolder2_Popup_HCB-1").first.click(timeout=8_000)
    except Exception:
        pass

    # 2) Segunda pasada: calendario + dia + aplicar (como en codegen)
    try:
        await page.get_by_role("link", name="Entorno").first.click(timeout=8_000)
    except Exception:
        pass
    await _esperar_ui_lista(page)
    try:
        await page.locator("#ContentPlaceHolder2_Popup_deFecha_B-1").first.click(timeout=8_000)
        await page.get_by_role("cell", name=dia, exact=True).first.click(timeout=8_000)
    except Exception:
        await inp.click(timeout=5_000)
        await inp.press("Control+a")
        await inp.fill(fecha_txt)
        await inp.press("Enter")
    try:
        await page.get_by_role("cell", name="Aplicar Aplicar").locator("span").first.click(timeout=8_000)
    except Exception:
        try:
            await page.locator("#ContentPlaceHolder2_Popup_btnAplicarImg").first.click(timeout=8_000)
        except Exception:
            pass
    await _esperar_ui_lista(page)


async def _aplicar_entorno(page: Page) -> None:
    """
    Click explicito en el boton Aplicar del popup Entorno.
    """
    # Priorizar el ID exacto que pasaste.
    try:
        await page.locator("#ContentPlaceHolder2_Popup_btnAplicarImg").first.click(timeout=8_000)
    except Exception:
        await page.locator("#ContentPlaceHolder2_Popup_btnAplicar").first.click(timeout=8_000)

    await _esperar_ui_lista(page)
    # Si cierra popup, mejor; si no, seguimos igual.
    try:
        await page.get_by_role("textbox", name="Sucursal:").first.wait_for(state="hidden", timeout=5_000)
    except Exception:
        pass


async def _close_popup(page: Page) -> None:
    try:
        await page.get_by_role("img", name="[Cerrar]").first.click(timeout=5_000)
    except Exception:
        pass


async def _procesar_sucursal(page: Page, tenant: dict, sucursal: str) -> dict:
    dest = _dist_destino(tenant, sucursal)
    logger.info(f"  ── Sucursal '{sucursal}' (dist destino={dest})")
    out = {"sucursal": sucursal, "dist_destino": dest, "dispositivos": False, "pdv": False, "rutas": False, "grilla": False, "error": None}
    try:
        await _set_sucursal(page, sucursal)
        await page.keyboard.press("Escape")
        await _esperar_ui_lista(page)

        # Codegen real: volver a Inicio antes de Dispositivos.
        try:
            await page.get_by_text("Inicio ?", exact=False).first.click(timeout=6_000)
        except Exception:
            pass
        try:
            await page.get_by_text("Inicio ▶", exact=False).first.click(timeout=6_000)
        except Exception:
            pass
        await _esperar_ui_lista(page)

        await _click_menu(page, "#ContentPlaceHolder2_btnDatos")
        out["dispositivos"] = bool(await _download_dispositivos(page, f"rendcalle_{tenant['id']}_{_ts()}_dispositivos.xlsx"))
        if not out["dispositivos"]:
            raise RuntimeError("Fallo descarga Dispositivos")
        await _close_popup(page)

        await _click_menu(page, "#ContentPlaceHolder2_btnClientes")
        out["pdv"] = bool(await _download_pdv(page, f"rendcalle_{tenant['id']}_{_ts()}_pdv.xls"))
        if not out["pdv"]:
            raise RuntimeError("Fallo descarga Puntos de venta")
        await _close_popup(page)

        await _click_menu(page, "#ContentPlaceHolder2_btnRutas")
        out["rutas"] = bool(await _download_rutas(page, f"rendcalle_{tenant['id']}_{_ts()}_rutas.xlsx"))
        if not out["rutas"]:
            raise RuntimeError("Fallo descarga Rutas de venta")
        await _close_popup(page)

        try:
            await page.get_by_text("Alertas ?", exact=False).first.click(timeout=12_000)
        except Exception:
            await _click_menu(page, "div.categoria-menu-sigo:has-text('Alertas')")
        await _esperar_ui_lista(page)
        await page.get_by_role("link", name="Grilla de ventas a clientes").first.click(timeout=12_000)
        await _esperar_ui_lista(page)
        out["grilla"] = bool(await _download_grilla_alertas(page, f"rendcalle_{tenant['id']}_{_ts()}_grilla.xlsx"))
        if not out["grilla"]:
            raise RuntimeError("Fallo descarga Grilla de ventas a clientes")
        await _close_popup(page)
    except Exception as e:
        out["error"] = str(e)[:300]
        logger.error(f"    ❌ Error sucursal '{sucursal}': {out['error']}")
        await _shot(page, f"{tenant['id']}_{_norm(sucursal).replace(' ', '_')}")
    return out


async def _procesar_tenant(tenant: dict) -> dict:
    res = {"tenant": tenant["id"], "nombre": tenant["nombre"], "sucursales": [], "error": None}
    async with async_playwright() as pw:
        browser: Browser = await pw.chromium.launch(headless=HEADLESS, args=["--no-sandbox", "--disable-dev-shm-usage"])
        context: BrowserContext = await browser.new_context(locale="es-AR", timezone_id="America/Argentina/Buenos_Aires", viewport={"width": 1366, "height": 768}, accept_downloads=True)
        page = await context.new_page()
        page.set_default_timeout(TIMEOUT_MS)
        try:
            await _login(page, tenant)
            await _abrir_modulo(page)
            todas = await _leer_sucursales(page)
            sucursales = _filtrar_sucursales_objetivo(tenant, todas)
            logger.info(f"  Sucursales ({tenant['id']}) detectadas: {todas}")
            logger.info(f"  Sucursales ({tenant['id']}) objetivo: {sucursales}")
            for s in sucursales:
                r_suc = await _procesar_sucursal(page, tenant, s)
                res["sucursales"].append(r_suc)
                if FAIL_FAST and r_suc.get("error"):
                    raise RuntimeError(f"Fail-fast activado: error en sucursal '{s}'")
        except Exception as e:
            res["error"] = str(e)[:300]
            logger.error(f"  ❌ Error tenant {tenant['id']}: {res['error']}")
            await _shot(page, tenant["id"])
        finally:
            await context.close()
            await browser.close()
    return res


async def _click_menu(page: Page, selector: str) -> None:
    loc = page.locator(selector).first
    await _esperar_ui_lista(page)
    try:
        await loc.click(timeout=12_000, no_wait_after=True)
    except Exception:
        await loc.click(timeout=12_000, force=True, no_wait_after=True)
    await _esperar_ui_lista(page)


async def run(tenant_only: str | None = None) -> dict:
    tenants = [t for t in TENANTS if not tenant_only or t["id"] == tenant_only]
    out = []
    for t in tenants:
        logger.info(f"\n{'='*40}\n🏢 {t['nombre']}\n{'='*40}")
        r = await _procesar_tenant(t)
        out.append(r)
        errs = sum(1 for s in r["sucursales"] if s.get("error"))
        logger.info(f"  Resultado {t['id']}: sucursales={len(r['sucursales'])} errores_suc={errs} fatal={bool(r.get('error'))}")

    ok = sum(
        1 for r in out
        if not r.get("error") and not any(s.get("error") for s in r.get("sucursales", []))
    )
    err = len(out) - ok
    return {
        "motor": "RENDIMIENTO_CALLE",
        "timestamp": datetime.now(AR_TZ).isoformat(),
        "ok": ok,
        "errores": err,
        "detalle": out,
    }


if __name__ == "__main__":
    only = os.environ.get("RENDCALLE_TENANT", "").strip() or None
    asyncio.run(run(only))
