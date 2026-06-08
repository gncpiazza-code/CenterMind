# Tabaco & Hnos — Scripts de Reportería
## Cómo usar estos scripts mes a mes

---

### Requisitos

```
pip install pandas openpyxl reportlab
```

Python 3.8 o superior.

---

### Estructura de carpetas

```
tu_carpeta/
├── 1_procesar_datos.py
├── 2_generar_pdf.py
├── README.md
├── input/              ← poner los xlsx aquí
│   ├── reporte_4sucursales.xlsx
│   └── reporte_corrientes.xlsx
└── output/             ← se crea solo
    ├── datos_procesados.pkl
    └── informe_tabaco.pdf
```

---

### Paso a paso

**1. Poner los archivos de input en la carpeta `input/`**

Cada mes exportar los reportes de comprobantes detallados del sistema.
Pueden ser uno o varios archivos — el script los une automáticamente.

**2. Configurar `1_procesar_datos.py`**

Editar la sección CONFIG al inicio del archivo:

```python
ARCHIVOS_INPUT = [
    'input/reporte_4sucursales.xlsx',
    'input/reporte_corrientes.xlsx',
]

SUCS_ORDEN = ['RECONQUISTA', 'RESISTENCIA', 'SAENZ PEÑA', 'CORRIENTES', 'CORDOBA']
```

Si en algún mes hay reclasificaciones de lista (como el cambio de Kiosco B a Kiosco C en Córdoba):

```python
RECLASIFICACIONES = [
    {'suc': 'CORDOBA', 'desde_dia': 16, 'canal': 'MINORISTA', 'destino': 'KC'},
]
```

Si no hay reclasificaciones ese mes, dejar la lista vacía: `RECLASIFICACIONES = []`

**3. Ejecutar el script 1**

```
python 1_procesar_datos.py
```

El script imprime un resumen por sucursal. Verificar que los totales sean razonables
y que no haya SKUs no mapeados (aparecen con ⚠).

**4. Configurar `2_generar_pdf.py`**

Solo cambiar el mes:

```python
MES_LABEL = 'Abril 2026'
```

**5. Ejecutar el script 2**

```
python 2_generar_pdf.py
```

El PDF se genera en `output/informe_tabaco.pdf`.

---

### Si aparecen nuevos artículos

El script 1 imprime una advertencia cuando encuentra artículos no mapeados:
```
⚠ SKUs no mapeados (irán a 'otros'): ['NUEVO ARTICULO XYZ']
```

Para agregarlos, editar el diccionario `SKU_MAP` en `1_procesar_datos.py`:

```python
SKU_MAP = {
    ...
    'NUEVO ARTICULO': 'L. Red',   # agregar aquí
    ...
}
```

La clave es un fragmento del nombre del artículo (en mayúsculas),
el valor es el SKU corto que aparecerá en el informe.

---

### Si aparece una sucursal nueva

Agregar a `SUCS_ORDEN` en el script 1 y a `COLORES_SUC` en el script 2:

```python
# En 1_procesar_datos.py
SUCS_ORDEN = ['RECONQUISTA', 'RESISTENCIA', 'SAENZ PEÑA', 'CORRIENTES', 'CORDOBA', 'NUEVA SUCURSAL']

# En 2_generar_pdf.py
COLORES_SUC = {
    ...
    'NUEVA SUCURSAL': '#2C5F2E',  # elegir un color hex
}
```

---

### Notas importantes

- Los **Supervisores** se clasifican automáticamente como Sin Vendedor.
  Si aparece un nombre nuevo de supervisor que no se está clasificando bien,
  agregar su prefijo a `PREFIJOS_SIN_VENDEDOR` en el script 1.

- Las ventas con **vendedor nulo** (campo vacío) también van a Sin Vendedor.

- Los totales de Sin Vendedor **no se incluyen** en los promedios del equipo de ruta.

- El informe usa **Bultos Total** del reporte de comprobantes como unidad base.
  Verificar que el sistema siga exportando en esa columna.
