# Arquitectura de Shelfy CenterMind (Lean)

Documento de referencia tecnica estable para agentes y desarrolladores.

## Stack

- Frontend: Next.js 16, React 19, TypeScript 5.9, Tailwind 4, shadcn/ui.
- Backend: FastAPI (Python 3.11+), Uvicorn.
- DB: Supabase PostgreSQL.
- Estado frontend: Zustand + TanStack Query v5.
- Bot: python-telegram-bot v20.
- RPA: Playwright (`ShelfMind-RPA/`).

## Componentes Principales

- `CenterMind/api.py`: entry point slim.
- `CenterMind/routers/`: auth, supervision, admin, reportes, difusion, erp.
- `CenterMind/core/helpers.py`: enrichment y utilidades tenant-safe (incl. `is_vendedor_excluido_objetivos`).
- `CenterMind/core/exhibicion_aggregate.py`: definicion canonica de exhibicion logica unica.
- `CenterMind/core/objetivos_compradores.py`: medicion canonica de compradores en periodo (fuente unica para watcher y supervision). **No tocar activacion ni conversion_estado desde este modulo.**
- `CenterMind/core/bot_cliente_cartera.py`: validacion de cartera del vendedor para el bot. `normalize_erp`, `cliente_en_cartera_vendedor(dist, vendedor_v2, erp, sb)`, `get_pdv_display_row`. **Fail-open**: error de infra → False (no bloquear al vendedor).
- `CenterMind/services/bot_pdv_aviso_service.py`: avisos post-padron para PDVs nuevos declarados en el bot. `procesar_pendientes(dist_id)` — llamado al final de `_ingest_for_dist` tras reconcile.
- `CenterMind/services/objetivos_launch_service.py`: lanzamiento de objetivos planificados (auto y manual). Funciones: `lanzar_un_objetivo(obj_id, dist_id)`, `lanzar_programados_fecha(dist_id?)`. Llamado por cron 08:00 AR (lifespan.py) y por endpoint `POST /api/supervision/objetivos/{id}/lanzar`.
- `shelfy-frontend/src/lib/api.ts`: contrato unico de fetch/tipos.
- `ShelfMind-RPA/motores/`: padron, cuentas, ventas, sigo.

## Reglas de Multi-Tenant

- Resolver tablas por tenant con `tenant_table_name()`.
- Nunca hardcodear sufijos `_d{id}`.
- Mantener filtro `id_distribuidor` en todas las consultas.
- En frontend, query keys deben incluir `distId`.

## Flujos Criticos

### ERP / Padron

`Excel -> erp_*_raw -> padron_ingestion_service -> sucursales_v2 -> vendedores_v2 -> rutas_v2 -> clientes_pdv_v2`

Claves:

- Upsert idempotente por `(id_distribuidor, id_*_erp)`.
- Soporte de anulados (`motivo_inactivo='padron_anulado'`).
- Ausentes del padron: `padron_absent`.
- Objetivos `ruteo_alteo` se calculan por `fecha_alta` del padrón (no por cambio de ruta), usando el timestamp de creación del objetivo como corte.

### Cuentas Corrientes

`CHESS (JSON/Excel) -> parser -> _enrich_and_store_cc -> cc_detalle`

Claves:

- Resolver `id_cliente` en ingesta (no en runtime).
- Filtro por sucursal/vendedor en backend para evitar cruces.
- Tablas grandes: paginacion obligatoria.

### Exhibiciones

`Telegram -> bot_worker -> Supabase Storage -> exhibiciones -> evaluacion en portal`

Claves:

- `url_foto_drive` es URL de Supabase Storage (nombre legado).
- Watcher actualiza objetivos y emite eventos.
- Objetivos de compania tipo exhibicion aplican retroactividad mensual: el watcher toma como inicio el primer dia de `mes_referencia` (no `created_at`).
- El watcher normaliza `origen` (p.ej. `compañia`/`compania`) y usa fallback de mes (`fecha_objetivo` o `created_at`) para no perder retroactividad.
- Notificaciones Telegram de progreso quedaron acotadas a eventos de exhibicion para evitar spam operativo.

### Dashboard (ranking + últimas)

- `routers/reportes.py` es la fuente única de composición para `/api/dashboard/ranking/*` y `/api/dashboard/ultimas-evaluadas/*`.
- `ciudad_dominante` se calcula con `rutas_v2` + `clientes_pdv_v2` filtrando siempre por `id_distribuidor` para evitar cruces cross-tenant.
- En `ultimas-evaluadas`, el PDV se muestra solo si `clientes_pdv_v2.id_ruta` pertenece al `id_vendedor` del integrante que subió la foto (`pdv_asignado_vendedor`). Fallback ERP sin validación de ruta queda deshabilitado.
- `ciudad_dominante` en ranking se calcula por `id_vendedor` (no por nombre ERP) y se omite si hay homónimos en ciudades distintas.

## Re-evaluación Compañía (overlay paralelo)

