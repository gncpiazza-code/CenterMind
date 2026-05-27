# CenterMind — Guia para Agentes (Lean)

Manual compacto para que cualquier LLM ejecute tareas en Shelfy con bajo costo de contexto.

## 1) Contexto rapido del producto

- Shelfy es SaaS B2B multi-tenant para fuerza de ventas y exhibiciones.
- Flujo principal: Telegram (captura) -> backend -> portal de supervision/evaluacion.
- Tenants activos: `tabaco`, `aloma`, `liver`, `real`, `extra` (pendiente credenciales).

## 2) Stack

- Backend: FastAPI + Python 3.11+
- Frontend: Next.js 16 + React 19 + TS 5.9
- DB: Supabase PostgreSQL
- Bot: python-telegram-bot v20
- RPA: Playwright (`ShelfMind-RPA/`)

## 3) Reglas criticas de datos

- Resolver tablas por tenant con `tenant_table_name()`.
- Nunca hardcodear sufijos de tablas.
- Nunca omitir `id_distribuidor`.
- PostgREST pagina en 1000 filas: usar loops con `.range()`.

Patron obligatorio:

```python
PAGE = 1000
rows = []
offset = 0
while True:
    batch = sb.table(t).select("*").range(offset, offset + PAGE - 1).execute().data or []
    rows.extend(batch)
    if len(batch) < PAGE:
        break
    offset += PAGE
```

## 4) Endpoints base (core)

- Supervision: `/api/supervision/*`, `/api/pendientes/*`
- Dashboard/reportes: `/api/dashboard/*`, `/api/reports/*`
- Difusion: `/api/difusion/*`
- ERP sync: `/api/v1/sync/*`
- Auth: `/auth/login`, `/auth/switch-context/{dist_id}`
- WebSocket: `/api/ws/exhibiciones/{dist_id}`, `/api/ws/superadmin`

## 5) Invariantes de negocio

### Exhibicion logica — ranking y KPIs (NO NEGOCIABLE)

Toda metrica de **ranking**, **KPIs de exhibicion**, **stats Telegram** (`/stats`, post-carga) y **objetivos compania tipo exhibicion** debe contar con dedup obligatorio:

**1 exhibicion logica = maximo 1 conteo por (vendedor_erp, cliente_key, calendar_day_AR)**

- `cliente_key`: `id_cliente_pdv` → `id_cliente` → `cliente_sombra_codigo`
- `calendar_day_AR`: primeros 10 chars de `timestamp_subida` (fecha AR)
- Varios `id_integrante` / grupos Telegram del mismo vendedor ERP: **no sumar de nuevo** la misma visita (mismo cliente + mismo dia)
- Varias fotos del mismo cliente el mismo dia: **1 sola**; gana la de mayor score (Destacado 3 > Aprobado 2 > Rechazado 1 > Pendiente 0)

**Modulo unico obligatorio:** `CenterMind/core/exhibicion_aggregate.py`

| Uso | Funcion |
|-----|---------|
| Ranking dashboard / bot `/ranking` | `aggregate_ranking_by_vendor` |
| Stats bot, post-carga, KPIs agregados | `aggregate_exhibicion_counts_vendor_scope` |
| Conteo por integrante (casos puntuales) | `aggregate_exhibicion_counts` — **no** usar para ranking ni objetivos compania |
| Supervision `total_exhibiciones` por cliente | `count_logical_per_client` |

**Tests de regresion:** `CenterMind/test_exhibicion_aggregate_vendor_scope.py` (dos integrantes, mismo cliente/dia → 1 punto).

**Auditoria:** `CenterMind/scripts/audit_ranking_abril_tabaco.py`, `audit_stats_ranking_all_dist_silent.py`.
- `cc_detalle` es fuente autoritativa para cuentas corrientes.
- `url_foto_drive` apunta a Supabase Storage (nombre legacy).
- En objetivos operativos: rutas con jerarquia **Dia -> Ruta**.
- Objetivos de compania: periodo mensual y prorrateo semanal/diario.

## 6) Frontend conventions

- Todo fetch pasa por `shelfy-frontend/src/lib/api.ts`.
- Permisos con `hasPermiso()`, no leer `user.permisos` directo.
- `DatePicker` obligatorio para fechas.
- En creacion de objetivos de origen distribuidora, `fecha_objetivo` es obligatoria (validar UI + backend).
- shadcn/ui obligatorio para componentes base.
- En mapas, no usar `transform: scale()` para animacion de marcadores.

## 7) RPA operacional

- `padron.py`: corrida diaria 07:00 (AR).
- `cuentas_corrientes.py`: 07:00 y 14:30 (AR).
- `real` usa split por sucursal en cuentas.
- Variables clave: `PADRON_INCLUIR_ANULADOS`, `RPA_CUENTAS_ENGINE`, `RPA_CUENTAS_FORCE_EXCEL`.

## 8) Seguridad y acceso

- API Key (`X-Api-Key`) para bots/RPA/scripts.
- JWT para portal.
- Roles: `superadmin`, `admin`, `directorio`, `supervisor`, `evaluador`.
- `check_dist_permission(...)` valida acceso cross-tenant.

## 9) Que NO hacer

- No usar tablas legacy en codigo nuevo.
- No consultar `cuentas_corrientes_data` para supervision.
- No modificar `erp_*_raw` manualmente.
- No escribir queries sin paginacion en tablas grandes.
- No romper aislamiento tenant en frontend ni backend.

### Exhibicion / ranking — errores que NO se pueden repetir

