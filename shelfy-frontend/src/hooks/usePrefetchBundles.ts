"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { fetchDashboardBundle } from "@/lib/api";
import { bundleKeys } from "@/lib/query-keys";
import { BUNDLE_STALE_MS } from "@/components/providers/ReactQueryProvider";

/**
 * Prefetches the dashboard bundle as soon as user + effectiveDistribuidorId
 * are available (post-login or distributor switch).
 * Call this from any layout that sits inside <ReactQueryProvider>.
 */
export function usePrefetchBundles() {
  const { user, effectiveDistribuidorId } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user || !effectiveDistribuidorId || effectiveDistribuidorId <= 0) return;
    void queryClient.prefetchQuery({
      queryKey: bundleKeys.dashboard(effectiveDistribuidorId, "mes", null),
      queryFn: () => fetchDashboardBundle(effectiveDistribuidorId, "mes", null),
      staleTime: BUNDLE_STALE_MS,
    });
  }, [user, effectiveDistribuidorId, queryClient]);
}
