"use client";

import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  fetchCuentasSupervision,
  fetchSyncStatus,
  fetchVendedoresSupervision,
  type VendedorSupervision,
} from "@/lib/api";
import { supervisionPanelKeys } from "@/lib/query-keys";
import {
  useAltasCompradoresQuery,
  usePrefetchAltasCompradores,
} from "@/hooks/useAltasCompradores";

const VENDEDORES_STALE = 10 * 60_000;
const CUENTAS_STALE = 5 * 60_000;
const SYNC_STALE = 2 * 60_000;

export function useSupervisionPanelData(
  distId: number,
  selectedSucursal: string,
  selectedVendedorNombre: string | null,
  altasMes: string,
) {
  const sucursalParam = selectedSucursal === "__all__" ? undefined : selectedSucursal;

  const vendedoresQuery = useQuery<VendedorSupervision[]>({
    queryKey: supervisionPanelKeys.vendedores(distId),
    queryFn: () => fetchVendedoresSupervision(distId),
    enabled: !!distId,
    staleTime: VENDEDORES_STALE,
    gcTime: 30 * 60_000,
    placeholderData: keepPreviousData,
  });

  const vendedores = vendedoresQuery.data ?? [];
  const vendedoresReady = !vendedoresQuery.isLoading || vendedores.length > 0;

  const selectedVendedorObj = useMemo(
    () => vendedores.find((v) => v.nombre_vendedor === selectedVendedorNombre) ?? null,
    [vendedores, selectedVendedorNombre],
  );
  const selectedVendedorId = selectedVendedorObj?.id_vendedor ?? null;

  const syncQuery = useQuery({
    queryKey: supervisionPanelKeys.syncStatus(distId),
    queryFn: () => fetchSyncStatus(distId),
    enabled: !!distId && vendedoresReady,
    staleTime: SYNC_STALE,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  const cuentasQuery = useQuery({
    queryKey: [
      ...supervisionPanelKeys.cuentas(distId, sucursalParam),
      selectedVendedorNombre ?? "__none__",
      selectedVendedorId ?? "__none__",
    ] as const,
    queryFn: async () => {
      const scoped = await fetchCuentasSupervision(
        distId,
        sucursalParam,
        undefined,
        selectedVendedorNombre ?? undefined,
        selectedVendedorId,
      );
      const hasClientes = (scoped.vendedores ?? []).some(
        (v) => (v.clientes?.length ?? 0) > 0,
      );
      if (hasClientes || !selectedVendedorId) return scoped;
      return fetchCuentasSupervision(distId, sucursalParam);
    },
    enabled: !!distId && !!selectedVendedorNombre && vendedoresReady,
    staleTime: CUENTAS_STALE,
    gcTime: 15 * 60_000,
    placeholderData: keepPreviousData,
  });

  const altasQuery = useAltasCompradoresQuery(distId, selectedVendedorId, altasMes);
  usePrefetchAltasCompradores(distId, selectedVendedorId, altasMes);

  return {
    vendedores,
    vendedoresReady,
    vendedoresLoading: vendedoresQuery.isLoading && !vendedores.length,
    vendedoresFetching: vendedoresQuery.isFetching,
    selectedVendedorObj,
    selectedVendedorId,
    cuentasData: cuentasQuery.data,
    loadingCuentas: cuentasQuery.isLoading && !cuentasQuery.data,
    fetchingCuentas: cuentasQuery.isFetching,
    syncStatus: syncQuery.data,
    altasData: altasQuery.data,
    loadingAltas: altasQuery.isLoading && !altasQuery.data,
    fetchingAltas: altasQuery.isFetching,
  };
}
