# -*- coding: utf-8 -*-
"""
motores/cuentas_corrientes.py
==============================
Motor 3: Reporte de Saldos Totales (Cuentas Corrientes) — CHESS ERP

¿Qué hace?
----------
Todos los días a las 07:00:
  1. Para cada tenant de CHESS ERP:
     a. Login (cerrando popup de actualización si aparece)
     b. Navega directo a /#/cuentas-por-cobrar/reportes/saldos-totales
     c. Cierra el dialog de "Accesos concurrentes" si aparece
     d. Hace click en Procesar (todos los filtros en default):
          - Empresa       : "Todas las Empresas" ← ya seleccionado
          - Sucursal      : todas ← ya seleccionadas
          - Tipo Cbte     : "TODOS" ← ya seleccionado
          - Radio         : "Saldo actual" ← ya seleccionado
     e. Espera el kendo-dialog de exportación
     f. Si la grilla apareció primero (<=1000 reg), abre el modal via fa-file-download
     g. Descarga el Excel
     h. Parsea con cuentas_parser.procesar_excel_cuentas()
     i. Compara hash MD5 con el de ayer
     j. Si cambió, sube el JSON parseado a la API de Shelfy
  2. Si un tenant falla → screenshot + log + continuar con el siguiente

TENANTS (5 total — 1 pendiente de credenciales):
  - tabaco    : Tabaco & Hnos S.R.L.
  - aloma     : Aloma Distribuidores Oficiales
  - liver     : Liver SRL
  - real      : Real Tabacalera de Santiago S.A.
  - extra     : tenant extra (credenciales pendientes)

DIFERENCIAS CON ventas.py:
  - URL distinta: /#/cuentas-por-cobrar/reportes/saldos-totales
  - Botón Procesar: 'button.btn.btn-primary' (sin .margin-boton)
  - No hay campos de fecha — todo en default
  - Hay un dialog de "Accesos concurrentes" que puede aparecer antes del resultado
  - Se descarga UN SOLO Excel (no resumido + detallado)
  - El Excel se parsea con cuentas_parser antes de subir a la API
"""

import asyncio
import json
import os
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo

from playwright.async_api import (
    async_playwright, Browser, BrowserContext, Page, Download
)

from lib.logger import get_logger
from lib.hash_guard import es_duplicado, guardar_hash
from lib.vault_client import get_secret

logger = get_logger("CUENTAS")
AR_TZ = ZoneInfo("America/Argentina/Buenos_Aires")

BASE_DIR = Path(__file__).resolve().parent.parent
DOWNLOADS_DIR = BASE_DIR / "downloads"
ERRORS_DIR    = BASE_DIR / "logs" / "errors"
HEADLESS      = os.environ.get("RPA_HEADLESS", "true").lower() != "false"
TIMEOUT_MS    = 30_000

# ─────────────────────────────────────────────────────────────────
# TENANTS
# ─────────────────────────────────────────────────────────────────
TENANTS = [
    {
        "id":         "tabaco",
        "nombre":     "Tabaco & Hnos S.R.L.",
        "url_base":   "https://tabacohermanos.chesserp.com/AR1149",
        "vault_user": "chess_tabaco_usuario",
        "vault_pass": "chess_tabaco_password",
        "id_dist":    1,
        "activo":     True,
    },
    {
        "id":         "aloma",
        "nombre":     "Aloma Distribuidores Oficiales",
        "url_base":   "https://alomasrl.chesserp.com/AR1252",
        "vault_user": "chess_aloma_usuario",
        "vault_pass": "chess_aloma_password",
        "id_dist":    2,
        "activo":     True,
    },
    {
        "id":         "liver",
        "nombre":     "Liver SRL",
        "url_base":   "https://liversrl.chesserp.com/AR1274",
        "vault_user": "chess_liver_usuario",
        "vault_pass": "chess_liver_password",
        "id_dist":    3,
        "activo":     True,
    },
    {
        "id":         "real",
        "nombre":     "Real Tabacalera de Santiago S.A.",
        "url_base":   "https://realtabacalera.chesserp.com/AR1272",
        "vault_user": "chess_real_usuario",
        "vault_pass": "chess_real_password",
        "id_dist":    4,
        "sucursal":   "UEQUIN RODRIGO",
        "activo":     True,
    },
    {
        "id":         "extra",
        "nombre":     "Tenant Extra (credenciales pendientes)",
        "url_base":   "",   # ← completar cuando lleguen las credenciales
        "vault_user": "chess_extra_usuario",
        "vault_pass": "chess_extra_password",
        "id_dist":    5,
        "activo":     False,  # ← activar cuando estén las credenciales
    },
]


