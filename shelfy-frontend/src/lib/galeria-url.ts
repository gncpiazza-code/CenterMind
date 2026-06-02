// Schema URL: /galeria-exhibiciones?vendedor=42&modo=mapa&desde=2026-05-01&hasta=2026-06-01&estado=Aprobada&pub=2026-05-28

const BASE_PATH = "/galeria-exhibiciones";

const VALID_VIEW_MODES = new Set(["mapa", "grid"]);

export interface GaleriaUrlState {
  vendedorId?: number;
  viewMode?: "mapa" | "grid";
  desde?: string;
  hasta?: string;
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
 *   desde    → string YYYY-MM-DD
 *   hasta    → string YYYY-MM-DD
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

  const desdeRaw = searchParams.get("desde");
  if (desdeRaw) state.desde = desdeRaw;

  const hastaRaw = searchParams.get("hasta");
  if (hastaRaw) state.hasta = hastaRaw;

  const estadoRaw = searchParams.get("estado");
  if (estadoRaw) state.estado = estadoRaw;

  const clienteRaw = searchParams.get("cliente");
  if (clienteRaw) state.clienteSearch = clienteRaw;

  const pubRaw = searchParams.get("pub");
  if (pubRaw) state.pubDia = pubRaw;

  return state;
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

  if (state.desde) {
    qs.set("desde", state.desde);
  }

  if (state.hasta) {
    qs.set("hasta", state.hasta);
  }

  if (state.estado) {
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
