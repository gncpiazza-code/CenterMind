# -*- coding: utf-8 -*-
"""
test_cuentas.py
===============
Script de PRUEBA para verificar que la descarga de Cuentas Corrientes
(Saldos Totales) funciona correctamente en tu máquina local (Windows).

USO:
    python test_cuentas.py tabaco
    python test_cuentas.py aloma
    python test_cuentas.py liver
    python test_cuentas.py real

Descarga el Excel en descargas_test/ y lo parsea con cuentas_parser.
"""

import asyncio
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from playwright.async_api import async_playwright

TENANTS = {
    "tabaco": {
        "nombre":   "Tabaco & Hnos S.R.L.",
        "url_base": "https://tabacohermanos.chesserp.com/AR1149",
        "usuario":  "cristiancena85",
        "password": "Chess-1234",
    },
    "aloma": {
        "nombre":   "Aloma Distribuidores Oficiales",
        "url_base": "https://alomasrl.chesserp.com/AR1252",
        "usuario":  "Admin",
        "password": "2084Aloma!!",
    },
    "liver": {
        "nombre":   "Liver SRL",
        "url_base": "https://liversrl.chesserp.com/AR1274",
        "usuario":  "Admin",
        "password": "Liversrl2025$",
    },
    "real": {
        "nombre":   "Real Tabacalera de Santiago S.A.",
        "url_base": "https://realtabacalera.chesserp.com/AR1272",
        "usuario":  "utrentin",
        "password": "tabacalera",
    },
}

CARPETA_SALIDA = Path("descargas_test")
TIMEOUT_MS = 30_000


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")


async def cerrar_popup_actualizacion(page):
    try:
        btn = page.locator('button:has-text("Actualizar")')
        await btn.wait_for(state="visible", timeout=5_000)
        log("  ⚠️  Popup de actualización — cerrando...")
        await btn.click()
        await page.wait_for_load_state("networkidle", timeout=15_000)
        log("  Popup cerrado ✅")
    except Exception:
        pass


async def cerrar_popup_nexty(page):
    try:
        btn = page.locator(
            'button:has-text("No volver a mostrar"), '
            'button:has-text("Ver más tarde")'
        )
        await btn.first.wait_for(state="visible", timeout=4_000)
        await btn.first.click()
        log("  Popup Nexty cerrado")
    except Exception:
        pass


async def cerrar_accesos_concurrentes(page):
    """
    Cierra el dialog de 'Accesos concurrentes' si aparece.
    Puede aparecer en cualquier momento durante la sesión.
    """
    try:
        dialog = page.locator('kendo-dialog')
        await dialog.wait_for(state="visible", timeout=3_000)
        texto = await dialog.inner_text()
        if "concurrentes" in texto.lower() or "otro entorno" in texto.lower():
            log("  ⚠️  Accesos concurrentes — cerrando...")
            await page.locator('kendo-dialog button:has-text("Continuar")').click()
            await page.wait_for_timeout(500)
            log("  Dialog cerrado ✅")
    except Exception:
        pass


