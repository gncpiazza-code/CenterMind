"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Grid3X3 } from "lucide-react";
import type { AvanceVentasModo, AvanceVentasResponse } from "@/lib/api";
import { deltaRefLabel, fmtBultos } from "@/lib/avance-ventas-format";
import { cn } from "@/lib/utils";

interface AvanceVentasHeatmapProps {
  data: AvanceVentasResponse["series"]["heatmap_top_skus"] | undefined;
  modo: AvanceVentasModo;
  /** Sin Card externo (para usar dentro del carrusel). */
  embedded?: boolean;
  className?: string;
}

/** Celda con intensidad de color según delta vs referencia. */
function HeatCell({ actual, refValue }: { actual: number; refValue: number | null }) {
  if (refValue === null) {
    return (
      <td className="px-2 py-1 text-center text-[10px] text-muted-foreground">—</td>
    );
  }
  const diff = actual - refValue;
  const pct = refValue !== 0 ? diff / Math.abs(refValue) : diff > 0 ? 1 : diff < 0 ? -1 : 0;
  const clamped = Math.max(-1, Math.min(1, pct));
  const alpha = Math.min(0.85, Math.abs(clamped) * 0.85);
  const bg =
    clamped > 0
      ? `rgba(16, 185, 129, ${alpha})`
      : clamped < 0
        ? `rgba(244, 63, 94, ${alpha})`
        : "transparent";
  return (
    <td
      className={cn(
        "px-2 py-1 text-center text-[10px] font-semibold tabular-nums",
        alpha > 0.45 ? "text-white" : "text-foreground",
      )}
      style={{ background: bg }}
      title={`Referencia: ${fmtBultos(refValue)} bultos`}
    >
      {diff > 0 ? "+" : ""}
      {fmtBultos(diff)}
    </td>
  );
}

/** Heatmap top 15 SKUs: bultos actuales vs referencias WoW/MoM. */
export function AvanceVentasHeatmap({ data, modo, embedded = false, className }: AvanceVentasHeatmapProps) {
  const rows = data ?? [];
  if (!rows.length) return null;
  const hasWow = rows.some((r) => r.ref_wow !== null);
  const hasMom = rows.some((r) => r.ref_mom !== null);
  if (!hasWow && !hasMom) return null;

  const table = (
    <table className="w-full border-collapse">
      <thead>
        <tr className="text-[10px] text-muted-foreground uppercase tracking-wide">
          <th className="px-2 py-1 text-left font-semibold">SKU</th>
          <th className="px-2 py-1 text-right font-semibold">Bultos</th>
          {hasWow && <th className="px-2 py-1 text-center font-semibold">{deltaRefLabel(modo, "wow")}</th>}
          {hasMom && <th className="px-2 py-1 text-center font-semibold">{deltaRefLabel(modo, "mom")}</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.cod_articulo} className="border-t border-border/50 text-xs">
            {/* R6: nombre completo, sin truncate */}
            <td className="px-2 py-1 font-medium whitespace-normal break-words leading-snug">
              {r.sku}
            </td>
            <td className="px-2 py-1 text-right font-mono text-[11px] tabular-nums">
              {fmtBultos(r.actual)}
            </td>
            {hasWow && <HeatCell actual={r.actual} refValue={r.ref_wow} />}
            {hasMom && <HeatCell actual={r.actual} refValue={r.ref_mom} />}
          </tr>
        ))}
      </tbody>
    </table>
  );

  if (embedded) return <div className="overflow-y-auto h-full min-h-0">{table}</div>;

  return (
    <Card className={className}>
      <CardHeader className="pb-2 pt-4 px-5">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <Grid3X3 size={15} className="text-rose-500" />
          Comparativa top {rows.length} SKUs
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-4 pt-0 overflow-x-auto">{table}</CardContent>
    </Card>
  );
}
