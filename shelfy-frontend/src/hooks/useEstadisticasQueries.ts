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
  fetchEstadisticasVendedorDetalle,
} from "@/lib/api";
import { estadisticasKeys } from "@/lib/estadisticas-query-keys";

export const ESTADISTICAS_MESES_STALE = 15 * 60_000;
export const ESTADISTICAS_CARTAS_STALE = 10 * 60_000;
export const ESTADISTICAS_DETALLE_STALE = 15 * 60_000;
export const ESTADISTICAS_GC_MS = 45 * 60_000;

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

export function useEstadisticasCartas(
  distId: number,
  meses: string[],
  sucursal: string | null,
) {
  return useQuery(cartasQueryOptions(distId, meses, sucursal));
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

/** Precarga cartas al cambiar meses (misma sucursal) para navegación más fluida */
export function prefetchEstadisticasCartas(
  queryClient: QueryClient,
  distId: number,
  meses: string[],
  sucursal: string | null,
) {
  if (!distId || meses.length === 0) return;
  void queryClient.prefetchQuery(cartasQueryOptions(distId, meses, sucursal));
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
