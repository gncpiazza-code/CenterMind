# -*- coding: utf-8 -*-
"""
motores/sigo.py
===============
Motor 4: Mapa de Seguimiento SIGO — Nextbyn Portal (Multi-empresa)

¿Qué hace este archivo?
-----------------------
Todos los días a las 07:00:
  1. Para cada una de las 5 empresas en Nextbyn:
     a. Hace login en portal.nextbyn.com
     b. Cierra el popup de aviso ("CONSOLIDO - VENCE...") si aparece
     c. Navega a sigo.aspx — el popup "Entorno de trabajo" se abre automáticamente
     d. Lee todas las sucursales disponibles en el dropdown
     e. Para cada sucursal:
        i.  Configura Entorno: sucursal + fecha = ayer → Aplicar
        ii. Abre "Puntos de venta" → Exportar a XLS (fecha = ayer, ya pre-cargada)
        iii.Abre "Ventas a clientes fuera de ruta" → setea fecha ayer → Aplicar → Exportar XLSX
        iv. Hash Guard en ambos archivos
        v.  Sube los que cambiaron a la API de ShelfMind
  2. Si una empresa falla, guarda screenshot y continúa con la siguiente
  3. Al final escribe el resumen completo en el log

EMPRESAS (5):
  - tabaco  : Tabaco & Hnos S.R.L.
  - aloma   : Aloma Distribuidores Oficiales
  - liver   : Liver SRL
  - real    : Real Tabacalera de Santiago S.A.
  - gyg     : GyG

PARTICULARIDADES DEL PORTAL NEXTBYN (verificadas en vivo 24/03/2026):
  - Portal ASP.NET WebForms + DevExpress, NO Angular como CHESS ERP
  - Login: Default.aspx → Usuario + Password → botón "Ingresar"
  - Popup de aviso al login (CONSOLIDO - CONSOLIDADA): cerrar con "Aceptar"
  - sigo.aspx: el popup "Entorno de trabajo" se abre automáticamente al cargar
  - Entorno de trabajo: Sucursal (DevExpress combobox) + Fuerza de ventas + Fecha (DevExpress datepicker)
  - Sucursales: varían por empresa → leer dinámicamente del dropdown antes de iterar
  - Puntos de venta: fechas ya pre-cargadas desde el Entorno → solo Exportar a XLS
  - Ventas fuera de ruta: fecha NO se carga automática → setear ayer + Aplicar cambios → Exportar XLSX
  - DevExpress date fields: triple_click + fill + Tab (NO usar wait_for_timeout hardcodeado)
  - DevExpress combobox: click input → esperar lista → click opción por texto exacto

IDs DE ELEMENTOS VERIFICADOS EN VIVO (24/03/2026):
  Entorno de trabajo:
    Sucursal input    : ContentPlaceHolder2_Popup_cmbxSucursal_I
    Sucursal dropdown : ContentPlaceHolder2_Popup_cmbxSucursal_B-1
    Sucursal items    : ContentPlaceHolder2_Popup_cmbxSucursal_DDD_L_LBI (múltiples)
    Fecha             : ContentPlaceHolder2_Popup_deFecha_I
    Aplicar           : ContentPlaceHolder2_Popup_btnAplicar_I

  Puntos de venta:
    Abrir popup       : ContentPlaceHolder2_btnClientes
    Fecha desde       : ContentPlaceHolder2_popupClientes_deFechaDesdeC_I
    Fecha hasta       : ContentPlaceHolder2_popupClientes_deFechaHastaC_I
    Aplicar cambios   : ContentPlaceHolder2_popupClientes_btnAplicarAlertasC_I
    Exportar XLS      : ContentPlaceHolder2_popupClientes_btnXlsExportC_I

  Ventas fuera de ruta:
    Abrir popup       : ContentPlaceHolder2_btnVentaFueraDeRuta
    Fecha desde       : ContentPlaceHolder2_popupVentaFueraRuta_deFechaDesdeFR_I
    Fecha hasta       : ContentPlaceHolder2_popupVentaFueraRuta_deFechaHastaFR_I
    Aplicar cambios   : ContentPlaceHolder2_popupVentaFueraRuta_btnAplicarAlertaFR_I
    Exportar XLSX     : ContentPlaceHolder2_popupVentaFueraRuta_btnXlsxExportVentasFueraRuta_I
"""

