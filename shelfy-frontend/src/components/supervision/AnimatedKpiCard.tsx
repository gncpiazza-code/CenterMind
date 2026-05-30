"use client";

import { motion } from "framer-motion";
import { ChevronDown, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useCountUp } from "./useCountUp";
import type { CcKpiDelta } from "@/lib/api";
import { formatCcKpiTrendDisplay, type CcTrendUnit } from "@/lib/supervision-cc-trend";

const COLOR_MAP = {
  violet:  { bg: "bg-violet-500/8",  icon: "text-violet-600",  border: "border-violet-200/60" },
  emerald: { bg: "bg-emerald-500/8", icon: "text-emerald-600", border: "border-emerald-200/60" },
  amber:   { bg: "bg-amber-500/8",   icon: "text-amber-600",   border: "border-amber-200/60" },
  rose:    { bg: "bg-rose-500/8",    icon: "text-rose-600",    border: "border-rose-200/60" },
  blue:    { bg: "bg-blue-500/8",    icon: "text-blue-600",    border: "border-blue-200/60" },
} as const;

interface AnimatedKpiCardProps {
  label: string;
  value: number;
  formatter?: (n: number) => string;
  subtext?: string;
  icon: React.ElementType;
  color: keyof typeof COLOR_MAP;
  loading?: boolean;
  delay?: number;
  /** Flecha de tendencia (delta vs corrida CC anterior). */
  trend?: CcKpiDelta | null;
  /** Unidad del delta absoluto y referencia. */
  trendUnit?: CcTrendUnit;
  /** Card clickeable que despliega contenido debajo (p. ej. resumen CC). */
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  expandHint?: string;
}

export function AnimatedKpiCard({
  label,
  value,
  formatter = (n) => n.toLocaleString("es-AR"),
  subtext,
  icon: Icon,
  color,
  loading = false,
  delay = 0,
  trend,
  trendUnit = "pdv",
  expandable = false,
  expanded = false,
  onToggle,
  expandHint = "Ver desglose",
}: AnimatedKpiCardProps) {
  const animated = useCountUp(value);
  const { bg, icon: iconColor, border } = COLOR_MAP[color];

  const trendLabel =
    trend && trend.dir !== "neutral"
      ? formatCcKpiTrendDisplay(
          trend,
          trendUnit,
          trendUnit === "currency" ? formatter : undefined,
        )
      : "";

  const trendEl = trendLabel ? (
    <span
      className={cn(
        "inline-flex items-start gap-0.5 text-[10px] font-semibold tabular-nums max-w-[11rem]",
        trend!.dir === "up" ? "text-rose-600" : "text-emerald-600",
      )}
      title={trendLabel}
    >
      {trend!.dir === "up" ? (
        <TrendingUp size={11} strokeWidth={2.5} className="shrink-0 mt-0.5" />
      ) : (
        <TrendingDown size={11} strokeWidth={2.5} className="shrink-0 mt-0.5" />
      )}
      <span className="leading-tight break-words">{trendLabel}</span>
    </span>
  ) : null;

  const card = (
    <Card
      className={`border ${border} bg-card transition-shadow ${
        expandable && !expanded ? "hover:shadow-md cursor-pointer" : ""
      } ${expandable && expanded ? "shadow-md" : ""}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide truncate">
              {label}
            </p>
            {loading ? (
              <Skeleton className="mt-1 h-7 w-24 rounded" />
            ) : (
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
                <p className="mt-1 text-2xl font-black text-foreground tracking-tight leading-none tabular-nums">
                  {formatter(animated)}
                </p>
                {trendEl ? <span className="mt-0.5 sm:mt-1">{trendEl}</span> : null}
              </div>
            )}
            {expandable && !loading && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                {expanded ? "Ocultar desglose" : expandHint}
              </p>
            )}
            {subtext && !loading && !expandable && !trendEl && (
              <p className="mt-1 text-[10px] text-muted-foreground">{subtext}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {expandable && (
              <ChevronDown
                size={16}
                className={`${iconColor} transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
                  expanded ? "rotate-180" : ""
                }`}
              />
            )}
            <div className={`size-9 rounded-xl ${bg} flex items-center justify-center`}>
              <Icon size={17} className={iconColor} strokeWidth={2} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className="min-w-0"
    >
      {expandable && onToggle ? (
        <button
          type="button"
          className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          {card}
        </button>
      ) : (
        card
      )}
    </motion.div>
  );
}
