"use client";

import { useEffect, useMemo } from "react";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  fetchClienteInfo,
  fetchERPContexto,
  type ClienteContacto,
  type ERPContexto,
  type GrupoPendiente,
} from "@/lib/api";
import {
  VISOR_ERP_STALE_MS,
  VISOR_PDV_GC_MS,
  VISOR_PDV_STALE_MS,
  visorErpFromGrupo,
  visorErpSkip,
  visorQueryKeys,
} from "@/lib/visor-query-keys";
import { useVisorContextStore } from "@/store/useVisorContextStore";
import { useVisorPublicDemo } from "@/components/visor/VisorDemoContext";
import { VISOR_DEMO_ERP, VISOR_DEMO_PDV } from "@/lib/visor-demo-data";

export function pdvContactoQueryOptions(
  distId: number,
  erp: string,
  vendedor: string,
) {
  return {
    queryKey: visorQueryKeys.pdv(distId, erp, vendedor),
    queryFn: () => fetchClienteInfo(distId, vendedor, erp),
    staleTime: VISOR_PDV_STALE_MS,
    gcTime: VISOR_PDV_GC_MS,
  } as const;
}

export function erpContextoQueryOptions(distId: number, erp: string) {
  return {
    queryKey: visorQueryKeys.erp(distId, erp),
    queryFn: () => fetchERPContexto(distId, erp),
    staleTime: VISOR_ERP_STALE_MS,
    gcTime: VISOR_PDV_GC_MS,
  } as const;
}

function prefetchPdvAndErp(
  queryClient: QueryClient,
  distId: number,
  grupo: GrupoPendiente | undefined,
  usaContextoErp: boolean,
) {
  if (!grupo || !distId) return;
  const erp = visorErpFromGrupo(grupo);
  if (visorErpSkip(erp)) return;
  const vendedor = grupo.vendedor ?? "";
  void queryClient.prefetchQuery(pdvContactoQueryOptions(distId, erp, vendedor));
  if (usaContextoErp) {
    void queryClient.prefetchQuery(erpContextoQueryOptions(distId, erp));
  }
}

/**
 * Precarga padrón + ERP: prioridad en `activeQueue` (filtro actual + vecinos),
 * luego hasta 48 ERP únicos de `allGrupos` (pendientes completos al cargar).
 */
export function useVisorPdvPrefetch(
  distId: number,
  activeQueue: GrupoPendiente[],
  allGrupos: GrupoPendiente[],
  currentIndex: number,
  usaContextoErp: boolean,
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!distId) return;

    const seen = new Set<string>();
    const ordered: GrupoPendiente[] = [];

    const push = (g: GrupoPendiente | undefined) => {
      if (!g) return;
      const erp = visorErpFromGrupo(g);
      if (visorErpSkip(erp) || seen.has(erp)) return;
      seen.add(erp);
      ordered.push(g);
    };

    push(activeQueue[currentIndex]);
    push(activeQueue[currentIndex + 1]);
    push(activeQueue[currentIndex + 2]);
    push(activeQueue[currentIndex - 1]);
    for (let i = 0; i < activeQueue.length && ordered.length < 52; i++) {
      if (Math.abs(i - currentIndex) <= 2) continue;
      push(activeQueue[i]);
    }
    for (const g of allGrupos) {
      if (ordered.length >= 52) break;
      push(g);
    }

    for (const g of ordered) {
      prefetchPdvAndErp(queryClient, distId, g, usaContextoErp);
    }
  }, [distId, activeQueue, allGrupos, currentIndex, usaContextoErp, queryClient]);
}