import asyncio
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo

from playwright.async_api import (
    async_playwright, Browser, BrowserContext, Page, Download
)

from lib.logger import get_logger
from lib.hash_guard import es_duplicado, guardar_hash
from lib.api_client import subir_sigo
from lib.vault_client import get_secret

# ─────────────────────────────────────────────────────────────────
# CONFIGURACIÓN
# ─────────────────────────────────────────────────────────────────

logger = get_logger("SIGO")
AR_TZ = ZoneInfo("America/Argentina/Buenos_Aires")

DOWNLOADS_DIR = Path("/opt/shelfmind/rpa/downloads")
ERRORS_DIR    = Path("/opt/shelfmind/rpa/logs/errors")

HEADLESS  = os.environ.get("RPA_HEADLESS", "true").lower() != "false"
TIMEOUT_MS = 30_000
DIAS_ATRAS = int(os.environ.get("SIGO_DIAS_ATRAS", "1"))

URL_LOGIN = "https://portal.nextbyn.com/Default.aspx"
URL_SIGO  = "https://portal.nextbyn.com/modulos/mapas/sigo.aspx"

# ─────────────────────────────────────────────────────────────────
# IDs DE ELEMENTOS DEVEXPRESS (verificados en vivo 24/03/2026)
# ─────────────────────────────────────────────────────────────────

# Popup "Entorno de trabajo"
ID_ENTORNO_SUC_I    = "ContentPlaceHolder2_Popup_cmbxSucursal_I"
ID_ENTORNO_SUC_BTN  = "ContentPlaceHolder2_Popup_cmbxSucursal_B-1"
ID_ENTORNO_FECHA_I  = "ContentPlaceHolder2_Popup_deFecha_I"
ID_ENTORNO_APLICAR  = "ContentPlaceHolder2_Popup_btnAplicar_I"

# Popup "Puntos de venta"
ID_PDV_OPEN         = "ContentPlaceHolder2_btnClientes"
ID_PDV_DESDE_I      = "ContentPlaceHolder2_popupClientes_deFechaDesdeC_I"
ID_PDV_HASTA_I      = "ContentPlaceHolder2_popupClientes_deFechaHastaC_I"
ID_PDV_APLICAR      = "ContentPlaceHolder2_popupClientes_btnAplicarAlertasC_I"
ID_PDV_XLS          = "ContentPlaceHolder2_popupClientes_btnXlsExportC_I"

# Popup "Ventas a clientes fuera de ruta"
ID_VFR_OPEN         = "ContentPlaceHolder2_btnVentaFueraDeRuta"
ID_VFR_DESDE_I      = "ContentPlaceHolder2_popupVentaFueraRuta_deFechaDesdeFR_I"
ID_VFR_HASTA_I      = "ContentPlaceHolder2_popupVentaFueraRuta_deFechaHastaFR_I"
ID_VFR_APLICAR      = "ContentPlaceHolder2_popupVentaFueraRuta_btnAplicarAlertaFR_I"
ID_VFR_XLSX         = "ContentPlaceHolder2_popupVentaFueraRuta_btnXlsxExportVentasFueraRuta_I"

# ─────────────────────────────────────────────────────────────────
# DEFINICIÓN DE EMPRESAS
# ─────────────────────────────────────────────────────────────────

EMPRESAS = [
    {
        "id":         "tabaco",
        "nombre":     "Tabaco & Hnos S.R.L.",
        "vault_user": "sigo_tabaco_usuario",
        "vault_pass": "sigo_tabaco_password",
        "id_dist":    1,
    },
    {
        "id":         "aloma",
        "nombre":     "Aloma Distribuidores Oficiales",
        "vault_user": "sigo_aloma_usuario",
        "vault_pass": "sigo_aloma_password",
        "id_dist":    2,
    },
    {
        "id":         "liver",
        "nombre":     "Liver SRL",
        "vault_user": "sigo_liver_usuario",
        "vault_pass": "sigo_liver_password",
        "id_dist":    3,
    },
    {
        "id":         "real",
        "nombre":     "Real Tabacalera de Santiago S.A.",
        "vault_user": "sigo_real_usuario",
        "vault_pass": "sigo_real_password",
        "id_dist":    4,
    },
    {
        "id":         "gyg",
        "nombre":     "GyG",
        "vault_user": "sigo_gyg_usuario",
        "vault_pass": "sigo_gyg_password",
        "id_dist":    5,
    },
]


