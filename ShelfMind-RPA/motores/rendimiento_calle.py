# -*- coding: utf-8 -*-
from __future__ import annotations

import asyncio
import os
import re
import sys
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
DEBUG_DIR = BASE_DIR / "logs" / "rendcalle_debug"
HEADLESS = os.environ.get("RPA_HEADLESS", "true").lower() != "false"
FAIL_FAST = os.environ.get("RENDCALLE_FAIL_FAST", "true").lower() != "false"
DEBUG_ARTIFACTS = os.environ.get("RENDCALLE_DEBUG_ARTIFACTS", "true").lower() in {"1", "true", "yes"}
TIMEOUT_MS = 30_000
URL_LOGIN = "https://portal.nextbyn.com/"
URL_SIGO = "https://portal.nextbyn.com/modulos/mapas/sigo.aspx"
# Input DevExpress del combo Sucursal en popup "Entorno de trabajo" (mismo id que motores/sigo.py).
_ENTORNO_SUC_I = "ContentPlaceHolder2_Popup_cmbxSucursal_I"

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


def _fecha_objetivo_dt() -> datetime:
    """
    Produccion: fecha del dia.
    Testing nocturno: RENDCALLE_TEST_DATE=DD/MM/YYYY
    """
    raw = (os.environ.get("RENDCALLE_TEST_DATE") or "").strip()
    if raw:
        try:
            d, m, y = [int(x) for x in raw.split("/")]
            return datetime(y, m, d, tzinfo=AR_TZ)
        except Exception:
            pass
    return datetime.now(AR_TZ)


def _fecha_objetivo() -> str:
    d = _fecha_objetivo_dt()
    return f"{d.day}/{d.month}/{d.year}"


def _fecha_operativa_iso() -> str:
    d = _fecha_objetivo_dt()
    return d.date().isoformat()


def _dia_objetivo_str() -> str:
    return str(_fecha_objetivo_dt().day)


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


async def _debug_dump(page: Page, stage: str, tenant_id: str, sucursal: str) -> None:
    """
    Guarda evidencia visual/DOM para revisar si la UI estaba lista antes de exportar.
    """
    if not DEBUG_ARTIFACTS:
        return
    try:
        DEBUG_DIR.mkdir(parents=True, exist_ok=True)
        ts = _ts()
        base = f"{tenant_id}_{_norm(sucursal).replace(' ', '_')}_{stage}_{ts}"
        png = DEBUG_DIR / f"{base}.png"
        html = DEBUG_DIR / f"{base}.html"
        await page.screenshot(path=str(png), full_page=True)
        html.write_text(await page.content(), encoding="utf-8")
        logger.info(f"    🧪 Debug guardado: {png.name} / {html.name}")
    except Exception as e:
        logger.warning(f"    ⚠️ No se pudo guardar debug ({stage}): {e}")


async def _finalize_download(dl: Download, fallback_name: str) -> tuple[bytes, Path] | None:
    """Guarda archivo en DOWNLOADS_DIR y devuelve bytes + Path."""
    try:
        DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
        fname = dl.suggested_filename or fallback_name
        path = DOWNLOADS_DIR / fname
        await dl.save_as(str(path))
        data = path.read_bytes()
        logger.info(f"    ✅ Descargado {path.name} ({len(data)/1024:.1f} KB)")
        return data, path
    except Exception as e:
        logger.error(f"    ❌ Error guardando descarga ({fallback_name}): {e}")
        return None


async def _download(page: Page, click_locator: str, fallback_name: str) -> tuple[bytes, Path] | None:
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
        return await _finalize_download(dl, fallback_name)
    except Exception as e:
        logger.error(f"    ❌ Error descarga {fallback_name}: {e}")
        return None


