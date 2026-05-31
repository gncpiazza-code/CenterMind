"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchDashboardBundle,
  fetchEstadisticasBundle,
  fetchSupervisionBundle,
  fetchVisorBundle,
  warmPortalBundles,
} from "@/lib/api";
import { bundleKeys } from "@/lib/query-keys";
import { BUNDLE_STALE_MS } from "@/components/providers/ReactQueryProvider";
import { mesActual } from "@/lib/estadisticas-period";

/**
 * Prefetch + warm de bundles portal en background.
 * Montar una sola vez en el layout raíz (dentro Auth + ReactQuery).
 */
export function useBundlePrefetch() {
  const { user, effectiveDistribuidorId, hasPermiso } = useAuth();
  const queryClient = useQueryClient();
  const warmedRef = useRef<number | null>(null);

  useEffect(() => {
    const distId = effectiveDistribuidorId ?? 0;
    if (!user || distId <= 0) return;

    const mes = mesActual();

    void queryClient.prefetchQuery({
      queryKey: bundleKeys.dashboard(distId, "mes", null),
      queryFn: () => fetchDashboardBundle(distId, "mes", null),
      staleTime: BUNDLE_STALE_MS,
    });

    void queryClient.prefetchQuery({
      queryKey: bundleKeys.estadisticas(distId, [mes], null),
      queryFn: () => fetchEstadisticasBundle(distId, [mes], null),
      staleTime: BUNDLE_STALE_MS,
    });

    if (hasPermiso("view_supervision") || hasPermiso("view_supervision_v2")) {
      void queryClient.prefetchQuery({
        queryKey: bundleKeys.supervision(distId, null, null),
        queryFn: () => fetchSupervisionBundle(distId, null, null),
        staleTime: BUNDLE_STALE_MS,
      });
    }

    const rol = (user.rol ?? "").toLowerCase();
    if (
      hasPermiso("view_visor") ||
      rol === "evaluador" ||
      rol === "supervisor" ||
      rol === "admin" ||
      rol === "superadmin" ||
      user.is_superadmin
    ) {
      void queryClient.prefetchQuery({
        queryKey: bundleKeys.visor(distId),
        queryFn: () => fetchVisorBundle(distId),
        staleTime: BUNDLE_STALE_MS,
      });
    }

    if (warmedRef.current !== distId) {
      warmedRef.current = distId;
      void warmPortalBundles(distId).catch(() => {
        /* warm es best-effort */
      });
    }
  }, [user, effectiveDistribuidorId, hasPermiso, queryClient]);
}

/** @deprecated Usar useBundlePrefetch */
export { useBundlePrefetch as usePrefetchBundles };