# ─────────────────────────────────────────────────────────────────
# HELPERS GENERALES
# ─────────────────────────────────────────────────────────────────

def _timestamp() -> str:
    return datetime.now(AR_TZ).strftime("%Y%m%d_%H%M")


def _fecha_ayer(dias_atras: int = DIAS_ATRAS) -> str:
    """Retorna la fecha de hace N días en formato D/M/YYYY (sin ceros iniciales,
    que es el formato que acepta el datepicker DevExpress de Nextbyn)."""
    ref = datetime.now(AR_TZ) - timedelta(days=dias_atras)
    # Nextbyn acepta D/M/YYYY (ej: "23/3/2026") verificado en vivo
    return f"{ref.day}/{ref.month}/{ref.year}"


async def _screenshot_error(page: Page, empresa_id: str, paso: str) -> None:
    """Guarda un screenshot cuando algo falla."""
    try:
        ERRORS_DIR.mkdir(parents=True, exist_ok=True)
        nombre = f"error_sigo_{empresa_id}_{paso}_{_timestamp()}.png"
        await page.screenshot(path=str(ERRORS_DIR / nombre), full_page=True)
        logger.info(f"  📸 Screenshot guardado: {nombre}")
    except Exception as e:
        logger.warning(f"  No se pudo guardar screenshot: {e}")


# ─────────────────────────────────────────────────────────────────
# HELPERS DEVEXPRESS
# ─────────────────────────────────────────────────────────────────

async def _dx_set_date(page: Page, input_id: str, fecha: str) -> None:
    """
    Establece el valor de un campo fecha DevExpress ASP.NET.

    Estrategia: triple_click (selecciona todo el texto actual) → fill
    (escribe la fecha) → Tab (confirma y cierra el calendario si está abierto).
    NO usa wait_for_timeout — espera que el campo sea visible.
    """
    loc = page.locator(f"#{input_id}")
    await loc.wait_for(state="visible", timeout=TIMEOUT_MS)
    await loc.triple_click()
    await loc.fill(fecha)
    await page.keyboard.press("Escape")   # Cierra el calendario si se abrió
    await page.keyboard.press("Tab")      # Confirma el valor


async def _dx_get_combobox_options(page: Page, input_id: str) -> list[str]:
    """
    Abre el dropdown de un combobox DevExpress y devuelve la lista de opciones.

    Parámetro input_id: el ID del <input> del combo (el que termina en _I).
    El botón dropdown es el mismo ID sin _I + _B-1.
    Los ítems de la lista son elementos con id que contiene _DDD_L_LBI.
    """
    # El botón del dropdown es el ID sin "_I" + "_B-1"
    base_id  = input_id.rstrip("_I").rstrip("I").rstrip("_")
    # Más seguro: construir desde el input_id quitando solo el sufijo _I
    base_id  = input_id[:-2] if input_id.endswith("_I") else input_id
    btn_id   = base_id + "_B-1"
    list_sel = f"[id^='{base_id}_DDD_L_LBI']"   # todos los li del dropdown

    # Abrir dropdown
    await page.locator(f"#{btn_id}").click()

    # Esperar que aparezca al menos un ítem
    await page.locator(list_sel).first.wait_for(state="visible", timeout=10_000)

    # Leer textos
    items = await page.locator(list_sel).all_text_contents()
    opciones = [t.strip() for t in items if t.strip()]

    # Cerrar dropdown sin seleccionar nada
    await page.keyboard.press("Escape")

    return opciones


async def _dx_combobox_select(page: Page, input_id: str, valor: str) -> None:
    """
    Selecciona una opción en un combobox DevExpress por texto exacto.

    1. Abre el dropdown clickeando el botón del combo.
    2. Espera que aparezca la lista.
    3. Hace click en el ítem cuyo texto coincide exactamente con `valor`.
    """
    base_id  = input_id[:-2] if input_id.endswith("_I") else input_id
    btn_id   = base_id + "_B-1"
    # Selector que matchea cualquier ítem de la lista con ese texto
    item_sel = f"[id^='{base_id}_DDD_L_LBI']"

    await page.locator(f"#{btn_id}").click()
    await page.locator(item_sel).first.wait_for(state="visible", timeout=10_000)

    # Buscar el ítem con el texto exacto y clickearlo
    await page.locator(item_sel).filter(has_text=valor).first.click()


