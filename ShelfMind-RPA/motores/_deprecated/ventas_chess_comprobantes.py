# -*- coding: utf-8 -*-
"""
DEPRECADO 2026-05-30 — no usar. Ver motores/_deprecated/README.md.
Fuente activa: motores/informe_ventas.py (Consolido → ventas_enriched_v2).

motores/ventas.py (archivo histórico)
=================
Comprobantes de Ventas — CHESS ERP (Multi-tenant)

¿Qué hace este archivo?
-----------------------
Programación vía scheduler.py (varias ventanas AR/día; ver scheduler.py) o runner manual:
  1. Para cada tenant CHESS activo (misma lista que cuentas corrientes; p. ej. extra si activo=False se omite):
     a. Abre un navegador invisible
     b. Cierra el popup de "Nueva versión de ChessERP" si aparece
     c. Hace login con las credenciales del tenant
     d. Cierra el popup de Nexty si aparece post-login
     e. Navega al reporte de Comprobantes de Ventas
     f. Configura la sucursal (solo Real Tabacalera)
     g. Completa las fechas (ayer por defecto)
     h. Hace clic en Procesar
     i. Espera el modal de exportación (>1000 registros)
     j. Descarga el Excel RESUMIDO
     k. Descarga el Excel DETALLADO (el modal sigue abierto)
     l. Compara cada archivo con el de ayer (Hash Guard)
     m. Sube los que cambiaron a la API de Shelfy
  2. Si un tenant falla, guarda screenshot y continúa con el siguiente
  3. Al final escribe el resumen completo en el log

Tenants: misma definición que motores/cuentas_corrientes (vault, activo, url_base, id_dist),
  más el campo ventas `sucursal` (None o texto exacto en CHESS). Inactivos (p. ej. extra) se omiten.
  tabaco / aloma / liver / real / extra — ver cuentas_corrientes.TENANTS.

PARTICULARIDADES VERIFICADAS EN VIVO:
  - Popup "Nueva versión ChessERP" (k-overlay naranja): aparece en login,
    bloquea todos los clicks. Hay que cerrarlo ANTES de llenar credenciales.
  - Popup de Nexty: aparece post-login, cerrar con "No volver a mostrar".
  - Campos de fecha: directiva 'mascarafecha', requieren click + Ctrl+A + fill + Tab.
  - Modal de exportación: aparece automáticamente cuando hay >1000 registros.
    NO se cierra entre descargas — el mismo modal sirve para resumido y detallado.
  - Real Tabacalera: tiene 8 sucursales, solo descargar "UEQUIN RODRIGO"
    (texto exacto verificado en vivo — NO es "8 RODRIGO UEQUIN" como estaba documentado).
  - Botón Procesar: selector exacto → button.btn.btn-primary.margin-boton
  - Radio resumido: mat-radio-button:not(.radioPlanilla) — ya viene seleccionado
  - Radio detallado: mat-radio-button.radioPlanilla
  - Botón Exportar: button.btn.btn-md.btn-primary
"""

import asyncio
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo

from playwright.async_api import (
    async_playwright, Browser, BrowserContext, Page, Download
)

from lib.logger import get_logger
from lib.hash_guard import es_duplicado, guardar_hash
from lib.api_client import subir_ventas, subir_ventas_analytics
from lib.chess_document_types import seleccionar_tipos_documento_normalizado

from motores.cuentas_corrientes import (
    TENANTS as _CC_TENANTS,
    _cerrar_accesos_concurrentes,
    _cerrar_popup_nexty,
    _hacer_login,
)

# ─────────────────────────────────────────────────────────────────
# CONFIGURACIÓN
# ─────────────────────────────────────────────────────────────────

logger = get_logger("VENTAS")
AR_TZ = ZoneInfo("America/Argentina/Buenos_Aires")

# Carpetas (misma convención que motores/cuentas_corrientes.py)
BASE_DIR = Path(__file__).resolve().parent.parent
DOWNLOADS_DIR = BASE_DIR / "downloads"
ERRORS_DIR = BASE_DIR / "logs" / "errors"

# Modo de visualización del browser
HEADLESS = os.environ.get("RPA_HEADLESS", "true").lower() != "false"

# Timeout general para esperas (ms)
TIMEOUT_MS = 30_000

# Cuántos días atrás descargar por defecto
# CHESS_DIAS_ATRAS=1 → ayer
DIAS_ATRAS = int(os.environ.get("CHESS_DIAS_ATRAS", "1"))

