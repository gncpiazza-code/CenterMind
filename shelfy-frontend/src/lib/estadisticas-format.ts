/** Formato KPIs de Estadísticas — Informe de Ventas. */

export {
  formatBultosCantidad,
  splitBultosDecimal,
  DEFAULT_UNIDADES_POR_BULTO,
  fmtBultosUnidadesDesglose,
} from "@/lib/bultos-display";

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

