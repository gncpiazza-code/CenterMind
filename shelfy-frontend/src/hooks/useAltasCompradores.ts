"use client";

import { useEffect } from "react";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { fetchPdvsMovimiento, type PdvsMovimientoResponse } from "@/lib/api";
import { supervisionPanelKeys } from "@/lib/query-keys";

export const ALTAS_STALE_MS = 10 * 60_000;
export const ALTAS_GC_MS = 30 * 60_000;

export function altasCompradoresQueryOptions(
  distId: number,
  vendedorId: number,
  mes: string,
) {
  return {
    queryKey: supervisionPanelKeys.altas(distId, vendedorId, mes),
    queryFn: () =>
      fetchPdvsMovimiento(distId, vendedorId, mes, "alta,comprador"),
    staleTime: ALTAS_STALE_MS,
    gcTime: ALTAS_GC_MS,
  } as const;
}

export function prefetchAltasCompradores(
  qc: QueryClient,
  distId: number,
  vendedorId: number,
  mes: string,
) {
  return qc.prefetchQuery(altasCompradoresQueryOptions(distId, vendedorId, mes));
}

function prevMes(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** TanStack Query compartida entre panel analítico y mapa (misma cache key). */
export function useAltasCompradoresQuery(
  distId: number,
  vendedorId: number | null,
  mes: string,
  options?: { enabled?: boolean },
) {
  const baseEnabled = !!distId && !!vendedorId && !!mes;
  return useQuery<PdvsMovimientoResponse>({
    ...altasCompradoresQueryOptions(distId, vendedorId!, mes),
    enabled: baseEnabled && (options?.enabled ?? true),
    placeholderData: keepPreviousData,
  });
}

/** Precarga mes actual y anterior al elegir vendedor. */
export function usePrefetchAltasCompradores(
  distId: number,
  vendedorId: number | null,
  mes: string,
  enabled = true,
) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled || !distId || !vendedorId || !mes) return;
    void prefetchAltasCompradores(qc, distId, vendedorId, mes);
    void prefetchAltasCompradores(qc, distId, vendedorId, prevMes(mes));
  }, [enabled, distId, vendedorId, mes, qc]);
}

export type AltasTab = "todos" | "alta" | "comprador";

export function filterAltasItems(
  items: PdvsMovimientoResponse["items"],
  tab: AltasTab,
) {
  if (tab === "alta") return items.filter((i) => i.categoria === "alta");
  if (tab === "comprador") {
    return items.filter(
      (i) => i.categoria === "comprador" || i.es_comprador_mes === true,
    );
  }
  return items;
}

export function buildMesOptions(count = 12): { value: string; label: string }[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const value = d.toISOString().slice(0, 7);
    const label = d.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
    return { value, label: label.charAt(0).toUpperCase() + label.slice(1) };
  });
}