# ─────────────────────────────────────────────────────────────────
# PASO 1: LOGIN
# ─────────────────────────────────────────────────────────────────

async def _hacer_login(page: Page, empresa: dict) -> None:
    """
    Login en Nextbyn.

    Navega a Default.aspx, llena usuario/password con credenciales del Vault
    y hace click en "Ingresar". Espera redirección a Principal.aspx.
    """
    logger.info(f"  Navegando a login: {URL_LOGIN}")
    await page.goto(URL_LOGIN, wait_until="networkidle")

    # Esperar que el formulario esté listo
    await page.locator('input[placeholder*="usuario"], input:not([type="password"])').first.wait_for(
        state="visible", timeout=TIMEOUT_MS
    )

    usuario  = get_secret(empresa["vault_user"])
    password = get_secret(empresa["vault_pass"])

    # Campo usuario (primer input) + campo password
    await page.locator('input').first.fill(usuario)
    await page.locator('input[type="password"]').fill(password)
    await page.locator('button:has-text("Ingresar"), input[value="Ingresar"]').first.click()

    # Esperar redirección al dashboard
    await page.wait_for_url("**/Principal.aspx**", timeout=20_000)
    logger.info(f"  ✅ Login exitoso — {empresa['nombre']}")


# ─────────────────────────────────────────────────────────────────
# PASO 2: CERRAR POPUP DE AVISO POST-LOGIN
# ─────────────────────────────────────────────────────────────────

async def _cerrar_popup_aviso(page: Page) -> None:
    """
    Cierra el popup de aviso que aparece al entrar a Principal.aspx.
    (Ej: "CONSOLIDO - CONSOLIDADA VENCE EN 2912360 DÍAS")

    Timeout corto — si no aparece en 4 s, no es problema.
    """
    try:
        btn = page.locator('input[value="Aceptar"], button:has-text("Aceptar")')
        await btn.first.wait_for(state="visible", timeout=4_000)
        await btn.first.click()
        logger.info("  Popup de aviso cerrado")
    except Exception:
        pass


# ─────────────────────────────────────────────────────────────────
# PASO 3: NAVEGAR A SIGO Y ESPERAR "ENTORNO DE TRABAJO"
# ─────────────────────────────────────────────────────────────────

async def _navegar_a_sigo(page: Page) -> None:
    """
    Navega a sigo.aspx y espera que el popup "Entorno de trabajo"
    se abra automáticamente (comportamiento observado en vivo).

    Si el popup no aparece en 10 s, hace click en btnEntorno para
    abrirlo manualmente.
    """
    logger.info("  Navegando a SIGO...")
    await page.goto(URL_SIGO, wait_until="networkidle")

    # Esperar que el input de sucursal del Entorno sea visible
    entorno_input = page.locator(f"#{ID_ENTORNO_SUC_I}")
    try:
        await entorno_input.wait_for(state="visible", timeout=10_000)
        logger.info("  ✅ Popup 'Entorno de trabajo' abierto automáticamente")
    except Exception:
        # Fallback: abrir manualmente
        logger.info("  Popup Entorno no se abrió solo — abriendo manualmente...")
        await page.locator("#ContentPlaceHolder2_btnEntorno").click()
        await entorno_input.wait_for(state="visible", timeout=TIMEOUT_MS)
        logger.info("  ✅ Popup 'Entorno de trabajo' abierto manualmente")


# ─────────────────────────────────────────────────────────────────
# PASO 4: LEER SUCURSALES
# ─────────────────────────────────────────────────────────────────

async def _leer_sucursales(page: Page) -> list[str]:
    """
    Lee todas las sucursales disponibles en el dropdown del Entorno.

    El popup "Entorno de trabajo" debe estar abierto al llamar esta función.
    """
    logger.info("  Leyendo sucursales disponibles...")
    try:
        sucursales = await _dx_get_combobox_options(page, ID_ENTORNO_SUC_I)
        logger.info(f"  Sucursales encontradas: {sucursales}")
        return sucursales
    except Exception as e:
        logger.warning(f"  No se pudo leer la lista de sucursales: {e}. Usando valor actual.")
        # Fallback: usar la sucursal que ya está seleccionada
        valor_actual = await page.locator(f"#{ID_ENTORNO_SUC_I}").input_value()
        return [valor_actual] if valor_actual.strip() else []


