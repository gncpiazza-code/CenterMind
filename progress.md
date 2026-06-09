# Progress — Shelfy (Lean)

**Última actualización:** 9 Jun 2026 (v16 — alta Ippolibaz dist 13)  
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

1. **Alta Ippolibaz dist 13 (2026-06-09):** registry + CHESS vault + tablas `*_d13`; padrón 1111 PDVs; CC 3 filas; guardrail CC permite primer bootstrap sin snapshot previo.
2. **Ventas enriched async (2026-06-08):** POST `/api/motor/ventas-enriched` responde 202 + thread (mismo patrón padrón); evita 524/502 Cloudflare en uploads RPA.
2. **RPA padrón ENGINES (2026-06-08):** catch-up sin falsos stale si Supabase falla; lock con timeout; reintentos reporteador; informe ventas 09:45 AR (evita choque 09:38 catch-up).
3. **Mapa supervisión perf v2 (2026-06-08):** pines en Zustand + engine TanStack Query, `SupervisionMapView` aislado, marker clustering Google Maps, sync key incremental.
4. **Mapa supervisión My Maps (2026-06-08):** toolbar Explorar/Objetivo por zona/Crear Rutas, capas `mapa_capas_planificacion`, fix pin exhibición 30d (`tiene_exhibicion_reciente`).
5. **Tenants doc (2026-06-08):** catálogo 7 dist — ver `docs/context/modules/tenants.md`.

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
