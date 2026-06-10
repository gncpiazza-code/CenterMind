"use client";

import { useMemo, useState } from "react";
import type { EvolucionTiempo, KPIs, UltimaEvaluada, VendedorRanking } from "@/lib/api";
import type { PeriodPreset } from "@/lib/dashboard-period";
import { DashboardKpiCarousel } from "./DashboardKpiCarousel";
import { DashboardFilterBar } from "./DashboardFilterBar";
import { HeroCarousel } from "./HeroCarousel";
import { MobileSegmentedNav } from "@/components/mobile/MobileSegmentedNav";
import { MobilePageShell } from "@/components/mobile/MobilePageShell";
import { cn } from "@/lib/utils";

type MobileSection = "resumen" | "destacadas" | "ranking";

interface DashboardMobileProps {
  kpis: KPIs | undefined;
  evolucion: EvolucionTiempo[];
  ranking: VendedorRanking[];
  ultimasHero: UltimaEvaluada[];
  loading: boolean;
  isDark: boolean;
  periodPreset: PeriodPreset;
  customYear?: number;
  customMonth?: number;
  onPeriodChange: (preset: PeriodPreset, year?: number, month?: number) => void;
  sucursalFiltro: string;
  sucursales: any[];
  onSucursal: (val: string) => void;
  onToggleTheme: () => void;
}

export function DashboardMobile(props: DashboardMobileProps) {
  const [section, setSection] = useState<MobileSection>("resumen");
  const rankingCards = useMemo(() => props.ranking.slice(0, 40), [props.ranking]);

  return (
    <MobilePageShell className="px-3 pt-3">
      <div className="space-y-3">
        <DashboardFilterBar
          layout="stacked"
          periodPreset={props.periodPreset}
          customYear={props.customYear}
          customMonth={props.customMonth}
          onPeriodChange={props.onPeriodChange}
          sucursalFiltro={props.sucursalFiltro}
          sucursales={props.sucursales}
          onSucursal={props.onSucursal}
          isDark={props.isDark}
          onToggleTheme={props.onToggleTheme}
          isFullscreen={false}
          onToggleFullscreen={() => {}}
          className="w-full"
        />

        <MobileSegmentedNav
          items={[
            { key: "resumen", label: "Resumen" },
            { key: "destacadas", label: "Destacadas" },
            { key: "ranking", label: "Ranking" },
          ]}
          value={section}
          onChange={setSection}
        />

        {section === "resumen" && (
          <DashboardKpiCarousel
            kpis={props.kpis}
            evolucion={props.evolucion}
            loading={props.loading}
            isDark={props.isDark}
            bandHeightPx={170}
          />
        )}

        {section === "destacadas" && (
          <div className="h-[42dvh] min-h-[280px]">
            <HeroCarousel items={props.ultimasHero} compact isDark={props.isDark} className="h-full" />
          </div>
        )}

        {section === "ranking" && (
          <div className="space-y-2">
            {rankingCards.map((entry, idx) => (
              <div
                key={`${entry.vendedor}-${idx}`}
                className={cn(
                  "rounded-xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] p-3",
                  "flex items-center justify-between gap-3",
                )}
              >
                <div className="min-w-0">
                  <p className="text-[11px] text-[var(--shelfy-muted)] font-semibold">#{idx + 1}</p>
                  <p className="text-sm font-bold text-[var(--shelfy-text)] leading-snug line-clamp-2">{entry.vendedor}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-[var(--shelfy-primary)] leading-none">{entry.puntos ?? 0}</p>
                  <p className="text-[10px] text-[var(--shelfy-muted)]">puntos</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </MobilePageShell>
  );
}
