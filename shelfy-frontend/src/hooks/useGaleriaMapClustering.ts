import { useMemo } from "react";
import { type MapViewport } from "@/components/ui/map";
import type { GaleriaMapaPin } from "@/lib/api";

interface UseGaleriaMapClusteringParams {
  pins: GaleriaMapaPin[];
  viewport: MapViewport | null;
  zoom: number;
  CLUSTER_ZOOM_THRESHOLD?: number;
  MAX_MARKERS?: number;
}

interface UseGaleriaMapClusteringResult {
  showNativeCluster: boolean;
  visiblePins: GaleriaMapaPin[];
  totalPins: number;
}

export function useGaleriaMapClustering({
  pins,
  viewport,
  zoom,
  CLUSTER_ZOOM_THRESHOLD = 12,
  MAX_MARKERS = 250,
}: UseGaleriaMapClusteringParams): UseGaleriaMapClusteringResult {
  const showNativeCluster = zoom < CLUSTER_ZOOM_THRESHOLD;

  const visiblePins = useMemo(() => {
    if (showNativeCluster) return [];
    if (!viewport) return pins.slice(0, MAX_MARKERS);

    // Calcular bounds del viewport actual
    const latDelta = 360 / Math.pow(2, viewport.zoom);
    const lngDelta = 360 / Math.pow(2, viewport.zoom);
    const lat = viewport.center[1];
    const lng = viewport.center[0];

    const bounds = {
      latMin: lat - latDelta,
      latMax: lat + latDelta,
      lngMin: lng - lngDelta,
      lngMax: lng + lngDelta,
    };

    const filtered = pins.filter(
      (pin) =>
        pin.latitud >= bounds.latMin &&
        pin.latitud <= bounds.latMax &&
        pin.longitud >= bounds.lngMin &&
        pin.longitud <= bounds.lngMax
    );

    return filtered.slice(0, MAX_MARKERS);
  }, [pins, viewport, zoom, showNativeCluster, MAX_MARKERS]);

  return {
    showNativeCluster,
    visiblePins,
    totalPins: pins.length,
  };
}
