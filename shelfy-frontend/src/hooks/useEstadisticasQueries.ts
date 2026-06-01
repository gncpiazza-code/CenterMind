"use client";

import { useEffect } from "react";
import {
  keepPreviousData,
  useQuery,
  type QueryClient,
} from "@tanstack/react-query";
import {
  fetchEstadisticasCartas,
  fetchEstadisticasMeses,
  fetchEstadisticasSucursales,
  fetchEstadisticasVendedorDetalle,
  fetchEstadisticasBundle,
  type EstadisticasBundle,
} from "@/lib/api";
import { estadisticasKeys } from "@/lib/estadisticas-query-keys";
import { bundleKeys } from "@/lib/query-keys";
import { BUNDLE_STALE_MS, BUNDLE_GC_MS } from "@/components/providers/ReactQueryProvider";

export const ESTADISTICAS_MESES_STALE = 15 * 60_000;
export const ESTADISTICAS_CARTAS_STALE = 10 * 60_000;
export const ESTADISTICAS_DETALLE_STALE = 15 * 60_000;
export const ESTADISTICAS_GC_MS = 45 * 60_000;

export function sucursalesQueryOptions(distId: number) {
  return {
    queryKey: estadisticasKeys.sucursales(distId),
    queryFn: () => fetchEstadisticasSucursales(distId),
    enabled: distId > 0,
    staleTime: ESTADISTICAS_MESES_STALE,
    gcTime: ESTADISTICAS_GC_MS,
  } as const;
}

export function mesesQueryOptions(distId: number) {
  return {
    queryKey: estadisticasKeys.meses(distId),
    queryFn: () => fetchEstadisticasMeses(distId),
    enabled: distId > 0,
    staleTime: ESTADISTICAS_MESES_STALE,
    gcTime: ESTADISTICAS_GC_MS,
  } as const;
}

export function cartasQueryOptions(
  distId: number,
  meses: string[],
  sucursal: string | null,
) {
  return {
    queryKey: estadisticasKeys.cartas(distId, meses, sucursal),
    queryFn: () => fetchEstadisticasCartas(distId, meses, sucursal),
    enabled: distId > 0 && meses.length > 0,
    staleTime: ESTADISTICAS_CARTAS_STALE,
    gcTime: ESTADISTICAS_GC_MS,
    placeholderData: keepPreviousData,
  } as const;
}

export function detalleQueryOptions(
  distId: number,
  vendedorId: string,
  meses: string[],
) {
  return {
    queryKey: estadisticasKeys.detalle(distId, vendedorId, meses),
    queryFn: () => fetchEstadisticasVendedorDetalle(distId, vendedorId, meses),
    enabled: distId > 0 && !!vendedorId && meses.length > 0,
    staleTime: ESTADISTICAS_DETALLE_STALE,
    gcTime: ESTADISTICAS_GC_MS,
  } as const;
}

export function useEstadisticasMeses(distId: number) {
  return useQuery(mesesQueryOptions(distId));
}

export function useEstadisticasSucursales(distId: number) {
  return useQuery(sucursalesQueryOptions(distId));
}

export function useEstadisticasCartas(
  distId: number,
  meses: string[],
  sucursal: string | null,
) {
  return useQuery({
    ...cartasBundleQueryOptions(distId, meses, sucursal),
    select: (data) => data.cartas,
  });
}

export function prefetchEstadisticasDetalle(
  queryClient: QueryClient,
  distId: number,
  vendedorId: string,
  meses: string[],
) {
  if (!distId || !vendedorId || meses.length === 0) return;
  void queryClient.prefetchQuery(detalleQueryOptions(distId, vendedorId, meses));
}

/** Precarga cartas al cambiar meses (misma sucursal) — bundle snapshot */
export function prefetchEstadisticasCartas(
  queryClient: QueryClient,
  distId: number,
  meses: string[],
  sucursal: string | null,
) {
  prefetchEstadisticasCartasBundle(queryClient, distId, meses, sucursal);
}

/** Precarga solo detalle de vecinos (cartas bundle las cubre el orquestador). */
export function useEstadisticasWarmCache(
  queryClient: QueryClient,
  distId: number,
  meses: string[],
  _sucursal: string | null,
  neighborVendorIds: string[] = [],
) {
  useEffect(() => {
    if (!distId || meses.length === 0 || neighborVendorIds.length === 0) return;
    for (const id of neighborVendorIds) {
      prefetchEstadisticasDetalle(queryClient, distId, id, meses);
    }
  }, [queryClient, distId, meses, neighborVendorIds.join("|")]);
}

// ── Bundle variant (Estadísticas Cartas via snapshot backend) ────────────────

export function cartasBundleQueryOptions(
  distId: number,
  meses: string[],
  sucursal: string | null,
) {
  const mesesKey = meses.join(",");
  return {
    queryKey: bundleKeys.estadisticas(distId, meses, sucursal),
    queryFn: () => fetchEstadisticasBundle(distId, meses, sucursal),
    enabled: distId > 0 && meses.length > 0,
    staleTime: BUNDLE_STALE_MS,
    gcTime: BUNDLE_GC_MS,
    placeholderData: (prev: EstadisticasBundle | undefined, prevQuery) => {
      if (!prev || !prevQuery) return undefined;
      const key = prevQuery.queryKey;
      if (key[3] !== mesesKey || key[4] !== sucursal) return undefined;
      return prev;
    },
    retry: 1,
    refetchInterval: (query) => {
      const data = query.state.data;
      const meta = data?.meta;
      if (!meta?.revalidating) return false;
      const waitingFull = !meta.cache_hit && (data?.cartas?.length ?? 0) === 0;
      return waitingFull ? 8_000 : false;
    },
  } as const;
}

export function useEstadisticasCartasBundle(
  distId: number,
  meses: string[],
  sucursal: string | null,
) {
  return useQuery(cartasBundleQueryOptions(distId, meses, sucursal));
}

export function prefetchEstadisticasCartasBundle(
  queryClient: QueryClient,
  distId: number,
  meses: string[],
  sucursal: string | null,
) {
  if (!distId || meses.length === 0) return;
  void queryClient.prefetchQuery(cartasBundleQueryOptions(distId, meses, sucursal));
}
