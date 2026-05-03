# Motor Padrón — Especificación e Implementación

**Fecha**: 27/04/2026  
**Estado**: Implementado (selectores CSS pendiente de verificación en navegador real)  
**Responsable**: Captura en vivo + Análisis de flujo automatizado

---

## Resumen Ejecutivo

El **Motor Padrón** descarga automáticamente el Padrón de Clientes desde **Consolido/Nextbyn Reporteador Genérico** (servidor cloud ERP de múltiples distribuidoras) y lo ingesta en el backend Shelfy para actualizar la jerarquía de clientes (`clientes_pdv_v2`).

### Flujo macro
```
ShelfMind-RPA/motores/padron.py (Playwright)
    ↓ 5 tenants (tabaco, aloma, liver, real, extra)
    ↓ login → reporteador → padrón → ejecutar → descargar
    ↓ Excel: resultados_Reporte.PadronDeClientes-XX.xlsx
    ↓ hash guard (deduplicación)
POST /api/v1/sync/erp-padrón (backend)
    ↓ BackgroundTask
padron_service.ingest_for_dist()
    ↓ jerarquía: sucursales_v2 → vendedores_v2 → rutas_v2 → clientes_pdv_v2
```

### Cron propuesto
```
04:00 y 14:00 (hora Argentina)  ← Mantiene sincronización diaria sin sobrecargar
```

---

## Archivos creados/modificados

### 1. **ShelfMind-RPA/motores/padron.py** (NUEVO)

**Estructura**:
- Async Playwright engine
- 5 tenants hardcodeados (ver sección TENANTS)
- 6 pasos automatizados:
  1. `_navegar_y_login()` — Login en Consolido
  2. `_seleccionar_reporte_padron()` — Navegación al Reporteador
  3. `_configurar_parametros()` — Seteo de parámetros (Incluyí Anulados, Empresas)
  4. `_ejecutar_reporte()` — Click en Ejecutar, espera tabla
  5. `_descargar_excel()` — Descarga mediante "Exportar resultados"
  6. `_procesar_tenant()` — Orquestación + hash guard + upload a API

**Selectores CSS: TBD**
Los selectores están documentados como variantes posibles basadas en capturas en vivo, pero requieren verificación exacta con DevTools Inspector abierto en Consolido real:

```python
# Ejemplo: botón Ejecutar — variantes posibles
ejecutar_btn = page.locator(
    'button:has-text("Ejecutar"), '
    'button:has-text("Procesar"), '
    '[role="button"]:has-text("Ejecutar")'
)
```

**⚠️ PRÓXIMO PASO CRÍTICO**: Abrir DevTools Inspector (`Cmd+Option+I` o `F12`) en consolido.nextbyn.com post-login y capturar selectores exactos con `$0.querySelector()` / Inspector para reemplazar estos placeholders.

---

### 2. **ShelfMind-RPA/lib/api_client.py** (MODIFICADO)

**Nueva función**:
```python
async def subir_padron(archivo_path, id_distribuidor: int) -> bool
```

- Lee archivo del disco
- Sube a `POST /api/v1/sync/erp-padrón`
- Headers: `X-Api-Key: {SHELFY_API_KEY}`
- Form data: `id_distribuidor` (int)
- File multipart: Excel

**Retorna**: `True` si 200/201, `False` en error

---

### 3. **CenterMind/routers/erp.py** (MODIFICADO)

**Nuevo endpoint**:
```python
@router.post("/api/v1/sync/erp-padrón", tags=["ERP Push"])
async def erp_sync_padron(
    id_distribuidor: int = Query(...),
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    _=Depends(verify_key),
)
```

- Autenticación: `verify_key()` (API Key RPA)
- Validación: `.xlsx` o `.xls`
- Procesa en BackgroundTask llamando a `padron_service.ingest_for_dist()`
- Respuesta: `{"status": "accepted", "message": "...", "timestamp": "..."}`

---

### 4. **ShelfMind-RPA/runner.py** (ACTUALIZADO)

- Documentación: actualizado comentario al inicio
- Función `correr_padron()` ya existe e importa `motores/padron.py`
- `main()` ya maneja opción `padron` en condicional y en secuencia `todos`
- **Sin cambios estructurales requeridos**

---

## Estructura del Excel descargado (Consolido)

**Archivo**: `resultados_Reporte.PadronDeClientes-XX.xlsx`

**Columnas** (25,816 registros ejemplo para Tabaco):
```
IDEMPRESA, DSEMPRESA, IDSUCUR, DSSUCUR, IDFUERZAVENTAS, DESFUERZAVENTAS,
IDCLIENTEINTERNO, IDCLIENTE, NOMCLI, FANTACLI, [FEC...]
```