# ─────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────

def _timestamp() -> str:
    return datetime.now(AR_TZ).strftime("%Y%m%d_%H%M")


async def _screenshot_error(page: Page, tenant_id: str, paso: str) -> None:
    try:
        ERRORS_DIR.mkdir(parents=True, exist_ok=True)
        nombre = f"error_cuentas_{tenant_id}_{paso}_{_timestamp()}.png"
        await page.screenshot(path=str(ERRORS_DIR / nombre), full_page=True)
        logger.info(f"  📸 Screenshot guardado: {nombre}")
    except Exception as e:
        logger.warning(f"  No se pudo guardar screenshot: {e}")


# ─────────────────────────────────────────────────────────────────
# PASO 1: CERRAR POPUP DE ACTUALIZACIÓN (igual que ventas)
# ─────────────────────────────────────────────────────────────────

async def _cerrar_popup_actualizacion(page: Page) -> None:
    """
    Cierra el popup naranja 'Nueva versión de ChessERP' si aparece.
    Bloquea todos los clicks hasta que se cierra.
    """
    try:
        btn = page.locator('button:has-text("Actualizar")')
        await btn.wait_for(state="visible", timeout=5_000)
        logger.info("  ⚠️  Popup de actualización — cerrando...")
        await btn.click()
        await page.wait_for_load_state("networkidle", timeout=15_000)
        logger.info("  Popup cerrado ✅")
    except Exception:
        pass


# ─────────────────────────────────────────────────────────────────
# PASO 2: CERRAR DIALOG DE ACCESOS CONCURRENTES
# ─────────────────────────────────────────────────────────────────

async def _cerrar_accesos_concurrentes(page: Page) -> None:
    """
    Cierra el kendo-dialog de 'Accesos concurrentes' si aparece.

    Este dialog aparece cuando el mismo usuario tiene otra sesión activa
    en otra pestaña o browser. El motor puede encontrarlo en dos momentos:
      1. Justo después del login
      2. Después de hacer click en Procesar

    Al hacer click en 'Continuar', el sistema cierra la sesión anterior
    y mantiene la actual activa.
    """
    try:
        dialog = page.locator('kendo-dialog')
        await dialog.wait_for(state="visible", timeout=3_000)
        texto = await dialog.inner_text()
        if "concurrentes" in texto.lower() or "otro entorno" in texto.lower():
            logger.info("  ⚠️  Dialog de accesos concurrentes — cerrando...")
            await page.locator('kendo-dialog button:has-text("Continuar")').click()
            await page.wait_for_timeout(500)
            logger.info("  Dialog cerrado ✅")
    except Exception:
        pass


# ─────────────────────────────────────────────────────────────────
# PASO 3: LOGIN
# ─────────────────────────────────────────────────────────────────

async def _hacer_login(page: Page, tenant: dict) -> None:
    url_login = f"{tenant['url_base']}/#/login"
    logger.info(f"  Navegando a: {url_login}")
    await page.goto(url_login, wait_until="networkidle")
    await _cerrar_popup_actualizacion(page)
    await page.locator('input').first.wait_for(state="visible", timeout=TIMEOUT_MS)

    usuario  = get_secret(tenant["vault_user"])
    password = get_secret(tenant["vault_pass"])

    await page.locator('input').first.fill(usuario)
    await page.locator('input[type="password"]').fill(password)
    await page.locator('button:has-text("INICIAR SESIÓN")').click()
    await page.wait_for_url("**/dashboard**", timeout=20_000)
    logger.info(f"  ✅ Login OK — {tenant['nombre']}")


# ─────────────────────────────────────────────────────────────────
# PASO 4: CERRAR POPUP DE NEXTY (post-login)
# ─────────────────────────────────────────────────────────────────

