# Motor Padrón — Checklist de Implementación

**Generado**: 27/04/2026  
**Responsable**: Implementación Automatizada + RPA  

---

## ✅ Implementado

### Código RPA
- [x] `ShelfMind-RPA/motores/padron.py` — Motor Playwright completo (470 líneas)
  - 6 funciones de pasos automatizados
  - Manejo de errores y screenshots
  - Hash guard integrado
  - Loop multi-tenant

- [x] `ShelfMind-RPA/lib/api_client.py` — Función `subir_padron()` async
  - Lectura de archivo del disco
  - Upload HTTP async con httpx.AsyncClient
  - Headers de autenticación (X-Api-Key)
  - Logging de respuesta

- [x] `ShelfMind-RPA/runner.py` — Integración con runner
  - Opción `padron` ya soportada en main()
  - Secuencia `todos` incluye padrón como primer motor
  - Comentarios actualizados

### Backend FastAPI
- [x] `CenterMind/routers/erp.py` — Endpoint `/api/v1/sync/erp-padrón`
  - Método POST
  - Autenticación X-Api-Key (verify_key)
  - Validación .xlsx/.xls
  - BackgroundTask a padron_service.ingest_for_dist()
  - Respuesta JSON con timestamp

### Documentación
- [x] `ShelfMind-RPA/MOTOR_PADRON_SPEC.md` — Especificación completa (410 líneas)
  - Flujo macro y diagrama
  - Estructura de archivos
  - Mapa de columnas Excel → Shelfy
  - Configuración tenants
  - Paso a paso en vivo
  - Errores esperados
  - Próximos pasos

- [x] Checklist de implementación (este archivo)

---

## ⚠️ Pendiente: SELECTORES CSS

**Estado**: Documentados como variantes posibles, **necesitan verificación exacta con DevTools**

### Selectores que requieren captura en DevTools:
```
1. Input usuario  → page.locator('input[type="text"]').first
2. Input password → page.locator('input[type="password"]')
3. Botón login    → page.locator('button:has-text("...")')
4. Tab "Informes" → page.locator('button|a[role="tab"]:has-text("Informes")')
5. Dropdown "Proceso"        → page.locator('select|[role="combobox"]...')
6. Opción "Padrón"           → page.locator('option|mat-option:has-text("Padrón")')
7. Radio "Incluyí Anulados"  → page.locator('input[type="radio"]...')
8. Checkbox Empresas         → page.locator('input[type="checkbox"]...')
9. Botón "Ejecutar"          → page.locator('button:has-text("Ejecutar|Procesar")')
10. Tabla resultados         → page.locator('table|[role="grid"]...')
11. Botón "Exportar"         → page.locator('button:has-text("Exportar|Descargar")')
```

### Próximo paso (CRÍTICO):
1. Abrir Consolido en navegador real
2. Post-login, abrir DevTools Inspector (`F12` o `Cmd+Option+I`)
3. Inspeccionar cada elemento
4. Reemplazar `page.locator()` en `motores/padron.py` con selectores exactos
5. Prueba local antes de deployar

---

## ⚠️ Pendiente: VAULT Y CONFIGURACIÓN

### Secretos a crear en Supabase Vault
```
Nombre                        Valor               Tenant
consolido_tabaco_usuario      {usuario ERP}       3 (Tabaco)
consolido_tabaco_password     {password}          3
consolido_aloma_usuario       {usuario}           4 (Aloma)
consolido_aloma_password      {password}          4
consolido_liver_usuario       {usuario}           5 (Liver)
consolido_liver_password      {password}          5
consolido_real_usuario        {usuario}           2 (Real)
consolido_real_password       {password}          2
consolido_extra_usuario       {usuario}           6 (GyG)
consolido_extra_password      {password}          6
```

### IDEMPRESA a confirmar
```
Tabaco     = 3154  ✅ (verificado en vivo)
Aloma      = ?     ❌ (ejecutar reporte en Consolido)
Liver      = ?     ❌
Real       = ?     ❌
GyG (extra)= ?     ❌ (pendiente credenciales)
```

---

## ⚠️ Pendiente: SCHEDULER APScheduler

### Ubicación
`CenterMind/core/lifespan.py` → en el dict `scheduler_jobs` o en la función `lifespan()`

### Job a agregar
```python
from motores.padron import run as padron_run

scheduler.add_job(
    lambda: asyncio.run(padron_run()),
    CronTrigger(hour="4,14", minute="0", timezone=AR_TZ),
    name="padron_daily",
    replace_existing=True,
)
```

**Horarios**: 04:00 y 14:00 (hora Argentina)

---

## Flujo de testing recomendado

### Fase 0: Selectores CSS (1-2 horas)
```bash
# En navegador Consolido real
# F12 → Inspector → capturar selectores
# Editar motores/padron.py línea-por-línea
# python3 -m py_compile motores/padron.py
```

