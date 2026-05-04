"use client";

import { useEffect, useRef } from "react";
import { motion, useInView, useMotionValue, useSpring, animate } from "framer-motion";
import type { ReporteriaKpi } from "@/lib/api";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

function AnimatedNumber({ value, unit = "" }: { value: number; unit?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView || !ref.current) return;
    const controls = animate(0, value, {
      duration: 1.2,
      ease: [0.16, 1, 0.3, 1],
      onUpdate(v) {
        if (ref.current) {
          const formatted = Number.isInteger(value)
            ? Math.round(v).toLocaleString("es-AR")
            : v.toLocaleString("es-AR", { maximumFractionDigits: 1 });
          ref.current.textContent = formatted + unit;
        }
      },
    });
    return () => controls.stop();
  }, [isInView, value, unit]);

  return (
    <span ref={ref} className="tabular-nums">
      {value.toLocaleString("es-AR")}{unit}
    </span>
  );
}

const CARD_COLORS = [
  { bg: "from-violet-50 to-purple-50", border: "border-violet-100", accent: "text-violet-600", dot: "bg-violet-500" },
  { bg: "from-blue-50 to-indigo-50",   border: "border-blue-100",   accent: "text-blue-600",   dot: "bg-blue-500" },
  { bg: "from-emerald-50 to-teal-50",  border: "border-emerald-100", accent: "text-emerald-600", dot: "bg-emerald-500" },
  { bg: "from-amber-50 to-orange-50",  border: "border-amber-100",  accent: "text-amber-600",  dot: "bg-amber-500" },
  { bg: "from-rose-50 to-pink-50",     border: "border-rose-100",   accent: "text-rose-600",   dot: "bg-rose-500" },
  { bg: "from-sky-50 to-cyan-50",      border: "border-sky-100",    accent: "text-sky-600",    dot: "bg-sky-500" },
];

interface Props {
  kpis: ReporteriaKpi[];
}

export function ReporteriaKpis({ kpis }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {kpis.map((kpi, i) => {
        const color = CARD_COLORS[i % CARD_COLORS.length];
        const hasDelta = kpi.delta !== undefined && kpi.delta !== null;
        const deltaPositive = (kpi.delta ?? 0) >= 0;
        return (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "relative rounded-2xl p-4 border bg-gradient-to-br overflow-hidden",
              color.bg, color.border
            )}
          >
            <div className={cn("absolute top-0 right-0 w-16 h-16 rounded-full blur-2xl opacity-30", color.dot)} />
            <p className="text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider mb-2 leading-tight">
              {kpi.label}
            </p>
            <p className={cn("text-2xl font-black tracking-tight", color.accent)}>
              <AnimatedNumber value={kpi.value} unit={kpi.unit ?? ""} />
            </p>
            {hasDelta && (
              <div className={cn(
                "mt-1.5 flex items-center gap-1 text-[10px] font-semibold",
                deltaPositive ? "text-emerald-600" : "text-rose-500"
              )}>
                {deltaPositive
                  ? <TrendingUp size={10} />
                  : kpi.delta === 0
                    ? <Minus size={10} />
                    : <TrendingDown size={10} />
                }
                {kpi.delta_label ?? `${Math.abs(kpi.delta ?? 0)}%`}
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
