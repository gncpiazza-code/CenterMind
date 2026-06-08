# Progress — Shelfy (Lean)

**Última actualización:** 8 Jun 2026 (v15 — refactor docs lean)  
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
| Bot + RPA | 🟢 — 7 tenants Consolido; `extra` CC CHESS pendiente |
| Difusión / Reportería | 🟢 |

## SQL pendiente Supabase

- `20260601_rol_compania.sql`
- `20260605_objetivo_jobs.sql`
- `20260605_objetivos_flags_liquidacion.sql`
- `20260607_vendedor_app_settings_push.sql`

(Aplicado 2026-06-08: `20260608_mapa_capas_planificacion.sql` → tabla `mapa_capas_planificacion`.)

## Cambios recientes (máx 5)

1. **Mapa supervisión My Maps (2026-06-08):** toolbar Explorar/Objetivo por zona/Crear Rutas, capas `mapa_capas_planificacion`, fix pin exhibición 30d (`tiene_exhibicion_reciente`).
2. **Tenants doc (2026-06-08):** catálogo 7 dist — ver `docs/context/modules/tenants.md`.
3. **SHELFYAPP (2026-06-08):** 7 tabs Flutter, endpoints vendedor, push FCM, App Settings.
4. **Security hardening (2026-06-07):** RLS, PyJWT, Snyk CI.
5. **Mobile perf portal (2026-06-07):** idle prefetch, dashboard mobile, zustand reset.

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
