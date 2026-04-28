# CenterMind — Guía para Agentes

**Shelfy** es un SaaS B2B multi-tenant para gestión de fuerza de ventas y exhibiciones. Cada cliente es un "distribuidor" con sucursales, vendedores y rutas. Los vendedores suben fotos vía Telegram; los supervisores evalúan desde un portal React. El sistema cruza esos datos con el ERP del distribuidor para analizar ROI y deuda de cartera.

---

## Stack

| Capa | Tecnología | Notas |
|---|---|---|
| **Backend** | Python 3.11+, FastAPI, Uvicorn | Entry point `api.py` (slim ~100L); lógica en `routers/`, `core/`, `services/` |
| **DB** | Supabase (PostgreSQL) | Cliente singleton `sb` en `db.py`. PostgREST max 1000 filas → paginar con `.range()` |
| **Bot** | python-telegram-bot v20 | Un BotWorker por distribuidor, registrado en lifespan |
| **Frontend** | Next.js 16 App Router, React 19, TypeScript 5.9 | `ignoreBuildErrors: true` — errores TS no bloquean build |
| **UI** | Tailwind CSS 4, shadcn/ui, Google Maps JS API v2 | Tema **light-violet**; variables CSS `--shelfy-*` en `globals.css` |
| **Estado** | Zustand (UI global), TanStack Query v5 (server state) | — |
| **RPA** | Playwright | `motores/`: `ventas.py`, `cuentas_corrientes.py`, `sigo.py`, `padron.py` |

---

## Deploy

| Capa | Plataforma | Trigger |
|---|---|---|
| Backend | Railway · `https://api.shelfycenter.com` | `git push origin main` → ~1-2 min |
| Frontend | Vercel | `git push origin main` automático |
| RPA | Mac local o Docker (Railway) | `python runner.py [padron\|ventas\|cuentas\|sigo\|todos]` |

**Variables de entorno:**
- Backend (Railway): `SHELFY_API_KEY`, `SHELFY_JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_KEY`, `WEBHOOK_URL`
- Frontend (Vercel): `NEXT_PUBLIC_API_URL=https://api.shelfycenter.com`
- RPA: `SUPABASE_URL`, `SUPABASE_KEY`, `SHELFY_API_KEY` + credenciales CHESS/Consolido desde **Supabase Vault** (`chess_tabaco_usuario`, etc.)

---

## Tenants activos

| tenant_id | Nombre | id_distribuidor | ERP |
|---|---|---|---|
| `tabaco` | Tabaco & Hnos S.R.L. | **3** | CHESS |
| `aloma` | Aloma Distribuidores Oficiales | **4** | CHESS |
| `liver` | Liver SRL | **5** | CHESS |
| `real` | Real Tabacalera de Santiago S.A. | **2** | CHESS |
| `extra` | GyG Distribución | **6** | CHESS (credenciales pendientes) |

> Los IDs del padrón (Consolido) y la CC (CHESS) son de **dos ERPs distintos** — no comparten clave directa. El cross-reference entre `cc_detalle` y `clientes_pdv_v2` se hace vía `id_cliente_erp` o matching de nombres normalizado.

---

## Estructura de directorios

```
CenterMind/
├── CenterMind/                 # Backend Python
│   ├── api.py                  # Entry point slim (app + routers + health + WS)
│   ├── core/                   # config.py, security.py, lifespan.py, helpers.py
│   ├── models/schemas.py       # Todos los modelos Pydantic
│   ├── routers/                # auth, erp, supervision, admin, reportes
│   ├── bot_worker.py           # Bot Telegram parametrizado por distribuidor
│   ├── db.py                   # Cliente Supabase singleton `sb`
│   └── services/               # padron_ingestion, ventas_ingestion, padron_ingestion,
│                               #   cuentas_corrientes, erp_ingestion, system_monitoring
├── shelfy-frontend/src/
│   ├── app/                    # login, dashboard, admin, reportes, supervision,
│   │                           #   academy (CC upload), bonos, visor
│   ├── components/admin/       # TabSupervision.tsx, MapaRutas.tsx
│   ├── components/ui/          # shadcn/ui
│   └── lib/api.ts              # TODOS los tipos TS y funciones fetch — no fetch directo en componentes
└── ShelfMind-RPA/
    ├── motores/                # cuentas_corrientes.py, ventas.py, sigo.py, padron.py
    └── lib/                    # vault_client.py, cuentas_parser.py, logger.py
```

