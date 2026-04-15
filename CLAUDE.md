# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# CenterMind — Guía para Agentes

## Qué es este proyecto

**Shelfy** es un SaaS B2B multi-tenant para gestión de fuerza de ventas y exhibiciones en el canal de distribución. Cada cliente es un "distribuidor" con su propia estructura de sucursales, vendedores y rutas. Los vendedores suben fotos de exhibiciones vía Telegram; los supervisores las evalúan desde un portal React. El sistema cruza esos datos con el ERP del distribuidor para analizar ROI y deuda de cartera.

---

## Stack

### Backend (`CenterMind/`)
- **Python 3.11+** con **FastAPI** + **Uvicorn**
- **Supabase** (PostgreSQL hosted) como única base de datos
- **python-telegram-bot v20** para bots multi-tenant
- **APScheduler** para jobs programados (no distribuido, corre en el mismo proceso)
- **pandas / openpyxl / xlsxwriter** para procesamiento de Excel del ERP
- Archivo principal: `api.py` (98 líneas — entry point slim). Lógica distribuida en:
  - `core/` → config, security, lifespan (bots/scheduler), helpers compartidos
  - `models/schemas.py` → todos los modelos Pydantic
  - `routers/` → auth, erp, supervision, admin, reportes (5 archivos)

### Frontend (`shelfy-frontend/`)
- **Next.js 16** (App Router) + **React 19** + **TypeScript 5.9**
- **Tailwind CSS 4** + **shadcn/ui**
- **Recharts** para gráficos, **MapLibre GL** para mapas (Leaflet reemplazado)
- **@tanstack/react-query** para fetching
- Todo el tipado de API en `src/lib/api.ts`
- **Nota**: `next.config.ts` tiene `ignoreBuildErrors: true` para TypeScript y ESLint — los errores de tipo no bloquean el build

### RPA (`ShelfMind-RPA/`)
- **Playwright** para automatización de navegador
- Motores en `motores/`: `ventas.py`, `cuentas_corrientes.py`, `sigo.py`
- Se conecta al backend vía API Key con endpoints `/api/v1/sync/*`
- Las credenciales de cada tenant (usuario/password de CHESS ERP) se leen desde **Supabase Vault** via `lib/vault_client.py`

---

## Deploy y entornos productivos

### Backend → Railway
- **URL producción**: `https://api.shelfycenter.com`
- Deploy automático desde la rama `main` del repo en GitHub
- Para deployar un fix: `git push origin main` → Railway lo toma solo (~1-2 min)
- Las variables de entorno se configuran en el panel de Railway (no en `.env` en producción)
- Los logs del servidor se ven en Railway dashboard → servicio backend → Logs

### Frontend → Vercel
- Deploy automático desde la rama `main`
- Las variables de entorno (`NEXT_PUBLIC_API_URL`, etc.) se configuran en el panel de Vercel
- Build errors de TypeScript/ESLint no bloquean el deploy (`ignoreBuildErrors: true`)

### RPA → Mac local (máquina del operador)
- Corre manualmente o programado (cron local) desde la Mac de desarrollo
- No está en ningún servidor cloud; se ejecuta con `python runner.py [motor]`
- Requiere que las variables de entorno de Supabase estén definidas en el shell (`SUPABASE_URL`, `SUPABASE_KEY`)
- **Logger**: el `lib/logger.py` intenta escribir en una ruta Windows (`C:/Users/cigar/...`) que no existe en Mac — los logs solo van a stdout. En producción Windows funcionaría el file handler.
- **vault_client.py** resuelve credenciales con este orden: variables de entorno del shell → cache en memoria → Supabase Vault RPC. Lee el `.env` desde `CenterMind/CenterMind/.env` (no desde la raíz del RPA).

---

## Entorno y variables de entorno

### Backend — variables en Railway (producción) o `.env` (desarrollo local)
```
SHELFY_API_KEY=          # Clave para endpoints protegidos (bots, RPA, scripts)
SHELFY_JWT_SECRET=       # Secreto para firmar JWT del portal React
SUPABASE_URL=            # URL del proyecto Supabase
SUPABASE_KEY=            # Anon/Service Key de Supabase
WEBHOOK_URL=             # URL pública para webhooks de Telegram (https://api.shelfycenter.com)
DRIVE_TOKEN_JSON=        # (Legado, no usado activamente — fotos van a Supabase Storage)
```

### Frontend — variables en Vercel (producción) o `shelfy-frontend/.env.local` (desarrollo)
```
NEXT_PUBLIC_API_URL=https://api.shelfycenter.com   # URL base del backend
```

### RPA — variables en el shell o `.env` local
```
SUPABASE_URL=            # Para acceder al Vault
SUPABASE_KEY=            # Service Key (necesita leer vault)
SHELFY_API_KEY=          # Para autenticarse contra el backend
```
El RPA obtiene las credenciales de los tenants CHESS (usuario/password por distribuidor) desde **Supabase Vault**. Las claves del vault se llaman `chess_tabaco_usuario`, `chess_tabaco_password`, `chess_aloma_usuario`, etc. La URL del backend también se lee del vault (`shelfy_api_url`).

