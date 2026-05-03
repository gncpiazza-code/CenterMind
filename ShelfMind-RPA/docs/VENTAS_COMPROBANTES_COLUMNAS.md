# CHESS — Reportes Comprobantes de Ventas (Resumido vs Detallado)

Referencias verificadas contra exportación Aloma (`ReporteComprobantesResumen` / `ReporteComprobantesDetallado`), hoja **`Datos`**, **fila 1 = encabezados**.

## Convención Shelfy — siempre código + descripción

En parsers, KPIs y API: **llevar pareja la columna numérica/código y la de texto**, aunque para agrupación se use sobre todo el código. La descripción sirve para **normalizar etiquetas**, **auditoría**, **mensajes UI** y reglas cuando el código cambia entre tenants.

Ejemplos de pares (resumen/detalle donde aplica):

| Dimension | Código / ID | Descripción texto |
|-----------|-------------|-------------------|
| Empresa | `Empresa` (A) | `Descripcion Empresa` (B) |
| Tipo comp. | `Comprobante` (C) | `Descripcion Comprobante` (D) |
| Vendedor | `Vendedor` (AE) | `Descripcion Vendedor` (AF) |
| Forma pago | `Condicion de Pago` (AM) | `Descripcion Condicion de pago` (AN) |
| Cliente | `Cliente` (BC) | `Razon Social` (BD) |
| Canal | `Canal MKT` (BW) | `Descripcion Canal MKT` (BX) |
| Subcanal | `Subcanal` (BY) | `Descripcion Subcanal MKT` (BZ) |
| Artículo (detalle) | `Codigo de Articulo` (CB) | `Descripcion de Articulo` (CC) |

Luego se **normalizan** (mayúsculas, trim) o se **excluyen** filas según reglas de negocio (anulados, tipos internos, etc.).

## Resumido (cabecera por comprobante)

Una fila = **un comprobante** (no hay artículo ni bultos). Importe principal: **`Subtotal Final`**.

| Col Excel | Nombre en archivo | Uso / notas |
|-----------|-------------------|-------------|
| B | Descripcion Empresa | Tenant / empresa (texto) |
| V | **Emisor** | Emisor del comprobante (**no** usar B; antes se confundían) |
| C | Comprobante | Código (ej. FCVTA, RECCC) |
| D | Descripcion Comprobante | Texto tipo (FACTURA, RECIBO…) |
| E | Letra | Letra del comprobante |
| F | Serie \\ Punto de venta | Serie / PV |
| G | Numero | Número del comprobante |
| Q–R | Motivo / Descripcion Motivo rechazo | Rechazo / devolución cabecera |
| S | Fecha Comprobante | Fecha |
| U | Fecha Anulación | Si informada, comprobante anulado |
| P | Anulado | Filtrar SI/NO según reglas |
| AE | Vendedor | ID vendedor |
| AF | Descripcion Vendedor | Nombre vendedor cabecera |
| AM | Condicion de Pago | Código forma de pago |
| AN | Descripcion Condicion de pago | Ej. **CONTADO**, **CTA CTE** |
| AR | Origen | Caja / Vendo |
| BC | Cliente | ID cliente |
| BD | Razon Social | Razón social |
| BW | Canal MKT | Código canal (par con BX) |
| BX | Descripcion Canal MKT | Texto canal |
| BY | Subcanal | Código subcanal (par con BZ) |
| BZ | Descripcion Subcanal MKT | Texto subcanal |
| CI | **Subtotal Final** | Total comprobante |

**Clave recomendada para enlazar con detallado:**  
`Empresa` + `Comprobante` + `Letra` (+ `Serie \\ Punto de venta` como string) + `Numero`.

---

## Detallado (líneas de ítem)

Cabecera **A–BZ** alineada al resumido (repetida por fila). Desde **CA** en adelante = **línea de artículo**.

| Col Excel | Nombre en archivo | Uso / notas |
|-----------|-------------------|-------------|
| A | Empresa | Código numérico empresa |
| B | Descripcion Empresa | Texto empresa (**no** es lo mismo que solo “empresa” sin A) |
| CB | **Codigo de Articulo** | Código ítem (**CV** = Contable, no confundir) |
| CC | Descripcion de Articulo | Texto ítem |
| DG | Bultos Cerrados | |
| DH | Unidades | |
| DI | Bultos con Cargo | |
| DJ | Bultos sin Cargo | |
| DK | **Bultos Total** | Métrica principal bultos línea |
| DP | UM Total | Unidades de medida total (alternativa) |
| ED | **Subtotal Final** | Importe línea |
| DT–EC | Subtotales brutos, IVA, percepciones… | Desglose fiscal línea |
| EE–EL | Trade Spend | Ajustes comerciales |

Motivo rechazo en cabecera línea: mismas columnas **Q/R** que en resumido.

---

## Definiciones KPI (script `scripts/analizar_ventas_comprobantes.py`)

- **Recaudación del día (caja / efectivo “ya cobrado”)**: en **resumido**, suma `Subtotal Final` de **recibos** más **facturas de venta (`FCVTA`) en condición CONTADO** (campo `Descripcion Condicion de pago`), excluyendo **Anulado = SI**.
- **Facturado que queda en cuenta corriente**: **resumido**, `FCVTA` con forma de pago **`CTA CTE`** (por texto en `Descripcion Condicion de pago`), sin anulados.

Los agregados por **vendedor / artículo / cliente** en $$ y bultos salen del **detallado**, normalmente filtrando **`Comprobante == FCVTA`** por línea (opción en script para incluir NC como negativo).

Ajustar listas de códigos (`RECCC`, etc.) si CHESS cambia nomenclatura por tenant.

## Script de análisis

`scripts/analizar_ventas_comprobantes.py` — lee resumen + detallado y emite JSON con:

- KPIs resumen (recaudación CONTADO + recibos; factura `FCVTA` cuenta corriente).
- Tablas desde detalle (siempre **código + texto** donde exista par): **vendedor**, **artículo**, **cliente**, **canal**, **subcanal** (`$$` / bultos; solo `FCVTA` por defecto).
- Opciones: `--todas-lineas`, `--incluir-nc`, `--json ruta`.

Filas sin vendedor (`Vendedor` 0 / `Descripcion Vendedor` vacío) suelen corresponder a comprobantes de administración sin reparto físico típico.

## Persistencia Supabase

Migración Postgres: `CenterMind/supabase/migrations/20260430120000_ventas_comprobantes_analytics.sql`

- `ventas_comprobantes_analytics_runs` — KPIs + JSON crudo (`raw_financiero`, `por_comprobante_tipo`, `validacion_fcvtas`).
- `ventas_comprobantes_agg_*` — una fila por dimensión con **codigo + descripcion**: vendedor, artículo, cliente, canal, subcanal (`total_dolares`, `total_bultos`).
- Multitenant: columna **`id_distribuidor`** en todas las tablas (no hay tablas separadas por tenant).

API Shelfy tras aplicar migración:

`POST /api/motor/ventas-analytics` con JSON `VentasComprobantesAnalyticsIn`: `tenant_id`, `fecha_desde`/`fecha_hasta` opcional, `payload` = objeto completo del script de análisis (incluye `financiero_resumen`, `lineas_detallado`, `validacion_fcvtas`, `archivos`).

Implementación: `CenterMind/services/ventas_analytics_service.py`.
