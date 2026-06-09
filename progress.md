# Progress — Shelfy (Lean)

**Última actualización:** 9 Jun 2026 (v21 — SHELFYAPP Oleada 3 merge main + APK 1.0.2+b4)  
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

(Aplicado 2026-06-08: `20260608_mapa_capas_planificacion.sql` → tabla `mapa_capas_planificacion`.)

## Cambios recientes (máx 5)

1. **SHELFYAPP Oleada 3 (2026-06-09):** Cámara pro (double-tap zoom + dial glass presets); CC enrich BE (geo+FUC) + FE (antigüedad chip + FUC + Maps); Objetivos UI (suprimir HTML Telegram, ShelfyInsightList, tokens); Stats hero bultos + SKU progress rows + KPI grid 2col; 5 shared widgets nuevos; design polish 8.3/10; `resumen_mobile` en objetivos detalle BE.
2. **Vendedor duplicado Real Dist (2026-06-09):** merge Miguel Muñoz ERP 5082→5102 (dist 3, Suc. Córdoba); padrón ya no inserta duplicado si cambia código ERP con mismo nombre+sucursal.
3. **SHELFYAPP gaps stats/objetivos (2026-06-09):** Stats `/ventas` SKU; objetivos `prorrateo` + recomendaciones bot; APK tabaco rebuild.
4. **SHELFYAPP MVP campo ruta (2026-06-09):** nav 5 tabs directos (Captura·CC·Cartera·Objetivos·Stats); tab inicial=Captura; fix multifoto; BE wrappers `/estadisticas/resumen` + cartera + objetivos `recomendaciones[]`.
5. **SHELFYAPP Oleada 2 (2026-06-09):** P0 fix upload portal; espíritu Shelfy tokens; captura 1 pantalla Stack; `pdv/buscar` endpoint.

## Guardrails activos

- Paginación `.range()` · `id_distribuidor` siempre
- Ranking/KPI: `exhibicion_aggregate.py` + test vendor-scope
- QA Tabaco: cuentas prueba fuera ranking no-superadmin

## Próximos pasos

1. Ejecutar plan mapa supervisión (post-aprobar implementación)
2. SQL pendientes en Supabase
3. CHESS CC tenant `extra` (Consolido ya activo)
