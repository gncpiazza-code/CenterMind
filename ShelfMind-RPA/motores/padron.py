# -*- coding: utf-8 -*-
"""
motores/padron.py
=================
Motor 1: Padrón de Clientes — Consolido/Nextbyn Reporteador Genérico

¿Qué hace este archivo?
-----------------------
Cada día a las 04:00 y 14:00:
  1. Para cada uno de los 5 tenants de Consolido (tabaco, aloma, liver, real, extra):
     a. Abre un navegador invisible
     b. Navega a consolido.nextbyn.com
     c. Hace login con las credenciales del tenant
     d. Accede al módulo REPORTEADOR GENÉRICO
     e. Selecciona el reporte "Padrón de Clientes"
     f. Configura parámetros: "Incluyí Anulados" = NO, "Empresas" = tenant actual
     g. Hace clic en Ejecutar
     h. Espera tabla de resultados (típicamente 25k+ registros)
     i. Descarga el Excel via "Exportar resultados"
     j. Compara con el de ayer (Hash Guard para deduplicación)
     k. Sube el archivo a la API de Shelfy (/api/v1/sync/erp-padrón)
  2. Si un tenant falla, guarda screenshot y continúa con el siguiente
  3. Al final escribe el resumen completo en el log

TENANTS (verificados contra Consolido — valores reales de IDEMPRESA):
  - tabaco    : TABACO & HNOS S.R.L.              → IDEMPRESA=3154
  - aloma     : ALOMA DISTRIBUIDORES OFICIALES    → (a confirmar ID)
  - liver     : LIVER SRL                         → (a confirmar ID)
  - real      : REAL TABACALERA DE SANTIAGO S.A.  → (a confirmar ID)
  - extra     : GYG DISTRIBUCIÓN (credenciales pending)

ESTRUCTURA DEL EXCEL DESCARGADO:
  IDEMPRESA, DSEMPRESA, IDSUCUR, DSSUCUR, IDFUERZAVENTAS, DESFUERZAVENTAS,
  IDCLIENTEINTERNO, IDCLIENTE, NOMCLI, FANTACLI, [FEC...]

FLUJO CONSOLIDADO EN CONSOLIDO:
  1. URL base: https://consolido.nextbyn.com
  2. Login vía credentials en Supabase Vault (nuevo servicio: shelfy_vault_cliente_consolido)
  3. Módulo: REPORTEADOR GENÉRICO → Tab "Informes"
  4. Seleccionar proceso: Dropdown "Proceso" → "Padrón de clientes"
  5. Parámetros:
     - "Incluyí Anulados": radio button / toggle (por defecto: NO)
     - "Empresas": multi-checkbox (seleccionar solo la empresa del tenant)
  6. Botón "Ejecutar": lanza el procesamiento
  7. Tabla de resultados aparece automáticamente
  8. Botón "Exportar resultados": descarga el Excel
  9. Filename pattern: resultados_Reporte.PadronDeClientes-XX.xlsx
     (el "XX" es un número secuencial que auto-incrementa)

PARTICULARIDADES VERIFICADAS EN VIVO (27/04/2026):
  - URL Reporteador: https://consolido.nextbyn.com/#/reporteador (post-login)
  - Los IDs de empresa en Consolido son numéricos (ej. 3154 para Tabaco)
  - IDSUCUR en Excel es numérico (2=RESISTENCIA, 3=SAENZ PEÑA, etc.)
  - No hay "Nueva versión" popup como en CHESS — Consolido es más limpio
  - El timeout de ejecución del reporte puede ser >30s para empresas grandes
  - Un reporte con 3 empresas simultáneas puede fallar por timeout en Consolido
  - Solución: hacer 1 empresa por ejecución (ya está configurado así)
  - POST-descarga se pueden deduplicar en backend con hash guard
"""

import asyncio
import os
from datetime import datetime
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo

from playwright.async_api import (
    async_playwright, Browser, BrowserContext, Page, Download
)

from lib.logger import get_logger
from lib.hash_guard import es_duplicado, guardar_hash
from lib.api_client import subir_padron
from lib.vault_client import get_secret

# ─────────────────────────────────────────────────────────────────
# CONFIGURACIÓN
# ─────────────────────────────────────────────────────────────────

