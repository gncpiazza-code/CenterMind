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
     f. Configura parámetros: "Incluyí Anulados" = SI (env PADRON_INCLUIR_ANULADOS=false para NO), "Empresas" = tenant actual
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
     - "Incluyí Anulados": mat-select → **SI** (el backend marca `motivo_inactivo=padron_anulado` y el mapa los oculta)
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
TENANT_RETRY_MAX = int(os.environ.get("PADRON_TENANT_RETRY_MAX", "2"))
TENANT_RETRY_BACKOFF_SEC = int(os.environ.get("PADRON_TENANT_RETRY_BACKOFF_SEC", "8"))
# Export con filas anuladas para que ingesta etiquete padron_anulado (evita PDVs fantasmas en el mapa).
PADRON_INCLUIR_ANULADOS = os.environ.get("PADRON_INCLUIR_ANULADOS", "true").lower() not in (
    "false",
    "0",
    "no",
)

# Timeout general (ms)
TIMEOUT_MS = 120_000  # Consolido puede ser lento (aumentado a 2 min porque reportes grandes tardan >1 min)
ADMIN_PROCESOS_URL = "https://consolido.nextbyn.com/#/parametrizaciones/reportes/administrador-de-procesos"

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

        url = os.environ.get("SUPABASE_URL") or os.environ.get("supabase_url")
        key = (
            os.environ.get("SUPABASE_SERVICE_KEY")
            or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
            or os.environ.get("SUPABASE_KEY")
            or os.environ.get("supabase_key")
        )
        if not url or not key:
            logger.warning(
                "SUPABASE_URL o service key ausentes "
                "(SUPABASE_SERVICE_KEY/SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY), "
                "usando TENANTS_LEGACY"
            )
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