**Mapeo a Shelfy**:
| Consolido | Shelfy | Tabla | Notas |
|---|---|---|---|
| IDEMPRESA | - | (groupby) | Filtro: solo 1 empresa/tenant |
| IDSUCUR | id_sucursal_erp | sucursales_v2 | Numérico (2, 3, ...) |
| DSSUCUR | nombre_erp | sucursales_v2 | - |
| IDFUERZAVENTAS | id_vendedor_erp | vendedores_v2 | - |
| DESFUERZAVENTAS | nombre_erp | vendedores_v2 | - |
| IDCLIENTE | id_cliente_erp | clientes_pdv_v2 | - |
| NOMCLI/FANTACLI | nombre_cliente | clientes_pdv_v2 | Puede haber ambas |

---

## Configuración de Tenants

```python
TENANTS = [
    {
        "id":         "tabaco",
        "nombre":     "Tabaco & Hnos S.R.L.",
        "id_empresa": "3154",  # IDEMPRESA en Consolido — VERIFICADO ✅
        "vault_user": "consolido_tabaco_usuario",
        "vault_pass": "consolido_tabaco_password",
        "id_dist":    3,       # distribuidor en Shelfy
    },
    {
        "id":         "aloma",
        "nombre":     "Aloma Distribuidores Oficiales",
        "id_empresa": "?",     # TBD — confirmar en Consolido
        "vault_user": "consolido_aloma_usuario",
        "vault_pass": "consolido_aloma_password",
        "id_dist":    4,
    },
    # ... (liver, real, extra)
]
```

### Requisitos de Vault (Supabase)

Cada distribuidor requiere dos secretos:
```
consolido_TENANT_usuario  = usuario del ERP Consolido
consolido_TENANT_password = contraseña
```

**Nota**: Actualmente no existen en Vault. Se asume que se crearán post-implementación. 
Ruta de lectura en `lib/vault_client.py` → `get_secret()` → Supabase Vault RPC.

---

## Flujo paso a paso (en vivo)

### 1. LOGIN
```
GET https://consolido.nextbyn.com
→ form: usuario, contraseña
→ click "Entrar|Login|Iniciar"
→ redirect: /#/reporteador (o similar)
```

### 2. SELECCIONAR REPORTE
```
Tab "Informes" o similar
Dropdown "Proceso" → "Padrón de clientes"
```

### 3. PARÁMETROS
```
Radio "Incluyí Anulados" → NO (por defecto)
Checkbox "Empresas" → seleccionar solo IDEMPRESA del tenant (ej. 3154 para Tabaco)
```

### 4. EJECUTAR
```
Click botón "Ejecutar"
Wait: tabla de resultados visible (25k+ registros)
Timeout: 60s (Consolido puede ser lento)
```

### 5. DESCARGAR
```
Click botón "Exportar resultados"
intercept descarga → `resultados_Reporte.PadronDeClientes-XX.xlsx`
Guardar en DOWNLOADS_DIR = /opt/shelfmind/rpa/downloads
```

### 6. HASH GUARD Y UPLOAD
```
Leer archivo
Calcular MD5
Comparar con día anterior
si duplicado → skip
si nuevo → upload a /api/v1/sync/erp-padrón + guardar hash
```

---

## Variables de Entorno y Configuración

### En el motor (motores/padron.py)
```python
HEADLESS = os.environ.get("RPA_HEADLESS", "true").lower() != "false"
TIMEOUT_MS = 60_000  # Consolido timeout
DOWNLOADS_DIR = Path("/opt/shelfmind/rpa/downloads")
ERRORS_DIR = Path("/opt/shelfmind/rpa/logs/errors")
```

### En lib/shelfy_config.py (lectura de API URL y KEY)
```python
SHELFY_API_URL (o SHELFY_API_KEY)
Fallback producción: https://api.shelfycenter.com
```

### En Supabase Vault (secretos por tenant)
```
consolido_tabaco_usuario
consolido_tabaco_password
consolido_aloma_usuario
...
```

---

## Testing y validación

### Fase 0: Selectores CSS
1. Abrir Consolido en navegador
2. Post-login, abrir DevTools Inspector (`F12`)
3. Capturar selectores exactos de:
   - Input usuario/password
   - Botón login
   - Tab Informes
   - Dropdown Proceso
   - Radio Incluyí Anulados
   - Checkboxes Empresas
   - Botón Ejecutar
   - Tabla resultados
   - Botón Exportar resultados

4. Reemplazar en `motores/padron.py` los `page.locator()` con selectores verificados

### Fase 1: Prueba local 1 tenant
```bash
cd ShelfMind-RPA
python runner.py padron
# Logs → stdout
# Debe generar archivos en /opt/shelfmind/rpa/downloads/padron_tabaco_YYYYMMDD_HHMMSS.xlsx
```

