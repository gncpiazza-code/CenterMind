"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  bgColor?: string;
  delta?: number;
  total?: number;
}

// Mejora #1: Contador animado easeOut 0.8s
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
      // easeOut cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(from + diff * eased);
      setDisplay(current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
      }
    }

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return display;
}

export function KpiCard({ label, value, icon, color, bgColor = "bg-white", delta, total }: KpiCardProps) {
  const animatedValue = useAnimatedCounter(value);

  // Mejora #3: Font size adaptativo
  const valueFontClass =
    value >= 1000 ? "text-2xl" : value >= 100 ? "text-3xl" : "text-4xl";

  // Mejora #4: Barra de progreso contextual
  const progressPct = total != null && total > 0
    ? Math.min((value / total) * 100, 100)
    : Math.min(value * 2, 100); // fallback visual

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
          flashing && "ring-2 ring-violet-300"
        )}
      >
        {/* Decorative background circle */}
        <div
          className="absolute -right-4 -top-4 w-24 h-24 rounded-full opacity-[0.03] group-hover:scale-150 transition-transform duration-700"
          style={{ backgroundColor: color }}
        />

        <CardContent className="p-0 flex flex-col justify-between h-full">
          <div className="flex items-start justify-between relative z-10">
            <div
              className="p-2.5 rounded-2xl mb-2 text-white shadow-lg ring-4 ring-white/10"
              style={{ backgroundColor: color }}
            >
              {icon}
            </div>
            {/* Mejora #1 + #3 */}
            <div
              className={cn("font-black tracking-tighter", valueFontClass)}
              style={{ color }}
            >
              {animatedValue}
            </div>
          </div>

          <div className="mt-3 relative z-10">
            <div className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 group-hover:text-slate-500 transition-colors">
              {label}
            </div>

            {/* Mejora #2: Delta badge */}
            {delta !== undefined && (
              <span
                className={cn(
                  "inline-block mt-1 text-[9px] font-black px-2 py-0.5 rounded-full",
                  delta >= 0
                    ? "bg-emerald-50 text-emerald-600"
                    : "bg-red-50 text-red-500"
                )}
              >
                {delta >= 0 ? "+" : ""}
                {delta}%
              </span>
            )}

            {/* Mejora #4: Barra de progreso */}
            <div className="h-1.5 w-full rounded-full bg-slate-100 mt-2 overflow-hidden">
              <motion.div
                className="h-1.5 rounded-full"
                style={{ backgroundColor: color }}
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
