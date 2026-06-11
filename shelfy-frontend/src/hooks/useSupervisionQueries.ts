"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  fetchCcKpis,
  fetchCuentasSupervision,
  fetchDeudorDetalle,
  fetchSyncStatus,
  fetchVendedoresSupervision,
  fetchSupervisionBundle,
  type CcKpisResponse,
  type CuentasSupervision,
  type DeudorDetalle,
  type SyncStatus,
  type VendedorCuentas,
  type VendedorSupervision,
  type SupervisionBundle,
} from "@/lib/api";
import { invalidateAvanceVentasQueries } from "@/hooks/useAvanceVentasQuery";
import { supervisionPanelKeys, bundleKeys } from "@/lib/query-keys";
import { BUNDLE_STALE_MS, BUNDLE_GC_MS } from "@/components/providers/ReactQueryProvider";

export const SUPERVISION_VENDEDORES_STALE = 10 * 60_000;
export const SUPERVISION_CUENTAS_STALE = 5 * 60_000;
export const SUPERVISION_SYNC_STALE = 2 * 60_000;
export const SUPERVISION_CC_KPIS_STALE = 5 * 60_000;
export const SUPERVISION_DEUDOR_STALE = 3 * 60_000;
export const SUPERVISION_GC_MS = 30 * 60_000;
export const SUPERVISION_CUENTAS_GC_MS = 15 * 60_000;

/** Bootstrap del selector de vendedor desde snapshot CC (prefetch portal). */
export function vendedoresFromBundleCuentas(
  cuentas: CuentasSupervision | undefined,
): VendedorSupervision[] {
  const rows = cuentas?.vendedores;
  if (!rows?.length) return [];
  const seen = new Set<number>();
  const out: VendedorSupervision[] = [];
  for (const vc of rows as VendedorCuentas[]) {
    const id = vc.id_vendedor;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id_vendedor: id,
      nombre_vendedor: vc.vendedor || "Sin vendedor",
      sucursal_nombre: vc.sucursal || "Sin sucursal",
      total_rutas: 0,
      total_pdv: 0,
      pdv_activos: 0,
      pdv_inactivos: 0,
    });
  }
  return out;
}

export function vendedoresLiteQueryOptions(distId: number) {
  return {
    queryKey: supervisionPanelKeys.vendedoresLite(distId),
    queryFn: () => fetchVendedoresSupervision(distId, { lite: true }),
    staleTime: SUPERVISION_VENDEDORES_STALE,
    gcTime: SUPERVISION_GC_MS,
  } as const;
}

export function vendedoresQueryOptions(distId: number) {
  return {
    queryKey: supervisionPanelKeys.vendedores(distId),
    queryFn: () => fetchVendedoresSupervision(distId),
    staleTime: SUPERVISION_VENDEDORES_STALE,
    gcTime: SUPERVISION_GC_MS,
  } as const;
}

export function syncStatusQueryOptions(distId: number) {
  return {
    queryKey: supervisionPanelKeys.syncStatus(distId),
    queryFn: () => fetchSyncStatus(distId),
    staleTime: SUPERVISION_SYNC_STALE,
    gcTime: SUPERVISION_GC_MS,
  } as const;
}

export function cuentasQueryOptions(
  distId: number,
  sucursal: string | undefined,
  vendedorNombre: string,
  vendedorId: number,
) {
  return {
    queryKey: [
      ...supervisionPanelKeys.cuentas(distId, sucursal),
      vendedorNombre,
      vendedorId,
    ] as const,
    queryFn: () =>
      fetchCuentasSupervision(distId, sucursal, undefined, vendedorNombre, vendedorId),
    staleTime: SUPERVISION_CUENTAS_STALE,
    gcTime: SUPERVISION_CUENTAS_GC_MS,
  } as const;
}

export function ccKpisQueryOptions(distId: number, vendedorId: number) {
  return {
    queryKey: supervisionPanelKeys.ccKpis(distId, vendedorId),
    queryFn: () => fetchCcKpis(distId, vendedorId),
    staleTime: SUPERVISION_CC_KPIS_STALE,
    gcTime: SUPERVISION_CUENTAS_GC_MS,
  } as const;
}

export function deudorDetalleQueryOptions(distId: number, idClienteErp: string) {
  return {
    queryKey: supervisionPanelKeys.deudorDetalle(distId, idClienteErp),
    queryFn: () => fetchDeudorDetalle(distId, idClienteErp),
    staleTime: SUPERVISION_DEUDOR_STALE,
    gcTime: SUPERVISION_CUENTAS_GC_MS,
  } as const;
}

