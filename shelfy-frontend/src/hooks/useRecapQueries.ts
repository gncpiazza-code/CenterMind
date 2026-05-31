"use client";

import { useEffect } from "react";
import {
  keepPreviousData,
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  fetchRecapStory,
  fetchRecapHistorial,
  fetchRecapPendientes,
  fetchRecapPeriodos,
  fetchRecapCarrusel,
  fetchRecapSession,
  markRecapVisto,
  fetchRecapEvolucion,
  fetchRecapEvolucionBundle,
} from "@/lib/api";
import type { RecapCarrusel, RecapSession, RecapStory, RecapEvolucion, RecapEvolucionBundle } from "@/lib/recap-types";
import { bundleKeys } from "@/lib/query-keys";
import { BUNDLE_GC_MS, BUNDLE_STALE_MS } from "@/components/providers/ReactQueryProvider";

export const recapKeys = {
  all: ["recap"] as const,
  story: (distId: number, vendedorId: string, periodoKey: string) =>
    ["recap", "story", distId, vendedorId, periodoKey] as const,
  session: (distId: number, vendedorId: string, periodoKey: string) =>
    ["recap", "session", distId, vendedorId, periodoKey] as const,
  historial: (distId: number, vendedorId: string) =>
    ["recap", "historial", distId, vendedorId] as const,
  pendientes: (distId: number) => ["recap", "pendientes", "v2", distId] as const,
  periodos: (distId: number) => ["recap", "periodos", distId] as const,
  carrusel: (distId: number, periodoKey: string) =>
    ["recap", "carrusel", distId, periodoKey] as const,
  evolucion: (distId: number, vendedorId: string, mes: string) =>
    ["recap", "evolucion", distId, vendedorId, mes] as const,
};

export const RECAP_STORY_STALE_MS = 60 * 60_000;
export const RECAP_CARRUSEL_STALE_MS = BUNDLE_STALE_MS;
export const RECAP_META_STALE_MS = 2 * 60_000;
export const RECAP_GC_MS = BUNDLE_GC_MS;

function seedRecapSessionCache(
  queryClient: QueryClient,
  distId: number,
  periodoKey: string,
  session: RecapSession,
  vendedorId: string,
) {
  queryClient.setQueryData(recapKeys.carrusel(distId, periodoKey), session.carrusel);
  queryClient.setQueryData(recapKeys.story(distId, vendedorId, periodoKey), session.story);
}

export function sessionQueryOptions(
  distId: number,
  vendedorId: string,
  periodoKey: string,
) {
  return {
    queryKey: recapKeys.session(distId, vendedorId, periodoKey),
    queryFn: () => fetchRecapSession(distId, vendedorId, periodoKey),
    enabled: distId > 0 && !!vendedorId && !!periodoKey,
    staleTime: RECAP_STORY_STALE_MS,
    gcTime: RECAP_GC_MS,
  } as const;
}

export function storyQueryOptions(
  distId: number,
  vendedorId: string,
  periodoKey: string,
) {
  return {
    queryKey: recapKeys.story(distId, vendedorId, periodoKey),
    queryFn: () => fetchRecapStory(distId, vendedorId, periodoKey),
    enabled: distId > 0 && !!vendedorId && !!periodoKey,
    staleTime: RECAP_STORY_STALE_MS,
    gcTime: RECAP_GC_MS,
    placeholderData: keepPreviousData,
  } as const;
}

export function carruselQueryOptions(distId: number, periodoKey: string) {
  return {
    queryKey: recapKeys.carrusel(distId, periodoKey),
    queryFn: () => fetchRecapCarrusel(distId, periodoKey),
    enabled: distId > 0 && !!periodoKey,
    staleTime: RECAP_CARRUSEL_STALE_MS,
    gcTime: RECAP_GC_MS,
    placeholderData: keepPreviousData,
  } as const;
}

export function prefetchRecapStory(
  queryClient: QueryClient,
  distId: number,
  vendedorId: string,
  periodoKey: string,
) {
  if (!distId || !vendedorId || !periodoKey) return;
  void queryClient.prefetchQuery(storyQueryOptions(distId, vendedorId, periodoKey));
}

export function prefetchRecapCarrusel(
  queryClient: QueryClient,
  distId: number,
  periodoKey: string,
) {
  if (!distId || !periodoKey) return;
  void queryClient.prefetchQuery(carruselQueryOptions(distId, periodoKey));
}

export function prefetchRecapSession(
  queryClient: QueryClient,
  distId: number,
  vendedorId: string,
  periodoKey: string,
) {
  if (!distId || !vendedorId || !periodoKey) return;
  void queryClient.prefetchQuery({
    ...sessionQueryOptions(distId, vendedorId, periodoKey),
    queryFn: async () => {
      const session = await fetchRecapSession(distId, vendedorId, periodoKey);
      seedRecapSessionCache(queryClient, distId, periodoKey, session, vendedorId);
      return session;
    },
  });
}

/** Precarga carrusel + story inicial + vecinos del carrusel (patrón Estadísticas). */
export function useRecapWarmCache(
  queryClient: QueryClient,
  distId: number,
  periodoKey: string,
  vendedorId: string,
  neighborVendorIds: string[] = [],
) {
  useEffect(() => {
    if (!distId || !periodoKey || !vendedorId) return;
    prefetchRecapSession(queryClient, distId, vendedorId, periodoKey);
    for (const id of neighborVendorIds) {
      prefetchRecapStory(queryClient, distId, id, periodoKey);
    }
  }, [queryClient, distId, periodoKey, vendedorId, neighborVendorIds.join("|")]);
}

