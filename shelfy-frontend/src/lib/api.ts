import { API_URL, TOKEN_KEY } from "./constants";

// ── Tipos ──────────────────────────────────────────────────────────────────
export interface ClienteMaestro {
  id_cliente_erp_local: string;
  nombre_cliente: string;
  nombre_fantasia?: string;
  razon_social?: string;
  localidad: string;
  provincia: string;
  domicilio: string;
  sucursal_nombre: string;
  vendedor_nombre: string;
  vendedor_id: string;
  sucursal_id: string;
  estado: string;
  lat: number;
  lon: number;
  fecha_ultima_compra?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  usuario: string;
  rol: string;
  id_usuario: number;
  id_distribuidor: number | null;
  nombre_empresa: string | null;
  is_superadmin?: boolean;
  usa_quarentena?: boolean;
  usa_contexto_erp?: boolean;
  usa_mapeo_vendedores?: boolean;
  show_tutorial?: boolean;
}

export interface ERPUploadResponse {
  status: string;
  message: string;
  count: number;
}

export interface ERPDeuda {
  id_deuda: number;
  id_cliente_erp_local: string;
  nombre_cliente: string;
  saldo_total: number;
  cant_cbte: number;
  antiguedad_max_dias: number;
  alerta_texto: string;
  fecha_snapshot: string;
}

export interface KPIs {
  total: number;
  pendientes: number;
  aprobadas: number;
  rechazadas: number;
  destacadas: number;
}

export interface StatsHoy {
  total: number;
  pendientes: number;
  aprobadas: number;
  rechazadas: number;
  destacadas: number;
}

export interface VendedorRanking {
  vendedor: string;
  sucursal?: string;
  puntos: number;
  aprobadas: number;
  destacadas: number;
  rechazadas: number;
  location_id?: string;
}

export interface UltimaEvaluada {
  id_exhibicion: number;
  drive_link: string;
  estado: string;
  tipo_pdv: string;
  nro_cliente: string;
  vendedor: string;
  timestamp_subida: string;
  fecha_evaluacion?: string;
  ciudad?: string;
}

export interface EvolucionTiempo {
  fecha: string;
  aprobadas: number;
  rechazadas: number;
  total: number;
}

export interface RendimientoCiudad {
  ciudad: string;
  aprobadas: number;
  rechazadas: number;
  total: number;
}
export interface SucursalStats {
  sucursal: string;
  location_id: string;
  aprobadas: number;
  rechazadas: number;
  total: number;
}

export interface FotoGrupo {
  id_exhibicion: number;
  drive_link: string;
  estado?: string; // PASO 7: puede ser 'Cuarentena' o 'Revisión' para bloquear la evaluación
}

export interface GrupoPendiente {
  vendedor: string;
  nro_cliente: string;
  tipo_pdv: string;
  fecha_hora: string;
  fotos: FotoGrupo[];
}

// PASO 9: Contexto ERP del cliente durante evaluación
export interface ERPContexto {
  encontrado: boolean;
  nombre: string;
  nombre_fantasia?: string;
  razon_social?: string;
  fantasia?: string;
  ultima_compra?: string;
  vendedor_erp?: string;
  sucursal_erp?: string;
  total_30d: number;
  promedio_factura: number;
  cant_facturas: number;
  deuda_total: number;
  nro_ruta?: string;
  dia_visita?: string;
  domicilio?: string;
  localidad?: string;
  canal?: string;
  fecha_alta?: string;
}

// PASO 10: ROI Analítico
export interface ROIAnalitico {
  con_exhibicion: { clientes: number; facturacion_promedio: number; facturacion_total: number };
  sin_exhibicion: { clientes: number; facturacion_promedio: number; facturacion_total: number };
  uplift_pct: number;
}

export interface UsuarioPortal {
  id_usuario: number;
  usuario_login: string;
  rol: string;
  id_distribuidor: number;
  nombre_empresa: string;
}

export interface ERPMapping {
  nombre_erp: string;
  id_distribuidor: number;
  distribuidores?: {
    nombre_empresa: string;
  };
}

export interface UnknownCompany {
  nombre_erp: string;
  fecha: string;
}