# Solo un tenant (pruebas / análisis): RPA_VENTAS_SOLO_TENANT=aloma
_SOLO_TENANT = os.environ.get("RPA_VENTAS_SOLO_TENANT", "").strip()

# Conservar los .xlsx en downloads/ tras leerlos (por defecto se borran tras subir/hash)
_KEEP_LOCAL_XLSX = os.environ.get("RPA_VENTAS_KEEP_LOCAL_XLSX", "").lower() in (
    "1",
    "true",
    "yes",
)

# ─────────────────────────────────────────────────────────────────
# DEFINICIÓN DE TENANTS
# Verificados en vivo el 24/03/2026
# Las credenciales se leen de Supabase Vault en runtime
# ─────────────────────────────────────────────────────────────────

# Misma definición base que motores/cuentas_corrientes (vault, url_base, activo, id_dist, …).
# Campo extra solo de ventas: sucursal (filtro mat-select; None = todas).
_VENTAS_SUCURSAL = {
    "tabaco": None,
    "aloma": None,
    "liver": None,
    # ⚠️ Texto EXACTO verificado en vivo — "UEQUIN RODRIGO", no "8 RODRIGO UEQUIN"
    "real": "UEQUIN RODRIGO",
    "extra": None,
    "beltrocco": None,
    "hugo_cena": None,
}


def _build_tenants_ventas() -> list[dict]:
    out: list[dict] = []
    for t in _CC_TENANTS:
        tid = t["id"]
        if tid not in _VENTAS_SUCURSAL:
            continue
        out.append({**t, "sucursal": _VENTAS_SUCURSAL[tid]})
    return out


TENANTS = _build_tenants_ventas()


# ─────────────────────────────────────────────────────────────────
# FUNCIONES AUXILIARES
# ─────────────────────────────────────────────────────────────────

def _timestamp() -> str:
    return datetime.now(AR_TZ).strftime("%Y%m%d_%H%M")


def _calcular_fechas(dias_atras: int, fecha_desde_override: str = None,
                     fecha_hasta_override: str = None) -> tuple[str, str]:
    """
    Calcula el rango de fechas para la consulta.

    Por defecto usa AYER como único día (desde=hasta=ayer).
    Se puede sobreescribir pasando fechas en formato DD/MM/YYYY.
    """
    if fecha_desde_override and fecha_hasta_override:
        return fecha_desde_override, fecha_hasta_override

    referencia = datetime.now(AR_TZ) - timedelta(days=dias_atras)
    fecha = referencia.strftime("%d/%m/%Y")
    return fecha, fecha


async def _screenshot_error(page: Page, tenant_id: str, paso: str) -> None:
    """Guarda screenshot cuando algo falla."""
    try:
        ERRORS_DIR.mkdir(parents=True, exist_ok=True)
        nombre = f"error_{tenant_id}_{paso}_{_timestamp()}.png"
        await page.screenshot(path=str(ERRORS_DIR / nombre), full_page=True)
        logger.info(f"  📸 Screenshot guardado: {nombre}")
    except Exception as e:
        logger.warning(f"  No se pudo guardar screenshot: {e}")


# Login, popup actualización y Nexty: mismos pasos que motores/cuentas_corrientes
# (_hacer_login, _cerrar_popup_nexty importados).


def _substring_busqueda_empresa_chess(nombre_legal: str) -> str:
    """Texto para matchear mat-option Empresa en CHESS (evita 'Tabaco Hnos' vs 'Tabaco & Hnos S.R.L.')."""
    cleaned = re.sub(r"[^\w\s&]", " ", nombre_legal or "")
    words = [w for w in cleaned.split() if len(w) > 2][:4]
    if not words:
        return (nombre_legal or "EMPRESA")[:28].strip()
    _W2_SKIP = frozenset({"hnos", "srl", "distribuidores", "oficiales", "oficial"})
    if len(words) >= 2 and words[1].lower() not in _W2_SKIP:
        return f"{words[0]} {words[1]}"
    return words[0]


