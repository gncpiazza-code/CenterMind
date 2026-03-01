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

export interface Exhibicion {
  id_exhibicion: number;
  vendedor: string;
  nro_cliente: string;
  tipo_pdv: string;
  estado: string;
  drive_link: string;
  fecha_hora: string;
}

export interface KPIs {
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

export interface UsuarioPortal {
  id_usuario: number;
  usuario_login: string;
  rol: string;
  id_distribuidor: number;
  nombre_empresa: string;
}

// ── Helper fetch con JWT ────────────────────────────────────────────────────

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

export async function fetchUltimasEvaluadas(distribuidorId: number, n: number = 8) {
  return apiFetch(`/dashboard/ultimas-evaluadas/${distribuidorId}?n=${n}`);
}

export async function fetchPorSucursal(distribuidorId: number, periodo: string = "mes") {
  return apiFetch(`/dashboard/por-sucursal/${distribuidorId}?periodo=${periodo}`);
}

// ── Pendientes (Visor) ───────────────────────────────────────────────────────

export async function fetchPendientes(distribuidorId: number) {
  return apiFetch(`/pendientes/${distribuidorId}`);
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
