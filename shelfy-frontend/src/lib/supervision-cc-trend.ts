import type { CcKpiDelta } from "@/lib/api";

export type CcTrendUnit = "currency" | "pdv";

function fmtPct(pct: number): string {
  return Math.abs(pct).toLocaleString("es-AR", { maximumFractionDigits: 1 });
}

function fmtSignedCount(diff: number): string {
  const n = Math.abs(Math.round(diff));
  const sign = diff > 0 ? "+" : "−";
  const label = n === 1 ? "PDV" : "PDVs";
  return `${sign}${n} ${label}`;
}

function fmtSignedMoney(diff: number, formatCurrency: (n: number) => string): string {
  const sign = diff > 0 ? "+" : "−";
  return `${sign}${formatCurrency(Math.abs(diff))}`;
}

/**
 * Tendencia KPI CC: % + variación absoluta + referencia (valor corrida anterior).
 * Ej.: "18,2% · −2 PDVs · anterior 11" o "9,8% · −$41.234 · anterior $476.268"
 */
export function formatCcKpiTrendDisplay(
  trend: CcKpiDelta,
  unit: CcTrendUnit,
  formatCurrency?: (n: number) => string,
): string {
  const parts: string[] = [];

  if (trend.pct != null) {
    parts.push(`${fmtPct(trend.pct)}%`);
  }

  if (trend.diff !== 0) {
    if (unit === "currency" && formatCurrency) {
      parts.push(fmtSignedMoney(trend.diff, formatCurrency));
    } else if (unit === "pdv") {
      parts.push(fmtSignedCount(trend.diff));
    }
  } else if (trend.pct == null && unit === "pdv") {
    parts.push("0 PDVs");
  }

  const anterior = trend.anterior;
  if (anterior != null && Number.isFinite(anterior)) {
    if (unit === "currency" && formatCurrency) {
      parts.push(`anterior ${formatCurrency(anterior)}`);
    } else if (unit === "pdv") {
      const n = Math.round(anterior);
      parts.push(`anterior ${n} ${n === 1 ? "PDV" : "PDVs"}`);
    }
  }

  if (parts.length === 0) return "";
  return parts.join(" · ");
}

/** @deprecated Usar formatCcKpiTrendDisplay */
export function formatCcKpiTrendLabel(
  trend: CcKpiDelta,
  formatAbs?: (n: number) => string,
): string {
  if (formatAbs) {
    return formatCcKpiTrendDisplay(trend, "currency", formatAbs);
  }
  return formatCcKpiTrendDisplay(trend, "pdv");
}
