import { API_URL, TOKEN_KEY } from "./constants";

// ── Tipos ──────────────────────────────────────────────────────────────────
export interface ClienteMaestro {
  id_cliente_erp_local: string;
  /** Legacy field alias — some endpoints return this as the numeric PK */
  id_cliente?: number;
  /** ERP client number as displayed in UI (e.g. "00123") */
  numero_cliente_local?: string;
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
  lng: number;
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
  permisos?: Record<string, boolean>;
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
  es_objetivo?: boolean;
  id_objetivo?: string | null;
}

export interface GrupoPendiente {
  vendedor: string;
  sucursal?: string;
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
  lng: number;
  /** Alias for lng — populated by the admin/mapa select transform */
  lon?: number;
  timestamp_evento: string;
  nro_cliente: string;
  cliente_nombre?: string;
  drive_link?: string;
  domicilio?: string;
  localidad?: string;
  telefono?: string;
  fecha_alta?: string;
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

export function getWSUrl(distId: number): string {
  // En producción (Vercel) necesitamos wss:// si el origen es https://
  const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss' : 'ws';

  if (API_URL.startsWith('http')) {
    const baseUrl = API_URL.replace(/^http/, 'ws');
    return `${baseUrl}/api/ws/exhibiciones/${distId}`;
  }

  // Si API_URL es relativa (ej: /api), construimos la absoluta basada en el host actual
  if (typeof window !== 'undefined') {
    const host = window.location.host;
    return `${protocol}://${host}/api/ws/exhibiciones/${distId}`;
  }

  return `ws://localhost:8000/api/ws/exhibiciones/${distId}`;
}

/** WebSocket notificaciones superadmin (`?token=JWT`). */
export function getSuperadminWSUrl(): string | null {
  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  if (!token) return null;

  const protocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws";
  const q = `token=${encodeURIComponent(token)}`;

  if (API_URL.startsWith("http")) {
    const baseUrl = API_URL.replace(/^http/, "ws");
    return `${baseUrl}/api/ws/superadmin?${q}`;
  }

  if (typeof window !== "undefined") {
    const host = window.location.host;
    return `${protocol}://${host}/api/ws/superadmin?${q}`;
  }

  return `ws://localhost:8000/api/ws/superadmin?${q}`;
}

class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(message: string, status: number, detail: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function resolveVendorERPName(
  row: Record<string, unknown>,
  preferredKeys: string[],
): string | null {
  for (const key of preferredKeys) {
    const candidate = toNonEmptyString(row[key]);
    if (candidate) return candidate;
  }
  return null;
}

/** JWT inválido/expirado: limpiar cliente y volver al login (no aplica a fallo de credenciales en /auth/login). */
function handleSessionExpired401(requestPath: string, status: number): void {
  if (typeof window === "undefined" || status !== 401) return;
  if (requestPath.startsWith("/auth/login")) return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem("shelfy_active_dist");
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`;
  window.location.assign("/login");
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { ...getHeaders(), ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    handleSessionExpired401(path, res.status);
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    if (typeof window !== "undefined" && path.includes("/api/galeria/")) {
      console.group("[Galeria Debug] HTTP error");
      console.error("URL:", url);
      console.error("Method:", options?.method ?? "GET");
      console.error("Status:", res.status);
      console.error("Path:", path);
      console.error("Request options:", options);
      console.error("Response body:", err);
      console.groupEnd();
    }
    const detailMsg = typeof err.detail === "string" ? err.detail : (err.detail?.mensaje ?? `HTTP ${res.status}`);
    throw new ApiError(detailMsg, res.status, err.detail);
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

export async function fetchRanking(distribuidorId: number, periodo: string = "mes", sucursalId?: string, top?: number): Promise<VendedorRanking[]> {
  const q = new URLSearchParams({ periodo });
  if (sucursalId) q.append("sucursal_id", sucursalId);
  if (top) q.append("top", top.toString());
  const rows = await apiFetch<Record<string, unknown>[]>(`/api/dashboard/ranking/${distribuidorId}?${q.toString()}`);
  return rows.map((row) => ({
    ...(row as unknown as VendedorRanking),
    vendedor:
      resolveVendorERPName(row, ["nombre_erp", "vendedor_erp", "nombre_vendedor", "vendedor"]) ??
      "Sin vendedor",
  }));
}

export interface RankingHistoricoEntry {
  fecha: string;
  vendedor: string;
  puntos_dia: number;
  puntos_acumulados: number;
}

export async function fetchRankingHistorico(distId: number, sucursalId?: number): Promise<RankingHistoricoEntry[]> {
  const params = new URLSearchParams();
  if (sucursalId) params.set("sucursal_id", String(sucursalId));
  const qs = params.toString();
  const rows = await apiFetch<Record<string, unknown>[]>(`/api/dashboard/ranking-historico/${distId}${qs ? "?" + qs : ""}`);
  return rows.map((row) => ({
    ...(row as unknown as RankingHistoricoEntry),
    vendedor:
      resolveVendorERPName(row, ["nombre_erp", "vendedor_erp", "nombre_vendedor", "vendedor"]) ??
      "Sin vendedor",
  }));
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
  return apiFetch<{ affected?: number }>("/api/evaluar", {
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
  return apiFetch<ERPContexto>(`/api/erp/contexto-cliente/${distribuidorId}/${encodeURIComponent(nroCliente)}`);
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

// ── Admin: Permissions Matrix ───────────────────────────────────────────────

export interface PermissionEntry {
  rol: string;
  permiso_key: string;
  valor: boolean;
}

export async function fetchAllPermissions(): Promise<PermissionEntry[]> {
  return apiFetch<PermissionEntry[]>("/api/admin/permissions");
}

export async function updatePermissionsBatch(permissions: PermissionEntry[]) {
  return apiFetch("/api/admin/permissions", {
    method: "POST",
    body: JSON.stringify({ permissions }),
  });
}

// ── Reportes ERP (ventas/auditoría) ─────────────────────────────────────────

export async function fetchAuditoriaSigo(distId: number, desde: string, hasta: string): Promise<any[]> {
  const q = new URLSearchParams({ desde, hasta });
  const raw = await apiFetch<any[]>(`/api/reports/auditoria-sigo/${distId}?${q.toString()}`);
  return (raw ?? []).filter((p: any) => p.lat && p.lon && Math.abs(p.lat) > 0);
}

export async function fetchVentasResumen(distId: number, desde: string, hasta: string): Promise<any[]> {
  const q = new URLSearchParams({ desde, hasta });
  return apiFetch<any[]>(`/api/reports/ventas-resumen/${distId}?${q.toString()}`);
}

export async function fetchVentasBultos(distId: number, desde: string, hasta: string, proveedor?: string): Promise<any[]> {
  const q = new URLSearchParams({ desde, hasta });
  if (proveedor) q.set("proveedor", proveedor);
  return apiFetch<any[]>(`/api/reports/ventas-bultos/${distId}?${q.toString()}`);
}

export async function fetchCuentasCorrientesLegacy(distId: number): Promise<{
  fecha: string;
  data: { detalle_cuentas: any[]; metadatos: any } | null;
  file_b64: string | null;
} | null> {
  return apiFetch(`/api/cuentas-corrientes/${distId}`);
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

// ── Fuerza de Ventas ─────────────────────────────────────────────────────────

export interface FuerzaVentasVendedor {
  id_vendedor: number;
  nombre_erp: string;
  sucursal_nombre: string | null;
  foto_url: string | null;
  ciudad: string | null;
  localidad: string | null;
  fecha_ingreso: string | null;
  activo: boolean;
  telegram_group_id: number | null;
  telegram_user_id: number | null;
  tiene_binding: boolean;
  binding_source?: "fuerza_ventas" | "legacy_admin" | "none";
}

export interface FuerzaVentasVendedorDetalle extends FuerzaVentasVendedor {
  id_sucursal: number | null;
  id_distribuidor: number;
  binding_updated_by: string | null;
  binding_updated_at: string | null;
}

export interface FuerzaVentasPerfilUpdate {
  foto_url?: string;
  ciudad?: string;
  localidad?: string;
  fecha_ingreso?: string;
  activo?: boolean;
}

export interface FuerzaVentasTelegramBinding {
  telegram_group_id?: number;
  telegram_user_id?: number;
}

export interface AutocompletarResponse {
  id_vendedor_v2: number;
  sugerencia_telegram_group_id: number | null;
  sugerencia_telegram_user_id: number | null;
  nombre_grupo_sugerido: string | null;
  nombre_usuario_sugerido: string | null;
  score: number;
  confianza: "alta" | "media" | "baja";
  campos_sugeridos: Record<string, unknown>;
}

export interface TelegramGrupo {
  id: number;
  nombre_grupo: string;
  telegram_group_id: number | null;
}

export interface TelegramIntegrante {
  id: number;
  nombre_integrante: string;
  telegram_user_id: number | null;
  rol_telegram: string | null;
  id_grupo: number | null;
  total_exhibiciones?: number;
  ultima_exhibicion?: string | null;
}

export async function fetchFuerzaVentasVendedores(distId: number): Promise<FuerzaVentasVendedor[]> {
  return apiFetch<FuerzaVentasVendedor[]>(`/api/fuerza-ventas/vendedores/${distId}`);
}

export async function fetchFuerzaVentasVendedor(idVendedor: number): Promise<FuerzaVentasVendedorDetalle> {
  return apiFetch<FuerzaVentasVendedorDetalle>(`/api/fuerza-ventas/vendedor/${idVendedor}`);
}

export async function updateFuerzaVentasVendedor(
  idVendedor: number,
  perfil: FuerzaVentasPerfilUpdate,
  binding?: FuerzaVentasTelegramBinding,
): Promise<{ ok: boolean; id_vendedor: number }> {
  return apiFetch(`/api/fuerza-ventas/vendedor/${idVendedor}`, {
    method: "PUT",
    body: JSON.stringify({ perfil_req: perfil, binding_req: binding }),
  });
}

export async function uploadFotoFuerzaVentas(
  idVendedor: number,
  file: File,
): Promise<{ ok: boolean; foto_url: string }> {
  const token = localStorage.getItem(TOKEN_KEY);
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_URL}/api/fuerza-ventas/vendedor/${idVendedor}/foto`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    handleSessionExpired401(`/api/fuerza-ventas/vendedor/${idVendedor}/foto`, res.status);
    const err = await res.json().catch(() => ({ detail: "Error subiendo foto" }));
    throw new Error(err.detail ?? "Error subiendo foto");
  }
  return res.json();
}

export async function fetchTelegramGruposFuerzaVentas(distId: number): Promise<TelegramGrupo[]> {
  return apiFetch<TelegramGrupo[]>(`/api/fuerza-ventas/telegram/grupos/${distId}`);
}

export async function fetchTelegramUsuariosGrupoFuerzaVentas(
  distId: number,
  groupId?: number,
): Promise<TelegramIntegrante[]> {
  const qs = groupId != null ? `?group_id=${groupId}` : "";
  return apiFetch<TelegramIntegrante[]>(`/api/fuerza-ventas/telegram/usuarios/${distId}${qs}`);
}

export async function autocompletarFuerzaVentas(idVendedor: number): Promise<AutocompletarResponse> {
  return apiFetch<AutocompletarResponse>(`/api/fuerza-ventas/vendedor/${idVendedor}/autocompletar`, {
    method: "POST",
  });
}

export async function adoptarLegacyBindingFuerzaVentas(
  idVendedor: number,
): Promise<{ ok: boolean; id_vendedor: number; telegram_group_id: number | null; telegram_user_id: number | null; binding_source: string }> {
  return apiFetch(`/api/fuerza-ventas/vendedor/${idVendedor}/adoptar-legacy`, {
    method: "POST",
  });
}

// ── Galería de Exhibiciones ───────────────────────────────────────────────────

export interface GaleriaVendedorStats {
  id_vendedor: number;
  nombre_erp: string;
  sucursal_nombre: string | null;
  foto_url: string | null;
  total_exhibiciones: number;
  aprobadas: number;
  rechazadas: number;
  destacadas: number;
  pendientes: number;
}

export interface GaleriaClienteCard {
  id_cliente: number;
  id_cliente_erp: string | null;
  nombre_cliente: string;
  nombre_fantasia: string | null;
  ultima_exhibicion_url: string | null;
  ultima_exhibicion_fecha: string | null;
  ultimo_estado: string | null;
  fecha_ultima_compra: string | null;
  total_exhibiciones: number;
  es_sin_referencia?: boolean;
  motivo_no_referencia?: string | null;
  exhibiciones_directas?: GaleriaTimelineItem[];
}

export interface GaleriaTimelineItem {
  id_exhibicion: number;
  url_foto: string;
  estado: string;
  timestamp_subida: string;
  fecha_evaluacion: string | null;
  supervisor: string | null;
  comentario: string | null;
  tipo_pdv: string | null;
}

export interface GaleriaTimelineResponse {
  items: GaleriaTimelineItem[];
  offset: number;
  limit: number;
  has_more: boolean;
}

export async function fetchGaleriaVendedores(
  distId: number,
  params?: { sucursal?: string; desde?: string; hasta?: string },
): Promise<GaleriaVendedorStats[]> {
  const qs = new URLSearchParams();
  if (params?.sucursal) qs.set("sucursal", params.sucursal);
  if (params?.desde) qs.set("desde", params.desde);
  if (params?.hasta) qs.set("hasta", params.hasta);
  const q = qs.toString();
  return apiFetch<GaleriaVendedorStats[]>(`/api/galeria/vendedores/${distId}${q ? `?${q}` : ""}`);
}

export async function fetchGaleriaClientesPorVendedor(
  idVendedor: number,
  params?: { desde?: string; hasta?: string },
): Promise<GaleriaClienteCard[]> {
  const qs = new URLSearchParams();
  if (params?.desde) qs.set("desde", params.desde);
  if (params?.hasta) qs.set("hasta", params.hasta);
  const q = qs.toString();
  const path = `/api/galeria/vendedor/${idVendedor}/clientes${q ? `?${q}` : ""}`;
  try {
    return await apiFetch<GaleriaClienteCard[]>(path);
  } catch (e) {
    if (typeof window !== "undefined") {
      console.group("[Galeria Debug] fetchGaleriaClientesPorVendedor exception");
      console.error("idVendedor:", idVendedor);
      console.error("params:", params);
      console.error("path:", path);
      console.error("error:", e);
      console.groupEnd();
    }
    throw e;
  }
}

export async function fetchGaleriaTimelineCliente(
  idClientePdv: number,
  distId: number,
  params?: { offset?: number; limit?: number; idVendedor?: number | null },
): Promise<GaleriaTimelineResponse> {
  const qs = new URLSearchParams();
  qs.set("dist_id", String(distId));
  if (typeof params?.offset === "number") qs.set("offset", String(params.offset));
  if (typeof params?.limit === "number") qs.set("limit", String(params.limit));
  if (typeof params?.idVendedor === "number") qs.set("id_vendedor", String(params.idVendedor));
  return apiFetch<GaleriaTimelineResponse>(`/api/galeria/cliente/${idClientePdv}/timeline?${qs.toString()}`);
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
  lng?: number;
}

export async function fetchLocations(distId: number): Promise<Location[]> {
  const data = await apiFetch<any[]>(`/api/fuerza-ventas/locations/${distId}`);
  return data.map(loc => ({
    ...loc,
    lng: loc.lng ?? loc.lon,
  }));
}

export async function crearLocation(distId: number, data: { ciudad: string; provincia: string; label: string; lat: number; lng: number }) {
  return apiFetch(`/api/admin/locations/${distId}`, {
    method: "POST",
    body: JSON.stringify({
      ...data,
      lon: data.lng,
    }),
  });
}

export async function editarLocation(locationId: string, data: { ciudad: string; provincia: string; label: string; lat: number; lng: number }) {
  return apiFetch(`/api/admin/locations/${locationId}`, {
    method: "PUT",
    body: JSON.stringify({
      ...data,
      lon: data.lng,
    }),
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
    handleSessionExpired401(`/api/admin/erp/upload-global?tipo=${tipo}`, res.status);
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
  const data = await apiFetch<any[]>(`/api/reportes/clientes/listado/${distId}?${q.toString()}`);
  return data.map(c => ({
    ...c,
    lng: c.lng ?? c.lon,
  }));
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
  const data = await apiFetch<any[]>(`/api/admin/live-map-events?${params.toString()}`);
  return data.map(ev => ({
    ...ev,
    lng: ev.lng ?? ev.lon, // Asegurar que use lng aunque venga como lon
  }));
}

export async function fetchRunCCMotor(): Promise<{ ok: boolean; message: string }> {
  return apiFetch<{ ok: boolean; message: string }>("/api/admin/run-cc-motor", { method: "POST" });
}

export async function fetchCCLogs(lines: number = 100): Promise<{ logs: string }> {
  return apiFetch<{ logs: string }>(`/api/admin/cc-logs?lines=${lines}`);
}

export interface MotorRun {
  id: number;
  motor: string;
  estado: string;
  iniciado_en: string | null;
  finalizado_en: string | null;
  registros?: Record<string, unknown> | number | null;
  error_msg?: string | null;
  dist_id: number | null;
}

export interface EmpresaMotorSnapshot {
  dist_id: number;
  nombre_empresa: string;
  id_erp: string | null;
  estado: string | null;
  mapping_erp: string[];
  last_runs: Record<string, MotorRun>;
}

export interface EmpresaMotorSnapshotResponse {
  distribuidores: EmpresaMotorSnapshot[];
  global: Record<string, MotorRun>;
}

export async function fetchMotorRuns(motor?: string, limit = 20): Promise<MotorRun[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (motor) params.set("motor", motor);
  try {
    return await apiFetch<MotorRun[]>(`/api/admin/motor-runs?${params}`);
  } catch {
    return [];
  }
}

export async function fetchEmpresaMotorSnapshot(): Promise<EmpresaMotorSnapshotResponse> {
  return apiFetch<EmpresaMotorSnapshotResponse>("/api/admin/ops/empresa-motor-snapshot");
}

export async function fetchMotorRunsDetail(distId: number, motor?: string, limit = 50): Promise<MotorRun[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (motor) params.set("motor", motor);
  try {
    return await apiFetch<MotorRun[]>(`/api/admin/ops/motor-runs-detail/${distId}?${params}`);
  } catch {
    return [];
  }
}

export async function fetchSucursalesCruce(distId: number, periodo: string = "mes"): Promise<BranchCruce[]> {
  return apiFetch<BranchCruce[]>(`/api/reportes/sucursales/cruce/${distId}?periodo=${periodo}`);
}

export async function fetchSystemHealth(): Promise<SystemHealth> {
  return apiFetch<SystemHealth>("/api/admin/system-health");
}

export async function createLocation(data: { dist_id: number; label: string; ciudad?: string; provincia?: string; lat?: number; lng?: number }) {
  const { dist_id, lng, ...payload } = data;
  return apiFetch<Location>(`/api/admin/locations/${dist_id}`, {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      lon: lng, // Mapear de vuelta para el backend
    })
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

export interface MatchCenterVendor {
  id_vendedor_v2: number;
  nombre_erp: string;
  id_sucursal: number | null;
  sucursal_nombre: string;
}

export interface MatchCenterRow {
  id_integrante: number;
  id_distribuidor: number;
  nombre_integrante: string;
  telegram_user_id: number | null;
  telegram_group_id: number | null;
  nombre_grupo: string | null;
  rol_telegram: string | null;
  id_vendedor_erp_legacy: string | null;
  location_hint_id: number | null;
  current_vendor: MatchCenterVendor | null;
  binding_vendor: MatchCenterVendor | null;
  suggested_vendor: MatchCenterVendor | null;
  reason: string;
  status: "safe" | "review" | "blocked";
  can_apply: boolean;
  is_test_user: boolean;
}

export interface MatchCenterCandidatesResponse {
  dist_id: number;
  stats: {
    total: number;
    safe: number;
    blocked: number;
    review: number;
  };
  rows: MatchCenterRow[];
  test_telegram_user_ids: number[];
}

export async function fetchMatchCenterCandidates(distId: number): Promise<MatchCenterCandidatesResponse> {
  return apiFetch<MatchCenterCandidatesResponse>(`/api/admin/match-center/candidates/${distId}`);
}

export async function applyMatchCenterRow(
  distId: number,
  idIntegrante: number,
  idVendedorV2: number,
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>("/api/admin/match-center/apply", {
    method: "POST",
    body: JSON.stringify({
      dist_id: distId,
      id_integrante: idIntegrante,
      id_vendedor_v2: idVendedorV2,
    }),
  });
}

export async function applyMatchCenterSafe(distId: number): Promise<{ ok: boolean; applied: number }> {
  return apiFetch<{ ok: boolean; applied: number }>(`/api/admin/match-center/apply-safe/${distId}`, {
    method: "POST",
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
  pdv_nuevos_7d?: number;
  pdv_activados_7d?: number;
  pdv_exhibidos?: number;
  pdv_exhibidos_nuevos_7d?: number;
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
  /** Padrón: `inactivo` = dado de baja (tombstone); omitido = activo en listados vivos */
  estado?: string | null;
}

export async function fetchVendedoresSupervision(distId: number): Promise<VendedorSupervision[]> {
  const rows = await apiFetch<Record<string, unknown>[]>(`/api/supervision/vendedores/${distId}`);
  return rows.map((row) => ({
    ...(row as unknown as VendedorSupervision),
    nombre_vendedor:
      resolveVendorERPName(row, ["nombre_erp", "vendedor_erp", "nombre_vendedor", "vendedor"]) ??
      "Sin vendedor",
  }));
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
  fecha_ultima_compra: string | null;
  estado: string | null;
}

export async function fetchClienteInfo(distId: number, nombre: string, idClienteErp?: string | null): Promise<ClienteContacto[]> {
  const params = new URLSearchParams({ nombre });
  if (idClienteErp) params.set("id_cliente_erp", idClienteErp);
  return apiFetch<ClienteContacto[]>(`/api/supervision/cliente-info/${distId}?${params}`);
}


// ── Supervisión Ventas ────────────────────────────────────────────────────────

export interface ArticuloVenta {
  codigo?: string | null;
  articulo: string;
  bultos: number;
  monto?: number;
}

export interface TransaccionVenta {
  fecha: string;
  cliente: string | null;
  comprobante: string | null;
  numero: string | null;
  tipo_operacion: string | null;
  es_devolucion: boolean;
  monto_total: number;
  monto_recaudado: number;
  articulos?: ArticuloVenta[];
}

export interface VendedorVentas {
  vendedor: string;
  total_facturas: number;
  monto_total: number;
  monto_recaudado: number;
  total_bultos?: number;
  clientes_bultos?: Array<{
    cliente: string;
    total_bultos: number;
    top_articulos: Array<{ articulo: string; bultos: number }>;
  }>;
  top_articulos?: Array<{ articulo: string; bultos: number }>;
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

export async function fetchVentasSupervision(
  distId: number,
  dias = 30,
  fechaHasta?: string,
  sucursal?: string,
  vendedor?: string,
): Promise<VentasSupervision> {
  const params = new URLSearchParams({ dias: String(dias) });
  if (fechaHasta) params.set("fecha_hasta", fechaHasta);
  if (sucursal) params.set("sucursal", sucursal);
  if (vendedor) params.set("vendedor", vendedor);
  const data = await apiFetch<VentasSupervision & { vendedores?: Record<string, unknown>[] }>(
    `/api/supervision/ventas/${distId}?${params.toString()}`
  );
  return {
    ...data,
    vendedores: (data.vendedores ?? []).map((row) => ({
      ...(row as unknown as VendedorVentas),
      vendedor:
        resolveVendorERPName(row, ["nombre_erp", "vendedor_erp", "nombre_vendedor", "vendedor"]) ??
        "Sin vendedor",
    })),
  };
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
  id_cliente_erp?: string | null;
  id_cliente?: number | null;
}

export interface VendedorCuentas {
  vendedor: string;
  id_vendedor?: number | null;
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

export interface SyncStatusEntry {
  last_updated: string | null;
  count: number;
  // padrón-only fields
  activos?: number;
  anulados?: number;
  ausentes?: number;
  last_run_estado?: "ok" | "error" | "en_curso" | null;
  has_zombie?: boolean;
}

export interface SyncStatus {
  padron: SyncStatusEntry;
  cuentas_corrientes: SyncStatusEntry;
  ventas: SyncStatusEntry;
}

export async function fetchSyncStatus(distId: number): Promise<SyncStatus> {
  return apiFetch<SyncStatus>(`/api/supervision/sync-status/${distId}`);
}

export async function fetchCuentasSupervision(distId: number, sucursal?: string, fecha?: string, vendedor?: string): Promise<CuentasSupervision> {
  const qp = new URLSearchParams();
  if (sucursal) qp.set("sucursal", sucursal);
  if (fecha) qp.set("fecha", fecha);
  if (vendedor) qp.set("vendedor", vendedor);
  const params = qp.toString() ? `?${qp.toString()}` : "";
  const data = await apiFetch<CuentasSupervision & { vendedores?: Record<string, unknown>[] }>(
    `/api/supervision/cuentas/${distId}${params}`
  );
  return {
    ...data,
    vendedores: (data.vendedores ?? []).map((row) => ({
      ...(row as unknown as VendedorCuentas),
      vendedor:
        resolveVendorERPName(row, ["nombre_erp", "vendedor_erp", "nombre_vendedor", "vendedor"]) ??
        "Sin vendedor",
    })),
  };
}


// ── Difusión ───────────────────────────────────────────────────────────────

export interface DifusionVendedor {
  id_vendedor: number;
  nombre_erp: string;
  sucursal_nombre: string | null;
  tiene_telegram: boolean;
}

export interface DifusionResultItem {
  ok: boolean;
  vendedor: string;
  error: string | null;
}

export interface DifusionCCResult {
  enviados: DifusionResultItem[];
  errores: DifusionResultItem[];
  fecha_snapshot: string | null;
}

export async function fetchDifusionVendedores(distId: number, sucursal?: string): Promise<DifusionVendedor[]> {
  const params = sucursal ? `?sucursal=${encodeURIComponent(sucursal)}` : "";
  return apiFetch<DifusionVendedor[]>(`/api/difusion/vendedores/${distId}${params}`);
}

export interface DifusionVendedorResumen {
  cc: {
    fecha_snapshot: string | null;
    deuda_total: number;
    cantidad_clientes: number;
    antiguedad_max: number | null;
    antiguedad_min: number | null;
  };
  objetivos: {
    total_abiertos: number;
    por_tipo: Record<string, number>;
  };
  exhibiciones: {
    mes_actual: string;
    aprobadas: number;
    pendientes: number;
    total: number;
  };
}

export async function fetchDifusionVendedorResumen(distId: number, idVendedor: number): Promise<DifusionVendedorResumen> {
  return apiFetch<DifusionVendedorResumen>(`/api/difusion/vendedor/${distId}/${idVendedor}/resumen`);
}

export async function postDifusionCCTelegram(body: {
  dist_id: number;
  modo: "uno" | "todos";
  id_vendedor?: number | null;
  sucursal?: string | null;
  mensaje_template: string;
  fecha?: string | null;
}): Promise<DifusionCCResult> {
  return apiFetch<DifusionCCResult>("/api/difusion/cc-telegram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export interface DifusionPreviewFlags {
  missing_group: boolean;
  empty_cc: boolean;
  duplicate_group: boolean;
}

export interface DifusionPreviewItem {
  id_vendedor: number;
  vendedor_nombre: string;
  clientes_count: number;
  deuda_total: number;
  telegram_group_id: number | null;
  telegram_title: string | null;
  flags: DifusionPreviewFlags;
}

export interface DifusionPreviewResult {
  fecha_snapshot: string | null;
  envios: DifusionPreviewItem[];
  tiene_conflictos: boolean;
}

export async function postDifusionCCTelegramPreview(body: {
  dist_id: number;
  modo: "uno" | "todos";
  id_vendedor?: number | null;
  sucursal?: string | null;
  fecha?: string | null;
}): Promise<DifusionPreviewResult> {
  return apiFetch<DifusionPreviewResult>("/api/difusion/cc-telegram/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, mensaje_template: "" }),
  });
}

// ── Objetivos ──────────────────────────────────────────────────────────────

export type ObjetivoTipo = 'conversion_estado' | 'cobranza' | 'ruteo_alteo' | 'exhibicion' | 'ruteo';

export interface Objetivo {
  id: string;
  id_distribuidor: number;
  id_vendedor: number;
  tipo: ObjetivoTipo;
  id_target_pdv?: number | null;
  id_target_ruta?: number | null;
  descripcion?: string | null;
  nombre_pdv?: string | null;
  nombre_vendedor?: string | null;
  id_cliente_erp?: string | null;
  estado_inicial?: string | null;
  estado_objetivo?: string | null;
  valor_objetivo?: number | null;
  valor_actual: number;
  cumplido: boolean;
  fecha_objetivo?: string | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  tiene_exhibicion_pendiente?: boolean;
  id_objetivo_padre?: string | null;
  resultado_final?: 'exito' | 'falla' | null;
  observacion_revision?: string | null;
  kanban_phase?: 'pendiente' | 'en_progreso' | 'terminado';
  items?: ObjetivoItem[];
  items_count?: number;
  items_cumplidos?: number;
  url_pdf_ruteo?: string | null;
  origen?: 'compania' | 'distribuidora' | null;
  mes_referencia?: string | null;
  tasa_pendientes?: number | null;
  desglose_cache?: {
    tasa_pendientes?: number | null;
    pendientes_count?: number;
    pendientes_items?: string[];
  } | null;
}

export interface ObjetivoItem {
  id: string;
  id_objetivo: string;
  id_distribuidor?: number;
  id_cliente_pdv: number;
  id_cliente_erp?: string | null;
  nombre_pdv?: string | null;
  estado_item: 'pendiente' | 'foto_subida' | 'cumplido' | 'falla';
  accion_ruteo?: 'cambio_ruta' | 'baja' | null;
  id_ruta_destino?: number | null;
  motivo_baja?: string | null;
  orden_sugerido?: number | null;
  metadata_ruteo?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

export interface ObjetivoTimelineEvent {
  id?: string;
  id_objetivo: string;
  tipo_evento: string;
  id_referencia?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
}

export interface ObjetivoTimeline {
  id_objetivo: string;
  nombre_vendedor?: string | null;
  tipo?: string | null;
  descripcion?: string | null;
  fecha_objetivo?: string | null;
  kanban_phase?: string | null;
  resultado_final?: 'exito' | 'falla' | null;
  eventos: ObjetivoTimelineEvent[];
}

export interface ObjetivoCreate {
  id_distribuidor: number;
  id_vendedor: number;
  tipo: ObjetivoTipo;
  id_target_pdv?: number;
  id_target_ruta?: number;
  descripcion?: string;
  nombre_pdv?: string;
  nombre_vendedor?: string;
  estado_inicial?: string;
  estado_objetivo?: string;
  valor_objetivo?: number;
  fecha_objetivo?: string;
  id_objetivo_padre?: string;
  pdv_items?: {
    id_cliente_pdv: number;
    id_cliente_erp?: string;
    nombre_pdv?: string;
    accion_ruteo?: 'cambio_ruta' | 'baja';
    id_ruta_destino?: number;
    motivo_baja?: string;
    orden_sugerido?: number;
    metadata_ruteo?: Record<string, unknown>;
    // Agrupación por polígono ("Armar Ruta")
    group_id?: string;
    group_name?: string;
    polygon_geojson?: Record<string, unknown>;
  }[];
  /** Modo de selección de PDVs: 'manual' | 'polygon' */
  ruteo_build_mode?: string;
  /** Origen del objetivo: 'compania' (directorio/superadmin) o 'distribuidora' (default) */
  origen?: 'compania' | 'distribuidora';
  /** Mes de referencia para objetivos de compañía (YYYY-MM-DD, primer día del mes) */
  mes_referencia?: string;
  /** Margen de completud: cuántos ítems pueden quedar pendientes y el objetivo igual se considera cumplido */
  tasa_pendientes?: number;
}

export interface ObjetivoUpdate {
  valor_actual?: number;
  descripcion?: string;
  estado_objetivo?: string;
  fecha_objetivo?: string;
  resultado_final?: 'exito' | 'falla';
  kanban_phase?: 'pendiente' | 'en_progreso' | 'terminado';
}

export async function fetchObjetivos(
  distId: number,
  params?: { cumplido?: boolean; tipo?: ObjetivoTipo; vendedor_id?: number; sucursal_nombre?: string }
): Promise<Objetivo[]> {
  const q = new URLSearchParams();
  if (params?.cumplido !== undefined) q.set('cumplido', String(params.cumplido));
  if (params?.tipo) q.set('tipo', params.tipo);
  if (params?.vendedor_id) q.set('vendedor_id', String(params.vendedor_id));
  if (params?.sucursal_nombre) q.set('sucursal_nombre', params.sucursal_nombre);
  const qs = q.toString();
  const rows = await apiFetch<Record<string, unknown>[]>(`/api/supervision/objetivos/${distId}${qs ? `?${qs}` : ''}`);
  return rows.map((row) => ({
    ...(row as unknown as Objetivo),
    nombre_vendedor:
      resolveVendorERPName(row, ["nombre_erp", "vendedor_erp", "nombre_vendedor", "vendedor"]) ??
      null,
  }));
}

export async function createObjetivo(data: ObjetivoCreate): Promise<Objetivo> {
  return apiFetch<Objetivo>('/api/supervision/objetivos', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateObjetivo(id: string, data: ObjetivoUpdate): Promise<Objetivo> {
  return apiFetch<Objetivo>(`/api/supervision/objetivos/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteObjetivo(id: string): Promise<void> {
  return apiFetch<void>(`/api/supervision/objetivos/${id}`, { method: 'DELETE' });
}

export async function fetchObjetivosTimeline(
  distId: number,
  vendedorId?: number,
  sucursalNombre?: string
): Promise<ObjetivoTimeline[]> {
  const params = new URLSearchParams();
  if (vendedorId) params.set('vendedor_id', String(vendedorId));
  if (sucursalNombre) params.set('sucursal_nombre', sucursalNombre);
  const qs = params.toString();
  try {
    const rows = await apiFetch<Record<string, unknown>[]>(
      `/api/supervision/objetivos/${distId}/timeline${qs ? `?${qs}` : ''}`
    );
    return rows.map((row) => ({
      ...(row as unknown as ObjetivoTimeline),
      nombre_vendedor:
        resolveVendorERPName(row, ["nombre_erp", "vendedor_erp", "nombre_vendedor", "vendedor"]) ??
        null,
    }));
  } catch {
    return [];
  }
}

export interface ObjetivoDocumento {
  id: string;
  tipo_documento: string;
  url_documento: string;
  created_at: string;
}

export async function fetchObjetivoDocumentos(objetivoId: string): Promise<ObjetivoDocumento[]> {
  return apiFetch<ObjetivoDocumento[]>(`/api/supervision/objetivos/${objetivoId}/documentos`);
}

export async function regenerateObjetivoRuteoPDF(objetivoId: string): Promise<{ ok: boolean; url: string }> {
  return apiFetch<{ ok: boolean; url: string }>(
    `/api/supervision/objetivos/${objetivoId}/regenerar-pdf-ruteo`,
    { method: "POST" }
  );
}

// ── Objetivos — Supervisor aggregation ────────────────────────────────────────

export interface ResumenVendedorObjetivos {
  id_vendedor: number;
  nombre_vendedor: string;
  cantidad_objetivo_total: number;
  cantidad_actual_total: number;
  objetivos_count: number;
  objetivos_cumplidos: number;
  proxima_fecha: string | null;
  tipos: string[];
  pct_progreso: number;
}

export interface ResumenSupervisorObjetivos {
  vendedores: ResumenVendedorObjetivos[];
  totales: {
    cantidad_objetivo_total: number;
    cantidad_actual_total: number;
    pct_progreso: number;
    vendedores_count: number;
  };
}

export async function fetchResumenSupervisorObjetivos(
  distId: number
): Promise<ResumenSupervisorObjetivos> {
  const data = await apiFetch<ResumenSupervisorObjetivos & { vendedores?: Record<string, unknown>[] }>(
    `/api/supervision/objetivos/${distId}/resumen-supervisor`
  );
  return {
    ...data,
    vendedores: (data.vendedores ?? []).map((row) => ({
      ...(row as unknown as ResumenVendedorObjetivos),
      nombre_vendedor:
        resolveVendorERPName(row, ["nombre_erp", "vendedor_erp", "nombre_vendedor", "vendedor"]) ??
        "Sin vendedor",
    })),
  };
}

// ── Informe de Ventas (PDF) ───────────────────────────────────────────────────
export async function generateInformeExcel(distId: number, files: File[]): Promise<Blob> {
  const token = localStorage.getItem(TOKEN_KEY);
  const form = new FormData();
  files.forEach(f => form.append("files", f));
  const res = await fetch(`${API_URL}/api/reports/generate/${distId}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    handleSessionExpired401(`/api/reports/generate/${distId}`, res.status);
    const err = await res.json().catch(() => ({ detail: "Error generando informe" }));
    throw new Error(err.detail ?? "Error generando informe");
  }
  return res.blob();
}

// ── Cuentas Corrientes upload por dist_id ─────────────────────────────────────
export async function uploadCCForDist(
  distId: number,
  file: File
): Promise<{ ok: boolean; job_id: number | null }> {
  const token = localStorage.getItem(TOKEN_KEY);
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_URL}/api/supervision/upload-cc/${distId}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    handleSessionExpired401(`/api/supervision/upload-cc/${distId}`, res.status);
    const err = await res.json().catch(() => ({ detail: "Error subiendo CC" }));
    throw new Error(err.detail ?? "Error subiendo CC");
  }
  return res.json();
}

export interface CCStatusResponse {
  estado: string;
  registros?: number;
  error_msg?: string;
  finalizado_en?: string;
}

export async function fetchCCStatus(distId: number): Promise<CCStatusResponse> {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(`${API_URL}/api/supervision/cc-status/${distId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    handleSessionExpired401(`/api/supervision/cc-status/${distId}`, res.status);
    throw new Error("Error consultando estado CC");
  }
  return res.json();
}

// ── PDV Catalog for exhibición objectives ─────────────────────────────────────
export interface PDVCatalogItem {
  id_cliente: number;
  nombre_cliente: string;
  id_cliente_erp: string | null;
  domicilio: string | null;
  estado?: string | null;
  fecha_ultima_compra?: string | null;
  fecha_ultima_exhibicion: string | null; // ISO datetime or null = never exhibited
}

export async function fetchPDVCatalog(
  distId: number,
  params: { vendedorId?: number; limit?: number; offset?: number } = {}
): Promise<PDVCatalogItem[]> {
  const { vendedorId, limit = 35, offset = 0 } = params;
  const qs = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    ...(vendedorId ? { vendedor_id: String(vendedorId) } : {}),
  });
  return apiFetch<PDVCatalogItem[]>(`/api/supervision/pdvs-catalog/${distId}?${qs}`);
}

// ── Supervisores ───────────────────────────────────────────────────────────────

export interface Supervisor {
  id: number;
  id_distribuidor: number;
  nombre_display: string;
  id_usuario_portal: number | null;
  usuario_portal: string | null;
  activo: boolean;
  cantidad_vendedores: number;
  created_at: string;
}

export interface SupervisorVendedor {
  id_vendedor: number;
  nombre_erp: string;
  sucursal_nombre: string | null;
  asignado: boolean;
}

export async function fetchSupervisores(distId: number, includeInactive = false): Promise<Supervisor[]> {
  return apiFetch<Supervisor[]>(`/api/supervisores/${distId}${includeInactive ? "?include_inactive=true" : ""}`);
}

export async function createSupervisor(distId: number, body: { nombre_display: string; id_usuario_portal?: number | null }): Promise<Supervisor> {
  return apiFetch<Supervisor>(`/api/supervisores/${distId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateSupervisor(distId: number, idSupervisor: number, body: { nombre_display?: string; id_usuario_portal?: number | null; activo?: boolean }): Promise<Supervisor> {
  return apiFetch<Supervisor>(`/api/supervisores/${distId}/${idSupervisor}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteSupervisor(distId: number, idSupervisor: number): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/supervisores/${distId}/${idSupervisor}`, { method: "DELETE" });
}

export async function fetchSupervisorVendedores(distId: number, idSupervisor: number): Promise<SupervisorVendedor[]> {
  return apiFetch<SupervisorVendedor[]>(`/api/supervisores/${distId}/${idSupervisor}/vendedores`);
}

export async function setSupervisorVendedores(distId: number, idSupervisor: number, idVendedores: number[]): Promise<{ ok: boolean; asignados: number }> {
  return apiFetch<{ ok: boolean; asignados: number }>(`/api/supervisores/${distId}/${idSupervisor}/vendedores`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_vendedores: idVendedores }),
  });
}

// ── Reportería ────────────────────────────────────────────────────────────────

export type ReporteriaSource = "sigo" | "comprobantes" | "comprobantes_detallado" | "bultos";
export type ReporteriaJobStatus = "queued" | "running" | "completed" | "failed";

export interface ReporteriaJob {
  id: string;
  id_distribuidor: number;
  source: ReporteriaSource;
  status: ReporteriaJobStatus;
  requested_by: number;
  params_json: Record<string, unknown>;
  requested_at: string;
  started_at: string | null;
  finished_at: string | null;
  error_msg: string | null;
  result_version: string | null;
}

export interface ReporteriaKpi {
  label: string;
  value: number;
  unit?: string;
  delta?: number;
  delta_label?: string;
}

export interface ReporteriaSerie {
  fecha: string;
  valor: number;
  etiqueta?: string;
}

export interface ReporteriaClienteRow {
  nombre_cliente: string;
  vendedor_nombre: string;
  sucursal_nombre: string;
  importe_total: number;
  cantidad_facturas: number;
  ultimo_comprobante: string | null;
}

export interface ReporteriaExploreResponse {
  source: ReporteriaSource;
  date_from: string;
  date_to: string;
  snapshot_version: string | null;
  snapshot_created_at: string | null;
  kpis: ReporteriaKpi[];
  serie_temporal: ReporteriaSerie[];
  top_clientes: ReporteriaClienteRow[];
  top_vendedores: { nombre: string; valor: number }[];
  por_vendedor_y_dia?: SigoVendorDia[];
  // SIGO extras
  por_sucursal?: SigoSucursalRow[];
  por_ruta?: SigoRutaRow[];
  por_hora?: SigoHoraRow[];
  clientes_detalle?: SigoClienteRow[];
  vendor_matrix?: Record<string, VendorMatrixEntry>;
  // Comprobantes extras
  por_canal?: CanalRow[];
  por_sucursal_comp?: SucursalCompRow[];
  por_cond_pago_serie?: CondPagoSerieRow[];
  semana_serie?: SemanaSerie[];
  clientes_full?: ClienteFullRow[];
  por_vendedor_full?: VendedorFullRow[];
  // Comprobantes Detallado
  por_articulo?: ArticuloRow[];
  por_canal_articulo?: CanalArticuloRow[];
  por_vendedor_articulo?: VendedorArticuloRow[];
  clientes_x_articulo?: ClienteArticuloRow[];
  // Bultos extras
  semana_serie_bultos?: BultosSemana[];
  por_vendedor_bultos?: VendedorBultosRow[];
  clientes_semana_pivot?: ClienteSemanaPivot[];
  articulos_por_vendedor?: ArticuloVendedorRow[];
  origen_datos: {
    fuente: string;
    menu_referencia: string;
    filtros_aplicados: string[];
    snapshot_at: string | null;
  };
}

// ── SIGO new fields ──────────────────────────────────────────────────────────

export interface SigoSucursalRow {
  sucursal: string;
  total: number;
  visitados: number;
  ventas: number;
  cobertura: number;
  efectividad: number;
}

export interface SigoRutaRow {
  ruta: string;
  vendedor: string;
  total: number;
  visitados: number;
  ventas: number;
}

export interface SigoHoraRow {
  hora: string;
  visitas: number;
  ventas: number;
}

export interface SigoClienteRow {
  id_cliente: string | null;
  nombre: string;
  vendedor: string;
  ruta: string | null;
  visitado: boolean;
  con_venta: boolean;
  motivo: string | null;
  hora_visita: string | null;
  hora_venta: string | null;
}

export interface VendorMatrixEntry {
  dias: SigoVendorDia[];
  por_hora: SigoHoraRow[];
  clientes: { nombre: string; visitado: boolean; con_venta: boolean }[];
}

// ── Comprobantes Resumido new fields ─────────────────────────────────────────

export interface CanalRow {
  canal: string;
  subcanal: string;
  importe: number;
  contado: number;
  cc: number;
  n_ops: number;
}

export interface SucursalCompRow {
  sucursal: string;
  importe: number;
  contado: number;
  cc: number;
  recibo: number;
  n_ops: number;
}

export interface CondPagoSerieRow {
  fecha: string;
  contado: number;
  cc: number;
  recibo: number;
}

export interface SemanaSerie {
  semana: string;
  importe: number;
}

export interface ClienteFullRow {
  nombre_cliente: string;
  vendedor: string;
  sucursal: string;
  canal: string;
  importe: number;
  contado: number;
  cc: number;
  n_ops: number;
  ultimo_comprobante: string | null;
}

export interface VendedorFullRow {
  vendedor: string;
  sucursal: string;
  importe: number;
  contado: number;
  cc: number;
  recibo: number;
  n_clientes: number;
  n_ops: number;
}

// ── Comprobantes Detallado ────────────────────────────────────────────────────

export interface ArticuloRow {
  articulo: string;
  importe: number;
  n_ops: number;
  n_clientes: number;
  prom_sem: number;
}

export interface CanalArticuloRow {
  canal: string;
  articulo: string;
  importe: number;
}

export interface VendedorArticuloRow {
  vendedor: string;
  articulo: string;
  importe: number;
  n_ops: number;
}

export interface ClienteArticuloRow {
  cliente: string;
  articulo: string;
  importe: number;
  n_ops: number;
}

// ── Bultos new fields ─────────────────────────────────────────────────────────

export interface BultosSemana {
  semana: string;
  bultos: number;
}

export interface VendedorBultosRow {
  vendedor: string;
  bultos: number;
  prom_sem: number;
  n_clientes: number;
  pct_25: number;
}

export interface ClienteSemanaPivot {
  cliente: string;
  vendedor: string;
  semanas: Record<string, number>;
}

export interface ArticuloVendedorRow {
  vendedor: string;
  articulo: string;
  bultos: number;
  prom_sem: number;
}

export async function createReporteriaJob(
  distId: number,
  body: { source: ReporteriaSource; date_from: string; date_to: string; sucursal?: string; vendedor?: string }
): Promise<ReporteriaJob> {
  return apiFetch<ReporteriaJob>(`/api/reporteria/jobs?id_distribuidor=${distId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchReporteriaJobStatus(jobId: string): Promise<ReporteriaJob> {
  return apiFetch<ReporteriaJob>(`/api/reporteria/jobs/${jobId}`);
}

export async function fetchReporteriaExplore(
  distId: number,
  source: ReporteriaSource,
  dateFrom: string,
  dateTo: string,
  params: { sucursal?: string; vendedor?: string } = {}
): Promise<ReporteriaExploreResponse> {
  const qs = new URLSearchParams({
    source,
    date_from: dateFrom,
    date_to: dateTo,
    ...(params.sucursal ? { sucursal: params.sucursal } : {}),
    ...(params.vendedor ? { vendedor: params.vendedor } : {}),
  });
  return apiFetch<ReporteriaExploreResponse>(`/api/reporteria/explore/${distId}?${qs}`);
}

export async function fetchReporteriaExploreByJob(
  distId: number,
  jobId: string,
): Promise<ReporteriaExploreResponse> {
  return apiFetch<ReporteriaExploreResponse>(
    `/api/reporteria/explore/${distId}?job_id=${encodeURIComponent(jobId)}`
  );
}

export async function uploadReporteriaManualFile(
  distId: number,
  source: ReporteriaSource,
  file: File,
): Promise<ReporteriaJob> {
  const token = localStorage.getItem(TOKEN_KEY);
  const form = new FormData();
  form.append("file", file);
  form.append("source", source);
  const res = await fetch(`${API_URL}/api/reporteria/manual-upload/${distId}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    handleSessionExpired401(`/api/reporteria/manual-upload/${distId}`, res.status);
    const err = await res.json().catch(() => ({ detail: "Error subiendo archivo" }));
    throw new Error(err.detail ?? "Error subiendo archivo");
  }
  return res.json();
}

export async function exportReporteria(jobId: string, formato: "xlsx" | "pdf" | "zip"): Promise<Blob> {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(`${API_URL}/api/reporteria/export/${jobId}?formato=${formato}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    handleSessionExpired401(`/api/reporteria/export/${jobId}`, res.status);
    throw new Error("Error exportando reporte");
  }
  return res.blob();
}

// ── SIGO Detail ───────────────────────────────────────────────────────────────

export interface SigoVendorDia {
  vendedor: string;
  fecha: string;
  planeadas: number;
  ejecutadas: number;
  sin_visita: number;
  con_venta: number;
  motivo_no_venta: number;
  sin_info: number;
  hora_primera_visita: string | null;
  hora_primera_venta: string | null;
  tiempo_promedio_venta_min: number | null;
}

export interface SigoDetailResponse {
  disponible: boolean;
  mensaje?: string;
  kpis?: Array<{ label: string; value: number; unit?: string }>;
  por_vendedor_y_dia?: SigoVendorDia[];
  serie_temporal?: Array<{ fecha: string; valor: number }>;
  top_vendedores?: Array<{ nombre: string; valor: number }>;
  date_from?: string;
  date_to?: string;
}

export async function fetchSigoDetail(distId: number): Promise<SigoDetailResponse> {
  return apiFetch<SigoDetailResponse>(`/api/reports/sigo-detail/${distId}`);
}

export async function exportSigoDetail(distId: number): Promise<Blob> {
  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  const res = await fetch(`${API_URL}/api/reports/sigo-detail/${distId}/export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    handleSessionExpired401(`/api/reports/sigo-detail/${distId}/export`, res.status);
    throw new Error("Error exportando SIGO");
  }
  return res.blob();
}

// ── DIFusión SIGO ─────────────────────────────────────────────────────────────

export interface DifusionSIGORequest {
  dist_id: number;
  modo: "uno" | "todos";
  id_vendedor?: number;
  mensaje_template?: string;
  sigo_data?: SigoDetailResponse;
}

export interface DifusionSIGOResult {
  enviados: Array<{ ok: boolean; vendedor: string; error?: string }>;
  errores: Array<{ ok: boolean; vendedor: string; error?: string }>;
}

export async function postDifusionSIGOTelegram(req: DifusionSIGORequest): Promise<DifusionSIGOResult> {
  return apiFetch<DifusionSIGOResult>("/api/difusion/sigo-telegram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
}

// ── Portal: guía CC/Difusión + mensajes al desarrollador ─────────────────────

/** Debe coincidir con iframe + backend `PortalGuiaTrackingIn.default`. */
export const GUIA_CC_DIFUSION_VERSION = "2026-05-cc-difusion-v2";

export async function postPortalGuiaTracking(body: {
  scroll_max_pct: number;
  active_seconds: number;
  guia_version: string;
  cerrado_modal: boolean;
}): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>("/api/portal-feedback/guia-tracking", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Clasificación automática rule-based que devuelve el backend en listado / creación */
export interface PortalTicketCapaAf {
  id: string;
  etiqueta: string;
}

export interface PortalTicketCampos {
  destinatario: string | null;
  prioridad: string | null;
  asunto: string | null;
}

export interface PortalTicketClasificacionAgent {
  categoria_id: string;
  categoria_etiqueta: string;
  hipotesis_falla: string;
  confianza: string;
  capas_afectadas: PortalTicketCapaAf[];
  campos_ticket: PortalTicketCampos;
  señales_detectadas?: string[];
  reglas_version?: string;
  /** Pasos concretos (p. ej. mapa vs padrón) */
  revision_checklist?: string[];
}

export async function postPortalFeedbackMessage(
  contenido: string,
): Promise<{ ok: boolean; id?: string; clasificacion_agent?: PortalTicketClasificacionAgent | null }> {
  return apiFetch<{ ok: boolean; id?: string; clasificacion_agent?: PortalTicketClasificacionAgent | null }>(
    "/api/portal-feedback/messages",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contenido }),
    },
  );
}

/** Multipart adjunto para tickets del portal — no usar apiFetch (evita Content-Type JSON). */
export async function uploadPortalFeedbackAttachment(file: File): Promise<{
  ok: boolean;
  url: string;
  filename: string;
}> {
  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  const fd = new FormData();
  fd.append("file", file);
  const url = `${API_URL}/api/portal-feedback/attachments`;
  const res = await fetch(url, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (!res.ok) {
    handleSessionExpired401("/api/portal-feedback/attachments", res.status);
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const detailMsg =
      typeof err.detail === "string" ? err.detail : (err.detail?.mensaje ?? `HTTP ${res.status}`);
    throw new ApiError(detailMsg, res.status, err.detail);
  }
  return res.json() as Promise<{ ok: boolean; url: string; filename: string }>;
}

export interface PortalFeedbackRow {
  id: string;
  created_at: string;
  updated_at: string | null;
  id_usuario: number;
  id_distribuidor: number | null;
  usuario_snapshot: string | null;
  rol_snapshot: string | null;
  contenido: string;
  respuesta: string | null;
  responded_at: string | null;
  id_usuario_respuesta: number | null;
  /** Presente sólo cuando el backend pudo ejecutar las reglas de clasificación */
  clasificacion_agent?: PortalTicketClasificacionAgent | null;
}

export async function fetchPortalFeedbackMessages(limit = 200): Promise<{ items: PortalFeedbackRow[] }> {
  const q = new URLSearchParams({ limit: String(limit), pendientes_primero: "true" });
  return apiFetch(`/api/portal-feedback/messages?${q}`);
}

export async function patchPortalFeedbackReply(id: string, respuesta: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/portal-feedback/messages/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ respuesta }),
  });
}

export async function fetchPortalFeedbackPendingCount(): Promise<{ pending: number }> {
  return apiFetch<{ pending: number }>("/api/portal-feedback/pending-count");
}

// ── Supervisión — Altas y Activaciones ─────────────────────────────────────

export interface PdvsMovimientoItem {
  id_cliente_erp: string | null;
  nombre: string;
  direccion: string;
  localidad: string;
  categoria: "alta" | "activacion";
  exhibido: boolean;
  fecha_evento: string | null;
}

export interface PdvsMovimientoResponse {
  items: PdvsMovimientoItem[];
  total_altas: number;
  total_activaciones: number;
  has_more: boolean;
}

export async function fetchPdvsMovimiento(
  distId: number,
  idVendedor: number,
  mes: string,
  categorias?: string,
): Promise<PdvsMovimientoResponse> {
  const q = new URLSearchParams({ mes });
  if (categorias) q.set("categorias", categorias);
  return apiFetch<PdvsMovimientoResponse>(
    `/api/supervision/vendedor/${distId}/${idVendedor}/pdvs-movimiento?${q}`,
  );
}
