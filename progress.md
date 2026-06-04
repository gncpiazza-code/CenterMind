# Progress — Shelfy CenterMind (Lean)

**Ultima actualizacion:** 2 de Junio, 2026 (v9)  
**Objetivo:** estado operativo actual, riesgos y prioridades.  
**Historial largo:** `docs/changelog/archive/2026-05.md`.

## Estado General

- Plataforma estable en produccion (Railway + Vercel + Supabase).
- Alcance principal: supervision, objetivos, difusion, reporteria, ingesta RPA.
- Riesgo tecnico dominante: volumen de datos y paginacion obligatoria.

## Estado por Modulo

- 🟢 Supervision: mapa, ventas, cuentas, filtros por sucursal/vendedor.
- 🟢 Supervision-v2: router registrado, filtro valid_sellers eliminado, altas reales desde clientes_pdv_v2, drawers completos.
- 🟢 Objetivos v9: kanban/timeline/stats/print, multi-PDV, watcher y Telegram.
- 🟢 Difusion: CC por Telegram con preview y validaciones.
- 🟢 Reporteria v2: tabs por fuente + detalle por vendedor.
- 🟢 Bot Telegram: carga exhibiciones, comando `/objetivos`, reglas QA.
- 🟢 RPA: padron y cuentas corrientes en scheduler operativo.
- 🟢 Padrón RPA (2026-05-28): scheduler con **1 job por tenant** (escalonado 8 min), lock Consolido, catch-up por `motor_runs`; orden chicos→tabaco/aloma. Ver `ShelfMind-RPA/lib/padron_schedule.py`.
- 🟢 Galería: mapa Apple Photos (MapLibre), viewer IG unificado, rol `compania` (ex `directorio`).
- 🟡 Pendiente: tenant `extra`; SQL `20260601_rol_compania.sql` en Supabase.

## Cambios Recientes (resumen ejecutivo)

30. Galería Mapa Apple Viewer + rol `compania` (2026-06-01/02): Vista mapa MapLibre Carto Positron como default en galería. Clustering nativo zoom<12 (WebGL) / pins HTML zoom>=12 con cap 250 DOM. `GaleriaExhibicionViewer` unificado (Dialog IG fullscreen) con publicaciones por PDV+día AR, blur peek framer-motion y navegación por vecino haversine. `ExhibicionesTimelineDialog` deprecado como thin wrapper. Rol `directorio` renombrado a `compania` en 23 archivos BE+FE; `normalize_rol()` en `core/roles.py` normaliza JWTs legacy; `verify_auth` lo llama en cada token. Nuevos endpoints en `routers/fuerza_ventas.py`: mapa bbox, sin-coords, vecino. Nuevo módulo `core/galeria_publicaciones.py`. Persistencia: URL sync (`galeria-url.ts`) + Zustand persist extendido. Tests: `test_galeria_mapa_bbox.py`, `test_rol_compania_migration.py`, E2E `galeria-exhibiciones.spec.ts`. **SQL PENDIENTE:** `CenterMind/migrations/20260601_rol_compania.sql` (UPDATE usuarios + roles_permisos SET rol='compania' WHERE rol='directorio').

29. Supervisión CC + bundle tests + Estadísticas (2026-05-31): migración 100% — `useSupervisionPanelQueries` usa bundle sucursal-wide; invalidación FE al cambiar `sync-status` CC; `prefetchCuentasSupervision` → bundle; `TabSupervision` carga bundle si panel CC visible en mapOnly; `GET /api/supervision/cuentas` header `Deprecation`. Estadísticas: bundle + badge ERP sync + render progresivo cartas + `coerceBundleList` en FE. Tests: `test_snapshot_dashboard_bundle.py`, `test_estadisticas_erp_sync_alert.py`, suite T1–T4 (dashboard/estad/supervision/visor/refresh), Vitest `api.bundle.test.ts`, bench `scripts/bench_bundle_vs_legacy.py`. Plan cerrado: `plans/plan-supervision-bundle-migracion-100-2026-05-31.md`.

28. Matcheo inteligente Telegram ↔ Vendedor ERP (2026-05-30): anclaje por grupo como fuente de verdad. `core/telegram_group_matcher.py` — scoring (ERP exacto 1.0, nombre grupo 0.85–0.95, capping multi-candidato 0.49), `detect_group_drift` (título, uploader dominante, vendor inactivo), `apply_group_binding` + propagación integrantes, `unlink_group`. `services/telegram_binding_watcher_service.py` — `scan_distribuidor` (3 fases: drift, semi-auto 0.95, sugerencias >0.5), `scan_all_distributors`. Bot: comando `/vincular` (inline keyboard, semi-auto), `_resolve_group_vendor` group-first en `cmd_stats` y `cmd_objetivos`, `handle_new_chat_title` detecta drift. API: 6 endpoints `/api/fuerza-ventas/binding/*` (health, suggestions, resolve, grupos, apply, scan); guard acceso directorio + ALOMA. Match Center: ampliado a directorio + ALOMA admin/supervisor. Cron: 07:30 AR scan diario. Frontend FV rediseñado: tabs Alertas/Grupos/Vendedores, KPIs banner binding health, `BindingAlertInbox`, `GrupoBindingCard`. DB: `20260530_telegram_binding.sql` (columnas en grupos + 2 tablas nuevas). Tests: `test_telegram_group_matcher.py`. **SQL pendiente ejecutar en Supabase.**