def _filtrar_tenants_para_debug(tenants: list[dict]) -> list[dict]:
    """
    Permite ejecutar sólo un tenant para debug rápido:
      PADRON_DEBUG_TENANT=tabaco python runner.py padron
    """
    target = (os.environ.get("PADRON_DEBUG_TENANT") or "").strip().lower()
    if not target:
        return tenants
    filtered = [t for t in tenants if str(t.get("id", "")).strip().lower() == target]
    if filtered:
        logger.warning(f"⚙️ PADRON_DEBUG_TENANT activo: ejecutando sólo tenant '{target}'")
        return filtered
    logger.warning(f"PADRON_DEBUG_TENANT='{target}' no coincide con tenants disponibles; se ejecutan todos.")
    return tenants


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
    await page.locator('input[type="text"]').first.wait_for(state="visible", timeout=TIMEOUT_MS)

    user_input = page.locator('input[type="text"]').nth(0)
    pwd_input = page.locator('input[type="password"]').first

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

    async def _intento_login(num_intento: int) -> bool:
        await user_input.fill("")
        await user_input.fill(usuario)
        await pwd_input.fill("")
        await pwd_input.fill(password)
        await _resolver_popup_actualizar()
        await login_btn.first.click(force=True)
        await page.wait_for_timeout(1200)
        await _resolver_popup_actualizar()
        try:
            # Éxito si salió de /login (ej: /dashboard), aunque todavía no haya /reporteador.
            await page.wait_for_function(
                "() => !window.location.href.includes('/login')",
                timeout=45_000,
            )
            await page.wait_for_load_state("networkidle", timeout=20_000)
            logger.info(f"  Login intento {num_intento} OK. URL actual: {page.url}")
            return True
        except Exception:
            logger.warning(f"  Login intento {num_intento} no salió de /login. URL actual: {page.url}")
            return False

    ok_login = await _intento_login(1)
    # Si la URL ya es dashboard/reporteador, considerar login exitoso sin reintento.
    if not ok_login and ("/dashboard" in page.url or "/reporteador" in page.url):
        ok_login = True
        logger.info(f"  Login confirmado por URL final: {page.url}")

    if not ok_login:
        ok_login = await _intento_login(2)
    if not ok_login:
        raise RuntimeError(f"No se pudo completar login. URL final: {page.url}")

    # No esperar redirección específica — forzar navegación si es necesario
    await page.wait_for_timeout(1500)  # Espera mínima para que la página se estabilice
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

    async def _esperar_ui_reporteador(timeout_ms: int = 12_000) -> bool:
        try:
            await page.locator(
                'button#button-procesar, [role="combobox"], select'
            ).first.wait_for(state="visible", timeout=timeout_ms)
            return True
        except Exception:
            return False

    # Si quedó en dashboard/login tras login, forzar navegación client-side más rápida.
    if "/dashboard" in page.url or "/login" in page.url:
        logger.info("  Navegando directo a administrador de procesos ...")
        try:
            # En SPA de Consolido, cambiar hash es más rápido que page.goto().
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
            # Fallback si el hash-change no alcanza.
            await page.goto(ADMIN_PROCESOS_URL, wait_until="domcontentloaded", timeout=20_000)
        await page.wait_for_timeout(700)

    # Espera rápida de UI real del reporteador.
    if not await _esperar_ui_reporteador(8_000):
        logger.warning("  ⚠️ UI de Reporteador no lista en fast-path; reintentando carga controlada...")
        await page.goto(ADMIN_PROCESOS_URL, wait_until="domcontentloaded", timeout=20_000)
        await page.wait_for_timeout(1800)
        if not await _esperar_ui_reporteador(15_000):
            raise RuntimeError(
                f"No cargó administrador de procesos. URL actual: {page.url}. "
                "No se encontró button#button-procesar / combobox / select."
            )

    # Esperar a que la página esté lista (cualquier elemento visible indica carga)
    # Estrategia: esperar al heading "REPORTEADOR GENÉRICO" o al botón Ejecutar o cualquier elemento
    try:
        await page.locator("text=/REPORTEADOR|Proceso|Parámetros/i").first.wait_for(state="visible", timeout=8_000)
        logger.info("  ✅ Página de Reporteador cargada")
    except Exception as e:
        logger.warning(f"  ⚠️ Timeout esperando elementos, continuando: {e}")
        # Continuar de todas formas — la página probablemente está lista aunque los selectores específicos no aparezcan

    # Intentar seleccionar proceso "Padrón de clientes" usando JavaScript
    # No insistir en esperar selectores específicos
    selected = await page.evaluate(
        """
        () => {
          const selects = Array.from(document.querySelectorAll('select'));
          const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');

          for (const s of selects) {
            const opts = Array.from(s.options || []);
            const target = opts.find(o => norm(o.textContent).includes('padron'));
            if (target) {
              s.value = target.value;
              s.dispatchEvent(new Event('input', { bubbles: true }));
              s.dispatchEvent(new Event('change', { bubbles: true }));
              return { ok: true, selected: target.textContent?.trim() || target.value };
            }
          }
          return { ok: false };
        }
        """
    )

    if selected and selected.get("ok"):
        logger.info(f"  ✅ Reporte Padrón seleccionado: {selected.get('selected')}")
    else:
        logger.warning("  ⚠️ No se encontró select de proceso con opción Padrón; se continúa con valor actual.")


# ─────────────────────────────────────────────────────────────────
# PASO 3: CONFIGURAR PARÁMETROS
# ─────────────────────────────────────────────────────────────────