- Tabla global: `exhibicion_reevaluacion_compania` (no por tenant, con `id_distribuidor`).
- Roles: `superadmin` / `directorio` únicamente.
- El estado del distribuidor (`exhibiciones.estado`) **nunca se modifica**.
- Ranking compañía = `apply_compania_estado_overlay` + `aggregate_ranking_by_vendor` via `routers/compania_revision.py`.
- Endpoint: `GET /api/dashboard/ranking-compania/{dist_id}` devuelve `puntos_compania`, `puntos_oficial`, `delta_puntos` por vendedor.
- Galería: `galeria_timeline_cliente` enriquece items con `reevaluaciones[]` cuando el usuario es Compañía.
- Tests: `test_exhibicion_aggregate_compania_overlay.py` (8/8).

## Endpoints Nucleares

- Supervision: `/api/supervision/*`, `/api/pendientes/*`
- Dashboard/reportes: `/api/dashboard/*`, `/api/reports/*`
- Difusion: `/api/difusion/*`
- ERP sync: `/api/v1/sync/*`
- Auth: `/auth/login`, `/auth/switch-context/{dist_id}`
- WS: `/api/ws/exhibiciones/{dist_id}`, `/api/ws/superadmin`
- Tickets portal: `/api/portal-feedback/messages` (filtros), `/api/portal-feedback/messages/export` (JSON), `/api/portal-feedback/messages/{id}/pre-resolucion` (IA opcional)
- Revisión Compañía: `POST /api/compania/reevaluar`, `GET /api/compania/reevaluaciones/{id_exhibicion}`, `GET /api/dashboard/ranking-compania/{dist_id}` (solo roles Compañía)
- Objetivos planificados: `POST /api/supervision/objetivos/{id}/lanzar` (lanzar manualmente), `POST /api/supervision/objetivos/preview-telegram` (preview mensaje)

## Invariantes Operativas

### Exhibicion logica — ranking y KPIs (regla de oro)

**Toda llamada** que exponga ranking, puntos de exhibicion, stats de vendedor o avance de objetivos compania (exhibicion) debe aplicar:

> **1 conteo maximo por (vendedor_erp, cliente_key, calendar_day_AR)**

No por foto. No por fila SQL. No por integrante Telegram aislado si comparten el mismo nombre ERP.

| Dimension | Regla |
|-----------|--------|
| Vendedor | Nombre ERP (`iid_to_erp`); expandir todos los `id_integrante` del mismo ERP via `integrante_ids_for_erp_vendors` |
| Cliente | `id_cliente_pdv` → `id_cliente` → `cliente_sombra_codigo` |
| Dia | `timestamp_subida[:10]` (AR) |
| Colision | Mayor `exhibicion_score` gana |

**Modulo canonico:** `core/exhibicion_aggregate.py`

- Ranking / dashboard / bot `/ranking`: `aggregate_ranking_by_vendor`
- Stats bot, post-carga, objetivos compania exhibicion: `aggregate_exhibicion_counts_vendor_scope` + `vendor_logic_key`
- Por integrante (no ranking): `aggregate_exhibicion_counts` con `build_logic_key(iid, cliente, dia)`
- Supervision totales por PDV: `count_logical_per_client`

**Prohibido en codigo nuevo:** `COUNT(*)` sobre `exhibiciones` sin dedup; fallback a `fn_dashboard_ranking`; ranking por `id_exhibicion` cuando hay cliente+dia.

**Consumidores alineados (2026-05):** `routers/reportes.py`, `bot_worker.py` (`get_ranking_periodo`, `get_stats_vendedor`), `services/objetivos_watcher_service.py`, `routers/supervision.py` (parcial via `count_logical_per_client`).

**Tests:** `test_exhibicion_aggregate_vendor_scope.py`. **SQL legacy:** `sql/2026-05-19_fn_bot_stats_vendedor_logical.sql` si RPC directo.
- Objetivos: vendedores bucket (sin vendedor, supervisor) nunca reciben objetivos.
  - Helper: `core/helpers.is_vendedor_excluido_objetivos(nombre_erp)`.
  - Aplicado en: lista API vendedores, endpoint POST crear_objetivo, frontend.
- QA Tabaco (no superadmin): excluir cuentas de prueba en ranking/visor.
- En UI operativa de rutas: jerarquia **Dia -> Ruta**.
- Para objectives de compania: periodo mensual fijo.
- Recordatorios de objetivos por bot: envio diario 08:00 AR a vendedores con metas activas (resumen de progreso y vencimiento).

## Riesgos Tecnicos

- Limite PostgREST de 1000 filas por pagina.
- Riesgo de mezcla cross-tenant por query keys incompletas.
- Dependencia de consistencia en mapeo vendedor Telegram <-> ERP.

## Pendientes de Arquitectura

1. Eliminar uso residual de tablas legacy en admin.
2. Evaluar scheduler fuera del proceso API.
3. Definir estrategia de archivo mensual de cambios tecnicos.
