"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Grid3X3, Minus, TrendingDown, TrendingUp } from "lucide-react";
import type {
  AvanceHeatmapSkuRow,
  AvanceProyeccionContext,
  AvanceProyeccionKpi,
  AvanceProyeccionRefKey,
  AvanceVentasModo,
} from "@/lib/api";
import {
  deltaDir,
  deltaRefLabel,
  fmtBultos,
  fmtDelta,
  fmtProyeccionHint,
  heatmapProyField,
  proyeccionRefLabel,
} from "@/lib/avance-ventas-format";
import { AVANCE_KPI_HELP } from "@/lib/avance-ventas-kpi-help";
import { KpiHelpTip } from "@/components/estadisticas/KpiHelpTip";
import { cn } from "@/lib/utils";

interface AvanceVentasHeatmapProps {
  data: AvanceHeatmapSkuRow[] | undefined;
  modo: AvanceVentasModo;
  proyeccionContext?: AvanceProyeccionContext | null;
  /** Sin Card externo (para usar dentro del carrusel). */
  embedded?: boolean;
  className?: string;
}

function pctFromActualRef(actual: number, refValue: number | null) {
  if (refValue === null) return null;
  const diff = actual - refValue;
  const pct =
    refValue !== 0 ? (diff / Math.abs(refValue)) * 100 : diff > 0 ? 100 : diff < 0 ? -100 : 0;
  return {
    diff,
    pct: Math.round(pct * 10) / 10,
    disponible: true,
    anterior: refValue,
  };
}

/** Celda comparativa directa (actual vs referencia completa). */
function RefDeltaCell({ actual, refValue }: { actual: number; refValue: number | null }) {
  if (refValue === null) {
    return <td className="px-2 py-1 text-center text-[10px] text-muted-foreground">—</td>;
  }
  const delta = pctFromActualRef(actual, refValue);
  if (!delta) return null;
  const dir = deltaDir(delta);
  const clamped = Math.max(-1, Math.min(1, (delta.pct ?? 0) / 100));
  const alpha = Math.min(0.85, Math.abs(clamped) * 0.85);
  const bg =
    clamped > 0
      ? `rgba(16, 185, 129, ${alpha})`
      : clamped < 0
        ? `rgba(244, 63, 94, ${alpha})`
        : "transparent";
  const text = fmtDelta(delta);
  return (
    <td
      className={cn(
        "px-2 py-1 text-center text-[10px] font-semibold tabular-nums",
        alpha > 0.45 ? "text-white" : "text-foreground",
      )}
      style={{ background: bg }}
      title={`Referencia: ${fmtBultos(refValue)} bultos`}
    >
      <span className="inline-flex items-center justify-center gap-0.5">
        {dir === "up" ? (
          <TrendingUp size={9} strokeWidth={2.5} />
        ) : dir === "down" ? (
          <TrendingDown size={9} strokeWidth={2.5} />
        ) : (
          <Minus size={9} strokeWidth={2.5} />
        )}
        {text}
      </span>
    </td>
  );
}

function ProyDeltaCell({
  proy,
  proyeccionContext,
}: {
  proy: AvanceProyeccionKpi | undefined;
  proyeccionContext?: AvanceProyeccionContext | null;
}) {
  if (!proy?.disponible || !proy.vs_referencia?.disponible) {
    return <td className="px-2 py-1 text-center text-[10px] text-muted-foreground">—</td>;
  }
  const dir = deltaDir(proy.vs_referencia);
  const text = fmtDelta(proy.vs_referencia);
  return (
    <td
      className="px-2 py-1 text-center text-[10px] font-semibold tabular-nums border-l border-dashed border-border/60"
      title={fmtProyeccionHint(proy, proyeccionContext)}
    >
      <span
        className={cn(
          "inline-flex items-center justify-center gap-0.5",
          dir === "up"
            ? "text-emerald-600 dark:text-emerald-400"
            : dir === "down"
              ? "text-rose-600 dark:text-rose-400"
              : "text-slate-500",
        )}
      >
        {dir === "up" ? (
          <TrendingUp size={9} strokeWidth={2.5} />
        ) : dir === "down" ? (
          <TrendingDown size={9} strokeWidth={2.5} />
        ) : (
          <Minus size={9} strokeWidth={2.5} />
        )}
        {text}
      </span>
    </td>
  );
}

/** Heatmap top SKUs: bultos actuales vs referencias y proyección run-rate. */
export function AvanceVentasHeatmap({
  data,
  modo,
  proyeccionContext,
  embedded = false,
  className,
}: AvanceVentasHeatmapProps) {
  const rows = data ?? [];
  if (!rows.length) return null;
  const hasWow = rows.some((r) => r.ref_wow !== null);
  const hasMom = rows.some((r) => r.ref_mom !== null);
  const showProy = !!proyeccionContext?.disponible;
  const proyRefs = (proyeccionContext?.referencias ?? []) as AvanceProyeccionRefKey[];
  if (!hasWow && !hasMom && !showProy) return null;

  const table = (
    <table className="w-full border-collapse">
      <thead>
        <tr className="text-[10px] text-muted-foreground uppercase tracking-wide">
          <th className="px-2 py-1 text-left font-semibold">SKU</th>
          <th className="px-2 py-1 text-right font-semibold">Bultos</th>
          {hasWow && <th className="px-2 py-1 text-center font-semibold">{deltaRefLabel(modo, "wow")}</th>}
          {hasMom && <th className="px-2 py-1 text-center font-semibold">{deltaRefLabel(modo, "mom")}</th>}
          {showProy &&
            proyRefs.map((refKey) => (
              <th
                key={refKey}
                className="px-2 py-1 text-center font-semibold border-l border-dashed border-border/60 whitespace-nowrap"
              >
                <span className="inline-flex items-center gap-0.5">
                  {proyeccionRefLabel(modo, refKey)}
                  {refKey === proyRefs[0] ? (
                    <KpiHelpTip text={AVANCE_KPI_HELP.proyeccion} size={10} side="top" />
                  ) : null}
                </span>
              </th>
            ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.cod_articulo} className="border-t border-border/50 text-xs">
            <td className="px-2 py-1 font-medium whitespace-normal break-words leading-snug">{r.sku}</td>
            <td className="px-2 py-1 text-right font-mono text-[11px] tabular-nums">{fmtBultos(r.actual)}</td>
            {hasWow && <RefDeltaCell actual={r.actual} refValue={r.ref_wow} />}
            {hasMom && <RefDeltaCell actual={r.actual} refValue={r.ref_mom} />}
            {showProy &&
              proyRefs.map((refKey) => (
                <ProyDeltaCell
                  key={refKey}
                  proy={r[heatmapProyField(refKey)] as AvanceProyeccionKpi | undefined}
                  proyeccionContext={proyeccionContext}
                />
              ))}
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