export function useVisorClienteContext(params: {
  distId: number;
  grupo: GrupoPendiente | null;
  usaContextoErp: boolean;
}) {
  const { distId, grupo, usaContextoErp } = params;
  const publicDemo = useVisorPublicDemo();
  const nroForErp = visorErpFromGrupo(grupo);
  const skipErpFetch = visorErpSkip(nroForErp);
  const vendedor = grupo?.vendedor ?? "";

  const getPdvCached = useVisorContextStore((s) => s.getPdv);
  const setPdvCached = useVisorContextStore((s) => s.setPdv);
  const getErpCached = useVisorContextStore((s) => s.getErp);
  const setErpCached = useVisorContextStore((s) => s.setErp);

  const pdvQuery = useQuery({
    ...pdvContactoQueryOptions(distId, nroForErp, vendedor),
    enabled: distId > 0 && !skipErpFetch && !publicDemo,
    initialData: publicDemo ? [VISOR_DEMO_PDV] : undefined,
    placeholderData: () => {
      if (publicDemo) return [VISOR_DEMO_PDV];
      const cached = getPdvCached(distId, nroForErp);
      return cached;
    },
  });

  const erpQuery = useQuery({
    ...erpContextoQueryOptions(distId, nroForErp),
    enabled: usaContextoErp && distId > 0 && !skipErpFetch && !publicDemo,
    initialData: publicDemo ? VISOR_DEMO_ERP : undefined,
    placeholderData: () => {
      if (publicDemo) return VISOR_DEMO_ERP;
      const cached = getErpCached(distId, nroForErp);
      if (cached === undefined) return undefined;
      return cached;
    },
  });

  useEffect(() => {
    if (pdvQuery.data !== undefined && distId > 0 && !skipErpFetch) {
      setPdvCached(distId, nroForErp, pdvQuery.data);
    }
  }, [pdvQuery.data, distId, nroForErp, skipErpFetch, setPdvCached]);

  useEffect(() => {
    if (erpQuery.data !== undefined && distId > 0 && !skipErpFetch) {
      setErpCached(distId, nroForErp, erpQuery.data);
    }
  }, [erpQuery.data, distId, nroForErp, skipErpFetch, setErpCached]);

  const pdvInfo: ClienteContacto | null = pdvQuery.data?.[0] ?? null;

  const erpContext: ERPContexto | null = useMemo(() => {
    const erpRaw = erpQuery.data;
    if (!erpRaw) return null;
    return {
      ...erpRaw,
      nombre_fantasia: erpRaw.nombre_fantasia || erpRaw.razon_social || undefined,
      ultima_compra: erpRaw.ultima_compra ?? undefined,
      ultimo_comprobante: erpRaw.ultimo_comprobante ?? undefined,
      ultima_compra_articulos: erpRaw.ultima_compra_articulos ?? undefined,
      ultima_compra_comprobantes: erpRaw.ultima_compra_comprobantes ?? undefined,
      ultima_compra_articulos_resumen: erpRaw.ultima_compra_articulos_resumen ?? undefined,
      padron_anulado: erpRaw.padron_anulado,
      activo_comercial: erpRaw.activo_comercial,
      promedio_factura: erpRaw.promedio_factura ?? undefined,
      deuda_total: erpRaw.deuda_total ?? 0,
      cant_facturas: erpRaw.cant_facturas ?? undefined,
      domicilio: erpRaw.domicilio ?? undefined,
      localidad: erpRaw.localidad ?? undefined,
      nro_ruta: erpRaw.nro_ruta ?? undefined,
      dia_visita: erpRaw.dia_visita ?? undefined,
    };
  }, [erpQuery.data]);

  const pdvResolved =
    publicDemo ||
    skipErpFetch ||
    pdvQuery.isFetched ||
    getPdvCached(distId, nroForErp) !== undefined;
  const pdvLoading = !publicDemo && !skipErpFetch && !pdvResolved;
  const loadingERP =
    !publicDemo &&
    usaContextoErp &&
    !skipErpFetch &&
    erpQuery.isFetching &&
    !erpQuery.data;

  return {
    nroForErp,
    skipErpFetch,
    pdvInfo,
    erpContext,
    pdvLoading,
    loadingERP,
    pdvQuery,
    erpQuery,
  };
}