# ─────────────────────────────────────────────────────────────────
# PASO 5: CONFIGURAR ENTORNO (sucursal + fecha)
# ─────────────────────────────────────────────────────────────────

async def _configurar_entorno(page: Page, sucursal: str, fecha: str) -> None:
    """
    Abre el popup "Entorno de trabajo", selecciona la sucursal indicada,
    establece la fecha y hace click en Aplicar.

    Si el popup ya está abierto (primera sucursal), lo usa directamente.
    Si está cerrado (sucursales siguientes), lo abre via btnEntorno.
    """
    # Verificar si el popup ya está visible
    entorno_input = page.locator(f"#{ID_ENTORNO_SUC_I}")
    try:
        await entorno_input.wait_for(state="visible", timeout=2_000)
    except Exception:
        # Popup cerrado → abrir con btnEntorno
        await page.locator("#ContentPlaceHolder2_btnEntorno").click()
        await entorno_input.wait_for(state="visible", timeout=TIMEOUT_MS)

    logger.info(f"  Configurando Entorno: sucursal='{sucursal}' fecha='{fecha}'")

    # Seleccionar sucursal en el combobox DevExpress
    await _dx_combobox_select(page, ID_ENTORNO_SUC_I, sucursal)

    # Establecer fecha (DevExpress date editor)
    await _dx_set_date(page, ID_ENTORNO_FECHA_I, fecha)

    # Aplicar
    await page.locator(f"#{ID_ENTORNO_APLICAR}").click()

    # Esperar que el mapa actualice (networkidle o que el popup desaparezca)
    try:
        await page.wait_for_load_state("networkidle", timeout=20_000)
    except Exception:
        pass  # El mapa puede no disparar networkidle exacto

    # Esperar que los botones de INICIO estén activos (indica que cargó)
    await page.locator("#ContentPlaceHolder2_btnClientes").wait_for(
        state="visible", timeout=TIMEOUT_MS
    )
    logger.info(f"  ✅ Entorno aplicado — sucursal='{sucursal}'")


# ─────────────────────────────────────────────────────────────────
# PASO 6: DESCARGAR "PUNTOS DE VENTA" (XLS)
# ─────────────────────────────────────────────────────────────────

async def _descargar_puntos_de_venta(
    page: Page, empresa_id: str, sucursal: str, fecha: str
) -> Optional[bytes]:
    """
    Abre el popup "Puntos de venta" y descarga el XLS de fecha = ayer.

    El popup usa dos filas de fecha:
      - Fila C (con Exportar a XLS): pre-cargada desde el Entorno con fecha=ayer.
      - Fila DD (con Descarga directa Xlsx): siempre muestra la fecha de hoy.

    Siempre descargamos la Fila C → "Exportar a XLS" que corresponde al día
    configurado en el Entorno (= ayer).

    Si las fechas de la Fila C no coinciden con `fecha`, las corregimos
    antes de exportar.
    """
    logger.info(f"  [PDV] Abriendo popup Puntos de venta...")

    # Abrir el popup
    await page.locator(f"#{ID_PDV_OPEN}").click()
    await page.locator(f"#{ID_PDV_XLS}").wait_for(state="visible", timeout=TIMEOUT_MS)

    # Verificar y corregir fechas si hace falta
    desde_actual = await page.locator(f"#{ID_PDV_DESDE_I}").input_value()
    hasta_actual = await page.locator(f"#{ID_PDV_HASTA_I}").input_value()

    if desde_actual != fecha or hasta_actual != fecha:
        logger.info(f"  [PDV] Corrigiendo fechas: {desde_actual}→{fecha}")
        await _dx_set_date(page, ID_PDV_DESDE_I, fecha)
        await _dx_set_date(page, ID_PDV_HASTA_I, fecha)
        await page.locator(f"#{ID_PDV_APLICAR}").click()
        # Esperar que la grilla refresque
        await page.locator(f"#{ID_PDV_XLS}").wait_for(state="visible", timeout=TIMEOUT_MS)

    logger.info(f"  [PDV] Descargando XLS...")
    try:
        async with page.expect_download(timeout=120_000) as dl_info:
            await page.locator(f"#{ID_PDV_XLS}").click()

        download: Download = await dl_info.value
        DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
        nombre = download.suggested_filename or f"sigo_{empresa_id}_{sucursal}_pdv_{_timestamp()}.xls"
        ruta_temp = DOWNLOADS_DIR / nombre
        await download.save_as(str(ruta_temp))

        file_bytes = ruta_temp.read_bytes()
        size_kb = len(file_bytes) / 1024
        logger.info(f"  ✅ [PDV] Descargado: {nombre} ({size_kb:.1f} KB)")

        try:
            ruta_temp.unlink()
        except Exception:
            pass

        return file_bytes

    except Exception as e:
        logger.error(f"  ❌ [PDV] Error descargando: {e}")
        return None


