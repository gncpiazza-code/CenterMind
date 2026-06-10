"use client";

import { useEffect, useRef } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAvanceVentasSkuClientes,
  fetchAvanceVentasSupervision,
  type AvanceSkuClientesResponse,
  type AvanceVentasModo,
  type AvanceVentasResponse,
} from "@/lib/api";
import { supervisionPanelKeys } from "@/lib/query-keys";

export const AVANCE_VENTAS_STALE = 5 * 60_000;
export const AVANCE_VENTAS_GC_MS = 15 * 60_000;

export function avanceVentasQueryOptions(
  distId: number,
  modo: AvanceVentasModo,
  fecha: string,
  sucursal?: string | null,
  vendedor?: string | null,
) {
  return {
    queryKey: supervisionPanelKeys.avanceVentas(distId, modo, fecha, sucursal, vendedor),
    queryFn: () =>
      fetchAvanceVentasSupervision(
        distId,
        modo,
        fecha,
        sucursal ?? undefined,
        vendedor ?? undefined,
      ),
    staleTime: AVANCE_VENTAS_STALE,
    gcTime: AVANCE_VENTAS_GC_MS,
  } as const;
}

interface UseAvanceVentasArgs {
  distId: number;
  modo: AvanceVentasModo;
  fecha: string;
  sucursal?: string | null;
  vendedor?: string | null;
  enabled?: boolean;
  /** sync-status ventas.last_updated — invalida cache al cambiar (patrón CC padrón). */
  ventasLastUpdated?: string | null;
}

export function useAvanceVentasQuery({
  distId,
  modo,
  fecha,
  sucursal,
  vendedor,
  enabled = true,
  ventasLastUpdated,
}: UseAvanceVentasArgs) {
  const queryClient = useQueryClient();
  const lastSyncRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (ventasLastUpdated === undefined) return;
    if (lastSyncRef.current === undefined) {
      lastSyncRef.current = ventasLastUpdated;
      return;
    }
    if (ventasLastUpdated !== lastSyncRef.current) {
      lastSyncRef.current = ventasLastUpdated;
      void queryClient.invalidateQueries({
        queryKey: ["supervision-panel", "avance-ventas", distId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["supervision-panel", "avance-ventas-sku", distId],
      });
    }
  }, [ventasLastUpdated, distId, queryClient]);

  return useQuery<AvanceVentasResponse>({
    ...avanceVentasQueryOptions(distId, modo, fecha, sucursal, vendedor),
    enabled: enabled && distId > 0 && !!fecha,
    placeholderData: keepPreviousData,
  });
}

export function useAvanceVentasSkuClientes(
  distId: number,
  codArticulo: string | null,
  modo: AvanceVentasModo,
  fecha: string,
  sucursal?: string | null,
  vendedor?: string | null,
  enabled = true,
) {
  return useQuery<AvanceSkuClientesResponse>({
    queryKey: supervisionPanelKeys.avanceVentasSku(
      distId,
      codArticulo ?? "",
      modo,
      fecha,
      sucursal,
      vendedor,
    ),
    queryFn: () =>
      fetchAvanceVentasSkuClientes(
        distId,
        codArticulo ?? "",
        modo,
        fecha,
        sucursal ?? undefined,
        vendedor ?? undefined,
      ),
    enabled: enabled && distId > 0 && !!codArticulo && !!fecha,
    staleTime: AVANCE_VENTAS_STALE,
    gcTime: AVANCE_VENTAS_GC_MS,
  });
}
