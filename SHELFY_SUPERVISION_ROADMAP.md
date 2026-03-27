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
| 3B++ | Toggle 3 niveles (vendedor / ruta / PDV individual) | ✅ COMPLETADA |
| 3C | Apertura de roles — `/supervision` para admin+supervisor | ✅ COMPLETADA |
| 3D | Alertas básicas (PDV inactivos, sin visita 90d) | ⏳ PENDIENTE |
| 4A | Motor RPA: ventas por PDV | ⏳ PENDIENTE |
| 4B | Motor RPA: cuentas corrientes | ⏳ PENDIENTE |
| 4C | Schedule automático de motores | ⏳ PENDIENTE |

---

## Fase 1 ✅ — Padrón de Clientes (ingesta multi-tenant)

### Qué hace
- Descarga un único archivo Excel global (todos los distribuidores en un solo `.xlsx`)
- Agrupa por columna `idempresa`, mapea a `id_distribuidor` via `distribuidores.id_empresa_erp`
- Crea/actualiza registros en `sucursales_v2`, `vendedores_v2`, `rutas_v2`, `clientes_pdv_v2`
- Captura `dia_semana` desde columnas booleanas (Lunes–Domingo) en el Excel
- Captura `fecha_alta` del padrón por cada cliente
- Lógica de "limbo": clientes sin ruta asignada quedan con `es_limbo=True` y se adoptan en futuras cargas

### Resultados — run 2026-03-26 (último)
| Distribuidor | Clientes | Rutas | Vendedores | Tiempo |
|---|---|---|---|---|
| Dist 2 | 388 | 25 | 5 | 1.0s |
| Dist 3 | ~4.900 | ~70 | ~12 | ~8s |
| Dist 4 | ~5.200 | ~80 | ~14 | ~9s |
| Dist 5 | ~4.100 | ~65 | ~11 | ~8s |
| Dist 6 | 2.275 | 51 | 13 | 2.6s |
| **TOTAL** | **~23.200** | **~291** | **~55** | **~43s** |

### Notas importantes
- Dist 1 es la distribuidora "test" — sin datos reales, pendiente script de datos fake
- `exhib_vinculadas: 0` en todos los runs recientes — la reconciliación ya fue hecha antes (57 sin vincular de 4.898, dejado así)

### Gotchas aprendidos
1. `.in_()` de Supabase con listas de 23k IDs revienta la URL → filtrar por `dist_id + es_limbo=True` en DB, cruzar en Python
2. `UNIQUE(id_distribuidor, id_vendedor_erp)` falla si hay varios "SIN VENDEDOR" por sucursal → agregar `id_sucursal` al constraint
3. `motor_runs.estado` CHECK original solo tenía `ok/error/parcial` → extender a `en_curso/ok/error/parcial/sin_ejecuciones`
4. `fecha_alta` y `dia_semana` requirieron re-subir el padrón para poblar registros ya existentes → **hecho el 2026-03-26**
5. Tablas `_v2` creadas desde cero para evitar FK conflict con `exhibiciones → clientes_pdv` legacy
6. `UPDATE distribuidores SET id_empresa_erp = id_erp WHERE id_erp IS NOT NULL` — paso necesario para que el mapeo multi-tenant funcione

---

## Fase 2 ✅ — Mapeo Vendedor ERP ↔ Integrante Telegram

### Qué hace
- Panel `TabMapeoVendedores` en `/admin` para vincular cada `vendedores_v2.id_vendedor` con un `integrantes_grupo.id`
- Superadmin ve TODOS los distribuidores con selector dropdown
- Admin solo ve sus propios vendedores
- Guarda en `integrantes_grupo.id_vendedor_v2`

### Estado actual
- ~90% de los vendedores activos ya tienen integrante vinculado (mapeado manualmente por el usuario)
- El vínculo permite que en el futuro los motores RPA puedan notificar al vendedor correcto por Telegram

---

## Fase 3 ✅ — Panel de Supervisión

