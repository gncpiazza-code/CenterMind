"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Store, Target } from "lucide-react";
import type { AvanceCoberturaPdvs, AvanceConvivenciaSkus } from "@/lib/api";
import { fmtEntero } from "@/lib/avance-ventas-format";
import { AVANCE_KPI_HELP } from "@/lib/avance-ventas-kpi-help";
import { KpiHelpTip } from "@/components/estadisticas/KpiHelpTip";
import { cn } from "@/lib/utils";

const POSITIVO_COLOR = "#10b981";
const NEUTRO_COLOR = "var(--border)";

interface Slice {
  name: string;
  value: number;
  color: string;
}

interface AlcanceDonutProps {
  title: string;
  help: string;
  icon: React.ElementType;
  pct: number | null;
  pctLabel: string;
  totalLabel: string;
  total: number;
  slices: Slice[];
  legend: Array<{ label: string; value: number; color: string; bordered?: boolean }>;
}

function AlcanceDonut({
  title,
  help,
  icon: Icon,
  pct,
  pctLabel,
  totalLabel,
  total,
  slices,
  legend,
}: AlcanceDonutProps) {
  const visible = slices.filter((s) => s.value > 0);
  const pctDisplay = pct ?? 0;

  return (
    <div className="flex flex-col min-h-0 flex-1 min-w-[140px]">
      <div className="flex items-center gap-1.5 mb-2 px-1">
        <Icon size={14} className="text-emerald-500 shrink-0" />
        <p className="text-[11px] font-bold text-foreground leading-tight">{title}</p>
        <KpiHelpTip text={help} size={12} side="top" />
      </div>
      <div className="relative flex-1 min-h-[180px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={160}>
          <PieChart>
            <Pie
              data={visible}
              dataKey="value"
              nameKey="name"
              innerRadius="58%"
              outerRadius="82%"
              paddingAngle={visible.length > 1 ? 3 : 0}
              strokeWidth={1}
              startAngle={90}
              endAngle={-270}
            >
              {visible.map((s) => (
                <Cell key={s.name} fill={s.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ payload }) => {
                const p = payload?.[0];
                if (!p || typeof p.value !== "number" || total <= 0) return null;
                const pctSlice = ((p.value / total) * 100).toLocaleString("es-AR", {
                  maximumFractionDigits: 1,
                });
                return (
                  <div className="rounded-lg border bg-card px-2.5 py-1.5 text-[11px] shadow-md">
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-muted-foreground tabular-nums">
                      {fmtEntero(p.value)} · {pctSlice}% del total
                    </p>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-xl sm:text-2xl font-black tabular-nums leading-none text-foreground">
            {pctDisplay.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%
          </p>
          <p className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wider text-muted-foreground mt-1 text-center px-2">
            {pctLabel}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-1 mt-1 px-1">
        {legend.map((item) => (
          <span
            key={item.label}
            className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground"
          >
            <span
              className={cn("size-2 rounded-full shrink-0", item.bordered && "border border-slate-300 dark:border-slate-600")}
              style={{ background: item.color }}
            />
            <span className="font-medium">{item.label}</span>
            <span className="tabular-nums font-semibold text-foreground ml-auto">{fmtEntero(item.value)}</span>
          </span>
        ))}
        <span className="text-[10px] text-muted-foreground pt-0.5">
          {totalLabel}{" "}
          <span className="tabular-nums font-semibold text-foreground">{fmtEntero(total)}</span>
        </span>
      </div>
    </div>
  );
}

interface AvanceVentasAlcanceChartsProps {
  convivencia: AvanceConvivenciaSkus | undefined;
  cobertura: AvanceCoberturaPdvs | undefined;
  className?: string;
}

/**
 * Cobertura PDV + Convivencia SKU en un solo tab del carrusel.
 * Cobertura = % PDVs de la cartera con compra. Convivencia = % SKUs del catálogo 12m con venta.
 */
export function AvanceVentasAlcanceCharts({
  convivencia,
  cobertura,
  className,
}: AvanceVentasAlcanceChartsProps) {
  const showConv = convivencia?.disponible && (convivencia.catalogo ?? 0) > 0;
  const showCob = cobertura?.disponible && (cobertura.cartera ?? 0) > 0;

  if (!showConv && !showCob) {
    return (
      <div className={cn("flex items-center justify-center h-full min-h-[200px]", className)}>
        <p className="text-xs text-muted-foreground text-center px-4">
          Sin datos de cartera o catálogo para este filtro y período.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-4 h-full min-h-0", className)}>
      {showCob && cobertura ? (
        <AlcanceDonut
          title="Cobertura de PDVs"
          help={AVANCE_KPI_HELP.coberturaPdvs}
          icon={Store}
          pct={cobertura.pct_cobertura}
          pctLabel="Cobertura PDV"
          totalLabel="Cartera"
          total={cobertura.cartera}
          slices={[
            { name: "Con compra", value: cobertura.con_compra, color: POSITIVO_COLOR },
            { name: "Sin compra", value: cobertura.sin_compra, color: NEUTRO_COLOR },
          ]}
          legend={[
            { label: "Con compra", value: cobertura.con_compra, color: POSITIVO_COLOR },
            { label: "Sin compra", value: cobertura.sin_compra, color: NEUTRO_COLOR, bordered: true },
          ]}
        />
      ) : (
        <div className="flex items-center justify-center min-h-[180px] rounded-lg border border-dashed border-border/60">
          <p className="text-[11px] text-muted-foreground px-3 text-center">
            Cartera no disponible para calcular cobertura PDV.
          </p>
        </div>
      )}
      {showConv && convivencia ? (
        <AlcanceDonut
          title="Convivencia de SKUs"
          help={AVANCE_KPI_HELP.convivencia}
          icon={Target}
          pct={convivencia.pct_convivencia}
          pctLabel="Convivencia SKU"
          totalLabel="Catálogo 12m"
          total={convivencia.catalogo}
          slices={[
            { name: "Con venta", value: convivencia.con_venta, color: POSITIVO_COLOR },
            { name: "Sin venta", value: convivencia.sin_venta, color: NEUTRO_COLOR },
          ]}
          legend={[
            { label: "Con venta", value: convivencia.con_venta, color: POSITIVO_COLOR },
            { label: "Sin venta", value: convivencia.sin_venta, color: NEUTRO_COLOR, bordered: true },
          ]}
        />
      ) : (
        <div className="flex items-center justify-center min-h-[180px] rounded-lg border border-dashed border-border/60">
          <p className="text-[11px] text-muted-foreground px-3 text-center">
            Catálogo 12 meses no disponible.
          </p>
        </div>
      )}
    </div>
  );
}