1. Modal objetivos: calendario prorrateo (`buildProrrateoGrid`) muestra avance diario; texto alteo sin referencia a compra.
2. Objetivos LAG: `nombre_vendedor` de Luciano Gonzalez (ex LUCIANO AID) corregido en BD; API enriquece desde `vendedores_v2`; filtros panel por `id_vendedor`.
2. Objetivos: fecha limite obligatoria (UI + validacion backend) y tasa de pendientes reubicada antes del bloque de fecha.
3. Objetivos compania (exhibicion): retroactividad mensual activa desde `mes_referencia` para calcular avance inicial.
4. Objetivos alteo: cumplimiento por `fecha_alta` de padrón (no por cambio de ruta), con corte temporal por timestamp del objetivo.
5. Objetivos activacion: corte temporal por timestamp completo para evitar avances previos del mismo dia.
5. Tickets portal (Topbar): fix de envío (adjuntos por `/attachments` + mensaje JSON) para eliminar `Failed to fetch`.
6. Bot Telegram objetivos: solo mensaje al asignar (seguimiento/cumplido/fallido/recordatorio 08:00 desactivados por defecto; `OBJETIVOS_TELEGRAM_SEGUIMIENTO=1` para reactivar).
7. Objetivos: prorrateo compania semanal/diario visible en card (semanas y dias del mes).
8. Objetivos: identificacion PDV estandar (`#id_cliente_erp + nombre`).
9. Padron: soporte anulados (`padron_anulado`) y ocultamiento en supervision.
10. Difusion CC: preview de envios + guardrails de conflicto.
11. Objetivos exhibicion compañía: watcher robusto para retroactividad mensual (normaliza origen y aplica fallback de mes cuando falta `mes_referencia`).
12. Objetivos Telegram: seguimiento apagado por defecto (`objetivos_notification_service`); watcher y `/objetivos` siguen actualizando progreso en app.
13. Tickets portal superadmin: filtros server-side (estado/categoría/dist/texto), export JSON enriquecido y endpoint de pre-resolución IA (Gemini opcional + fallback por reglas).
14. Supervision-v2: router incluido en api.py; eliminado filtro valid_sellers que causaba pérdida de datos; altas calculadas desde clientes_pdv_v2 via rutas_v2; Drawer de vendedor y comprobante 100% funcionales.
15. Objetivos FDV: helper `is_vendedor_excluido_objetivos` central (helpers.py); backend filtra buckets en lista y en crear_objetivo (400 si bucket); frontend filtra `vendedoresFiltrados`. Switch FDV reemplaza checkbox. Resumen "Objetivo generado" movido al final del modal. `buildPhrase` acepta vendorName explícito para bulk FDV. `tasa_pendientes` condicional (solo con PDVs explícitos, no FDV bulk). Exhibición lógica: módulo `core/exhibicion_aggregate.py`; `supervision_clientes.total_exhibiciones` usa dedup lógico; bot elimina fallback RPC legacy.
16. Stats Telegram alineados a ranking: `get_stats_vendedor` deja `fn_bot_stats_vendedor` (fotos) y usa `aggregate_exhibicion_counts`; `/stats`, post-carga y dashboard comparten dedup lógico. SQL `2026-05-19_fn_bot_stats_vendedor_logical.sql` para RPC legacy.
17. Retroactividad objetivos compañía (exhibición): watcher usa `aggregate_exhibicion_counts_vendor_scope` (cliente+día por vendedor, claves sombra/ERP); deja de inflar por `id_exhibicion` cuando falta PDV.
18. Regla de ranking documentada en `CLAUDE.md` §5/§9 y `arquitectura.md`: obligatorio **vendedor ERP + cliente + día** via `exhibicion_aggregate.py` en todas las metricas de ranking/KPI/stats.
19. Supervision UX perf: carga progresiva (vendedores → KPIs/paneles), `keepPreviousData`, exhibiciones diferidas al scroll, modo-mapa sin fetch CC/altas/exhib, skeletons + stagger.
20. Supervision perf backend: `vendedores?lite=1` (sin scan exhibiciones 30d), CC filtrada en SQL por sucursal/vendedor, PDV metadata solo ERPs de filas CC, `pdvs-movimiento` batch exhibido (sin N+1).