async def _download_grilla_alertas(page: Page, fallback_name: str) -> tuple[bytes, Path] | None:
    """
    Export desde popup de grilla / ventas fuera de ruta.
    Nextbyn 2026: popup ventas fuera de ruta usa botones XLS (popupVentaFueraRuta_*), no siempre la celda XLSX genérica.
    """
    try:
        await _forzar_fecha_objetivo_popup(page)
        await _esperar_ui_lista(page)
        try:
            async with page.expect_download(timeout=120_000) as info:
                btn = page.get_by_role("cell", name="Exportar a XLSX Exportar a").locator("span").first
                try:
                    await btn.click(timeout=10_000, no_wait_after=True)
                except Exception:
                    await btn.click(timeout=10_000, force=True, no_wait_after=True)
            dl: Download = await info.value
            return await _finalize_download(dl, fallback_name)
        except Exception:
            pass
        try:
            async with page.expect_download(timeout=120_000) as info:
                btn2 = page.get_by_role("cell", name="Exportar a XLS Exportar a XLS").locator("span").first
                await btn2.click(timeout=10_000, no_wait_after=True)
            dl2: Download = await info.value
            return await _finalize_download(dl2, fallback_name)
        except Exception:
            pass
        return await _download(page, "#ContentPlaceHolder2_popupVentaFueraRuta_btnXlsExportVentasFueraRuta_CD", fallback_name)
    except Exception as e:
        logger.error(f"    ❌ Error descarga {fallback_name}: {e}")
        return None


async def _download_pdv(page: Page, fallback_name: str) -> tuple[bytes, Path] | None:
    """
    En PDV, en algunos tenants el export no dispara hasta aplicar cambios.
    """
    try:
        # Flujo literal del codegen para PDV.
        dia = _dia_objetivo_str()
        await _forzar_fecha_objetivo_popup(page)
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
        await _esperar_ui_lista(page)
        await page.wait_for_timeout(1_000)
        export_cell = page.get_by_role("cell", name="Exportar a XLS Exportar a XLS").locator("span").first
        try:
            async with page.expect_download(timeout=90_000) as info:
                try:
                    await export_cell.click(timeout=15_000, no_wait_after=True)
                except Exception:
                    await export_cell.click(timeout=15_000, force=True, no_wait_after=True)
            dl: Download = await info.value
            tup = await _finalize_download(dl, fallback_name)
            if tup:
                return tup
        except Exception:
            pass
        return await _download(page, "#ContentPlaceHolder2_popupClientes_btnXlsExportC_CD", fallback_name)
    except Exception as e:
        logger.error(f"    ❌ Error descarga {fallback_name}: {e}")
        return None


async def _download_rutas(page: Page, fallback_name: str) -> tuple[bytes, Path] | None:
    # Intento 1: id conocido XLSX
    tup = await _download(page, "#ContentPlaceHolder2_popupRuta_btnXlsxExportR_CD", fallback_name)
    if tup:
        return tup
    # Intento 2: selector de celda por texto (codegen-like)
    try:
        await _esperar_ui_lista(page)
        async with page.expect_download(timeout=60_000) as info:
            await page.get_by_role("cell", name="Exportar a XLSX Exportar a").locator("span").first.click()
        dl: Download = await info.value
        tup2 = await _finalize_download(dl, fallback_name)
        if tup2:
            return tup2
    except Exception:
        pass
    # Intento 3: XLS
    return await _download(page, "#ContentPlaceHolder2_popupRuta_btnXlsExportR_CD", fallback_name.replace(".xlsx", ".xls"))


async def _download_dispositivos(page: Page, fallback_name: str) -> tuple[bytes, Path] | None:
    # Flujo literal del codegen para este popup en Real.
    try:
        await _esperar_ui_lista(page)
        async with page.expect_download(timeout=60_000) as info:
            await page.get_by_role("cell", name="Exportar a XLSX Exportar a").locator("span").first.click()
        dl: Download = await info.value
        tup = await _finalize_download(dl, fallback_name)
        if tup:
            return tup
    except Exception:
        pass
    # Fallback por IDs conocidos
    tup_x = await _download(page, "#ContentPlaceHolder2_popupGrilla_btnXlsxExport_CD", fallback_name)
    if tup_x:
        return tup_x
    return await _download(page, "#ContentPlaceHolder2_popupGrilla_btnXlsExport_CD", fallback_name.replace(".xlsx", ".xls"))