### Cómo correr en desarrollo
```bash
# Backend
cd CenterMind
pip install -r requirements.txt
uvicorn api:app --host 0.0.0.0 --port 8000 --reload

# Frontend
cd shelfy-frontend
npm install
npm run dev          # Puerto 3000

# RPA (cuando sea necesario)
cd ShelfMind-RPA
pip install -r requirements.txt
python runner.py [padron|ventas|cuentas|sigo|todos]
```

---

## Tenants activos del RPA

El RPA procesa 4 distribuidoras activas configuradas en `TENANTS` dentro de cada motor:

| tenant_id | Nombre | id_distribuidor | ERP |
|---|---|---|---|
| `tabaco` | Tabaco & Hnos S.R.L. | 3 | CHESS |
| `aloma` | Aloma Distribuidores Oficiales | 4 | CHESS |
| `liver` | Liver SRL | 5 | CHESS |
| `real` | Real Tabacalera de Santiago S.A. | 2 | CHESS |
| `extra` | GyG Distribución (pendiente credenciales) | 6 | CHESS |

**Importante**: estos IDs son los reales en Supabase. En el pasado existían IDs placeholder (1,2,3,4) que causaban ingesta en distribuidores incorrectos — ya corregidos en `TENANT_DIST_MAP` de `ventas_ingestion_service.py` y en los motores RPA.

Hay un quinto tenant (`extra`) con credenciales pendientes, sin activar.

---

## Estructura de directorios

```
CenterMind/                     # Root del repo
├── CenterMind/                 # Backend Python
│   ├── api.py                  # FastAPI entry point slim (98 líneas): app + include_router + health + WS
│   ├── core/                   # Infraestructura transversal
│   │   ├── config.py           # API_KEY, JWT_*, WEBHOOK_URL, CORS_ORIGINS
│   │   ├── security.py         # verify_auth, verify_key, check_dist_permission, check_distributor_status
│   │   ├── lifespan.py         # bots{}, ConnectionManager, scheduler, lifespan()
│   │   └── helpers.py          # _get_erp_name_map, _enrich_and_store_cc
│   ├── models/
│   │   └── schemas.py          # Todos los modelos Pydantic del sistema
│   ├── routers/
│   │   ├── auth.py             # /login, /auth/login, /auth/switch-context
│   │   ├── erp.py              # ERP ingesta, sync v1, padrón, motores RPA, CC
│   │   ├── supervision.py      # Pendientes, evaluar, mapa supervisión, objetivos, GPS
│   │   ├── admin.py            # Distribuidoras, usuarios, integrantes, jerarquía, monitoring
│   │   └── reportes.py         # Dashboard, reports, bonos, reportes exhibiciones
│   ├── bot_worker.py           # Bot Telegram parametrizado por distribuidor
│   ├── db.py                   # Cliente Supabase singleton
│   ├── utils.py                # leer_excel(), parse_fecha_robusta()
│   ├── requirements.txt
│   └── services/
│       ├── erp_ingestion_service.py      # Ingesta Excel ERP → tablas raw
│       ├── erp_summary_service.py        # Consolidación de deuda
│       ├── cuentas_corrientes_service.py # Procesamiento CC (Excel → gráficos)
│       ├── padron_ingestion_service.py   # Ingesta padrón → tablas v2 (con SUCURSAL_FILTER)
│       ├── ventas_ingestion_service.py   # Ingesta ventas → ventas_v2
│       └── system_monitoring_service.py  # Métricas CPU/RAM/DB
│
├── shelfy-frontend/            # Frontend Next.js
│   └── src/
│       ├── app/                # App Router
│       │   ├── login/
│       │   ├── dashboard/
│       │   ├── admin/          # Gestión de distribuidoras y usuarios
│       │   ├── reportes/       # Reportes ERP, ventas, CC, SIGO
│       │   ├── supervision/    # Panel de supervisión (rutas, mapa, cuentas)
│       │   ├── academy/        # Módulo cuentas corrientes (upload Excel)
│       │   ├── bonos/          # Módulo de bonos
│       │   └── visor/          # Visor de exhibiciones pendientes
│       ├── components/
│       │   ├── admin/          # TabSupervision.tsx + MapaRutas.tsx (mapa PDV con MapLibre)
│       │   ├── layout/         # Sidebar, Topbar, BottomNav
│       │   └── ui/             # shadcn/ui components
│       ├── hooks/useAuth.ts    # Hook de autenticación
│       └── lib/api.ts          # Todas las funciones fetch + tipos TS de la API
│
└── ShelfMind-RPA/              # RPA Playwright
    ├── runner.py
    ├── lib/
    │   ├── vault_client.py     # Lee credenciales desde Supabase Vault
    │   ├── cuentas_parser.py   # Parsea Excel CC → dict con detalle_cuentas
    │   └── logger.py           # Logger (file handler apunta a ruta Windows — en Mac solo stdout)
    └── motores/
        ├── cuentas_corrientes.py
        ├── ventas.py
        └── sigo.py
```

---

## Base de datos (Supabase PostgreSQL)

### Regla principal: cada tabla tiene `id_distribuidor` como tenant key

