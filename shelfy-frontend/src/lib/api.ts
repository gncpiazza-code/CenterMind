import { API_URL, TOKEN_KEY } from "./constants";

// ── Tipos ──────────────────────────────────────────────────────────────────

export interface AuthResponse {
  access_token: string;
  token_type: string;
  usuario: string;
  rol: string;
  id_usuario: number;
  id_distribuidor: number;
  nombre_empresa: string;
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
  aprobadas: number;
  destacadas: number;
  rechazadas: number;
  puntos: number;
}

export interface UltimaEvaluada {
  id_exhibicion: number;
  drive_link: string;
  estado: string;
  tipo_pdv: string;
  nro_cliente: string;
  vendedor: string;
  timestamp_subida: string;
}

export interface SucursalStats {
  sucursal: string;
  location_id: number;
  aprobadas: number;
  rechazadas: number;
  total: number;
}

export interface FotoGrupo {
  id_exhibicion: number;
  drive_link: string;
}

export interface GrupoPendiente {
  vendedor: string;
  nro_cliente: string;
  tipo_pdv: string;
  fecha_hora: string;
  fotos: FotoGrupo[];
}

export interface UsuarioPortal {
  id_usuario: number;
  usuario_login: string;
  rol: string;
  id_distribuidor: number;
  nombre_empresa: string;
}

// ── Image helpers ───────────────────────────────────────────────────────────

/** Extrae el file ID de una URL de Google Drive */
export function extractDriveId(url: string): string | null {
  if (!url) return null;
  const m1 = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(url)) return url;
  return null;
}

