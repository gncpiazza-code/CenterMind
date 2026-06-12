/** Constantes TanStack Query para bundles portal (sin deps de providers). */
export const BUNDLE_STALE_MS = 5 * 60 * 1000;
export const BUNDLE_GC_MS = 30 * 60 * 1000;
export const DEFAULT_QUERY_STALE_MS = 60 * 1000;
/** Estadísticas: TTL extendido a 15 min (snapshots costosos; filtro sucursal es client-side). */
export const ESTADISTICAS_BUNDLE_STALE_MS = 15 * 60 * 1000;
/** Avance ventas T&H semana/mes: Railway puede tardar ~30–60s. */
export const AVANCE_VENTAS_FETCH_TIMEOUT_MS = 90_000;
/** Retraso warm día/semana/mes para no competir con el fetch del panel visible. */
export const AVANCE_VENTAS_WARM_DELAY_MS = 5_000;
