# Progress — Shelfy (Lean)

**Última actualización:** 9 Jun 2026 (v21 — fix duplicado vendedor Miguel Muñoz Real Dist Córdoba)  
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

1. **Vendedor duplicado Real Dist (2026-06-09):** merge Miguel Muñoz ERP 5082→5102 (dist 3, Suc. Córdoba); padrón ya no inserta duplicado si cambia código ERP con mismo nombre+sucursal.
2. **SHELFYAPP P2 campo (2026-06-09):** cámara zoom slider + haptic focus; Maestro 5 tabs (CC·Cartera·Objetivos·Stats); polish tokens Stats/CC/Cartera/Objetivos.
3. **SHELFYAPP gaps stats/objetivos (2026-06-09):** Stats `/ventas` SKU; objetivos `prorrateo` + recomendaciones bot; APK tabaco rebuild.
4. **SHELFYAPP perf + nav (2026-06-09):** tab único montado; cache providers; cámara medium/high; Maestro nav stress.
5. **SHELFYAPP Oleada 2 (2026-06-09):** P0 fix upload portal; espíritu Shelfy tokens; captura 1 pantalla Stack; `pdv/buscar` endpoint.

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
