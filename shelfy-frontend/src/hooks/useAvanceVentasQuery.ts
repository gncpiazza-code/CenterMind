"use client";

import { useEffect, useRef } from "react";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  fetchAvanceVentasClienteSkus,
  fetchAvanceVentasSkuClientes,
  fetchAvanceVentasSupervision,
  type AvanceClienteSkusResponse,
  type AvanceSkuClientesResponse,
  type AvanceVentasModo,
  type AvanceVentasResponse,
} from "@/lib/api";
import { mondayOfWeek, todayIsoAr } from "@/lib/avance-ventas-format";
import {
  readSupervisionPanelPersisted,
  resolveSupervisionAvancePrefetchParams,
} from "@/lib/supervision-panel-persist";
import { supervisionPanelKeys } from "@/lib/query-keys";
import { PATRON_CUENTA_EQUIPO } from "@/components/estadisticas/PatronCuentaSelector";

export const AVANCE_VENTAS_STALE = 5 * 60_000;
export const AVANCE_VENTAS_GC_MS = 15 * 60_000;

function avanceVentasKey(
  distId: number,
  modo: AvanceVentasModo,
  fecha: string,
  sucursal?: string | null,
  vendedor?: string | null,
  cuenta?: string | null,
) {
  return supervisionPanelKeys.avanceVentas(distId, modo, fecha, sucursal, vendedor, cuenta);
}

/** Invalida panel avance + drills (sync ventas o ingesta). */
export function invalidateAvanceVentasQueries(queryClient: QueryClient, distId: number) {
  void queryClient.invalidateQueries({
    queryKey: ["supervision-panel", "avance-ventas", distId],
  });
  void queryClient.invalidateQueries({
    queryKey: ["supervision-panel", "avance-ventas-sku", distId],
  });
  void queryClient.invalidateQueries({
    queryKey: ["supervision-panel", "avance-ventas-cliente", distId],
  });
}

export async function prefetchAvanceVentas(
  queryClient: QueryClient,
  distId: number,
  modo: AvanceVentasModo,
  fecha: string,
  sucursal?: string | null,
  vendedor?: string | null,
  cuenta?: string | null,
) {
  if (distId <= 0 || !fecha) return;
  const key = avanceVentasKey(distId, modo, fecha, sucursal, vendedor, cuenta);
  const state = queryClient.getQueryState(key);
  if (state?.fetchStatus === "fetching") return;
  if (state?.dataUpdatedAt && Date.now() - state.dataUpdatedAt < AVANCE_VENTAS_STALE) return;
  await queryClient.prefetchQuery(
    avanceVentasQueryOptions(distId, modo, fecha, sucursal, vendedor, cuenta),
  );
}

export function prefetchAvanceVentasIdle(
  queryClient: QueryClient,
  distId: number,
  modo: AvanceVentasModo,
  fecha: string,
  sucursal?: string | null,
  vendedor?: string | null,
  cuenta?: string | null,
) {
  void prefetchAvanceVentas(queryClient, distId, modo, fecha, sucursal, vendedor, cuenta);
}

/**
 * Precarga avance con filtros del store persistido (sucursal/vendedor/modo).
 * Si se pasan sucursal/vendedor explícitos, usa día+hoy con esos filtros (hover legacy).
 */
export function prefetchAvanceVentasDefault(
  queryClient: QueryClient,
  distId: number,
  sucursal?: string | null,
  vendedor?: string | null,
  cuenta?: string | null,
) {
  if (sucursal !== undefined || vendedor !== undefined || cuenta !== undefined) {
    prefetchAvanceVentasIdle(
      queryClient,
      distId,
      "dia",
      todayIsoAr(),
      sucursal ?? null,
      vendedor ?? null,
      cuenta ?? PATRON_CUENTA_EQUIPO,
    );
    return;
  }
  const { modo, fecha, sucursal: s, vendedor: v, patronCuenta } =
    resolveSupervisionAvancePrefetchParams();
  prefetchAvanceVentasIdle(queryClient, distId, modo, fecha, s, v, patronCuenta);
}