async def _configurar_empresa_comprobantes(page: Page, tenant: dict) -> None:
    """
    Solo **Real**: el reporte multicompañía deja Empresas en placeholder y Procesar no avanza.
    Otros tenants (Tabaco, Aloma, Liver) ya vienen con empresa usable; no tocar el combo.
    """
    if tenant.get("id") != "real":
        return
    try:
        combo = page.get_by_role("combobox", name=re.compile(r"empresas?\b", re.I)).first
        await combo.wait_for(state="visible", timeout=15_000)
    except Exception:
        logger.info("  Empresas: combobox no encontrado — omitido")
        return
    try:
        raw = (await combo.inner_text()).strip().replace("\n", " ")
    except Exception:
        return
    norm = re.sub(r"\s+", " ", raw.lower()).strip()
    _PLACE = frozenset({"", "empresas", "empresa", "seleccioná", "selecciona", "seleccionar"})
    need_pick = (not norm) or (norm in _PLACE) or ("todas" in norm)
    if not need_pick:
        logger.info(f"  Empresas: valor actual ({raw[:56]}...) — sin cambios")
        return

    needle = _substring_busqueda_empresa_chess(tenant.get("nombre") or "")
    if not needle:
        logger.warning("  Empresas: sin nombre de tenant para matchear opción")
        return
    logger.info(f"  Configurando Empresa (CHESS) buscando opción que contenga '{needle}'...")
    try:
        await combo.click()
        await page.wait_for_timeout(500)
        opt = page.locator("mat-option").filter(has_text=re.compile(re.escape(needle), re.I)).first
        await opt.wait_for(state="visible", timeout=TIMEOUT_MS)
        await opt.click()
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(400)
        logger.info("  ✅ Empresa seleccionada")
    except Exception as e:
        logger.warning(f"  No se pudo seleccionar Empresa automáticamente: {e}")
        for _ in range(4):
            await page.keyboard.press("Escape")
            await page.wait_for_timeout(250)


# ─────────────────────────────────────────────────────────────────
# PASO 4: CONFIGURAR SUCURSAL (solo Real Tabacalera)
# ─────────────────────────────────────────────────────────────────

async def _configurar_sucursal(page: Page, sucursal: Optional[str]) -> None:
    """
    Filtra por sucursal específica.

    Solo aplica a Real Tabacalera (sucursal = "UEQUIN RODRIGO").
    Para los otros 3 tenants, sucursal = None → no tocar el selector.

    Proceso:
      1. Abrir el mat-select de Sucursal
      2. Deseleccionar todas las que estén marcadas
      3. Seleccionar solo "UEQUIN RODRIGO"
      4. Cerrar con Escape
    """
    if not sucursal:
        logger.info("  Sucursal: todas (sin filtro)")
        return

    logger.info(f"  Configurando sucursal: '{sucursal}'")

    selector_sucursal = page.locator('mat-select[placeholder="Sucursal"]')
    await selector_sucursal.wait_for(state="visible", timeout=TIMEOUT_MS)
    await selector_sucursal.click()
    await page.wait_for_timeout(500)

    # Deseleccionar todas — siempre atacar nth(0) para evitar shifting de índices
    # (el locator es "vivo": al deseleccionar nth(0) desaparece, nth(1)→nth(0), etc.)
    while True:
        opciones_marcadas = page.locator('mat-option[aria-selected="true"]')
        if await opciones_marcadas.count() == 0:
            break
        await opciones_marcadas.nth(0).click()
        await page.wait_for_timeout(150)

    # Seleccionar solo la sucursal requerida
    await page.locator(f'mat-option:has-text("{sucursal}")').click()
    await page.keyboard.press("Escape")
    await page.wait_for_timeout(300)
    logger.info(f"  ✅ Sucursal '{sucursal}' seleccionada")


# ─────────────────────────────────────────────────────────────────
# PASO 5: COMPLETAR FECHAS
# ─────────────────────────────────────────────────────────────────

async def _completar_fechas(page: Page, fecha_desde: str, fecha_hasta: str) -> None:
    """
    Completa los campos Fecha Desde y Fecha Hasta.

    Los campos usan la directiva Angular 'mascarafecha'.
    Selectores verificados: #mat-input-5 y #mat-input-6
    Estrategia: click → Ctrl+A (seleccionar todo) → fill → Tab
    """
    logger.info(f"  Fechas: {fecha_desde} → {fecha_hasta}")

    campo_desde = page.locator('#mat-input-5')
    await campo_desde.wait_for(state="visible", timeout=TIMEOUT_MS)
    await campo_desde.click()
    await page.keyboard.press("Control+a")
    await campo_desde.fill(fecha_desde)
    await page.keyboard.press("Tab")

    campo_hasta = page.locator('#mat-input-6')
    await campo_hasta.click()
    await page.keyboard.press("Control+a")
    await campo_hasta.fill(fecha_hasta)
    await page.keyboard.press("Tab")

    logger.info("  ✅ Fechas completadas")