/** URL del proxy de imagen (no requiere auth — el file_id es el token opaco) */
export function getImageUrl(fileId: string): string {
  return `${API_URL}/dashboard/imagen/${fileId}`;
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

export async function fetchKPIs(distribuidorId: number, periodo: string = "mes"): Promise<KPIs> {
  return apiFetch<KPIs>(`/dashboard/kpis/${distribuidorId}?periodo=${periodo}`);
}

export async function fetchRanking(distribuidorId: number, periodo: string = "mes"): Promise<VendedorRanking[]> {
  return apiFetch<VendedorRanking[]>(`/dashboard/ranking/${distribuidorId}?periodo=${periodo}`);
}

export async function fetchUltimasEvaluadas(distribuidorId: number, n: number = 8): Promise<UltimaEvaluada[]> {
  return apiFetch<UltimaEvaluada[]>(`/dashboard/ultimas-evaluadas/${distribuidorId}?n=${n}`);
}

export async function fetchPorSucursal(distribuidorId: number, periodo: string = "mes"): Promise<SucursalStats[]> {
  return apiFetch<SucursalStats[]>(`/dashboard/por-sucursal/${distribuidorId}?periodo=${periodo}`);
}

// ── Visor ───────────────────────────────────────────────────────────────────

export async function fetchStatsHoy(distribuidorId: number): Promise<StatsHoy> {
  return apiFetch<StatsHoy>(`/stats/${distribuidorId}`);
}

export async function fetchVendedores(distribuidorId: number): Promise<string[]> {
  return apiFetch<string[]>(`/vendedores/${distribuidorId}`);
}

export async function fetchPendientes(distribuidorId: number): Promise<GrupoPendiente[]> {
  return apiFetch<GrupoPendiente[]>(`/pendientes/${distribuidorId}`);
}

export async function evaluar(ids: number[], estado: string, supervisor: string, comentario: string = "") {
  return apiFetch("/evaluar", {
    method: "POST",
    body: JSON.stringify({ ids_exhibicion: ids, estado, supervisor, comentario }),
  });
}

export async function revertir(ids: number[]) {
  return apiFetch("/revertir", {
    method: "POST",
    body: JSON.stringify({ ids_exhibicion: ids }),
  });
}

// ── Admin: Usuarios ─────────────────────────────────────────────────────────

export async function fetchUsuarios(distId?: number): Promise<UsuarioPortal[]> {
  const q = distId ? `?dist_id=${distId}` : "";
  return apiFetch<UsuarioPortal[]>(`/admin/usuarios${q}`);
}

export async function crearUsuario(data: { dist_id: number; login: string; password: string; rol: string }) {
  return apiFetch("/admin/usuarios", { method: "POST", body: JSON.stringify(data) });
}

export async function editarUsuario(id: number, data: { login: string; rol: string; password?: string }) {
  return apiFetch(`/admin/usuarios/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function eliminarUsuario(id: number) {
  return apiFetch(`/admin/usuarios/${id}`, { method: "DELETE" });
}

// ── Reportes ────────────────────────────────────────────────────────────────

export async function fetchReporteVendedores(distId: number): Promise<string[]> {
  return apiFetch<string[]>(`/reportes/vendedores/${distId}`);
}

export async function fetchReporteTiposPdv(distId: number): Promise<string[]> {
  return apiFetch<string[]>(`/reportes/tipos-pdv/${distId}`);
}

export async function fetchReporteExhibiciones(distId: number, query: {
  fecha_desde: string;
  fecha_hasta: string;
  vendedores?: string[];
  estados?: string[];
  tipos_pdv?: string[];
  nro_cliente?: string;
}) {
  return apiFetch(`/reportes/exhibiciones/${distId}`, {
    method: "POST",
    body: JSON.stringify(query),
  });
}

// ── Admin: Distribuidoras (superadmin only) ──────────────────────────────────

export interface Distribuidora {
  id: number;
  nombre: string;
  estado: string;
}

export async function fetchDistribuidoras(soloActivas = false): Promise<Distribuidora[]> {
  return apiFetch<Distribuidora[]>(`/admin/distribuidoras?solo_activas=${soloActivas}`);
}

export async function crearDistribuidora(data: { nombre: string; token: string; carpeta_drive?: string; ruta_cred?: string }) {
  return apiFetch("/admin/distribuidoras", { method: "POST", body: JSON.stringify(data) });
}

export async function editarDistribuidora(id: number, data: { nombre: string; token: string; carpeta_drive?: string; ruta_cred?: string }) {
  return apiFetch(`/admin/distribuidoras/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function toggleDistribuidora(id: number, estado: "activo" | "inactivo") {
  return apiFetch(`/admin/distribuidoras/${id}/estado`, { method: "PATCH", body: JSON.stringify({ estado }) });
}

// ── Admin: Integrantes Telegram ──────────────────────────────────────────────

export interface Integrante {
  id_integrante: number;
  nombre_integrante: string;
  telegram_user_id: number;
  rol_telegram: string;
  telegram_group_id: number;
  nombre_empresa: string;
}

export async function fetchIntegrantes(distId?: number): Promise<Integrante[]> {
  const q = distId ? `?dist_id=${distId}` : "";
  return apiFetch<Integrante[]>(`/admin/integrantes${q}`);
}

export async function setRolIntegrante(id: number, rol: string, distribuidorId?: number) {
  return apiFetch(`/admin/integrantes/${id}/rol`, {
    method: "PUT",
    body: JSON.stringify({ rol, distribuidor_id: distribuidorId ?? null }),
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
  return apiFetch<BonoConfig>(`/bonos/config/${distId}?anio=${anio}&mes=${mes}`);
}

export async function guardarBonoConfig(distId: number, data: {
  anio: number; mes: number; umbral: number;
  monto_bono_fijo: number; monto_por_punto: number; puestos: PuestoRanking[];
}) {
  return apiFetch(`/bonos/config/${distId}/guardar`, { method: "POST", body: JSON.stringify(data) });
}

export async function bloquearBonoConfig(distId: number, anio: number, mes: number, bloquear: 0 | 1) {
  return apiFetch(`/bonos/config/${distId}/bloquear?anio=${anio}&mes=${mes}&bloquear=${bloquear}`, { method: "POST" });
}

export async function fetchLiquidacion(distId: number, anio: number, mes: number): Promise<{ umbral: number; vendedores: LiquidacionVendedor[] }> {
  return apiFetch(`/bonos/liquidacion/${distId}?anio=${anio}&mes=${mes}`);
}

export async function fetchBonoDetalle(distId: number, integranteId: number, anio: number, mes: number): Promise<DetalleExhibicion[]> {
  return apiFetch(`/bonos/detalle/${distId}?id_integrante=${integranteId}&anio=${anio}&mes=${mes}`);
}
