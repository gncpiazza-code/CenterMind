"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  isImmersive?: boolean;
}

type SlideKey = 0 | 1 | 2;
const SLIDE_LABELS = ["Estados", "Evolución", "Rendimiento"];
const SLIDE_ROTATE_MS = 8000;

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

export function DashboardKpiCarousel({
  kpis,
  evolucion,
  loading = false,
  isImmersive = false,
}: DashboardKpiCarouselProps) {
  const [slide, setSlide] = useState<SlideKey>(0);
  const rotateRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tasaAprobacion = kpis && (kpis.aprobadas + kpis.rechazadas) > 0
    ? Math.round((kpis.aprobadas / (kpis.aprobadas + kpis.rechazadas)) * 100)
    : null;

  const hasEvolucion = evolucion.length > 0;

  function startAutoRotate() {
    if (rotateRef.current) clearInterval(rotateRef.current);
    if (!kpis) return;
    rotateRef.current = setInterval(() => {
      setSlide((s) => ((s + 1) % 3) as SlideKey);
    }, SLIDE_ROTATE_MS);
  }

  useEffect(() => {
    startAutoRotate();
    return () => {
      if (rotateRef.current) clearInterval(rotateRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kpis]);

  function handleSlideClick(s: SlideKey) {
    setSlide(s);
    startAutoRotate();
  }

  if (loading && !kpis) {
    return (
      <div className="grid grid-cols-4 gap-2 md:gap-3 shrink-0">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="shrink-0">
      {/* Slide nav dots */}
      <div className="flex items-center justify-between mb-2">
        <p className={cn(
          "text-[10px] font-black uppercase tracking-widest min-h-4",
          isImmersive ? "text-slate-500" : "text-violet-600/80",
        )}>
          {SLIDE_LABELS[slide]}
        </p>
        <div className="flex items-center gap-1.5">
          {([0, 1, 2] as SlideKey[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleSlideClick(s)}
              aria-label={SLIDE_LABELS[s]}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                slide === s ? (isImmersive ? "bg-slate-400 w-5" : "bg-violet-500 w-5") : (isImmersive ? "w-1.5 bg-slate-600 hover:bg-slate-500" : "w-1.5 bg-slate-300 hover:bg-slate-400"),
              )}
            />
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* ── Slide 0: Estados ── */}
        {slide === 0 && kpis && (
          <motion.div
            key="slide-0"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3"
          >
            <KpiCard variant="compact" immersive={isImmersive} label="Pendientes"  value={kpis.pendientes}  icon={<Clock size={18} />}        colorName="amber"   bgColor="bg-gradient-to-br from-amber-100/70 via-amber-50/50 to-white" />
            <KpiCard variant="compact" immersive={isImmersive} label="Aprobadas"   value={kpis.aprobadas}   icon={<CheckCircle size={18} />}  colorName="emerald" bgColor="bg-gradient-to-br from-emerald-100/70 via-emerald-50/50 to-white" />
            <KpiCard variant="compact" immersive={isImmersive} label="Destacadas"  value={kpis.destacadas}  icon={<Star size={18} />}         colorName="violet"  bgColor="bg-gradient-to-br from-violet-200/60 via-fuchsia-50/40 to-white" />
            <KpiCard variant="compact" immersive={isImmersive} label="Rechazadas"  value={kpis.rechazadas}  icon={<XCircle size={18} />}      colorName="red"     bgColor="bg-gradient-to-br from-red-100/60 via-red-50/40 to-white" />
          </motion.div>
        )}

        {/* ── Slide 1: Evolución ── */}
        {slide === 1 && (
          <motion.div
            key="slide-1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
            className={cn(
              "h-[140px] rounded-2xl p-3 relative overflow-hidden",
              isImmersive
                ? "bg-slate-900 border border-slate-700"
                : "bg-gradient-to-br from-violet-100/50 via-white to-indigo-100/40 border-2 border-violet-200/60 shadow-md shadow-violet-500/10",
            )}
          >
            <p className={cn(
              "text-[9px] font-black uppercase tracking-widest mb-1",
              isImmersive ? "text-slate-400" : "text-slate-400",
            )}>
              Evolución
            </p>
            {hasEvolucion ? (
              <ResponsiveContainer width="100%" height="85%">
                <LineChart data={evolucion} margin={{ top: 0, right: 8, bottom: 0, left: -30 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isImmersive ? "#334155" : "#e2e8f0"} />
                  <XAxis dataKey="fecha" tick={{ fill: "#94a3b8", fontSize: 9, fontWeight: 800 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 9 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="aprobadas" name="Aprob." stroke="#8b5cf6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="total" name="Total" stroke="#cbd5e1" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[85%]">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Sin datos</span>
              </div>
            )}
          </motion.div>
        )}

        {/* ── Slide 2: Rendimiento ── */}
        {slide === 2 && kpis && (
          <motion.div
            key="slide-2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3"
          >
            <KpiCard
              variant="compact"
              immersive={isImmersive}
              label="PDVs exhibidos"
              value={kpis.total}
              icon={<Store size={18} />}
              colorName="blue"
              bgColor="bg-gradient-to-br from-blue-100/70 via-blue-50/50 to-white"
              tooltip="Total de puntos de venta con ≥1 exhibición lógica en el período"
            />
            <KpiCard
              variant="compact"
              immersive={isImmersive}
              label="Tasa aprob."
              value={tasaAprobacion ?? 0}
              icon={<TrendingUp size={18} />}
              colorName="emerald"
              bgColor="bg-gradient-to-br from-emerald-100/70 via-emerald-50/50 to-white"
              suffix="%"
              tooltip="Aprobadas / (Aprobadas + Rechazadas)"
            />
            <KpiCard
              variant="compact"
              immersive={isImmersive}
              label="Vend. activos"
              value={kpis.vendedores_activos ?? 0}
              icon={<Users size={18} />}
              colorName="violet"
              bgColor="bg-gradient-to-br from-violet-200/60 via-fuchsia-50/40 to-white"
              tooltip="Vendedores ERP con ≥1 exhibición lógica en el período"
            />
            <KpiCard
              variant="compact"
              immersive={isImmersive}
              label="Exhib./vendedor"
              value={kpis.exhibiciones_por_vendedor ?? 0}
              icon={<BarChart2 size={18} />}
              colorName="amber"
              bgColor="bg-gradient-to-br from-amber-100/70 via-amber-50/50 to-white"
              isDecimal
              tooltip="Promedio de exhibiciones lógicas por vendedor activo"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
