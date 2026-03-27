# -*- coding: utf-8 -*-
"""
motores/ventas.py
=================
Motor 2: Comprobantes de Ventas — CHESS ERP (Multi-tenant)

¿Qué hace este archivo?
-----------------------
Todos los días a las 13:30, 18:30 y 23:00:
  1. Para cada uno de los 4 tenants de CHESS ERP:
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

TENANTS (verificados en vivo el 24/03/2026):
  - tabaco    : Tabaco & Hnos S.R.L.         → tabacohermanos.chesserp.com/AR1149
  - aloma     : Aloma Distribuidores Ofic.   → alomasrl.chesserp.com/AR1252
  - liver     : Liver SRL                    → liversrl.chesserp.com/AR1274
  - real      : Real Tabacalera de Santiago  → realtabacalera.chesserp.com/AR1272

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
from lib.api_client import subir_ventas
from lib.vault_client import get_secret

# ─────────────────────────────────────────────────────────────────
# CONFIGURACIÓN
# ─────────────────────────────────────────────────────────────────

logger = get_logger("VENTAS")
AR_TZ = ZoneInfo("America/Argentina/Buenos_Aires")

# Carpetas
DOWNLOADS_DIR = Path("/opt/shelfmind/rpa/downloads")
ERRORS_DIR    = Path("/opt/shelfmind/rpa/logs/errors")

# Modo de visualización del browser
HEADLESS = os.environ.get("RPA_HEADLESS", "true").lower() != "false"

# Timeout general para esperas (ms)
TIMEOUT_MS = 30_000

# Cuántos días atrás descargar por defecto
# CHESS_DIAS_ATRAS=1 → ayer
DIAS_ATRAS = int(os.environ.get("CHESS_DIAS_ATRAS", "1"))

# ─────────────────────────────────────────────────────────────────
# DEFINICIÓN DE TENANTS
# Verificados en vivo el 24/03/2026
# Las credenciales se leen de Supabase Vault en runtime
# ─────────────────────────────────────────────────────────────────

# Cada tenant tiene:
#   id          : clave interna usada en logs, hashes y API
#   nombre      : nombre legible para logs
#   url_base    : URL raíz del tenant (sin /#/)
#   vault_user  : nombre del secreto en Vault para el usuario
#   vault_pass  : nombre del secreto en Vault para la contraseña
#   sucursal    : texto exacto de la sucursal a filtrar, o None = todas
#   id_dist     : id_distribuidor en Supabase (completar con el valor real)

TENANTS = [
    {
        "id":         "tabaco",
        "nombre":     "Tabaco & Hnos S.R.L.",
        "url_base":   "https://tabacohermanos.chesserp.com/AR1149",
        "vault_user": "chess_tabaco_usuario",
        "vault_pass": "chess_tabaco_password",
        "sucursal":   None,   # Todas las sucursales (RECONQUISTA, RESISTENCIA, etc.)
        "id_dist":    1,      # ← completar con el id_distribuidor real en Supabase
    },
    {
        "id":         "aloma",
        "nombre":     "Aloma Distribuidores Oficiales",
        "url_base":   "https://alomasrl.chesserp.com/AR1252",
        "vault_user": "chess_aloma_usuario",
        "vault_pass": "chess_aloma_password",
        "sucursal":   None,   # Una sola sucursal (CASA CENTRAL) ya preseleccionada
        "id_dist":    2,      # ← completar con el id_distribuidor real en Supabase
    },
    {
        "id":         "liver",
        "nombre":     "Liver SRL",
        "url_base":   "https://liversrl.chesserp.com/AR1274",
        "vault_user": "chess_liver_usuario",
        "vault_pass": "chess_liver_password",
        "sucursal":   None,   # Una sola sucursal (CASA CENTRAL) ya preseleccionada
        "id_dist":    3,      # ← completar con el id_distribuidor real en Supabase
    },
    {
        "id":         "real",
        "nombre":     "Real Tabacalera de Santiago S.A.",
        "url_base":   "https://realtabacalera.chesserp.com/AR1272",
        "vault_user": "chess_real_usuario",
        "vault_pass": "chess_real_password",
        # ⚠️ Texto EXACTO verificado en vivo el 24/03/2026
        # En el dropdown aparece como "UEQUIN RODRIGO" — NO "8 RODRIGO UEQUIN"
        "sucursal":   "UEQUIN RODRIGO",
        "id_dist":    4,      # ← completar con el id_distribuidor real en Supabase
    },
]


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


# ─────────────────────────────────────────────────────────────────
# PASO 1: CERRAR POPUP DE ACTUALIZACIÓN
# ─────────────────────────────────────────────────────────────────

async def _cerrar_popup_actualizacion(page: Page) -> None:
    """
    Cierra el popup naranja de "Nueva versión de ChessERP".

    ⚠️ CRÍTICO: Este popup pone un overlay (k-overlay) que bloquea
    TODOS los clicks de la página. Playwright no puede hacer click
    en INICIAR SESIÓN hasta que este overlay desaparezca.
    Verificado en vivo: aparece en todos los tenants.

    Al hacer click en "Actualizar", la página se recarga y el
    overlay desaparece. Recién entonces se puede interactuar.
    """
    try:
        btn = page.locator('button:has-text("Actualizar")')
        await btn.wait_for(state="visible", timeout=5_000)
        logger.info("  ⚠️  Popup de actualización detectado — cerrando...")
        await btn.click()
        await page.wait_for_load_state("networkidle", timeout=15_000)
        logger.info("  Popup de actualización cerrado ✅")
    except Exception:
        pass  # No había popup, es normal


# ─────────────────────────────────────────────────────────────────
# PASO 2: LOGIN
# ─────────────────────────────────────────────────────────────────

async def _hacer_login(page: Page, tenant: dict) -> None:
    """
    Login en CHESS ERP.

    Lee las credenciales de Supabase Vault. Cierra el popup de
    actualización antes de intentar el login.

    Lanza excepción si el login falla (para que el caller lo capture
    y lo registre como error del tenant).
    """
    url_login = f"{tenant['url_base']}/#/login"
    logger.info(f"  Navegando a login: {url_login}")
    await page.goto(url_login, wait_until="networkidle")

    # Cerrar popup de actualización ANTES de tocar el formulario
    await _cerrar_popup_actualizacion(page)

    # Esperar que el formulario esté listo
    await page.locator('input').first.wait_for(state="visible", timeout=TIMEOUT_MS)

    # Leer credenciales del Vault
    usuario  = get_secret(tenant["vault_user"])
    password = get_secret(tenant["vault_pass"])

    # Llenar formulario
    await page.locator('input').first.fill(usuario)
    await page.locator('input[type="password"]').fill(password)
    await page.locator('button:has-text("INICIAR SESIÓN")').click()

    # Esperar redirección al dashboard
    await page.wait_for_url("**/dashboard**", timeout=20_000)
    logger.info(f"  ✅ Login exitoso — {tenant['nombre']}")


# ─────────────────────────────────────────────────────────────────
# PASO 3: CERRAR POPUP DE NEXTY
# ─────────────────────────────────────────────────────────────────

async def _cerrar_popup_nexty(page: Page) -> None:
    """
    Cierra el popup post-login de "Sacale Mayor Provecho a Nexty".
    Timeout corto — si no aparece en 4 segundos, no es problema.
    """
    try:
        btn = page.locator(
            'button:has-text("No volver a mostrar"), '
            'button:has-text("Ver más tarde")'
        )
        await btn.first.wait_for(state="visible", timeout=4_000)
        await btn.first.click()
        logger.info("  Popup de Nexty cerrado")
    except Exception:
        pass


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
    await page.locator('button.btn.btn-primary.margin-boton').click()

    # Esperar que el botón cambie a "Redefinir" — indica que la consulta terminó
    logger.info("  Esperando resultado de la consulta...")
    try:
        await page.locator('button.btn.btn-primary.margin-boton:has-text("Redefinir")').wait_for(
            state="visible", timeout=60_000
        )
        logger.info("  Consulta completada")
    except Exception:
        pass  # Puede que el modal haya aparecido antes
# Verificar si el modal ya está visible (caso >1000 registros)
    try:
        # Filtro de texto agregado 👇
        await page.locator('kendo-dialog').filter(has_text="Exportación").wait_for(state="visible", timeout=3_000)
        logger.info("  Modal de exportación visible (>1.000 registros)")
        # Esperar que los radios estén listos
        await page.locator('mat-radio-button').first.wait_for(state="visible", timeout=10_000)
        return
    except Exception:
        pass

    # Si no hay modal, estamos en modo grilla (<=1000 registros)
    # Clickear el botón fa-file-download para abrir el modal
    logger.info("  Modo grilla (<=1.000 reg) — abriendo modal via fa-file-download...")
    btn_download = page.locator('button:has(i.fa-file-download)').first
    await btn_download.wait_for(state="visible", timeout=TIMEOUT_MS)
    await btn_download.click()

    # Esperar que el modal aparezca (Filtro de texto agregado 👇)
    await page.locator('kendo-dialog').filter(has_text="Exportación").wait_for(state="visible", timeout=TIMEOUT_MS)
    await page.locator('mat-radio-button').first.wait_for(state="visible", timeout=10_000)
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

        try:
            ruta_temp.unlink()
        except Exception:
            pass

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

        # Limpiar archivo temporal
        try:
            ruta_temp.unlink()
        except Exception:
            pass

        return file_bytes

    except Exception as e:
        logger.error(f"  ❌ Error descargando {tipo}: {e}")
        return None


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
            await page.locator('#mat-input-5').wait_for(state="visible", timeout=TIMEOUT_MS)
            logger.info("  ✅ Reporte cargado")

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
    logger.info(f"   Tenants a procesar: {len(TENANTS)}")
    logger.info(f"   Rango de fechas: {fecha_desde} → {fecha_hasta}")
    logger.info(f"   Headless: {HEADLESS}")
    logger.info("=" * 60)

    resultados = []

    for tenant in TENANTS:
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
    logger.info(f"   ✅ Tenants OK:   {ok_total}/{len(TENANTS)}")
    logger.info(f"   ℹ️  Sin cambios: {sin_cambios_total}/{len(TENANTS)}")
    logger.info(f"   ❌ Con errores:  {errores_total}/{len(TENANTS)}")
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