export interface GlobalStressMonitor {
  id_dist: number;
  nombre_dist: string;
  total_exhibiciones: number;
  total_ventas_erp: number;
  total_clientes_erp: number;
  ultima_actividad: string | null;
  estado_bot: string;
}

export interface LiveMapEvent {
  id_ex: number;
  id_dist: number;
  nombre_dist: string;
  vendedor_nombre: string;
  lat: number;
  lon: number;
  timestamp_evento: string;
  nro_cliente: string;
  cliente_nombre?: string;
  drive_link?: string;
}

export interface BranchCruce {
  location_id: string;
  sucursal_name: string;
  total_clientes_erp: number;
  total_exhibiciones: number;
  clientes_visitados: number;
  aprobadas: number;
  cobertura_pct: number;
}

export interface OrphanVendedor {
  vendedor_erp: string;
  sucursal_erp: string;
  total_clientes_erp: number;
}

export interface SystemHealth {
  hardware: {
    cpu_percent: number;
    ram_gb_total: number;
    ram_gb_used: number;
    ram_percent: number;
    uptime_days: number;
    process_count: number;
  };
  database: {
    total_db_size: string;
    tables: { table_name: string; row_count: number; total_size: string }[];
  };
  sessions: {
    active_bot_sessions: number;
    total_users_today: number;
  };
  timestamp: string;
}

// ── Image helpers ───────────────────────────────────────────────────────────


/** Resuelve una URL de imagen desde Supabase Storage.
 *  La columna url_foto_drive en exhibiciones almacena URLs de Supabase Storage. */
export function resolveImageUrl(driveLink: string | null | undefined, exhibicionId?: number): string | null {
  if (!driveLink) return null;

  const SUPABASE_STORAGE_URL = "https://xjwadmzuuzctxbrvgopx.supabase.co/storage/v1/object/public/Exhibiciones-PDV";

  // Si ya es una URL de Supabase full, devolverla directamente
  if (driveLink.startsWith("http") && driveLink.includes("supabase.co")) {
    return driveLink;
  }

  // Path relativo → construir URL completa de Supabase Storage
  if (!driveLink.startsWith("http")) {
    const cleanPath = driveLink.startsWith("/") ? driveLink.slice(1) : driveLink;
    return `${SUPABASE_STORAGE_URL}/${cleanPath}`;
  }

  return driveLink;
}

/** @deprecated Usar resolveImageUrl */
export function getImageUrl(fileId: string): string {
  return fileId;
}

// ── Fetch helper con JWT ────────────────────────────────────────────────────

function getHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...getHeaders(), ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Auth ────────────────────────────────────────────────────────────────────

export async function loginApi(usuario: string, password: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ usuario, password }),
    headers: { "Content-Type": "application/json" },
  });
}

// ── Dashboard ───────────────────────────────────────────────────────────────
export async function fetchKPIs(distribuidorId: number, periodo: string = "mes", sucursalId?: string): Promise<KPIs> {
  const q = new URLSearchParams({ periodo });
  if (sucursalId) q.append("sucursal_id", sucursalId);
  return apiFetch<KPIs>(`/api/dashboard/kpis/${distribuidorId}?${q.toString()}`);
}

export async function fetchRanking(distribuidorId: number, periodo: string = "mes", sucursalId?: string): Promise<VendedorRanking[]> {
  const q = new URLSearchParams({ periodo });
  if (sucursalId) q.append("sucursal_id", sucursalId);
  return apiFetch<VendedorRanking[]>(`/api/dashboard/ranking/${distribuidorId}?${q.toString()}`);
}

export async function fetchUltimasEvaluadas(distribuidorId: number, n: number = 8, sucursalId?: string): Promise<UltimaEvaluada[]> {
  const q = new URLSearchParams({ n: n.toString() });
  if (sucursalId) q.append("sucursal_id", sucursalId);
  return apiFetch<UltimaEvaluada[]>(`/api/dashboard/ultimas-evaluadas/${distribuidorId}?${q.toString()}`);
}

export async function fetchPorSucursal(distribuidorId: number, periodo: string = "mes", sucursalId?: string): Promise<SucursalStats[]> {
  const q = new URLSearchParams({ periodo });
  if (sucursalId) q.append("sucursal_id", sucursalId);
  return apiFetch<SucursalStats[]>(`/api/dashboard/por-sucursal/${distribuidorId}?${q.toString()}`);
}

