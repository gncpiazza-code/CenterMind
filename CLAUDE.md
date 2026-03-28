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
- Archivo principal: `api.py` (~3000 líneas)

### Frontend (`shelfy-frontend/`)
- **Next.js 16** (App Router) + **React 19** + **TypeScript 5.9**
- **Tailwind CSS 4** + **shadcn/ui**
- **Recharts** para gráficos, **Leaflet / MapLibre** para mapas
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

---

## Entorno y variables de entorno

### Backend — variables en Railway (producción) o `.env` (desarrollo local)
```
SHELFY_API_KEY=          # Clave para endpoints protegidos (bots, RPA, scripts)
SHELFY_JWT_SECRET=       # Secreto para firmar JWT del portal React
SUPABASE_URL=            # URL del proyecto Supabase
SUPABASE_KEY=            # Anon/Service Key de Supabase
WEBHOOK_URL=             # URL pública para webhooks de Telegram (https://api.shelfycenter.com)
DRIVE_TOKEN_JSON=        # (Opcional) Token OAuth de Google Drive, JSON en string
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
| `tabaco` | Tabaco & Hnos S.R.L. | 1 | CHESS |
| `aloma` | Aloma Distribuidores Oficiales | 2 | CHESS |
| `liver` | Liver SRL | 3 | CHESS |
| `real` | Real Tabacalera de Santiago S.A. | 4 | CHESS |

Hay un quinto tenant (`extra`) con credenciales pendientes, sin activar.

---

## Estructura de directorios

```
CenterMind/                     # Root del repo
├── CenterMind/                 # Backend Python
│   ├── api.py                  # FastAPI — todos los endpoints (~3000 líneas)
│   ├── bot_worker.py           # Bot Telegram parametrizado por distribuidor
│   ├── db.py                   # Cliente Supabase singleton
│   ├── utils.py                # leer_excel(), parse_fecha_robusta()
│   ├── requirements.txt
│   └── services/
│       ├── erp_ingestion_service.py      # Ingesta Excel ERP → tablas raw
│       ├── erp_summary_service.py        # Consolidación de deuda
│       ├── cuentas_corrientes_service.py # Procesamiento CC (Excel → gráficos)
│       ├── padron_ingestion_service.py   # Ingesta padrón → tablas v2
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
│       │   ├── admin/          # TabSupervision.tsx (componente central de supervisión)
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

### Tablas activas (NO legacy)

#### Core del sistema
| Tabla | Función |
|---|---|
| `distribuidores` | Clientes del SaaS. Tiene `token_bot`, `estado_operativo`, `feature_flags` |
| `usuarios_portal` | Usuarios del portal React (login, rol, id_distribuidor) |
| `integrantes_grupo` | Vendedores registrados en Telegram. FK a `id_vendedor_v2` |
| `exhibiciones` | **Tabla crítica.** Fotos subidas por vendedores. 76+ referencias en el código |

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
| `erp_deuda_clientes` | Deuda consolidada por cliente (resultado de erp_summary_service) |

#### Cuentas Corrientes
| Tabla | Función |
|---|---|
| `cc_detalle` | **Tabla normalizada.** Una fila por cliente deudor (deduplicada por vendedor+cliente). FK a `vendedores_v2` y `sucursales_v2`. ÚNICA fuente para `/api/supervision/cuentas/{dist_id}`. UNIQUE constraint en `(id_distribuidor, fecha_snapshot, vendedor_nombre, cliente_nombre)` |
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
| `maestro_jerarquia` | Usada en 2 endpoints: `/admin/hierarchy/sync-from-erp` y un select en cuentas corrientes (a migrar) |
| `clientes_pdv` | Sin "v2". ~12 referencias en api.py, deberían apuntar a `clientes_pdv_v2` |
| `sucursales`, `vendedores` | Tablas sin "v2". Algunas referencias legacy en api.py |

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
- `superadmin`: ve todas las distribuidoras
- `admin`: administra su distribuidora
- `supervisor`: supervisa vendedores de su distribuidora
- `evaluador`: evalúa exhibiciones

### `check_dist_permission(user_payload, dist_id)`
Función en api.py que lanza 403 si un usuario no-superadmin intenta acceder a una distribuidora que no es la suya. Se llama al inicio de cada endpoint que recibe `dist_id`.

---

## Endpoints principales (api.py)

