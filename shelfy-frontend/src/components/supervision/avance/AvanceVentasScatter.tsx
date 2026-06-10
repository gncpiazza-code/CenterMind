"use client";

import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { ScanSearch } from "lucide-react";
import type { AvanceVentasResponse } from "@/lib/api";
import { fmtBultos } from "@/lib/avance-ventas-format";

interface AvanceVentasScatterProps {
  data: AvanceVentasResponse["series"]["scatter_penetracion_intensidad"] | undefined;
  className?: string;
}

/** Scatter: clientes alcanzados (x) vs intensidad bultos/cliente (y); tamaño = bultos. */
export function AvanceVentasScatter({ data, className }: AvanceVentasScatterProps) {
  const rows = (data ?? []).filter((r) => r.clientes > 0);
  if (!rows.length) return null;

  return (
    <Card className={className}>
      <CardHeader className="pb-2 pt-4 px-5">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <ScanSearch size={15} className="text-violet-500" />
          Penetración × intensidad por SKU
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-4 pt-0">
        <div className="h-[230px]">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={180}>
            <ScatterChart margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.4} />
              <XAxis
                type="number"
                dataKey="clientes"
                name="Clientes"
                tick={{ fontSize: 10 }}
                label={{ value: "Clientes", position: "insideBottom", offset: -2, fontSize: 10 }}
              />
              <YAxis
                type="number"
                dataKey="intensidad"
                name="Intensidad"
                tick={{ fontSize: 10 }}
                label={{ value: "Bultos/cliente", angle: -90, position: "insideLeft", fontSize: 10 }}
              />
              <ZAxis type="number" dataKey="bultos" range={[30, 320]} name="Bultos" />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                content={({ payload }) => {
                  const p = payload?.[0]?.payload;
                  if (!p) return null;
                  return (
                    <div className="rounded-lg border bg-card px-2.5 py-1.5 text-[11px] shadow-md max-w-[220px]">
                      <p className="font-semibold truncate">{p.sku}</p>
                      <p className="text-muted-foreground tabular-nums">
                        {p.clientes} clientes · {fmtBultos(p.bultos)} bultos ·{" "}
                        {fmtBultos(p.intensidad)} b/cliente
                      </p>
                    </div>
                  );
                }}
              />
              <Scatter data={rows} fill="#8b5cf6" fillOpacity={0.65} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
