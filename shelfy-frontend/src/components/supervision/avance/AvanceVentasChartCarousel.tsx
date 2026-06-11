"use client";

import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BarChart3, Grid3X3, PieChart, ScanSearch, Target } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { AvanceVentasModo, AvanceVentasResponse } from "@/lib/api";
import { AVANCE_KPI_HELP } from "@/lib/avance-ventas-kpi-help";
import { deriveCoberturaPdvs, deriveConvivenciaSkus } from "@/lib/avance-ventas-alcance";
import { KpiHelpTip } from "@/components/estadisticas/KpiHelpTip";
import { useIsDesktop } from "@/hooks/useViewport";
import { cn } from "@/lib/utils";
import { AvanceVentasShareChart } from "./AvanceVentasShareChart";
import { AvanceVentasTopSkusChart } from "./AvanceVentasTopSkusChart";
import { AvanceVentasScatter } from "./AvanceVentasScatter";
import { AvanceVentasHeatmap } from "./AvanceVentasHeatmap";
import { AvanceVentasAlcanceCharts } from "./AvanceVentasAlcanceCharts";

type CarouselTab = "vendedores" | "top" | "scatter" | "heatmap" | "alcance";

interface AvanceVentasChartCarouselProps {
  data: AvanceVentasResponse | undefined;
  modo: AvanceVentasModo;
  /** Sin filtro de vendedor activo (habilita tab share vendedores). */
  consolidado: boolean;
  className?: string;
}

const TAB_META: Record<
  CarouselTab,
  { label: string; icon: React.ElementType; accent: string; help?: string }
> = {
  vendedores: { label: "Vendedores", icon: PieChart, accent: "bg-emerald-500" },
  top: { label: "Top / bottom", icon: BarChart3, accent: "bg-blue-500" },
  scatter: { label: "Penetración", icon: ScanSearch, accent: "bg-violet-500" },
  heatmap: { label: "Comparativa", icon: Grid3X3, accent: "bg-rose-500" },
  alcance: {
    label: "Cobertura / convivencia",
    icon: Target,
    accent: "bg-emerald-600",
    help: `${AVANCE_KPI_HELP.coberturaPdvs} ${AVANCE_KPI_HELP.convivencia}`,
  },
};

const SWIPE_THRESHOLD_PX = 48;

/**
 * Carrusel anti-redundancia (R5): un solo bloque de contexto exploratorio con
 * pestañas + swipe mobile; la tabla ranking queda siempre fija fuera de acá.
 * Sin auto-rotate (decisión supervisión: menos distracción).
 */
export function AvanceVentasChartCarousel({
  data,
  modo,
  consolidado,
  className,
}: AvanceVentasChartCarouselProps) {
  const isDesktop = useIsDesktop();
  const [active, setActive] = useState<CarouselTab>("top");
  const touchStartX = useRef<number | null>(null);

  const convivencia = useMemo(
    () =>
      deriveConvivenciaSkus(
        data?.ranking_skus,
        data?.series?.convivencia_skus,
        data?.series?.cobertura_skus,
      ),
    [data?.ranking_skus, data?.series?.convivencia_skus, data?.series?.cobertura_skus],
  );
  const coberturaPdvs = useMemo(
    () => deriveCoberturaPdvs(data, data?.series?.cobertura_pdvs),
    [data],
  );

  const tabs = useMemo(() => {
    const out: CarouselTab[] = [];
    if (consolidado && data?.share_vendedores?.length) out.push("vendedores");
    if (data?.ranking_skus?.some((r) => !r.sin_venta)) out.push("top");
    if (data?.series?.scatter_penetracion_intensidad?.length) out.push("scatter");
    if (
      isDesktop &&
      data?.series?.heatmap_top_skus?.some((r) => r.ref_wow !== null || r.ref_mom !== null)
    )
      out.push("heatmap");
    if (convivencia?.disponible || coberturaPdvs?.disponible) out.push("alcance");
    return out;
  }, [data, consolidado, isDesktop, convivencia?.disponible, coberturaPdvs?.disponible]);

  // Derivado en render (sin efecto): si el tab activo dejó de existir, cae al primero.
  const effectiveActive = tabs.includes(active) ? active : tabs[0];

  if (!data || tabs.length === 0) return null;

  const goRelative = (dir: 1 | -1) => {
    const idx = tabs.indexOf(effectiveActive);
    if (idx < 0) return;
    setActive(tabs[(idx + dir + tabs.length) % tabs.length]);
  };

  const meta = TAB_META[effectiveActive];

  return (
    <Card
      className={cn("p-4 sm:p-5 overflow-hidden flex flex-col min-h-[320px]", className)}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchStartX.current;
        touchStartX.current = null;
        if (start == null || tabs.length <= 1) return;
        const dx = (e.changedTouches[0]?.clientX ?? start) - start;
        if (Math.abs(dx) >= SWIPE_THRESHOLD_PX) goRelative(dx < 0 ? 1 : -1);
      }}
    >
      <div className="flex items-center justify-between gap-3 mb-2 shrink-0">
        <p className="text-xs font-bold text-foreground shrink-0 hidden sm:block">Análisis visual</p>
        <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1 sm:justify-end">
          {tabs.map((key) => {
            const t = TAB_META[key];
            const Icon = t.icon;
            const isActive = effectiveActive === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActive(key)}
                aria-pressed={isActive}
                aria-label={t.label}
                title={t.label}
                className={cn(
                  "h-8 px-2.5 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide rounded-lg transition-all duration-200",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                  isActive
                    ? "bg-foreground text-background shadow-sm"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon size={12} strokeWidth={2.5} />
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            );
          })}
          {meta.help ? <KpiHelpTip text={meta.help} size={12} side="top" /> : null}
        </div>
        {tabs.length > 1 && (
          <div className="flex items-center shrink-0" role="tablist" aria-label="Gráficos">
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={effectiveActive === t}
                aria-label={TAB_META[t].label}
                onClick={() => setActive(t)}
                className="flex h-8 items-center px-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    effectiveActive === t ? cn("w-5", TAB_META[t].accent) : "w-1.5 bg-border",
                  )}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <div
        className={cn("h-0.5 w-10 rounded-full mb-3 shrink-0 transition-colors duration-300", meta.accent)}
      />

      <div className="flex-1 relative min-h-[240px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={effectiveActive}
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -14 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="absolute inset-0 flex flex-col min-h-0"
          >
            {effectiveActive === "vendedores" && (
              <AvanceVentasShareChart data={data.share_vendedores} embedded />
            )}
            {effectiveActive === "top" && <AvanceVentasTopSkusChart ranking={data.ranking_skus} embedded />}
            {effectiveActive === "scatter" && (
              <AvanceVentasScatter data={data.series?.scatter_penetracion_intensidad} embedded />
            )}
            {effectiveActive === "heatmap" && (
              <AvanceVentasHeatmap data={data.series?.heatmap_top_skus} modo={modo} embedded />
            )}
            {effectiveActive === "alcance" && (
              <AvanceVentasAlcanceCharts convivencia={convivencia} cobertura={coberturaPdvs} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </Card>
  );
}
