"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Layers } from "lucide-react";
import type { AvanceVentasResponse } from "@/lib/api";
import { fmtBultos } from "@/lib/avance-ventas-format";

interface AvanceVentasAgrupacionChartProps {
  data: AvanceVentasResponse["series"]["por_agrupacion"] | undefined;
  className?: string;
}

const MAX_GRUPOS = 10;

/** Barras de bultos por agrupación de artículo. */
export function AvanceVentasAgrupacionChart({ data, className }: AvanceVentasAgrupacionChartProps) {
  const rows = (data ?? []).slice(0, MAX_GRUPOS);
  if (!rows.length) return null;

  return (
    <Card className={className}>
      <CardHeader className="pb-2 pt-4 px-5">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <Layers size={15} className="text-amber-500" />
          Volumen por agrupación
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-4 pt-0">
        <div className="h-[230px]">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={180}>
            <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.4} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9 }}
                interval={0}
                tickFormatter={(v: string) => (v.length > 10 ? `${v.slice(0, 9)}…` : v)}
              />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => fmtBultos(v)} />
              <Tooltip
                formatter={(value: number, name: string) => [
                  name === "bultos" ? `${fmtBultos(value)} bultos` : `${fmtBultos(value)} unidades`,
                  name === "bultos" ? "Bultos" : "Unidades",
                ]}
                labelStyle={{ fontSize: 11, fontWeight: 600 }}
                contentStyle={{ fontSize: 11, borderRadius: 8 }}
              />
              <Bar dataKey="bultos" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