export async function fetchEvolucionTiempo(distribuidorId: number, periodo: string = "mes", sucursalId?: string): Promise<EvolucionTiempo[]> {
  const q = new URLSearchParams({ periodo });
  if (sucursalId) q.append("sucursal_id", sucursalId);
  return apiFetch<EvolucionTiempo[]>(`/api/dashboard/evolucion-tiempo/${distribuidorId}?${q.toString()}`);
}

export async function fetchRendimientoCiudad(distribuidorId: number, periodo: string = "mes", sucursalId?: string): Promise<RendimientoCiudad[]> {
  const q = new URLSearchParams({ periodo });
  if (sucursalId) q.append("sucursal_id", sucursalId);
  return apiFetch<RendimientoCiudad[]>(`/api/dashboard/por-ciudad/${distribuidorId}?${q.toString()}`);
}

export async function fetchPorEmpresa(periodo: string = "mes", sucursalId?: string): Promise<RendimientoCiudad[]> {
  const q = new URLSearchParams({ periodo });
  if (sucursalId) q.append("sucursal_id", sucursalId);
  return apiFetch<RendimientoCiudad[]>(`/api/dashboard/por-empresa?${q.toString()}`);
}

// ── Visor ───────────────────────────────────────────────────────────────────

export async function fetchStatsHoy(distribuidorId: number): Promise<StatsHoy> {
  return apiFetch<StatsHoy>(`/api/stats/${distribuidorId}`);
}

export async function fetchVendedores(distribuidorId: number): Promise<string[]> {
  return apiFetch<string[]>(`/api/vendedores/${distribuidorId}`);
}

export async function fetchPendientes(distribuidorId: number): Promise<GrupoPendiente[]> {
  return apiFetch<GrupoPendiente[]>(`/api/pendientes/${distribuidorId}`);
}

export async function evaluar(ids: number[], estado: string, supervisor: string, comentario: string = "") {
  return apiFetch("/api/evaluar", {
    method: "POST",
    body: JSON.stringify({ ids_exhibicion: ids, estado, supervisor, comentario }),
  });
}

export async function revertir(ids: number[]) {
  return apiFetch("/api/revertir", {
    method: "POST",
    body: JSON.stringify({ ids_exhibicion: ids }),
  });
}

export async function fetchERPContexto(distribuidorId: number, nroCliente: string): Promise<ERPContexto> {
  return apiFetch<ERPContexto>(`/api/erp/contexto-cliente/${distribuidorId}/${nroCliente}`);
}

export async function fetchROI(distribuidorId: number): Promise<ROIAnalitico> {
  return apiFetch<ROIAnalitico>(`/api/erp/roi/${distribuidorId}`);
}

// ── Admin: Usuarios ─────────────────────────────────────────────────────────

export async function fetchUsuarios(distId?: number): Promise<UsuarioPortal[]> {
  const q = distId ? `?dist_id=${distId}` : "";
  return apiFetch<UsuarioPortal[]>(`/api/admin/usuarios${q}`);
}

export async function crearUsuario(data: { dist_id: number; login: string; password: string; rol: string }) {
  return apiFetch("/api/admin/usuarios", { method: "POST", body: JSON.stringify(data) });
}

