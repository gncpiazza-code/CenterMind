# /speed — Mapa de módulos portal

## Rutas → módulo bundle (T0)

| Ruta | `PortalModuleId` | Bundle query | Prefetch extra |
|------|------------------|--------------|----------------|
| `/dashboard` | `dashboard` | `bundleKeys.dashboard` | — |
| `/supervision` | `supervision` | `bundleKeys.supervision` | `prefetchAvanceVentasPortalEntry`, lazy `SupervisionAvanceVentasPanel`, CC table virtualizada ≥48 filas |
| `/estadisticas` | `estadisticas` | `cartasBundleQueryOptions` | warm backend estadísticas |
| `/visor` | `visor` | `bundleKeys.visor` | — |
| `/modo-mapa` | — (alias) | Reutiliza `bundleKeys.supervision` vía `ROUTE_CHUNK_BUNDLE_ALIASES` | `dynamic(TabSupervision)`, preload PDV post-GMaps |

## Route-chunk T1 (rutas sin bundle propio)

| Ruta | Chunk prefetch | Bundle aliado |
|------|----------------|---------------|
| `/modo-mapa` | ✅ T1 | `supervision` |

Helper: `resolveBundleModuleForRoute(pathname)` en `portal-cache-config.ts`.

## Supervisión — dos superficies

| Superficie | Datos | Hook / store |
|------------|-------|--------------|
| CC | `fetchSupervisionBundle` | `useSupervisionPanelQueries` |
| Avance ventas | `GET /api/supervision/avance-ventas` | `useAvanceVentasQuery` |

Zustand compartido: `useSupervisionPanelStore` (`viewMode`, `selectedSucursal`, `selectedVendedorNombre`, `avanceModo`).

Persist localStorage RQ:

- `bundle/*` — siempre
- `supervision-panel/avance-ventas/{dist,modo,fecha,suc,vend}` — snapshot avance

## Constantes TTL

| Constante | Valor | Uso |
|-----------|-------|-----|
| `BUNDLE_STALE_MS` | 5 min | Bundles portal |
| `BUNDLE_GC_MS` | 30 min | gc + persist maxAge |
| `AVANCE_VENTAS_STALE` | 5 min | Avance ventas |
| `AVANCE_VENTAS_GC_MS` | 15 min | Avance ventas memoria |

## Invalidación sync

| Motor | Disparador | Función |
|-------|------------|---------|
| CC | `cuentas_corrientes.last_updated` | invalidate `bundle/supervision` |
| Ventas | `ventas.last_attempt_at` | `invalidateAvanceVentasQueries` |

## Otros módulos (auditar si el usuario los nombra)

| Path | Notas |
|------|-------|
| `/objetivos` | Queries propias; sin portal orchestrator |
| `/galeria-exhibiciones` | Galería + queries dedicadas |
| `/reporteria` | Panels independientes |
| `/dashboard` | Referencia gold de bundle + persist |
