"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle, XCircle, Star, Clock,
  BarChart2, Users, TrendingUp, Store,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { KpiCard } from "./KpiCard";
import { Skeleton } from "@/components/ui/skeleton";
import type { KPIs, EvolucionTiempo } from "@/lib/api";
import { cn } from "@/lib/utils";

interface DashboardKpiCarouselProps {
  kpis: KPIs | undefined;
  evolucion: EvolucionTiempo[];
  loading?: boolean;
  isDark?: boolean;
}

type SlideKey = 0 | 1 | 2;
const SLIDE_COUNT = 3;
const SLIDE_LABELS = ["Estados", "Evolución", "Rendimiento"];
const SLIDE_ROTATE_MS = 8000;
const SLIDE_HEIGHT_CLASS = "h-[140px] md:h-[132px]";

/** Rebote tipo tragaperras al frenar el carrete */
const SLOT_TRANSITION = {
  y: {
    type: "spring" as const,
    stiffness: 88,
    damping: 13,
    mass: 1.15,
  },
  filter: { duration: 0.35, ease: "easeOut" as const },
  scale: { duration: 0.45, ease: [0.22, 1.15, 0.36, 1] as const },
};

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur-md border border-slate-200/60 rounded-2xl p-3 shadow-xl">
      <p className="text-xs font-black text-slate-800 mb-1.5">{label}</p>
      {payload.map((e) => (
        <p key={e.name} className="text-xs font-bold" style={{ color: e.color }}>
          {e.name}: {e.value}
        </p>
      ))}
    </div>
  );
}

function SlideNav({
  slide,
  isDark,
  onSelect,
}: {
  slide: SlideKey;
  isDark: boolean;
  onSelect: (s: SlideKey) => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 shrink-0 self-stretch py-1",
        SLIDE_HEIGHT_CLASS,
      )}
      role="tablist"
      aria-label="Vistas de métricas"
    >
      {([0, 1, 2] as SlideKey[]).map((s) => (
        <button
          key={s}
          type="button"
          role="tab"
          aria-selected={slide === s}
          onClick={() => onSelect(s)}
          aria-label={SLIDE_LABELS[s]}
          className={cn(
            "rounded-full transition-all duration-300 ease-out shrink-0",
            slide === s
              ? isDark
                ? "h-6 w-1.5 bg-slate-300"
                : "h-6 w-1.5 bg-violet-500 shadow-sm shadow-violet-500/30"
              : isDark
                ? "h-1.5 w-1.5 bg-slate-700 hover:bg-slate-500"
                : "h-1.5 w-1.5 bg-slate-200 hover:bg-slate-300",
          )}
        />
      ))}
    </div>
  );
}