### Límite de filas: Supabase PostgREST devuelve máximo 1000 filas por query por defecto. Para tablas con volumen alto (ej. `cc_detalle` de Tabaco tiene ~4578 filas) se debe usar paginación con `.range(offset, offset+BATCH-1)` en un loop hasta que el resultado devuelva menos filas que el batch.

### Tablas activas (NO legacy)

#### Core del sistema
| Tabla | Función |
|---|---|
| `distribuidores` | Clientes del SaaS. Tiene `token_bot`, `estado_operativo`, `feature_flags` |
| `usuarios_portal` | Usuarios del portal React (login, rol, id_distribuidor) |
| `integrantes_grupo` | Vendedores registrados en Telegram. FK a `id_vendedor_v2` |
| `exhibiciones` | **Tabla crítica.** Fotos subidas por vendedores. 76+ referencias en el código. Columna `url_foto_drive` es nombre legado — actualmente almacena URLs de **Supabase Storage** (no Drive). Bucket: `Exhibiciones-PDV/{dist_nombre}/{fecha}/` |

#### Jerarquía ERP (tablas v2 — fuente de verdad)
| Tabla | Función |
|---|---|
| `sucursales_v2` | Sucursales normalizadas. PK: `id_sucursal`. Campos: `id_distribuidor`, `id_sucursal_erp`, `nombre_erp` |
| `vendedores_v2` | Vendedores. PK: `id_vendedor`. FK a `id_sucursal`. Campos: `nombre_erp`, `id_vendedor_erp` |
| `rutas_v2` | Rutas por vendedor. `dia_semana`, `periodicidad` |
| `clientes_pdv_v2` | Puntos de venta. Tiene `es_limbo` para PDVs capturados sin padrón actualizado |
| `ventas_v2` | Ventas procesadas. FK a `id_distribuidor` |

#### ERP Raw (ingesta, no modificar manualmente)
| Tabla | Función |
|---|---|
| `erp_clientes_raw` | Clientes tal como vienen del Excel ERP |
| `erp_ventas_raw` | Ventas crudas |
| `erp_sucursales_raw` | Sucursales crudas |
| `erp_fuerza_ventas` | Vendedores crudos |
| ~~`erp_deuda_clientes`~~ | **OBSOLETA** — `erp_summary_service` eliminado. No escribir ni leer. Usar `cc_detalle`. |

#### Cuentas Corrientes
| Tabla | Función |
|---|---|
| `cc_detalle` | **Tabla normalizada.** Una fila por cliente deudor (deduplicada por vendedor+cliente). FK a `vendedores_v2` y `sucursales_v2`. Columna `id_cliente_erp TEXT` para hacer cross-reference con `clientes_pdv_v2`. ÚNICA fuente para `/api/supervision/cuentas/{dist_id}`. UNIQUE constraint en `(id_distribuidor, fecha_snapshot, vendedor_nombre, cliente_nombre)` |
| `cuentas_corrientes_data` | Blob JSON legacy. Sigue existiendo para el módulo academy (upload/download Excel). No se usa para supervision |

#### Sistema
| Tabla | Función |
|---|---|
| `motor_runs` | Log de cada ejecución de ingesta (padron, ventas, cuentas) |
| `erp_empresa_mapping` | Mapeo `nombre_erp` → `id_distribuidor` |
| `erp_config_alertas` | Reglas de alertas de crédito por distribuidor |
| `sessions` | Sesiones del portal React |
| `bonos_config`, `bonos_ranking` | Módulo de bonos |

#### Legacy (existen pero evitar usar)
| Tabla | Estado |
|---|---|
| `maestro_jerarquia` | Sin referencias activas en api.py. Migrada a `vendedores_v2`/`sucursales_v2` |
| `clientes_pdv` | Sin referencias activas en api.py. Todas migradas a `clientes_pdv_v2` |
| `sucursales`, `vendedores` | Tablas sin "v2". Algunas referencias legacy en `/api/admin/hierarchy/rutas` (endpoint de admin poco usado) |
| `clientes` (sin v2 ni pdv) | `PUT /api/admin/clientes/{id}/vendedor` migrado a `clientes_pdv_v2`. No usar. |

---

## Autenticación

### Dos métodos, misma función `verify_auth()`

**API Key** — para bots, RPA y scripts
```
Header: X-Api-Key: {SHELFY_API_KEY}
```
Actúa como superadmin. Todos los endpoints la aceptan.

**JWT Bearer** — para el portal React
```
Header: Authorization: Bearer {token}
POST /auth/login → devuelve token
```
Payload del JWT: `{ id_usuario, id_distribuidor, rol, is_superadmin }`
Expira en 8 horas. Algoritmo HS256.

### Roles
- `superadmin`: ve todas las distribuidoras (bypass total de permisos).
- `admin`: administra su distribuidora.
- `directorio`: acceso ejecutivo global (multi-tenant con permisos específicos).
- `supervisor`: supervisa vendedores de su distribuidora.
- `evaluador`: rol específico para evaluación de exhibiciones.

### `check_dist_permission(user_payload, dist_id)`
Función en `core/security.py` que lanza 403 si un usuario intenta acceder a una distribuidora ajena. 
**Excepciones**:
1. Si `is_superadmin` es `True`.
2. Si el usuario cuenta con el permiso `action_switch_tenant` en su payload de JWT (permiso fundamental de cambio de entorno).