def _secret_user(tenant: dict) -> str:
    return get_secret(tenant["user_key"]) or get_secret(tenant["user_key"].replace("rendcalle_", "sigo_"))


def _secret_pass(tenant: dict) -> str:
    return get_secret(tenant["pass_key"]) or get_secret(tenant["pass_key"].replace("rendcalle_", "sigo_"))


async def _abrir_entorno_toolbar(page: Page) -> bool:
    """
    Abre el popup Entorno desde la toolbar SIGO. El mapa u overlays suelen interceptar
    el click normal en #ContentPlaceHolder2_btnEntorno en tenants con vista pesada.
    """
    suc = page.locator(f"#{_ENTORNO_SUC_I}").first
    await _esperar_ui_lista(page)
    candidates = (
        page.get_by_role("link", name="Entorno"),
        page.locator("#ContentPlaceHolder2_btnEntorno"),
    )
    for loc in candidates:
        c = loc.first
        try:
            await c.wait_for(state="attached", timeout=12_000)
        except Exception:
            continue
        try:
            await c.scroll_into_view_if_needed(timeout=5_000)
        except Exception:
            pass
        for use_force in (False, True):
            try:
                await c.click(timeout=15_000, force=use_force)
                await _esperar_ui_lista(page)
                await suc.wait_for(state="visible", timeout=12_000)
                return True
            except Exception:
                continue
    try:
        btn = page.locator("#ContentPlaceHolder2_btnEntorno").first
        await btn.evaluate("el => el.click()")
        await _esperar_ui_lista(page)
        await suc.wait_for(state="visible", timeout=12_000)
        return True
    except Exception:
        return False


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


async def _esperar_input_entorno_sucursal(page: Page) -> None:
    """Tras cargar sigo.aspx: combo sucursal puede poblar async (DevExpress callback)."""
    inp = page.locator(f"#{_ENTORNO_SUC_I}")
    try:
        await inp.wait_for(state="visible", timeout=12_000)
    except Exception:
        try:
            await page.locator("#ContentPlaceHolder2_btnEntorno").first.click(timeout=10_000)
            await inp.wait_for(state="visible", timeout=TIMEOUT_MS)
        except Exception:
            pass
    try:
        await page.wait_for_load_state("networkidle", timeout=12_000)
    except Exception:
        pass
    await _esperar_ui_lista(page)


# Ítems reales del listbox: td ...LBI0T0, LBI1T0, ... (no la fila plantilla LBI-1 con &nbsp;).
_RE_SUC_ITEM_TD_ID = re.compile(r"LBI\d+T0$")


def _suc_combo_base_id() -> str:
    return _ENTORNO_SUC_I[:-2] if _ENTORNO_SUC_I.endswith("_I") else _ENTORNO_SUC_I


async def _wait_cmbx_sucursal_loading_done(page: Page) -> None:
    """Panel DevExpress 'Cargando…' sobre el combo sucursal."""
    lp = page.locator("#ContentPlaceHolder2_Popup_cmbxSucursal_LP")
    try:
        await lp.wait_for(state="hidden", timeout=5_000)
    except Exception:
        pass


