"use client";

import { DashboardKpiCarousel } from "./DashboardKpiCarousel";
import { DashboardFilterBar } from "./DashboardFilterBar";
import { HeroCarousel } from "./HeroCarousel";
import { HeroCarouselSkeleton } from "./HeroCarouselSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
import type { KPIs, VendedorRanking, UltimaEvaluada, SucursalStats, EvolucionTiempo } from "@/lib/api";
import type { PeriodPreset } from "@/lib/dashboard-period";
import { cn } from "@/lib/utils";

interface DashboardMobileScrollProps {
  kpis: KPIs | undefined;
  evolucion: EvolucionTiempo[];
  ranking: VendedorRanking[];
  ultimasHero: UltimaEvaluada[];
  sucursales: SucursalStats[];
  loading: boolean;
  isDark: boolean;
  periodPreset: PeriodPreset;
  customYear?: number;
  customMonth?: number;
  kpiHeightPx?: number;
  chartYear: number;
  chartMonth: number;
  onPeriodChange: (preset: PeriodPreset, year?: number, month?: number) => void;
  sucursalFiltro: string;
  onSucursal: (suc: string) => void;
  onToggleTheme: () => void;
}

/** Vista mobile del dashboard: scroll vertical continuo con secciones apiladas. */
export function DashboardMobileScroll({
  kpis,
  evolucion,
  ranking,
  ultimasHero,
  sucursales,
  loading,
  isDark,
  periodPreset,
  customYear,
  customMonth,
  kpiHeightPx = 160,
  chartYear,
  chartMonth,
  onPeriodChange,
  sucursalFiltro,
  onSucursal,
  onToggleTheme,
}: DashboardMobileScrollProps) {
  /** Banda KPI más alta en mobile: grid 2×2 + labels de 2 líneas sin recorte */
  const mobileKpiHeight = Math.max(kpiHeightPx, 200);

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-20 overscroll-y-contain">
      {/* Filtros sticky */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border/40 px-4 py-2">
        <DashboardFilterBar
          layout="horizontal"
          periodPreset={periodPreset}
          customYear={customYear}
          customMonth={customMonth}
          onPeriodChange={onPeriodChange}
          sucursalFiltro={sucursalFiltro}
          sucursales={sucursales}
          onSucursal={onSucursal}
          isDark={isDark}
          onToggleTheme={onToggleTheme}
          isFullscreen={false}
        />
      </div>

      {/* KPI carousel */}
      <div
        className="shrink-0 px-4 pt-3"
        style={{ height: mobileKpiHeight, minHeight: mobileKpiHeight }}
        data-testid="mobile-kpi-section"
      >
        <DashboardKpiCarousel
          kpis={kpis}
          evolucion={evolucion}
          loading={loading && !kpis}
          isDark={isDark}
          bandHeightPx={mobileKpiHeight}
          chartYear={chartYear}
          chartMonth={chartMonth}
          mobileOptimized
        />
      </div>

      {/* Hero stories — 9:16 en mobile (IG), desktop sin cambios */}
      <div className="shrink-0 px-4 pt-3 w-full flex justify-center">
        <div className="w-full max-w-[min(100%,22rem)] aspect-[9/16]">
          {loading ? (
            <HeroCarouselSkeleton className="h-full w-full" />
          ) : (
            <HeroCarousel
              items={ultimasHero}
              compact
              portraitMobile
              isDark={isDark}
              className="h-full w-full"
              disableCube
            />
          )}
        </div>
      </div>

      {/* Ranking estático — el usuario controla el scroll */}
      <div className="flex-1 px-4 pt-3" data-testid="mobile-ranking-section">
        <h2 className={cn(
          "text-xs font-black uppercase tracking-widest mb-2",
          isDark ? "text-slate-400" : "text-slate-500",
        )}>
          Ranking
        </h2>
        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-2xl w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {ranking.slice(0, 40).map((v, i) => (
              <div
                key={v.id_vendedor_erp ?? i}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-3 py-2.5 border",
                  isDark
                    ? "bg-slate-800/60 border-slate-700/40"
                    : "bg-white/80 border-slate-200/60 shadow-sm",
                )}
              >
                <span className={cn(
                  "text-xs font-black w-5 text-center shrink-0",
                  i === 0 ? "text-amber-500" : i === 1 ? "text-slate-400" : i === 2 ? "text-orange-400" : isDark ? "text-slate-500" : "text-slate-400",
                )}>
                  {i + 1}
                </span>
                <span className={cn(
                  "flex-1 min-w-0 text-sm font-semibold leading-snug line-clamp-2",
                  isDark ? "text-slate-100" : "text-slate-800",
                )}>
                  {v.vendedor || "Sin vendedor"}
                </span>
                <span className={cn(
                  "text-sm font-black shrink-0",
                  isDark ? "text-violet-300" : "text-violet-600",
                )}>
                  {v.puntos ?? 0}
                  <span className={cn("text-[10px] font-medium ml-0.5", isDark ? "text-slate-500" : "text-slate-400")}>
                    pts
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
