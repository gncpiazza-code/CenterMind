# -*- coding: utf-8 -*-
"""
motores/padron.py
=================
Motor 1: Padrón de Clientes — Consolido/Nextbyn Reporteador Genérico

¿Qué hace este archivo?
-----------------------
Programación vía `scheduler.py`: un job APScheduler **por tenant** (escalonado) + catch-up.
Chicos primero (beltrocco, …), tabaco/aloma al final; lock exclusivo Consolido.

  1. Para cada tenant activo en `rpa_consolido_tenants` (tabaco, aloma, liver, real, extra, …):
     a. Abre un navegador invisible
     b. Navega a consolido.nextbyn.com
     c. Login con UN usuario/password Consolido (Vault: consolido_usuario/password)
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
  - extra     : GYG DISTRIBUCIÓN (misma credencial Consolido; empresa en checkbox)

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
from lib.api_client import subir_padron, registrar_padron_sin_cambios, notificar_error_motor
from lib.padron_schedule import (
    DEFAULT_MAX_AGE_HOURS,
    list_stale_tenant_ids,
    ordenar_tenants_para_corrida,
    padron_consolido_lock,
)
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
COMBO_TIMEOUT_MS = int(os.environ.get("RPA_COMBO_TIMEOUT_MS", "15000"))
ADMIN_PROCESOS_URL = "https://consolido.nextbyn.com/#/parametrizaciones/reportes/administrador-de-procesos"

# ─────────────────────────────────────────────────────────────────
# DEFINICIÓN DE TENANTS (LEGACY / FALLBACK)
# Consolido usa IDEMPRESA numéricos verificados en vivo.
# Fuente nueva recomendada: tabla Supabase `rpa_consolido_tenants`.
# ─────────────────────────────────────────────────────────────────

def _tenants_legacy_fallback() -> list[dict]:
    """Fallback si Supabase no responde — mantener alineado con core/rpa_tenant_registry.py."""
    try:
        import sys
        from pathlib import Path

        cm_root = Path(__file__).resolve().parents[2] / "CenterMind"
        if str(cm_root) not in sys.path:
            sys.path.insert(0, str(cm_root))
        from core.rpa_tenant_registry import consolido_tenants_legacy_format

        return consolido_tenants_legacy_format()
    except Exception:
        pass
    return [
        {"id": "tabaco", "nombre": "Tabaco & Hnos S.R.L.", "id_empresa": "3154", "id_dist": 3},
        {"id": "real", "nombre": "Real Tabacalera de Santiago S.A.", "id_empresa": "5597", "id_dist": 2},
        {"id": "aloma", "nombre": "Aloma Distribuidores Oficiales", "id_empresa": "3442", "id_dist": 4},
        {"id": "liver", "nombre": "Liver SRL", "id_empresa": "3534", "id_dist": 5},
        {"id": "extra", "nombre": "GyG (Gomez Marcos Ariel)", "id_empresa": "3562", "id_dist": 6},
        {"id": "beltrocco", "nombre": "SILVINA RIBERO", "id_empresa": "3559", "id_dist": 11},
        {"id": "hugo_cena", "nombre": "CENA HUGO MARIO", "id_empresa": "3561", "id_dist": 12},
    ]


TENANTS_LEGACY = _tenants_legacy_fallback()


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
    Navega a Consolido y hace login (mismas credenciales para todos los tenants).

    La empresa/distribuidora se elige después en el checkbox «Empresas» del reporteador
    (igual que en Informe de Ventas). `tenant` solo se usa para logging/screenshots.
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
# UI Angular Material (Consolido Reporteador)
# ─────────────────────────────────────────────────────────────────


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


async def _esperar_comboboxes_parametros(page: Page, min_count: int = 1) -> None:
    """Espera a que Angular renderice los mat-select del panel de parámetros."""
    await _cerrar_overlays(page)
    await page.wait_for_function(
        f"() => document.querySelectorAll('[role=\"combobox\"]').length >= {min_count}",
        timeout=COMBO_TIMEOUT_MS,
    )
    await page.wait_for_timeout(600)


async def _set_incluir_anulados(page: Page) -> None:
    want_si = PADRON_INCLUIR_ANULADOS
    logger.info(f"    - Incluí Anulados: {'SI' if want_si else 'NO'}")
    await _cerrar_overlays(page)
    comboboxes = page.locator('[role="combobox"]')
    if await comboboxes.count() < 1:
        raise RuntimeError("No hay combobox para Incluir Anulados (panel de parámetros vacío)")
    await comboboxes.first.click(timeout=COMBO_TIMEOUT_MS)
    await page.wait_for_timeout(800)

    options = page.locator('[role="option"]')
    count = await options.count()
    logger.info(f"      📊 Opciones Incluir Anulados: {count}")

    def _matches(text_upper: str) -> bool:
        if want_si:
            return text_upper in ("SI", "SÍ", "YES", "TRUE", "S", "1")
        return text_upper == "NO"

    for i in range(count):
        option = options.nth(i)
        option_text = (await option.text_content() or "").strip().upper()
        if _matches(option_text):
            await option.click(timeout=COMBO_TIMEOUT_MS, force=True)
            await page.wait_for_timeout(400)
            logger.info(f"      ✅ Incluir Anulados = {option_text}")
            await _cerrar_overlays(page)
            return
    await _cerrar_overlays(page)
    raise RuntimeError("No se encontró opción SI/NO para Incluir Anulados")


async def seleccionar_proceso_reporteador(
    page: Page,
    *,
    must_include: tuple[str, ...],
    must_exclude: tuple[str, ...] = (),
    descripcion: str = "proceso",
) -> str:
    """
    Elige un proceso en el select idproceso sin regex (Playwright en Railway no acepta re.Pattern).
    """
    def _norm(s: str) -> str:
        return (s or "").lower()

    def _matches(text: str) -> bool:
        n = _norm(text)
        return all(k in n for k in must_include) and not any(e in n for e in must_exclude)

    proc_sel = page.locator('select[formcontrolname="idproceso"]').first
    await proc_sel.wait_for(state="visible", timeout=COMBO_TIMEOUT_MS)
    await page.wait_for_function(
        """
        () => {
          const s = document.querySelector('select[formcontrolname="idproceso"]');
          return s && s.options && s.options.length > 1;
        }
        """,
        timeout=COMBO_TIMEOUT_MS,
    )

    async def _pick_from_options(include: tuple[str, ...], exclude: tuple[str, ...]) -> str | None:
        def _m(text: str) -> bool:
            n = _norm(text)
            return all(k in n for k in include) and not any(e in n for e in exclude)

        opts = proc_sel.locator("option")
        n = await opts.count()
        available: list[str] = []
        for i in range(n):
            text = (await opts.nth(i).text_content() or "").strip()
            if text:
                available.append(text)
            if not text or not _m(text):
                continue
            val = await opts.nth(i).get_attribute("value")
            if val:
                await proc_sel.select_option(value=val)
            else:
                await opts.nth(i).click()
            logger.info(f"  ✅ {descripcion} seleccionado (option): {text}")
            return text
        logger.warning(
            f"  Opciones idproceso ({n}): {available[:20]}"
        )
        return None

    picked = await _pick_from_options(must_include, must_exclude)
    if picked:
        return picked

    # Fallback: p.ej. "Informe de Ventas" si el label varía en Consolido
    if must_include != ("ventas",):
        logger.warning(f"  Reintentando {descripcion} con matcher amplio (ventas)...")
        picked = await _pick_from_options(
            ("ventas",),
            must_exclude + ("padron", "cliente", "cuenta", "corriente", "padr"),
        )
        if picked:
            return picked

    selected = await page.evaluate(
        f"""
        () => {{
          const mustInc = {list(must_include)!r}.map(s => s.toLowerCase());
          const mustExc = {list(must_exclude)!r}.map(s => s.toLowerCase());
          const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
          const match = (t) => mustInc.every(k => t.includes(k)) && !mustExc.some(e => t.includes(e));
          for (const s of document.querySelectorAll('select')) {{
            for (const o of Array.from(s.options || [])) {{
              const t = norm(o.textContent);
              if (!match(t)) continue;
              s.value = o.value;
              s.dispatchEvent(new Event('input', {{ bubbles: true }}));
              s.dispatchEvent(new Event('change', {{ bubbles: true }}));
              return {{ ok: true, selected: (o.textContent || '').trim() || o.value }};
            }}
          }}
          return {{ ok: false }};
        }}
        """
    )
    if not (selected and selected.get("ok")):
        opts_txt = await proc_sel.evaluate(
            "el => Array.from(el.options || []).map(o => (o.textContent || '').trim()).filter(Boolean)"
        )
        raise RuntimeError(
            f"No se pudo seleccionar {descripcion} en Reporteador. "
            f"Opciones visibles: {opts_txt[:25]}"
        )
    label = selected.get("selected") or descripcion
    logger.info(f"  ✅ {descripcion} seleccionado (JS): {label}")
    return label


async def _set_empresa_padron(page: Page, tenant: dict) -> None:
    id_emp = str(tenant["id_empresa"])
    logger.info(f"    - Empresa objetivo: ({id_emp}) {tenant['nombre']}")
    await _cerrar_overlays(page)

    comboboxes = page.locator('[role="combobox"]')
    n = await comboboxes.count()
    if n < 1:
        raise RuntimeError("No hay combobox para Empresas")
    target = comboboxes.last if n > 1 else comboboxes.first
    await target.click(timeout=COMBO_TIMEOUT_MS)
    await page.wait_for_timeout(800)
    logger.info("      ✅ Dropdown de Empresas abierto")

    options = page.locator('[role="option"]')
    count = await options.count()
    logger.info(f"      📊 Total de opciones encontradas: {count}")

    for i in range(count):
        option = options.nth(i)
        option_text = (await option.text_content() or "").strip()
        is_selected = (await option.get_attribute("aria-selected")) == "true"
        logger.info(f"      [{i}] {option_text} [selected={is_selected}]")
        if f"({id_emp})" not in option_text:
            continue
        if not is_selected:
            await option.click(timeout=COMBO_TIMEOUT_MS, force=True)
            await page.wait_for_timeout(500)
        logger.info(f"      ✅ Empresa {id_emp} seleccionada")
        await _cerrar_overlays(page)
        return

    await _cerrar_overlays(page)
    raise RuntimeError(f"Empresa ({id_emp}) NO ENCONTRADA en selector de Empresas")


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
            await page.locator('select[formcontrolname="idproceso"]').first.wait_for(state="attached", timeout=timeout_ms)
            return True
        except Exception as e:
            logger.error(f"      [DEBUG] _esperar_ui_reporteador exception: {e}")
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
            html = await page.content()
            with open("logs/errors/debug_html.html", "w") as f:
                f.write(html)
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

    selected_label = await seleccionar_proceso_reporteador(
        page,
        must_include=("padron",),
        descripcion="Padrón de clientes",
    )

    await page.wait_for_timeout(1200)
    await _esperar_comboboxes_parametros(page, min_count=1)
    logger.info(f"  ✅ Panel de parámetros listo para {selected_label}")


# ─────────────────────────────────────────────────────────────────
# PASO 3: CONFIGURAR PARÁMETROS
# ─────────────────────────────────────────────────────────────────

async def _configurar_parametros(page: Page, tenant: dict) -> None:
    """
    Configura los parámetros del reporte:
      1. "Incluyí Anulados" = SI por defecto (mat-select Angular Material)
      2. "Empresas" = seleccionar solo IDEMPRESA del tenant (mat-select Angular Material)
    """
    logger.info(f"  Configurando parámetros para {tenant['nombre']}")
    await _esperar_comboboxes_parametros(page, min_count=1)
    await _set_incluir_anulados(page)
    await _set_empresa_padron(page, tenant)


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
        # tenant['id'] debe traer el prefijo deseado (ej. padron_tabaco, ventas_enriched_tabaco).
        nuevo_nombre = f"{tenant['id']}_{fecha}.xlsx"
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
    resumen = {"ok": 0, "errores": 0, "sin_cambios": 0, "error_msg": None}

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
            resumen["error_msg"] = f"login: {e}"[:500]
            await context.close()
            return resumen

        # PASO 2: Seleccionar reporte Padrón
        try:
            await _seleccionar_reporte_padron(page)
        except Exception as e:
            logger.error(f"  Error seleccionando Padrón: {e}")
            await _screenshot_error(page, tenant["id"], "seleccionar_padron")
            resumen["errores"] += 1
            resumen["error_msg"] = f"seleccionar_padron: {e}"[:500]
            await context.close()
            return resumen

        # PASO 3: Configurar parámetros
        try:
            await _configurar_parametros(page, tenant)
        except Exception as e:
            logger.error(f"  Error configurando parámetros: {e}")
            await _screenshot_error(page, tenant["id"], "parametros")
            resumen["errores"] += 1
            resumen["error_msg"] = f"parametros: {e}"[:500]
            await context.close()
            return resumen

        # PASO 4: Ejecutar
        try:
            await _ejecutar_reporte(page)
        except Exception as e:
            logger.error(f"  Error ejecutando reporte: {e}")
            await _screenshot_error(page, tenant["id"], "ejecutar")
            resumen["errores"] += 1
            resumen["error_msg"] = f"ejecutar: {e}"[:500]
            await context.close()
            return resumen

        # PASO 5: Descargar
        try:
            archivo = await _descargar_excel(page, {**tenant, "id": f"padron_{tenant['id']}"})
            if not archivo:
                resumen["errores"] += 1
                resumen["error_msg"] = "descargar: Excel no obtenido"
                await context.close()
                return resumen
        except Exception as e:
            logger.error(f"  Error descargando: {e}")
            await _screenshot_error(page, tenant["id"], "descargar")
            resumen["errores"] += 1
            resumen["error_msg"] = f"descargar: {e}"[:500]
            await context.close()
            return resumen

        await context.close()

        # PASO 6: Hash Guard (deduplicación)
        logger.info(f"  Verificando con Hash Guard...")
        hash_key = f"padron_{tenant['id']}"

        if es_duplicado(hash_key, str(archivo)):
            logger.info(f"  ⏭️  Archivo idéntico al anterior — sin cambios")
            await registrar_padron_sin_cambios(tenant["id_dist"])
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
            resumen["error_msg"] = f"upload: {e}"[:500]

        logger.info(f"  └─ Tenant {tenant['nombre']} finalizado\n")
        return resumen

    except Exception as e:
        logger.error(f"  ❌ Error inesperado en tenant {tenant['id']}: {e}")
        resumen["errores"] += 1
        resumen["error_msg"] = str(e)[:500]
        return resumen


# ─────────────────────────────────────────────────────────────────
# PUNTO DE ENTRADA: run() / run_tenant() / run_catchup_stale()
# ─────────────────────────────────────────────────────────────────


def cargar_tenants_activos() -> list[dict]:
    """Tenants activos en orden de corrida (chicos primero, tabaco/aloma al final)."""
    tenants = ordenar_tenants_para_corrida(_cargar_tenants_desde_supabase())
    return _filtrar_tenants_para_debug(tenants)


async def _procesar_tenant_con_reintentos(
    browser: Browser, tenant: dict, usuario: str, password: str
) -> dict:
    resumen_tenant = {"ok": 0, "errores": 1, "sin_cambios": 0}
    for intento in range(1, TENANT_RETRY_MAX + 2):
        if intento > 1:
            logger.warning(
                f"🔁 Reintentando tenant {tenant['id']} "
                f"({intento - 1}/{TENANT_RETRY_MAX})..."
            )
        resumen_tenant = await _procesar_tenant(browser, tenant, usuario, password)
        if resumen_tenant.get("ok", 0) > 0 or resumen_tenant.get("sin_cambios", 0) > 0:
            break
        if intento < (TENANT_RETRY_MAX + 1):
            await asyncio.sleep(TENANT_RETRY_BACKOFF_SEC)
    return resumen_tenant


async def run_tenant(tenant_id: str) -> dict:
    """
    Un solo tenant (scheduler: job por distribuidor).
    Usa lock de archivo: si otro tenant está en Consolido, espera a que termine.
    """
    tenant_id = (tenant_id or "").strip().lower()
    tenants = cargar_tenants_activos()
    tenant = next((t for t in tenants if str(t.get("id", "")).lower() == tenant_id), None)
    if not tenant:
        logger.error("Tenant padrón desconocido o inactivo: %s", tenant_id)
        try:
            await notificar_error_motor("padron", 0, f"tenant desconocido o inactivo: {tenant_id}")
        except Exception as e:
            logger.warning("No se pudo notificar tenant desconocido: %s", e)
        return {"ok": 0, "errores": 1, "sin_cambios": 0, "tenant_id": tenant_id}

    resumen = {"ok": 0, "errores": 0, "sin_cambios": 0, "tenant_id": tenant_id}
    with padron_consolido_lock():
        usuario, password = _resolver_credenciales_consolido()
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=HEADLESS)
            try:
                r = await _procesar_tenant_con_reintentos(browser, tenant, usuario, password)
                resumen["ok"] = r.get("ok", 0)
                resumen["errores"] = r.get("errores", 0)
                resumen["sin_cambios"] = r.get("sin_cambios", 0)
                resumen["error_msg"] = r.get("error_msg")
            finally:
                await browser.close()
    if resumen.get("errores", 0) > 0:
        msg = resumen.get("error_msg") or f"RPA padrón falló tenant={tenant_id}"
        try:
            await notificar_error_motor("padron", int(tenant.get("id_dist", 0)), msg)
        except Exception as e:
            logger.warning("No se pudo notificar error padrón dist=%s: %s", tenant.get("id_dist"), e)
    return resumen


async def run_catchup_stale(max_age_hours: float | None = None) -> dict:
    """
    Corre solo tenants sin motor_run padron reciente.
    Scheduler de ola usa ~2.5h; arranque del servicio usa PADRON_MAX_AGE_HOURS (11h).
    """
    hours = DEFAULT_MAX_AGE_HOURS if max_age_hours is None else max_age_hours
    tenants = cargar_tenants_activos()
    stale_ids = list_stale_tenant_ids(tenants, max_age_hours=hours)
    resumen_total = {
        "ok": 0,
        "errores": 0,
        "sin_cambios": 0,
        "catchup": True,
        "stale": stale_ids,
        "procesados": [],
    }
    if not stale_ids:
        logger.info("Catch-up padrón: todos los tenants están al día (%.1fh)", hours)
        return resumen_total

    logger.warning("Catch-up padrón: %d tenant(s) pendientes: %s", len(stale_ids), stale_ids)
    for tid in stale_ids:
        r = await run_tenant(tid)
        resumen_total["procesados"].append({"tenant_id": tid, **r})
        resumen_total["ok"] += r.get("ok", 0)
        resumen_total["errores"] += r.get("errores", 0)
        resumen_total["sin_cambios"] += r.get("sin_cambios", 0)
    still = list_stale_tenant_ids(tenants, max_age_hours=hours)
    if still:
        logger.error("Catch-up padrón incompleto — siguen stale: %s", still)
        resumen_total["errores"] += len(still)
    return resumen_total


async def run() -> dict:
    """
    Punto de entrada legacy: todos los tenants en serie + catch-up final.
    Preferir jobs por tenant en scheduler.py.
    """
    resumen_total = {"ok": 0, "errores": 0, "sin_cambios": 0}
    tenants = cargar_tenants_activos()

    for tenant in tenants:
        r = await run_tenant(str(tenant["id"]))
        resumen_total["ok"] += r.get("ok", 0)
        resumen_total["errores"] += r.get("errores", 0)
        resumen_total["sin_cambios"] += r.get("sin_cambios", 0)
        await asyncio.sleep(2)

    catch = await run_catchup_stale()
    resumen_total["ok"] += catch.get("ok", 0)
    resumen_total["errores"] += catch.get("errores", 0)
    resumen_total["sin_cambios"] += catch.get("sin_cambios", 0)
    if catch.get("stale"):
        resumen_total["catchup_stale_after"] = list_stale_tenant_ids(tenants)
    return resumen_total
