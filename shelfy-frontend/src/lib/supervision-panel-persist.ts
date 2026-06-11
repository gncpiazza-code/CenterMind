import type { AvanceVentasModo } from "@/lib/api";
import { mondayOfWeek, todayIsoAr } from "@/lib/avance-ventas-format";
import { PATRON_CUENTA_EQUIPO } from "@/components/estadisticas/PatronCuentaSelector";

/** Debe coincidir con `useSupervisionPanelStore` persist name. */
export const SUPERVISION_PANEL_STORAGE_KEY = "supervision-panel-store";

export interface SupervisionPanelPersistedSlice {
  viewMode: "cc" | "avance";
  avanceModo: AvanceVentasModo;
  selectedSucursal: string;
  selectedVendedorNombre: string | null;
  patronCuentaAvance: string;
}

/** Lee filtros UI persistidos (Zustand/localStorage) sin hook React — para prefetch T0. */
export function readSupervisionPanelPersisted(): SupervisionPanelPersistedSlice | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SUPERVISION_PANEL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
    const s = parsed?.state;
    if (!s) return null;
    const modo = s.avanceModo;
    return {
      viewMode: s.viewMode === "avance" ? "avance" : "cc",
      avanceModo: modo === "semana" || modo === "mes" ? modo : "dia",
      selectedSucursal: typeof s.selectedSucursal === "string" ? s.selectedSucursal : "__all__",
      selectedVendedorNombre:
        typeof s.selectedVendedorNombre === "string" ? s.selectedVendedorNombre : null,
      patronCuentaAvance:
        typeof s.patronCuentaAvance === "string" ? s.patronCuentaAvance : PATRON_CUENTA_EQUIPO,
    };
  } catch {
    return null;
  }
}

export function resolveAvanceFechaAncla(modo: AvanceVentasModo, hoy = todayIsoAr()): string {
  if (modo === "semana") return mondayOfWeek(hoy);
  if (modo === "mes") return `${hoy.slice(0, 7)}-01`;
  return hoy;
}

/** Params de prefetch alineados al store (avanceFecha no se persiste → siempre ancla de hoy). */
export function resolveSupervisionAvancePrefetchParams(hoy = todayIsoAr()): {
  sucursal: string | null;
  vendedor: string | null;
  modo: AvanceVentasModo;
  fecha: string;
  patronCuenta: string;
} {
  const p = readSupervisionPanelPersisted();
  const modo = p?.avanceModo ?? "dia";
  return {
    sucursal: p?.selectedSucursal && p.selectedSucursal !== "__all__" ? p.selectedSucursal : null,
    vendedor: p?.selectedVendedorNombre ?? null,
    modo,
    fecha: resolveAvanceFechaAncla(modo, hoy),
    patronCuenta: p?.patronCuentaAvance ?? PATRON_CUENTA_EQUIPO,
  };
}
