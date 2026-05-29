"use client";

import { Crown } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ESTADISTICAS_KPI_HELP } from "@/lib/estadisticas-kpi-help";
import type { VendorRawKpis } from "@/lib/api";
import type { VendorCardTierTheme } from "@/lib/vendor-card-tier";
import {
  statLeaderTooltip,
  type VendorStatLeaderKey,
} from "@/lib/vendor-card-fusion-kpi";

interface VendorCardFusionStatsProps {
  kpis: VendorRawKpis;
  theme: VendorCardTierTheme;
  statLeaders?: VendorStatLeaderKey[];
}

function fmtKpi(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

const CELLS: {
  helpKey: keyof VendorRawKpis | "cobertura_pct";
  leaderKey: VendorStatLeaderKey;
  label: string;
  getValue: (k: VendorRawKpis) => string;
}[] = [
  {
    helpKey: "exhibiciones",
    leaderKey: "exhibiciones",
    label: "Exhibiciones",
    getValue: (k) => fmtKpi(k.exhibiciones),
  },
  {
    helpKey: "compradores",
    leaderKey: "compradores",
    label: "Compradores",
    getValue: (k) => fmtKpi(k.compradores),
  },
  { helpKey: "bultos", leaderKey: "bultos", label: "Bultos", getValue: (k) => fmtKpi(k.bultos) },
  { helpKey: "pdvs", leaderKey: "pdvs", label: "PDVs", getValue: (k) => fmtKpi(k.pdvs) },
  {
    helpKey: "cobertura_pct",
    leaderKey: "cobertura_pct",
    label: "Cobertura",
    getValue: (k) => `${Math.round(k.cobertura_pct)}%`,
  },
  { helpKey: "altas", leaderKey: "altas", label: "Altas", getValue: (k) => fmtKpi(k.altas) },
];

const helpByKey = Object.fromEntries(ESTADISTICAS_KPI_HELP.map((h) => [h.key, h]));

function helpFor(key: string) {
  if (key === "cobertura_pct") return helpByKey.cobertura;
  return helpByKey[key];
}

export function VendorCardFusionStats({
  kpis,
  theme,
  statLeaders = [],
}: VendorCardFusionStatsProps) {
  const leaderSet = new Set(statLeaders);

  return (
    <TooltipProvider delayDuration={150}>
      <div
        style={{
          padding: "0 10px",
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 5,
          flexShrink: 0,
        }}
      >
        {CELLS.map(({ helpKey, leaderKey, label, getValue }) => {
          const help = helpFor(String(helpKey));
          const isLeader = leaderSet.has(leaderKey);
          const value = getValue(kpis);

          return (
            <Tooltip key={leaderKey}>
              <TooltipTrigger asChild>
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: "relative",
                    borderRadius: 8,
                    padding: "5px 4px 6px",
                    background: theme.statPill,
                    textAlign: "center",
                    cursor: "help",
                    boxSizing: "border-box",
                  }}
                >
                  {isLeader && (
                    <Crown
                      size={10}
                      aria-label={statLeaderTooltip(leaderKey)}
                      style={{
                        position: "absolute",
                        top: 2,
                        right: 2,
                        color: "#fbbf24",
                        fill: "rgba(251,191,36,0.35)",
                        transform: "rotate(18deg)",
                        transformOrigin: "top right",
                      }}
                    />
                  )}
                  <div
                    style={{
                      fontSize: 8,
                      fontWeight: 600,
                      color: theme.statLabel,
                      lineHeight: 1.1,
                      marginBottom: 3,
                    }}
                  >
                    {label}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: theme.statValue,
                      lineHeight: 1,
                    }}
                  >
                    {value}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[200px] text-xs">
                <p className="font-semibold">{help?.label ?? label}</p>
                <p className="text-muted-foreground mt-0.5">{help?.description}</p>
                {isLeader && (
                  <p className="text-amber-600 mt-1 text-[10px]">{statLeaderTooltip(leaderKey)}</p>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