async def _cerrar_popup_nexty(page: Page) -> None:
    try:
        btn = page.locator(
            'button:has-text("No volver a mostrar"), '
            'button:has-text("Ver más tarde")'
        )
        await btn.first.wait_for(state="visible", timeout=4_000)
        await btn.first.click()
    except Exception:
        pass


# ─────────────────────────────────────────────────────────────────
# PASO 5: NAVEGAR Y PROCESAR
# ─────────────────────────────────────────────────────────────────

async def _navegar_y_procesar(page: Page, tenant: dict) -> None:
    """
    Navega al reporte de Saldos Totales y hace click en Procesar.

    Todos los filtros ya vienen en el estado correcto por defecto:
      - Empresa:     "Todas las Empresas" ← seleccionado
      - Sucursal:    todas ← seleccionadas
      - Tipo Cbte:   "TODOS" ← seleccionado
      - Radio:       "Saldo actual" ← seleccionado

    ⚠️ Diferencia con ventas: el botón usa 'button.btn.btn-primary'
    sin la clase 'margin-boton'. No confundir.
    """
    url_reporte = f"{tenant['url_base']}/#/cuentas-por-cobrar/reportes/saldos-totales"
    logger.info(f"  Navegando al reporte...")
    await page.goto(url_reporte, wait_until="networkidle")

    # Puede aparecer el dialog de accesos al navegar
    await _cerrar_accesos_concurrentes(page)
    
    # DEBUG: Capturar pantalla para Aloma para ver los filtros
    if tenant["id"] == "aloma":
        await page.screenshot(path=str(ERRORS_DIR / "debug_aloma_filtros.png"))
        logger.info(f"  📸 Screenshot de filtros guardado: debug_aloma_filtros.png")

    btn_procesar = page.locator('button.btn.btn-primary')
    await btn_procesar.wait_for(state="visible", timeout=TIMEOUT_MS)

    # ── Configurar Filtros (Sucursal / Vendedor) ────────
    sucursal = tenant.get("sucursal")
    
    # 1. Caso Sucursal (especial para Real Tabacalera o si se requiere)
    if sucursal:
        logger.info(f"  Configurando sucursal: '{sucursal}'")
        selector_sucursal = page.locator('mat-select').filter(has=page.locator('mat-label:has-text("Sucursal")')).first
        if await selector_sucursal.count() == 0:
            selector_sucursal = page.locator('mat-select').nth(1)
            
        await selector_sucursal.wait_for(state="visible", timeout=TIMEOUT_MS)
        await selector_sucursal.click()
        await page.wait_for_timeout(500)

        # Deseleccionar todo — siempre nth(0) para evitar shifting de índices
        while True:
            opciones_marcadas = page.locator('mat-option[aria-selected="true"]')
            if await opciones_marcadas.count() == 0:
                break
            await opciones_marcadas.nth(0).click()
            await page.wait_for_timeout(100)

        # Seleccionar solo sucursal
        await page.locator(f'mat-option:has-text("{sucursal}")').click()
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(500)

    # 2. Caso Vendedor (Asegurar 'Todos' para Aloma y otros)
    # Por defecto Chess ERP debería traer 'Todos', pero si Aloma tiene uno pre-seleccionado lo corregimos.
    try:
        selector_vendedor = page.locator('mat-select').filter(has=page.locator('mat-label:has-text("Vendedor")')).first
        if await selector_vendedor.count() > 0:
            # Vemos si hay algo seleccionado que NO sea 'Vendedor *' o vacío
            texto_actual = await selector_vendedor.inner_text()
            if texto_actual and "Vendedor" not in texto_actual:
                logger.info(f"  Detectada selección de vendedor ('{texto_actual}'), reseteando a Todos...")
                await selector_vendedor.click()
                await page.wait_for_timeout(500)
                # Seleccionar la primera opción que suele ser "(Seleccionar todos)" o "Todos"
                await page.locator('mat-option').first.click()
                await page.keyboard.press("Escape")
                await page.wait_for_timeout(500)
    except Exception as e:
        logger.warning(f"  No se pudo verificar filtro de vendedor: {e}")

    logger.info("  Reporte cargado, procesando...")
    await btn_procesar.click()


# ─────────────────────────────────────────────────────────────────
# PASO 6: ABRIR MODAL DE EXPORTACIÓN
# ─────────────────────────────────────────────────────────────────

