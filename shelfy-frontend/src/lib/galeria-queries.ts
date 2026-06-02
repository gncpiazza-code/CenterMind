import type { QueryClient } from "@tanstack/react-query";
import {
  fetchGaleriaTimelineCliente,
  fetchGaleriaMapaVendedor,
  fetchGaleriaMeses,
  fetchGaleriaVendedores,
  fetchGaleriaPdvInsight,
} from "@/lib/api";

export const galeriaKeys = {
  all: ["galeria"] as const,
  meses: (distId: number, vendedorId?: number | null) =>
    [...galeriaKeys.all, "meses", distId, vendedorId ?? "dist"] as const,
  vendedores: (distId: number, sucursal: string, mes: string) =>
    [...galeriaKeys.all, "vendedores", distId, sucursal, mes] as const,
  mapa: (
    vendedorId: number,
    distId: number,
    bboxKey: string,
    zoomBucket: number,
    filtros: string,
  ) =>
    [...galeriaKeys.all, "mapa", vendedorId, distId, bboxKey, zoomBucket, filtros] as const,
  timeline: (
    distId: number,
    idCliente: number,
    idVendedor: number | null | undefined,
    desde: string,
    hasta: string,
  ) =>
    [
      ...galeriaKeys.all,
      "timeline",
      distId,
      idCliente,
      idVendedor ?? "all",
      desde,
      hasta,
    ] as const,
  pdvDetalle: (distId: number, idClienteErp: string, desde: string, hasta: string) =>
    [...galeriaKeys.all, "pdv-detalle", distId, idClienteErp, desde, hasta] as const,
};

export function galeriaFiltrosHash(
  desde?: string,
  hasta?: string,
  estado?: string,
): string {
  return `${desde ?? ""}_${hasta ?? ""}_${estado ?? ""}`;
}

export async function prefetchGaleriaTimeline(
  qc: QueryClient,
  params: {
    distId: number;
    idCliente: number;
    idVendedor?: number | null;
    desde?: string;
    hasta?: string;
  },
) {
  const { distId, idCliente, idVendedor, desde, hasta } = params;
  return qc.prefetchQuery({
    queryKey: galeriaKeys.timeline(
      distId,
      idCliente,
      idVendedor,
      desde ?? "",
      hasta ?? "",
    ),
    queryFn: () =>
      fetchGaleriaTimelineCliente(idCliente, distId, {
        idVendedor,
        desde,
        hasta,
      }),
    staleTime: 60_000,
  });
}

export async function prefetchGaleriaPdvDetalle(
  qc: QueryClient,
  distId: number,
  idClienteErp: string,
  params?: { desde?: string; hasta?: string },
) {
  if (!idClienteErp.trim()) return;
  const desde = params?.desde ?? "";
  const hasta = params?.hasta ?? "";
  return qc.prefetchQuery({
    queryKey: galeriaKeys.pdvDetalle(distId, idClienteErp, desde, hasta),
    queryFn: () => fetchGaleriaPdvInsight(distId, idClienteErp, { desde, hasta }),
    staleTime: 120_000,
  });
}