logger = get_logger("PADRON")
AR_TZ = ZoneInfo("America/Argentina/Buenos_Aires")

# Carpetas (portable: local/Mac y contenedor)
RPA_BASE_DIR = Path(os.environ.get("RPA_BASE_DIR", str(Path(__file__).resolve().parents[1])))
DOWNLOADS_DIR = RPA_BASE_DIR / "downloads"
ERRORS_DIR = RPA_BASE_DIR / "logs" / "errors"

# Modo headless
HEADLESS = os.environ.get("RPA_HEADLESS", "true").lower() != "false"

# Timeout general (ms)
TIMEOUT_MS = 60_000  # Consolido puede ser lento

# ─────────────────────────────────────────────────────────────────
# DEFINICIÓN DE TENANTS (LEGACY / FALLBACK)
# Consolido usa IDEMPRESA numéricos verificados en vivo.
# Fuente nueva recomendada: tabla Supabase `rpa_consolido_tenants`.
# ─────────────────────────────────────────────────────────────────

TENANTS_LEGACY = [
    {
        "id":         "tabaco",
        "nombre":     "Tabaco & Hnos S.R.L.",
        "id_empresa": "3154",  # ✅ VERIFICADO en vivo el 27/04/2026
        "id_dist":    3,
    },
    {
        "id":         "liver",
        "nombre":     "Liver SRL",
        "id_empresa": "3534",  # ✅ VISTO en lista Consolido el 27/04/2026
        "id_dist":    5,
    },
    {
        "id":         "extra",
        "nombre":     "GyG (Gomez Marcos Ariel)",
        "id_empresa": "3562",  # ✅ VISTO en lista Consolido el 27/04/2026
        "id_dist":    6,
    },
    {
        "id":         "aloma",
        "nombre":     "Aloma Distribuidores Oficiales",
        "id_empresa": "3442",  # ✅ CONFIRMADO por usuario
        "id_dist":    4,
    },
    {
        "id":         "real",
        "nombre":     "Real Tabacalera de Santiago S.A.",
        "id_empresa": "5597",  # ✅ CONFIRMADO — contiene franquiciados (split en backend)
        "id_dist":    2,
    },
]


# ─────────────────────────────────────────────────────────────────
# FUNCIONES AUXILIARES
# ─────────────────────────────────────────────────────────────────

def _timestamp() -> str:
    return datetime.now(AR_TZ).strftime("%Y%m%d_%H%M")


async def _screenshot_error(page: Page, tenant_id: str, paso: str) -> None:
    """Guarda screenshot cuando algo falla."""
    try:
        ERRORS_DIR.mkdir(parents=True, exist_ok=True)
        nombre = f"error_{tenant_id}_{paso}_{_timestamp()}.png"
        await page.screenshot(path=str(ERRORS_DIR / nombre), full_page=True)
        logger.info(f"  📸 Screenshot guardado: {nombre}")
    except Exception as e:
        logger.warning(f"  No se pudo guardar screenshot: {e}")


def _resolver_credenciales_consolido() -> tuple[str, str]:
    """
    Consolido ahora usa UN único usuario/password para todos los distribuidores.
    Prioridad:
      1) Vault/env: consolido_usuario + consolido_password
      2) Legacy (si todavía existe): consolido_tabaco_usuario + consolido_tabaco_password
    """
    usuario = get_secret("consolido_usuario") or get_secret("consolido_tabaco_usuario")
    password = get_secret("consolido_password") or get_secret("consolido_tabaco_password")
    if not usuario or not password:
        raise RuntimeError(
            "No se encontraron credenciales de Consolido en Vault/env. "
            "Esperadas: consolido_usuario + consolido_password."
        )
    return usuario, password


