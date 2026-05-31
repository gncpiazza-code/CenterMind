"use client";

import { useEffect } from "react";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
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

/** Vecinos del modal + cartas del período al montar la página */
export function useEstadisticasWarmCache(
  queryClient: QueryClient,
  distId: number,
  meses: string[],
  sucursal: string | null,
  neighborVendorIds: string[] = [],
) {
  useEffect(() => {
    if (!distId || meses.length === 0) return;
    prefetchEstadisticasCartas(queryClient, distId, meses, sucursal);
    for (const id of neighborVendorIds) {
      prefetchEstadisticasDetalle(queryClient, distId, id, meses);
    }
  }, [queryClient, distId, meses, sucursal, neighborVendorIds.join("|")]);
}

// ── Bundle variant (Estadísticas Cartas via snapshot backend) ────────────────

export function cartasBundleQueryOptions(
  distId: number,
  meses: string[],
  sucursal: string | null,
) {
  return {
    queryKey: bundleKeys.estadisticas(distId, meses, sucursal),
    queryFn: () => fetchEstadisticasBundle(distId, meses, sucursal),
    enabled: distId > 0 && meses.length > 0,
    staleTime: BUNDLE_STALE_MS,
    gcTime: BUNDLE_GC_MS,
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      query.state.data?.meta?.revalidating ? 2_000 : false,
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