### Layout actual
```
┌─────────────────────────────────────────────────────────────────────┐
│  Rutas de Venta  [Selector distribuidora - solo superadmin]   [↺]   │
│  N vendedores · M PDV · X% activos · Y% inactivos                  │
├───────────────────────────────┬─────────────────────────────────────┤
│                               │  SUCURSAL: [Central] [Norte] ...    │
│                               ├─────────────────────────────────────┤
│                               │  ● JUAN PÉREZ              [👁]    │
│       MAPA INTERACTIVO        │    145 PDV · 3 rutas               │
│       (CartoDB dark tiles)    │    ████░░ 74% activos              │
│                               │    ▼ Ver rutas                      │
│  [123 PDV visibles]           │      ├─ Ruta Centro Lun   [👁]     │
│                               │      │   ├─ ● Cliente A   [👁]     │
│  ● activo  ● sin actividad    │      │   └─ ● Cliente B   [👁]     │
│                               │      └─ Ruta Norte Mié   [👁]      │
│                               │  ─────────────────────────────      │
│                               │  ● MARÍA GARCÍA            [👁]    │
│                               │    230 PDV · 5 rutas               │
└───────────────────────────────┴─────────────────────────────────────┘
```

### Visibilidad en 3 niveles (independientes)
```
Vendedor ON  →  carga todas las rutas + clientes, los activa todos en mapa
Vendedor OFF →  quita del mapa (datos quedan en caché local)
Ruta    ON   →  activa ruta y todos sus clientes
Ruta    OFF  →  quita ruta y sus clientes del mapa
PDV     ON   →  muestra ese punto individual en el mapa
PDV     OFF  →  oculta ese punto sin borrar datos

Pin aparece en mapa  ⟺  visibleVends ∩ visibleRutas ∩ visibleClientes
```

### Características del mapa
- **Color por vendedor**: paleta de 12 colores, asignado por índice
- **Activos**: `fecha_ultima_compra` dentro de 90 días → color del vendedor, radio normal
- **Inactivos**: > 90 días o NULL → gris, radio menor, opacidad 0.25
- **Lazy loading**: datos se cargan on-demand por nivel (evita overload)
- **Caché en memoria**: una vez cargado no se re-fetcha hasta refresh manual
- **FitBounds**: auto-zoom al primer lote de pins cargados
- **Popup en mapa**: nombre fantasia, vendedor, última compra, warning si inactivo
- **Selector de sucursal**: primer paso obligatorio antes de ver vendedores
- **Stats bar**: % activos por vendedor en la tarjeta (desde SQL agregado)
- **fecha_alta**: dato visible en el panel derecho

### SQL functions en Supabase
```sql
-- fn_supervision_vendedores(p_dist_id BIGINT)
-- Retorna: id_vendedor, nombre_vendedor, sucursal_nombre,
--          total_rutas, total_pdv, pdv_activos, pdv_inactivos
-- Criterio activo: fecha_ultima_compra >= CURRENT_DATE - 90 días

-- fn_supervision_rutas(p_id_vendedor BIGINT)
-- Retorna: id_ruta, nombre_ruta, dia_semana, total_pdv
```

### Acceso por rol
| Rol | Acceso | Alcance |
|-----|--------|---------|
| superadmin | ✅ `/admin` + `/supervision` | Todas las distribuidoras (selector) |
| admin | ✅ `/admin` + `/supervision` | Solo su distribuidora |
| supervisor | ✅ `/supervision` | Solo su distribuidora |

---

## Fase 3C ✅ — Apertura de Roles

### Qué se hizo
- Creada ruta `/supervision` (Next.js app router) accesible a `admin` y `supervisor`
- Guard en `/admin/page.tsx`: supervisores redirigen a `/supervision`
- Link "Panel de Supervisión" en sidebar para los 3 roles
- Sidebar: renombrado "Panel de Supervisión" antiguo (era `/reportes`) a "Reportes" para evitar duplicados

---

## Fase 3D ⏳ — Alertas Básicas

### Qué hacer
- Sub-sección "Alertas" en el panel de supervisión (debajo del mapa)
- Lista de PDV sin compras en 90+ días, agrupado por vendedor
- Lista de rutas sin ningún cliente activo
- Exportar a Excel
- (futuro) Push notification al integrante de Telegram vinculado

---

