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
  className?: string;
}

const TOP_N = 7;
const BOTTOM_N = 3;

/** Barras horizontales: top SKUs por bultos + cola (incluye devoluciones netas en rojo). */
export function AvanceVentasTopSkusChart({ ranking, className }: AvanceVentasTopSkusChartProps) {
  const data = useMemo(() => {
    const rows = ranking ?? [];
    if (rows.length <= TOP_N + BOTTOM_N) return rows;
    return [...rows.slice(0, TOP_N), ...rows.slice(-BOTTOM_N)];
  }, [ranking]);

  if (!data.length) return null;

  return (
    <Card className={className}>
      <CardHeader className="pb-2 pt-4 px-5">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <BarChart3 size={15} className="text-blue-500" />
          Top / bottom SKUs (bultos)
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-4 pt-0">
        <div className="h-[230px]">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={180}>
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => fmtBultos(v)} />
              <YAxis
                type="category"
                dataKey="articulo"
                width={140}
                tick={{ fontSize: 9 }}
                tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)}
              />
              <Tooltip
                formatter={(value: number) => [`${fmtBultos(value)} bultos`, "Volumen"]}
                labelStyle={{ fontSize: 11, fontWeight: 600 }}
                contentStyle={{ fontSize: 11, borderRadius: 8 }}
              />
              <Bar dataKey="bultos" radius={[0, 4, 4, 0]} maxBarSize={16}>
                {data.map((r) => (
                  <Cell key={r.cod_articulo} fill={r.bultos >= 0 ? "#3b82f6" : "#ef4444"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