export async function editarUsuario(id: number, data: { login: string; rol: string; password?: string }) {
  return apiFetch(`/api/admin/usuarios/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function eliminarUsuario(id: number) {
  return apiFetch(`/api/admin/usuarios/${id}`, { method: "DELETE" });
}

// ── Reportes ────────────────────────────────────────────────────────────────

export async function fetchReporteVendedores(distId: number): Promise<string[]> {
  return apiFetch<string[]>(`/api/reportes/vendedores/${distId}`);
}

export async function fetchReporteTiposPdv(distId: number): Promise<string[]> {
  return apiFetch<string[]>(`/api/reportes/tipos-pdv/${distId}`);
}

export async function fetchReporteSucursales(distId: number): Promise<string[]> {
  return apiFetch<string[]>(`/api/reportes/sucursales/${distId}`);
}

export async function fetchReporteExhibiciones(distId: number, query: {
  fecha_desde: string;
  fecha_hasta: string;
  vendedores?: string[];
  estados?: string[];
  tipos_pdv?: string[];
  sucursales?: string[];
  nro_cliente?: string;
}) {
  return apiFetch(`/api/reportes/exhibiciones/${distId}`, {
    method: "POST",
    body: JSON.stringify(query),
  });
}

// ── Admin: Unified Dashboard (ERP 3.0) ──────────────────────────────────────

export interface UnifiedTelegramUser {
  id_integrante: number;
  nombre: string;
  rol_telegram: string;
  telegram_group_id: number;
}

export interface UnifiedVendor {
  id_vendedor_erp: string;
  integrantes: UnifiedTelegramUser[];
}

export interface UnifiedBranch {
  nombre_sucursal: string;
  vendedores: UnifiedVendor[];
}

export interface UnifiedDistributor {
  id_distribuidor: number;
  nombre_empresa: string;
  token: string;
  erp_mapping_name: string;
  sucursales: UnifiedBranch[];
  unmapped_integrantes: UnifiedTelegramUser[];
}

export async function fetchUnifiedDashboard(): Promise<UnifiedDistributor[]> {
  return apiFetch<UnifiedDistributor[]>("/api/admin/unified-dashboard");
}

// ── Admin: Distribuidoras (superadmin only) ──────────────────────────────────

export interface Distribuidora {
  id: number;
  nombre: string;
  estado: string;
}

export async function fetchDistribuidoras(soloActivas = false): Promise<Distribuidora[]> {
  return apiFetch<Distribuidora[]>(`/api/admin/distribuidoras?solo_activas=${soloActivas}`);
}

// Alias para Sidebar y otros lugares que usan el masculino
export const fetchDistribuidores = fetchDistribuidoras as any;

export async function crearDistribuidora(data: { nombre: string; token: string; carpeta_drive?: string; ruta_cred?: string }) {
  return apiFetch("/api/admin/distribuidoras", { method: "POST", body: JSON.stringify(data) });
}

export async function editarDistribuidora(id: number, data: { nombre: string; token: string; carpeta_drive?: string; ruta_cred?: string }) {
  return apiFetch(`/api/admin/distribuidoras/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function toggleDistribuidora(id: number, estado: "activo" | "inactivo") {
  return apiFetch(`/api/admin/distribuidoras/${id}/estado`, { method: "PATCH", body: JSON.stringify({ estado }) });
}

// ── Admin: Integrantes Telegram ──────────────────────────────────────────────

export interface Integrante {
  id_integrante: number;
  nombre_integrante: string;
  telegram_user_id: number;
  rol_telegram: string;
  telegram_group_id: number;
  nombre_empresa: string;
  nombre_grupo: string;
  sucursal_label: string;
  id_vendedor_erp: string | null;
  location_id: string | null;
}

export async function fetchIntegrantes(distId?: number): Promise<Integrante[]> {
  const path = distId ? `/api/admin/integrantes?distribuidor_id=${distId}` : "/api/admin/integrantes";
  return apiFetch<Integrante[]>(path);
}

export async function setRolIntegrante(id: number, rol: string, distribuidorId?: number) {
  return apiFetch(`/api/admin/integrantes/${id}/rol`, {
    method: "PUT",
    body: JSON.stringify({ rol, distribuidor_id: distribuidorId ?? null }),
  });
}

export async function editarIntegranteAdmin(id: number, data: { nombre_integrante: string, rol_telegram?: string, location_id?: string | null, id_vendedor_erp?: string | null }) {
  return apiFetch(`/api/admin/integrantes/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// ── Admin: Sucursales (Locations) ────────────────────────────────────────────

export interface Location {
  location_id: string;
  dist_id: number;
  ciudad?: string;
  provincia?: string;
  label: string;
  lat?: number;
  lon?: number;
}

export async function fetchLocations(distId: number): Promise<Location[]> {
  return apiFetch<Location[]>(`/api/admin/locations/${distId}`);
}

export async function crearLocation(distId: number, data: { ciudad: string; provincia: string; label: string; lat: number; lon: number }) {
  return apiFetch(`/api/admin/locations/${distId}`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function editarLocation(locationId: string, data: { ciudad: string; provincia: string; label: string; lat: number; lon: number }) {
  return apiFetch(`/api/admin/locations/${locationId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// ── Bonos ────────────────────────────────────────────────────────────────────

export interface PuestoRanking {
  puesto: number;
  premio_si_llego: number;
  premio_si_no_llego: number;
}

export interface BonoConfig {
  umbral: number;
  monto_bono_fijo: number;
  monto_por_punto: number;
  puestos: PuestoRanking[];
  edicion_bloqueada: 0 | 1;
}

export interface LiquidacionVendedor {
  puesto: number;
  vendedor: string;
  puntos: number;
  aprobadas: number;
  destacadas: number;
  llego_umbral: boolean;
  bono: number;
}

export interface DetalleExhibicion {
  id_exhibicion: number;
  fecha: string;
  estado: string;
  nro_cliente: string;
  tipo_pdv: string;
}

export async function fetchBonoConfig(distId: number, anio: number, mes: number): Promise<BonoConfig> {
  return apiFetch<BonoConfig>(`/api/bonos/config/${distId}?anio=${anio}&mes=${mes}`);
}

export async function guardarBonoConfig(distId: number, data: {
  anio: number; mes: number; umbral: number;
  monto_bono_fijo: number; monto_por_punto: number; puestos: PuestoRanking[];
}) {
  return apiFetch(`/api/bonos/config/${distId}/guardar`, { method: "POST", body: JSON.stringify(data) });
}

export async function bloquearBonoConfig(distId: number, anio: number, mes: number, bloquear: 0 | 1) {
  return apiFetch(`/api/bonos/config/${distId}/bloquear?anio=${anio}&mes=${mes}&bloquear=${bloquear}`, { method: "POST" });
}

export async function fetchLiquidacion(distId: number, anio: number, mes: number): Promise<{ umbral: number; vendedores: LiquidacionVendedor[] }> {
  return apiFetch(`/api/bonos/liquidacion/${distId}?anio=${anio}&mes=${mes}`);
}

export async function fetchBonoDetalle(distId: number, integranteId: number, anio: number, mes: number): Promise<DetalleExhibicion[]> {
  return apiFetch(`/api/bonos/detalle/${distId}?id_integrante=${integranteId}&anio=${anio}&mes=${mes}`);
}

// ── ERP ─────────────────────────────────────────────────────────────────────

export async function uploadERPFile(tipo: "ventas" | "clientes", file: File): Promise<ERPUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;

  const res = await fetch(`${API_URL}/api/admin/erp/upload-global?tipo=${tipo}`, {
    method: "POST",
    body: formData,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchERPDeuda(distId: number): Promise<ERPDeuda[]> {
  return apiFetch<ERPDeuda[]>(`/api/admin/erp/deuda/${distId}`);
}

export async function fetchERPConfig(distId: number) {
  return apiFetch<any>(`/api/admin/erp/config/${distId}`);
}

export async function saveERPConfig(distId: number, config: any) {
  return apiFetch<any>(`/api/admin/erp/config/${distId}`, {
    method: "POST",
    body: JSON.stringify(config),
  });
}

export async function fetchRecaudacionSummary(distId: number, desde?: string, hasta?: string, vendedor?: string) {
  const q = new URLSearchParams();
  if (desde) q.append("desde", desde);
  if (hasta) q.append("hasta", hasta);
  if (vendedor) q.append("vendedor", vendedor);
  return apiFetch<any>(`/api/reportes/recaudacion/${distId}?${q.toString()}`);
}

export async function fetchRecaudacionDetallada(distId: number, desde?: string, hasta?: string, vendedor?: string) {
  const q = new URLSearchParams();
  if (desde) q.append("desde", desde);
  if (hasta) q.append("hasta", hasta);
  if (vendedor) q.append("vendedor", vendedor);
  return apiFetch<any[]>(`/api/reportes/recaudacion-detallada/${distId}?${q.toString()}`);
}

export async function fetchERPVendedores(distId: number): Promise<string[]> {
  return apiFetch<string[]>(`/api/admin/erp/vendedores/${distId}`);
}

export async function fetchClientesStats(distId: number) {
  return apiFetch<any>(`/api/reportes/clientes/stats/${distId}`);
}

export async function fetchClientesTemporal(distId: number) {
  return apiFetch<any[]>(`/api/reportes/clientes/temporal/${distId}`);
}

export async function fetchClientesDesglose(distId: number, tipo: "vendedor" | "localidad" | "provincia") {
  return apiFetch<any[]>(`/api/reportes/clientes/desglose/${distId}?tipo=${tipo}`);
}

export async function fetchClientesMuertos(distId: number, dias: number = 30) {
  return apiFetch<any[]>(`/api/reportes/clientes-muertos/${distId}?dias=${dias}`);
}

export async function fetchClientesListado(distId: number, search: string = "", limit: number = 200, sucursalId: string = "", vendedorId: string = ""): Promise<ClienteMaestro[]> {
  const q = new URLSearchParams();
  if (search) q.append("search", search);
  if (sucursalId) q.append("sucursal_id", sucursalId);
  if (vendedorId) q.append("vendedor_id", vendedorId);
  q.append("limit", limit.toString());
  return apiFetch<ClienteMaestro[]>(`/api/reportes/clientes/listado/${distId}?${q.toString()}`);
}

// --- Jerarquía en Cascada (Nuevos Endpoints Fase 5) ---

export async function fetchHierarchySucursales(distId: number) {
  return apiFetch<any[]>(`/api/admin/hierarchy/sucursales/${distId}`);
}

export async function fetchHierarchyVendedores(sucursalId: number) {
  return apiFetch<any[]>(`/api/admin/hierarchy/vendedores/${sucursalId}`);
}

export async function fetchHierarchyRutas(vendedorId: number) {
  return apiFetch<any[]>(`/api/admin/hierarchy/rutas/${vendedorId}`);
}

export async function fetchHierarchyClientesPDV(rutaId: number) {
  return apiFetch<any[]>(`/api/admin/hierarchy/clientes-pdv/${rutaId}`);
}

export async function fetchERPMappings(): Promise<ERPMapping[]> {
  return apiFetch<ERPMapping[]>("/api/admin/erp/mappings");
}

export async function saveERPMapping(data: { nombre_erp: string; id_distribuidor: number }) {
  return apiFetch("/api/admin/erp/mappings", {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export async function deleteERPMapping(nombre_erp: string) {
  return apiFetch(`/api/admin/erp/mappings/${encodeURIComponent(nombre_erp)}`, {
    method: "DELETE"
  });
}

// ── SuperAdmin: Monitoreo y Mapa ──────────────────────────────────────────

export async function fetchGlobalMonitoring(): Promise<GlobalStressMonitor[]> {
  return apiFetch<GlobalStressMonitor[]>("/api/admin/global-monitoring");
}

export async function fetchLiveMapEvents(minutos?: number, fecha?: string): Promise<LiveMapEvent[]> {
  const params = new URLSearchParams();
  if (minutos) params.append("minutos", minutos.toString());
  if (fecha) params.append("fecha", fecha);
  return apiFetch<LiveMapEvent[]>(`/api/admin/live-map-events?${params.toString()}`);
}

export async function fetchSucursalesCruce(distId: number, periodo: string = "mes"): Promise<BranchCruce[]> {
  return apiFetch<BranchCruce[]>(`/api/reportes/sucursales/cruce/${distId}?periodo=${periodo}`);
}

export async function fetchSystemHealth(): Promise<SystemHealth> {
  return apiFetch<SystemHealth>("/api/admin/system-health");
}

export async function createLocation(data: { dist_id: number; label: string; ciudad?: string; provincia?: string; lat?: number; lon?: number }) {
  const { dist_id, ...payload } = data;
  return apiFetch<Location>(`/api/admin/locations/${dist_id}`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateLocation(locId: string, data: { dist_id: number; label: string; ciudad?: string; provincia?: string }) {
  return apiFetch(`/api/admin/locations/${locId}`, {
    method: "PUT",
    body: JSON.stringify(data)
  });
}

export async function mapIntegranteSucursal(data: { dist_id: number; id_integrante: number; location_id: string | null }) {
  return apiFetch("/api/admin/hierarchy/map-sucursal", {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export async function mapSellerERP(data: { dist_id: number; id_integrante: number; id_vendedor_erp: string }) {
  return apiFetch("/api/admin/hierarchy/map-seller", {
    method: "POST",
    body: JSON.stringify(data)
  });
}

// removido duplicado

export async function syncHierarchyFromERP(distId: number): Promise<{ updated_count: number }> {
  return apiFetch(`/api/admin/hierarchy/sync-from-erp/${distId}`, {
    method: "POST"
  });
}

// ── FASE 2 — Mapeo Vendedor ERP ↔ Integrante Telegram ───────────────────────

export interface IntegranteMapeo {
  id_integrante: number;
  nombre_integrante: string;
  rol_telegram: string;
  telegram_user_id: number | null;
  id_vendedor: number | null;  // FK nueva — null = sin mapear
}

export interface VendedorMapeo {
  id_vendedor: number;
  nombre_erp: string;
  id_sucursal: number;
  sucursales?: { nombre_erp: string };
}

export interface MapeoData {
  integrantes: IntegranteMapeo[];
  vendedores:  VendedorMapeo[];
  stats: { total: number; mapeados: number; sin_mapear: number };
}

export async function fetchMapeoData(distId: number): Promise<MapeoData> {
  return apiFetch<MapeoData>(`/api/admin/mapeo/integrantes/${distId}`);
}

export async function setMapeoVendedor(idIntegrante: number, idVendedor: number | null) {
  return apiFetch(`/api/admin/mapeo/integrante/${idIntegrante}/vendedor`, {
    method: "PUT",
    body: JSON.stringify({ id_vendedor: idVendedor }),
  });
}

// ── Step 3-5: SuperAdmin & Identity Wall ────────────────────────────────────

export async function fetchUnknownCompanies(): Promise<UnknownCompany[]> {
  return apiFetch<UnknownCompany[]>("/api/superadmin/empresas-desconocidas");
}

export async function mapUnknownCompany(data: { nombre_erp: string; id_distribuidor: number }) {
  return apiFetch("/api/superadmin/mapear-empresa", {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export async function fetchOrphanVendedores(distId: number): Promise<OrphanVendedor[]> {
  return apiFetch<OrphanVendedor[]>(`/api/admin/hierarchy/vendedores-huerfanos/${distId}`);
}

// ── Interactive Hierarchy Dashboard ─────────────────────────────────────────

export interface HierarchyConfig {
  locations: any[];
  erp_hierarchy: {
    sucursal_erp: string;
    vendedores: string[];
  }[];
  telegram_groups: { id: number; nombre: string }[];
  integrantes: any[];
}

export async function fetchHierarchyConfig(distId: number): Promise<HierarchyConfig> {
  return apiFetch<HierarchyConfig>(`/api/admin/hierarchy-config/${distId}`);
}

export async function saveBulkHierarchy(distId: number, mappings: { id_integrante: number; location_id: string | null; id_vendedor_erp: string | null }[]) {
  return apiFetch(`/api/admin/hierarchy-config/save/${distId}`, {
    method: "POST",
    body: JSON.stringify({ mappings }),
  });
}


// ── Supervisión ──────────────────────────────────────────────────────────────

export interface VendedorSupervision {
  id_vendedor: number;
  nombre_vendedor: string;
  sucursal_nombre: string;
  total_rutas: number;
  total_pdv: number;
  pdv_activos: number;
  pdv_inactivos: number;
}

export interface RutaSupervision {
  id_ruta: number;
  nombre_ruta: string;
  dia_semana: string;
  total_pdv: number;
}

export interface ClienteSupervision {
  id_cliente: number;
  id_cliente_erp: string;
  nombre_fantasia: string;
  nombre_razon_social: string;
  domicilio: string;
  localidad: string;
  provincia: string;
  canal: string;
  latitud: number | null;
  longitud: number | null;
  fecha_ultima_compra: string | null;
  fecha_alta: string | null;
  fecha_ultima_exhibicion: string | null;
  url_ultima_exhibicion: string | null;
  id_ruta: number | null;
  tiene_exhibicion_reciente: boolean; // Server-calculated flag (last 30 days)
  total_exhibiciones?: number;
}

export async function fetchVendedoresSupervision(distId: number): Promise<VendedorSupervision[]> {
  return apiFetch<VendedorSupervision[]>(`/api/supervision/vendedores/${distId}`);
}

export async function fetchRutasSupervision(idVendedor: number): Promise<RutaSupervision[]> {
  return apiFetch<RutaSupervision[]>(`/api/supervision/rutas/${idVendedor}`);
}

export async function fetchClientesSupervision(idRuta: number): Promise<ClienteSupervision[]> {
  return apiFetch<ClienteSupervision[]>(`/api/supervision/clientes/${idRuta}`);
}

export interface ClienteContacto {
  id_cliente: number;
  id_cliente_erp: string | null;
  nombre_fantasia: string | null;
  nombre_razon_social: string | null;
  domicilio: string | null;
  localidad: string | null;
  provincia: string | null;
  canal: string | null;
  latitud: number | null;
  longitud: number | null;
}

export async function fetchClienteInfo(distId: number, nombre: string, idClienteErp?: string | null): Promise<ClienteContacto[]> {
  const params = new URLSearchParams({ nombre });
  if (idClienteErp) params.set("id_cliente_erp", idClienteErp);
  return apiFetch<ClienteContacto[]>(`/api/supervision/cliente-info/${distId}?${params}`);
}


// ── Supervisión Ventas ────────────────────────────────────────────────────────

export interface TransaccionVenta {
  fecha: string;
  cliente: string | null;
  comprobante: string | null;
  numero: string | null;
  tipo_operacion: string | null;
  es_devolucion: boolean;
  monto_total: number;
  monto_recaudado: number;
}

export interface VendedorVentas {
  vendedor: string;
  total_facturas: number;
  monto_total: number;
  monto_recaudado: number;
  transacciones: TransaccionVenta[];
}

export interface VentasSupervision {
  dias: number;
  fecha_desde: string;
  total_facturado: number;
  total_recaudado: number;
  total_facturas: number;
  vendedores: VendedorVentas[];
}

export async function fetchVentasSupervision(distId: number, dias = 30): Promise<VentasSupervision> {
  return apiFetch<VentasSupervision>(`/api/supervision/ventas/${distId}?dias=${dias}`);
}


// ── Supervisión Cuentas Corrientes ────────────────────────────────────────────

export interface ClienteCuenta {
  cliente: string | null;
  sucursal: string | null;
  deuda_total: number;
  antiguedad: number | null;
  rango_antiguedad: string | null;
  cantidad_comprobantes: number | null;
  fecha_ultima_compra: string | null;
}

export interface VendedorCuentas {
  vendedor: string;
  deuda_total: number;
  cantidad_clientes: number;
  clientes: ClienteCuenta[];
}

export interface CuentasSupervision {
  fecha: string | null;
  metadatos: {
    total_deuda?: number;
    clientes_deudores?: number;
    promedio_dias_retraso?: number;
  };
  vendedores: VendedorCuentas[];
}

export async function fetchCuentasSupervision(distId: number, sucursal?: string): Promise<CuentasSupervision> {
  const params = sucursal ? `?sucursal=${encodeURIComponent(sucursal)}` : "";
  return apiFetch<CuentasSupervision>(`/api/supervision/cuentas/${distId}${params}`);
}


// ── Scanner GPS — PDVs Cercanos ────────────────────────────────────────────────

export interface PDVCercano {
  id_cliente: number;
  id_cliente_erp: string | null;
  nombre_fantasia: string | null;
  nombre_razon_social: string | null;
  domicilio: string | null;
  localidad: string | null;
  provincia: string | null;
  canal: string | null;
  latitud: number;
  longitud: number;
  fecha_alta: string | null;
  fecha_ultima_compra: string | null;
  fecha_ultima_exhibicion: string | null;
  vendedor_nombre: string | null;
  ruta_nombre: string | null;
  distancia_metros: number;
}

export interface PDVsCercanosResponse {
  fallback: boolean;
  pdvs: PDVCercano[];
}

export async function fetchPDVsCercanos(
  distId: number,
  lat: number,
  lng: number,
  radio = 5000
): Promise<PDVsCercanosResponse> {
  return apiFetch<PDVsCercanosResponse>(
    `/api/supervision/pdvs-cercanos?lat=${lat}&lng=${lng}&radio=${radio}&dist_id=${distId}`
  );
}
