# Validación del Motor Padrón — Checklist Exacto

**Versión**: Arreglada para descargas robustas  
**Selector crítico**: `#button-exportar-administradorDeProcesos`  
**Estrategia**: ID exacto → wait/retry → DOM debug → reintentar

---

## 🚀 Cómo correr en debug rápido (RECOMENDADO)

```bash
cd ShelfMind-RPA

# Solo Tabaco (evita correr todos los 5 tenants)
PADRON_DEBUG_TENANT='tabaco' \
CONSOLIDO_USUARIO='RPiaggio' \
CONSOLIDO_PASSWORD='Ulises2025.' \
python3 runner.py padron
```

---

## ✅ Checklist de Validación

Cuando ejecutes con `PADRON_DEBUG_TENANT=tabaco`, los logs deben mostrar:

### **1. Login**
```
✅ Navegando a https://consolido.nextbyn.com
✅ Login exitoso — RPiaggio
✅ Popup de actualización cerrado (si aparece)
```

### **2. Reporteador**
```
✅ Proceso: Padrón de clientes seleccionado
✅ Parámetro 'Incluyí Anulados' = NO
✅ Empresas: (3154) Tabaco & Hnos S.R.L. seleccionada
✅ Botón Ejecutar clickeado
```

### **3. Ejecución**
```
✅ Botón Ejecutar clickeado, esperando resultados...
✅ Tabla de resultados cargada (ag-root visible)
```

### **4. DESCARGA (CRÍTICO)**
```
✅ Intento 1/3: esperando botón #button-exportar-administradorDeProcesos...
✅ Selector exportación elegido: #button-exportar-administradorDeProcesos
✅ Botón clickeado, esperando descarga...
✅ Excel descargado: padron_tabaco_YYYYMMDD_HHMMSS.xlsx
```

### **5. Upload y Hash**
```
✅ Verificando con Hash Guard...
✅ Padrón procesado exitosamente
  (o "sin cambios" si el hash ya existe)
```

---

## ❌ Si falla en descargar

**Síntoma**: `⚠️ Intento X falló: TimeoutError`

**Qué hace el motor automáticamente**:
1. Loggea la URL actual
2. Loggea snippet HTML de `.box-botones-grilla` (primeros 150 chars)
3. Llama a `_resolver_pantalla_continuar()` (busca botones "Continuar")
4. Espera 2s y reintenta (máx 3 intentos)

**Si aún falla después de 3 intentos**:
- El selector `#button-exportar-administradorDeProcesos` quizás no existe en ese estado DOM
- **Acción**: Abrir DevTools en Consolido post-Ejecutar, inspeccionar el botón descarga real y confirmar ID exacto

---

## 📝 Variables de ambiente soportadas

```bash
# Para debug
PADRON_DEBUG_TENANT='tabaco'      # Solo ejecuta 1 tenant (no todos 5)

# Credenciales Consolido (si no están en Vault)
CONSOLIDO_USUARIO='RPiaggio'
CONSOLIDO_PASSWORD='Ulises2025.'

# RPA headless
RPA_HEADLESS=false                # Ver navegador (default: true)

# API backend
API_URL=http://localhost:8000     # Override URL backend
SHELFY_API_KEY='...'              # Override API key
```

---

## 🎯 Pasos recomendados

### **Paso 1: Validar selector exacto en Consolido (si falla)**
```
1. Abrir Consolido en navegador
2. Ejecutar Padrón de clientes → Tabaco → Ejecutar
3. F12 → Inspector → buscar "Exportar" en HTML
4. Verificar ID exacto del botón
5. Si NO es #button-exportar-administradorDeProcesos:
   - Actualizar en motores/padron.py línea ~554
```

### **Paso 2: Test local con debug**
```bash
PADRON_DEBUG_TENANT='tabaco' \
CONSOLIDO_USUARIO='RPiaggio' \
CONSOLIDO_PASSWORD='Ulises2025.' \
python3 runner.py padron 2>&1 | tee padron_debug.log
```

### **Paso 3: Validar checklist arriba**
```
Grep en logs:
✅ Selector exportación elegido: #button-exportar-administradorDeProcesos
✅ Excel descargado: padron_tabaco_*.xlsx
```

### **Paso 4: Test backend**
```bash
# Terminal 1
cd CenterMind
uvicorn api:app --reload

# Terminal 2
curl -X POST http://localhost:8000/api/v1/sync/erp-padrón \
  -H "X-Api-Key: shelfy-clave-2025" \
  -F "id_distribuidor=3" \
  -F "file=@padron_tabaco_20260427_120000.xlsx"

# Esperado: {"status": "accepted", "message": "...", "timestamp": "..."}
```

### **Paso 5: Correr todos los tenants**
```bash
# Quitar PADRON_DEBUG_TENANT para correr los 5
CONSOLIDO_USUARIO='RPiaggio' \
CONSOLIDO_PASSWORD='Ulises2025.' \
python3 runner.py padron
```

---

## 🔧 Archivos críticos (qué NO tocar)

```
✅ motores/padron.py          → ARREGLADO: selector exacto + retry
✅ lib/api_client.py          → OK
✅ routers/erp.py             → OK
❌ runner.py                  → NO TOCAR (ya funciona)
❌ _configurar_parametros()   → NO TOCAR (ya funciona)
❌ login, navegación, select proceso → NO TOCAR (ya funciona)
```

---

## 📊 Estado actual (27/04/2026)

| Función | Estado | Notas |
|---|---|---|
| Login | ✅ Funciona | RPiaggio/Ulises2025. |
| Navegación Reporteador | ✅ Funciona | Consolido → Padrón |
| Configuración parámetros | ✅ Funciona | Incuir Anulados + Empresas |
| Ejecución reporte | ✅ Funciona | Ejecutar → tabla visible |
| **Descarga Excel** | 🔧 **ARREGLADA** | ID exacto + retry logic |
| Upload a API | ✅ Funciona | POST /api/v1/sync/erp-padrón |

---

## 📌 Recordatorio: Tenants

```
✅ tabaco     → 3154 (id_dist=3)
✅ liver      → 3534 (id_dist=5)
✅ extra (GyG)→ 3562 (id_dist=6)
✅ aloma      → 3442 (id_dist=4)
✅ real       → 5597 (id_dist=2) — con split franquiciados
```

---

## 🎓 Qué aprendimos

1. **Selectores exactos > heurísticas**: El ID `#button-exportar-administradorDeProcesos` es mucho más confiable que buscar por texto/icono suelto.

2. **Wait + retry es robusto**: 3 intentos con wait de 2s entre reintentos maneja timing intermitentes.

3. **DOM debug logging**: Si falla, loggeamos snippet HTML para diag rápido sin DevTools.

4. **No romper lo que funciona**: Login, navegación y select de parámetros **YA FUNCIONAN** — solo cambiar descarga.

---

**Próximo**: Ejecutar con `PADRON_DEBUG_TENANT=tabaco` y validar checklist arriba ✅

