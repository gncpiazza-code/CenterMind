"use client";

import { useEffect, useRef } from "react";
import { motion, useInView, animate } from "framer-motion";
import type { ReporteriaKpi } from "@/lib/api";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

function formatKpiValue(value: number, unit?: string): string {
  const u = unit ?? "";
  if (u === "%") return `${value.toLocaleString("es-AR", { maximumFractionDigits: 1 })}${u}`;
  if (u === "$" || u.startsWith("$")) {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1).replace(".", ",")}M`;
    if (value >= 1_000)     return `$${Math.round(value / 1_000)}k`;
    return `$${Math.round(value)}`;
  }
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(".", ",")}M${u}`;
  if (value >= 1_000)     return `${(value / 1_000).toFixed(1).replace(".", ",")}k${u}`;
  return `${Number.isInteger(value) ? value : value.toLocaleString("es-AR", { maximumFractionDigits: 1 })}${u}`;
}

function AnimatedNumber({ value, unit = "" }: { value: number; unit?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView || !ref.current) return;
    const controls = animate(0, value, {
      duration: 1.1,
      ease: [0.16, 1, 0.3, 1],
      onUpdate(v) {
        if (ref.current) ref.current.textContent = formatKpiValue(v, unit);
      },
    });
    return () => controls.stop();
  }, [isInView, value, unit]);

  return (
    <span ref={ref} className="tabular-nums">
      {formatKpiValue(value, unit)}
    </span>
  );
}

const CARD_PALETTE = [
  {
    gradient: "from-violet-500/10 via-purple-500/5 to-transparent",
    border: "border-violet-200/60",
    accent: "text-violet-700",
    bar: "bg-violet-500",
    glow: "shadow-violet-100",
  },
  {
    gradient: "from-blue-500/10 via-sky-500/5 to-transparent",
    border: "border-blue-200/60",
    accent: "text-blue-700",
    bar: "bg-blue-500",
    glow: "shadow-blue-100",
  },
  {
    gradient: "from-emerald-500/10 via-teal-500/5 to-transparent",
    border: "border-emerald-200/60",
    accent: "text-emerald-700",
    bar: "bg-emerald-500",
    glow: "shadow-emerald-100",
  },
  {
    gradient: "from-amber-500/10 via-orange-500/5 to-transparent",
    border: "border-amber-200/60",
    accent: "text-amber-700",
    bar: "bg-amber-500",
    glow: "shadow-amber-100",
  },
  {
    gradient: "from-rose-500/10 via-pink-500/5 to-transparent",
    border: "border-rose-200/60",
    accent: "text-rose-700",
    bar: "bg-rose-500",
    glow: "shadow-rose-100",
  },
  {
    gradient: "from-cyan-500/10 via-sky-500/5 to-transparent",
    border: "border-cyan-200/60",
    accent: "text-cyan-700",
    bar: "bg-cyan-500",
    glow: "shadow-cyan-100",
  },
];

interface Props {
  kpis: ReporteriaKpi[];
  onKpiClick?: () => void;
  activeOnClick?: boolean;
}

export function ReporteriaKpis({ kpis, onKpiClick, activeOnClick = false }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
      {kpis.map((kpi, i) => {
        const palette = CARD_PALETTE[i % CARD_PALETTE.length];
        const hasDelta = kpi.delta !== undefined && kpi.delta !== null;
        const deltaUp = (kpi.delta ?? 0) > 0;
        const deltaFlat = kpi.delta === 0;
        return (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, type: "spring", stiffness: 280, damping: 28 }}
            onClick={activeOnClick ? onKpiClick : undefined}
            className={cn(
              "relative rounded-2xl p-3.5 border bg-white bg-gradient-to-br shadow-sm transition-shadow",
              palette.gradient, palette.border, palette.glow,
              activeOnClick && "cursor-pointer hover:shadow-md hover:scale-[1.02] hover:ring-2 hover:ring-[var(--shelfy-primary)]/30 transition-all duration-200",
            )}
          >
            {/* top accent bar */}
            <div className={cn("absolute top-0 left-4 right-4 h-[2px] rounded-b-full opacity-60", palette.bar)} />

            <p className="text-[9px] font-bold text-[var(--shelfy-muted)] uppercase tracking-widest mb-1.5 leading-none mt-1">
              {kpi.label}
            </p>
            <p className={cn("text-xl font-black tracking-tight leading-none", palette.accent)}>
              <AnimatedNumber value={kpi.value} unit={kpi.unit ?? ""} />
            </p>
            {hasDelta && (
              <div className={cn(
                "mt-2 flex items-center gap-1 text-[9px] font-bold",
                deltaFlat ? "text-slate-400" : deltaUp ? "text-emerald-600" : "text-rose-500"
              )}>
                {deltaFlat
                  ? <Minus size={9} />
                  : deltaUp
                    ? <TrendingUp size={9} />
                    : <TrendingDown size={9} />
                }
                <span>{kpi.delta_label ?? `${Math.abs(kpi.delta ?? 0)}%`}</span>
              </div>
            )}
            {activeOnClick && (
              <p className="mt-2 text-[8px] font-semibold text-[var(--shelfy-muted)] opacity-60">
                Clic para ver detalle →
              </p>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
