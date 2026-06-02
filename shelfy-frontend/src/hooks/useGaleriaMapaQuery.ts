import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { type MapViewport } from "@/components/ui/map";
import { fetchGaleriaMapaVendedor, type GaleriaMapaPin } from "@/lib/api";
import { galeriaKeys, galeriaFiltrosHash } from "@/lib/galeria-queries";
import { GALERIA_MAP_QUERY_BBOX_AR } from "@/lib/galeria-map-bounds";

/** Viewport inicial (Argentina) para disparar la primera carga sin esperar pan/zoom. */
const DEFAULT_MAP_VIEWPORT: MapViewport = {
  center: [-63.6167, -38.4161],
  zoom: 5,
  bearing: 0,
  pitch: 0,
};

interface UseGaleriaMapaQueryParams {
  vendedorId: number | null;
  distId: number;
  desde?: string;
  hasta?: string;
  estado?: string;
}

export interface UseGaleriaMapaQueryResult {
  pins: GaleriaMapaPin[];
  sinCoordsCount: number;
  isLoading: boolean;
  onViewportChange: (vp: MapViewport) => void;
  viewport: MapViewport | null;
}

export function useGaleriaMapaQuery(
  params: UseGaleriaMapaQueryParams
): UseGaleriaMapaQueryResult {
  const [viewport, setViewport] = useState<MapViewport | null>(DEFAULT_MAP_VIEWPORT);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  const lastVendedorRef = useRef<number | null>(params.vendedorId);

  // Al cambiar vendedor, volver a viewport amplio (evita bbox del vendedor anterior).
  useEffect(() => {
    if (lastVendedorRef.current === params.vendedorId) return;
    lastVendedorRef.current = params.vendedorId;
    clearTimeout(debounceRef.current);
    setViewport(DEFAULT_MAP_VIEWPORT);
  }, [params.vendedorId]);

  const onViewportChange = useCallback((vp: MapViewport) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setViewport(vp), 300);
  }, []);

  const zoom = viewport?.zoom ?? 8;
  // Bbox fijo: evita refetch al panear y el parpadeo de overlays al cambiar el set de pins.
  const bbox = GALERIA_MAP_QUERY_BBOX_AR;
  const bboxKeyStr = "ar-wide";
  const zoomBucket = Math.floor(zoom);
  const fHash = galeriaFiltrosHash(params.desde, params.hasta, params.estado);

  const query = useQuery({
    queryKey: galeriaKeys.mapa(
      params.vendedorId ?? 0,
      params.distId,
      bboxKeyStr,
      zoomBucket,
      fHash,
    ),
    queryFn: async () => {
      if (!params.vendedorId || !bbox) {
        return { pins: [] as GaleriaMapaPin[], sin_coords_count: 0, total_vendedor: 0 };
      }
      return fetchGaleriaMapaVendedor(params.vendedorId, {
        distId: params.distId,
        latMin: bbox.latMin,
        lngMin: bbox.lngMin,
        latMax: bbox.latMax,
        lngMax: bbox.lngMax,
        zoom: zoom,
        desde: params.desde,
        hasta: params.hasta,
        estado: params.estado,
      });
    },
    enabled: params.vendedorId !== null && Boolean(params.desde && params.hasta),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  return {
    pins: query.data?.pins ?? [],
    sinCoordsCount: query.data?.sin_coords_count ?? 0,
    isLoading: query.isLoading,
    onViewportChange,
    viewport,
  };
}
