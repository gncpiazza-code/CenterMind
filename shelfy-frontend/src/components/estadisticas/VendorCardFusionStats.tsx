"use client";

import { Crown } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { fmtBultos } from "@/lib/estadisticas-format";
import type { VendorRawKpis } from "@/lib/api";
import type { VendorCardTierTheme } from "@/lib/vendor-card-tier";
import {
  statLeaderTooltip,
  type VendorStatLeaderKey,
} from "@/lib/vendor-card-fusion-kpi";
import {
  VENDOR_DETALLE_SIDEBAR_KPIS,
  formatVendorDetalleSidebarKpiValue,
  type VendorDetalleSidebarKpiKey,
} from "@/lib/vendor-detalle-sidebar-kpis";

interface VendorCardFusionStatsProps {
  kpis: VendorRawKpis;
  theme: VendorCardTierTheme;
  statLeaders?: VendorStatLeaderKey[];
}

function fmtCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(2)}k`;
  return String(Math.round(n));
}

function formatFusionStatValue(key: VendorDetalleSidebarKpiKey, raw: VendorRawKpis): string {
  if (key === "bultos") return fmtBultos(raw.bultos);
  if (key === "cobertura_compra" || key === "pdvs_exhibidos") {
    return formatVendorDetalleSidebarKpiValue(key, raw);
  }
  const n = Number(raw[key as keyof VendorRawKpis] ?? 0);
  return fmtCount(n);
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
        {VENDOR_DETALLE_SIDEBAR_KPIS.map(({ key, label, description }) => {
          const isLeader = leaderSet.has(key);
          const value = formatFusionStatValue(key, kpis);

          return (
            <Tooltip key={key}>
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
                      aria-label={statLeaderTooltip(key)}
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
              <TooltipContent
                side="top"
                align="center"
                className="max-w-[260px] text-xs leading-relaxed"
              >
                <p className="font-semibold">{label}</p>
                <p className="text-muted-foreground mt-0.5 whitespace-normal">{description}</p>
                {key === "bultos" && (kpis.unidades_cigarrillos ?? 0) > 0 && (
                  <p className="text-muted-foreground mt-1 text-[10px]">
                    Unidades (cig. convertidos): {fmtCount(kpis.unidades_cigarrillos ?? 0)}
                  </p>
                )}
                {isLeader && (
                  <p className="text-amber-600 mt-1 text-[10px]">{statLeaderTooltip(key)}</p>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