async def _collect_sucursal_items_text(page: Page) -> list[str]:
    """
    Textos de sucursal del combo Entorno.
    DevExpress: tabla virtual #..._DDD_L_LBT con td ...LBI0T0, LBI1T0, ...
    Primero lee vía evaluate (más estable que all_text_contents con DOM parcial).
    """
    base_id = _suc_combo_base_id()
    seen: set[str] = set()
    out: list[str] = []

    def _push(raw: str) -> None:
        t = raw.replace("\xa0", " ").strip()
        if not t:
            return
        key = _norm(t)
        if key in seen:
            return
        seen.add(key)
        out.append(t)

    try:
        js_list = await page.evaluate(
            """(baseId) => {
              const tbl = document.querySelector('#' + baseId + '_DDD_L_LBT');
              if (!tbl) return [];
              const nbsp = String.fromCharCode(160);
              const xs = [];
              for (const td of tbl.querySelectorAll('td')) {
                const id = td.id || '';
                if (!/LBI\\d+T0$/i.test(id)) continue;
                const t = (td.textContent || '').split(nbsp).join(' ').trim();
                if (t) xs.push(t);
              }
              return xs;
            }""",
            base_id,
        )
        if isinstance(js_list, list):
            for txt in js_list:
                if isinstance(txt, str):
                    _push(txt)
            if out:
                return out
    except Exception:
        pass

    try:
        lbt_cells = page.locator(f"#{base_id}_DDD_L_LBT td")
        n_lbt = await lbt_cells.count()
        if n_lbt > 0:
            for txt in await lbt_cells.all_text_contents():
                _push(txt)
            if out:
                return out
    except Exception:
        pass

    tds = page.locator(f"td[id^='{base_id}_DDD_L_LBI']")
    n = await tds.count()
    for i in range(n):
        el = tds.nth(i)
        iid = await el.get_attribute("id")
        if not iid or not _RE_SUC_ITEM_TD_ID.search(iid):
            continue
        raw = await el.text_content()
        _push(raw or "")
    return out


async def _dx_abrir_combo_sucursal(page: Page, for_selection: bool = False) -> None:
    """
    Abre el dropdown del combo sucursal (botón _B-1 / _B-1Img).
    for_selection=True: siempre intenta abrir (los td del listbox pueden estar en DOM pero no clickeables hasta abrir).
    """
    base_id = _suc_combo_base_id()
    if not for_selection and await _collect_sucursal_items_text(page):
        return
    btn_candidates = (
        page.locator(f"#{base_id}_B-1Img").first,
        page.locator(f"#{base_id}_B-1").first,
    )
    await _esperar_ui_lista(page)
    last_exc: Exception | None = None
    for btn in btn_candidates:
        try:
            await btn.scroll_into_view_if_needed(timeout=5_000)
        except Exception:
            pass
        for strategy in ("js", "dispatch"):
            try:
                if strategy == "js":
                    await btn.evaluate("el => el.click()")
                else:
                    h = await btn.element_handle(timeout=5_000)
                    if h is None:
                        continue
                    await h.dispatch_event("click")
            except Exception as e:
                last_exc = e
                continue
            await _wait_cmbx_sucursal_loading_done(page)
            await _esperar_ui_lista(page)
            poll = 70 if for_selection else 45
            for _ in range(poll):
                if await _collect_sucursal_items_text(page):
                    await page.wait_for_timeout(150)
                    return
                await page.wait_for_timeout(200)
            last_exc = RuntimeError("combo sucursal abierto pero sin textos de sucursal")
    raise RuntimeError(f"No se abrió dropdown sucursal Entorno: {last_exc!r}") from last_exc


async def _leer_sucursales(page: Page) -> list[str]:
    """
    Lista sucursales desde la tabla virtual del combo (LBT). No usa _dx aquí: abrir el dropdown
    vía _dx dejaba el popup Entorno en estado raro y LBT vacío en corridas siguientes.
    """
    suc: list[str] = []
    for reopen in range(3):
        await _abrir_popup_entorno(page)
        for _ in range(70):
            suc = await _collect_sucursal_items_text(page)
            if suc:
                break
            await page.wait_for_timeout(200)
        if suc:
            if len(suc) >= 2 or reopen == 2:
                try:
                    await page.keyboard.press("Escape")
                except Exception:
                    pass
                return suc
        await _esperar_ui_lista(page)
        await page.wait_for_timeout(500 * (reopen + 1))
    try:
        await page.keyboard.press("Escape")
    except Exception:
        pass
    if not suc:
        await _abrir_popup_entorno(page)
        await page.wait_for_timeout(800)
        suc = await _collect_sucursal_items_text(page)
    if not suc:
        try:
            v = await page.locator(f"#{_ENTORNO_SUC_I}").input_value()
            if v.strip():
                suc = [v.strip()]
        except Exception:
            pass
    return suc


