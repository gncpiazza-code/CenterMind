import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { type MapViewport } from "@/components/ui/map";
import { fetchGaleriaMapaVendedor, type GaleriaMapaPin } from "@/lib/api";
import { galeriaKeys, galeriaFiltrosHash } from "@/lib/galeria-queries";
import {
  GALERIA_MAP_QUERY_BBOX_AR,
  useWideMapQueryBbox,
} from "@/lib/galeria-map-bounds";

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

/** Calcular un bbox expandido 20% en cada eje lat/lng */
function expandBbox(viewport: MapViewport): {
  latMin: number;
  lngMin: number;
  latMax: number;
  lngMax: number;
} {
  const zoom = viewport.zoom;
  // Aproximación: a zoom 10, un tile cubre ~0.35° lat. Usamos una expansion fija del viewport.
  // Asumimos ±latDelta / ±lngDelta basado en zoom.
  const latDelta = 360 / Math.pow(2, zoom);
  const lngDelta = 360 / Math.pow(2, zoom);

  const expand = 0.2;
  const lat = viewport.center[1];
  const lng = viewport.center[0];

  return {
    latMin: lat - latDelta * (1 + expand),
    latMax: lat + latDelta * (1 + expand),
    lngMin: lng - lngDelta * (1 + expand),
    lngMax: lng + lngDelta * (1 + expand),
  };
}

function bboxKey(bbox: ReturnType<typeof expandBbox>): string {
  // Redondear a 3 decimales para estabilizar la key
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return `${r(bbox.latMin)}_${r(bbox.lngMin)}_${r(bbox.latMax)}_${r(bbox.lngMax)}`;
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
  const bbox = viewport
    ? useWideMapQueryBbox(zoom)
      ? GALERIA_MAP_QUERY_BBOX_AR
      : expandBbox(viewport)
    : null;
  const zoomBucket = Math.floor(zoom / 2);
  const bboxKeyStr = bbox ? bboxKey(bbox) : "none";
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