export function useRecapSession(
  distId: number,
  vendedorId: string,
  periodoKey: string,
) {
  const queryClient = useQueryClient();
  return useQuery({
    ...sessionQueryOptions(distId, vendedorId, periodoKey),
    queryFn: async () => {
      const session = await fetchRecapSession(distId, vendedorId, periodoKey);
      seedRecapSessionCache(queryClient, distId, periodoKey, session, vendedorId);
      return session;
    },
  });
}

export function useRecapStory(
  distId: number,
  vendedorId: string,
  periodoKey: string,
) {
  return useQuery(storyQueryOptions(distId, vendedorId, periodoKey));
}

export function useRecapHistorial(distId: number, vendedorId: string) {
  return useQuery({
    queryKey: recapKeys.historial(distId, vendedorId),
    queryFn: () => fetchRecapHistorial(distId, vendedorId),
    enabled: distId > 0 && !!vendedorId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useRecapPeriodos(distId: number) {
  return useQuery({
    queryKey: recapKeys.periodos(distId),
    queryFn: () => fetchRecapPeriodos(distId),
    enabled: distId > 0,
    staleTime: RECAP_META_STALE_MS,
    gcTime: RECAP_GC_MS,
  });
}

export function useRecapPendientes(distId: number) {
  return useQuery({
    queryKey: recapKeys.pendientes(distId),
    queryFn: () => fetchRecapPendientes(distId),
    enabled: distId > 0,
    staleTime: RECAP_META_STALE_MS,
    gcTime: RECAP_GC_MS,
  });
}

export function useRecapCarrusel(distId: number, periodoKey: string) {
  return useQuery(carruselQueryOptions(distId, periodoKey));
}

export function evolucionQueryOptions(distId: number, vendedorId: string, mes: string) {
  return {
    queryKey: recapKeys.evolucion(distId, vendedorId, mes),
    queryFn: () => fetchRecapEvolucion(distId, vendedorId, mes),
    enabled: distId > 0 && !!vendedorId && !!mes,
    staleTime: RECAP_STORY_STALE_MS,
    gcTime: RECAP_GC_MS,
  } as const;
}

export function prefetchRecapEvolucion(
  queryClient: QueryClient,
  distId: number,
  vendedorId: string,
  mes: string,
) {
  if (!distId || !vendedorId || !mes) return;
  void queryClient.prefetchQuery(evolucionQueryOptions(distId, vendedorId, mes));
}

export function seedRecapEvolucionCache(
  queryClient: QueryClient,
  distId: number,
  mes: string,
  bundle: RecapEvolucionBundle,
) {
  for (const item of bundle.items ?? []) {
    if (!item?.id_vendedor) continue;
    queryClient.setQueryData(
      recapKeys.evolucion(distId, item.id_vendedor, mes),
      item,
    );
  }
}

export function recapEvolucionBundleQueryOptions(
  distId: number,
  mes: string,
  sucursal: string | null,
) {
  return {
    queryKey: bundleKeys.recapEvolucion(distId, mes, sucursal),
    queryFn: () => fetchRecapEvolucionBundle(distId, mes, sucursal),
    enabled: distId > 0 && !!mes,
    staleTime: RECAP_STORY_STALE_MS,
    gcTime: RECAP_GC_MS,
  } as const;
}

export function prefetchRecapEvolucionBundle(
  queryClient: QueryClient,
  distId: number,
  mes: string,
  sucursal: string | null = null,
) {
  if (!distId || !mes) return;
  void queryClient.prefetchQuery({
    ...recapEvolucionBundleQueryOptions(distId, mes, sucursal),
    queryFn: async () => {
      const bundle = await fetchRecapEvolucionBundle(distId, mes, sucursal);
      seedRecapEvolucionCache(queryClient, distId, mes, bundle);
      return bundle;
    },
  });
}

/** Precarga bundle Q1→Q2→C del mes (patrón cartas estadísticas). */
export function useRecapEvolucionBundle(
  distId: number,
  mes: string | null,
  sucursal: string | null = null,
) {
  const queryClient = useQueryClient();
  return useQuery({
    ...recapEvolucionBundleQueryOptions(distId, mes ?? "", sucursal),
    enabled: distId > 0 && !!mes,
    queryFn: async () => {
      const bundle = await fetchRecapEvolucionBundle(distId, mes!, sucursal);
      seedRecapEvolucionCache(queryClient, distId, mes!, bundle);
      return bundle;
    },
  });
}

/** @deprecated Prefer useRecapEvolucionBundle — mantiene prefetch puntual por vendedor. */
export function useRecapEvolucionWarmCache(
  queryClient: QueryClient,
  distId: number,
  mes: string | null,
  vendorIds: string[] = [],
) {
  useEffect(() => {
    if (!distId || !mes) return;
    prefetchRecapEvolucionBundle(queryClient, distId, mes, null);
  }, [queryClient, distId, mes]);
}

export function useRecapEvolucion(
  distId: number,
  vendedorId: string,
  mes: string,
  enabled = true,
) {
  return useQuery({
    ...evolucionQueryOptions(distId, vendedorId, mes),
    enabled: enabled && distId > 0 && !!vendedorId && !!mes,
  });
}

export type { RecapCarrusel, RecapStory, RecapEvolucion, RecapEvolucionBundle };

export function useMarkRecapVisto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      distId,
      periodoKey,
    }: {
      distId: number;
      periodoKey: string;
    }) => markRecapVisto(distId, periodoKey),
    onSuccess: (_, { distId }) => {
      void qc.invalidateQueries({ queryKey: recapKeys.pendientes(distId) });
      void qc.invalidateQueries({ queryKey: recapKeys.periodos(distId) });
    },
  });
}