/** Portal T0: combo persistida + fallback todas/todos (día hoy). */
export function prefetchAvanceVentasPortalEntry(queryClient: QueryClient, distId: number) {
  if (distId <= 0) return;
  const primary = resolveSupervisionAvancePrefetchParams();
  prefetchAvanceVentasIdle(
    queryClient,
    distId,
    primary.modo,
    primary.fecha,
    primary.sucursal,
    primary.vendedor,
    primary.patronCuenta,
  );
  const isAllScope = !primary.sucursal && !primary.vendedor;
  if (!isAllScope) {
    prefetchAvanceVentasIdle(
      queryClient,
      distId,
      "dia",
      todayIsoAr(),
      null,
      null,
      PATRON_CUENTA_EQUIPO,
    );
  }
  const persisted = readSupervisionPanelPersisted();
  if (persisted?.viewMode === "avance") {
    prefetchAvanceVentasWarm(
      queryClient,
      distId,
      primary.sucursal,
      primary.vendedor,
      primary.patronCuenta,
    );
  }
}

/** Precarga día + semana + mes en curso al activar modo avance. */
export function prefetchAvanceVentasWarm(
  queryClient: QueryClient,
  distId: number,
  sucursal?: string | null,
  vendedor?: string | null,
  cuenta?: string | null,
) {
  if (distId <= 0) return;
  const hoy = todayIsoAr();
  const targets: Array<[AvanceVentasModo, string]> = [
    ["dia", hoy],
    ["semana", mondayOfWeek(hoy)],
    ["mes", `${hoy.slice(0, 7)}-01`],
  ];
  void Promise.all(
    targets.map(([modo, fecha]) =>
      prefetchAvanceVentas(queryClient, distId, modo, fecha, sucursal, vendedor, cuenta),
    ),
  );
}

export function avanceVentasQueryOptions(
  distId: number,
  modo: AvanceVentasModo,
  fecha: string,
  sucursal?: string | null,
  vendedor?: string | null,
  cuenta?: string | null,
) {
  return {
    queryKey: supervisionPanelKeys.avanceVentas(distId, modo, fecha, sucursal, vendedor, cuenta),
    queryFn: () =>
      fetchAvanceVentasSupervision(
        distId,
        modo,
        fecha,
        sucursal ?? undefined,
        vendedor ?? undefined,
        cuenta ?? undefined,
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
  cuenta?: string | null;
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
  cuenta,
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
      invalidateAvanceVentasQueries(queryClient, distId);
    }
  }, [ventasLastUpdated, distId, queryClient]);

  return useQuery<AvanceVentasResponse>({
    ...avanceVentasQueryOptions(distId, modo, fecha, sucursal, vendedor, cuenta),
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
  offset = 0,
  cuenta?: string | null,
) {
  return useQuery<AvanceSkuClientesResponse>({
    queryKey: supervisionPanelKeys.avanceVentasSku(
      distId,
      codArticulo ?? "",
      modo,
      fecha,
      sucursal,
      vendedor,
      offset,
      cuenta,
    ),
    queryFn: () =>
      fetchAvanceVentasSkuClientes(
        distId,
        codArticulo ?? "",
        modo,
        fecha,
        sucursal ?? undefined,
        vendedor ?? undefined,
        200,
        offset,
        cuenta ?? undefined,
      ),
    enabled: enabled && distId > 0 && !!codArticulo && !!fecha,
    staleTime: AVANCE_VENTAS_STALE,
    gcTime: AVANCE_VENTAS_GC_MS,
    placeholderData: keepPreviousData,
  });
}

/** Drill inverso de auditoría: SKUs comprados por un cliente en el período. */
export function useAvanceVentasClienteSkus(
  distId: number,
  idClienteErp: string | null,
  modo: AvanceVentasModo,
  fecha: string,
  sucursal?: string | null,
  vendedor?: string | null,
  enabled = true,
  cuenta?: string | null,
) {
  return useQuery<AvanceClienteSkusResponse>({
    queryKey: supervisionPanelKeys.avanceVentasCliente(
      distId,
      idClienteErp ?? "",
      modo,
      fecha,
      sucursal,
      vendedor,
      cuenta,
    ),
    queryFn: () =>
      fetchAvanceVentasClienteSkus(
        distId,
        idClienteErp ?? "",
        modo,
        fecha,
        sucursal ?? undefined,
        vendedor ?? undefined,
        cuenta ?? undefined,
      ),
    enabled: enabled && distId > 0 && !!idClienteErp && !!fecha,
    staleTime: AVANCE_VENTAS_STALE,
    gcTime: AVANCE_VENTAS_GC_MS,
  });
}
