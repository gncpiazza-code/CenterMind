"use client";

/**
 * @deprecated Reemplazado por PortalCacheProvider + usePortalCacheOrchestrator.
 * Se mantiene el export para compatibilidad con imports legacy.
 */
export function useBundlePrefetch() {
  /* no-op: orquestador corre en PortalCacheProvider */
}

/** @deprecated Usar usePortalCache().prefetchRoute */
export { useBundlePrefetch as usePrefetchBundles };
