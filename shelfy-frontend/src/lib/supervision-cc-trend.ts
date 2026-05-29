import type { CcKpiDelta } from "@/lib/api";

/** Etiqueta junto a la flecha (↑/↓): % si hay base anterior; si no, diferencia absoluta. */
export function formatCcKpiTrendLabel(
  trend: CcKpiDelta,
  formatAbs?: (n: number) => string,
): string {
  if (trend.pct != null) return `${Math.abs(trend.pct)}%`;
  if (trend.diff === 0) return "";
  const n = Math.abs(trend.diff);
  if (formatAbs) return formatAbs(n);
  return Number.isInteger(n) ? String(n) : n.toLocaleString("es-AR", { maximumFractionDigits: 1 });
}