# ─────────────────────────────────────────────────────────────────
# PASO 6: PROCESAR Y DETECTAR RESULTADO
# ─────────────────────────────────────────────────────────────────

async def _esperar_post_procesar_chess(page: Page, timeout_sec: float = 240.0) -> str:
    """
    Tras clic en Procesar: modal de export, grilla con filas, o botón Redefinir.
    En algunos tenants la grilla aparece sin que el botón pase a 'Redefinir' de inmediato.
    Devuelve: 'modal' | 'grilla' | 'redefinir' | 'timeout'.
    """
    t0 = time.monotonic()
    while time.monotonic() - t0 < timeout_sec:
        try:
            if await page.locator("kendo-dialog mat-radio-button").first.is_visible():
                return "modal"
        except Exception:
            pass
        try:
            if await page.locator('button.btn.btn-primary.margin-boton:has-text("Redefinir")').is_visible():
                return "redefinir"
        except Exception:
            pass
        try:
            if await page.locator(".ag-row").count() > 0:
                return "grilla"
        except Exception:
            pass
        await page.wait_for_timeout(400)
    return "timeout"


async def _abrir_modal_exportacion(page: Page) -> None:
    """
    Hace clic en Procesar (o en el botón fa-file-download de la grilla)
    y espera que el modal kendo-dialog de exportación esté visible.

    CHESS siempre usa el mismo modal para exportar — la diferencia es cómo llegar:
      - >1.000 registros: el modal aparece automáticamente después de Procesar
      - <=1.000 registros: primero muestra la grilla, luego hay que clickear
        el botón fa-file-download para abrir el mismo modal

    Selector confiable del modal verificado en vivo: kendo-dialog
    Los radio buttons mat-radio-button son el indicador de que el modal está listo.
    """
    logger.info("  Procesando consulta...")
    for _ in range(1):
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(120)
    # CHESS/Angular: el nombre accesible no siempre matchea get_by_role("Procesar").
    btn_procesar = page.locator("button.btn.btn-primary.margin-boton").filter(
        has_text=re.compile(r"procesar", re.I)
    ).first
    await btn_procesar.wait_for(state="visible", timeout=TIMEOUT_MS)
    await btn_procesar.scroll_into_view_if_needed()
    try:
        await btn_procesar.click(timeout=15_000)
    except Exception:
        await btn_procesar.click(force=True, timeout=15_000)

    _post_sec = float(os.environ.get("CHESS_VENTAS_POST_PROCESAR_SEC", "240"))
    logger.info(f"  Esperando resultado de la consulta (modal, grilla o Redefinir, hasta {_post_sec:.0f}s)...")
    post = await _esperar_post_procesar_chess(page, timeout_sec=_post_sec)
    if post == "modal":
        logger.info("  Modal de exportación visible (consulta / >1k)")
        return
    if post == "grilla":
        logger.info("  Grilla con datos — abriendo exportación vía toolbar")
        await page.wait_for_timeout(800)
    elif post == "redefinir":
        logger.info("  Consulta completada")
        await page.wait_for_timeout(2000)
    else:
        logger.warning("  Timeout sin modal/Redefinir/grilla — intentando modal y grilla")
        await page.wait_for_timeout(2000)

    _MODAL_MS = 35_000
    if post != "grilla":
        try:
            await page.locator("kendo-dialog mat-radio-button").first.wait_for(
                state="visible", timeout=_MODAL_MS
            )
            logger.info("  Modal de exportación visible (radios listos)")
            return
        except Exception:
            pass
        try:
            dlg = page.locator("kendo-dialog").filter(has_text=re.compile(r"exportaci", re.I))
            await dlg.wait_for(state="visible", timeout=min(8_000, _MODAL_MS))
            await dlg.locator("mat-radio-button").first.wait_for(state="visible", timeout=10_000)
            logger.info("  Modal de exportación visible (título Exportación)")
            return
        except Exception:
            pass

    # Si no hay modal, estamos en modo grilla (<=1000 registros)
    logger.info("  Modo grilla (<=1.000 reg) — abriendo modal via fa-file-download...")
    try:
        await page.locator(".ag-root").wait_for(state="visible", timeout=20_000)
    except Exception:
        logger.warning("  Grilla .ag-root no visible en 20s — sigue búsqueda del botón descarga")

    btn_download = (
        page.locator('button:has(i[class*="fa-file-download"])')
        .or_(page.locator('button:has(svg[class*="fa-file-download"])'))
        .or_(page.locator("button:has(i.fa-file-download)"))
        .first
    )
    await btn_download.wait_for(state="visible", timeout=90_000)
    await btn_download.click()

    dlg_post = page.locator("kendo-dialog").filter(has_text=re.compile(r"exportaci", re.I))
    await dlg_post.wait_for(state="visible", timeout=60_000)
    await dlg_post.locator("mat-radio-button").first.wait_for(state="visible", timeout=10_000)
    logger.info("  Modal de exportación abierto via grilla ✅")
    

