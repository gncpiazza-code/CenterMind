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
- `cuentas_corrientes.py`: 07:00, 14:30 y 20:00 (AR).
- `informe_ventas.py` (Consolido → `ventas_enriched_v2`): 09:30 **rolling7 → ayer**; 13/17/21 **rolling7 → hoy** (mín. día 1 del mes; el 1º del mes a las 09:30 solo cierra el último día del mes anterior). Backfill: `mtd` o `DD/MM/YYYY DD/MM/YYYY`. **Retirado:** CHESS comprobantes (`runner.py ventas`).
- `real` usa split por sucursal en cuentas.
- Variables clave: `PADRON_INCLUIR_ANULADOS`, `RPA_CUENTAS_ENGINE`, `RPA_CUENTAS_FORCE_EXCEL`.

## 8) Seguridad y acceso

- API Key (`X-Api-Key`) para bots/RPA/scripts.
- JWT para portal.
- Roles: `superadmin`, `admin`, `compania` (ex `directorio`), `supervisor`, `evaluador`.
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
- HeroCarousel: nombre de vendedor permitido en 2 líneas (`line-clamp-2`), sin truncado rígido a 1 línea.
- RankingTable: autoscroll + pause; botón fullscreen (`DashboardFullscreenButton`); sin footer de informe.
- RankingTable: autoscroll en loop estable para listas >1 vendedor (duplicación de filas para evitar cortes).
- DashboardKpiCarousel: slide 0 sin texto visible "Estados" (solo dots de navegación).
- WS invalida queries: kpis, ranking, ultimas, evolucion, sucursales.
- Componentes nuevos en `components/dashboard/`: `DashboardKpiCarousel`, `DashboardToolbar`, `DashboardPeriodPills`, `DashboardFullscreenButton`.
- Util nuevo: `lib/dashboard-period.ts`.
- FiltrosBar y ChartCarousel conservados pero NO usados en `page.tsx` (pueden eliminarse en limpieza futura).

## 9.5) Galería Mapa Apple (implementado 2026-06-01)

### Layout

- `GaleriaToolbar` con toggle Mapa/Grid, dropdown vendedor, filtro estado y checkbox ocultar-sin-exhib.
- Vista default: **Mapa**. Vista alternativa: **Grid** (tarjetas por PDV, pre-existente).

### Mapa

- Motor: **MapLibre GL JS** con tile style Carto Positron (light, sin key).
- Clustering nativo: zoom < 12 → círculos WebGL (`GaleriaMapClusterPin`). zoom >= 12 → pins HTML individuales (`GaleriaMapPhotoPin`), cap 250 DOM.
- Carga por viewport `bbox` con debounce 300 ms + React Query cache (staleTime 2 min).
- `GaleriaMapPhotoPin`: thumbnail cover + badge conteo exhibiciones + tail estilo Apple Photos.
- `GaleriaMapClusterPin`: círculo con conteo, escala por densidad.
- `GaleriaSinCoordsPanel`: panel lateral que lista PDVs sin coordenadas cargables (lazy fetch).

### Viewer IG (GaleriaExhibicionViewer)

- Dialog fullscreen unificado (reemplaza `ExhibicionesTimelineDialog` como thin wrapper).
- **Publicación** = 1 exhibición lógica por PDV + día AR. Agrupado via `core/galeria_publicaciones.py` (BE) y `lib/galeria-publicaciones.ts` (FE).
- Fotos con dots de navegación + blur peek de publicaciones adyacentes (framer-motion).
- Navegación al PDV geográficamente más cercano via haversine (`GET /api/galeria/mapa/vendedor/{id}/vecino`).
- Accesible desde el mapa (click en pin) y desde el grid (click en card).
- `GaleriaPublicationCarousel`: timelapse de fotos con dots y efecto blur en bordes del carousel.

### Rol `compania` (reemplaza `directorio`)

- **Nombre canónico nuevo:** `compania`. El nombre `directorio` queda deprecado.
- `normalize_rol()` en `CenterMind/core/roles.py`: normaliza JWTs legacy (`directorio` → `compania`) para compatibilidad hacia atrás.
- `verify_auth` en `security.py` llama a `normalize_rol()` en cada token decodificado.
- 23 archivos FE + BE actualizados (guards, checks hasPermiso, labels UI).
- **SQL PENDIENTE ejecutar en Supabase:** `CenterMind/migrations/20260601_rol_compania.sql`
  ```sql
  UPDATE usuarios SET rol = 'compania' WHERE rol = 'directorio';
  UPDATE roles_permisos SET rol = 'compania' WHERE rol = 'directorio';
  ```
