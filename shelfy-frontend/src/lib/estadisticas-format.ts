/** Formato KPIs de Estadísticas — Informe de Ventas. */

export function fmtBultos(n: number): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  if (Math.abs(v) >= 1000) {
    return `${(v / 1000).toFixed(2)}k`;
  }
  return v.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtUnidades(n: number): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  if (Math.abs(v) >= 1000) {
    return `${(v / 1000).toFixed(2)}k`;
  }
  return v.toLocaleString("es-AR", {
    maximumFractionDigits: 0,
  });
}

/** Desglose legible: 42 Bultos · 92 Unidades (resto del decimal, no total vendido). */
export function fmtBultosUnidadesDesglose(
  bultosEnteros: number,
  unidadesResto: number,
): string {
  const b = fmtUnidades(bultosEnteros);
  const u = fmtUnidades(unidadesResto);
  if (unidadesResto > 0) {
    return `${b} Bultos · ${u} Unidades`;
  }
  return `${b} Bultos`;
}