async def _abrir_modal_exportacion(page: Page) -> None:
    """
    Espera que la grilla cargue y abre el modal de exportación.

    Flujo verificado en vivo para Cuentas Corrientes:
      1. Click en Procesar → esperar botón "Redefinir" (grilla con datos lista)
      2. Cerrar dialog "Accesos concurrentes" si interfirió
      3. Click en button.btn.btn-default.btn-xs:has(i.fa-file-excel)
         (botón de la toolbar de ag-grid con ícono Excel — DISTINTO a ventas)
      4. El mismo kendo-dialog/mat-radio-button aparece igual que en ventas

    ⚠️ DIFERENCIA CON VENTAS:
      - Ventas usa: fa-file-download → kendo-dialog automático
      - Cuentas usa: fa-file-excel → hay que clickearlo → kendo-dialog
    """
    # Esperar que el botón cambie a "Redefinir" (grilla con datos lista)
    logger.info("  Esperando que la grilla cargue...")
    try:
        await page.locator(
            'button.btn.btn-primary:has-text("Redefinir")'
        ).wait_for(state="visible", timeout=60_000)
        logger.info("  Grilla cargada (botón cambió a Redefinir)")
    except Exception:
        pass

    # Cerrar dialog de accesos concurrentes si apareció durante el procesamiento
    await _cerrar_accesos_concurrentes(page)

    # Verificar que la sesión sigue activa (accesos concurrentes puede haber
    # forzado un logout — si la URL cambió a /login hay que relanzar)
    url_actual = page.url
    if "login" in url_actual:
        raise RuntimeError(
            "La sesión fue cerrada por accesos concurrentes. "
            "Asegurate de que no haya otra sesión activa del mismo usuario."
        )

    # Click en el botón de exportar Excel de la toolbar de ag-grid
    # Selector verificado en vivo: button.btn.btn-default.btn-xs con i.fa-file-excel
    logger.info("  Abriendo modal de exportación via fa-file-excel...")
    await page.evaluate(
        "document.querySelector('button.btn.btn-default.btn-xs:has(i.fa-file-excel)')?.click()"
    )

    # Esperar el modal
    await page.locator('kendo-dialog:not(#error-dialog)').wait_for(state="visible", timeout=TIMEOUT_MS)
    await page.locator('kendo-dialog:not(#error-dialog) mat-radio-button').first.wait_for(
        state="visible", timeout=10_000
    )
    logger.info("  ✅ Modal de exportación abierto")


# ─────────────────────────────────────────────────────────────────
# PASO 7: DESCARGAR EL EXCEL
# ─────────────────────────────────────────────────────────────────

async def _descargar_excel(page: Page, tenant_id: str) -> Optional[bytes]:
    """
    Descarga el Excel desde el modal de exportación.

    Para Cuentas Corrientes solo hay UN archivo (no resumido/detallado).
    El radio "Exportar reporte resumido" ya viene seleccionado por defecto.
    Se hace click directo en Exportar.
    """
    logger.info("  Descargando Excel de saldos...")
    try:
        # El radio resumido ya viene seleccionado — no hay que tocarlo
        # Click directo en Exportar
        async with page.expect_download(timeout=120_000) as dl_info:
            await page.evaluate('''
                    () => {
                        // Encontrar el dialog de exportacion (no el de error)
                        const dialogs = Array.from(document.querySelectorAll('kendo-dialog'));
                        const exportDialog = dialogs.find(d => !d.id || d.id !== 'error-dialog');
                        if (!exportDialog) return;
                        // Buscar el botón de acción principal (Exportar / Aceptar / OK)
                        const btns = Array.from(exportDialog.querySelectorAll('button'));
                        // Primero buscar por texto "Exportar"
                        const btnExportar = btns.find(b => 
                            b.textContent.trim().toLowerCase().includes('exportar') ||
                            b.textContent.trim().toLowerCase().includes('aceptar') ||
                            b.textContent.trim().toLowerCase() === 'ok'
                        );
                        // Si no encontramos por texto, usar el btn-primary del dialog
                        const btnPrimary = btns.find(b => 
                            b.className.includes('btn-primary') || 
                            b.className.includes('primary')
                        );
                        (btnExportar || btnPrimary)?.click();
                    }
                ''')

        download: Download = await dl_info.value
        DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
        # SIEMPRE usar un nombre único con el tenant_id para evitar colisiones entre distribuidores
        nombre = f"cuentas_{tenant_id}_{_timestamp()}.xlsx"
        ruta_temp = DOWNLOADS_DIR / nombre
        await download.save_as(str(ruta_temp))

        file_bytes = ruta_temp.read_bytes()
        size_kb = len(file_bytes) / 1024
        logger.info(f"  ✅ Excel descargado: {nombre} ({size_kb:.1f} KB)")

        try:
            ruta_temp.unlink()
        except Exception:
            pass

        return file_bytes

    except Exception as e:
        logger.error(f"  ❌ Error descargando: {e}")
        return None


