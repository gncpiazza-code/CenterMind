# Progress — Shelfy (Lean)

**Última actualización:** 9 Jun 2026 (v22 — SHELFYAPP auditor paridad: PDV prefix strict + pendientes padrón + offline bundle + cámara Apple-like + 6 tabs)  
**Historial detallado:** `docs/context/changelog/archive/`

## Estado general

🟢 Producción estable (Railway + Vercel + Supabase). Riesgo dominante: volumen datos + paginación.

## Módulos

| Módulo | Estado |
|--------|--------|
| Supervisión (mapa, ventas, CC) | 🟢 — mapa My Maps (jun 2026) |
| Objetivos v9 | 🟢 |
| Galería MapLibre | 🟢 |
| SHELFYAPP Flutter | 🟢 |
| Bot + RPA | 🟢 — 8 tenants Consolido (`ippolibaz` dist 13); `extra` CC CHESS pendiente |
| Difusión / Reportería | 🟢 |

## SQL pendiente Supabase

- `20260601_rol_compania.sql`
- `20260605_objetivo_jobs.sql`
- `20260605_objetivos_flags_liquidacion.sql`
- `20260607_vendedor_app_settings_push.sql`
- `20260609_vendedor_pdv_pendientes.sql` (nuevo — pendientes padrón)

(Aplicado 2026-06-08: `20260608_mapa_capas_planificacion.sql` → tabla `mapa_capas_planificacion`.)

## Cambios recientes (máx 5)

1. **SHELFYAPP Auditor Paridad (2026-06-09):** PDV prefix strict (fix HERNN BENETTI); pendientes padrón (`POST /pdv/pendiente` + tabla + UI); offline bundle (BundleCache TTL 24h + BundleProvider); 6 tabs nav (Galería integrada); cámara Apple-like (shutter nativo, zoom badge, bottom gradient, focus square 600ms); CC aging visual bars; Cartera CTA → Capture pre-fill NRO; Objetivos resumen_mobile action banner; skill permanente `mobile-vendedor-auditor`; 45 tests pytest verde.
2. **SHELFYAPP Oleada 3 (2026-06-09):** Cámara pro (double-tap zoom + dial glass presets); CC enrich BE (geo+FUC) + FE (antigüedad chip + FUC + Maps); Objetivos UI (suprimir HTML Telegram, ShelfyInsightList, tokens); Stats hero bultos + SKU progress rows + KPI grid 2col; 5 shared widgets nuevos; design polish 8.3/10; `resumen_mobile` en objetivos detalle BE.
2. **SHELFYAPP MVP campo ruta (2026-06-09):** nav 5 tabs directos (Captura·CC·Cartera·Objetivos·Stats); tab inicial=Captura; fix multifoto (`addExtraPhoto()`); BE wrappers `/estadisticas/resumen` + cartera +3 campos + objetivos `recomendaciones[]`; FE visor KPIs+ficha PDV+recomendaciones.
3. **SHELFYAPP perf + nav (2026-06-09):** tab único montado (sin IndexedStack OOM); cache providers `fetch(force)`; cámara `medium` Android / `high` iOS; Maestro nav stress.
4. **SHELFYAPP Oleada 2 (2026-06-09):** P0 fix upload portal; espíritu Shelfy tokens; captura 1 pantalla Stack; `pdv/buscar` endpoint.
5. **Alta Ippolibaz dist 13 (2026-06-09):** registry + tablas `*_d13`; padrón 1111 PDVs.

## Guardrails activos

- Paginación `.range()` · `id_distribuidor` siempre
- Ranking/KPI: `exhibicion_aggregate.py` + test vendor-scope
- QA Tabaco: cuentas prueba fuera ranking no-superadmin

## Próximos pasos

1. Ejecutar plan mapa supervisión (post-aprobar implementación)
2. SQL pendientes en Supabase
3. CHESS CC tenant `extra` (Consolido ya activo)
4. Mantener `progress.md` ≤5 bullets recientes — archivar resto

## Regla mantenimiento

Al cerrar tarea: fecha + 1–3 bullets alto impacto. Borrar el más viejo si supera 5. Detalle → `docs/context/changelog/archive/YYYY-MM.md`.