# ─────────────────────────────────────────────────────────────────
# PASO 7: DESCARGAR "VENTAS FUERA DE RUTA" (XLSX)
# ─────────────────────────────────────────────────────────────────

async def _descargar_ventas_fuera_de_ruta(
    page: Page, empresa_id: str, sucursal: str, fecha: str
) -> Optional[bytes]:
    """
    Abre el popup "Ventas a clientes fuera de ruta", establece la fecha
    del día anterior, aplica cambios y descarga el XLSX.

    A diferencia de Puntos de venta, este popup NO precarga la fecha del
    Entorno — siempre hay que setearla manualmente.
    """
    logger.info(f"  [VFR] Abriendo popup Ventas fuera de ruta...")

    # Abrir el popup
    await page.locator(f"#{ID_VFR_OPEN}").click()
    await page.locator(f"#{ID_VFR_DESDE_I}").wait_for(state="visible", timeout=TIMEOUT_MS)

    # Establecer fecha desde y hasta = ayer
    logger.info(f"  [VFR] Seteando fecha: {fecha}")
    await _dx_set_date(page, ID_VFR_DESDE_I, fecha)
    await _dx_set_date(page, ID_VFR_HASTA_I, fecha)

    # Aplicar cambios (refresca la grilla con la nueva fecha)
    await page.locator(f"#{ID_VFR_APLICAR}").click()

    # Esperar que la grilla refresque — el botón de exportar vuelve a quedar disponible
    await page.locator(f"#{ID_VFR_XLSX}").wait_for(state="visible", timeout=TIMEOUT_MS)

    logger.info(f"  [VFR] Descargando XLSX...")
    try:
        async with page.expect_download(timeout=120_000) as dl_info:
            await page.locator(f"#{ID_VFR_XLSX}").click()

        download: Download = await dl_info.value
        DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
        nombre = download.suggested_filename or f"sigo_{empresa_id}_{sucursal}_vfr_{_timestamp()}.xlsx"
        ruta_temp = DOWNLOADS_DIR / nombre
        await download.save_as(str(ruta_temp))

        file_bytes = ruta_temp.read_bytes()
        size_kb = len(file_bytes) / 1024
        logger.info(f"  ✅ [VFR] Descargado: {nombre} ({size_kb:.1f} KB)")

        try:
            ruta_temp.unlink()
        except Exception:
            pass

        return file_bytes

    except Exception as e:
        logger.error(f"  ❌ [VFR] Error descargando: {e}")
        return None


# ─────────────────────────────────────────────────────────────────
# PROCESAR UNA SUCURSAL
# ─────────────────────────────────────────────────────────────────

