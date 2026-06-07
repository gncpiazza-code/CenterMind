import { mesActual } from "@/lib/estadisticas-period";

const STORE_KEY = "estadisticas-store";

/** Meses persistidos en Zustand para alinear prefetch con la página de estadísticas. */
export function readEstadisticasPrefetchMeses(): string[] {
  if (typeof window === "undefined") return [mesActual()];
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [mesActual()];
    const parsed = JSON.parse(raw) as { state?: { mesesSeleccionados?: unknown } };
    const meses = parsed?.state?.mesesSeleccionados;
    if (Array.isArray(meses) && meses.every((m) => typeof m === "string" && m.length >= 7)) {
      return meses as string[];
    }
  } catch {
    /* ignore */
  }
  return [mesActual()];
}

export function estadisticasPrefetchMesesKey(meses: string[]): string {
  return meses.join(",");
}