---

## Base de datos

### Tablas físicas por tenant
Los nombres lógicos `*_v2` se resuelven con `tenant_table_name(nombre, dist_id)`:
- `clientes_pdv_v2` → `clientes_pdv_v2_3` (para dist_id=3)
- `rutas_v2`, `vendedores_v2`, `sucursales_v2` → mismo patrón

**Reglas:** Nunca hardcodear el sufijo. Siempre usar `tenant_table_name()`. Siempre filtrar por `id_distribuidor` aunque la tabla sea por tenant.

### Tablas activas

| Tabla | Función |
|---|---|
| `distribuidores` | Tenants del SaaS. Campos clave: `token_bot`, `estado_operativo`, `feature_flags` |
| `usuarios_portal` | Usuarios del portal React |
| `integrantes_grupo` | Vendedores en Telegram. FK → `id_vendedor_v2` |
| `exhibiciones` | **Crítica (76+ refs).** `url_foto_drive` = URL Supabase Storage (no Drive). Bucket: `Exhibiciones-PDV/{dist}/{fecha}/` |
| `sucursales_v2` | PK: `id_sucursal`. Campos: `id_sucursal_erp`, `nombre_erp` |
| `vendedores_v2` | PK: `id_vendedor`. FK → `id_sucursal`. Campos: `nombre_erp`, `id_vendedor_erp` |
| `rutas_v2` | Por vendedor. `dia_semana`, `periodicidad` |
| `clientes_pdv_v2` | PDVs. `es_limbo` = PDV sin padrón actualizado |
| `ventas_v2` | Ventas procesadas |
| `cc_detalle` | **Fuente autoritativa de CC.** Una fila por cliente deudor (deduplicada vendedor+cliente). UNIQUE: `(id_distribuidor, fecha_snapshot, vendedor_nombre, cliente_nombre)`. Columnas: `id_cliente_erp TEXT`, `id_cliente INTEGER` (PK de clientes_pdv_v2, resuelto en ingesta) |
| `matcheo_rutas_excepciones` | Franquiciados: mapea Telegram UID franquiciado → vendedor real por cliente ERP |
| `erp_*_raw` | Auditoría ingesta — append-only, no modificar |

### Tablas legacy (NO usar en código nuevo)
`maestro_jerarquia`, `clientes_pdv` (sin v2), `sucursales`/`vendedores` (sin v2), `clientes` (sin pdv/v2), `erp_deuda_clientes` (obsoleta — usar `cc_detalle`), `cuentas_corrientes_data` (solo para módulo academy).

### RPCs de Supabase
```
fn_supervision_vendedores(p_dist_id)  → vendedores con sucursal, rutas, PDV count
fn_supervision_rutas(p_id_vendedor)   → rutas con día y cantidad PDV
fn_supervision_clientes(p_id_ruta)    → PDVs con coords, fechas, url_exhibicion
fn_login(p_usuario, p_password)       → auth portal React
```

---

## Autenticación

**API Key** (`X-Api-Key: {SHELFY_API_KEY}`) — bots, RPA, scripts. Actúa como superadmin.  
**JWT Bearer** — portal React. Payload: `{ id_usuario, id_distribuidor, rol, is_superadmin }`. Expira 8h.

**Roles:** `superadmin` (bypass total), `admin`, `directorio`, `supervisor`, `evaluador`.

`check_dist_permission(user_payload, dist_id)` → 403 si usuario accede a distribuidora ajena, salvo `is_superadmin=True` o permiso `action_switch_tenant`.

---

## Endpoints principales

