# Progress — Shelfy CenterMind (Lean)

**Ultima actualizacion:** 22 de Mayo, 2026  
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
- 🟡 Pendiente: tenant `extra`, clusters en mapa para zoom out masivo.

## Cambios Recientes (resumen ejecutivo)

1. Objetivos: fecha limite obligatoria (UI + validacion backend) y tasa de pendientes reubicada antes del bloque de fecha.
2. Objetivos compania (exhibicion): retroactividad mensual activa desde `mes_referencia` para calcular avance inicial.
3. Objetivos alteo: cumplimiento por `fecha_alta` de padrón (no por cambio de ruta), con corte temporal por timestamp del objetivo.
4. Objetivos activacion: corte temporal por timestamp completo para evitar avances previos del mismo dia.
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

## Riesgos y Guardrails Activos

- Tablas grandes: usar paginacion `.range()` en loops.
- Multi-tenant: no omitir `id_distribuidor`.
- QA Tabaco: cuentas de prueba fuera de ranking/visor para no-superadmin.
- CC: validaciones previas al reemplazo de snapshot.
- **Ranking/KPI exhibicion (CRITICO):** nunca contar fotos ni filas crudas; siempre `core/exhibicion_aggregate.py` con dedup **(vendedor_erp, cliente_key, calendar_day_AR)**. Prohibido `fn_dashboard_ranking` y fallback RPC en bot. Ver `test_exhibicion_aggregate_vendor_scope.py` antes de tocar ranking.

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