---

## Endpoints principales (api.py)

### Supervisión (módulo más activo)
```
GET  /api/supervision/vendedores/{dist_id}      # Via RPC fn_supervision_vendedores
GET  /api/supervision/rutas/{id_vendedor}        # Via RPC fn_supervision_rutas
GET  /api/supervision/clientes/{id_ruta}         # PDVs con coords, fechas, url_ultima_exhibicion, id_ruta
GET  /api/supervision/ventas/{dist_id}           # Ventas desde ventas_v2
GET  /api/supervision/cuentas/{dist_id}          # Lee cc_detalle; acepta ?sucursal= para filtrar
GET  /api/supervision/pendientes/{dist_id}       # Pendientes de evaluación
```

### ERP Ingesta
```
POST /api/admin/erp/upload-global                # Upload manual Excel
POST /api/v1/sync/erp-clientes                   # Push automático (API Key)
POST /api/v1/sync/erp-sucursales
POST /api/v1/sync/erp-vendedores
POST /api/v1/sync/erp-ventas
```

### Cuentas Corrientes
```
POST /api/procesar-cuentas-corrientes            # Upload Excel + guarda en cc_detalle
POST /api/v1/sync/cuentas-corrientes             # Sync RPA + guarda en cc_detalle
GET  /api/cuentas-corrientes/{id_distribuidor}   # Obtiene blob JSON legacy
```

### Dashboard y Reportes
```
GET  /api/dashboard/kpis/{dist_id}
GET  /api/dashboard/ranking/{dist_id}
GET  /api/reports/performance/{dist_id}
GET  /api/reports/ventas-resumen/{dist_id}
GET  /api/reports/auditoria-sigo/{dist_id}
GET  /api/erp/roi/{dist_id}
```

### Auth
```
POST /auth/login
POST /auth/switch-context/{dist_id}    # Superadmin cambia de distribuidora
```

### Admin
```
GET/POST/PUT /admin/distribuidoras
GET/POST/PUT/DELETE /api/admin/usuarios
GET/PUT /api/admin/integrantes
GET/PUT /api/mapeo-integrantes/{dist_id}
```

---

## Padrón — clientes dados de baja en ERP

El archivo de padrón que subís suele traer **solo clientes activos** (export sin anulados). Tras cada ingesta exitosa, `padron_ingestion_service` marca `clientes_pdv_v2.estado='inactivo'` en PDV que **no figuran** en ese Excel (alcance total) o que faltan en las rutas tocadas por el archivo cuando aplica `SUCURSAL_FILTER` / Bolívar / La Mágica (alcance parcial). Supervisión (`/api/supervision/clientes`, `/api/supervision/pdvs-catalog`) excluye `estado=inactivo` para el mapa y objetivos.

## Flujo de datos ERP

```
Excel ERP (Padrón de Clientes / Informe de Ventas)
    ↓  Upload manual o push RPA con API Key
erp_*_raw   (tablas de auditoría, no tocar)
    ↓  padron_ingestion_service / ventas_ingestion_service
sucursales_v2 → vendedores_v2 → rutas_v2 → clientes_pdv_v2 → ventas_v2
```

**Mapeo de columnas flexible**: el service normaliza los nombres de columnas del Excel (strip de acentos, lowercase). Si una columna no existe, lanza ValueError con el nombre esperado.

**Upsert idempotente**: todas las tablas v2 tienen constraint UNIQUE en `(id_distribuidor, id_*_erp)`. Se puede re-importar el mismo Excel sin duplicar.

### Filtro de sucursales por distribuidor (`SUCURSAL_FILTER`)

`padron_ingestion_service.py` tiene un dict `SUCURSAL_FILTER` que permite restringir la ingesta a sucursales específicas por `id_distribuidor`. Actualmente activo:

```python
SUCURSAL_FILTER: dict[int, dict] = {
    2: {  # Real Tabacalera de Santiago S.A.
        "ids":     ["8"],
        "nombres": ["uequin rodrigo"],
    },
}
```

Además, `padron_ingestion_service.py` aplica una regla de enrutamiento previa al filtro: las filas del padrón que entran por Real Tabacalera (`idempresa` mapeado a Real) y traen sucursal `OSCAR ONDARRETA` se redirigen al `id_distribuidor` de **Bolivar Distribuiciones** (resuelto por `nombre_empresa` en tabla `distribuidores`).

Si el resultado post-filtro está vacío, lanza `ValueError`. Agregar aquí si alguna otra distribuidora necesita filtrar sucursales.

---

## Flujo de Cuentas Corrientes

```
Excel CC / JSON RPA
    ↓  POST /api/procesar-cuentas-corrientes
    ↓  o POST /api/v1/sync/cuentas-corrientes
_enrich_and_store_cc(dist_id, fecha_snapshot, rows)
    ↓  deduplicar por (vendedor_nombre, cliente_nombre) — suma deuda y cbtes, max antigüedad
    ↓  match vendedor_nombre → vendedores_v2.nombre_erp
    ↓  resolución de id_vendedor, id_sucursal, sucursal_nombre
    ↓  DELETE snapshot del día + INSERT registros deduplicados
cc_detalle  (tabla normalizada, sucursal viene de sucursales_v2)
    ↓
GET /api/supervision/cuentas/{dist_id}?sucursal=X
    ↓  filtra en backend por sucursal_nombre, pagina en lotes de 1000
    ↓  agrupa por id_vendedor, incluye sucursal correcta
Frontend TabSupervision → carga CC solo al seleccionar sucursal (no en mount)
```

