# Arquitectura Shelfy (Lean)

Referencia estable. Detalle: `docs/context/README.md`

## Stack

Next.js 16 · FastAPI · Supabase · Zustand + TanStack Query · Bot telegram v20 · RPA Playwright

## Entry points

- `CenterMind/api.py` · `routers/*` · `shelfy-frontend/src/lib/api.ts`

## Módulos canónicos (usar siempre)

| Módulo | Path | Uso |
|--------|------|-----|
| Tenants RPA | `core/rpa_tenant_registry.py` | `CONSOLIDO_TENANTS`, `TENANT_DIST_MAP` |
| Exhibición dedup | `core/exhibicion_aggregate.py` | Ranking, KPIs, stats |
| Compradores | `core/objetivos_compradores.py` | Watcher + stats (no tocar activación) |
| Telegram binding | `core/telegram_group_matcher.py` | Scoring, drift, apply |
| Galería pubs | `core/galeria_publicaciones.py` | Viewer IG |
| Roles | `core/roles.py` | `normalize_rol()` |
| Bot cartera | `core/bot_cliente_cartera.py` | Fail-open |
| Objetivos launch | `services/objetivos_launch_service.py` | Cron 08:00 AR |

## Multi-tenant

`tenant_table_name()` · filtro `id_distribuidor` · query keys FE con `distId`  
Catálogo: **`docs/context/modules/tenants.md`** · registry `core/rpa_tenant_registry.py`

## Flujos

**Padrón:** Excel → `erp_*_raw` → `padron_ingestion_service` → `*_v2` jerarquía sucursal→vendedor→ruta→PDV

**CC:** CHESS → `cc_detalle` (resolver `id_cliente` en ingesta)

**Exhibiciones:** Telegram → Storage → `exhibiciones` → evaluación portal → watcher objetivos

**Dashboard:** `routers/reportes.py` compone ranking/últimas; dedup vía aggregate

## Endpoints nucleares

Supervision · Dashboard · Difusión · ERP sync · Auth · WS · Portal feedback · Compañía reevaluación · Galería mapa bbox · Objetivos lanzar/preview · **Mapa capas planificación** `/api/supervision/mapa/capas`

## Riesgos

- PostgREST 1000 · query keys incompletas cross-tenant · drift Telegram↔ERP

## Pendientes arquitectura

1. Admin legacy → `_v2` 2. Scheduler fuera API 3. Changelog mensual en `docs/context/changelog/`

## Profundizar

- Tenants: `docs/context/modules/tenants.md`
- Exhibición: `docs/context/modules/exhibicion-ranking.md`
- Galería: `docs/context/modules/galeria-mapa.md`
- Supervisión mapa: `docs/context/modules/supervision-mapa.md`
