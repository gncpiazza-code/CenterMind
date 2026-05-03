# Selectores CSS Exactos — Motor Padrón (Consolido)

**Capturado en vivo**: 27/04/2026 con DevTools Inspector + JavaScript  
**Usuario**: RPiaggio (Real Tabacalera)  
**Navegador**: Google Chrome + DevTools  

---

## 🔐 LOGIN (Pre-filled, pero la estructura es):

```html
<!-- Usuario -->
<input type="text" class="p-tree-filter p-inputtext p-component">

<!-- Contraseña -->
<input type="password" class="..." placeholder="...">

<!-- Botón Iniciar Sesión -->
<button class="btn btn-primary">INICIAR SESIÓN</button>
```

---

## 📋 REPORTEADOR GENÉRICO — Selectores CSS Exactos

### **1. Proceso: Dropdown "Padrón de clientes"**

```css
/* Tag: SELECT */
select.ng-valid.ng-dirty.ng-touched

/* O más simple: */
select
```

**Atributos**:
- Tag: `SELECT`
- Class: `ng-valid ng-dirty ng-touched`
- ID: (vacío)

**Selector Playwright**:
```python
page.locator('select')  # O
page.locator('select.ng-valid')
```

---

### **2. Parámetro 1: "Incuir Anulados (1-SI / 0-NO)"**

```css
/* Dropdown (SELECT) */
select.ng-valid.ng-dirty.ng-touched

/* Valor actual: "NO" */
```

**Selector Playwright**:
```python
campo_anulados = page.locator('select').first
await campo_anulados.select_option('NO')  # Si es <option value="NO">
```

---

### **3. Parámetro 2: "Empresas"**

```css
/* Dropdown con empresas */
select  /* Mismo elemento que "Incuir Anulados" pero segundo */

/* O buscar por atributo: */
select[data-testid="..."]  /* TBD - no capturado */
```

**Valor actual**: `(3154) TABACO & HNOS S.R.L.`

**Empresas disponibles en Consolido**:
```
(3457) LM DISTRIBUCIONES
(3534) Liver SRL                      ← id_dist=5
(3536) Ippolibaz SAS
(3559) SILVINA RIBERO
(3561) CENA HUGO MARIO
(3562) GyG (Gomez Marcos Ariel)       ← id_dist=6 (extra)
(3586) TABACOS Y DERIVADOS SA
(3635) Cadyb
(5597) Franquiciados Real Tabacalera
```

**IDEMPRESA Confirmados**:
| Distribuidor | IDEMPRESA | id_dist | Status |
|---|---|---|---|
| Tabaco | 3154 | 3 | ✅ Verificado |
| Liver | 3534 | 5 | ✅ Visto en lista |
| GyG | 3562 | 6 | ✅ Visto en lista |
| Aloma | ? | 4 | ❌ Buscar en Consolido |
| Real | ? | 2 | ❌ Buscar en Consolido |

**Selector Playwright**:
```python
campo_empresas = page.locator('select').nth(1)  # Segundo select
await campo_empresas.select_option('(3154) TABACO & HNOS')
```

---

### **4. Botón "Ejecutar"**

```css
/* Exacto capturado: */
button#button-procesar.btn.btn-primary.botonProcesar

/* O más simple: */
button.botonProcesar
button#button-procesar
```

**Atributos**:
- Tag: `BUTTON`
- Text: `"Ejecutar"`
- Class: `btn btn-primary botonProcesar ng-star-inserted`
- ID: `button-procesar` ✅
- Type: `button`

**Selector Playwright**:
```python
ejecutar_btn = page.locator('button#button-procesar')
# O:
ejecutar_btn = page.locator('button.botonProcesar')
await ejecutar_btn.click()
```

---

## 📊 RESULTADOS — Tabla y Botones de Exportación

### **Estructura de la tabla**:
```html
<!-- Tabla con datos (ag-grid?) -->
<div class="ag-root ag-root-selector ag-ltr ag-layout-normal">
  <!-- 25,816 registros -->
</div>

<!-- Columnas exactas observadas: -->
IDEMPRESA | DSEMPRESA | IDSUCUR | DSSUCUR | IDFUERZAVENTAS | DESFUERZAVENTAS | 
IDCLIENTEINTERNO | IDCLIENTE | NOMCLI | FANTACLI | FECALTA
```

### **Datos de ejemplo**:
```
3154 | TABACO & HNOS S.R.L. | 3 | SAENZ PEÑA | 1 | FUERZA DE VENTAS 1 | 
5648 | 20794 | GALBAN DANIEL | KIOSKO COMBIANA | 2024-11-06
```

### **Botones de descarga/exportación**:

