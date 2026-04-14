"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

// Mejora #14: mapa semántico de color → CSS variable / tailwind class
export type KpiColorName = "amber" | "emerald" | "violet" | "red" | "blue" | "slate";

const COLOR_MAP: Record<KpiColorName, { hex: string; bg: string; badge: string; ring: string }> = {
  amber:   { hex: "#f59e0b", bg: "bg-amber-500",   badge: "bg-amber-50 text-amber-700 border-amber-200/60",    ring: "ring-amber-200" },
  emerald: { hex: "#10b981", bg: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 border-emerald-200/60", ring: "ring-emerald-200" },
  violet:  { hex: "#8b5cf6", bg: "bg-violet-500",  badge: "bg-violet-50/70 text-violet-700 border-violet-200/60",  ring: "ring-violet-200" },
  red:     { hex: "#ef4444", bg: "bg-red-500",     badge: "bg-red-50 text-red-600 border-red-200/60",           ring: "ring-red-200" },
  blue:    { hex: "#3b82f6", bg: "bg-blue-500",    badge: "bg-blue-50 text-blue-600 border-blue-200/60",        ring: "ring-blue-200" },
  slate:   { hex: "#64748b", bg: "bg-slate-500",   badge: "bg-slate-50 text-slate-600 border-slate-200/60",     ring: "ring-slate-200" },
};

interface KpiCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  /** Nombre semántico del color. Fallback a `color` hex si se omite. */
  colorName?: KpiColorName;
  /** @deprecated Usar colorName. Se mantiene por compatibilidad. */
  color?: string;
  bgColor?: string;
  delta?: number;
  /** Cuando se provee, la barra de progreso es real (valor/total). Sin total, no se muestra barra. Mejora #9 */
  total?: number;
  /** Subtítulo debajo del label — ej. porcentaje de tasa */
  subtitle?: string;
}

// Mejora #1: Contador animado easeOut
function useAnimatedCounter(target: number, duration = 800) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const diff = target - from;
    if (diff === 0) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    startRef.current = null;

    function step(ts: number) {
      if (!startRef.current) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + diff * eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
      }
    }

    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return display;
}

export function KpiCard({ label, value, icon, colorName, color, bgColor = "bg-white", delta, total, subtitle }: KpiCardProps) {
  const animatedValue = useAnimatedCounter(value);

  // Mejora #14: resolver color desde nombre semántico o fallback a hex
  const resolved = colorName ? COLOR_MAP[colorName] : null;
  const hexColor  = resolved?.hex  ?? color ?? "#8b5cf6";
  const bgClass   = resolved?.bg   ?? "bg-violet-500";
  const badgeClass = resolved?.badge ?? "bg-violet-50 text-violet-700 border-violet-200/60";
  const ringClass  = resolved?.ring  ?? "ring-violet-200";

  // Mejora #3: Font size adaptativo
  const valueFontClass = value >= 1000 ? "text-2xl" : value >= 100 ? "text-3xl" : "text-4xl";

  // Mejora #9: barra de progreso solo cuando hay total real (sin fallback engañoso)
  const progressPct = total != null && total > 0 ? Math.min((value / total) * 100, 100) : null;

  // Mejora #25: Flash ring al cambiar value
  const [flashing, setFlashing] = useState(false);
  const prevValueRef = useRef(value);
  useEffect(() => {
    if (prevValueRef.current !== value) {
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), 600);
      prevValueRef.current = value;
      return () => clearTimeout(t);
    }
  }, [value]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, transition: { duration: 0.18 } }}
      className="h-full"
    >
      <Card
        className={cn(
          "p-5 rounded-[2rem] border-slate-200/60 shadow-sm overflow-hidden relative group h-full transition-shadow duration-300",
          bgColor,
          flashing && `ring-2 ${ringClass}`
        )}
      >
        {/* Decorative background circle */}
        <div
          className="absolute -right-4 -top-4 w-24 h-24 rounded-full opacity-[0.06] group-hover:scale-150 group-hover:opacity-[0.08] transition-all duration-700"
          style={{ backgroundColor: hexColor }}
        />

        <CardContent className="p-0 flex flex-col justify-between h-full">
          <div className="flex items-start justify-between relative z-10">
            <div className={cn("p-2.5 rounded-2xl text-white shadow-lg ring-4 ring-white/10 shrink-0", bgClass)}>
              {icon}
            </div>
          </div>

          {/* Valor con contador animado — debajo del icono, siempre visible */}
          <div className="mt-2 relative z-10">
            <div
              className={cn("font-black tracking-tighter leading-none", valueFontClass)}
              style={{ color: hexColor }}
            >
              {animatedValue}
            </div>
          </div>

          <div className="mt-2 relative z-10">
            {/* Mejora #15: jerarquía tipográfica — label más legible */}
            <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500 group-hover:text-slate-700 transition-colors">
              {label}
            </div>

            {/* Subtítulo opcional (ej. tasa de aprobación) */}
            {subtitle && (
              <div className="text-[10px] font-bold text-slate-400 mt-0.5 tracking-wide">{subtitle}</div>
            )}

            {/* Mejora #2: Delta badge */}
            {delta !== undefined && (
              <span className={cn(
                "inline-block mt-1 text-[9px] font-black px-2 py-0.5 rounded-full border",
                delta >= 0 ? badgeClass.replace(badgeClass.split(" ")[0], "bg-emerald-50").replace(badgeClass.split(" ")[1], "text-emerald-600").replace(badgeClass.split(" ")[2], "border-emerald-200/60") : "bg-red-50 text-red-500 border-red-200/60"
              )}>
                {delta >= 0 ? "+" : ""}{delta}%
              </span>
            )}

            {/* Mejora #9: barra de progreso real solo si hay total */}
            {progressPct !== null && (
              <div className="h-1.5 w-full rounded-full bg-slate-100 mt-2.5 overflow-hidden">
                <motion.div
                  className="h-1.5 rounded-full"
                  style={{ backgroundColor: hexColor }}
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.9, ease: "easeOut" }}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