# ─────────────────────────────────────────────────────────────────
# PASO 8: PARSEAR Y SUBIR A LA API
# ─────────────────────────────────────────────────────────────────

def _parsear_excel(file_bytes: bytes, tenant_id: str) -> Optional[dict]:
    """
    Parsea el Excel con cuentas_parser.procesar_excel_cuentas().

    Guarda el archivo temporalmente en disco (el parser lo necesita por path),
    lo procesa, y limpia el temporal.
    """
    try:
        # El parser necesita una ruta de archivo — usamos un temporal
        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        from lib.cuentas_parser import procesar_excel_cuentas
        datos = procesar_excel_cuentas(tmp_path)

        Path(tmp_path).unlink(missing_ok=True)

        logger.info(
            f"  📊 Parseado OK — "
            f"deudores: {datos['metadatos']['clientes_deudores']}, "
            f"deuda total: ${datos['metadatos']['total_deuda']:,.0f}"
        )
        return datos

    except Exception as e:
        logger.error(f"  ❌ Error parseando Excel: {e}")
        return None


async def _subir_a_api(tenant: dict, datos: dict, filename: str) -> bool:
    """
    Sube el JSON parseado a la API de Shelfy.

    Endpoint: POST /api/v1/sync/cuentas-corrientes?id_distribuidor=X
    Body: JSON con metadatos + detalle_cuentas
    """
    try:
        import httpx
        from lib.vault_client import get_secret as _gs

        url = f"{_gs('shelfy_api_url').rstrip('/')}/api/v1/sync/cuentas-corrientes"
        headers = {"x-api-key": _gs("shelfy_api_key"), "Content-Type": "application/json"}
        params  = {"id_distribuidor": tenant["id_dist"]}
        payload = {
            "tenant_id": tenant["id"],
            "filename":  filename,
            "datos":     datos,
        }
        
        # DEBUG LOG
        vendedor_1 = datos.get("detalle_cuentas", [{}])[0].get("vendedor", "N/A")
        logger.info(f"  📤 SINCRO: Tenant={tenant['id']}, Dist={tenant['id_dist']}, Deuda={datos['metadatos']['total_deuda']}, 1er Vendedor={vendedor_1}")

        for intento in range(1, 4):
            try:
                with httpx.Client(timeout=120) as client:
                    resp = client.post(url, params=params, headers=headers, json=payload)
                if resp.status_code in (200, 202):
                    logger.info(f"  ✅ Subida OK (HTTP {resp.status_code})")
                    return True
                elif 400 <= resp.status_code < 500:
                    logger.error(f"  ❌ Error cliente HTTP {resp.status_code}: {resp.text[:200]}")
                    return False
                else:
                    logger.warning(f"  ⚠️  HTTP {resp.status_code} intento {intento}/3")
            except httpx.TimeoutException:
                logger.warning(f"  ⚠️  Timeout intento {intento}/3")
            except Exception as e:
                logger.error(f"  ❌ Error inesperado: {e}")
                return False
            if intento < 3:
                await asyncio.sleep(5)

        return False

    except Exception as e:
        logger.error(f"  ❌ Error en subida: {e}")
        return False


# ─────────────────────────────────────────────────────────────────
# PROCESAMIENTO COMPLETO DE UN TENANT
# ─────────────────────────────────────────────────────────────────

