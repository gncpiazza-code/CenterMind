# 🗺️ Shelfy — Panel de Supervisión: Hoja de Ruta

> **Última actualización:** 2026-03-26
> **Stack:** FastAPI (Railway) · Next.js/React (Vercel) · Supabase (PostgreSQL)
> **Tablas activas:** `sucursales_v2`, `vendedores_v2`, `rutas_v2`, `clientes_pdv_v2`

---

## Estado General

| Fase | Nombre | Estado |
|------|--------|--------|
| 1 | Padrón de Clientes (ingesta multi-tenant) | ✅ COMPLETADA |
| 2 | Mapeo Vendedor ERP ↔ Integrante Telegram | ✅ COMPLETADA |
| 3A | Cascade Rutas de Venta (accordion animado) | ✅ COMPLETADA |
| 3B | Mapa Interactivo con capas por vendedor | ✅ COMPLETADA |
| 3B+ | Stats activos/inactivos en tarjetas vendedor | ✅ COMPLETADA |
| 3B++ | Toggle por ruta y por PDV individual | ✅ COMPLETADA |
| 3C | Apertura de roles (supervisores ven el panel) | ⏳ PENDIENTE |
| 3D | Alertas básicas (PDV inactivos, sin visita) | ⏳ PENDIENTE |
| 4A | Motor RPA: ventas por PDV | ⏳ PENDIENTE |
| 4B | Motor RPA: cuentas corrientes | ⏳ PENDIENTE |
| 4C | Schedule automático de motores | ⏳ PENDIENTE |

---

## Fase 1 ✅ — Padrón de Clientes

### Qué hace
- Descarga un archivo Excel global (todos los distribuidores en un solo `.xlsx`)
- Agrupa por columna `idempresa`, mapea a `id_distribuidor` via `distribuidores.id_empresa_erp`
- Crea/actualiza registros en `sucursales_v2`, `vendedores_v2`, `rutas_v2`, `clientes_pdv_v2`
- Captura `dia_semana` desde columnas booleanas (Lunes–Domingo)
- Captura `fecha_alta` del padrón

### Resultados reales (último run)
| Distribuidor | Clientes | Tiempo |
|---|---|---|
| Dist 2 | ~4.800 | ~8s |
| Dist 3 | ~5.200 | ~9s |
| Dist 4 | ~4.900 | ~9s |
| Dist 5 | ~4.100 | ~8s |
| Dist 6 | ~4.200 | ~9s |
| **TOTAL** | **~23.200** | **~43s** |

### Gotchas aprendidos
1. El `.in_()` de Supabase con listas de 23k IDs revienta la URL → filtrar por `dist_id + es_limbo=True` en DB y cruzar en Python
2. `UNIQUE(id_distribuidor, id_vendedor_erp)` falla si hay varios "SIN VENDEDOR" por sucursal → agregar `id_sucursal` al constraint
3. `motor_runs.estado` CHECK constraint original solo tenía `ok/error/parcial` → extender a `en_curso/ok/error/parcial/sin_ejecuciones`
4. `fecha_alta` y `dia_semana` requieren re-subir el padrón para poblar registros existentes
5. Tablas `_v2` creadas desde cero para evitar FK conflict con `exhibiciones → clientes_pdv` legacy

---

## Fase 2 ✅ — Mapeo Vendedor ERP ↔ Integrante Telegram

### Qué hace
- Panel `TabMapeoVendedores` para vincular cada `vendedores_v2.id_vendedor` con un `integrantes_grupo.id`
- Superadmin puede ver TODOS los distribuidores con selector de distribuidora
- Guarda en `integrantes_grupo.id_vendedor_v2`

---

## Fase 3 ✅ — Panel de Supervisión

### Layout actual
```
┌─────────────────────────────────────────────────────────────────────┐
│  Rutas de Venta  [Selector distribuidora]                    [↺]    │
│  N vendedores · M PDV · X% activos · Y% inactivos                  │
├───────────────────────────────┬─────────────────────────────────────┤
│                               │  SUCURSAL: [Central] [Norte] ...    │
│                               ├─────────────────────────────────────┤
│                               │  ● JUAN PÉREZ          [👁]        │
│       MAPA INTERACTIVO        │    145 PDV · 3 rutas               │
│       (CartoDB dark)          │    ████░░ 74% activos              │
│                               │    ▼ Ver rutas                      │
│  [123 PDV visibles]           │      ├─ Ruta Centro Lun [👁]       │
│                               │      │   ├─ ● Cliente A  [👁]      │
│  ● activo  ● sin actividad    │      │   └─ ● Cliente B  [👁]      │
│                               │      └─ Ruta Norte Mié [👁]        │
│                               │  ─────────────────────────────      │
│                               │  ● MARÍA GARCÍA        [👁]        │
│                               │    230 PDV · 5 rutas               │
└───────────────────────────────┴─────────────────────────────────────┘
```

