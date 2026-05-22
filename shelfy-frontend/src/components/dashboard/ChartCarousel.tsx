"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { SucursalStats, EvolucionTiempo, VendedorRanking } from "@/lib/api";

interface ChartCarouselProps {
  sucursales: SucursalStats[];
  evolucion: EvolucionTiempo[];
  ranking: VendedorRanking[];
  /** Rotación automática entre pestañas con datos (cada ~8s) */
  autoRotate?: boolean;
}

type ChartTab = "evolucion" | "sucursales" | "vendedores";

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur-md border border-slate-200/60 rounded-2xl p-3 shadow-xl">
      <p className="text-xs font-black text-slate-800 mb-1.5">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="text-xs font-bold" style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[220px]">
      <span className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">{message}</span>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="flex flex-col gap-3 flex-1">
      <div className="flex items-center gap-2">
        {[88, 100, 92].map((w, i) => (
          <Skeleton key={i} className="h-7 rounded-xl" style={{ width: w }} />
        ))}
      </div>
      <Skeleton className="h-1 w-8 rounded-full" />
      <div className="flex-1 flex items-end gap-2 pb-3 min-h-[200px]">
        {[55, 80, 42, 68, 88, 50, 72, 62, 78, 45].map((h, i) => (
          <Skeleton key={i} className="flex-1 rounded-t-lg" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

const ACCENT_COLORS: Record<ChartTab, string> = {
  evolucion: "bg-violet-500",
  sucursales: "bg-emerald-500",
  vendedores: "bg-blue-500",
};

const ROTATE_MS = 8000;

export function ChartCarousel({
  evolucion,
  sucursales,
  ranking,
  autoRotate = true,
}: ChartCarouselProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [activeChart, setActiveChart] = useState<ChartTab>("evolucion");

  const sucursalesData = useMemo(
    () => sucursales.map((s) => ({ nombre: s.sucursal, aprobadas: s.aprobadas, total: s.total })),
    [sucursales],
  );

  const vendedoresData = useMemo(
    () =>
      [...ranking]
        .sort((a, b) => b.puntos - a.puntos)
        .slice(0, 14)
        .map((v) => {
          const nombre =
            v.vendedor.length > 14 ? `${v.vendedor.slice(0, 14)}…` : v.vendedor;
          const total = v.aprobadas + v.rechazadas;
          return { nombre, aprobadas: v.aprobadas, total, puntos: v.puntos };
        }),
    [ranking],
  );

  const tabsWithData = useMemo(() => {
    const all: { key: ChartTab; label: string }[] = [
      { key: "evolucion", label: "Evolución" },
      { key: "sucursales", label: "Sucursales" },
      { key: "vendedores", label: "Vendedores" },
    ];
    return all.filter((t) => {
      if (t.key === "evolucion") return evolucion.length > 0;
      if (t.key === "sucursales") return sucursalesData.length > 0;
      if (t.key === "vendedores") return vendedoresData.length > 0;
      return false;
    });
  }, [evolucion.length, sucursalesData.length, vendedoresData.length]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (tabsWithData.length === 0) return;
    if (!tabsWithData.some((t) => t.key === activeChart)) {
      setActiveChart(tabsWithData[0].key);
    }
  }, [tabsWithData, activeChart]);

  const goNext = useCallback(() => {
    if (tabsWithData.length <= 1) return;
    const idx = tabsWithData.findIndex((t) => t.key === activeChart);
    const next = tabsWithData[(idx + 1) % tabsWithData.length];
    setActiveChart(next.key);
  }, [tabsWithData, activeChart]);

  useEffect(() => {
    if (!autoRotate || tabsWithData.length <= 1) return;
    const id = setInterval(goNext, ROTATE_MS);
    return () => clearInterval(id);
  }, [autoRotate, tabsWithData.length, goNext]);

  if (!isMounted) {
    return (
      <Card className="p-5 border-slate-200/60 shadow-sm overflow-hidden min-h-[320px] flex flex-col bg-white rounded-[2rem]">
        <ChartSkeleton />
      </Card>
    );
  }

  const chartProps = { margin: { top: 5, right: 10, bottom: 0, left: -25 } };

  return (
    <Card className="p-5 border-slate-200/60 shadow-sm overflow-hidden min-h-[320px] flex flex-col bg-white rounded-[2rem]">
      <div className="flex items-center justify-between gap-3 mb-2 shrink-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(["evolucion", "sucursales", "vendedores"] as ChartTab[]).map((key) => {
            const tab = { evolucion: "Evolución", sucursales: "Sucursales", vendedores: "Vendedores" }[key];
            const hasData = tabsWithData.some((t) => t.key === key);
            const isActive = activeChart === key;
            return (
              <button
                key={key}
                type="button"
                disabled={!hasData}
                onClick={() => hasData && setActiveChart(key)}
                className={cn(
                  "h-8 px-3.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all duration-200",
                  isActive && hasData
                    ? "bg-slate-900 text-white shadow-md"
                    : hasData
                      ? "bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                      : "bg-slate-50/50 text-slate-300 cursor-not-allowed",
                )}
              >
                {tab}
              </button>
            );
          })}
        </div>
        {tabsWithData.length > 1 && autoRotate && (
          <div className="flex items-center gap-1 shrink-0">
            {tabsWithData.map((t) => (
              <button
                key={t.key}
                type="button"
                aria-label={t.label}
                onClick={() => setActiveChart(t.key)}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  activeChart === t.key ? "w-5 bg-violet-500" : "w-1.5 bg-slate-300",
                )}
              />
            ))}
          </div>
        )}
      </div>

      <div
        className={cn(
          "h-0.5 w-10 rounded-full mb-3 shrink-0 transition-all duration-300",
          tabsWithData.length > 0 ? ACCENT_COLORS[activeChart] : "bg-slate-200",
        )}
      />

      <div className="flex-1 min-h-[240px] relative">
        {tabsWithData.length === 0 ? (
          <EmptyChart message="Sin datos para gráficos en este período" />
        ) : (
          <AnimatePresence mode="wait">
            {activeChart === "evolucion" && (
              <motion.div
                key="evolucion"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="absolute inset-0 flex flex-col"
              >
                {evolucion.length === 0 ? (
                  <EmptyChart message="Sin datos de evolución" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%" minHeight={240}>
                    <LineChart data={evolucion} {...chartProps}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis
                        dataKey="fecha"
                        tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 800 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend
                        iconType="circle"
                        wrapperStyle={{
                          fontSize: 10,
                          fontWeight: 800,
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                          paddingTop: 8,
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="total"
                        name="Enviadas"
                        stroke="#cbd5e1"
                        strokeWidth={2}
                        dot={false}
                        strokeDasharray="5 5"
                      />
                      <Line
                        type="monotone"
                        dataKey="aprobadas"
                        name="Aprobadas"
                        stroke="#8b5cf6"
                        strokeWidth={3}
                        dot={{ r: 3, fill: "#8b5cf6", strokeWidth: 2, stroke: "#fff" }}
                        activeDot={{ r: 5, strokeWidth: 0 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </motion.div>
            )}

            {activeChart === "sucursales" && (
              <motion.div
                key="sucursales"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="absolute inset-0 flex flex-col"
              >
                {sucursalesData.length === 0 ? (
                  <EmptyChart message="Sin datos de sucursales" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%" minHeight={240}>
                    <BarChart data={sucursalesData} {...chartProps}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis
                        dataKey="nombre"
                        tick={{ fill: "#94a3b8", fontSize: 9, fontWeight: 800 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar
                        dataKey="aprobadas"
                        name="Aprobadas"
                        fill="#10b981"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={40}
                      />
                      <Bar
                        dataKey="total"
                        name="Total"
                        fill="#e2e8f0"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={40}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </motion.div>
            )}

            {activeChart === "vendedores" && (
              <motion.div
                key="vendedores"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="absolute inset-0 flex flex-col"
              >
                {vendedoresData.length === 0 ? (
                  <EmptyChart message="Sin datos de vendedores" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%" minHeight={240}>
                    <BarChart data={vendedoresData} layout="vertical" {...chartProps}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                      <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }} />
                      <YAxis
                        type="category"
                        dataKey="nombre"
                        width={88}
                        tick={{ fill: "#94a3b8", fontSize: 9, fontWeight: 800 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar
                        dataKey="aprobadas"
                        name="Aprobadas"
                        fill="#3b82f6"
                        radius={[0, 6, 6, 0]}
                        maxBarSize={22}
                      />
                      <Bar
                        dataKey="puntos"
                        name="Puntos"
                        fill="#c7d2fe"
                        radius={[0, 6, 6, 0]}
                        maxBarSize={22}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </Card>
  );
}
