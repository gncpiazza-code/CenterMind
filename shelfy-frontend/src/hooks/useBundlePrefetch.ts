"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { fetchDashboardBundle } from "@/lib/api";
import { bundleKeys } from "@/lib/query-keys";
import { BUNDLE_STALE_MS } from "@/components/providers/ReactQueryProvider";

/**
 * Prefetch liviano: solo dashboard mes (pantalla de aterrizaje).
 * Evita tormenta de requests al login (warm + visor + supervisión saturaban Railway).
 */
export function useBundlePrefetch() {
  const { user, effectiveDistribuidorId } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    const distId = effectiveDistribuidorId ?? 0;
    if (!user || distId <= 0) return;

    void queryClient.prefetchQuery({
      queryKey: bundleKeys.dashboard(distId, "mes", null),
      queryFn: () => fetchDashboardBundle(distId, "mes", null),
      staleTime: BUNDLE_STALE_MS,
    });
  }, [user, effectiveDistribuidorId, queryClient]);
}

/** @deprecated Usar useBundlePrefetch */
export { useBundlePrefetch as usePrefetchBundles };