**Importante — deduplicación**: el Excel de CHESS puede traer una fila por comprobante para el mismo par (vendedor, cliente). `_enrich_and_store_cc` deduplica antes de insertar para no violar el UNIQUE constraint de `cc_detalle`. Se suma `deuda_total` y `cantidad_comprobantes`; `antiguedad_dias` toma el máximo.

**Importante — sucursal**: la `sucursal` en `cc_detalle.sucursal_nombre` viene de `sucursales_v2.nombre_erp`, NO del texto del Excel. Esto resuelve el bug del `SUCURSALES_MAP` hardcodeado.

**Importante — paginación**: `cc_detalle` de Tabaco tiene ~4578 filas. El endpoint `/api/supervision/cuentas/{dist_id}` usa un loop con `.range()` para superar el límite de 1000 filas de Supabase. Lo mismo aplica al select de `clientes_pdv_v2`.

**Importante — id_cliente_erp**: `cc_detalle` tiene columna `id_cliente_erp TEXT` (requiere `ALTER TABLE cc_detalle ADD COLUMN IF NOT EXISTS id_cliente_erp TEXT;`). Se llena desde `cod_cliente` del Excel parseado. El endpoint `/api/supervision/cuentas` incluye `id_cliente_erp` en la respuesta. El endpoint `/api/supervision/cliente-info/{dist_id}` lo usa como strategy 0 para buscar en `clientes_pdv_v2` sin depender de name matching.

**Importante — split Real Tabacalera en RPA CC**: el motor `ShelfMind-RPA/motores/cuentas_corrientes.py` selecciona dos sucursales (`UEQUIN RODRIGO`, `OSCAR ONDARRETA`) en CHESS y luego divide `detalle_cuentas` por sucursal para subir a distintos distribuidores: `UEQUIN RODRIGO -> La Magica` y `OSCAR ONDARRETA -> Bolivar Distribuiciones` (resolviendo `id_distribuidor` por nombre vía API para evitar hardcodeo).

### Endpoint `/api/supervision/cliente-info/{dist_id}`
Busca datos de contacto de un PDV en `clientes_pdv_v2`. Estrategias en orden:
0. Match exacto por `id_cliente_erp` (más robusto — bypasa name matching)
1. Match exacto CI sobre `nombre_cliente`
2. Match CI sin acentos
3. Substring CI
4. Substring CI sin acentos
5. AND de palabras (order-independent)

---

## Sistema de Bots Telegram

**Un BotWorker por distribuidor**. Se registran en el lifespan de FastAPI.

Webhook: `POST /api/telegram/webhook/{id_distribuidor}`

**Flujo de exhibición**:
1. Vendedor sube foto → bot pide número de cliente → pide tipo de PDV
2. Foto sube a Supabase Storage (`Exhibiciones-PDV/{dist_nombre}/{fecha}/`)
3. Se registra en tabla `exhibiciones` con estado `Pendiente`
4. Evaluador abre portal React → evalúa → `POST /api/evaluar`
5. Job `sync_evaluaciones_job` (cada 30s) actualiza el mensaje en Telegram

**Compliance/bloqueo**: si `distribuidores.estado_operativo != 'Activo'`, el bot rechaza cargas.

**Columna `url_foto_drive`**: nombre legado en la tabla `exhibiciones`. En realidad almacena la URL pública de Supabase Storage. No hay integración con Google Drive activa. Usar el valor directamente como `<img src>` o link.

---

## Componente TabSupervision (frontend)

Archivo: `shelfy-frontend/src/components/admin/TabSupervision.tsx`

Es el componente central del panel de supervisión. Tiene 3 tabs principales:
- **Mapa de rutas**: vendedores → rutas → PDVs con visibilidad por nivel
- **Ventas**: últimos 7/30/90 días, filtrado por sucursal seleccionada
- **Cuentas corrientes**: deuda por vendedor, filtrado por sucursal

**Patrón de filtrado por sucursal**:
```typescript
// selectedSucursal viene de sucursales_v2.nombre_erp (via supervision_vendedores)
// CC se carga con ?sucursal= al seleccionar sucursal (no en mount del componente)
// v.sucursal en cc_detalle también viene de sucursales_v2.nombre_erp → match exacto
```

**Carga de CC**: se dispara con `useEffect([selectedDist, selectedSucursal])`, no al montar. Evita cargar las ~4578 filas de Tabaco de golpe.

**Mapa de PDVs — deduplicación**: un PDV puede estar en múltiples rutas del mismo vendedor. El `pines` useMemo usa un `Set<number>` para filtrar duplicados por `id_cliente`.

