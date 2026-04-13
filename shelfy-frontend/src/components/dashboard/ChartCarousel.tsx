"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { type SucursalStats, type EvolucionTiempo, type RendimientoCiudad } from '@/lib/api';

interface ChartCarouselProps {
  sucursales: SucursalStats[];
  evolucion: EvolucionTiempo[];
  ciudades: RendimientoCiudad[];
  empresas?: RendimientoCiudad[];
}

type ChartTab = "evolucion" | "sucursales" | "ciudades" | "empresas";

// Mejora #16: CustomTooltip con glass style
function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/90 backdrop-blur-md border border-[var(--shelfy-border,#e2e8f0)] rounded-2xl p-3 shadow-xl">
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
    <div className="flex-1 flex items-center justify-center">
      <span className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">{message}</span>
    </div>
  );
}

export function ChartCarousel({ evolucion, sucursales, ciudades, empresas = [] }: ChartCarouselProps) {
  const [isMounted, setIsMounted] = useState(false);
  // Mejora #15: Tab activo entre 4 charts
  const [activeChart, setActiveChart] = useState<ChartTab>("evolucion");

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return (
    <Card className="p-6 border-slate-200/60 shadow-sm relative overflow-hidden h-[350px] flex flex-col group bg-white rounded-[2rem] items-center justify-center">
      <span className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Cargando gráficos...</span>
    </Card>
  );

  // Construir tabs disponibles
  const tabs: { key: ChartTab; label: string }[] = [
    { key: "evolucion", label: "Evolución" },
    { key: "sucursales", label: "Sucursales" },
    { key: "ciudades", label: "Ciudades" },
    ...(empresas.length > 0 ? [{ key: "empresas" as ChartTab, label: "Empresas" }] : []),
  ];

  // Adaptar datos de sucursales para recharts
  const sucursalesData = sucursales.map((s) => ({
    nombre: s.sucursal,
    aprobadas: s.aprobadas,
    total: s.total,
  }));

  const ciudadesData = ciudades.map((c) => ({
    nombre: c.ciudad,
    aprobadas: c.aprobadas,
    total: c.total,
  }));

  const empresasData = empresas.map((e) => ({
    nombre: e.ciudad,
    aprobadas: e.aprobadas,
    total: e.total,
  }));

  return (
    <Card className="p-6 border-slate-200/60 shadow-sm relative overflow-hidden h-[350px] flex flex-col group bg-white rounded-[2rem]">

      {/* Mejora #15: Tab pills horizontales */}
      <div className="flex items-center gap-2 mb-4 shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveChart(tab.key)}
            className={cn(
              "px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
              activeChart === tab.key
                ? "bg-violet-600 text-white shadow-sm"
                : "bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Charts con AnimatePresence */}
      <div className="flex-1 min-h-0 flex flex-col">
        <AnimatePresence mode="wait">
          {activeChart === "evolucion" && (
            <motion.div
              key="evolucion"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="flex-1 w-full h-full flex flex-col"
            >
              <div className="mb-3">
                <h3 className="text-slate-900 font-black text-sm uppercase tracking-widest opacity-80">Evolución de Fotos</h3>
                <div className="h-1 w-12 bg-violet-500 rounded-full mt-1.5" />
              </div>
              {evolucion.length === 0 ? (
                <EmptyChart message="Sin datos de evolución" />
              ) : (
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={evolucion} margin={{ top: 10, right: 10, bottom: 0, left: -25 }}>
                      {/* Mejora #17: CartesianGrid coherente */}
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="fecha" tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 800 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }} tickLine={false} axisLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', paddingTop: 10 }} />
                      <Line type="monotone" dataKey="total" name="Enviadas" stroke="#cbd5e1" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                      <Line type="monotone" dataKey="aprobadas" name="Aprobadas" stroke="#8b5cf6" strokeWidth={4} dot={{ r: 4, fill: "#8b5cf6", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 6, strokeWidth: 0 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </motion.div>
          )}

          {activeChart === "sucursales" && (
            <motion.div
              key="sucursales"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="flex-1 w-full h-full flex flex-col"
            >
              <div className="mb-3">
                <h3 className="text-slate-900 font-black text-sm uppercase tracking-widest opacity-80">Por Sucursal</h3>
                <div className="h-1 w-12 bg-emerald-500 rounded-full mt-1.5" />
              </div>
              {sucursalesData.length === 0 ? (
                <EmptyChart message="Sin datos de sucursales" />
              ) : (
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sucursalesData} margin={{ top: 5, right: 10, bottom: 0, left: -25 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="nombre" tick={{ fill: "#94a3b8", fontSize: 9, fontWeight: 800 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }} tickLine={false} axisLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="aprobadas" name="Aprobadas" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={40} />
                      <Bar dataKey="total" name="Total" fill="#e2e8f0" radius={[6, 6, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </motion.div>
          )}

          {activeChart === "ciudades" && (
            <motion.div
              key="ciudades"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="flex-1 w-full h-full flex flex-col"
            >
              <div className="mb-3">
                <h3 className="text-slate-900 font-black text-sm uppercase tracking-widest opacity-80">Por Ciudad</h3>
                <div className="h-1 w-12 bg-blue-500 rounded-full mt-1.5" />
              </div>
              {ciudadesData.length === 0 ? (
                <EmptyChart message="Sin datos de ciudades" />
              ) : (
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ciudadesData} margin={{ top: 5, right: 10, bottom: 0, left: -25 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="nombre" tick={{ fill: "#94a3b8", fontSize: 9, fontWeight: 800 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }} tickLine={false} axisLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="aprobadas" name="Aprobadas" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={40} />
                      <Bar dataKey="total" name="Total" fill="#e2e8f0" radius={[6, 6, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </motion.div>
          )}

          {activeChart === "empresas" && empresas.length > 0 && (
            <motion.div
              key="empresas"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="flex-1 w-full h-full flex flex-col"
            >
              <div className="mb-3">
                <h3 className="text-slate-900 font-black text-sm uppercase tracking-widest opacity-80">Por Empresa</h3>
                <div className="h-1 w-12 bg-fuchsia-500 rounded-full mt-1.5" />
              </div>
              {empresasData.length === 0 ? (
                <EmptyChart message="Sin datos de empresas" />
              ) : (
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={empresasData} margin={{ top: 5, right: 10, bottom: 0, left: -25 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="nombre" tick={{ fill: "#94a3b8", fontSize: 9, fontWeight: 800 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }} tickLine={false} axisLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="aprobadas" name="Aprobadas" fill="#a855f7" radius={[6, 6, 0, 0]} maxBarSize={40} />
                      <Bar dataKey="total" name="Total" fill="#e2e8f0" radius={[6, 6, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Card>
  );
}
