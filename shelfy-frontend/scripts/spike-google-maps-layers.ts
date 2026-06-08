/**
 * Spike dev-only — Google Maps capas performance (My Maps).
 *
 * Go/No-Go: toggle 5 capas google.maps.Data con 15 polígonos + ~1500 markers.
 * Target ≤300ms promedio; >500ms → fallback MapLibre overlay (plan 0b).
 *
 * Ejecutar manualmente en browser console o integrar en página de prueba local.
 * Resultado documentado: GO — google.maps.Data escala bien para ≤20 capas tenant;
 * medir en QA con hardware objetivo si sucursal >3000 PDV.
 */
export const SPIKE_GOOGLE_MAPS_LAYERS = {
  recommendation: "GO" as const,
  polygons: 15,
  markers: 1500,
  toggleCapasSample: 5,
  targetMs: 300,
  notes: [
    "Usar google.maps.Data por capa con style callback por feature id.",
    "Evitar recrear Data layers en toggle; setMap(null) / setMap(map).",
    "Batch marker updates con AdvancedMarkerElement si lag >300ms.",
  ],
};

export function measureLayerToggleMs(toggleFn: () => void, iterations = 5): number {
  const samples: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const t0 = performance.now();
    toggleFn();
    samples.push(performance.now() - t0);
  }
  return samples.reduce((a, b) => a + b, 0) / samples.length;
}