export function prefetchDeudorDetalle(
  qc: QueryClient,
  distId: number,
  idClienteErp: string | null | undefined,
) {
  if (!distId || !idClienteErp) return Promise.resolve();
  return qc.prefetchQuery(deudorDetalleQueryOptions(distId, idClienteErp));
}

/** @deprecated Usar prefetchSupervisionBundle — cartera CC es sucursal-wide en bundle. */
export function prefetchCuentasSupervision(
  qc: QueryClient,
  distId: number,
  sucursal: string | undefined,
  _vendedorNombre?: string,
  _vendedorId?: number,
) {
  if (!distId) return Promise.resolve();
  return prefetchSupervisionBundle(qc, distId, sucursal ?? null, null);
}

export function prefetchCcKpis(
  qc: QueryClient,
  distId: number,
  vendedorId: number | null | undefined,
) {
  if (!distId || !vendedorId) return Promise.resolve();
  return qc.prefetchQuery(ccKpisQueryOptions(distId, vendedorId));
}

/** Perfil del deudor — cache por ERP; no mezcla datos al cambiar de fila. */
export function useDeudorDetalleQuery(
  distId: number,
  idClienteErp: string | null,
): UseQueryResult<DeudorDetalle> {
  return useQuery({
    ...deudorDetalleQueryOptions(distId, idClienteErp!),
    enabled: !!distId && !!idClienteErp,
    placeholderData: (prev, prevQuery) => {
      if (!idClienteErp || !prevQuery) return undefined;
      const prevErp = prevQuery.queryKey[3];
      return prevErp === idClienteErp ? prev : undefined;
    },
  });
}

/** Precarga los primeros N deudores al cargar la cartera. */
export function usePrefetchDeudoresBatch(
  distId: number,
  idClienteErps: string[],
  enabled = true,
) {
  const qc = useQueryClient();
  const key = idClienteErps.slice(0, 8).join("|");
  const lastPrefetchKeyRef = useRef<string>("");

  useEffect(() => {
    if (!enabled || !distId || !key) return;
    const prefetchKey = `${distId}:${key}`;
    if (prefetchKey === lastPrefetchKeyRef.current) return;
    lastPrefetchKeyRef.current = prefetchKey;
    for (const erp of idClienteErps.slice(0, 8)) {
      void prefetchDeudorDetalle(qc, distId, erp);
    }
  }, [enabled, distId, key, idClienteErps, qc]);
}

