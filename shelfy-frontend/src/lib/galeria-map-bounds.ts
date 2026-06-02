/** Bbox amplio (Argentina) para la primera carga del mapa y encuadre del vendedor. */
export const GALERIA_MAP_QUERY_BBOX_AR = {
  latMin: -55,
  latMax: -21,
  lngMin: -73,
  lngMax: -53,
} as const;

export function useWideMapQueryBbox(zoom: number): boolean {
  return Math.floor(zoom) <= 10;
}
