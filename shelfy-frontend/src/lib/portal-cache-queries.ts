import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { warmPortalBundles, fetchDashboardBundle, fetchVisorBundle } from "@/lib/api";
import { mesActual } from "@/lib/estadisticas-period";
import { readEstadisticasPrefetchMeses, estadisticasPrefetchMesesKey } from "@/lib/estadisticas-prefetch-meses";
import { bundleKeys } from "@/lib/query-keys";
import { BUNDLE_GC_MS, BUNDLE_STALE_MS } from "@/lib/query-cache-constants";
import type { PortalModuleId } from "@/lib/portal-cache-config";
import { resolveModuleFromPath } from "@/lib/portal-cache-config";
import { markPortalWarmSent } from "@/lib/portal-cache-warm";
import { cartasBundleQueryOptions } from "@/hooks/useEstadisticasQueries";
import { supervisionBundleQueryOptions } from "@/hooks/useSupervisionQueries";

export function dashboardBundleQueryOptions(
  distId: number,
  periodo = "mes",
  sucursal: string | null = null,
) {
  return {
    queryKey: bundleKeys.dashboard(distId, periodo, sucursal),
    queryFn: () => fetchDashboardBundle(distId, periodo, sucursal),
    staleTime: BUNDLE_STALE_MS,
    gcTime: BUNDLE_GC_MS,
  } as const;
}

export function visorBundleQueryOptions(distId: number) {
  return {
    queryKey: bundleKeys.visor(distId),
    queryFn: () => fetchVisorBundle(distId),
    staleTime: BUNDLE_STALE_MS,
    gcTime: BUNDLE_GC_MS,
  } as const;
}

export function estadisticasBundleQueryOptions(
  distId: number,
  meses: string[] = readEstadisticasPrefetchMeses(),
) {
  return cartasBundleQueryOptions(distId, meses);
}

export function supervisionBundleDefaultQueryOptions(
  distId: number,
  sucursal: string | null = null,
) {
  return supervisionBundleQueryOptions(distId, sucursal, null);
}

export function moduleBundleQueryOptions(
  mod: PortalModuleId,
  distId: number,
): { queryKey: QueryKey; queryFn: () => Promise<unknown> } | null {
  if (distId <= 0) return null;
  switch (mod) {
    case "dashboard":
      return dashboardBundleQueryOptions(distId, "mes", null);
    case "supervision":
      return supervisionBundleDefaultQueryOptions(distId, null);
    case "estadisticas":
      return estadisticasBundleQueryOptions(distId, readEstadisticasPrefetchMeses());
    case "visor":
      return visorBundleQueryOptions(distId);
    default:
      return null;
  }
}

export async function prefetchPortalModule(
  queryClient: QueryClient,
  mod: PortalModuleId,
  distId: number,
): Promise<void> {
  const opts = moduleBundleQueryOptions(mod, distId);
  if (!opts) return;
  const state = queryClient.getQueryState(opts.queryKey);
  if (state?.fetchStatus === "fetching") return;
  if (state?.dataUpdatedAt && Date.now() - state.dataUpdatedAt < BUNDLE_STALE_MS) return;
  await queryClient.prefetchQuery(opts);
}

export function prefetchPortalModuleIdle(
  queryClient: QueryClient,
  mod: PortalModuleId,
  distId: number,
): void {
  void prefetchPortalModule(queryClient, mod, distId);
}

export function warmPortalBundlesOnce(distId: number): void {
  if (distId <= 0 || !markPortalWarmSent(distId)) return;
  const mesesKey = estadisticasPrefetchMesesKey(readEstadisticasPrefetchMeses());
  void warmPortalBundles(distId, ["dashboard", "visor", "estadisticas"], mesesKey).catch(() => {});
}

export function prefetchModuleByRoute(
  queryClient: QueryClient,
  pathname: string,
  distId: number,
): void {
  const mod = resolveModuleFromPath(pathname);
  if (!mod) return;
  prefetchPortalModuleIdle(queryClient, mod, distId);
}
