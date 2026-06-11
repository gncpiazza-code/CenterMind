"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Target } from "lucide-react";
import type { AvanceCoberturaSkus } from "@/lib/api";
import { fmtEntero } from "@/lib/avance-ventas-format";
import { AVANCE_KPI_HELP } from "@/lib/avance-ventas-kpi-help";
import { KpiHelpTip } from "@/components/estadisticas/KpiHelpTip";

const CON_VENTA_COLOR = "#10b981";
// Token del design system: gris claro en light, gris tenue en dark.
const SIN_VENTA_COLOR = "var(--border)";

interface AvanceVentasCoberturaChartProps {
  data: AvanceCoberturaSkus | undefined;
  /** Sin Card externo (para usar dentro del carrusel). */
  embedded?: boolean;
  className?: string;
}

/**
 * Cobertura de catálogo (R4, reemplaza "Volumen por agrupación"):
 * SKUs con venta vs sin venta sobre el catálogo de los últimos 12 meses.
 */
export function AvanceVentasCoberturaChart({
  data,
  embedded = false,
  className,
}: AvanceVentasCoberturaChartProps) {
  if (!data || !data.disponible || data.catalogo === 0) {
    if (embedded) {
      return (
        <div className="flex items-center justify-center h-full min-h-[200px]">
          <p className="text-xs text-muted-foreground">Catálogo 12m no disponible.</p>
        </div>
      );
    }
    return null;
  }

  const slices = [
    { name: "Con venta", value: data.con_venta, color: CON_VENTA_COLOR },
    { name: "Sin venta", value: data.sin_venta, color: SIN_VENTA_COLOR },
  ].filter((s) => s.value > 0);

  const pct = data.pct_con_venta ?? 0;

  const body = (
    <div className={embedded ? "flex flex-col h-full min-h-0" : undefined}>
      <div className={embedded ? "relative flex-1 min-h-[200px]" : "relative h-[230px]"}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={180}>
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="85%"
              paddingAngle={slices.length > 1 ? 3 : 0}
              strokeWidth={1}
              startAngle={90}
              endAngle={-270}
            >
              {slices.map((s) => (
                <Cell key={s.name} fill={s.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ payload }) => {
                const p = payload?.[0];
                if (!p || typeof p.value !== "number") return null;
                const pctCat = ((p.value / data.catalogo) * 100).toLocaleString("es-AR", {
                  maximumFractionDigits: 1,
                });
                return (
                  <div className="rounded-lg border bg-card px-2.5 py-1.5 text-[11px] shadow-md">
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-muted-foreground tabular-nums">
                      {fmtEntero(p.value)} SKUs · {pctCat}% del catálogo
                    </p>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Centro del donut: % cobertura grande, glanceable */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-2xl font-black tabular-nums leading-none text-foreground">
            {pct.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%
          </p>
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mt-1">
            Cobertura
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-1 px-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="size-2 rounded-full shrink-0" style={{ background: CON_VENTA_COLOR }} />
          <span className="font-medium">Con venta</span>
          <span className="tabular-nums font-semibold text-foreground">{fmtEntero(data.con_venta)}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span
            className="size-2 rounded-full shrink-0 border border-slate-300 dark:border-slate-600"
            style={{ background: SIN_VENTA_COLOR }}
          />
          <span className="font-medium">Sin venta</span>
          <span className="tabular-nums font-semibold text-foreground">{fmtEntero(data.sin_venta)}</span>
        </span>
        <span className="text-[10px] text-muted-foreground">
          Catálogo <span className="tabular-nums font-semibold text-foreground">{fmtEntero(data.catalogo)}</span>
        </span>
      </div>
    </div>
  );

  if (embedded) return body;

  return (
    <Card className={className}>
      <CardHeader className="pb-2 pt-4 px-5">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <Target size={15} className="text-emerald-500" />
          Cobertura de catálogo
          <KpiHelpTip text={AVANCE_KPI_HELP.cobertura} size={12} side="top" />
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-4 pt-0">{body}</CardContent>
    </Card>
  );
}
