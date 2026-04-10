/**
 * Central registry of TanStack Query keys.
 * All queryFn implementations must reference these constants so that
 * invalidateQueries and prefetchQuery stay in sync automatically.
 *
 * Convention: ['domain', 'sub-resource', ...params]
 */

// ── Dashboard ────────────────────────────────────────────────────────────────
export const dashboardKeys = {
  all: ['dashboard'] as const,
  kpis: (distId: number, periodo: string, sucursal?: string | null) =>
    ['dashboard', 'kpis', distId, periodo, sucursal ?? null] as const,
  ranking: (distId: number, periodo: string, sucursal?: string | null) =>
    ['dashboard', 'ranking', distId, periodo, sucursal ?? null] as const,
  evolucion: (distId: number, periodo: string, sucursal?: string | null) =>
    ['dashboard', 'evolucion', distId, periodo, sucursal ?? null] as const,
  ultimas: (distId: number, sucursal?: string | null) =>
    ['dashboard', 'ultimas', distId, sucursal ?? null] as const,
  sucursales: (distId: number, periodo: string, sucursal?: string | null) =>
    ['dashboard', 'sucursales', distId, periodo, sucursal ?? null] as const,
  ciudades: (distId: number, periodo: string, sucursal?: string | null) =>
    ['dashboard', 'ciudades', distId, periodo, sucursal ?? null] as const,
  empresas: (periodo: string, sucursal?: string | null) =>
    ['dashboard', 'empresas', periodo, sucursal ?? null] as const,
};

// ── Visor ────────────────────────────────────────────────────────────────────
export const visorKeys = {
  all: ['visor'] as const,
  pendientes: (distId: number) => ['visor', 'pendientes', distId] as const,
  stats: (distId: number) => ['visor', 'stats', distId] as const,
  vendedores: (distId: number) => ['visor', 'vendedores', distId] as const,
  erpContexto: (distId: number, nroCliente: string) =>
    ['visor', 'erp-contexto', distId, nroCliente] as const,
};

// ── Reportes ERP ─────────────────────────────────────────────────────────────
export const reportesKeys = {
  all: ['reportes'] as const,
  auditoriaSigo: (distId: number, desde: string, hasta: string) =>
    ['reportes', 'auditoria-sigo', distId, desde, hasta] as const,
  ventasResumen: (distId: number, desde: string, hasta: string) =>
    ['reportes', 'ventas-resumen', distId, desde, hasta] as const,
  ventasBultos: (distId: number, desde: string, hasta: string, proveedor?: string) =>
    ['reportes', 'ventas-bultos', distId, desde, hasta, proveedor ?? ''] as const,
  cuentasDashboard: (distId: number) =>
    ['reportes', 'cuentas-dashboard', distId] as const,
};

// ── Academia / Cuentas Corrientes ─────────────────────────────────────────────
export const academiaKeys = {
  all: ['academia'] as const,
  recaudacionSummary: (distId: number, desde: string, hasta: string, vendedor?: string) =>
    ['academia', 'recaudacion-summary', distId, desde, hasta, vendedor ?? ''] as const,
  recaudacionDetallada: (distId: number, desde: string, hasta: string, vendedor?: string) =>
    ['academia', 'recaudacion-detallada', distId, desde, hasta, vendedor ?? ''] as const,
  clientesMuertos: (distId: number) => ['academia', 'clientes-muertos', distId] as const,
  erpVendedores: (distId: number) => ['academia', 'erp-vendedores', distId] as const,
  erpConfig: (distId: number) => ['academia', 'erp-config', distId] as const,
  clientesStats: (distId: number) => ['academia', 'clientes-stats', distId] as const,
  clientesTemporal: (distId: number) => ['academia', 'clientes-temporal', distId] as const,
  clientesDesgloseVendedor: (distId: number) =>
    ['academia', 'clientes-desglose', distId, 'vendedor'] as const,
  clientesDesgloseLocalidad: (distId: number) =>
    ['academia', 'clientes-desglose', distId, 'localidad'] as const,
  clientesListado: (distId: number, search: string) =>
    ['academia', 'clientes-listado', distId, search] as const,
  hierarchyConfig: (distId: number) => ['academia', 'hierarchy-config', distId] as const,
};

// ── Supervisión ───────────────────────────────────────────────────────────────
export const supervisionKeys = {
  all: ['supervision'] as const,
  vendedores: (distId: number) => ['supervision', 'vendedores', distId] as const,
  rutas: (vendedorId: number) => ['supervision', 'rutas', vendedorId] as const,
  clientes: (rutaId: number) => ['supervision', 'clientes', rutaId] as const,
  ventas: (distId: number, sucursal?: string | null, dias?: number) =>
    ['supervision', 'ventas', distId, sucursal ?? null, dias ?? 30] as const,
  cuentas: (distId: number, sucursal?: string | null) =>
    ['supervision', 'cuentas', distId, sucursal ?? null] as const,
  pdvsCercanos: (distId: number, lat: number, lng: number) =>
    ['supervision', 'pdvs-cercanos', distId, lat, lng] as const,
};

// ── Objetivos ─────────────────────────────────────────────────────────────────
export const objetivosKeys = {
  all: ['objetivos'] as const,
  lista: (distId: number) => ['objetivos', 'lista', distId] as const,
  timeline: (distId: number) => ['objetivos', 'timeline', distId] as const,
  resumen: (distId: number) => ['objetivos', 'resumen', distId] as const,
};

// ── Modo Oficina ──────────────────────────────────────────────────────────────
export const modoOficinaKeys = {
  all: ['modo-oficina'] as const,
  // These intentionally share the same leaf keys as dashboard so prefetch reuses cache
  ranking: (distId: number, periodo: string) =>
    ['dashboard', 'ranking', distId, periodo, null] as const,
  kpis: (distId: number, periodo: string) =>
    ['dashboard', 'kpis', distId, periodo, null] as const,
  liveEvents: (distId: number | undefined) =>
    ['modo-oficina', 'live-events', distId ?? null] as const,
  evolucion: (distId: number, periodo: string) =>
    ['dashboard', 'evolucion', distId, periodo, null] as const,
};

// ── Admin Mapa ────────────────────────────────────────────────────────────────
export const adminMapaKeys = {
  all: ['admin-mapa'] as const,
  liveEvents: (fecha: string) => ['admin-mapa', 'live-events', fecha] as const,
  sucursalesCruce: (distId: number | undefined, periodo: string) =>
    ['admin-mapa', 'sucursales-cruce', distId ?? null, periodo] as const,
};

// ── Admin Dashboard (motor runs) ──────────────────────────────────────────────
export const adminDashboardKeys = {
  motorRuns: (tipo?: string) => ['admin-dashboard', 'motor-runs', tipo ?? 'all'] as const,
};
