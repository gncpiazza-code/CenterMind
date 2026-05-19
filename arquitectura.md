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

## Endpoints Nucleares

- Supervision: `/api/supervision/*`, `/api/pendientes/*`
- Dashboard/reportes: `/api/dashboard/*`, `/api/reports/*`
- Difusion: `/api/difusion/*`
- ERP sync: `/api/v1/sync/*`
- Auth: `/auth/login`, `/auth/switch-context/{dist_id}`
- WS: `/api/ws/exhibiciones/{dist_id}`, `/api/ws/superadmin`
- Tickets portal: `/api/portal-feedback/messages` (filtros), `/api/portal-feedback/messages/export` (JSON), `/api/portal-feedback/messages/{id}/pre-resolucion` (IA opcional)

## Invariantes Operativas

- KPI/ranking: contar exhibicion logica unica (no fotos duplicadas).
  - Definicion canonica: 1 conteo por (id_integrante, cliente_key, calendar_day_AR).
  - Modulo: `core/exhibicion_aggregate.py` — `build_logic_key`, `aggregate_exhibicion_counts`, `aggregate_exhibicion_counts_vendor_scope` (objetivos compañía), `aggregate_ranking_by_vendor`, `aggregate_kpi_totals`.
  - Fallback: url_foto_drive → (telegram_chat_id, msg_id) → id_exhibicion.
  - Ganador por score: Destacado 3 > Aprobado 2 > Rechazado 1 > Pendiente 0.
  - Bot Telegram: `get_stats_vendedor`, `/stats`, mensaje post-carga y `get_ranking_periodo` usan el mismo modulo (no `fn_bot_stats_vendedor` legacy).
  - RPC `fn_dashboard_ranking` deprecado: no usar como fallback.
  - RPC `fn_bot_stats_vendedor`: migracion `sql/2026-05-19_fn_bot_stats_vendedor_logical.sql` alinea SQL si algo lo invoca directo.
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