- `CLAUDE.md §8` actualizado: roles = `superadmin`, `admin`, `compania`, `supervisor`, `evaluador`.

### Componentes clave (FE)

- `components/galeria/GaleriaMapView.tsx` — mapa MapLibre fullscreen, gestiona lifecycle bbox + clustering.
- `components/galeria/GaleriaMapPhotoPin.tsx` — pin Apple Photos HTML con thumbnail.
- `components/galeria/GaleriaMapClusterPin.tsx` — cluster WebGL.
- `components/galeria/GaleriaSinCoordsPanel.tsx` — panel PDVs sin coords.
- `components/galeria/GaleriaToolbar.tsx` — filtros + toggle mapa/grid.
- `components/galeria/GaleriaExhibicionViewer.tsx` — dialog viewer IG unificado.
- `components/galeria/GaleriaPublicationCarousel.tsx` — carousel fotos + blur peek.
- `hooks/useGaleriaMapaQuery.ts` — React Query para fetch pins bbox.
- `hooks/useGaleriaMapClustering.ts` — supercluster + cap 250 DOM.
- `lib/galeria-publicaciones.ts` — `groupTimelinePublicaciones()`.
- `lib/galeria-url.ts` — `parseGaleriaSearchParams()` + `buildGaleriaUrl()`.
- `store/useGaleriaStore.ts` — extendido con `viewMode`, `filtroEstado`, `hideSinExhib`, `vendedorId` (Zustand persist).

### Módulo backend

- `CenterMind/core/galeria_publicaciones.py` — `group_exhibiciones_publicaciones()`: agrupa exhibiciones por PDV+día AR.
- Endpoints en `CenterMind/routers/fuerza_ventas.py`:
  - `GET /api/galeria/mapa/vendedor/{id}` — pins dentro de bbox con coords válidas.
  - `GET /api/galeria/mapa/vendedor/{id}/sin-coords` — PDVs sin coordenadas.
  - `GET /api/galeria/mapa/vendedor/{id}/vecino` — PDV más cercano (haversine).

### Tests

- `CenterMind/test_galeria_mapa_bbox.py` — pytest bbox + clustering backend.
- `CenterMind/test_rol_compania_migration.py` — pytest normalize_rol().
- `shelfy-frontend/e2e/galeria-exhibiciones.spec.ts` — E2E Playwright mapa + viewer.

## 9.4) Binding Telegram ↔ Vendedor ERP (implementado 2026-05-30)

- Fuente de verdad: `grupos.id_vendedor_v2` (un grupo = un vendedor anclado).
- **Modulo unico obligatorio:** `CenterMind/core/telegram_group_matcher.py`

| Uso | Funcion |
|-----|---------|
| Scoring candidatos | `score_group_vendor_candidates(dist_id, chat_id)` |
| Deteccion drift | `detect_group_drift(dist_id, chat_id)` |
| Aplicar binding | `apply_group_binding(dist_id, chat_id, id_vendedor_v2, source, performed_by)` |
| Desanclar grupo | `unlink_group(dist_id, chat_id, reason, performed_by)` |
| Leer binding actual | `get_group_binding(dist_id, chat_id)` → dict | None |
| Crear sugerencia | `create_suggestion(dist_id, chat_id, id_vendedor_v2, score, reasons, source)` |

- **Resolucion group-first en bot:** `helpers.resolve_vendedor_for_group(dist_id, chat_id)` → id_vendedor | None. Prioridad: `grupos.id_vendedor_v2` (activo) → legacy `id_vendedor_erp` → None.
- **NO** duplicar logica de scoring fuera del matcher.
- **NO** leer `grupos.id_vendedor_v2` directamente en bot sin pasar por `resolve_vendedor_for_group`.
- Semi-auto: aplica solo si score ≥ 0.95 + candidato unico + vendor activo + sin `allow_dual_vendor`.
- Cola sugerencias: tabla `telegram_binding_suggestions`; gestionada desde Fuerza de Ventas (directorio + ALOMA admin/supervisor).
- Historial: tabla `telegram_binding_audit` (append-only).
- DB migration: `CenterMind/migrations/20260530_telegram_binding.sql` — **pendiente ejecutar en Supabase**.

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
