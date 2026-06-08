"use client";

import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchRutasSupervision, fetchClientesSupervision, type VendedorSupervision } from "@/lib/api";
import { useSupervisionStore } from "@/store/useSupervisionStore";

const PRELOAD_STALE_MS = 15 * 60 * 1000;
const MAX_CONCURRENT = 3;

/**
 * Precarga rutas + clientes de vendedores filtrados sin encender visibilidad en mapa.
 */
export function useSupervisionMapPreload(
  distId: number | undefined,
  vendedores: VendedorSupervision[],
  enabled: boolean,
) {
  const queryClient = useQueryClient();
  const setPreloadComplete = useSupervisionStore((s) => s.setPreloadComplete);
  const vendorKey = useMemo(
    () => vendedores.map((v) => v.id_vendedor).join(","),
    [vendedores],
  );

  useEffect(() => {
    if (!enabled || !distId || vendedores.length === 0) {
      return;
    }

    let cancelled = false;
    setPreloadComplete(false);

    async function preloadVendor(v: VendedorSupervision) {
      const rutas = await queryClient.fetchQuery({
        queryKey: ["supervision-rutas", distId, v.id_vendedor],
        queryFn: () => fetchRutasSupervision(v.id_vendedor),
        staleTime: PRELOAD_STALE_MS,
      });
      await Promise.all(
        (rutas ?? []).slice(0, 50).map((r) =>
          queryClient.fetchQuery({
            queryKey: ["supervision-clientes", distId, r.id_ruta],
            queryFn: () => fetchClientesSupervision(r.id_ruta),
            staleTime: PRELOAD_STALE_MS,
          }),
        ),
      );
    }

    async function run() {
      const queue = [...vendedores];
      const workers = Array.from({ length: Math.min(MAX_CONCURRENT, queue.length) }, async () => {
        while (queue.length && !cancelled) {
          const v = queue.shift();
          if (!v) break;
          try {
            await preloadVendor(v);
          } catch {
            /* best-effort preload */
          }
        }
      });
      await Promise.all(workers);
      if (!cancelled) setPreloadComplete(true);
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [distId, enabled, vendorKey, vendedores, queryClient, setPreloadComplete]);
}
