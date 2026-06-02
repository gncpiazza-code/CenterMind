// Schema URL: /galeria-exhibiciones?vendedor=42&modo=mapa&mes=2026-05&estado=Aprobada&pub=2026-05-28

const BASE_PATH = "/galeria-exhibiciones";

/** Sentinel para Select de Radix (no admite value=""). */
export const GALERIA_FILTER_ALL = "__all__";

const VALID_VIEW_MODES = new Set(["mapa", "grid"]);

export interface GaleriaUrlState {
  vendedorId?: number;
  viewMode?: "mapa" | "grid";
  mes?: string;
  estado?: string;
  clienteSearch?: string;
  pubDia?: string; // YYYY-MM-DD del dia_ar abierto en viewer
}

/**
 * Parsea los search params de la URL de galería.
 *
 * Params esperados:
 *   vendedor → number
 *   modo     → "mapa" | "grid"
 *   mes      → string YYYY-MM
 *   estado   → string (Aprobada, Rechazada, Destacada, Pendiente …)
 *   cliente  → string (búsqueda libre)
 *   pub      → string YYYY-MM-DD (dia_ar abierto en viewer)
 */
export function parseGaleriaSearchParams(searchParams: URLSearchParams): GaleriaUrlState {
  const state: GaleriaUrlState = {};

  const vendedorRaw = searchParams.get("vendedor");
  if (vendedorRaw) {
    const parsed = parseInt(vendedorRaw, 10);
    if (!isNaN(parsed) && parsed > 0) {
      state.vendedorId = parsed;
    }
  }

  const modoRaw = searchParams.get("modo");
  if (modoRaw && VALID_VIEW_MODES.has(modoRaw)) {
    state.viewMode = modoRaw as "mapa" | "grid";
  }

  const mesRaw = searchParams.get("mes");
  if (mesRaw && /^\d{4}-\d{2}$/.test(mesRaw)) {
    state.mes = mesRaw;
  } else {
    const desdeRaw = searchParams.get("desde");
    const hastaRaw = searchParams.get("hasta");
    const legacy = (desdeRaw || hastaRaw || "").slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(legacy)) state.mes = legacy;
  }

  const estadoRaw = searchParams.get("estado");
  if (estadoRaw) state.estado = estadoRaw;

  const clienteRaw = searchParams.get("cliente");
  if (clienteRaw) state.clienteSearch = clienteRaw;

  const pubRaw = searchParams.get("pub");
  if (pubRaw) state.pubDia = pubRaw;

  return state;
}

/** Convierte filtro UI a query param / API (undefined = sin filtro). */
export function resolveGaleriaEstadoFilter(estado?: string | null): string | undefined {
  if (!estado || estado === GALERIA_FILTER_ALL) return undefined;
  return estado;
}

/**
 * Construye la URL de galería con solo los params no vacíos.
 * Base path: /galeria-exhibiciones
 */
export function buildGaleriaUrl(state: GaleriaUrlState): string {
  const qs = new URLSearchParams();

  if (state.vendedorId != null) {
    qs.set("vendedor", String(state.vendedorId));
  }

  if (state.viewMode) {
    qs.set("modo", state.viewMode);
  }

  if (state.mes) {
    qs.set("mes", state.mes);
  }

  if (state.estado && state.estado !== GALERIA_FILTER_ALL) {
    qs.set("estado", state.estado);
  }

  if (state.clienteSearch) {
    qs.set("cliente", state.clienteSearch);
  }

  if (state.pubDia) {
    qs.set("pub", state.pubDia);
  }

  const qStr = qs.toString();
  return qStr ? `${BASE_PATH}?${qStr}` : BASE_PATH;
}