```
# Supervisión
GET  /api/supervision/vendedores/{dist_id}   # RPC fn_supervision_vendedores
GET  /api/supervision/rutas/{id_vendedor}    # RPC fn_supervision_rutas
GET  /api/supervision/clientes/{id_ruta}     # PDVs con coords, fechas, url_exhibicion
GET  /api/supervision/ventas/{dist_id}
GET  /api/supervision/cuentas/{dist_id}      # Lee cc_detalle. ?sucursal= para filtrar
GET  /api/pendientes/{dist_id}

# CC
POST /api/procesar-cuentas-corrientes        # Upload Excel → cc_detalle
POST /api/v1/sync/cuentas-corrientes         # Sync RPA → cc_detalle

# ERP Ingesta (API Key)
POST /api/v1/sync/erp-{clientes,sucursales,vendedores,ventas,padrón}
POST /api/admin/erp/upload-global

# Auth
POST /auth/login
POST /auth/switch-context/{dist_id}

# Dashboard / Reportes
GET  /api/dashboard/{kpis,ranking}/{dist_id}
GET  /api/reports/{performance,ventas-resumen,auditoria-sigo}/{dist_id}
GET  /api/erp/roi/{dist_id}
```

---

## Flujos clave

### ERP / Padrón
```
Excel (padrón/ventas) → erp_*_raw → padron_ingestion_service / ventas_ingestion_service
                                  → sucursales_v2 → vendedores_v2 → rutas_v2 → clientes_pdv_v2
```
- Upsert idempotente: UNIQUE `(id_distribuidor, id_*_erp)`.
- Padrón trae solo activos → `padron_ingestion_service` marca `estado='inactivo'` a PDVs no presentes.
- **`SUCURSAL_FILTER`** en `padron_ingestion_service.py`: dist_id=2 (Real) filtra solo sucursal `"8"` (`uequin rodrigo`). Real también enruta: `OSCAR ONDARRETA → Bolivar`, `JOSE IGNACIO BIAVA → CARAMELE`.

### Cuentas Corrientes
```
Excel CC (CHESS ERP) → cuentas_parser → _enrich_and_store_cc(dist_id, fecha, rows)
  → match vendedor_nombre → vendedores_v2 (id_vendedor, id_sucursal, sucursal_nombre)
  → match cliente → clientes_pdv_v2 vendor-scoped (id_cliente resuelto en ingesta)
  → DELETE snapshot del día + INSERT deduplicado → cc_detalle
  → GET /api/supervision/cuentas/{dist_id}?sucursal=X
```
- `sucursal_nombre` en `cc_detalle` viene de `sucursales_v2.nombre_erp`, NO del Excel.
- Tabaco tiene ~4578 filas → paginación con `.range()` obligatoria.
- **`id_cliente INTEGER`** en `cc_detalle` = PK de `clientes_pdv_v2_d{id}`, resuelto en `_enrich_and_store_cc` con matching vendor-scoped. Permite cross-reference directo sin name matching en runtime.
- Split Real Tabacalera CC: motor RPA divide `detalle_cuentas` por sucursal y sube a distribuidores distintos.

### Bot Telegram — Exhibición
```
Vendedor sube foto → bot pide nro cliente → foto → Supabase Storage → exhibiciones(Pendiente)
                  → Evaluador evalúa en portal → POST /api/evaluar
                  → sync_evaluaciones_job (30s) → actualiza mensaje Telegram
```
- `url_foto_drive` en `exhibiciones` = URL Supabase Storage (nombre legado, usar directamente).
- Franquiciado interceptor en `bot_worker.py`: `lookup_soto_intercept()` redirige exhibición al vendedor real si hay match en `matcheo_rutas_excepciones`.
- **Exhibiciones QA (dist=3/Tabaco):** NACHO PIAZZA (v2=157) y JESUS GRIMALDI (v2=76) excluidos de ranking/visor salvo superadmin. Ver `core/helpers.py`: `build_qa_exhibicion_integrante_ids`, `should_apply_exhibicion_qa_filter`.

---

## Componentes frontend clave

### `TabSupervision.tsx` — Panel de supervisión