## Fase 4 ⏳ — Motores RPA

### Fase 4A: Ventas por PDV
- Motor que descarga el archivo de ventas del ERP (similar al padrón)
- Mapea `id_cliente_erp` → `id_cliente` en `clientes_pdv_v2`
- Almacena en tabla `ventas_v2` (a crear): fecha, monto, id_cliente, id_vendedor
- Actualiza `clientes_pdv_v2.fecha_ultima_compra` automáticamente
- **Este es el motor que hace vivos los datos de activos/inactivos del panel**

### Fase 4B: Cuentas Corrientes
- Motor que descarga saldos por cliente desde el ERP
- Tabla `cuentas_corrientes_v2` (a crear): saldo, fecha_vencimiento, id_cliente
- Vista en panel: saldo pendiente por PDV

### Fase 4C: Schedule Automático
- Cron job en Railway que corre los motores 1× por día (o bajo demanda)
- Registro en `motor_runs` por distribuidora y tipo de motor
- Dashboard de estado de ejecuciones

---

## Arquitectura de Tablas _v2

```sql
sucursales_v2
  id_sucursal     BIGSERIAL PK
  id_distribuidor BIGINT FK → distribuidores
  id_sucursal_erp TEXT
  nombre_erp      TEXT
  UNIQUE(id_distribuidor, id_sucursal_erp)

vendedores_v2
  id_vendedor     BIGSERIAL PK
  id_distribuidor BIGINT FK → distribuidores
  id_sucursal     BIGINT FK → sucursales_v2
  nombre_erp      TEXT
  id_vendedor_erp TEXT
  UNIQUE(id_distribuidor, id_sucursal, id_vendedor_erp)

rutas_v2
  id_ruta         BIGSERIAL PK
  id_vendedor     BIGINT FK → vendedores_v2
  nombre_ruta     TEXT
  id_ruta_erp     TEXT
  dia_semana      TEXT   -- Lunes/Martes/.../Variable
  UNIQUE(id_vendedor, id_ruta_erp)

clientes_pdv_v2
  id_cliente           BIGSERIAL PK
  id_ruta              BIGINT FK → rutas_v2
  id_distribuidor      BIGINT FK → distribuidores
  id_cliente_erp       TEXT
  nombre_fantasia      TEXT
  nombre_razon_social  TEXT
  domicilio            TEXT
  localidad            TEXT
  provincia            TEXT
  canal                TEXT
  latitud              NUMERIC
  longitud             NUMERIC
  fecha_ultima_compra  DATE
  fecha_alta           DATE
  es_limbo             BOOLEAN DEFAULT false
  UNIQUE(id_distribuidor, id_cliente_erp)
```

---

## Decisiones de Arquitectura

### ¿Por qué tablas _v2?
Las tablas `sucursales`, `vendedores`, `rutas`, `clientes_pdv` legacy tienen una FK `exhibiciones → clientes_pdv` que no se puede tocar sin romper el flujo de exhibiciones activo. Las `_v2` son tablas paralelas limpias, sin dependencias legacy.

### ¿Por qué multi-tenant en un solo archivo?
El ERP genera un único archivo `.xlsx` global con todos los distribuidores identificados por la columna `idempresa`. El servicio de ingesta agrupa por `idempresa`, resuelve el `id_distribuidor` via `distribuidores.id_empresa_erp`, y procesa cada tenant de forma independiente y secuencial.

### ¿Por qué lazy loading en el mapa?
23.000+ clientes con coordenadas → no se pueden cargar todos al inicio. El usuario selecciona sucursal → aparecen vendedores → activa uno → carga sus PDVs. El caché en memoria evita re-fetching innecesario.

---

## Pendientes / Notas

- **Dist 1 (test)**: sin datos reales. Pendiente script de datos fake para demos.
- **Mapa tiles**: CartoDB `dark_all` gratuitos, sin API key. Si se necesita más detalle de calles, evaluar Mapbox.
- **fecha_ultima_compra**: en clientes actuales proviene de la reconciliación parcial. Se actualizará automáticamente con Fase 4A.
- **BottomNav mobile**: verificar que el link a `/supervision` funcione correctamente en móvil.