def _cargar_tenants_desde_supabase() -> list[dict]:
    """
    Intenta leer tenants desde tabla nueva `rpa_consolido_tenants`.
    Si falla, usa TENANTS_LEGACY para mantener compatibilidad.
    """
    try:
        from supabase import create_client

        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY")
        if not url or not key:
            logger.warning("SUPABASE_URL/SUPABASE_KEY ausentes, usando TENANTS_LEGACY")
            return TENANTS_LEGACY

        sb = create_client(url, key)
        res = (
            sb.table("rpa_consolido_tenants")
            .select("tenant_id,nombre,id_empresa,id_distribuidor,activo,orden")
            .eq("activo", True)
            .order("orden", desc=False)
            .execute()
        )
        rows = res.data or []
        if not rows:
            logger.warning("Tabla rpa_consolido_tenants vacía, usando TENANTS_LEGACY")
            return TENANTS_LEGACY

        tenants = []
        for row in rows:
            tenant_id = str(row.get("tenant_id", "")).strip()
            nombre = str(row.get("nombre", "")).strip()
            id_empresa = str(row.get("id_empresa", "")).strip()
            id_dist = row.get("id_distribuidor")
            if not (tenant_id and nombre and id_empresa and id_dist):
                continue
            tenants.append(
                {
                    "id": tenant_id,
                    "nombre": nombre,
                    "id_empresa": id_empresa,
                    "id_dist": int(id_dist),
                }
            )

        if not tenants:
            logger.warning("Filas inválidas en rpa_consolido_tenants, usando TENANTS_LEGACY")
            return TENANTS_LEGACY

        logger.info(f"Cargados {len(tenants)} tenants desde rpa_consolido_tenants")
        return tenants
    except Exception as e:
        logger.warning(f"No se pudo leer rpa_consolido_tenants: {e}. Usando TENANTS_LEGACY")
        return TENANTS_LEGACY


# ─────────────────────────────────────────────────────────────────
# PASO 1: NAVEGACIÓN Y LOGIN EN CONSOLIDO
# ─────────────────────────────────────────────────────────────────

async def _navegar_y_login(page: Page, tenant: dict, usuario: str, password: str) -> None:
    """
    Navega a Consolido y hace login.

    URL base: https://consolido.nextbyn.com
    Lee credenciales de Supabase Vault.
    """
    url_base = "https://consolido.nextbyn.com"
    logger.info(f"  Navegando a {url_base}")
    await page.goto(url_base, wait_until="networkidle", timeout=TIMEOUT_MS)

    # Esperar formulario de login
    await page.locator('input[type="text"]').first.wait_for(
        state="visible", timeout=TIMEOUT_MS
    )

    # Llenar formulario — selectores TBD (ajustar según HTML real)
    inputs = page.locator('input[type="text"]')
    await inputs.nth(0).fill(usuario)

    pwd_input = page.locator('input[type="password"]')
    await pwd_input.fill(password)

    async def _resolver_popup_actualizar() -> None:
        # Si aparece popup de actualización, tocar explícitamente "Actualizar".
        try:
            actualizar_btn = page.locator("#button-actualizar")
            for intento in range(3):
                if await actualizar_btn.count() == 0:
                    return
                if not await actualizar_btn.first.is_visible():
                    return
                logger.info(f"  Popup de actualización detectado (intento {intento + 1}/3): tocando 'Actualizar'...")
                await actualizar_btn.first.click(timeout=8_000, force=True)
                await page.wait_for_timeout(1200)
        except Exception as e:
            logger.warning(f"  No se pudo tocar botón Actualizar: {e}")

    # Ejecutar tratamiento del popup antes de loguear
    await _resolver_popup_actualizar()

    # Buscar botón de login (variaciones posibles)
    login_btn = page.locator(
        'button:has-text("Entrar"), '
        'button:has-text("Login"), '
        'button:has-text("Iniciar"), '
        'button:has-text("INICIAR SESIÓN"), '
        'button[type="submit"]'
    )
    await login_btn.first.click(force=True)

    # Algunos tenants vuelven a mostrar overlay al iniciar sesión.
    # Si reaparece, se toca "Actualizar" y se reintenta login una vez.
    await _resolver_popup_actualizar()
    if "/login" in page.url:
        await login_btn.first.click(force=True)

    # Esperar redirección al dashboard/home
    await page.wait_for_url("**/reporteador**", timeout=TIMEOUT_MS)
    logger.info(f"  ✅ Login exitoso — {tenant['nombre']}")


# ─────────────────────────────────────────────────────────────────
# PASO 2: NAVEGAR AL REPORTEADOR Y SELECCIONAR PADRÓN
# ─────────────────────────────────────────────────────────────────