async def test_tenant(tenant_id: str) -> dict:
    tenant = TENANTS[tenant_id]
    resultado = {
        "tenant":    tenant_id,
        "nombre":    tenant["nombre"],
        "login":     False,
        "descarga":  None,
        "parseo":    None,
        "errores":   [],
    }

    print()
    print("=" * 60)
    log(f"🚀 Cuentas Corrientes: {tenant['nombre']}")
    print("=" * 60)

    CARPETA_SALIDA.mkdir(exist_ok=True)

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=False, slow_mo=150)
        context = await browser.new_context(
            locale="es-AR",
            accept_downloads=True,
        )
        page = await context.new_page()
        page.set_default_timeout(TIMEOUT_MS)

        try:
            # ── LOGIN ─────────────────────────────────────────────
            log(f"  Navegando a login: {tenant['url_base']}/#/login")
            await page.goto(f"{tenant['url_base']}/#/login", wait_until="networkidle")
            await cerrar_popup_actualizacion(page)

            await page.locator('input').first.fill(tenant["usuario"])
            await page.locator('input[type="password"]').fill(tenant["password"])
            await page.locator('button:has-text("INICIAR SESIÓN")').click()
            await page.wait_for_url("**/dashboard**", timeout=20_000)
            resultado["login"] = True
            log("  ✅ Login OK")

            await cerrar_popup_nexty(page)

            # ── NAVEGAR AL REPORTE ────────────────────────────────
            url_reporte = f"{tenant['url_base']}/#/cuentas-por-cobrar/reportes/saldos-totales"
            log(f"  Navegando al reporte...")
            await page.goto(url_reporte, wait_until="networkidle")
            await cerrar_accesos_concurrentes(page)

            # Esperar botón Procesar
            await page.locator('button.btn.btn-primary').wait_for(
                state="visible", timeout=TIMEOUT_MS
            )
            log("  Reporte cargado ✅")

            # ── PROCESAR ──────────────────────────────────────────
            # Todos los filtros en default (Todas las empresas, todas sucursales,
            # TODOS los tipos, Saldo actual) — no hay que tocar nada
            log("  Procesando con filtros por defecto...")
            await page.locator('button.btn.btn-primary').click()

            # ── ESPERAR RESULTADO ─────────────────────────────────
            log("  Esperando que la grilla cargue (botón Redefinir)...")
            try:
                await page.locator(
                    'button.btn.btn-primary:has-text("Redefinir")'
                ).wait_for(state="visible", timeout=60_000)
                log("  ✅ Grilla cargada (Redefinir visible)")
            except Exception:
                log("  ⚠️  Timeout esperando Redefinir — continuando igual")

            # Cerrar dialog de accesos si apareció durante el procesamiento
            await cerrar_accesos_concurrentes(page)

            # Verificar que la sesión sigue activa
            if "login" in page.url:
                raise Exception(
                    "Sesión cerrada por accesos concurrentes. "
                    "Cerrá todas las sesiones activas del usuario y reintentá. "
                    "Tip: cerrá la terminal con el test anterior antes de correr uno nuevo."
                )

            # ── ABRIR MODAL DE EXPORTACIÓN ────────────────────────
            # Cuentas Corrientes usa fa-file-excel (NO fa-file-download como ventas)
            # El botón está en la toolbar de ag-grid y abre el kendo-dialog
            log("  Abriendo modal via botón fa-file-excel...")

            # Verificar que la sesión sigue activa
            if "login" in page.url:
                raise Exception(
                    "Sesión cerrada por accesos concurrentes. "
                    "Cerrá todas las sesiones activas del usuario y reintentá."
                )

            await page.evaluate(
                "document.querySelector('button.btn.btn-default.btn-xs:has(i.fa-file-excel)')?.click()"
            )
            await page.locator('kendo-dialog:not(#error-dialog)').wait_for(state="visible", timeout=30_000)
            await page.locator('kendo-dialog:not(#error-dialog) mat-radio-button').first.wait_for(state="visible", timeout=10_000)
            log("  ✅ Modal de exportación abierto")

            # ── DESCARGAR ─────────────────────────────────────────
            # Primero logueamos qué botones tiene el dialog para debug
            btns_dialog = await page.evaluate('''
                () => {
                    const dialogs = Array.from(document.querySelectorAll('kendo-dialog'));
                    const d = dialogs.find(d => !d.id || d.id !== "error-dialog");
                    if (!d) return [];
                    return Array.from(d.querySelectorAll("button")).map(b => ({
                        text: b.textContent.trim(),
                        class: b.className
                    }));
                }
            ''')
            log(f"  Botones en el dialog: {btns_dialog}")
            log("  Descargando Excel...")
            async with page.expect_download(timeout=120_000) as dl_info:
                # El radio "resumido" ya viene seleccionado — click directo en Exportar
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

            download = await dl_info.value
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            nombre = download.suggested_filename or f"cuentas_{tenant_id}_{ts}.xlsx"
            ruta = CARPETA_SALIDA / nombre
            await download.save_as(str(ruta))
            size_kb = ruta.stat().st_size / 1024
            log(f"  ✅ Excel descargado: {nombre} ({size_kb:.1f} KB)")
            resultado["descarga"] = str(ruta)

            # Cerrar modal
            try:
                await page.locator('kendo-dialog:not(#error-dialog) button.btn.btn-md.btn-default').click()
            except Exception:
                pass

            # ── PARSEAR ───────────────────────────────────────────
            log("  Parseando con cuentas_parser...")
            try:
                # Importar desde la misma carpeta o desde lib/
                try:
                    from lib.cuentas_parser import procesar_excel_cuentas
                except ImportError:
                    from cuentas_parser import procesar_excel_cuentas

                datos = procesar_excel_cuentas(str(ruta))
                meta = datos["metadatos"]
                log(f"  ✅ Parseo OK:")
                log(f"     Clientes deudores:  {meta['clientes_deudores']}")
                log(f"     Deuda total:        ${meta['total_deuda']:,.2f}")
                log(f"     Promedio días:      {meta['promedio_dias_retraso']:.1f}")
                log(f"     Registros detalle:  {len(datos['detalle_cuentas'])}")
                resultado["parseo"] = meta

            except Exception as e:
                log(f"  ⚠️  Parseo falló: {e}")
                log(f"     (Verificar que cuentas_parser.py esté en el mismo directorio o en lib/)")
                resultado["errores"].append(f"parseo: {e}")

        except Exception as e:
            log(f"  ❌ Error: {e}")
            resultado["errores"].append(str(e))
            try:
                ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                await page.screenshot(
                    path=f"descargas_test/error_cuentas_{tenant_id}_{ts}.png"
                )
                log("  📸 Screenshot guardado")
            except Exception:
                pass

        finally:
            await context.close()
            await browser.close()

    return resultado


def imprimir_resumen(r: dict):
    print()
    print("╔══════════════════════════════════════════════════════════╗")
    print(f"║  RESUMEN — {r['nombre']:<44} ║")
    print("╚══════════════════════════════════════════════════════════╝")
    print(f"  Login:     {'✅ OK' if r['login'] else '❌ FALLÓ'}")

    if r["descarga"]:
        print(f"  Excel:     ✅ {Path(r['descarga']).name}")
    else:
        print(f"  Excel:     ❌ No descargado")

    if r["parseo"]:
        print(f"  Parseo:    ✅ {r['parseo']['clientes_deudores']} deudores / ${r['parseo']['total_deuda']:,.0f} deuda")
    else:
        print(f"  Parseo:    ❌ No parseado")

    if r["errores"]:
        print(f"  Errores:   {'; '.join(r['errores'])}")
    print()

    if r["descarga"] and r["parseo"]:
        print("  🎉 TEST EXITOSO")
        print(f"  📁 {Path('descargas_test').absolute()}")
    else:
        print("  ⚠️  TEST INCOMPLETO — revisá los errores arriba")


async def main():
    if len(sys.argv) < 2:
        print("USO: python test_cuentas.py <tenant>")
        print("     tenant: tabaco | aloma | liver | real")
        sys.exit(1)

    tenant_id = sys.argv[1].lower().strip()
    if tenant_id not in TENANTS:
        print(f"Tenant desconocido: '{tenant_id}'")
        sys.exit(1)

    resultado = await test_tenant(tenant_id)
    imprimir_resumen(resultado)


if __name__ == "__main__":
    asyncio.run(main())