**Mapa de PDVs — coordenadas válidas**: `hasValidCoords(lat, lng)` filtra coordenadas fuera del bounding box de Argentina (`lat: -55 a -21`, `lng: -74 a -53`). Los PDVs con `lat=0,lng=0` quedan excluidos.

Props que recibe: `{ distId: number, isSuperadmin?: boolean }`
- No-superadmin: `distId` viene del JWT y está fijo
- Superadmin/directorio: el cambio de `distId` se hace sólo desde `Sidebar` (contexto global), no desde selectores locales del módulo.

**Cache por tenant en supervisión**:
- Las keys de React Query para rutas/clientes deben incluir `id_distribuidor` para evitar cruces de datos:
  - `['supervision-rutas', distId, id_vendedor]`
  - `['supervision-clientes', distId, id_ruta]`

---

## Componente MapaRutas (frontend)

Archivo: `shelfy-frontend/src/components/admin/MapaRutas.tsx`

Mapa MapLibre GL con marcadores HTML para PDVs. Puntos críticos de la implementación:

### Conflicto GPU / WebGL
Los marcadores HTML con animaciones CSS `transform: scale()` crean capas de compositing GPU separadas que interfieren con el canvas WebGL de MapLibre → los pins se mueven al hacer pan/zoom. **Solución**: usar `box-shadow` para la animación aura (no `transform`). Un único elemento `.shelfy-pin` con:
```css
@keyframes shelfy-aura {
  0%   { box-shadow: 0 0 0 1px var(--ac); }
  70%  { box-shadow: 0 0 0 9px transparent; }
  100% { box-shadow: 0 0 0 9px transparent; }
}
```

### ResizeObserver
Al cambiar de tab o abrir/cerrar fullscreen, el contenedor del mapa cambia de tamaño. Sin `map.resize()` el canvas queda desfasado. Implementado con `ResizeObserver` sobre el contenedor.

### `fitBounds` sin animación
`fitBounds({ padding: 60, maxZoom: 14, animate: false })` — el `animate: false` es crítico para evitar que los marcadores deriven durante la animación de vuelo.

### Interface `PinCliente`
```typescript
export interface PinCliente {
  id: number; lat: number; lng: number; nombre: string;
  color: string; activo: boolean; vendedor: string;
  ultimaCompra: string | null; conExhibicion: boolean;
  idClienteErp?: string | null;       // Nº cliente ERP
  nroRuta?: string | null;            // dia_semana de rutas_v2
  fechaUltimaCompra?: string | null;  // ISO date para calcular días
  fechaUltimaExhibicion?: string | null;
  urlExhibicion?: string | null;      // URL Supabase Storage (directo, no Drive)
}
```

### Popup enriquecido
El popup HTML del marcador muestra:
- Nombre del PDV + estado activo/inactivo
- Última compra: fecha + "hace N días" (rojo si inactivo)
- Exhibición: fecha + días + miniatura `<img src={urlExhibicion}>` + link "Ver imagen original ↗"
- Meta: Nº cliente ERP + Ruta (dia_semana)

---

## Convenciones del proyecto

### Python (backend)
- `api.py` es el entry point slim (98L). Los endpoints viven en `routers/` (auth, erp, supervision, admin, reportes), la infraestructura en `core/` (config, security, lifespan, helpers) y los modelos en `models/schemas.py`
- Los services en `services/` son clases instanciadas una vez al inicio
- El cliente Supabase es `sb` (importado de `db.py`)
- Logging con `logger = logging.getLogger("ShelfyAPI")`
- Los errores de negocio se loguean con `logger.error()` y se devuelven como HTTPException 500

### TypeScript (frontend)
- Toda la comunicación con la API pasa por `src/lib/api.ts` — NO fetch directo en componentes
- Los tipos se definen en `api.ts` junto con la función fetch
- No hay Redux ni Zustand — estado local con useState + contexto mínimo
- Tailwind con variables CSS (`var(--shelfy-bg)`, `var(--shelfy-panel)`, etc.)

### Backend (mapeo nombres supervisión)
- `_get_erp_name_map` debe preservar identidad si `nombre_integrante` ya coincide con `vendedores_v2.nombre_erp`. Nunca sobreescribir ese nombre con otro ERP por un mapping roto en `integrantes_grupo`.
- **Exhibiciones QA (Tabaco `id_distribuidor=3`)**: `build_qa_exhibicion_integrante_ids` / `is_exhibicion_qa_display_for_dist` / `should_apply_exhibicion_qa_filter` en `core/helpers.py` — NACHO PIAZZA (v2=157) y JESUS GRIMALDI (v2=76) no entran en ranking ni visor de evaluación salvo **superadmin**; `evaluar`/`revertir` devuelven 403 si no lo sos.

### Base de datos
- Siempre filtrar por `id_distribuidor` — nunca queries sin tenant
- Las tablas `_v2` son las activas; las sin sufijo son legacy
- Las tablas `erp_*_raw` son de auditoría, no modificar manualmente
- `cc_detalle` es la tabla authoritative de cuentas corrientes para supervision
- Para tablas con volumen alto: siempre paginar con `.range()` — nunca asumir que un `.select()` devuelve todos los registros

---

## Qué NO hacer