- **3 tabs:** Mapa de rutas / Ventas / Cuentas Corrientes.
- `selectedSucursal` viene de `sucursales_v2.nombre_erp` — siempre usar ese valor para filtrar.
- CC se carga lazy (`useQuery` con `enabled: !!selectedDist && !!selectedSucursal`), no al mount.
- **React Query keys** deben incluir `distId`: `['supervision-rutas', distId, id_vendedor]`, `['supervision-clientes', distId, id_ruta]`.
- **`pines` useMemo:** deduplica PDVs por `id_cliente_erp` (mismo cliente en varias rutas). Filtra coords válidas con `hasValidCoords(lat, lng)` (bounding box Argentina: lat ∈ [-55,-21], lng ∈ [-74,-53]).
- **Modo Deudores:** matching de deuda en `pines` prioriza 1) `deudaById.get(id_cliente)` 2) `deudaByErpId.get(normErpId)` 3) `deudaByNombre` normalizado. Requiere que `cc_detalle.id_cliente` esté resuelto en DB.
- Color por vendedor: picker + reset, persistido en Zustand por `distId:vendorId`.

### `MapaRutas.tsx` — Mapa Google Maps

- Marcadores HTML sobre Google Maps JS API v2.
- **NO usar `transform: scale()`** en animaciones de marcadores (conflicto GPU/canvas). Usar `box-shadow`.
- `fitBounds({ animate: false })` — crítico para evitar drift de marcadores.
- `map.resize()` vía `ResizeObserver` al cambiar de tab o fullscreen.
- `normalizeKey()` normaliza nombres para matching: strip acentos + puntuación, lowercase.

### Galería (`ExhibicionesTimelineDialog.tsx`)

- `useInfiniteQuery` con `GET /api/galeria/cliente/{id_cliente_pdv}/timeline` → `{items, has_more}`.
- Agrupa por fecha (1 fecha = 1 exhibición lógica). Deduplica URLs repetidas.

---

## Convenciones

### Python
- `logger = logging.getLogger("ShelfyAPI")`. Errores de negocio → `logger.error()` + `HTTPException(500)`.
- Supabase client: `sb` (de `db.py`).
- Nombres de vendedores: `_get_erp_name_map` preserva identidad si `nombre_integrante` ya coincide con `vendedores_v2.nombre_erp`.
- Bot Telegram: flujo "silent-first" para tipo PDV (perfil histórico + trust).

### TypeScript / Frontend
- Todo fetch pasa por `src/lib/api.ts`. Tipos definidos ahí mismo.
- Permisos: usar `hasPermiso("clave")` del AuthContext — no leer `user.permisos` directo.
- `useEffect` con fetch: cleanup con flag `cancelled` o `AbortController`.
- `DatePicker` (`@/components/ui/date-picker`) para campos de fecha — no `<input type="date">`.
- shadcn instalados: Button, Card, Input, Label, Avatar, Badge, Skeleton, Select, Alert, Dialog, Sheet, Tabs, Progress, Tooltip, Separator, ScrollArea, Form, Popover, Checkbox, Table, DropdownMenu, Sonner. Agregar: `npx shadcn@latest add <component>`.
- Toasts: `toast()` de `sonner`. Loading: `<Skeleton>`. Errores: `<Alert variant="destructive">`.

### shadcn crítico
`cn()` para clases condicionales. `size-*` para dimensiones iguales. Colores semánticos (`text-muted-foreground`, `bg-primary`) — nunca hex hardcodeado. `Avatar` siempre con `AvatarFallback`. `Dialog`/`Sheet` siempre con `Title`.

---

## Motores RPA — Ingesta automática

> **IMPORTANTE:** El módulo "Academy" (upload manual de Excel CC desde el portal) ya NO se usa. Toda la ingesta se hace exclusivamente vía los motores RPA del `ShelfMind-RPA/` o el endpoint `/api/v1/sync/*` con API Key. No pedir al usuario que ingrese datos por Academy.

### Horarios (zona Argentina — `America/Argentina/Buenos_Aires`)

| Hora | Motor | Acción |
|---|---|---|
| 06:00 | `padron.py` | Descarga padrón de Consolido para todos los tenants activos |
| 15:00 | `padron.py` | Segunda pasada diaria del padrón |
| 07:00 | `cuentas_corrientes.py` | Descarga CC de CHESS ERP para todos los tenants activos |
| 14:30 | `cuentas_corrientes.py` | Segunda pasada diaria de CC |

El `scheduler.py` corre en el contenedor RPA (Railway o Mac) y dispara cada motor a su hora. En producción corre siempre con `python scheduler.py`.