export function DashboardKpiCarousel({
  kpis,
  evolucion,
  loading = false,
  isDark = false,
}: DashboardKpiCarouselProps) {
  const [slide, setSlide] = useState<SlideKey>(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const rotateRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const spinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tasaAprobacion = kpis && (kpis.aprobadas + kpis.rechazadas) > 0
    ? Math.round((kpis.aprobadas / (kpis.aprobadas + kpis.rechazadas)) * 100)
    : null;

  const hasEvolucion = evolucion.length > 0;
  const reelOffset = `${-(slide * (100 / SLIDE_COUNT))}%`;

  const triggerSpin = useCallback(() => {
    setIsSpinning(true);
    if (spinTimeoutRef.current) clearTimeout(spinTimeoutRef.current);
    spinTimeoutRef.current = setTimeout(() => setIsSpinning(false), 520);
  }, []);

  function startAutoRotate() {
    if (rotateRef.current) clearInterval(rotateRef.current);
    if (!kpis) return;
    rotateRef.current = setInterval(() => {
      triggerSpin();
      setSlide((s) => ((s + 1) % SLIDE_COUNT) as SlideKey);
    }, SLIDE_ROTATE_MS);
  }

  useEffect(() => {
    startAutoRotate();
    return () => {
      if (rotateRef.current) clearInterval(rotateRef.current);
      if (spinTimeoutRef.current) clearTimeout(spinTimeoutRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kpis]);

  function handleSlideClick(s: SlideKey) {
    if (s !== slide) triggerSpin();
    setSlide(s);
    startAutoRotate();
  }

  const slideEstados = kpis ? (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 h-full min-h-0 w-full">
      <KpiCard variant="compact" immersive={isDark} label="Pendientes" value={kpis.pendientes} icon={<Clock size={18} />} colorName="amber" bgColor="bg-gradient-to-br from-amber-100/70 via-amber-50/50 to-white" />
      <KpiCard variant="compact" immersive={isDark} label="Aprobadas" value={kpis.aprobadas} icon={<CheckCircle size={18} />} colorName="emerald" bgColor="bg-gradient-to-br from-emerald-100/70 via-emerald-50/50 to-white" />
      <KpiCard variant="compact" immersive={isDark} label="Destacadas" value={kpis.destacadas} icon={<Star size={18} />} colorName="violet" bgColor="bg-gradient-to-br from-violet-200/60 via-fuchsia-50/40 to-white" />
      <KpiCard variant="compact" immersive={isDark} label="Rechazadas" value={kpis.rechazadas} icon={<XCircle size={18} />} colorName="red" bgColor="bg-gradient-to-br from-red-100/60 via-red-50/40 to-white" />
    </div>
  ) : null;

  const slideEvolucion = (
    <div
      className={cn(
        "h-full min-h-0 w-full rounded-2xl px-3 py-2 flex flex-col overflow-hidden",
        isDark
          ? "bg-slate-900 border border-slate-700"
          : "bg-gradient-to-br from-violet-100/50 via-white to-indigo-100/40 border-2 border-violet-200/60 shadow-md shadow-violet-500/10",
      )}
    >
      <div className="flex-1 min-h-0 w-full">
        {hasEvolucion ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={evolucion} margin={{ top: 0, right: 8, bottom: 0, left: -30 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "#334155" : "#e2e8f0"} />
              <XAxis dataKey="fecha" tick={{ fill: "#94a3b8", fontSize: 9, fontWeight: 800 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 9 }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="aprobadas" name="Aprob." stroke="#8b5cf6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="total" name="Total" stroke="#cbd5e1" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Sin datos</span>
          </div>
        )}
      </div>
    </div>
  );

  const slideRendimiento = kpis ? (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 h-full min-h-0 w-full">
      <KpiCard variant="compact" immersive={isDark} label="PDVs exhibidos" value={kpis.total} icon={<Store size={18} />} colorName="blue" bgColor="bg-gradient-to-br from-blue-100/70 via-blue-50/50 to-white" tooltip="Total de puntos de venta con ≥1 exhibición lógica en el período" />
      <KpiCard variant="compact" immersive={isDark} label="Tasa aprob." value={tasaAprobacion ?? 0} icon={<TrendingUp size={18} />} colorName="emerald" bgColor="bg-gradient-to-br from-emerald-100/70 via-emerald-50/50 to-white" suffix="%" tooltip="Aprobadas / (Aprobadas + Rechazadas)" />
      <KpiCard variant="compact" immersive={isDark} label="Vend. activos" value={kpis.vendedores_activos ?? 0} icon={<Users size={18} />} colorName="violet" bgColor="bg-gradient-to-br from-violet-200/60 via-fuchsia-50/40 to-white" tooltip="Vendedores ERP con ≥1 exhibición lógica en el período" />
      <KpiCard variant="compact" immersive={isDark} label="Exhib./vendedor" value={kpis.exhibiciones_por_vendedor ?? 0} icon={<BarChart2 size={18} />} colorName="amber" bgColor="bg-gradient-to-br from-amber-100/70 via-amber-50/50 to-white" isDecimal tooltip="Promedio de exhibiciones lógicas por vendedor activo" />
    </div>
  ) : null;

  if (loading && !kpis) {
    return (
      <div className="flex items-stretch gap-2 md:gap-3 shrink-0">
        <div className={cn("flex flex-col items-center justify-center gap-2 shrink-0", SLIDE_HEIGHT_CLASS)}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-1.5 w-1.5 rounded-full" />
          ))}
        </div>
        <div className={cn("flex-1 min-w-0 grid grid-cols-4 gap-2 md:gap-3", SLIDE_HEIGHT_CLASS)}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-full w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-stretch gap-2 md:gap-3 shrink-0 min-w-0">
      <SlideNav slide={slide} isDark={isDark} onSelect={handleSlideClick} />

      {/* Ventana tragaperras — carrete vertical */}
      <div
        className={cn(
          "flex-1 min-w-0 relative overflow-hidden rounded-2xl",
          SLIDE_HEIGHT_CLASS,
          isDark ? "bg-slate-950/40" : "bg-white/30",
        )}
      >
        <motion.div
          className="w-full will-change-transform"
          style={{ height: `${SLIDE_COUNT * 100}%` }}
          animate={{
            y: reelOffset,
            filter: isSpinning ? "blur(3px)" : "blur(0px)",
            scale: isSpinning ? 0.985 : 1,
          }}
          transition={SLOT_TRANSITION}
        >
          <div className="h-1/3 w-full flex items-stretch box-border px-0">
            {slideEstados}
          </div>
          <div className="h-1/3 w-full flex items-stretch box-border">
            {slideEvolucion}
          </div>
          <div className="h-1/3 w-full flex items-stretch box-border">
            {slideRendimiento}
          </div>
        </motion.div>

        {/* Brillo superior/inferior — máscara de ventana */}
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 h-3 z-10",
            isDark
              ? "bg-gradient-to-b from-slate-950/50 to-transparent"
              : "bg-gradient-to-b from-violet-50/80 to-transparent",
          )}
          aria-hidden
        />
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 h-3 z-10",
            isDark
              ? "bg-gradient-to-t from-slate-950/50 to-transparent"
              : "bg-gradient-to-t from-indigo-50/80 to-transparent",
          )}
          aria-hidden
        />
      </div>
    </div>
  );
}