- No agregar `SUCURSALES_MAP` hardcodeados en services — la sucursal siempre debe resolverse desde `sucursales_v2`
- No leer de `maestro_jerarquia` en código nuevo — usar tablas `_v2`
- No hacer queries a `cuentas_corrientes_data` en el endpoint de supervisión — usar `cc_detalle`
- No hacer queries a `erp_deuda_clientes` — tabla obsoleta, no se alimenta más. Usar `cc_detalle`
- No usar la tabla `clientes` (sin v2 ni pdv) — **State Management**: **Zustand** is the standard for client-side global state (coordinating UI, filters, and cross-component logic). Use **TanStack Query v5** for all server-side data fetching and caching. Avoid prop-drilling.
- **Aesthetics**: Focus on the **Shelfy Light-Violet**### Testing & Estándares "Pro"
- **Stack**: Vitest (Unitarios/Componentes) + React Testing Library + Playwright (E2E/Smoke).
- **Smoke Tests**: Mandatorios para cada nueva página o componente complejo.
- **Ubicación**: 
    - Unitarios: En carpeta `tests/unit/` o junto al componente (`*.test.tsx`).
    - Smoke: En carpeta `tests/smoke/*.spec.ts`.
- **Scripts**: `npm run test` (Vitest), `npm run test:smoke` (Playwright).
**## Desarrollo y Convenciones (PRO)
- **Testing**: Smoke Tests mandatorios con Vitest (unidad) y Playwright (E2E).
- **State Management**: Zustand para UI global, TanStack Query para datos server.
- **Borders**: 0.5px con `--shelfy-border`.
- **Animations**: Máximo 0.4s con Framer Motion.
** for subtle (0.4s max) transitions and micro-interactions. Ensure animations do not impede high-density productivity.
- **Estilos**: Usar variables CSS de `globals.css` (`--shelfy-primary`, etc.) para mantener consistencia con el tema **light-violet**. El `:root` por defecto es modo claro; `.dark` existe como fallback. No usar valores hex hardcodeados cuando existe una variable `--shelfy-*` equivalente.
- **Componentes**: Priorizar componentes de `shadcn/ui` (`@/components/ui`) para nuevos desarrollos. Primitivos instalados (completo desde 2026-04-04): `Button`, `Card` (con `CardHeader/Title/Description/Content/Footer`), `Input`, `Label`, `Avatar` (con `AvatarImage/AvatarFallback`), `Badge`, `Skeleton`, `Select`, `Alert` (con `AlertTitle/Description`), `Sonner` (toast via `sonner`), `Dialog`, `Sheet`, `Tabs`, `Progress`, `Tooltip`, `Separator`, `ScrollArea`, `Form`, `Popover`, `Checkbox`, `Table`, `DropdownMenu`. Agregar nuevos con `npx shadcn@latest add <component>` desde `shelfy-frontend/`.
- **shadcn reglas críticas**: Usar `cn()` para clases condicionales. `size-*` para dimensiones iguales. `gap-*` no `space-y-*`. Colores semánticos (`text-muted-foreground`, `bg-primary`) nunca hex hardcodeado. `Avatar` siempre con `AvatarFallback`. `Dialog`/`Sheet` siempre con `Title` (sr-only si visually hidden). Iconos en `Button` usan `data-icon="inline-start|end"`.
- **Toasts**: Usar `toast()` de `sonner` — `<Toaster>` ya está en `layout.tsx`. No crear divs de notificación custom.
- **Loading states**: Usar `<Skeleton>` — no `animate-pulse` divs custom.
- **Errores/warnings**: Usar `<Alert variant="destructive">` — no divs con border rojo custom.
- **Backend Routing**: Seguir el patrón modular: `routers/` para agrupar endpoints y Pydantic para esquemas.
- No modificar tablas `erp_*_raw` directamente — son append-only desde los services
- No usar `clientes_pdv` (sin v2) en código nuevo
- No usar animaciones CSS `transform` en marcadores HTML sobre MapLibre GL — usar `box-shadow` o `opacity`
- No asumir que `url_foto_drive` en `exhibiciones` es una URL de Drive — es Supabase Storage, usar directamente
- No usar `erp_summary_service` — importado y llamado eliminado. La consolidación de deuda la provee `cc_detalle`

---

## RPCs de Supabase relevantes

```sql
fn_supervision_vendedores(p_dist_id)   -- Vendedores con sucursal, total rutas y PDV
fn_supervision_rutas(p_id_vendedor)    -- Rutas con día de visita y cantidad PDV
fn_supervision_clientes(p_id_ruta)     -- PDVs de una ruta con coords y fechas
fn_login(p_usuario, p_password)        -- Auth del portal React
```

---

## Sistema de Franquiciados (Phase 1 — Abril 2026)

### Tabla `matcheo_rutas_excepciones`

Tabla nueva que mapea clientes de vendedores franquiciados (ej. Ivan Soto, que actúa como canal para Monchi Ayala y Jorge Coronel) al vendedor real que realizó la visita.