# ─────────────────────────────────────────────────────────────────
# PASO 7A: DESCARGAR DESDE LA GRILLA (caso <=1000 registros)
# ─────────────────────────────────────────────────────────────────

async def _descargar_de_grilla(page: Page, tenant_id: str) -> Optional[bytes]:
    """
    Descarga el Excel usando el botón de la toolbar de ag-grid.

    Caso: la grilla mostró <=1000 registros directamente en pantalla.
    El botón de descarga tiene la clase 'btn btn-default btn-xs mright-5'
    y contiene el icono 'fas fa-file-download'. Verificado en Aloma.

    IMPORTANTE: en este caso el sistema genera UN SOLO archivo (no hay
    distincion resumido/detallado). Se sube como 'resumido' y se deja
    'detallado' en None.

    Devuelve los bytes del archivo o None si fallo.
    """
    logger.info("  Descargando desde grilla (modo directo)...")
    try:
        # El botón contiene el icono fa-file-download
        btn = page.locator('button:has(i.fa-file-download)').first
        await btn.wait_for(state="visible", timeout=TIMEOUT_MS)

        async with page.expect_download(timeout=120_000) as dl_info:
            await btn.click()

        download: Download = await dl_info.value
        DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
        nombre = download.suggested_filename or f"ventas_{tenant_id}_grilla_{_timestamp()}.xlsx"
        ruta_temp = DOWNLOADS_DIR / nombre
        await download.save_as(str(ruta_temp))

        file_bytes = ruta_temp.read_bytes()
        size_kb = len(file_bytes) / 1024
        logger.info(f"  Grilla descargada: {nombre} ({size_kb:.1f} KB)")

        if not _KEEP_LOCAL_XLSX:
            try:
                ruta_temp.unlink()
            except Exception:
                pass
        else:
            logger.info(f"  📁 XLSX grilla conservado: {ruta_temp}")

        return file_bytes

    except Exception as e:
        logger.error(f"  Error descargando desde grilla: {e}")
        return None


# ─────────────────────────────────────────────────────────────────
# PASO 7B: DESCARGAR ARCHIVO DEL MODAL
# ─────────────────────────────────────────────────────────────────

async def _descargar_del_modal(page: Page, tipo: str, tenant_id: str) -> Optional[bytes]:
    """
    Descarga un archivo del modal de exportación.

    tipo: "resumido" o "detallado"

    ⚠️ El modal NO se cierra entre descargas. Se puede llamar
    dos veces seguidas (primero resumido, luego detallado)
    sin cerrar el modal entre medio.

    Devuelve los bytes del archivo o None si falló.
    """
    logger.info(f"  Descargando {tipo}...")

    # Seleccionar el radio button correcto
    if tipo == "resumido":
        # El resumido viene seleccionado por defecto (mat-radio-checked)
        # Lo clickeamos igual para asegurarnos
        radio = page.locator('mat-radio-button:not(.radioPlanilla)').first
    else:
        # Detallado tiene la clase específica "radioPlanilla"
        radio = page.locator('mat-radio-button.radioPlanilla').first

    await radio.wait_for(state="visible", timeout=TIMEOUT_MS)
    await radio.click()
    await page.wait_for_timeout(300)

    try:
        # Capturar la descarga ANTES de hacer click en Exportar
        async with page.expect_download(timeout=120_000) as dl_info:
            await page.locator('button.btn.btn-md.btn-primary').click()

        download: Download = await dl_info.value

        # Guardar en downloads/ con nombre descriptivo
        DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
        nombre = download.suggested_filename or f"ventas_{tenant_id}_{tipo}_{_timestamp()}.xlsx"
        ruta_temp = DOWNLOADS_DIR / nombre
        await download.save_as(str(ruta_temp))

        file_bytes = ruta_temp.read_bytes()
        size_kb = len(file_bytes) / 1024
        logger.info(f"  ✅ {tipo.upper()}: {nombre} ({size_kb:.1f} KB)")

        if not _KEEP_LOCAL_XLSX:
            try:
                ruta_temp.unlink()
            except Exception:
                pass
        else:
            logger.info(f"  📁 XLSX conservado en disco: {ruta_temp}")

        return file_bytes

    except Exception as e:
        logger.error(f"  ❌ Error descargando {tipo}: {e}")
        return None


