import type { GaleriaMapaPin } from "@/lib/api";

export interface GaleriaMapCluster {
  id: string;
  lat: number;
  lng: number;
  count: number;
  pins: GaleriaMapaPin[];
}

/** Solo a este zoom o más: pins con foto. Por debajo, siempre tarjeta de grupo. */
export const ZOOM_SHOW_PINS = 17;

/** Vista inicial / fitBounds: no acercar más que esto (mantiene agrupaciones visibles). */
export const ZOOM_MAX_CLUSTER_VIEW = 9;

/** Cada clic en cluster sube como máximo 1 nivel de zoom. */
export const ZOOM_CLUSTER_CLICK_STEP = 1;

function cellSizeDeg(zoom: number): number {
  const z = Math.floor(zoom);
  // Celdas más grandes → menos desglose prematuro
  return 0.55 / Math.pow(2, Math.max(0, z - 3));
}

export function shouldShowPinMarkers(zoom: number): boolean {
  return Math.floor(zoom) >= ZOOM_SHOW_PINS;
}

/** Agrupa PDVs; por debajo de ZOOM_SHOW_PINS no hay singles con foto. */
export function clusterGaleriaPins(
  pins: GaleriaMapaPin[],
  zoom: number,
): { clusters: GaleriaMapCluster[]; singles: GaleriaMapaPin[] } {
  const z = Math.floor(zoom);
  if (pins.length === 0) {
    return { clusters: [], singles: [] };
  }

  if (shouldShowPinMarkers(z)) {
    return { clusters: [], singles: pins };
  }

  const cell = cellSizeDeg(z);
  const buckets = new Map<string, GaleriaMapaPin[]>();

  for (const pin of pins) {
    const gx = Math.floor(pin.latitud / cell);
    const gy = Math.floor(pin.longitud / cell);
    const key = `${gx}:${gy}`;
    const list = buckets.get(key) ?? [];
    list.push(pin);
    buckets.set(key, list);
  }

  const clusters: GaleriaMapCluster[] = [];

  buckets.forEach((group, key) => {
    let lat = 0;
    let lng = 0;
    for (const p of group) {
      lat += p.latitud;
      lng += p.longitud;
    }
    clusters.push({
      id: key,
      lat: lat / group.length,
      lng: lng / group.length,
      count: group.length,
      pins: group,
    });
  });

  return { clusters, singles: [] };
}

/** Centro y zoom sugerido para encuadrar todos los pins del vendedor. */
export function suggestMapViewFromPins(
  pins: GaleriaMapaPin[],
): { center: { lat: number; lng: number }; zoom: number } | null {
  if (pins.length === 0) return null;

  let latMin = pins[0].latitud;
  let latMax = pins[0].latitud;
  let lngMin = pins[0].longitud;
  let lngMax = pins[0].longitud;

  for (const p of pins) {
    latMin = Math.min(latMin, p.latitud);
    latMax = Math.max(latMax, p.latitud);
    lngMin = Math.min(lngMin, p.longitud);
    lngMax = Math.max(lngMax, p.longitud);
  }

  const lat = (latMin + latMax) / 2;
  const lng = (lngMin + lngMax) / 2;
  const latSpan = Math.max(latMax - latMin, 0.02);
  const lngSpan = Math.max(lngMax - lngMin, 0.02);
  const span = Math.max(latSpan, lngSpan);

  let zoom = 11;
  if (span > 8) zoom = 6;
  else if (span > 4) zoom = 7;
  else if (span > 2) zoom = 8;
  else if (span > 1) zoom = 9;
  else if (span > 0.4) zoom = 10;
  else if (span > 0.15) zoom = 11;
  else zoom = 12;

  return {
    center: { lat, lng },
    zoom: Math.min(zoom, ZOOM_MAX_CLUSTER_VIEW),
  };
}