async def _seleccionar_reporte_padron(page: Page) -> None:
    """
    Accede al módulo REPORTEADOR GENÉRICO y selecciona "Padrón de clientes".

    Estructura observada:
      - Tab "Informes" en la barra
      - Dropdown "Proceso" con opciones (Padrón de clientes, Ventas, etc.)
      - Seleccionar "Padrón de clientes"

    Selectores: TBD (ajustar según HTML real de Consolido)
    """
    logger.info("  Seleccionando reporte: Padrón de clientes")

    # Buscar tab "Informes" o similar
    informes_tab = page.locator(
        'button:has-text("Informes"), '
        'a:has-text("Informes"), '
        '[role="tab"]:has-text("Informes")'
    )
    try:
        await informes_tab.first.click(timeout=5_000)
        await page.wait_for_timeout(500)
    except Exception:
        logger.warning("  No se encontró tab Informes, intentando directamente...")

    # Buscar dropdown "Proceso"
    proceso_dropdown = page.locator(
        'select[name="proceso"], '
        '[role="combobox"]:has-text("Proceso"), '
        'mat-select:has-text("Proceso")'
    )
    try:
        await proceso_dropdown.first.click(timeout=TIMEOUT_MS)
        await page.wait_for_timeout(300)
    except Exception:
        logger.warning("  Dropdown Proceso no encontrado con selectores estándar")

    # Seleccionar opción "Padrón de clientes"
    padron_opcion = page.locator(
        'option:has-text("Padrón"), '
        'option:has-text("Padron"), '
        'mat-option:has-text("Padrón"), '
        '[role="option"]:has-text("Padrón")'
    )
    try:
        await padron_opcion.first.click(timeout=TIMEOUT_MS)
        await page.wait_for_timeout(500)
        logger.info("  ✅ Reporte Padrón de clientes seleccionado")
    except Exception as e:
        logger.error(f"  ❌ Error seleccionando Padrón: {e}")
        raise


# ─────────────────────────────────────────────────────────────────
# PASO 3: CONFIGURAR PARÁMETROS
# ─────────────────────────────────────────────────────────────────

async def _configurar_parametros(page: Page, tenant: dict) -> None:
    """
    Configura los parámetros del reporte:
      1. "Incluyí Anulados" = NO (selector <select>)
      2. "Empresas" = seleccionar solo IDEMPRESA del tenant (selector <select>)

    Basado en selectores CSS exactos capturados en vivo el 27/04/2026:
    - select.ng-valid (para ambos parámetros)
    - button#button-procesar (botón Ejecutar)
    """
    logger.info(f"  Configurando parámetros para {tenant['nombre']}")

    # ─────────────────────────────────────────────────────────────
    # Parámetro 1: "Incluyí Anulados" = NO
    # ─────────────────────────────────────────────────────────────
    logger.info("    - Incluyí Anulados: NO")

    # SELECT nativo HTML: primer <select>
    anulados_select = page.locator('select').first
    try:
        await anulados_select.select_option('NO')
        logger.info("      ✅ Parámetro 'Incluyí Anulados' = NO")
    except Exception as e:
        logger.warning(f"      Error configurando 'Incluyí Anulados': {e}")

    # ─────────────────────────────────────────────────────────────
    # Parámetro 2: "Empresas" = seleccionar solo este tenant
    # ─────────────────────────────────────────────────────────────
    logger.info(f"    - Empresas: ({tenant['id_empresa']}) {tenant['nombre']}")

    # SELECT nativo HTML: segundo <select>
    empresas_select = page.locator('select').nth(1)

    # El valor en el <option> incluye el IDEMPRESA entre paréntesis
    # Ej: "(3154) TABACO & HNOS S.R.L."
    opcion_empresa = f"({tenant['id_empresa']}) {tenant['nombre']}"

    try:
        await empresas_select.select_option(opcion_empresa)
        logger.info(f"      ✅ Empresa ({tenant['id_empresa']}) seleccionada")
    except Exception as e:
        logger.error(f"      ❌ Error seleccionando empresa {tenant['id_empresa']}: {e}")
        # Intentar una variante sin los paréntesis
        try:
            await empresas_select.select_option(tenant['nombre'])
            logger.info(f"      ✅ Empresa seleccionada (fallback con nombre)")
        except Exception as e2:
            logger.error(f"      ❌ Fallback también falló: {e2}")
            raise