```sql
-- Correr en Supabase SQL Editor antes de deployar el interceptor
CREATE TABLE IF NOT EXISTS matcheo_rutas_excepciones (
    id                            SERIAL PRIMARY KEY,
    id_distribuidor               INTEGER NOT NULL,
    telegram_user_id_franquiciado BIGINT  NOT NULL,
    id_cliente_erp                TEXT    NOT NULL,
    telegram_user_id_real         BIGINT  NOT NULL,
    nombre_vendedor_real          TEXT,
    ruta_inferida                 TEXT,
    confianza                     TEXT DEFAULT 'alta',
    created_at                    TIMESTAMPTZ DEFAULT now(),
    UNIQUE (id_distribuidor, telegram_user_id_franquiciado, id_cliente_erp)
);
```

### Interceptor en `bot_worker.py`

Función `Database.lookup_soto_intercept(distribuidor_id, uploader_tuid, id_cliente_erp)` consulta la tabla y devuelve el `telegram_user_id_real` del vendedor efectivo. El interceptor corre en el flujo de subida **antes** de construir los parámetros de `fn_bot_registrar_exhibicion`, reemplazando el `vendedor_id` con el real si hay match. Log: `🔀 Intercepción franquiciado: UID X → UID Y (Nombre) para cliente 'Z'`.

### Scripts de migración

| Script | Acción |
|---|---|
| `unify_wutrich_records.py` | Reasigna exhibiciones de Matias Wutrich → Ivan Wutrich y desactiva cuenta Matias |
| `match_rutas_soto.py` | Construye `matcheo_rutas_excepciones` con matcheo heurístico (ruta → histórico) |

**Orden de ejecución**:
1. Crear tabla (SQL arriba) en Supabase
2. `python unify_wutrich_records.py --dry-run` → verificar → ejecutar sin flag
3. `python match_rutas_soto.py --dry-run` → verificar → ejecutar (+ `--deactivate-soto` cuando Soto quede completamente inactivo)
4. Deploy backend (`git push origin main`) — el interceptor ya está en `bot_worker.py`

### Auditoría de Seguridad (Phase 2)

- **Credenciales hardcodeadas**: no se encontraron en `api.py`, `bot_worker.py` ni `services/`. ✅
- **Paths Windows en scripts de diagnóstico**: ~30 scripts de audit usan `load_dotenv("c:\Users\cigar\...")`. Fallan silenciosamente en Mac. No son código de producción — corregir si se reutilizan.
- **SQL Injection**: todos los queries usan el client Supabase con parámetros tipados. Sin concatenación dinámica de SQL. ✅
- **Content-Type Storage**: `SupabaseUploader` fuerza `image/jpeg`. ✅
- **Path Traversal en filename**: `nro_cliente` se incluye en el filename del Storage sin sanitizar. Riesgo bajo (bucket privado en producción) pero recomendado: `re.sub(r'[^a-zA-Z0-9_-]', '_', nro_cliente)` antes de construir el filename.
- **JWT tokens**: ningún token hardcodeado encontrado en el repo. ✅

### Mapa arquitectónico

Archivo `shelfy_mapa_arquitectonico.html` en la raíz del repo. Dashboard HTML estático con diagrama interactivo del sistema completo (flujo bot, ERP, frontend, deploy, seguridad, pendientes).

---

## Desarrollo y Convenciones

### Python (backend)
- Un archivo `api.py` monolítico con todos los endpoints.
- Los services en `services/` son clases instanciadas una vez al inicio.
- El cliente Supabase es `sb` (importado de `db.py`).
- Logging con `logger = logging.getLogger("ShelfyAPI")`.
- Bot Telegram: priorizar flujo "silent-first" para tipo PDV (usar perfil histórico + trust y preguntar solo en baja confianza/inconsistencia).

### TypeScript (frontend)
- Comunicación vía `src/lib/api.ts` — NO fetch directo en componentes.
- Tipos definidos en `api.ts`.
- Tailwind con variables CSS en `globals.css`. Tema por defecto: **light-violet** (`:root` es claro, `.dark` es fallback).
- Iconos de Lucide se tipan como `React.ElementType` en interfaces de navItems (no `any`).
- Listas derivadas de constantes de módulo (ej. `PERMISSION_GROUPS`, `PERMISSIONS_BY_GROUP`) deben hoistarse a nivel de módulo, no computarse en render. Usar `useMemo` solo para derivaciones que dependen de props/state.
- Fetches en `useEffect` con posibilidad de re-disparo deben incluir cleanup con flag `cancelled` o `AbortController`.
- Para permisos de UI/rutas usar siempre `hasPermiso("clave")` del AuthContext (no leer `user.permisos` directo en páginas).
- En objetivos con sucursales múltiples, mantener cascada estricta sucursal→vendedor y permitir multiselección de PDVs para activación/exhibición cuando el caso de uso lo requiera.

### Base de datos
- Siempre filtrar por `id_distribuidor`.
- Usar tablas `_v2` (las activas).
- Paginación con `.range()` para tablas grandes (>1000 filas).

---

> [!NOTE]
>- **Sincronización Obligatoria**: Al finalizar cada implementación, el agente debe seguir el protocolo definido en el Skill oficial: [.claude/skills/shelfy-protocol/SKILL.md](file:///Users/ignaciopiazza/Desktop/CenterMind/.claude/skills/shelfy-protocol/SKILL.md).