def _analizar_y_subir_analytics(
    tenant_id: str,
    bytes_resumido: bytes,
    bytes_detallado: bytes,
    fecha_desde: str,
    fecha_hasta: str,
) -> bool:
    """
    Reusa scripts/analizar_ventas_comprobantes.py y sube su JSON a /api/motor/ventas-analytics.
    """
    script = BASE_DIR / "scripts" / "analizar_ventas_comprobantes.py"
    if not script.exists():
        logger.warning(f"  ⚠️ Script de análisis no encontrado: {script}")
        return False

    with tempfile.TemporaryDirectory(prefix=f"ventas_{tenant_id}_") as td:
        tmp = Path(td)
        p_res = tmp / f"{tenant_id}_resumido.xlsx"
        p_det = tmp / f"{tenant_id}_detallado.xlsx"
        p_out = tmp / f"{tenant_id}_analytics.json"
        p_res.write_bytes(bytes_resumido)
        p_det.write_bytes(bytes_detallado)

        cmd = [sys.executable, str(script), str(p_res), str(p_det), "--json", str(p_out)]
        run = subprocess.run(cmd, capture_output=True, text=True)
        if run.returncode != 0:
            logger.error(f"  ❌ Falló análisis de ventas ({tenant_id}): {run.stderr[:300]}")
            return False
        if not p_out.exists():
            logger.error("  ❌ Análisis no generó archivo JSON de salida")
            return False

        try:
            payload = json.loads(p_out.read_text(encoding="utf-8"))
        except Exception as e:
            logger.error(f"  ❌ JSON de análisis inválido: {e}")
            return False

        return subir_ventas_analytics(
            tenant_id=tenant_id,
            payload=payload,
            fecha_desde=_to_iso_date(fecha_desde),
            fecha_hasta=_to_iso_date(fecha_hasta),
        )


def _to_iso_date(fecha: str | None) -> str | None:
    """
    Convierte DD/MM/YYYY -> YYYY-MM-DD para persistencia en Postgres.
    Si no puede parsear, devuelve el valor original.
    """
    if not fecha:
        return fecha
    try:
        return datetime.strptime(fecha, "%d/%m/%Y").strftime("%Y-%m-%d")
    except Exception:
        return fecha


# ─────────────────────────────────────────────────────────────────
# PROCESAMIENTO COMPLETO DE UN TENANT
# ─────────────────────────────────────────────────────────────────

