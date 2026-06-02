/**
 * Regla Shelfy: cantidades en bultos.
 * - |bultos| < 1 → mostrar solo UNIDADES (bultos × factor, default 250).
 * - Decimal (ej. 4,04) → línea principal en bultos + desglose "4 Bultos · 10 Unidades".
 */

export const DEFAULT_UNIDADES_POR_BULTO = 250;

export interface BultosCantidadFormat {
  /** Texto principal (ej. "125 Unidades" o "4,04 bultos") */
  primary: string;
  /** Desglose opcional debajo */
  secondary?: string;
  /** true si la UI debe etiquetar como unidades, no bultos */
  isUnidadesOnly: boolean;
}

export function splitBultosDecimal(
  bultos: number,
  factor: number = DEFAULT_UNIDADES_POR_BULTO,
): { enteros: number; unidadesResto: number } {
  const b = Number(bultos) || 0;
  const f = Math.max(1, Math.round(factor));
  const sign = b < 0 ? -1 : 1;
  const bAbs = Math.abs(b);
  let enteros = Math.floor(bAbs);
  let fraccion = Math.round((bAbs - enteros) * f);
  if (fraccion >= f) {
    enteros += Math.floor(fraccion / f);
    fraccion = fraccion % f;
  }
  return { enteros: sign * enteros, unidadesResto: fraccion };
}

export function formatBultosCantidad(
  bultos: number,
  factor: number = DEFAULT_UNIDADES_POR_BULTO,
): BultosCantidadFormat {
  const b = Number(bultos) || 0;
  const f = factor > 0 ? factor : DEFAULT_UNIDADES_POR_BULTO;

  if (Math.abs(b) < 1) {
    const unidades = Math.round(Math.abs(b) * f);
    return {
      primary: `${unidades.toLocaleString("es-AR")} Unidades`,
      isUnidadesOnly: true,
    };
  }

  const { enteros, unidadesResto } = splitBultosDecimal(b, f);
  const hasFrac = unidadesResto > 0;
  const primary = b.toLocaleString("es-AR", {
    minimumFractionDigits: hasFrac ? 2 : 0,
    maximumFractionDigits: 2,
  });

  if (hasFrac) {
    const desglose =
      unidadesResto > 0
        ? `${Math.abs(enteros).toLocaleString("es-AR")} Bultos · ${unidadesResto.toLocaleString("es-AR")} Unidades`
        : `${Math.abs(enteros).toLocaleString("es-AR")} Bultos`;
    return {
      primary: `${primary} bultos`,
      secondary: desglose,
      isUnidadesOnly: false,
    };
  }

  return {
    primary: `${Math.abs(enteros).toLocaleString("es-AR")} bultos`,
    isUnidadesOnly: false,
  };
}

/** Compat estadísticas — desglose explícito backend. */
export function fmtBultosUnidadesDesglose(
  bultosEnteros: number,
  unidadesResto: number,
): string {
  const b = Math.abs(bultosEnteros).toLocaleString("es-AR");
  const u = unidadesResto.toLocaleString("es-AR");
  if (unidadesResto > 0) return `${b} Bultos · ${u} Unidades`;
  return `${b} Bultos`;
}