21. Re-evaluación Compañía (2026-05-22): tabla `exhibicion_reevaluacion_compania` (append-only); router `/api/compania/reevaluar`; overlay `apply_compania_estado_overlay` en `exhibicion_aggregate.py`; ranking paralelo `GET /api/dashboard/ranking-compania/{dist_id}` solo para roles Compañía. Galería timeline enriquece con historial de re-evaluaciones. Frontend: `SlideToConfirm`, `ReevaluarCompaniaSheet`, `RankingCompaniaCompare`. Tests: 8/8. Ranking oficial del distribuidor **sin cambios**.

22. Tipo objetivo COMPRADORES (2026-05-22): nuevo tipo end-to-end. `core/objetivos_compradores.py` — módulo compartido `compradores_en_periodo` + `periodo_desde_hasta_objetivo`. Watcher: `_diff_compradores` con retroactividad mensual para compañía (patrón exhibición). Supervisión: `_supervision_compradores_mes` delega al core. Backend: `TIPOS_VALIDOS` += compradores; validación `valor_objetivo >= 1`. Bot + notificación: label 🛒 "Compradores". Frontend: badge teal, texto educativo, campo N en modal, disponible para distribuidora y compañía. Tests: `test_objetivos_compradores.py`. Restricción invariante: **NO** modifica activación ni `conversion_estado`.

23. Objetivos Planificados + Kanban 4 columnas (2026-05-22): columna `planificado` (objetivos con `fecha_inicio` futura o `lanzado_at IS NULL`). DB: columnas `fecha_inicio DATE` y `lanzado_at TIMESTAMPTZ` (migración `20260521_objetivos_fecha_inicio_lanzado.sql`). `services/objetivos_launch_service.py`: `lanzar_un_objetivo` (idempotente, sets `lanzado_at`, envía Telegram) + `lanzar_programados_fecha` (batch). Cron APScheduler 08:00 AR en `lifespan.py`. Endpoints: `POST /objetivos/{id}/lanzar` y `POST /objetivos/preview-telegram`. Watcher: salta objetivos con `lanzado_at IS NULL`. Frontend: kanban 4 cols (planificado|pendiente|en_progreso|terminado), `LanzarObjetivoDialog`, `fecha_inicio` picker en modal, `descripcion` obligatoria ≥5 chars, filtros de fecha (desde/hasta). **SQL migration pendiente ejecutar en Supabase.**

24. Re-evaluación + Kanban UX + Ranking Lente + Preview Objetivo (2026-05-22): (F) Backfill `lanzado_at` v2 (`20260522_objetivos_lanzado_at_backfill_v2.sql`); `_compute_kanban_phase` + `getObjectiveKanbanPhase` corregidos — solo planificado si `fecha_inicio > hoy_AR`. (E) Kanban 4 cols horizontal (`flex overflow-x-auto`), filtro por mes `YYYY-MM`, select de fase kanban. (B) Toggle "Vista Cía" en `RankingTable` con cols Pts Cía y Δ por vendedor; se elimina panel `RankingCompaniaCompare` suelto; backend param `solo_cambios`. (C+A) `SlideToConfirm` → dos Checkboxes (Confirmar + Anunciar por Telegram, desmarcado por defecto); `notify_reevaluacion_compania_telegram` en servicio de notificaciones. (D) `previewObjetivoTelegram` con debounce 600ms precarga textarea del modal; backend `ObjetivoPreviewTelegramIn` acepta `pdv_items` y los lista en el mensaje. Tests: 16/16 (8 kanban + 8 overlay). **SQL migration pendiente ejecutar en Supabase.**

25. Estadísticas — cartas vendedor diseño FIFA (2026-05-29): `VendorCard` en `/estadisticas` vía `VendorCardFusion` (oro/plata/bronce 75/66/0, radar hex 6 KPIs, stats 2×3, ideal tooltips, corona líder por KPI, sheen). Preview en `/estadisticas/preview-fusion`.

26. Fix retroactividad objetivo COMPRADORES (2026-06-04): ventas del mes filtradas por vendedor (`_venta_matches_vendor`, mismo criterio que estadísticas); tenant/franquicia vía `ventas_enriched_base_query`; fallback padrón solo si el PDV no matchea en motor; validación `desde`/`hasta`. Supervisión altas/compradores alineada. Tests en `test_objetivos_compradores.py`.

## Riesgos y Guardrails Activos