async def _procesar_sucursal(
    page: Page,
    empresa: dict,
    sucursal: str,
    fecha: str,
) -> dict:
    """
    Ejecuta el flujo completo para una sucursal:
      1. Configura Entorno (sucursal + fecha)
      2. Descarga Puntos de venta (XLS)
      3. Descarga Ventas fuera de ruta (XLSX)
      4. Hash Guard + subida para ambos archivos

    Devuelve un dict con el resultado de la sucursal.
    """
    empresa_id  = empresa["id"]
    suc_slug    = sucursal.lower().replace(" ", "_")[:20]  # para nombres de archivo
    resultado   = {
        "sucursal":  sucursal,
        "pdv":       "error",
        "vfr":       "error",
        "error":     None,
    }

    logger.info(f"  ── Sucursal: '{sucursal}' ──")

    try:
        # ── Configurar Entorno ────────────────────────────────────
        await _configurar_entorno(page, sucursal, fecha)

        # ── Archivo 1: Puntos de venta (XLS) ─────────────────────
        bytes_pdv = await _descargar_puntos_de_venta(page, empresa_id, suc_slug, fecha)

        if bytes_pdv:
            clave = f"sigo_{empresa_id}_{suc_slug}_pdv"
            if es_duplicado(clave, bytes_pdv):
                resultado["pdv"] = "sin_cambios"
                logger.info(f"  [PDV] Sin cambios respecto al último upload")
            else:
                nombre_api = f"sigo_{empresa_id}_{suc_slug}_pdv_{_timestamp()}.xls"
                ok = subir_sigo(empresa_id, sucursal, "pdv", nombre_api, bytes_pdv)
                if ok:
                    guardar_hash(clave, bytes_pdv)
                    resultado["pdv"] = "subida_ok"
                else:
                    resultado["pdv"] = "error"

        # ── Archivo 2: Ventas fuera de ruta (XLSX) ────────────────
        bytes_vfr = await _descargar_ventas_fuera_de_ruta(page, empresa_id, suc_slug, fecha)

        if bytes_vfr:
            clave = f"sigo_{empresa_id}_{suc_slug}_vfr"
            if es_duplicado(clave, bytes_vfr):
                resultado["vfr"] = "sin_cambios"
                logger.info(f"  [VFR] Sin cambios respecto al último upload")
            else:
                nombre_api = f"sigo_{empresa_id}_{suc_slug}_vfr_{_timestamp()}.xlsx"
                ok = subir_sigo(empresa_id, sucursal, "vfr", nombre_api, bytes_vfr)
                if ok:
                    guardar_hash(clave, bytes_vfr)
                    resultado["vfr"] = "subida_ok"
                else:
                    resultado["vfr"] = "error"

    except Exception as e:
        msg = str(e)[:300]
        logger.error(f"  ❌ Error en sucursal '{sucursal}': {msg}")
        resultado["error"] = msg
        await _screenshot_error(page, f"{empresa_id}_{suc_slug}", "sucursal")

    iconos = {"subida_ok": "✅", "sin_cambios": "ℹ️ ", "error": "❌"}
    logger.info(
        f"  '{sucursal}': "
        f"pdv={iconos.get(resultado['pdv'],'?')}{resultado['pdv']}  "
        f"vfr={iconos.get(resultado['vfr'],'?')}{resultado['vfr']}"
    )
    return resultado


# ─────────────────────────────────────────────────────────────────
# PROCESAR UNA EMPRESA COMPLETA
# ─────────────────────────────────────────────────────────────────

async def _procesar_empresa(empresa: dict, fecha: str) -> dict:
    """
    Ejecuta el flujo completo para una empresa:
      - Login → sigo.aspx → leer sucursales → iterar cada sucursal

    Devuelve un dict con el resultado de la empresa y todas sus sucursales.
    """
    empresa_id = empresa["id"]
    resultado  = {
        "empresa":    empresa_id,
        "nombre":     empresa["nombre"],
        "sucursales": [],
        "error":      None,
    }

    logger.info(f"\n{'─'*50}")
    logger.info(f"🏢 Empresa: {empresa['nombre']}")
    logger.info(f"   Fecha: {fecha}")
    logger.info(f"{'─'*50}")

    async with async_playwright() as pw:
        browser: Browser = await pw.chromium.launch(
            headless=HEADLESS,
            args=["--no-sandbox", "--disable-dev-shm-usage"]
        )
        context: BrowserContext = await browser.new_context(
            locale="es-AR",
            timezone_id="America/Argentina/Buenos_Aires",
            viewport={"width": 1366, "height": 768},
            accept_downloads=True,
        )
        page: Page = await context.new_page()
        page.set_default_timeout(TIMEOUT_MS)

        try:
            # ── Login ──────────────────────────────────────────────
            await _hacer_login(page, empresa)
            await _cerrar_popup_aviso(page)

            # ── Navegar a SIGO ─────────────────────────────────────
            await _navegar_a_sigo(page)

            # ── Leer sucursales (el popup Entorno ya está abierto) ─
            sucursales = await _leer_sucursales(page)

            if not sucursales:
                raise RuntimeError("No se encontraron sucursales en el dropdown del Entorno")

            logger.info(f"  Procesando {len(sucursales)} sucursal(es): {sucursales}")

            # ── Iterar sucursales ──────────────────────────────────
            for sucursal in sucursales:
                res_suc = await _procesar_sucursal(page, empresa, sucursal, fecha)
                resultado["sucursales"].append(res_suc)

        except Exception as e:
            msg = str(e)[:300]
            logger.error(f"  ❌ Error fatal en empresa {empresa_id}: {msg}")
            resultado["error"] = msg
            await _screenshot_error(page, empresa_id, "empresa")

        finally:
            await context.close()
            await browser.close()
            logger.info(f"  Browser cerrado — empresa {empresa_id}")

    return resultado


