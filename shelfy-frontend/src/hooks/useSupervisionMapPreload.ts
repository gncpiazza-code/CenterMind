"use client";

import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchRutasSupervision, fetchClientesSupervision, type VendedorSupervision } from "@/lib/api";
import { isGoogleMapsAlreadyLoaded } from "@/lib/googleMapsLoader";
import { scheduleWhenIdle } from "@/lib/portal-idle-scheduler";
import { useSupervisionStore } from "@/store/useSupervisionStore";

const PRELOAD_STALE_MS = 15 * 60 * 1000;
const MAX_CONCURRENT = 3;
const MAPS_READY_POLL_MS = 300;
const MAPS_READY_TIMEOUT_MS = 20_000;

/** Espera a que Google Maps esté listo para no competir con LCP del canvas. */
async function deferUntilMapsReady(): Promise<void> {
  if (isGoogleMapsAlreadyLoaded()) return;

  const deadline = Date.now() + MAPS_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, MAPS_READY_POLL_MS));
    if (isGoogleMapsAlreadyLoaded()) return;
  }

  await new Promise<void>((resolve) => scheduleWhenIdle(resolve));
}

/**
 * Precarga rutas + clientes de vendedores filtrados sin encender visibilidad en mapa.
 * Diferida hasta post-GMaps para no competir con la carga del mapa (LCP / main thread).
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
      const routeQueue = [...(rutas ?? [])];
      const routeWorkers = Array.from(
        { length: Math.min(MAX_CONCURRENT, routeQueue.length || 1) },
        async () => {
          while (routeQueue.length && !cancelled) {
            const r = routeQueue.shift();
            if (!r) break;
            await queryClient.fetchQuery({
              queryKey: ["supervision-clientes", distId, r.id_ruta],
              queryFn: () => fetchClientesSupervision(r.id_ruta),
              staleTime: PRELOAD_STALE_MS,
            });
          }
        },
      );
      await Promise.all(routeWorkers);
    }

    async function run() {
      await deferUntilMapsReady();
      if (cancelled) return;

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
