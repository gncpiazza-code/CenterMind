"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { BarChart3 } from "lucide-react";
import type { AvanceSkuRankingRow } from "@/lib/api";
import { fmtBultos } from "@/lib/avance-ventas-format";

interface AvanceVentasTopSkusChartProps {
  ranking: AvanceSkuRankingRow[] | undefined;
  /** Sin Card externo (para usar dentro del carrusel). */
  embedded?: boolean;
  className?: string;
}

const TOP_N = 7;
const BOTTOM_N = 3;

/** Tick del eje Y con nombre completo en hasta 2 líneas (R6: prohibido "…"). */
function FullNameTick({
  x,
  y,
  payload,
  width,
}: {
  x?: number;
  y?: number;
  payload?: { value: string };
  width?: number;
}) {
  const name = payload?.value ?? "";
  // Partir en 2 líneas balanceadas por palabras según el ancho disponible.
  const maxChars = Math.max(14, Math.floor((Number(width) || 150) / 5.2));
  const words = name.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    if ((current + " " + w).trim().length > maxChars && current) {
      lines.push(current.trim());
      current = w;
    } else {
      current = (current + " " + w).trim();
    }
  }
  if (current) lines.push(current.trim());
  const shown = lines.slice(0, 2);
  if (lines.length > 2) shown[1] = lines.slice(1).join(" ");
  return (
    <text x={x} y={y} textAnchor="end" fill="currentColor" className="text-muted-foreground">
      {shown.map((line, i) => (
        <tspan
          key={i}
          x={x}
          dy={i === 0 ? (shown.length > 1 ? -2 : 4) : 10}
          fontSize={9}
          fontWeight={500}
        >
          {line}
        </tspan>
      ))}
    </text>
  );
}

/** Barras horizontales: top SKUs por bultos + cola (devoluciones netas en rojo). */
export function AvanceVentasTopSkusChart({
  ranking,
  embedded = false,
  className,
}: AvanceVentasTopSkusChartProps) {
  const data = useMemo(() => {
    const rows = (ranking ?? []).filter((r) => !r.sin_venta);
    if (rows.length <= TOP_N + BOTTOM_N) return rows;
    return [...rows.slice(0, TOP_N), ...rows.slice(-BOTTOM_N)];
  }, [ranking]);

  // Ancho del eje Y según el nombre más largo (cap razonable, R6).
  const yAxisWidth = useMemo(() => {
    const maxLen = Math.max(0, ...data.map((r) => r.articulo.length));
    return Math.min(230, Math.max(120, Math.ceil((maxLen / 2) * 5.4) + 16));
  }, [data]);

  if (!data.length) return null;

  const chart = (
    <div className={embedded ? "h-full min-h-[230px]" : "h-[230px]"}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={180}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
          <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => fmtBultos(v)} />
          <YAxis
            type="category"
            dataKey="articulo"
            width={yAxisWidth}
            tick={<FullNameTick width={yAxisWidth} />}
            interval={0}
          />
          <Tooltip
            content={({ payload, label }) => {
              const p = payload?.[0];
              if (!p || typeof p.value !== "number") return null;
              return (
                <div className="rounded-lg border bg-card px-2.5 py-1.5 text-[11px] shadow-md max-w-[280px]">
                  {/* R6: nombre completo en tooltip */}
                  <p className="font-semibold whitespace-normal break-words">{String(label)}</p>
                  <p className="text-muted-foreground tabular-nums">{fmtBultos(p.value)} bultos</p>
                </div>
              );
            }}
          />
          <Bar dataKey="bultos" radius={[0, 4, 4, 0]} maxBarSize={16}>
            {data.map((r) => (
              <Cell key={r.cod_articulo} fill={r.bultos >= 0 ? "#3b82f6" : "#ef4444"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  if (embedded) return chart;

  return (
    <Card className={className}>
      <CardHeader className="pb-2 pt-4 px-5">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <BarChart3 size={15} className="text-blue-500" />
          Top / bottom SKUs (bultos)
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-4 pt-0">{chart}</CardContent>
    </Card>
  );
}