async def _configurar_parametros(page: Page, tenant: dict) -> None:
    """
    Configura los parámetros del reporte:
      1. "Incluyí Anulados" = SI por defecto (mat-select Angular Material)
      2. "Empresas" = seleccionar solo IDEMPRESA del tenant (mat-select Angular Material)

    Ambos son dropdowns Angular Material con [role="option"].
    """
    logger.info(f"  Configurando parámetros para {tenant['nombre']}")

    # ─────────────────────────────────────────────────────────────────
    # PASO 0: SELECCIONAR "INCLUIR ANULADOS" (SI = default; rollback env PADRON_INCLUIR_ANULADOS)
    # ─────────────────────────────────────────────────────────────────
    want_si = PADRON_INCLUIR_ANULADOS
    logger.info(f"    - Incluí Anulados: {'SI' if want_si else 'NO'}")

    try:
        # Abrir el dropdown de "Incluir Anulados"
        incluir_anulados_combobox = page.locator('[role="combobox"]').first
        await incluir_anulados_combobox.click(timeout=5000)
        await page.wait_for_timeout(1000)
        logger.info("      ✅ Dropdown de Incluir Anulados abierto")

        # Buscar y clickear SI o NO según configuración
        options = page.locator('[role="option"]')
        count = await options.count()
        logger.info(f"      📊 Opciones encontradas: {count}")

        def _matches_anulados_choice(text_upper: str) -> bool:
            if want_si:
                return text_upper in ("SI", "SÍ", "YES", "TRUE", "S", "1")
            return text_upper == "NO"

        for i in range(count):
            option = options.nth(i)
            try:
                option_text = await option.text_content()
                option_text = (option_text.strip() if option_text else "").upper()
                logger.info(f"      [{i}] {option_text}")

                if _matches_anulados_choice(option_text):
                    logger.info(f"      ✨ Opción {'SI' if want_si else 'NO'} encontrada")
                    await option.click(timeout=5000, force=True)
                    await page.wait_for_timeout(500)
                    logger.info(f"      ✅ Opción seleccionada")
                    break
            except Exception as e:
                logger.warning(f"      [{i}] Error: {e}")
                continue

        # Cerrar el overlay presionando Escape
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(500)
        logger.info("      ✅ Overlay cerrado")

    except Exception as e:
        logger.warning(f"      ⚠️ Error en Incluir Anulados: {type(e).__name__}: {str(e)[:100]}")
        # Continuar de todas formas

    logger.info(f"    - Empresa objetivo: ({tenant['id_empresa']}) {tenant['nombre']}")

    # PASO 1: Abrir el dropdown de Empresas (combobox Angular Material)
    try:
        # Hacer clic en el combobox de Empresas para abrirlo
        empresas_combobox = page.locator('[role="combobox"]')
        await empresas_combobox.last.click(timeout=5000)
        await page.wait_for_timeout(1000)
        logger.info("      ✅ Dropdown de Empresas abierto")
    except Exception as e:
        logger.warning(f"      Error abriendo dropdown de Empresas: {e}")

    # PASO 2: Seleccionar la empresa correcta
    # IMPORTANTE: Los items del dropdown son <option role="option">, NO <input type="checkbox">
    try:
        id_empresa_str = str(tenant["id_empresa"])
        logger.info(f"      🔍 Buscando opción para empresa: ({id_empresa_str})")

        # Los items del dropdown son [role="option"]
        options = page.locator('[role="option"]')
        count = await options.count()
        logger.info(f"      📊 Total de opciones encontradas: {count}")

        empresa_encontrada = False
        for i in range(count):
            option = options.nth(i)
            try:
                # Obtener el texto de la opción
                option_text = await option.text_content()
                option_text = option_text.strip() if option_text else ""

                # Verificar si está seleccionada (tiene aria-selected="true")
                is_selected = await option.get_attribute("aria-selected")
                is_selected = is_selected == "true" if is_selected else False

                logger.info(f"      [{i}] {option_text} [selected={is_selected}]")

                # Buscar la opción que contiene el ID de empresa
                if f"({id_empresa_str})" in option_text:
                    logger.info(f"      ✨ ¡Opción encontrada! ({id_empresa_str})")
                    empresa_encontrada = True

                    # Si no está seleccionada, clickearla
                    if not is_selected:
                        logger.info(f"      🔲 Clickeando opción para {id_empresa_str}...")
                        await option.click(timeout=5000, force=True)
                        await page.wait_for_timeout(500)

                        # Verificar que se seleccionó correctamente
                        is_selected_after = await option.get_attribute("aria-selected")
                        is_selected_after = is_selected_after == "true" if is_selected_after else False
                        logger.info(f"      ✅ Post-click: aria-selected = {is_selected_after}")

                        if is_selected_after:
                            logger.info(f"      ✅ Empresa {id_empresa_str} seleccionada correctamente")
                        else:
                            logger.error(f"      ❌ Opción no se seleccionó después del click")
                    else:
                        logger.info(f"      ✅ Empresa {id_empresa_str} ya estaba seleccionada")
                    break
            except Exception as e:
                logger.warning(f"      [{i}] Error procesando opción: {type(e).__name__}: {e}")
                continue

        if not empresa_encontrada:
            logger.error(f"      ❌ Empresa ({id_empresa_str}) NO ENCONTRADA en las opciones disponibles")

        await page.wait_for_timeout(500)

    except Exception as e:
        logger.warning(f"      Error seleccionando empresa: {type(e).__name__}: {e}")

    # PASO 3: CRÍTICO — Cerrar el overlay del combobox
    # El overlay Angular bloquea clicks posteriores si queda abierto
    try:
        logger.info("      Cerrando overlay del combobox...")
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(500)
        logger.info("      ✅ Overlay cerrado")
    except Exception as e:
        logger.warning(f"      Error cerrando overlay: {e}")