async def _procesar_tenant(tenant: dict) -> dict:
    """Ejecuta el flujo completo para un tenant."""
    tenant_id = tenant["id"]
    resultado = {
        "tenant":  tenant_id,
        "nombre":  tenant["nombre"],
        "estado":  "error",
        "error":   None,
    }

    logger.info(f"\n{'─'*50}")
    logger.info(f"🏢 Cuentas Corrientes: {tenant['nombre']}")
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
            # Login
            await _hacer_login(page, tenant)
            await _cerrar_popup_nexty(page)

            # Navegar y procesar (sin tocar filtros — todos en default)
            await _navegar_y_procesar(page, tenant)

            # Abrir modal de exportación
            await _abrir_modal_exportacion(page)

            # Descargar Excel
            file_bytes = await _descargar_excel(page, tenant_id)
            if not file_bytes:
                resultado["error"] = "descarga fallida"
                await _screenshot_error(page, tenant_id, "descarga")
                return resultado

            # Cerrar modal
            try:
                await page.locator('kendo-dialog:not(#error-dialog) button.btn.btn-md.btn-default').click()
            except Exception:
                pass

            # Hash Guard — ¿cambió desde ayer?
            clave_hash = f"cuentas_{tenant_id}"
            if es_duplicado(clave_hash, file_bytes):
                resultado["estado"] = "sin_cambios"
                return resultado

            # Parsear con cuentas_parser
            datos = _parsear_excel(file_bytes, tenant_id)
            if not datos:
                resultado["error"] = "fallo en parseo"
                return resultado

            # Subir a la API
            filename = f"cuentas_{tenant_id}_{_timestamp()}.xlsx"
            ok = await _subir_a_api(tenant, datos, filename)
            if ok:
                guardar_hash(clave_hash, file_bytes)
                resultado["estado"] = "subida_ok"
                resultado["metadatos"] = datos["metadatos"]
            else:
                resultado["error"] = "fallo en subida a API"

        except Exception as e:
            msg = str(e)[:300]
            logger.error(f"  ❌ Error en {tenant_id}: {msg}")
            resultado["error"] = msg
            await _screenshot_error(page, tenant_id, "proceso")

        finally:
            await context.close()
            await browser.close()

    return resultado


# ─────────────────────────────────────────────────────────────────
# PUNTO DE ENTRADA
# ─────────────────────────────────────────────────────────────────

async def run() -> dict:
    """Corre el motor completo de Cuentas Corrientes. Llamado desde runner.py."""
    inicio = datetime.now(AR_TZ)
    tenants_activos = [t for t in TENANTS if t["activo"]]

    logger.info("=" * 60)
    logger.info(f"🚀 Motor CUENTAS CORRIENTES — {inicio.strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info(f"   Tenants activos: {len(tenants_activos)}")
    logger.info("=" * 60)

    resultados = []
    for tenant in tenants_activos:
        r = await _procesar_tenant(tenant)
        resultados.append(r)

        iconos = {"subida_ok": "✅", "sin_cambios": "ℹ️ ", "error": "❌"}
        logger.info(f"  {tenant['nombre']}: {iconos.get(r['estado'], '?')} {r['estado']}")
        if r.get("error"):
            logger.error(f"    → {r['error']}")

    fin = datetime.now(AR_TZ)
    duracion = (fin - inicio).total_seconds() / 60

    ok     = sum(1 for r in resultados if r["estado"] == "subida_ok")
    sc     = sum(1 for r in resultados if r["estado"] == "sin_cambios")
    errors = sum(1 for r in resultados if r["estado"] == "error")

    logger.info("\n" + "=" * 60)
    logger.info("📊 RESUMEN CUENTAS CORRIENTES")
    logger.info(f"   Duración:       {duracion:.1f} min")
    logger.info(f"   ✅ OK:          {ok}/{len(tenants_activos)}")
    logger.info(f"   ℹ️  Sin cambios: {sc}/{len(tenants_activos)}")
    logger.info(f"   ❌ Errores:     {errors}/{len(tenants_activos)}")
    logger.info("=" * 60 + "\n")

    return {
        "motor":        "CUENTAS_CORRIENTES",
        "inicio":       inicio.strftime("%Y-%m-%d %H:%M:%S"),
        "fin":          fin.strftime("%Y-%m-%d %H:%M:%S"),
        "duracion_min": round(duracion, 1),
        "ok":           ok,
        "sin_cambios":  sc,
        "errores":      errors,
        "detalle":      resultados,
    }