- **NO** contar filas crudas de `exhibiciones` (`COUNT(*)`, `len(rows)`) para ranking, KPIs visibles ni stats de vendedor.
- **NO** usar RPC `fn_dashboard_ranking` ni fallback a RPC legacy en bot (`bot_worker.get_ranking_periodo`).
- **NO** contar por `id_exhibicion` ni por foto cuando existen `cliente_key` + `calendar_day_AR`.
- **NO** deduplicar ranking solo por `id_integrante` (dos grupos del mismo vendedor ERP duplicarian puntos).
- **NO** agregar un endpoint o job nuevo de ranking/stats sin pasar por `exhibicion_aggregate.py` y test de vendor-scope.

## 9.1) Objetivos + Telegram (convenciones nuevas)

- Mensajes Telegram de alta de objetivos deben incluir instruccion accionable clara y referencia a `/objetivos`.
- Bot envia recordatorio diario de objetivos a las 08:00 AR para vendedores con objetivos activos.
- Retroactividad solo para objetivos de compania tipo `exhibicion`: calcular avance desde `mes_referencia`.
- En retroactividad de compania, normalizar `origen` y aplicar fallback de mes (`fecha_objetivo`/`created_at`) si falta `mes_referencia`.
- Evitar spam de progreso por Telegram: reservar notificaciones de avance para exhibicion; resto usa alta/cierre.
- Tipo `ruteo` (guía de cambio de ruta): **solo uso interno** (portal/PDF); **no** enviar mensaje Telegram, **no** preview Telegram en UI.
- En `ruteo_alteo`, el cumplimiento debe evaluarse por `fecha_alta` de padrón; no usar cambio de ruta como señal.

### Filtro `/objetivos` bot (implementado 2026-05-22)

- Helper canonico: `CenterMind/core/objetivos_filters.py` → `objetivo_activo_para_vendedor(obj, hoy)`.
- Activo = tipo != ruteo AND fecha_objetivo >= hoy_AR AND lanzado_at IS NOT NULL.
- `cumplido=true` NO excluye (mostrar 125/100).
- Planificados sin `lanzado_at` se excluyen (el vendedor aun no recibio el objetivo).
- Query ordena por `fecha_objetivo asc` (antes era `created_at desc`).

### UX modal objetivos portal (implementado 2026-05-22)

- `KanbanCard` es minimalista: badges tipo/origen, dias restantes, vendedor, barra progreso, fechas inicio/fin.
- Click en card abre `ObjetivoDetalleModal` (Dialog shadcn centrado con overlay).
- El modal contiene: `ObjetivoResumen` (campos estructurados, sin descripcion Telegram cruda), barra progreso real, `ObjetivoProrrateoCalendario` (grilla lun-sab), lista PDVs y acciones.
- `isTelegramObjectiveMessage(desc)` detecta payloads Telegram crudos — no renderizarlos directo.
- Prorrateo distribuidora: rango max(fecha_inicio, lanzado_at, created_at) → fecha_objetivo; **sin retroactividad**.
- Componentes en `shelfy-frontend/src/components/objetivos/`: `ObjetivoDetalleModal.tsx`, `ObjetivoResumen.tsx`, `ObjetivoProrrateoCalendario.tsx`.
- Utils en `shelfy-frontend/src/lib/objetivo-utils.ts`: `isTelegramObjectiveMessage`, `periodoProrrateo`, `DiaHabil`.

## 9.3) Dashboard rediseñado (2026-05-27)

- Layout: `DashboardKpiCarousel` (slides 0/1/2) sobre `DashboardToolbar`, luego 25% `HeroCarousel` / 75% `RankingTable`.
- Período: `PeriodPreset` = `"hoy"|"semana"|"mes"|"mes-custom"` via `resolvePeriodBounds()` en `dashboard-period.ts`. Backend acepta `semana` en `_resolve_period_bounds`.
- KPIs extendidos: `vendedores_activos` (via `count_active_vendors`) y `exhibiciones_por_vendedor` (`total_logicas / vendedores_activos`).
- Slide 2 del carousel: gráfico único rotativo (evolucion | top vendedores), sin layout 2×2.
- HeroCarousel filtra rechazadas. Badges triple (Pendiente/Aprobado/Destacado), iconos PDV (Hash, Building2, MapPin).
- RankingTable: autoscroll + pause; botón fullscreen (`DashboardFullscreenButton`); sin footer de informe.
- WS invalida queries: kpis, ranking, ultimas, evolucion, sucursales.
- Componentes nuevos en `components/dashboard/`: `DashboardKpiCarousel`, `DashboardToolbar`, `DashboardPeriodPills`, `DashboardFullscreenButton`.
- Util nuevo: `lib/dashboard-period.ts`.
- FiltrosBar y ChartCarousel conservados pero NO usados en `page.tsx` (pueden eliminarse en limpieza futura).

## 9.2) Tickets de portal (operativo)

- Superadmin debe poder filtrar tickets por estado, categoria, distribuidora y texto.
- Export oficial para auditoria/extraccion: `GET /api/portal-feedback/messages/export` (JSON con `meta` + `items`).
- Pre-resolucion automatica: endpoint `POST /api/portal-feedback/messages/{id}/pre-resolucion` con Gemini opcional y fallback por reglas locales.

## 10) Protocolo Shelfy (obligatorio)

Antes de implementar:

1. Leer `CLAUDE.md`, `progress.md`, `arquitectura.md`, `frontend.md`.
2. Analizar impacto funcional/tecnico.
3. Si hay cambios de UI, priorizar consistencia con reglas de frontend.
4. Al finalizar, sincronizar estos 4 archivos de contexto.

Salida recomendada al cerrar la tarea:

- "Protocolo de coordinacion de Shelfy completado con exito".