### Motor `cuentas_corrientes.py`

**Qué hace:** Para cada tenant activo, abre Chrome headless, hace login en CHESS ERP (`https://{tenant}.chesserp.com/AR{id}`), navega a `/#/cuentas-por-cobrar/reportes/saldos-totales`, hace click en Procesar, descarga el Excel de Saldos Totales, lo parsea con `cuentas_parser.py`, compara hash MD5 con el día anterior (si es igual, no hace nada), y sube el JSON al backend.

**Endpoint al que llama:** `POST /api/v1/sync/cuentas-corrientes?id_distribuidor={id}` (API Key)

**Tablas que alimenta:** `cc_detalle` (via `_enrich_and_store_cc` en `core/helpers.py`)  
→ DELETE snapshot del día + INSERT deduplicado por `(vendedor_nombre, cliente_nombre)`

**Tenants procesados:**

| id | CHESS ERP URL | id_dist | Vault keys |
|---|---|---|---|
| `tabaco` | tabacohermanos.chesserp.com/AR1149 | 3 | `chess_tabaco_usuario/password` |
| `aloma` | alomasrl.chesserp.com/AR1252 | 4 | `chess_aloma_usuario/password` |
| `liver` | liversrl.chesserp.com/AR1274 | 5 | `chess_liver_usuario/password` |
| `real` | realtabacalera.chesserp.com/AR1272 | 2 | `chess_real_usuario/password` |
| `extra` | (pendiente credenciales) | 6 | — |

**Real Tabacalera split:** divide `detalle_cuentas` por sucursal (`UEQUIN RODRIGO → dist La Magica`, `OSCAR ONDARRETA → Bolivar`, `JOSE IGNACIO BIAVA → CARAMELE`), resolviendo `id_distribuidor` por nombre vía API.

### Motor `padron.py`

**Qué hace:** Para cada tenant, abre Chrome headless, hace login en Consolido (nextbyn), descarga el Excel de Padrón de Clientes, compara hash MD5, y sube el archivo al backend.

**Endpoint al que llama:** `POST /api/v1/sync/erp-padrón?id_distribuidor={id}` (API Key)

**Tablas que alimenta:** `sucursales_v2_d{id}` → `vendedores_v2_d{id}` → `rutas_v2_d{id}` → `clientes_pdv_v2_d{id}`  
→ Upsert idempotente. Marca `estado='inactivo'` a PDVs ausentes del Excel.

**Tenant config:** Lee de tabla `rpa_consolido_tenants` en Supabase (fallback a `TENANTS_LEGACY` en código). Credenciales: vault `consolido_usuario` / `consolido_password` (únicas para todos los tenants de Consolido).

### Ejecución manual

```bash
cd ShelfMind-RPA
# Un motor específico:
python runner.py cuentas       # CC para todos los tenants
python runner.py padron        # Padrón para todos los tenants

# O directamente:
python -c "import asyncio; from motores.cuentas_corrientes import run; asyncio.run(run())"
```

---

## Qué NO hacer

- ❌ Hardcodear `SUCURSALES_MAP` — siempre resolver desde `sucursales_v2`
- ❌ Leer de `maestro_jerarquia`, `clientes_pdv` (sin v2), `erp_deuda_clientes` — tablas legacy/obsoletas
- ❌ Queries a `cuentas_corrientes_data` en supervisión — usar `cc_detalle`
- ❌ Usar `erp_summary_service` — eliminado, la deuda la provee `cc_detalle`
- ❌ `transform: scale()` en marcadores MapLibre/Google Maps — usar `box-shadow`
- ❌ Asumir que `url_foto_drive` es Google Drive — es Supabase Storage, usar directamente
- ❌ Modificar `erp_*_raw` manualmente — append-only desde services
- ❌ Omitir filtro `id_distribuidor` en queries — regla de tenant estricta
- ❌ `.select()` sin paginación en tablas grandes — usar `.range()` en loop

---

> **Sincronización Obligatoria:** Al finalizar cada implementación, seguir el protocolo del Skill: [`.claude/skills/shelfy-protocol/SKILL.md`](.claude/skills/shelfy-protocol/SKILL.md)