export function useSupervisionPanelQueries(
  distId: number,
  selectedSucursal: string,
  selectedVendedorNombre: string | null,
) {
  const sucursalParam = selectedSucursal === "__all__" ? undefined : selectedSucursal;
  const qc = useQueryClient();
  const prevCcSyncRef = useRef<string | null>(null);
  const prevVentasSyncRef = useRef<string | null>(null);

  const bundleQuery = useQuery<SupervisionBundle>({
    ...supervisionBundleQueryOptions(distId, sucursalParam ?? null, null),
    enabled: !!distId,
    placeholderData: keepPreviousData,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data?.meta?.revalidating) return false;
      if ((data.cuentas?.vendedores?.length ?? 0) > 0) return false;
      return 5_000;
    },
  });

  const bundleVendedores = useMemo(
    () => vendedoresFromBundleCuentas(bundleQuery.data?.cuentas),
    [bundleQuery.data?.cuentas],
  );

  const vendedoresLiteQuery = useQuery<VendedorSupervision[]>({
    ...vendedoresLiteQueryOptions(distId),
    enabled: !!distId,
    placeholderData: bundleVendedores.length > 0 ? bundleVendedores : undefined,
  });

  const vendedoresFullQuery = useQuery<VendedorSupervision[]>({
    ...vendedoresQueryOptions(distId),
    enabled: !!distId && vendedoresLiteQuery.isSuccess,
    placeholderData: keepPreviousData,
  });

  const vendedores =
    vendedoresFullQuery.data ?? vendedoresLiteQuery.data ?? bundleVendedores;

  const selectedVendedorObj = useMemo(
    () => vendedores.find((v) => v.nombre_vendedor === selectedVendedorNombre) ?? null,
    [vendedores, selectedVendedorNombre],
  );
  const selectedVendedorId = selectedVendedorObj?.id_vendedor ?? null;

  const syncQuery = useQuery<SyncStatus>({
    ...syncStatusQueryOptions(distId),
    enabled: !!distId,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  const cuentasData = bundleQuery.data?.cuentas ?? undefined;
  const waitingSnapshot =
    !!bundleQuery.data?.meta?.revalidating &&
    (bundleQuery.data?.cuentas?.vendedores?.length ?? 0) === 0;
  const loadingCuentas =
    (bundleQuery.isLoading && !bundleQuery.data) || waitingSnapshot;
  const fetchingCuentas = bundleQuery.isFetching;

  const ccKpisQuery = useQuery<CcKpisResponse>({
    ...ccKpisQueryOptions(distId, selectedVendedorId ?? 0),
    enabled: !!distId && !!selectedVendedorId,
    placeholderData: keepPreviousData,
  });

  // Tras ingesta CC (sync-status cambia), invalidar snapshots de supervisión
  useEffect(() => {
    const ccKey =
      syncQuery.data?.cuentas_corrientes?.last_updated ??
      syncQuery.data?.cuentas_corrientes?.last_run_ok_at ??
      null;
    if (!distId || !ccKey) return;
    if (prevCcSyncRef.current && prevCcSyncRef.current !== ccKey) {
      void qc.invalidateQueries({
        queryKey: ["bundle", "supervision", distId],
      });
    }
    prevCcSyncRef.current = ccKey;
  }, [
    distId,
    syncQuery.data?.cuentas_corrientes?.last_updated,
    syncQuery.data?.cuentas_corrientes?.last_run_ok_at,
    qc,
  ]);

  // Tras ingesta ventas (sync-status), invalidar avance de ventas
  useEffect(() => {
    const ventasKey =
      syncQuery.data?.ventas?.last_attempt_at ??
      syncQuery.data?.ventas?.last_updated ??
      syncQuery.data?.ventas?.last_run_ok_at ??
      null;
    if (!distId || !ventasKey) return;
    if (prevVentasSyncRef.current && prevVentasSyncRef.current !== ventasKey) {
      invalidateAvanceVentasQueries(qc, distId);
    }
    prevVentasSyncRef.current = ventasKey;
  }, [
    distId,
    syncQuery.data?.ventas?.last_attempt_at,
    syncQuery.data?.ventas?.last_updated,
    syncQuery.data?.ventas?.last_run_ok_at,
    qc,
  ]);

  // Precarga KPIs al seleccionar vendedor
  useEffect(() => {
    if (!distId || !selectedVendedorId) return;
    void prefetchCcKpis(qc, distId, selectedVendedorId);
  }, [distId, selectedVendedorId, qc]);

  return {
    vendedores,
    vendedoresLoading:
      vendedores.length === 0 &&
      ((vendedoresLiteQuery.isLoading && !bundleVendedores.length) ||
        (bundleQuery.isLoading && !bundleQuery.data)),
    vendedoresFetching: vendedoresLiteQuery.isFetching || vendedoresFullQuery.isFetching,
    vendedoresStatsPending: !vendedoresFullQuery.data && vendedoresLiteQuery.isSuccess,
    selectedVendedorObj,
    selectedVendedorId,
    cuentasData,
    loadingCuentas,
    fetchingCuentas,
    syncStatus: syncQuery.data,
    ccKpisData: ccKpisQuery.data,
    loadingCcKpis: ccKpisQuery.isLoading && !ccKpisQuery.data,
    prefetchDeudor: (erp: string | null | undefined) =>
      prefetchDeudorDetalle(qc, distId, erp),
  };
}

// ── Supervision CC bundle ────────────────────────────────────────────────────

export const SUPERVISION_BUNDLE_STALE = BUNDLE_STALE_MS;   // 5 min
export const SUPERVISION_BUNDLE_GC    = BUNDLE_GC_MS;       // 30 min

export function supervisionBundleQueryOptions(
  distId: number,
  sucursal: string | null,
  idVendedor: number | null,
) {
  return {
    queryKey: bundleKeys.supervision(distId, sucursal, idVendedor),
    queryFn: () => fetchSupervisionBundle(distId, sucursal, idVendedor),
    enabled: distId > 0,
    staleTime: SUPERVISION_BUNDLE_STALE,
    gcTime: SUPERVISION_BUNDLE_GC,
    placeholderData: keepPreviousData,
  } as const;
}

export function useSupervisionBundle(
  distId: number,
  sucursal: string | null = null,
  idVendedor: number | null = null,
) {
  return useQuery<SupervisionBundle>(supervisionBundleQueryOptions(distId, sucursal, idVendedor));
}

export function prefetchSupervisionBundle(
  queryClient: QueryClient,
  distId: number,
  sucursal: string | null,
  idVendedor: number | null,
) {
  if (!distId) return;
  void queryClient.prefetchQuery(supervisionBundleQueryOptions(distId, sucursal, idVendedor));
}