### Supervisión (módulo más activo)
```
GET  /api/supervision/vendedores/{dist_id}      # Via RPC fn_supervision_vendedores
GET  /api/supervision/rutas/{id_vendedor}        # Via RPC fn_supervision_rutas
GET  /api/supervision/clientes/{id_ruta}         # Via RPC fn_supervision_clientes
GET  /api/supervision/ventas/{dist_id}           # Ventas desde ventas_v2
GET  /api/supervision/cuentas/{dist_id}          # Lee cc_detalle (nueva tabla)
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
GET /api/supervision/cuentas/{dist_id}
    ↓  agrupa por id_vendedor, incluye sucursal correcta
Frontend TabSupervision → filtra por v.sucursal === selectedSucursal
```

**Importante — deduplicación**: el Excel de CHESS puede traer una fila por comprobante para el mismo par (vendedor, cliente). `_enrich_and_store_cc` deduplica antes de insertar para no violar el UNIQUE constraint de `cc_detalle`. Se suma `deuda_total` y `cantidad_comprobantes`; `antiguedad_dias` toma el máximo.

**Importante — sucursal**: la `sucursal` en `cc_detalle.sucursal_nombre` viene de `sucursales_v2.nombre_erp`, NO del texto del Excel. Esto resuelve el bug del `SUCURSALES_MAP` hardcodeado.

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
// cuentasFiltradas filtra v.sucursal === selectedSucursal
// v.sucursal también viene de sucursales_v2.nombre_erp (via cc_detalle)
// → misma fuente, match exacto garantizado
```

Props que recibe: `{ distId: number, isSuperadmin?: boolean }`
- No-superadmin: `distId` viene del JWT y está fijo
- Superadmin: puede cambiar `distId` con un selector

---

## Convenciones del proyecto

### Python (backend)
- Un archivo `api.py` monolítico con todos los endpoints (no microservicios)
- Los services en `services/` son clases instanciadas una vez al inicio
- El cliente Supabase es `sb` (importado de `db.py`)
- Logging con `logger = logging.getLogger("ShelfyAPI")`
- Los errores de negocio se loguean con `logger.error()` y se devuelven como HTTPException 500

### TypeScript (frontend)
- Toda la comunicación con la API pasa por `src/lib/api.ts` — NO fetch directo en componentes
- Los tipos se definen en `api.ts` junto con la función fetch
- No hay Redux ni Zustand — estado local con useState + contexto mínimo
- Tailwind con variables CSS (`var(--shelfy-bg)`, `var(--shelfy-panel)`, etc.)

### Base de datos
- Siempre filtrar por `id_distribuidor` — nunca queries sin tenant
- Las tablas `_v2` son las activas; las sin sufijo son legacy
- Las tablas `erp_*_raw` son de auditoría, no modificar manualmente
- `cc_detalle` es la tabla authoritative de cuentas corrientes para supervision

---

## Qué NO hacer

- No agregar `SUCURSALES_MAP` hardcodeados en services — la sucursal siempre debe resolverse desde `sucursales_v2`
- No leer de `maestro_jerarquia` en código nuevo — usar tablas `_v2`
- No hacer queries a `cuentas_corrientes_data` en el endpoint de supervisión — usar `cc_detalle`
- No queries sin filtro `id_distribuidor` (excepto superadmin explícito)
- No modificar tablas `erp_*_raw` directamente — son append-only desde los services
- No usar `clientes_pdv` (sin v2) en código nuevo

---

## RPCs de Supabase relevantes

```sql
fn_supervision_vendedores(p_dist_id)   -- Vendedores con sucursal, total rutas y PDV
fn_supervision_rutas(p_id_vendedor)    -- Rutas con día de visita y cantidad PDV
fn_supervision_clientes(p_id_ruta)     -- PDVs de una ruta con coords y fechas
fn_login(p_usuario, p_password)        -- Auth del portal React
```

---

## Estado actual del proyecto (Marzo 2026)

### Módulos estables
- Exhibiciones (Telegram → evaluación → sync)
- Ingesta ERP (Excel upload + RPA push)
- Dashboard KPIs y ranking
- Panel de supervisión (mapa de rutas)
- Autenticación JWT
- **Cuentas Corrientes en supervisión**: `cc_detalle` poblada y funcionando para los 4 tenants

### Módulos en activo desarrollo
- **Migración de legacy**: referencias a `maestro_jerarquia` y `clientes_pdv` (sin v2) pendientes de migrar

### Deuda técnica conocida
- `api.py` monolítico de ~3000 líneas (no refactorizar sin pedido explícito)
- `maestro_jerarquia` tiene 2 puntos de uso restantes
- `clientes_pdv` (sin v2) tiene ~12 referencias en api.py
- APScheduler no distribuido (corre en proceso único)
- `lib/logger.py` del RPA apunta a ruta Windows — solo funciona en Mac vía stdout