### Fase 1: Prueba local 1 tenant (5-10 min)
```bash
cd ShelfMind-RPA
export RPA_HEADLESS=false   # Ver navegador en vivo
export API_URL=http://localhost:8000
python runner.py padron
# Debe generar:
# - logs en stdout
# - archivo en downloads/padron_tabaco_YYYYMMDD_HHMMSS.xlsx
# - si hay error: screenshot en logs/errors/
```

### Fase 2: Verificar endpoint backend (1 min)
```bash
# Terminal 2: iniciar backend
cd CenterMind
uvicorn api:app --reload

# Terminal 3: test endpoint
curl -v -X POST http://localhost:8000/api/v1/sync/erp-padrón \
  -H "X-Api-Key: shelfy-clave-2025" \
  -F "id_distribuidor=3" \
  -F "file=@padron_tabaco_YYYYMMDD_HHMMSS.xlsx"
# Respuesta: {"status": "accepted", "message": "...", "timestamp": "..."}
```

### Fase 3: Todos los 5 tenants (10-15 min)
```bash
python runner.py padron
# Logs: 5 ciclos (tabaco, aloma, liver, real, extra)
# Resumen: {ok: N, errores: M, sin_cambios: L}
# Si alguno falla: check logs/errors/error_TENANT_...png
```

### Fase 4: Integración scheduler (2 min)
```bash
# Editar core/lifespan.py
# Test: trigger manualmente o esperar cron 04:00
```

---

## Validaciones post-deploy

### Dashboard o logs
```bash
# Check que cada 04:00 y 14:00 se ejecute
tail -f logs/padron.log
# Debe mostrar: "Procesando tenant: ..." → "Motor PADRON finalizado"
```

### Base de datos
```sql
-- Verificar que las sucursales/vendedores/clientes se sincronizaron
SELECT COUNT(*) FROM sucursales_v2 WHERE id_distribuidor = 3;
SELECT COUNT(*) FROM clientes_pdv_v2 WHERE id_distribuidor = 3;
-- Comparar con CSV del Excel descargado manualmente
```

### Alertas recomendadas
- Si 3+ tenants fallan en una ejecución → Alert
- Si no hay descarga en 24h → Alert
- Si tamaño Excel < 5MB (padrón siempre es grande) → Alert

---

## Archivos entregados (en `/sessions/.../outputs/`)

1. `motores/padron.py` — Motor RPA (copiado a Desktop/CenterMind)
2. `lib/api_client.py` (actualizado) — Función upload async
3. `routers/erp.py` (actualizado) — Endpoint POST /api/v1/sync/erp-padrón
4. `runner.py` (actualizado) — Comentarios corregidos
5. `MOTOR_PADRON_SPEC.md` — Especificación técnica completa
6. `IMPLEMENTATION_CHECKLIST.md` — Este archivo

---

## Resumen de cambios por archivo

### `motores/padron.py` (NUEVO)
- **+470 líneas**
- Async Playwright
- 6 pasos automatizados
- Hash guard
- Multi-tenant loop

### `lib/api_client.py` (MODIFICADO)
- **+40 líneas**
- Nueva función `async def subir_padron()`
- httpx.AsyncClient
- Upload form multipart

### `routers/erp.py` (MODIFICADO)
- **+30 líneas**
- Nuevo endpoint `/api/v1/sync/erp-padrón`
- POST, autenticación, BackgroundTask
- Integración con padron_service

### `runner.py` (MODIFICADO)
- **+2 líneas**
- Comentario actualizado (Consolido/Nextbyn)
- Resto ya funcional

---

## Control de versiones

| Archivo | Versión | Fecha | Estado |
|---|---|---|---|
| motores/padron.py | 1.0 | 27/04/2026 | Implementado ✅ |
| lib/api_client.py | 1.0 | 27/04/2026 | Implementado ✅ |
| routers/erp.py | 1.0 | 27/04/2026 | Implementado ✅ |
| runner.py | 1.0 | 27/04/2026 | Actualizado ✅ |
| MOTOR_PADRON_SPEC.md | 1.0 | 27/04/2026 | Documentado ✅ |

---

## Notas importantes

1. **Selectores CSS**: Son variantes posibles. Requieren verificación exacta con DevTools en navegador real.
2. **Credenciales**: Asumir que se crearán en Supabase Vault antes de deploy.
3. **IDEMPRESA**: Los valores con "?" deben confirmarse ejecutando reporte en Consolido.
4. **Headless mode**: Por defecto TRUE. Cambiar a FALSE (`RPA_HEADLESS=false`) para debugging.
5. **Timeouts**: 60s para Consolido. Si falla, aumentar a 120s.

---

**Documentación generada por**: Claude en Cowork Mode  
**Próximo revisor**: Ingeniero backend para selectores CSS + testing  