### Visibilidad en 3 niveles (independientes)
```
Vendedor ON  →  carga todas las rutas + clientes, los activa todos
Vendedor OFF →  quita del mapa (datos quedan en caché)
Ruta    ON   →  activa la ruta y todos sus clientes (activa vendor si estaba OFF)
Ruta    OFF  →  quita ruta y sus clientes del mapa
PDV     ON   →  muestra ese punto en el mapa
PDV     OFF  →  oculta ese punto (sin borrar datos)

Pin aparece en mapa ↔ visibleVends ∩ visibleRutas ∩ visibleClientes
```

### Características
- **Color por vendedor**: paleta de 12 colores, asignado por índice
- **Activos**: `fecha_ultima_compra` ≤ 90 días → color del vendedor
- **Inactivos**: > 90 días o NULL → gris en mapa (radio menor, opacidad 0.25)
- **Lazy loading**: datos se cargan on-demand por nivel
- **Caché en memoria**: una vez cargado no se vuelve a pedir hasta refresh
- **Strip de color lateral**: aparece en vendor card cuando está activo en mapa
- **Stats bar**: % activos en cada tarjeta (desde SQL agregado, sin carga extra)
- **fecha_alta**: muestra "re-subir padrón*" si NULL
- **Popup en mapa**: nombre, vendedor, última compra, warning si inactivo
- **FitBounds**: auto-zoom al primer lote de pins cargados
- **Selector de sucursal**: primer paso obligatorio, resetea el mapa al cambiar

### SQL functions en Supabase
```sql
-- fn_supervision_vendedores(p_dist_id BIGINT)
-- Retorna: id_vendedor, nombre_vendedor, sucursal_nombre,
--          total_rutas, total_pdv, pdv_activos, pdv_inactivos
-- Criterio activo: fecha_ultima_compra >= CURRENT_DATE - 90 días

-- fn_supervision_rutas(p_id_vendedor BIGINT)
-- Retorna: id_ruta, nombre_ruta, dia_semana, total_pdv
```

---

## Fase 3C ⏳ — Apertura de Roles

### Qué hacer
- Permitir que el rol `supervisor` acceda al Panel de Supervisión
- Actualmente el panel admin redirige a `/dashboard` si `rol === "supervisor"`
- Crear ruta `/supervision` separada o modificar lógica de acceso en `page.tsx`
- El supervisor solo puede ver su distribuidora (sin el selector superadmin)

---

## Fase 3D ⏳ — Alertas Básicas

### Qué hacer
- Sub-menú "Alertas" en el panel de supervisión
- Lista de PDV inactivos por vendedor (sin compras en 90+ días)
- Lista de rutas sin clientes recientemente visitados
- Exportar a Excel
- (futuro) Push notification al integrante de Telegram

---

## Fase 4 ⏳ — Motores RPA

### Fase 4A: Ventas por PDV
- Motor que descarga el archivo de ventas del ERP
- Mapea `id_cliente_erp` → `id_cliente` en `clientes_pdv_v2`
- Almacena en tabla `ventas_v2` (a crear)
- Actualiza `fecha_ultima_compra` en `clientes_pdv_v2`

### Fase 4B: Cuentas Corrientes
- Motor que descarga saldos de cuentas corrientes por cliente
- Tabla `cuentas_corrientes_v2` (a crear)

### Fase 4C: Schedule Automático
- Cron job en Railway que corre los motores 1× por día
- Registro en `motor_runs` por distribuidora y tipo de motor

---

## Arquitectura de Tablas _v2

```sql
sucursales_v2       id_sucursal, id_distribuidor, id_sucursal_erp, nombre_erp
vendedores_v2       id_vendedor, id_distribuidor, id_sucursal, nombre_erp, id_vendedor_erp
                    UNIQUE(id_distribuidor, id_sucursal, id_vendedor_erp)
rutas_v2            id_ruta, id_vendedor, nombre_ruta, id_ruta_erp, dia_semana
clientes_pdv_v2     id_cliente, id_ruta, id_distribuidor, id_cliente_erp,
                    nombre_fantasia, nombre_razon_social, domicilio, localidad,
                    provincia, canal, latitud, longitud,
                    fecha_ultima_compra, fecha_alta, es_limbo
```

---

## Notas para próximos desarrollos

- **Re-subir padrón**: necesario para poblar `dia_semana` y `fecha_alta` en registros existentes
- **Dist 1 (test)**: sin datos reales; crear script de datos fake
- **`exhibiciones` → `clientes_pdv`**: legacy FK que no se puede tocar. Reconciliación parcial hecha (57 sin vincular de 4898 total)
- **Mapa**: tiles CartoDB `dark_all` gratuitos, sin API key
- **Toggle PDV**: el punto en el mapa es clickeable (dot en la lista actúa como toggle visual)
