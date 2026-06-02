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

/** Mínimo para mostrar tarjeta; debajo de esto se fusiona con el cluster más cercano. */
export const MIN_CLUSTER_CARD_COUNT = 6;

function cellSizeDeg(zoom: number): number {
  const z = Math.floor(zoom);
  return 0.28 / Math.pow(2, Math.max(0, z - 3));
}

function distDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dlat = lat1 - lat2;
  const dlng = lng1 - lng2;
  return Math.sqrt(dlat * dlat + dlng * dlng);
}

function recomputeClusterCenter(cluster: GaleriaMapCluster): void {
  const unique = dedupePins(cluster.pins);
  cluster.pins = unique;
  let lat = 0;
  let lng = 0;
  for (const p of unique) {
    lat += p.latitud;
    lng += p.longitud;
  }
  cluster.lat = lat / unique.length;
  cluster.lng = lng / unique.length;
  cluster.count = unique.length;
}

function dedupePins(pins: GaleriaMapaPin[]): GaleriaMapaPin[] {
  const byId = new Map<number, GaleriaMapaPin>();
  for (const p of pins) {
    byId.set(p.id_cliente, p);
  }
  return [...byId.values()];
}

function cloneCluster(c: GaleriaMapCluster): GaleriaMapCluster {
  return {
    id: c.id,
    lat: c.lat,
    lng: c.lng,
    count: c.count,
    pins: [...c.pins],
  };
}

function mergeInto(target: GaleriaMapCluster, source: GaleriaMapCluster): void {
  target.pins.push(...source.pins);
  recomputeClusterCenter(target);
  target.id = `${target.id}|${source.id}`;
}

function findNearestCluster(
  from: GaleriaMapCluster,
  others: GaleriaMapCluster[],
): GaleriaMapCluster | null {
  if (others.length === 0) return null;
  let best: GaleriaMapCluster | null = null;
  let bestD = Infinity;
  for (const c of others) {
    const d = distDeg(from.lat, from.lng, c.lat, c.lng);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** Une celdas vecinas en el grid inicial. */
function consolidateClustersByProximity(
  clusters: GaleriaMapCluster[],
  maxDistDeg: number,
): GaleriaMapCluster[] {
  const n = clusters.length;
  if (n <= 1) return clusters;

  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    if (parent[i] === i) return i;
    parent[i] = find(parent[i]);
    return parent[i];
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = distDeg(clusters[i].lat, clusters[i].lng, clusters[j].lat, clusters[j].lng);
      if (d <= maxDistDeg) union(i, j);
    }
  }

  const groups = new Map<number, { pins: GaleriaMapaPin[]; id: string }>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const prev = groups.get(root);
    if (prev) {
      prev.pins.push(...clusters[i].pins);
    } else {
      groups.set(root, { pins: [...clusters[i].pins], id: clusters[i].id });
    }
  }

  const out: GaleriaMapCluster[] = [];
  groups.forEach(({ pins, id }) => {
    const cluster: GaleriaMapCluster = {
      id,
      lat: 0,
      lng: 0,
      count: 0,
      pins,
    };
    recomputeClusterCenter(cluster);
    out.push(cluster);
  });

  return out;
}

/**
 * Grupos con count < minCount se absorben SIEMPRE en el cluster más cercano
 * (sin límite de distancia). Repite hasta que no queden tarjetas 1–5 sueltas.
 */
export function absorbSmallClustersIntoNearest(
  clusters: GaleriaMapCluster[],
  minCount: number = MIN_CLUSTER_CARD_COUNT,
): GaleriaMapCluster[] {
  let list = clusters.map(cloneCluster);

  for (let guard = 0; guard < 500; guard++) {
    const small = list.filter((c) => c.count < minCount);
    if (small.length === 0) return list.sort((a, b) => b.count - a.count);

    if (list.length === 1) return list;

    const pick =
      small.length === list.length
        ? small.reduce((a, b) => (a.count <= b.count ? a : b))
        : small[0];

    const others = list.filter((c) => c.id !== pick.id);
    const nearest = findNearestCluster(pick, others);
    if (!nearest) return list;

    mergeInto(nearest, pick);
    list = list.filter((c) => c.id !== pick.id);
  }

  return list;
}

export function shouldShowPinMarkers(zoom: number): boolean {
  return Math.floor(zoom) >= ZOOM_SHOW_PINS;
}

/** Agrupa PDVs por celda + fusión; sin tarjetas de 1–5 PDVs sueltas. */
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
    const cluster: GaleriaMapCluster = {
      id: key,
      lat: 0,
      lng: 0,
      count: group.length,
      pins: group,
    };
    recomputeClusterCenter(cluster);
    clusters.push(cluster);
  });

  const mergeDist = Math.max(cell * 2.5, 0.006);
  const merged = consolidateClustersByProximity(clusters, mergeDist);
  const final = absorbSmallClustersIntoNearest(merged, MIN_CLUSTER_CARD_COUNT);
  return { clusters: final, singles: [] };
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
