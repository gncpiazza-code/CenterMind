"use client";

import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { PieChart as PieIcon } from "lucide-react";
import type { AvanceShareVendedor } from "@/lib/api";
import { fmtBultos } from "@/lib/avance-ventas-format";

const PALETTE = [
  "#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444",
  "#06b6d4", "#84cc16", "#ec4899", "#6366f1", "#14b8a6",
  "#a855f7", "#f97316",
];
const SIN_VENDEDOR_COLOR = "#94a3b8";
const MAX_SLICES = 10;

interface AvanceVentasShareChartProps {
  data: AvanceShareVendedor[] | null | undefined;
  /** Sin Card externo (para usar dentro del carrusel). */
  embedded?: boolean;
  className?: string;
}

/** Donut share de bultos por vendedor (incluye "Sin vendedor"); solo scope todos. */
export function AvanceVentasShareChart({ data, embedded = false, className }: AvanceVentasShareChartProps) {
  const slices = useMemo(() => {
    const rows = (data ?? []).filter((r) => r.bultos > 0);
    if (rows.length <= MAX_SLICES) return rows;
    const top = rows.slice(0, MAX_SLICES - 1);
    const resto = rows.slice(MAX_SLICES - 1);
    return [
      ...top,
      {
        vendedor: `Otros (${resto.length})`,
        bultos: resto.reduce((s, r) => s + r.bultos, 0),
        unidades: resto.reduce((s, r) => s + r.unidades, 0),
        pct_bultos: resto.reduce((s, r) => s + r.pct_bultos, 0),
      },
    ];
  }, [data]);

  if (!slices.length) return null;

  const body = (
    <>
        <div className={embedded ? "h-full min-h-[200px] flex-1" : "h-[230px]"}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={180}>
            <PieChart>
              <Pie
                data={slices}
                dataKey="bultos"
                nameKey="vendedor"
                innerRadius="55%"
                outerRadius="85%"
                paddingAngle={2}
                strokeWidth={1}
              >
                {slices.map((s, i) => (
                  <Cell
                    key={s.vendedor}
                    fill={s.vendedor === "Sin vendedor" ? SIN_VENDEDOR_COLOR : PALETTE[i % PALETTE.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                content={({ payload }) => {
                  const p = payload?.[0];
                  if (!p || typeof p.value !== "number") return null;
                  const slice = p.payload as AvanceShareVendedor | undefined;
                  return (
                    <div className="rounded-lg border bg-card px-2.5 py-1.5 text-[11px] shadow-md max-w-[240px]">
                      <p className="font-semibold whitespace-normal break-words">
                        {slice?.vendedor ?? String(p.name ?? "")}
                      </p>
                      <p className="text-muted-foreground tabular-nums">
                        {fmtBultos(p.value)} bultos ·{" "}
                        {(slice?.pct_bultos ?? 0).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%
                      </p>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 px-2">
          {slices.slice(0, 8).map((s, i) => (
            <span key={s.vendedor} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground min-w-0">
              <span
                className="size-2 rounded-full shrink-0"
                style={{
                  background:
                    s.vendedor === "Sin vendedor" ? SIN_VENDEDOR_COLOR : PALETTE[i % PALETTE.length],
                }}
              />
              <span className="truncate max-w-[120px] font-medium">{s.vendedor}</span>
              <span className="tabular-nums font-semibold text-foreground">
                {s.pct_bultos.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%
              </span>
            </span>
          ))}
        </div>
    </>
  );

  if (embedded) return <div className="flex flex-col h-full min-h-0">{body}</div>;

  return (
    <Card className={className}>
      <CardHeader className="pb-2 pt-4 px-5">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <PieIcon size={15} className="text-emerald-500" />
          Share por vendedor
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-4 pt-0">{body}</CardContent>
    </Card>
  );
}
