const prefetchedRoutes = new Set<string>();

export function prefetchPortalRouteChunk(
  router: { prefetch: (href: string) => void },
  href: string,
): void {
  if (prefetchedRoutes.has(href)) return;
  prefetchedRoutes.add(href);
  router.prefetch(href);
}

export function resetPrefetchedRoutes(): void {
  prefetchedRoutes.clear();
}
