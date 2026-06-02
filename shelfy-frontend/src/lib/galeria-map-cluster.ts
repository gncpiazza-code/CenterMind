import type { GaleriaMapaPin } from "@/lib/api";

export interface GaleriaMapCluster {
  id: string;
  lat: number;
  lng: number;
  count: number;
  pins: GaleriaMapaPin[];
}

/** Solo a este zoom o más: todos los PDVs como pin con foto (sin agrupación). */
export const ZOOM_SHOW_PINS = 14;

/** Vista inicial / fitBounds: no acercar más que esto (mantiene agrupaciones visibles). */
export const ZOOM_MAX_CLUSTER_VIEW = 9;

/** Cada clic en tarjeta de grupo avanza este many niveles de zoom. */
export const ZOOM_CLUSTER_CLICK_STEP = 2;

/** Tarjetas de grupo solo si hay al menos N PDVs; debajo → pins con foto sueltos. */
export const MIN_CLUSTER_CARD_COUNT = 5;

function cellSizeDeg(zoom: number): number {
  const z = Math.floor(zoom);
  // Celdas más chicas → los grupos se desgranan antes al acercar
  return 0.22 / Math.pow(2, Math.max(0, z - 4));
}

function distDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dlat = lat1 - lat2;
  const dlng = lng1 - lng2;
  return Math.sqrt(dlat * dlat + dlng * dlng);
}

function recomputeClusterCenter(cluster: GaleriaMapCluster): void {
  let lat = 0;
  let lng = 0;
  for (const p of cluster.pins) {
    lat += p.latitud;
    lng += p.longitud;
  }
  cluster.lat = lat / cluster.pins.length;
  cluster.lng = lng / cluster.pins.length;
  cluster.count = cluster.pins.length;
}

/** Evita pin suelto + tarjeta de grupo encimados en celdas vecinas. */
function mergeNearbySingletonClusters(
  clusters: GaleriaMapCluster[],
  maxDistDeg: number,
): GaleriaMapCluster[] {
  const multis = clusters.filter((c) => c.count > 1);
  const singles = clusters.filter((c) => c.count === 1);
  if (singles.length === 0 || multis.length === 0) return clusters;

  const absorbed = new Set<string>();
  for (const single of singles) {
    const pin = single.pins[0];
    let target: GaleriaMapCluster | null = null;
    let best = maxDistDeg;
    for (const multi of multis) {
      const d = distDeg(pin.latitud, pin.longitud, multi.lat, multi.lng);
      if (d < best) {
        best = d;
        target = multi;
      }
    }
    if (!target) continue;
    target.pins.push(pin);
    recomputeClusterCenter(target);
    absorbed.add(single.id);
  }

  return clusters.filter((c) => !absorbed.has(c.id));
}

export function shouldShowPinMarkers(zoom: number): boolean {
  return Math.floor(zoom) >= ZOOM_SHOW_PINS;
}

/** Agrupa PDVs por celda geográfica; pins sueltos solo en zoom alto (fotos individuales). */
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

  const merged = mergeNearbySingletonClusters(clusters, cell * 1.35);
  return { clusters: merged, singles: [] };
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