async def _sucursal_td_click_js(page: Page, sucursal: str) -> bool:
    """Click en el td del listbox vía JS (DevExpress a veces acepta aunque Playwright marque not visible)."""
    base = _suc_combo_base_id()
    return bool(
        await page.evaluate(
            """({ base, name }) => {
              const norm = (s) => (s || "").trim().toLowerCase().replace(/\\s+/g, " ");
              const target = norm(name);
              for (const el of document.querySelectorAll(`td[id^='${base}_DDD_L_LBI']`)) {
                if (!/LBI\\d+T0$/.test(el.id)) continue;
                if (norm(el.textContent) === target) {
                  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
                  el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
                  el.click();
                  return true;
                }
              }
              return false;
            }""",
            {"base": base, "name": sucursal},
        )
    )


async def _set_sucursal(page: Page, sucursal: str) -> None:
    await _abrir_popup_entorno(page)
    inp = page.locator(f"#{_ENTORNO_SUC_I}").first

    async def _verify_input() -> bool:
        try:
            got = (await inp.input_value()).strip()
            return _norm(got) == _norm(sucursal)
        except Exception:
            return False

    if await _verify_input():
        await _set_fecha_entorno_ayer(page)
        return

    await inp.click(timeout=10_000, force=True)
    await inp.press("Control+a")
    await inp.fill(sucursal)
    for key in ("Tab", "Enter"):
        await page.keyboard.press(key)
        await _esperar_ui_lista(page)
        if await _verify_input():
            await _set_fecha_entorno_ayer(page)
            return

    if await _sucursal_td_click_js(page, sucursal):
        await _esperar_ui_lista(page)
        if await _verify_input():
            await _set_fecha_entorno_ayer(page)
            return

    try:
        await _dx_abrir_combo_sucursal(page, for_selection=True)
    except Exception as ex:
        logger.warning("    _dx_abrir_combo_sucursal (selección): %s", ex)
    base_id = _suc_combo_base_id()
    item_td = page.locator(f"td[id^='{base_id}_DDD_L_LBI']").filter(has_text=sucursal).first
    try:
        await item_td.click(timeout=12_000, force=True, no_wait_after=True)
    except Exception:
        await item_td.evaluate("el => el.click()")
    await _esperar_ui_lista(page)
    if not await _verify_input():
        raise RuntimeError(f"No se pudo seleccionar sucursal en Entorno: {sucursal!r}")
    await _set_fecha_entorno_ayer(page)


async def _abrir_popup_entorno(page: Page) -> None:
    inp = page.locator(f"#{_ENTORNO_SUC_I}").first
    try:
        await inp.wait_for(state="visible", timeout=8_000)
        return
    except Exception:
        pass
    if await _abrir_entorno_toolbar(page):
        return
    await _click_menu_inicio(page)
    await _esperar_ui_lista(page)
    if await _abrir_entorno_toolbar(page):
        return
    raise RuntimeError("No se pudo abrir popup Entorno (toolbar / Sucursal: no visible)")


async def _click_menu_alertas(page: Page) -> None:
    """Expande la sección Alertas (#sec-alertas); los botones de grilla están dentro (display:none si está colapsada)."""
    sec = page.locator("#sec-alertas").first

    async def _visible() -> bool:
        try:
            return bool(
                await sec.evaluate(
                    "el => !!(el.offsetParent && getComputedStyle(el).display !== 'none')"
                )
            )
        except Exception:
            return False

    if await _visible():
        await _esperar_ui_lista(page)
        return
    loc = page.locator("div.categoria-menu-sigo[onclick*='sec-alertas']").first
    try:
        await loc.wait_for(state="visible", timeout=8_000)
        await loc.click(timeout=8_000)
        await _esperar_ui_lista(page)
    except Exception:
        try:
            await page.get_by_text("Alertas ?", exact=False).first.click(timeout=8_000)
            await _esperar_ui_lista(page)
        except Exception:
            await _click_menu(page, "div.categoria-menu-sigo:has-text('Alertas')")
            await _esperar_ui_lista(page)


