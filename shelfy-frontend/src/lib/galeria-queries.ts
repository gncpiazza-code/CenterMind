import type { QueryClient } from "@tanstack/react-query";
import {
  fetchGaleriaTimelineCliente,
  fetchGaleriaMapaVendedor,
  fetchGaleriaMeses,
  fetchGaleriaVendedores,
  fetchGaleriaPdvInsight,
  type GaleriaTimelineItem,
} from "@/lib/api";
import type { GaleriaPublicacion } from "@/lib/galeria-publicaciones";

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
  timelineFull: (distId: number, idCliente: number, idVendedor?: number | null) =>
    [...galeriaKeys.all, "timeline-full", distId, idCliente, idVendedor ?? "all"] as const,
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

export async function prefetchGaleriaTimelineFull(
  qc: QueryClient,
  params: {
    distId: number;
    idCliente: number;
    idVendedor?: number | null;
  },
) {
  const { distId, idCliente, idVendedor } = params;
  return qc.prefetchQuery({
    queryKey: galeriaKeys.timelineFull(distId, idCliente, idVendedor),
    queryFn: () => fetchAllGaleriaTimeline(idCliente, distId, idVendedor ?? undefined),
    staleTime: 120_000,
  });
}

/** Precarga URLs de imagen en cache del navegador (best-effort). */
export function preloadGaleriaImageUrls(urls: string[]): Promise<void> {
  const unique = [...new Set(urls.filter((u) => u?.trim()))].slice(0, 6);
  if (unique.length === 0) return Promise.resolve();
  return Promise.all(
    unique.map(
      (url) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = url;
        }),
    ),
  ).then(() => undefined);
}

export async function preloadGaleriaPublication(
  pub: GaleriaPublicacion | null | undefined,
): Promise<void> {
  if (!pub?.fotos?.length) return;
  const urls = pub.fotos.map((f) => f.url_foto).filter(Boolean);
  await preloadGaleriaImageUrls(urls);
}

/** Índice inicial: última visita del mes filtrado, o la más reciente del historial completo. */
export function pickInitialPublicationIndex(
  carouselPubs: GaleriaPublicacion[],
  filteredPubs: GaleriaPublicacion[],
): number {
  if (carouselPubs.length === 0) return 0;
  if (filteredPubs.length > 0) {
    const last = filteredPubs[filteredPubs.length - 1];
    const found = carouselPubs.findIndex((p) => p.dia_ar === last.dia_ar);
    if (found >= 0) return found;
  }
  return carouselPubs.length - 1;
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

/** Fetch ALL timeline pages for a PDV (no date filter). Returns flat item array. */
export async function fetchAllGaleriaTimeline(
  idCliente: number,
  distId: number,
  idVendedor?: number,
): Promise<GaleriaTimelineItem[]> {
  const LIMIT = 120;
  const allItems: GaleriaTimelineItem[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const res = await fetchGaleriaTimelineCliente(idCliente, distId, {
      offset,
      limit: LIMIT,
      idVendedor,
    });
    allItems.push(...res.items);
    hasMore = res.has_more;
    offset += LIMIT;
    if (allItems.length >= 2000) break; // safety cap
  }

  return allItems;
}