Visibles en la barra superior derecha:
- 🔄 Refrescar (refresh icon)
- 📄 Descargar/Exportar (file icon) ← **ESTE**
- ➡️ Expandir (expand icon)

**Selectores encontrados**:
- `button.ag-side-button-button` (Configurar columnas)
- `button.ag-paging-button` (Paginación)
- **Botón descarga**: Búsqueda manual por SVG/icono requerida

```python
# Búsqueda alternativa: SVG con atributo data-icon="download"
download_btn = page.locator('button svg[class*="download"], button[title*="Exportar"]')
# O por aria-label:
download_btn = page.locator('button[aria-label*="Descargar"]')
```

---

## 🔧 Resumen de Selectores para `motores/padron.py`

### **Login** (si necesita automatizarse):
```python
# Usuario
usuario_input = page.locator('input[type="text"]').first
# Contraseña
password_input = page.locator('input[type="password"]')
# Botón
login_btn = page.locator('button:has-text("INICIAR SESIÓN")')
```

### **Reporteador**:
```python
# Parámetro 1: Incuir Anulados
anulados_select = page.locator('select').first
await anulados_select.select_option('NO')

# Parámetro 2: Empresas
empresas_select = page.locator('select').nth(1)
await empresas_select.select_option('(3154) TABACO & HNOS S.R.L.')

# Botón Ejecutar
ejecutar_btn = page.locator('button#button-procesar')
# O:
ejecutar_btn = page.locator('button.botonProcesar')
await ejecutar_btn.click()
```

### **Descarga**:
```python
# Tabla
tabla = page.locator('.ag-root, [role="grid"]')
await tabla.wait_for(state="visible", timeout=TIMEOUT_MS)

# Botón descarga (PENDIENTE: verificar selector exacto)
# Opciones:
download_btn = page.locator('button[aria-label*="Descargar"]')
# O buscar por posición:
download_btn = page.locator('button').nth(N)  # Contar manualmente
```

---

## 📝 Notas Importantes

1. **Selectores `<select>`**: Consolido usa elementos HTML nativos `<select>`, NO componentes PrimeNG (p-dropdown).
   
2. **Nombres de empresas**: Los valores en los `<option>` incluyen el IDEMPRESA entre paréntesis:
   ```html
   <option value="(3154) TABACO & HNOS S.R.L.">(3154) TABACO & HNOS S.R.L.</option>
   ```

3. **Tabla de resultados**: Usa `ag-grid` (no visibles los selectores internos en DevTools).

4. **Botón Ejecutar**: El ID exacto es `button-procesar` — use este para máxima confiabilidad.

5. **Descarga**: 
   - El botón de descarga está en la barra superior derecha (icono 📄)
   - Selector exacto: **PENDIENTE DE CAPTURAR** — requiere inspeccionar el SVG/icono directamente en DevTools

6. **Credenciales pre-llenadas**: En este usuario (RPiaggio) estaban auto-llenadas. El flujo de login real puede variar.

---

## 🎯 Próximos pasos

1. **Capturar selector exacto del botón descarga**: 
   - Abrir DevTools Inspector (F12)
   - Right-click en el botón 📄 descarga
   - "Inspect Element"
   - Copiar el HTML y extraer clase/id exacto

2. **Validar selectores en Playwright**:
   ```bash
   python -c "
   from playwright.sync_api import sync_playwright
   
   with sync_playwright() as p:
       browser = p.chromium.launch()
       page = browser.new_page()
       page.goto('https://consolido.nextbyn.com')
       # Probar cada locator
       page.locator('select').first.wait_for()
       print('Selectors OK')
   "
   ```

3. **Testing completo**: Ejecutar motor en todos los 5 tenants

---

## Mapeo Final: Consolido → Shelfy

| Consolido | Shelfy | Tabla Destino | Verificado |
|---|---|---|---|
| IDEMPRESA | id_distribuidor | (groupby) | ✅ |
| IDEMPRESA `3154` | `id_dist=3` | Tabaco | ✅ |
| IDSUCUR (numérico: 3) | id_sucursal_erp | sucursales_v2 | ✅ |
| DSSUCUR | nombre_erp | sucursales_v2 | ✅ |
| IDFUERZAVENTAS | id_vendedor_erp | vendedores_v2 | ✅ |
| DESFUERZAVENTAS | nombre_erp | vendedores_v2 | ✅ |
| IDCLIENTE | id_cliente_erp | clientes_pdv_v2 | ✅ |
| NOMCLI/FANTACLI | nombre_cliente | clientes_pdv_v2 | ✅ |
| FECALTA | fecha_alta | clientes_pdv_v2 | ✅ |

---

**Documento generado**: 27/04/2026  
**Fuente**: Captura en vivo con DevTools Inspector + JavaScript  
**Validación**: Pendiente de Playwright testing  

