"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle, XCircle, Star, Clock,
  BarChart2, Users, TrendingUp, Store,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { KpiCard } from "./KpiCard";
import { Skeleton } from "@/components/ui/skeleton";
import type { KPIs, VendedorRanking, EvolucionTiempo } from "@/lib/api";
import { cn } from "@/lib/utils";

interface DashboardKpiCarouselProps {
  kpis: KPIs | undefined;
  ranking: VendedorRanking[];
  evolucion: EvolucionTiempo[];
  loading?: boolean;
}

type SlideKey = 0 | 1 | 2;
const SLIDE_LABELS = ["Estados", "Gráficos", "Rendimiento"];
const CHART_ROTATE_MS = 8000;

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
  ranking,
  evolucion,
  loading = false,
}: DashboardKpiCarouselProps) {
  const [slide, setSlide] = useState<SlideKey>(0);
  const [chartView, setChartView] = useState<"evolucion" | "vendedores">("evolucion");

  const tasaAprobacion = kpis && (kpis.aprobadas + kpis.rechazadas) > 0
    ? Math.round((kpis.aprobadas / (kpis.aprobadas + kpis.rechazadas)) * 100)
    : null;

  const vendedoresData = useMemo(
    () =>
      [...ranking]
        .sort((a, b) => b.puntos - a.puntos)
        .slice(0, 10)
        .map((v) => ({
          nombre: v.vendedor.length > 12 ? `${v.vendedor.slice(0, 12)}…` : v.vendedor,
          puntos: v.puntos,
          aprobadas: v.aprobadas,
        })),
    [ranking],
  );

  const hasEvolucion  = evolucion.length > 0;
  const hasVendedores = vendedoresData.length > 0;

  const goNextChart = useCallback(() => {
    setChartView((prev) => {
      if (prev === "evolucion" && hasVendedores) return "vendedores";
      if (prev === "vendedores" && hasEvolucion) return "evolucion";
      return prev;
    });
  }, [hasEvolucion, hasVendedores]);

  useEffect(() => {
    if (slide !== 1) return;
    if (!hasEvolucion && !hasVendedores) return;
    const id = setInterval(goNextChart, CHART_ROTATE_MS);
    return () => clearInterval(id);
  }, [slide, goNextChart, hasEvolucion, hasVendedores]);

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
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          {SLIDE_LABELS[slide]}
        </p>
        <div className="flex items-center gap-1.5">
          {([0, 1, 2] as SlideKey[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSlide(s)}
              aria-label={SLIDE_LABELS[s]}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                slide === s ? "bg-violet-500 w-5" : "w-1.5 bg-slate-300 hover:bg-slate-400",
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
            <KpiCard variant="compact" label="Pendientes"  value={kpis.pendientes}  icon={<Clock size={16} />}        colorName="amber"   bgColor="bg-white" />
            <KpiCard variant="compact" label="Aprobadas"   value={kpis.aprobadas}   icon={<CheckCircle size={16} />}  colorName="emerald" bgColor="bg-white" />
            <KpiCard variant="compact" label="Destacadas"  value={kpis.destacadas}  icon={<Star size={16} />}         colorName="violet"  bgColor="bg-gradient-to-br from-violet-50/60 to-fuchsia-50/40" />
            <KpiCard variant="compact" label="Rechazadas"  value={kpis.rechazadas}  icon={<XCircle size={16} />}      colorName="red"     bgColor="bg-white" />
          </motion.div>
        )}

        {/* ── Slide 1: Gráficos ── */}
        {slide === 1 && (
          <motion.div
            key="slide-1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
            className="h-[140px] bg-white rounded-2xl border border-slate-200/60 shadow-sm p-3 relative overflow-hidden"
          >
            {/* Chart rotation dots */}
            <div className="absolute top-2.5 right-3 flex items-center gap-1 z-10">
              {(["evolucion", "vendedores"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setChartView(v)}
                  className={cn(
                    "h-1 rounded-full transition-all duration-300",
                    chartView === v ? "w-4 bg-violet-500" : "w-1 bg-slate-300",
                  )}
                />
              ))}
            </div>

            <AnimatePresence mode="wait">
              {chartView === "evolucion" && (
                <motion.div
                  key="ev"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="absolute inset-0 p-3 pt-2"
                >
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Evolución</p>
                  {hasEvolucion ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={evolucion} margin={{ top: 0, right: 8, bottom: 0, left: -30 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="fecha" tick={{ fill: "#94a3b8", fontSize: 9, fontWeight: 800 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fill: "#94a3b8", fontSize: 9 }} tickLine={false} axisLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Line type="monotone" dataKey="aprobadas" name="Aprob." stroke="#8b5cf6" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="total" name="Total" stroke="#cbd5e1" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex-1 flex items-center justify-center h-full">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Sin datos</span>
                    </div>
                  )}
                </motion.div>
              )}

              {chartView === "vendedores" && (
                <motion.div
                  key="vend"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="absolute inset-0 p-3 pt-2"
                >
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Top Vendedores</p>
                  {hasVendedores ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={vendedoresData} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: -10 }}>
                        <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 9 }} tickLine={false} axisLine={false} />
                        <YAxis type="category" dataKey="nombre" width={72} tick={{ fill: "#94a3b8", fontSize: 8, fontWeight: 800 }} tickLine={false} axisLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="puntos" name="Puntos" fill="#8b5cf6" radius={[0, 4, 4, 0]} maxBarSize={14} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex-1 flex items-center justify-center h-full">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Sin datos</span>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
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
              label="PDVs exhibidos"
              value={kpis.total}
              icon={<Store size={16} />}
              colorName="blue"
              bgColor="bg-white"
              tooltip="Total de puntos de venta con ≥1 exhibición lógica en el período"
            />
            <KpiCard
              variant="compact"
              label="Tasa aprob."
              value={tasaAprobacion ?? 0}
              icon={<TrendingUp size={16} />}
              colorName="emerald"
              bgColor="bg-white"
              suffix="%"
              tooltip="Aprobadas / (Aprobadas + Rechazadas)"
            />
            <KpiCard
              variant="compact"
              label="Vend. activos"
              value={kpis.vendedores_activos ?? 0}
              icon={<Users size={16} />}
              colorName="violet"
              bgColor="bg-gradient-to-br from-violet-50/60 to-fuchsia-50/40"
              tooltip="Vendedores ERP con ≥1 exhibición lógica en el período"
            />
            <KpiCard
              variant="compact"
              label="Exhib./vendedor"
              value={kpis.exhibiciones_por_vendedor ?? 0}
              icon={<BarChart2 size={16} />}
              colorName="amber"
              bgColor="bg-white"
              isDecimal
              tooltip="Promedio de exhibiciones lógicas por vendedor activo"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