# ─────────────────────────────────────────────────────────────────
# FUNCIÓN PRINCIPAL — PUNTO DE ENTRADA DEL MOTOR
# ─────────────────────────────────────────────────────────────────

async def run(fecha_override: str = None) -> dict:
    """
    Ejecuta el motor completo de SIGO.

    Llamada desde runner.py:
        from motores.sigo import run
        resumen = await run()

        # Con fecha custom:
        resumen = await run("23/3/2026")

    Parámetro opcional:
        fecha_override : fecha en formato D/M/YYYY (sin ceros iniciales)
        Si no se pasa, usa AYER como fecha.

    Devuelve el resumen de la ejecución completa.
    """
    inicio = datetime.now(AR_TZ)
    fecha  = fecha_override if fecha_override else _fecha_ayer(DIAS_ATRAS)

    logger.info("=" * 60)
    logger.info(f"🚀 Motor SIGO iniciado — {inicio.strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info(f"   Empresas a procesar: {len(EMPRESAS)}")
    logger.info(f"   Fecha: {fecha}")
    logger.info(f"   Headless: {HEADLESS}")
    logger.info("=" * 60)

    resultados = []

    for empresa in EMPRESAS:
        resultado = await _procesar_empresa(empresa, fecha)
        resultados.append(resultado)

        # Log resumido por empresa
        suc_ok  = sum(1 for s in resultado["sucursales"]
                      if s["pdv"] == "subida_ok" and s["vfr"] == "subida_ok")
        suc_err = sum(1 for s in resultado["sucursales"] if s["error"])
        logger.info(
            f"  {empresa['nombre']}: "
            f"{len(resultado['sucursales'])} sucursal(es) — "
            f"✅ {suc_ok} OK / ❌ {suc_err} con error"
            + (f" | ❌ ERROR FATAL: {resultado['error'][:80]}" if resultado["error"] else "")
        )

    # ── RESUMEN FINAL ──────────────────────────────────────────────
    fin      = datetime.now(AR_TZ)
    duracion = (fin - inicio).total_seconds() / 60

    total_suc  = sum(len(r["sucursales"]) for r in resultados)
    ok_total   = sum(
        1 for r in resultados for s in r["sucursales"]
        if s["pdv"] == "subida_ok" and s["vfr"] == "subida_ok"
    )
    err_total  = sum(
        1 for r in resultados
        if r["error"] or any(s["error"] for s in r["sucursales"])
    )

    logger.info("\n" + "=" * 60)
    logger.info("📊 RESUMEN MOTOR SIGO")
    logger.info(f"   Duración:              {duracion:.1f} minutos")
    logger.info(f"   Empresas procesadas:   {len(EMPRESAS)}")
    logger.info(f"   Sucursales totales:    {total_suc}")
    logger.info(f"   ✅ Sucursales OK:      {ok_total}/{total_suc}")
    logger.info(f"   ❌ Con errores:        {err_total}")
    logger.info("=" * 60 + "\n")

    return {
        "motor":        "SIGO",
        "inicio":       inicio.strftime("%Y-%m-%d %H:%M:%S"),
        "fin":          fin.strftime("%Y-%m-%d %H:%M:%S"),
        "duracion_min": round(duracion, 1),
        "fecha":        fecha,
        "ok":           ok_total,
        "errores":      err_total,
        "detalle":      resultados,
    }