async def _click_menu_inicio(page: Page) -> None:
    """
    Asegura la sección Inicio (#sec-inicio) visible para acceder a Dispositivos/PDV/Rutas.
    El header es un toggle: si ya está abierto, NO volver a clickear (cerraría la sección).
    """
    sec = page.locator("#sec-inicio").first

    async def _sec_inicio_visible() -> bool:
        try:
            return bool(
                await sec.evaluate(
                    "el => !!(el.offsetParent && getComputedStyle(el).display !== 'none')"
                )
            )
        except Exception:
            return False

    if await _sec_inicio_visible():
        await _esperar_ui_lista(page)
        return

    loc = page.locator("div.categoria-menu-sigo[onclick*='sec-inicio']").first
    try:
        await loc.wait_for(state="visible", timeout=8_000)
        await loc.click(timeout=8_000)
        await _esperar_ui_lista(page)
        if await _sec_inicio_visible():
            return
    except Exception:
        pass
    for label in ("Inicio ▶", "Inicio ?"):
        try:
            await page.get_by_text(label, exact=False).first.click(timeout=6_000)
            await _esperar_ui_lista(page)
            if await _sec_inicio_visible():
                return
        except Exception:
            continue


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


async def _forzar_fecha_objetivo_popup(page: Page) -> None:
    """
    Fuerza Desde/Hasta a la fecha objetivo en el popup activo.
    """
    fecha = _fecha_objetivo()
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
    d = _fecha_objetivo_dt()
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
    out: dict = {
        "sucursal": sucursal,
        "dist_destino": dest,
        "dispositivos": False,
        "pdv": False,
        "rutas": False,
        "grilla": False,
        "analytics_ok": None,
        "error": None,
    }
    try:
        await _set_sucursal(page, sucursal)
        await page.keyboard.press("Escape")
        await _esperar_ui_lista(page)

        # Codegen real: volver a Inicio antes de Dispositivos.
        await _click_menu_inicio(page)

        async def _download_with_retry(
            *,
            menu_selector: str,
            stage: str,
            downloader,
            fallback_name: str,
            err_msg: str,
            max_attempts: int = 3,
        ) -> tuple[bytes, Path]:
            last = None
            for attempt in range(1, max_attempts + 1):
                logger.info(f"    ↻ {stage}: intento {attempt}/{max_attempts}")
                try:
                    # Reabrir menu/popup en cada intento para evitar estado sucio de Nextbyn
                    await _click_menu(page, menu_selector)
                    await _esperar_ui_lista(page)
                    await page.wait_for_timeout(1200 * attempt)
                    await _debug_dump(page, f"antes_{stage}_export_try{attempt}", tenant["id"], sucursal)
                    tup = await downloader(page, fallback_name)
                    if tup:
                        return tup
                    await _debug_dump(page, f"falla_{stage}_export_try{attempt}", tenant["id"], sucursal)
                except Exception as ex:
                    last = ex
                    await _debug_dump(page, f"error_{stage}_export_try{attempt}", tenant["id"], sucursal)
                finally:
                    await _close_popup(page)
                    await _esperar_ui_lista(page)
            if last:
                raise RuntimeError(f"{err_msg} ({last})")
            raise RuntimeError(err_msg)

        _, p_disp = await _download_with_retry(
            menu_selector="#ContentPlaceHolder2_btnDatos",
            stage="dispositivos",
            downloader=_download_dispositivos,
            fallback_name=f"rendcalle_{tenant['id']}_{_ts()}_dispositivos.xlsx",
            err_msg="Fallo descarga Dispositivos",
            max_attempts=4,
        )
        out["dispositivos"] = True

        _, p_cli = await _download_with_retry(
            menu_selector="#ContentPlaceHolder2_btnClientes",
            stage="pdv",
            downloader=_download_pdv,
            fallback_name=f"rendcalle_{tenant['id']}_{_ts()}_pdv.xls",
            err_msg="Fallo descarga Puntos de venta",
            max_attempts=4,
        )
        out["pdv"] = True

        _, p_rt = await _download_with_retry(
            menu_selector="#ContentPlaceHolder2_btnRutas",
            stage="rutas",
            downloader=_download_rutas,
            fallback_name=f"rendcalle_{tenant['id']}_{_ts()}_rutas.xlsx",
            err_msg="Fallo descarga Rutas de venta",
            max_attempts=3,
        )
        out["rutas"] = True

        try:
            await page.get_by_text("Alertas ?", exact=False).first.click(timeout=12_000)
        except Exception:
            await _click_menu(page, "div.categoria-menu-sigo:has-text('Alertas')")
        async def _open_grilla() -> None:
            await _click_menu_alertas(page)
            # Nextbyn 2026: ya no hay <link "Grilla de ventas a clientes">; es botón con id fijo / title "… fuera de ruta".
            opened = False
            for loc in (
                page.locator("#ContentPlaceHolder2_btnVentasFueraRuta"),
                page.get_by_title("Grilla de ventas a clientes fuera de ruta"),
                page.get_by_role("link", name="Grilla de ventas a clientes"),
            ):
                try:
                    await loc.first.click(timeout=12_000)
                    opened = True
                    break
                except Exception:
                    continue
            if not opened:
                raise RuntimeError("No se pudo abrir grilla ventas fuera de ruta (selector Nextbyn)")
            await _esperar_ui_lista(page)

        p_fuera = None
        for attempt in range(1, 4):
            await _open_grilla()
            await page.wait_for_timeout(1000 * attempt)
            await _debug_dump(page, f"antes_grilla_export_try{attempt}", tenant["id"], sucursal)
            tup_gr = await _download_grilla_alertas(page, f"rendcalle_{tenant['id']}_{_ts()}_grilla.xlsx")
            if tup_gr:
                _, p_fuera = tup_gr
                break
            await _debug_dump(page, f"falla_grilla_export_try{attempt}", tenant["id"], sucursal)
            await _close_popup(page)
            await _esperar_ui_lista(page)
        if not p_fuera:
            raise RuntimeError("Fallo descarga Grilla de ventas a clientes")
        out["grilla"] = True
        await _close_popup(page)

        sk = (os.environ.get("RENDCALLE_SKIP_ANALYTICS") or "").strip().lower()
        if sk not in {"1", "true", "yes"}:
            try:
                if str(BASE_DIR) not in sys.path:
                    sys.path.insert(0, str(BASE_DIR))
                from scripts.analizar_rendimiento_calle import PathsIn, construir_payload

                from lib.api_client import subir_rendimiento_calle_analytics

                payload = construir_payload(
                    PathsIn(
                        clientes=p_cli,
                        dispositivos=p_disp,
                        rutas=p_rt,
                        fuera_ruta=p_fuera,
                    ),
                    tenant_id=tenant["id"],
                    fecha_operativa=_fecha_operativa_iso(),
                    id_distribuidor=dest,
                    sucursal_nombre=sucursal,
                )
                out["analytics_ok"] = subir_rendimiento_calle_analytics(tenant["id"], payload)
            except Exception as ex:
                out["analytics_ok"] = False
                logger.warning("    Rendimiento calle analytics no enviado: %s", ex)
    except Exception as e:
        out["error"] = str(e)[:300]
        logger.error(f"    ❌ Error sucursal '{sucursal}': {out['error']}")
        await _debug_dump(page, "error_sucursal", tenant["id"], sucursal)
        await _shot(page, f"{tenant['id']}_{_norm(sucursal).replace(' ', '_')}")
    return out


async def _procesar_tenant(tenant: dict) -> dict:
    res = {"tenant": tenant["id"], "nombre": tenant["nombre"], "sucursales": [], "error": None}
    async with async_playwright() as pw:
        browser_args = ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=980,720"]
        browser: Browser = await pw.chromium.launch(headless=HEADLESS, args=browser_args)
        context: BrowserContext = await browser.new_context(
            locale="es-AR",
            timezone_id="America/Argentina/Buenos_Aires",
            viewport={"width": 980, "height": 720},
            accept_downloads=True,
        )
        page = await context.new_page()
        page.set_default_timeout(TIMEOUT_MS)
        try:
            await _login(page, tenant)
            await _abrir_modulo(page)
            await _esperar_input_entorno_sucursal(page)
            await page.wait_for_timeout(1_500)
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
