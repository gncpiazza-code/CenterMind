import { useMemo } from "react";
import type { GaleriaMapaPin } from "@/lib/api";

interface UseGaleriaMapClusteringParams {
  pins: GaleriaMapaPin[];
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
  zoom,
  CLUSTER_ZOOM_THRESHOLD = 12,
  MAX_MARKERS = 250,
}: UseGaleriaMapClusteringParams): UseGaleriaMapClusteringResult {
  const showNativeCluster = zoom < CLUSTER_ZOOM_THRESHOLD;

  const visiblePins = useMemo(() => {
    if (showNativeCluster) return [];
    return pins.slice(0, MAX_MARKERS);
  }, [pins, showNativeCluster, MAX_MARKERS]);

  return {
    showNativeCluster,
    visiblePins,
    totalPins: pins.length,
  };
}
