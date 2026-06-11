/** TanStack Query keys — Estadísticas / cartas vendedor */

export const estadisticasKeys = {
  all: ['estadisticas'] as const,
  meses: (distId: number) => ['estadisticas', 'meses', distId] as const,
  sucursales: (distId: number) => ['estadisticas', 'sucursales', distId] as const,
  cartas: (distId: number, meses: string[], sucursal: string | null) =>
    ['estadisticas', 'cartas', distId, [...meses].sort().join(','), sucursal] as const,
  detalle: (distId: number, vendedorId: string, meses: string[], cuenta?: string | null) =>
    ['estadisticas', 'detalle', distId, vendedorId, [...meses].sort().join(','), cuenta ?? ''] as const,
};