# ─────────────────────────────────────────────────────────────────
# PASO 4: EJECUTAR REPORTE
# ─────────────────────────────────────────────────────────────────

async def _ejecutar_reporte(page: Page) -> None:
    """
    Hace clic en el botón "Ejecutar" para correr el reporte.

    Selector exacto capturado: button#button-procesar.botonProcesar
    Espera que la tabla de resultados se cargue (puede tardar 30-60s).
    """
    logger.info("  Ejecutando reporte...")

    # Botón Ejecutar — selector exacto capturado en vivo
    ejecutar_btn = page.locator('button#button-procesar')

    try:
        await ejecutar_btn.click(timeout=TIMEOUT_MS)
        logger.info("  Botón Ejecutar clickeado, esperando resultados...")
    except Exception as e:
        logger.error(f"  ❌ Error clickeando Ejecutar: {e}")
        raise

    # Esperar que la tabla de resultados esté visible (ag-grid)
    resultado_tabla = page.locator('.ag-root')

    try:
        await resultado_tabla.first.wait_for(state="visible", timeout=TIMEOUT_MS)
        logger.info("  ✅ Tabla de resultados cargada")
    except Exception as e:
        logger.warning(f"  Tabla no se cargó en el timeout esperado: {e}")
        # No es necesariamente error fatal — intentar descargar de todos modos


# ─────────────────────────────────────────────────────────────────
# PASO 5: DESCARGAR EXCEL
# ─────────────────────────────────────────────────────────────────

async def _descargar_excel(page: Page, tenant: dict) -> Optional[Path]:
    """
    Descarga el Excel del reporte Padrón clickeando el botón de exportación.

    Selector del botón: TBD (icono 📄 en barra superior derecha)
    El archivo se descarga automáticamente en DOWNLOADS_DIR.
    Nombre esperado: resultados_Reporte.PadronDeClientes-XX.xlsx
    """
    logger.info("  Buscando botón de exportación...")

    # Preparar carpeta de descargas
    DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)

    # TODO: Capturar selector exacto del botón descarga (icono 📄)
    # Opciones a probar:
    # - button[aria-label*="Descargar"], button[aria-label*="Export"]
    # - button svg[class*="download"]
    # - nth-child específico en la barra de herramientas

    # Por ahora, intentar variantes comunes:
    exportar_btn = page.locator(
        'button[aria-label*="Descargar"], '
        'button[aria-label*="Export"], '
        'button svg[class*="download"], '
        'button.btn-download'
    )

    try:
        # Interceptar descarga con expect_download()
        async with page.expect_download() as download_info:
            await exportar_btn.first.click(timeout=TIMEOUT_MS)

        download: Download = await download_info.value
        fecha = datetime.now(AR_TZ).strftime("%Y%m%d_%H%M%S")
        nuevo_nombre = f"padron_{tenant['id']}_{fecha}.xlsx"
        ruta_final = DOWNLOADS_DIR / nuevo_nombre

        await download.save_as(str(ruta_final))
        logger.info(f"  ✅ Excel descargado: {nuevo_nombre}")
        return ruta_final

    except Exception as e:
        logger.error(f"  ❌ Error descargando Excel: {e}")
        logger.warning(f"  NOTA: Selector del botón descarga requiere verificación en DevTools")
        return None


# ─────────────────────────────────────────────────────────────────
# PASO 6: FLUJO PRINCIPAL POR TENANT
# ─────────────────────────────────────────────────────────────────