- Tablas grandes: usar paginacion `.range()` en loops.
- Multi-tenant: no omitir `id_distribuidor`.
- QA Tabaco: cuentas de prueba fuera de ranking/visor para no-superadmin.
- CC: validaciones previas al reemplazo de snapshot.
- **Ranking/KPI exhibicion (CRITICO):** nunca contar fotos ni filas crudas; siempre `core/exhibicion_aggregate.py` con dedup **(vendedor_erp, cliente_key, calendar_day_AR)**. Prohibido `fn_dashboard_ranking` y fallback RPC en bot. Ver `test_exhibicion_aggregate_vendor_scope.py` antes de tocar ranking.

25. Dashboard Rediseño v2 (2026-05-27): eliminada FiltrosBar y colapsable análisis; layout 25% HeroCarousel / 75% RankingTable; `DashboardKpiCarousel` (3 slides: Estados | Gráficos rotativos | Rendimiento); `DashboardToolbar` (sucursal + período + hint DD/MM/AA-DD/MM/AA); período `semana` backend en `_resolve_period_bounds`; `count_active_vendors` en `exhibicion_aggregate.py`; KPIs enriquecidos con `vendedores_activos` y `exhibiciones_por_vendedor`; ranking enriquecido con `sucursal` y `ciudad_dominante`; HeroCarousel filtra rechazadas + 3 badges estado + PDV info con iconos; RankingTable con autoscroll + pause + fullscreen integrado; WS invalida todas las queries (kpis|ranking|ultimas|evolucion|sucursales); shadcn `toggle-group` instalado. Tests 6/6.
26. Dashboard hotfix UX/data (2026-05-28): `HeroCarousel` deja de truncar nombre de vendedor (2 líneas); `RankingTable` estabiliza autoscroll continuo; `DashboardKpiCarousel` sin etiqueta "Estados"; backend `reportes.py` valida PDV por ruta del vendedor (`id_ruta`→`id_vendedor`, flag `pdv_asignado_vendedor`) y ciudad dominante por `id_vendedor` (sin cruce homónimos ERP); frontend `dashboard-ultimas.ts` filtra cards incoherentes (ej. Córdoba vs Resistencia).

27. Validación cartera bot + aviso PDV nuevo (2026-05-28): `BOT_VALIDACION_CARTERA=1` activa bloqueo en `handle_text` cuando el NRO no está en rutas del vendedor. Dos botones: "Enviar NRO otra vez" (`RETRY_CLIENTE_*`) y "Es PDV nuevo / continuar" (`PDV_NUEVO_*`). PDV nuevo → flag `pdv_nuevo_declarado` en sesión → inserción en `bot_pdv_pendiente_aviso`. Post-padrón: `procesar_pendientes(dist_id)` en `_ingest_for_dist` detecta clientes ya ingresados y envía mensaje HTML al grupo. Nuevos módulos: `core/bot_cliente_cartera.py`, `services/bot_pdv_aviso_service.py`, `scripts/test_bot_cartera_validacion.py`. SQL: `bot_pdv_pendiente_aviso` (tabla + índices) + `fn_reconcile_exhibiciones` extendida (paso 2 por `cliente_sombra_codigo`). **SQL pendiente ejecutar en Supabase.** Feature flag off por defecto en prod.

28. Liquid Glass Clear visor — fase 1 (2026-05-31): `VisorGlassMaterial` arquitectura 5 capas; SVG lens Chromium-only; bench `/visor/glass-bench`; 15 tests. Fase 2 — 199% (2026-05-31): **H1/H6 fix** elimina niebla blanca quitando `filter` de la capa backdrop; **H2 fix** elimina `onGlyphMode("dark")` hardcodeado; `VisorGlassLensLayer` capa C separada (canvas Chromium, WebGL Firefox con fragment shader fbm); `useVisorGlassGlyphMode` hook luma real c/200ms; `GlassIcon`/`GlassLabel` adaptativo en controles; `crossOrigin="anonymous"` CORS fix; `resolveGlassAnchor` placement inteligente; bench HUD luma+mode; `VisorGlassMaterial` y `VisorWaterGlass` como `forwardRef`; 33 tests unitarios. Nuevos archivos: `visor-glass-lens-strategy.ts`, `visor-glass-canvas-lens.ts`, `visor-glass-placement.ts`, `useVisorGlassGlyphMode.ts`, `VisorGlassLensLayer.tsx`.

## Proximos Pasos Prioritarios

1. Activar tenant `extra` (credenciales + validacion E2E).
2. Clusterizar pines de mapa para alto volumen.
3. Completar migracion de endpoints admin legacy a `_v2`.
4. Mantener archivo corto: maximo 20 cambios recientes.

## Regla de Mantenimiento de este Archivo

Al finalizar una implementacion:

- Actualizar fecha.
- Agregar solo cambios de alto impacto (1-3 bullets).
- Archivar detalle tecnico extenso en changelog mensual.