# ─────────────────────────────────────────────────────────────────
# PASO 4: EJECUTAR REPORTE
# ─────────────────────────────────────────────────────────────────

async def _ejecutar_reporte(page: Page) -> None:
    """
    Hace clic en el botón "Ejecutar" para correr el reporte.

    Selector exacto capturado: button#button-procesar.botonProcesar
    Espera que la tabla de resultados se cargue (puede tardar >1 min en reportes grandes).
    """
    logger.info("  Ejecutando reporte...")

    # Botón Ejecutar — selector exacto capturado en vivo
    ejecutar_btn = page.locator('button#button-procesar')

    # ESTRATEGIA: Clickear Ejecutar y esperar a que aparezcan los resultados
    try:
        logger.info("  🔲 Clickeando botón Ejecutar...")
        await ejecutar_btn.click(timeout=10_000)
        logger.info("  ✅ Botón clickeado. Esperando procesamiento del servidor (max 120s)...")
    except Exception as e:
        logger.error(f"  ❌ Error clickeando Ejecutar: {type(e).__name__}: {e}")
        raise

    # ESTRATEGIA: Esperar con polling — cada 5s verificar estado
    logger.info("  ⏳ Iniciando polling cada 5 segundos...")
    max_tiempo = 120
    tiempo_inicial = datetime.now(AR_TZ)
    tiempo_transcurrido = 0

    while tiempo_transcurrido < max_tiempo:
        await page.wait_for_timeout(5000)
        tiempo_transcurrido = int((datetime.now(AR_TZ) - tiempo_inicial).total_seconds())

        try:
            # Verificar si la tabla existe (sea visible o no)
            ag_root_count = await page.locator('.ag-root').count()
            logger.info(f"    [{tiempo_transcurrido}s] .ag-root encontrado: {ag_root_count > 0}")

            # Verificar si hay heading "Resultados (XXXX):"
            try:
                # Buscar texto que contenga "Resultados" seguido de paréntesis con número
                resultados_heading = await page.locator("text=/Resultados\\s*\\(\\d+\\)/i").first.text_content(timeout=2000)
                if resultados_heading:
                    logger.info(f"    [{tiempo_transcurrido}s] ✅ {resultados_heading.strip()}")
                    await page.wait_for_timeout(3000)  # Esperar extra a que se renderice completamente
                    logger.info(f"  ✅ Reporte completado exitosamente")
                    return
            except Exception:
                pass  # Heading no encontrado aún

            # Verificar si hay mensaje de éxito visible
            try:
                success_msg = await page.locator("text=/ejecutado con éxito|success|completado/i").first.text_content(timeout=2000)
                if success_msg:
                    logger.info(f"    [{tiempo_transcurrido}s] ✅ Mensaje de éxito: {success_msg.strip()[:80]}")
                    await page.wait_for_timeout(3000)  # Esperar a que se renderize la tabla
                    logger.info(f"  ✅ Reporte completado (por mensaje de éxito)")
                    return
            except Exception:
                pass  # Sin mensaje de éxito aún

        except Exception as e:
            logger.warning(f"    [{tiempo_transcurrido}s] Error en polling: {type(e).__name__}")
            pass

    logger.warning(f"  ⚠️ Timeout de 120s alcanzado sin detectar resultados.")
    logger.info(f"  Continuando de todas formas para intentar exportar...")
    # El reporte puede haberse ejecutado igual, intentaremos descargar


# ─────────────────────────────────────────────────────────────────
# PASO 5: DESCARGAR EXCEL
# ─────────────────────────────────────────────────────────────────