### Fase 2: Verificar backend
```bash
# Check endpoint
curl -X POST http://localhost:8000/api/v1/sync/erp-padrón \
  -H "X-Api-Key: shelfy-clave-2025" \
  -F "id_distribuidor=3" \
  -F "file=@padron_tabaco_20260427_120000.xlsx"
# Debe retornar: {"status": "accepted", ...}
# Check logs de API: debe procesar en BackgroundTask
```

### Fase 3: Todos los 5 tenants
```bash
python runner.py padron
# Logs mostrar 5 ciclos (ok, error, sin_cambios)
# Si alguno falla: revisar screenshot en logs/errors/
```

### Fase 4: Integración con scheduler
```bash
# En `core/lifespan.py`, agregar cron job
# 04:00 y 14:00 hora Argentina
scheduler.add_job(
    lambda: asyncio.run(padron_run()),
    CronTrigger(hour="4,14", minute="0", timezone=AR_TZ),
)
```

---

## Errores esperados y soluciones

| Error | Causa | Solución |
|---|---|---|
| `Popup de actualización bloquea todos los clicks` | Consolido puede tener overlay | `_cerrar_popup_actualizacion()` — mantener aunque sea noop si no existe |
| `Timeout esperando tabla (60s)` | Consolido lento o query pesada | Aumentar TIMEOUT_MS a 120s, o seleccionar solo 1 empresa |
| `Descarga interceptada pero archivo vacío` | Selector botón "Exportar" incorrecto | Verificar con DevTools que el selector sea exacto |
| `Hash duplicado → skip` | Mismo padrón 2 veces en mismo día | Normal — log muestra "sin_cambios += 1" |
| `API respondió 403` | API Key incorrecto o expirado | Verificar `SHELFY_API_KEY` en Vault o env |
| `Credenciales no encontradas en Vault` | Secreto no existe | Crear en Supabase: `consolidot_TENANT_usuario`, `_password` |

---

## Estructura del código — Detalles

### Funciones principales en `motores/padron.py`

```
run()
    ├── async_playwright() context
    ├── browser.launch(headless=HEADLESS)
    ├── for tenant in TENANTS:
    │   └── _procesar_tenant(browser, tenant)
    │       ├── page.new_context()
    │       ├── _navegar_y_login()
    │       ├── _seleccionar_reporte_padron()
    │       ├── _configurar_parametros()
    │       ├── _ejecutar_reporte()
    │       ├── _descargar_excel() → Path | None
    │       ├── Hash Guard: es_duplicado() / guardar_hash()
    │       ├── await subir_padron() → bool
    │       └── return {ok, errores, sin_cambios}
    ├── browser.close()
    └── return resumen_total
```

### Integraciones externas

- **Playwright**: Automatización navegador (`async_playwright`, `page`, `browser`)
- **Supabase Vault**: Lectura de credenciales (`lib/vault_client.get_secret()`)
- **Hash Guard**: Deduplicación (`lib/hash_guard.es_duplicado()`, `guardar_hash()`)
- **API HTTP**: Upload (`httpx.AsyncClient`, `AsyncClient.post()`)
- **Logger**: `lib/logger.get_logger("PADRON")`

---

## Próximos pasos de implementación

1. **[CRÍTICO]** Capturar selectores CSS exactos con DevTools Inspector
2. Crear secretos en Supabase Vault para todos los tenants
3. Confirmar IDEMPRESA para aloma, liver, real, extra en Consolido
4. Prueba local fase 0-4 (arriba)
5. Integración con scheduler APScheduler en `core/lifespan.py`
6. Monitoreo: agregar alertas si 3+ tenants fallan

---

## Anexo: Verificación de Consolido en vivo (27/04/2026)

**Sesión capturada**:
- Distribuidor: Tabaco & Hnos S.R.L.
- IDEMPRESA: 3154 ✅
- Parámetros: Incluyí Anulados = NO, Empresas = 3154
- Resultado: 25,816 registros
- Columnas: IDEMPRESA, DSEMPRESA, IDSUCUR (2, 3), DSSUCUR, IDFUERZAVENTAS, DESFUERZAVENTAS, IDCLIENTEINTERNO, IDCLIENTE, NOMCLI, FANTACLI, [+FEC...]
- Descarga: resultados_Reporte.PadronDeClientes-26.xlsx (exitosa)

**Observaciones**:
- IDSUCUR es numérico, no texto
- Reporte ejecutado con 3 empresas falló por timeout → reducir a 1 empresa per ejecución
- No hay popup de actualización como en CHESS (Consolido es más limpio)
- Botón "Exportar resultados" es el trigger de descarga (no "Descargar")

---

## Control de versiones

| Versión | Fecha | Cambios |
|---|---|---|
| 1.0 | 27/04/2026 | Implementación inicial; selectores CSS pendiente |