async def _procesar_tenant(browser: Browser, tenant: dict, usuario: str, password: str) -> dict:
    """
    Procesa un único tenant:
      1. Abre una página nueva
      2. Login
      3. Navega al reporteador
      4. Selecciona Padrón
      5. Configura parámetros
      6. Ejecuta reporte
      7. Descarga Excel
      8. Verifica con Hash Guard
      9. Sube a API (si es nuevo)

    Devuelve dict con resultado: {ok: 0|1, error: str|None, archivo: Path|None}
    """
    resumen = {"ok": 0, "errores": 0, "sin_cambios": 0}

    try:
        logger.info(f"\n  ┌─ Procesando tenant: {tenant['nombre']}")

        # Crear contexto de navegador
        context = await browser.new_context()
        page = await context.new_page()

        # PASO 1: Login
        try:
            await _navegar_y_login(page, tenant, usuario, password)
        except Exception as e:
            logger.error(f"  Error en login: {e}")
            await _screenshot_error(page, tenant["id"], "login")
            resumen["errores"] += 1
            await context.close()
            return resumen

        # PASO 2: Seleccionar reporte Padrón
        try:
            await _seleccionar_reporte_padron(page)
        except Exception as e:
            logger.error(f"  Error seleccionando Padrón: {e}")
            await _screenshot_error(page, tenant["id"], "seleccionar_padron")
            resumen["errores"] += 1
            await context.close()
            return resumen

        # PASO 3: Configurar parámetros
        try:
            await _configurar_parametros(page, tenant)
        except Exception as e:
            logger.error(f"  Error configurando parámetros: {e}")
            await _screenshot_error(page, tenant["id"], "parametros")
            resumen["errores"] += 1
            await context.close()
            return resumen

        # PASO 4: Ejecutar
        try:
            await _ejecutar_reporte(page)
        except Exception as e:
            logger.error(f"  Error ejecutando reporte: {e}")
            await _screenshot_error(page, tenant["id"], "ejecutar")
            resumen["errores"] += 1
            await context.close()
            return resumen

        # PASO 5: Descargar
        try:
            archivo = await _descargar_excel(page, tenant)
            if not archivo:
                resumen["errores"] += 1
                await context.close()
                return resumen
        except Exception as e:
            logger.error(f"  Error descargando: {e}")
            await _screenshot_error(page, tenant["id"], "descargar")
            resumen["errores"] += 1
            await context.close()
            return resumen

        await context.close()

        # PASO 6: Hash Guard (deduplicación)
        logger.info(f"  Verificando con Hash Guard...")
        hash_key = f"padron_{tenant['id']}"

        if es_duplicado(hash_key, str(archivo)):
            logger.info(f"  ⏭️  Archivo idéntico al anterior — sin cambios")
            resumen["sin_cambios"] += 1
            return resumen

        # PASO 7: Subir a API
        logger.info(f"  Subiendo a API...")
        try:
            await subir_padron(archivo, tenant["id_dist"])
            guardar_hash(hash_key, str(archivo))
            logger.info(f"  ✅ Padrón procesado exitosamente")
            resumen["ok"] += 1
        except Exception as e:
            logger.error(f"  Error subiendo a API: {e}")
            resumen["errores"] += 1

        logger.info(f"  └─ Tenant {tenant['nombre']} finalizado\n")
        return resumen

    except Exception as e:
        logger.error(f"  ❌ Error inesperado en tenant {tenant['id']}: {e}")
        resumen["errores"] += 1
        return resumen


# ─────────────────────────────────────────────────────────────────
# PUNTO DE ENTRADA: run()
# ─────────────────────────────────────────────────────────────────

async def run() -> dict:
    """
    Punto de entrada del Motor Padrón.

    Itera sobre todos los tenants y devuelve un resumen consolidado.
    """
    resumen_total = {"ok": 0, "errores": 0, "sin_cambios": 0}
    tenants = _cargar_tenants_desde_supabase()
    usuario, password = _resolver_credenciales_consolido()

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=HEADLESS)

        for tenant in tenants:
            try:
                # Credenciales únicas de Consolido para todos los tenants.
                resumen_tenant = await _procesar_tenant(browser, tenant, usuario, password)
                resumen_total["ok"] += resumen_tenant.get("ok", 0)
                resumen_total["errores"] += resumen_tenant.get("errores", 0)
                resumen_total["sin_cambios"] += resumen_tenant.get("sin_cambios", 0)
            except Exception as e:
                logger.error(f"  Error procesando tenant {tenant['id']}: {e}")
                resumen_total["errores"] += 1

            # Esperar entre tenants para no sobrecargar
            await asyncio.sleep(5)

        await browser.close()

    return resumen_total