async def _descargar_excel(page: Page, tenant: dict) -> Optional[Path]:
    """
    Descarga el Excel del reporte Padrón clickeando el botón de exportación.

    ESTRATEGIA VERIFICADA EN VIVO (28/04/2026):
    El botón está en la barra de herramientas como el SEGUNDO de 3 botones pequeños,
    junto al campo "Buscar". Lo buscamos en esa región específica, no globalmente.
    """
    logger.info("  🔍 Buscando botón de exportación en barra de herramientas...")

    # Preparar carpeta de descargas
    DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)

    # PASO 0: Cerrar cualquier diálogo modal que esté bloqueando
    logger.info("  Paso 0: Cerrando diálogos modales si hay...")
    try:
        continuar_btn = page.locator("#button-continuar-superior, #button-continuar-inferior").first
        count = await continuar_btn.count()
        if count > 0:
            logger.info("    ⚠️ Diálogo modal detectado, cerrando...")
            await continuar_btn.click(timeout=3000, force=True)
            await page.wait_for_timeout(1000)
            logger.info("    ✅ Diálogo cerrado")
    except Exception as e:
        logger.info(f"    No hay diálogo: {type(e).__name__}")

    # PASO 1: Buscar los 3 botones de la BARRA DE HERRAMIENTAS (después del Buscar)
    # Estrategia: Buscar específicamente en la región de la barra, no en toda la página
    exportar_btn = None

    try:
        logger.info("  Paso 1: Buscando región de herramientas...")

        # Estrategia A (prioritaria): botón con ícono Excel (el correcto según evidencia en vivo).
        excel_icon_btn = page.locator("button:has(i.fa-file-excel), button:has(i.fas.fa-file-excel)").first
        if await excel_icon_btn.count() > 0:
            try:
                await excel_icon_btn.wait_for(state="visible", timeout=8_000)
                logger.info("  ✅ Botón localizado por ícono Excel (fa-file-excel)")
                exportar_btn = excel_icon_btn
            except Exception as e:
                logger.warning(f"  ⚠️ Encontrado por ícono pero no visible aún: {type(e).__name__}")

        # ESTRATEGIA: Usar JavaScript para encontrar el botón de exportar específicamente.
        # Regla pedida: segundo botón de la barra de resultados (no autoajustar columnas).
        export_via_js = await page.evaluate(
            """
            () => {
              const isVisible = (el) => {
                if (!el) return false;
                const st = window.getComputedStyle(el);
                if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
                const r = el.getBoundingClientRect();
                return r.width > 0 && r.height > 0;
              };

              // Buscar elemento con tooltip "Exportar resultados"
              const allBtns = Array.from(document.querySelectorAll('button'));

              // Estrategia 0: icono excel explícito.
              let btn = allBtns.find(b => b.querySelector('i.fa-file-excel, i.fas.fa-file-excel') && isVisible(b));
              if (btn) {
                return { found: true, method: 'excel-icon', idx: allBtns.indexOf(btn) };
              }

              // Estrategia 1: Buscar por title o aria-label que contenga "Exportar"
              btn = allBtns.find(b => {
                const title = b.getAttribute('title') || '';
                const aria = b.getAttribute('aria-label') || '';
                return (title.includes('Exportar') || aria.includes('Exportar')) && isVisible(b);
              });

              if (btn) {
                return { found: true, method: 'title/aria-label', idx: allBtns.indexOf(btn) };
              }

              // Estrategia 2: Buscar toolbar cercana al input "Buscar" y tomar el 2do botón visible.
              const searchInput = document.querySelector('input[placeholder*="Buscar"]');
              if (searchInput) {
                const candidates = [
                  searchInput.closest('.box-botones-grilla'),
                  searchInput.closest('mat-toolbar'),
                  searchInput.closest('[class*="toolbar"]'),
                  searchInput.parentElement,
                ].filter(Boolean);

                for (const parent of candidates) {
                  const toolbarBtns = Array.from(parent.querySelectorAll('button')).filter(isVisible);
                  if (toolbarBtns.length >= 2) {
                    const secondBtn = toolbarBtns[1];
                    const txt = (secondBtn.textContent || '').trim();
                    const title = secondBtn.getAttribute('title') || '';
                    const aria = secondBtn.getAttribute('aria-label') || '';
                    // Evitar autoajuste explícitamente si lo detectamos.
                    const marker = `${txt} ${title} ${aria}`.toLowerCase();
                    if (!marker.includes('autoaj') && !marker.includes('configurar columnas')) {
                      return {
                        found: true,
                        method: 'toolbar-second-button',
                        idx: allBtns.indexOf(secondBtn),
                      };
                    }
                  }
                }
              }

              return { found: false, method: 'none' };
            }
            """
        )

        logger.info(f"    JS búsqueda: {export_via_js}")

        if exportar_btn is None and export_via_js and export_via_js.get("found"):
            logger.info(f"  ✅ Botón encontrado por: {export_via_js['method']}")
            idx = export_via_js.get("idx", -1)

            try:
                all_buttons = page.locator("button")
                export_candidate = all_buttons.nth(idx)
                title = await export_candidate.get_attribute("title")
                aria_label = await export_candidate.get_attribute("aria-label")
                logger.info(f"    Button [{idx}]: title='{title}', aria-label='{aria_label}'")

                await export_candidate.wait_for(state="visible", timeout=3000)
                logger.info("    ✅ Botón encontrado y visible")
                exportar_btn = export_candidate
            except Exception as e:
                logger.warning(f"    ⚠️ Intento por índice falló: {e}")

        if exportar_btn is None:
            logger.error("  ❌ No se pudo encontrar el botón de exportación")
            return None

        logger.info("  ✅ Botón de exportación localizado")

    except Exception as e:
        logger.error(f"  ❌ Error buscando botón: {type(e).__name__}: {str(e)[:150]}")
        return None

    # PASO 2: Interceptar descarga y clickear botón
    logger.info("  Clickeando botón e interceptando descarga...")
    try:
        # Interceptar descarga con expect_download()
        async with page.expect_download() as download_info:
            logger.info("    🔲 Clickeando botón de exportación...")
            await exportar_btn.click(timeout=5_000, force=True)
            logger.info("    ✅ Botón clickeado, esperando descarga...")

        logger.info("    ⏳ Esperando a que se complete la descarga...")
        download: Download = await download_info.value
        fecha = datetime.now(AR_TZ).strftime("%Y%m%d_%H%M%S")
        nuevo_nombre = f"padron_{tenant['id']}_{fecha}.xlsx"
        ruta_final = DOWNLOADS_DIR / nuevo_nombre

        logger.info(f"    💾 Guardando archivo como: {nuevo_nombre}")
        await download.save_as(str(ruta_final))
        logger.info(f"  ✅ Excel descargado exitosamente: {nuevo_nombre}")
        return ruta_final

    except Exception as e:
        logger.error(f"  ❌ Error en descarga: {type(e).__name__}: {str(e)[:150]}")
        import traceback
        logger.error(f"    Traceback: {traceback.format_exc()[:200]}")
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
        context = await browser.new_context(accept_downloads=True)
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
            subido_ok = await subir_padron(archivo, tenant["id_dist"])
            if not subido_ok:
                raise RuntimeError("Upload padrón rechazado por API")
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
    tenants = _filtrar_tenants_para_debug(tenants)
    usuario, password = _resolver_credenciales_consolido()

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=HEADLESS)

        for tenant in tenants:
            try:
                # Reintento por tenant fallido: no repite tenants que ya salieron OK/sin cambios.
                resumen_tenant = {"ok": 0, "errores": 1, "sin_cambios": 0}
                for intento in range(1, TENANT_RETRY_MAX + 2):
                    if intento > 1:
                        logger.warning(
                            f"🔁 Reintentando tenant {tenant['id']} "
                            f"({intento - 1}/{TENANT_RETRY_MAX})..."
                        )
                    # Credenciales únicas de Consolido para todos los tenants.
                    resumen_tenant = await _procesar_tenant(browser, tenant, usuario, password)

                    tenant_ok = resumen_tenant.get("ok", 0) > 0
                    tenant_sin_cambios = resumen_tenant.get("sin_cambios", 0) > 0
                    if tenant_ok or tenant_sin_cambios:
                        break

                    if intento < (TENANT_RETRY_MAX + 1):
                        await asyncio.sleep(TENANT_RETRY_BACKOFF_SEC)

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
