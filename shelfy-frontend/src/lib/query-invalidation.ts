import type { QueryClient } from "@tanstack/react-query";

// Invalida solo el bundle del dashboard del distId activo.
// Más preciso que invalidateQueries({ queryKey: ['bundle','dashboard'] })
// que invalida todas las distribuidoras cacheadas.
export function invalidateDashboardBundle(
  queryClient: QueryClient,
  distId: number,
): void {
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey;
      return (
        Array.isArray(key) &&
        key[0] === "bundle" &&
        key[1] === "dashboard" &&
        key[2] === distId
      );
    },
  });
}
