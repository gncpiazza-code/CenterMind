# Progress — Shelfy (Lean)

**Última actualización:** 9 Jun 2026 (v18 — SHELFYAPP Oleada 2: fix upload P0 + espíritu Shelfy + captura 1 pantalla)  
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

1. **SHELFYAPP Oleada 2 (2026-06-09):** P0 fix upload portal (`ensure_mobile_integrante` antes del RPC, `telegram_user_id` sintético, HTTP 422 si vacío); espíritu Shelfy (`shelfy_tokens.dart` + shared widgets + AppBar logo + violeta por defecto); captura 1 pantalla (Stack único, `CaptureOverlayPhase`, glass sheet, flash, radio 100 m); `pdv/buscar` endpoint nuevo; `flutter analyze` 0 errors.
2. **SHELFYAPP polish (2026-06-09):** snapshot-first CC+ventas (nombre_display fix, aging buckets, bultos/top compradores); hub Más animado (4 tabs, stagger); `flutter analyze` 0 warnings código.
3. **Alta Ippolibaz dist 13 (2026-06-09):** registry + CHESS vault + tablas `*_d13`; padrón 1111 PDVs; CC 3 filas; guardrail CC permite primer bootstrap sin snapshot previo.
4. **Ventas enriched async (2026-06-08):** POST `/api/motor/ventas-enriched` responde 202 + thread; evita 524/502 Cloudflare en uploads RPA.
5. **Mapa supervisión My Maps (2026-06-08):** toolbar Explorar/Objetivo/Rutas, capas planificación, fix pin exhibición 30d.

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