async def _procesar_tenant(
    tenant: dict,
    fecha_desde: str,
    fecha_hasta: str,
) -> dict:
    """
    Ejecuta el flujo completo para un tenant: login → reporte → 2 descargas → subida.

    Devuelve un dict con el resultado:
        {
            "tenant": "tabaco",
            "nombre": "Tabaco & Hnos S.R.L.",
            "resumido": "subida_ok" | "sin_cambios" | "error",
            "detallado": "subida_ok" | "sin_cambios" | "error",
            "error": None | "descripción del error"
        }
    """
    tenant_id = tenant["id"]
    resultado = {
        "tenant":   tenant_id,
        "nombre":   tenant["nombre"],
        "resumido": "error",
        "detallado": "error",
        "error":    None,
    }

    logger.info(f"\n{'─'*50}")
    logger.info(f"🏢 Tenant: {tenant['nombre']}")
    logger.info(f"   URL: {tenant['url_base']}")
    logger.info(f"   Fechas: {fecha_desde} → {fecha_hasta}")
    logger.info(f"{'─'*50}")

    async with async_playwright() as pw:
        browser: Browser = await pw.chromium.launch(
            headless=HEADLESS,
            args=["--no-sandbox", "--disable-dev-shm-usage"]
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
            # ── Login ─────────────────────────────────────────────
            await _hacer_login(page, tenant)

            # ── Cerrar popup de Nexty ─────────────────────────────
            await _cerrar_popup_nexty(page)

            # ── Navegar al reporte ────────────────────────────────
            url_reporte = f"{tenant['url_base']}/#/ventas/reportes/comprobantes"
            logger.info(f"  Navegando al reporte...")
            await page.goto(url_reporte, wait_until="networkidle")
            await _cerrar_accesos_concurrentes(page)
            await page.locator('#mat-input-5').wait_for(state="visible", timeout=TIMEOUT_MS)
            logger.info("  ✅ Reporte cargado")

            # ── Empresa (Real y otros multicompañía: placeholder bloquea Procesar) ──
            await _configurar_empresa_comprobantes(page, tenant)

            # ── Tipos de documento (solo Real; orden alineado a scripts/ventas_real_caramele_debug_v1: antes de sucursal)
            if tenant_id == "real":
                try:
                    marcados = await seleccionar_tipos_documento_normalizado(page, None)
                    if marcados:
                        logger.info(f"  Tipos documento: {len(marcados)} grupo(s) marcados")
                except Exception as e:
                    logger.warning(f"  Tipos documento (no bloqueante): {e}")

            # ── Configurar sucursal (solo Real Tabacalera) ────────
            await _configurar_sucursal(page, tenant["sucursal"])

            # ── Completar fechas ──────────────────────────────────
            await _completar_fechas(page, fecha_desde, fecha_hasta)

            # ── Procesar y detectar resultado ─────────────────────
            # Puede ser "modal" (>1000 registros) o "grilla" (<=1000)
            # El modal siempre aparece — ya sea directo (>1000) o via botón grilla (<=1000)
            await _abrir_modal_exportacion(page)

            bytes_resumido  = None
            bytes_detallado = None

            # El modal siempre está disponible (directo o via botón grilla)
            # Descargar resumido y detallado del modal
            bytes_resumido  = await _descargar_del_modal(page, "resumido",  tenant_id)
            bytes_detallado = await _descargar_del_modal(page, "detallado", tenant_id)
            # Cerrar el modal
            try:
                await page.locator('button.btn.btn-md.btn-default').click()
            except Exception:
                pass

            # ── Hash Guard + Subida API para RESUMIDO ─────────────
            if bytes_resumido:
                clave = f"ventas_{tenant_id}_resumido"
                if es_duplicado(clave, bytes_resumido):
                    resultado["resumido"] = "sin_cambios"
                else:
                    nombre_api = f"ventas_{tenant_id}_resumido_{_timestamp()}.xlsx"
                    ok = subir_ventas(tenant_id, "resumido", nombre_api, bytes_resumido)
                    if ok:
                        guardar_hash(clave, bytes_resumido)
                        resultado["resumido"] = "subida_ok"
                    else:
                        resultado["resumido"] = "error"

            # ── Hash Guard + Subida API para DETALLADO ────────────
            if bytes_detallado:
                clave = f"ventas_{tenant_id}_detallado"
                if es_duplicado(clave, bytes_detallado):
                    resultado["detallado"] = "sin_cambios"
                else:
                    nombre_api = f"ventas_{tenant_id}_detallado_{_timestamp()}.xlsx"
                    ok = subir_ventas(tenant_id, "detallado", nombre_api, bytes_detallado)
                    if ok:
                        guardar_hash(clave, bytes_detallado)
                        resultado["detallado"] = "subida_ok"
                    else:
                        resultado["detallado"] = "error"

            # ── Análisis JSON + persistencia analytics ───────────────
            if bytes_resumido and bytes_detallado:
                ok_analytics = _analizar_y_subir_analytics(
                    tenant_id=tenant_id,
                    bytes_resumido=bytes_resumido,
                    bytes_detallado=bytes_detallado,
                    fecha_desde=fecha_desde,
                    fecha_hasta=fecha_hasta,
                )
                if ok_analytics:
                    logger.info("  ✅ Analytics de ventas persistido")
                else:
                    logger.warning("  ⚠️ No se pudo persistir analytics de ventas (no bloquea el motor)")

        except Exception as e:
            msg = str(e)[:300]
            logger.error(f"  ❌ Error en tenant {tenant_id}: {msg}")
            resultado["error"] = msg
            await _screenshot_error(page, tenant_id, "proceso")

        finally:
            await context.close()
            await browser.close()
            logger.info(f"  Browser cerrado — tenant {tenant_id}")

    return resultado


# ─────────────────────────────────────────────────────────────────
# FUNCIÓN PRINCIPAL — PUNTO DE ENTRADA DEL MOTOR
# ─────────────────────────────────────────────────────────────────

async def run(
    fecha_desde_override: str = None,
    fecha_hasta_override: str = None,
) -> dict:
    """
    Ejecuta el motor completo de Comprobantes de Ventas.

    Llamada desde runner.py:
        from motores.ventas import run
        resumen = await run()

        # Con fechas custom:
        resumen = await run("01/03/2026", "14/03/2026")

    Parámetros opcionales:
        fecha_desde_override : fecha inicio en formato DD/MM/YYYY
        fecha_hasta_override : fecha fin en formato DD/MM/YYYY
        Si no se pasan, usa AYER como rango único.

    Devuelve resumen de la ejecución completa.
    """
    inicio = datetime.now(AR_TZ)

    fecha_desde, fecha_hasta = _calcular_fechas(
        DIAS_ATRAS, fecha_desde_override, fecha_hasta_override
    )

    logger.info("=" * 60)
    logger.info(f"🚀 Motor VENTAS iniciado — {inicio.strftime('%Y-%m-%d %H:%M:%S')}")
    tenants_activos = [t for t in TENANTS if t.get("activo", True)]
    target = (os.environ.get("RPA_VENTAS_TENANT") or "").strip().lower()
    if target:
        tenants_activos = [t for t in tenants_activos if t.get("id") == target]
        logger.warning(f"⚙️ RPA_VENTAS_TENANT activo: ejecutando sólo tenant '{target}'")
    if _SOLO_TENANT:
        tenants_activos = [t for t in tenants_activos if t["id"] == _SOLO_TENANT]
        logger.info(f"   Filtro RPA_VENTAS_SOLO_TENANT={_SOLO_TENANT}")
    logger.info(f"   Tenants a procesar: {len(tenants_activos)} (activos)")
    logger.info(f"   Rango de fechas: {fecha_desde} → {fecha_hasta}")
    logger.info(f"   Headless: {HEADLESS}")
    if _KEEP_LOCAL_XLSX:
        logger.info("   RPA_VENTAS_KEEP_LOCAL_XLSX: conservando .xlsx en downloads/")
    logger.info("=" * 60)

    if not tenants_activos:
        logger.error("No hay tenants para procesar (revisar activo y RPA_VENTAS_SOLO_TENANT).")
        return {
            "motor":        "VENTAS",
            "inicio":       inicio.strftime("%Y-%m-%d %H:%M:%S"),
            "fin":          datetime.now(AR_TZ).strftime("%Y-%m-%d %H:%M:%S"),
            "duracion_min": 0.0,
            "fecha_desde":  fecha_desde,
            "fecha_hasta":  fecha_hasta,
            "ok":           0,
            "sin_cambios":  0,
            "errores":      0,
            "detalle":      [],
        }

    resultados = []

    for tenant in tenants_activos:
        # Cada tenant corre en su propio browser independiente.
        # Si uno falla, el siguiente arranca desde cero sin estado contaminado.
        resultado = await _procesar_tenant(tenant, fecha_desde, fecha_hasta)
        resultados.append(resultado)

        # Log inline del resultado
        r = resultado["resumido"]
        d = resultado["detallado"]
        iconos = {"subida_ok": "✅", "sin_cambios": "ℹ️ ", "error": "❌"}
        logger.info(
            f"  {tenant['nombre']}: "
            f"resumido={iconos.get(r,'?')}{r}  "
            f"detallado={iconos.get(d,'?')}{d}"
        )

    # ── RESUMEN FINAL ─────────────────────────────────────────────
    fin = datetime.now(AR_TZ)
    duracion = (fin - inicio).total_seconds() / 60

    ok_total          = sum(1 for r in resultados if r["resumido"] == "subida_ok" and r["detallado"] == "subida_ok")
    sin_cambios_total = sum(1 for r in resultados if r["resumido"] == "sin_cambios" and r["detallado"] == "sin_cambios")
    errores_total     = sum(1 for r in resultados if r["error"] is not None)

    logger.info("\n" + "=" * 60)
    logger.info("📊 RESUMEN MOTOR VENTAS")
    logger.info(f"   Duración:        {duracion:.1f} minutos")
    n = len(tenants_activos)
    logger.info(f"   ✅ Tenants OK:   {ok_total}/{n}")
    logger.info(f"   ℹ️  Sin cambios: {sin_cambios_total}/{n}")
    logger.info(f"   ❌ Con errores:  {errores_total}/{n}")
    logger.info("=" * 60 + "\n")

    return {
        "motor":        "VENTAS",
        "inicio":       inicio.strftime("%Y-%m-%d %H:%M:%S"),
        "fin":          fin.strftime("%Y-%m-%d %H:%M:%S"),
        "duracion_min": round(duracion, 1),
        "fecha_desde":  fecha_desde,
        "fecha_hasta":  fecha_hasta,
        "ok":           ok_total,
        "sin_cambios":  sin_cambios_total,
        "errores":      errores_total,
        "detalle":      resultados,
    }
