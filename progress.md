# Progress — Shelfy (Lean)

**Última actualización:** 11 Jun 2026 (v27 — Avance Ventas refactor auditoría)  
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

1. **Avance Ventas refactor (2026-06-11):** Catálogo SKU 12m con/sin venta; switch bultos+unidades; carrusel gráficos (cobertura reemplaza agrupación); auditoría cliente×SKU (monoproducto/mix/drill inverso); tooltips KPI `(?)`; nombres SKU sin truncar; badge sync OK + último intento; 37 tests pytest; ver `docs/context/modules/supervision-avance-ventas.md`.
2. **Supervisión Avance de Ventas (2026-06-10):** Modo `/supervision` alternable con CC — volumen sin $ desde `ventas_enriched_v2`; periodos día/semana/mes + WoW/MoM; panel analytics inicial + drill SKU lazy.
2. **Topbar brand sweep (2026-06-10):** Animación desktop — ícono L→R hacia Evaluar, huella SHELFY debajo, rebote spring y tapa texto; loop 30s.
2. **SHELFYAPP Captura Burst Apple (2026-06-10):** Flujo burst photos-first — `onPhotoTaken()` nunca abre sheet; botón "Listo" (≥1 foto) → `assignPdv`; filmstrip Z2 sobre shutter; GPS chip top (nunca center); memoria ingreso (`CapturePdvMemory` SharedPreferences) con countdown 5s auto-avance; fallback cámara nativa Android gama baja (`NativeCaptureService` + `DeviceProfile.shouldUseNativeCamera()`) + toggle en `SettingsScreen`; GPS metadata cacheado (sin petición GPS por disparo); zoom badge top-right (no center); skill `capture-vendedor-auditor`; `flutter analyze lib/features/capture/` 0 errores/warnings.
2. **Mapa integrado `/modo-mapa` (2026-06-10):** Rediseño UX — mapa rellena edge-to-edge (sin card ni padding), chrome flota como glass overlay (z-30, `backdrop-blur-md`, 52px); `SupervisionMapShell` wrapper con dock vendedores slide-in (z-20); `integratedMap`+`mapChromeTop` props en `SupervisionMapView`/`MapaRutas`; overlays ajustan `topOffset`; MarkerClusterer auto (>800 pins explorar); `fitBounds` efecto separado con `fittedRef`; progress spinner en "Mostrar todos"; toolbar `glass` variant con `sucursalSlot`+`vendorsDockOpen`+`showAllProgress`.
2. **Mapa supervisión + Galería web — fixes (2026-06-10):** M1 pins visibles translúcidos (opacity 0.35) en modo dibujo; M2 anti-flicker drag con `setOpacity` condicional (skip si ≤600 pins); M3 panel UI inferior unificado (LayerPanel+FilterLegend+MapLegend en columna izquierda sin botón fullscreen suelto); M4 polígono cierra al clic en vértice 0 (cursor pointer + visual hint 3+); G1 fix navegación galería (pendingInitRef + externalPubIdxRef anti race-condition); G2 z-index sheet reevaluar sobre visor (`z-[100]`/`z-[99]`); G3 strip timeline horizontal PDV con dots de color por estado; G4 cross-ref timeline↔carrusel por `dia_ar`.
2. **SHELFYAPP Auditor Paridad (2026-06-09):** PDV prefix strict (fix HERNN BENETTI); pendientes padrón (`POST /pdv/pendiente` + tabla + UI); offline bundle (BundleCache TTL 24h + BundleProvider); 6 tabs nav (Galería integrada); cámara Apple-like (shutter nativo, zoom badge, bottom gradient, focus square 600ms); CC aging visual bars; Cartera CTA → Capture pre-fill NRO; Objetivos resumen_mobile action banner; skill permanente `mobile-vendedor-auditor`; 45 tests pytest verde.

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
