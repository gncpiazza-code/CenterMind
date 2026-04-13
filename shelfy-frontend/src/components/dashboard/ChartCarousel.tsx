"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { type SucursalStats, type EvolucionTiempo, type RendimientoCiudad } from '@/lib/api';

interface ChartCarouselProps {
  sucursales: SucursalStats[];
  evolucion: EvolucionTiempo[];
  ciudades: RendimientoCiudad[];
  empresas?: RendimientoCiudad[];
}

type ChartTab = "evolucion" | "sucursales" | "ciudades" | "empresas";

function CustomTooltip({ active, payload, label }: {
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
    <div className="flex-1 flex items-center justify-center">
      <span className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">{message}</span>
    </div>
  );
}

// Mejora #13: Skeleton coherente mientras monta
function ChartSkeleton() {
  return (
    <div className="flex flex-col gap-3 flex-1">
      <div className="flex items-center gap-2">
        {[72, 88, 68, 60].map((w, i) => (
          <Skeleton key={i} className="h-7 rounded-xl" style={{ width: w }} />
        ))}
      </div>
      <Skeleton className="h-1 w-8 rounded-full" />
      <div className="flex-1 flex items-end gap-2 pb-3 min-h-[160px]">
        {[55, 80, 42, 68, 88, 50, 72, 62, 78, 45].map((h, i) => (
          <Skeleton key={i} className="flex-1 rounded-t-lg" style={{ height: `${h}%` }} />
        ))}
      </div>
      <Skeleton className="h-3 w-3/4 rounded-md" />
    </div>
  );
}

const ACCENT_COLORS: Record<ChartTab, string> = {
  evolucion:  "bg-violet-500",
  sucursales: "bg-emerald-500",
  ciudades:   "bg-blue-500",
  empresas:   "bg-fuchsia-500",
};

export function ChartCarousel({ evolucion, sucursales, ciudades, empresas = [] }: ChartCarouselProps) {
  const [isMounted, setIsMounted] = useState(false);
  // Mejora #12: tab controlado para AnimatePresence
  const [activeChart, setActiveChart] = useState<ChartTab>("evolucion");

  useEffect(() => { setIsMounted(true); }, []);

  // Mejora #13: Skeleton real mientras no hay hydration
  if (!isMounted) {
    return (
      <Card className="p-5 border-slate-200/60 shadow-sm overflow-hidden min-h-[280px] flex flex-col bg-white rounded-[2rem]">
        <ChartSkeleton />
      </Card>
    );
  }

  const tabs: { key: ChartTab; label: string }[] = [
    { key: "evolucion",  label: "Evolución" },
    { key: "sucursales", label: "Sucursales" },
    { key: "ciudades",   label: "Ciudades" },
    ...(empresas.length > 0 ? [{ key: "empresas" as ChartTab, label: "Empresas" }] : []),
  ];

  const sucursalesData = sucursales.map((s) => ({ nombre: s.sucursal, aprobadas: s.aprobadas, total: s.total }));
  const ciudadesData   = ciudades.map((c)   => ({ nombre: c.ciudad,   aprobadas: c.aprobadas, total: c.total }));
  const empresasData   = empresas.map((e)   => ({ nombre: e.ciudad,   aprobadas: e.aprobadas, total: e.total }));

  const chartProps = { margin: { top: 5, right: 10, bottom: 0, left: -25 } };

  return (
    // Mejora #2: sin h-[350px] fija — min-h + flex-1 del contenedor padre
    <Card className="p-5 border-slate-200/60 shadow-sm overflow-hidden min-h-[280px] flex flex-col bg-white rounded-[2rem]">

      {/* Mejora #12: shadcn <Tabs> en lugar de botones custom */}
      <Tabs
        value={activeChart}
        onValueChange={(v) => setActiveChart(v as ChartTab)}
        className="flex flex-col flex-1 min-h-0"
      >
        <div className="flex items-center gap-3 mb-2 shrink-0">
          <TabsList className="h-8 bg-slate-50 border border-slate-100/80 rounded-xl p-0.5 gap-0.5">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.key}
                value={tab.key}
                className={cn(
                  "h-7 px-3 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all duration-200",
                  "data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900",
                  "data-[state=inactive]:text-slate-400 data-[state=inactive]:hover:text-slate-600"
                )}
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* Acento de color que cambia con el tab activo */}
        <div className={cn("h-0.5 w-8 rounded-full mb-3 shrink-0 transition-all duration-300", ACCENT_COLORS[activeChart])} />

        <div className="flex-1 min-h-[180px] relative">
          <AnimatePresence mode="wait">

            <TabsContent value="evolucion" className="absolute inset-0 mt-0 data-[state=active]:flex data-[state=active]:flex-col">
              <motion.div key="evolucion" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }} className="flex-1 h-full w-full">
                {evolucion.length === 0 ? <EmptyChart message="Sin datos de evolución" /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={evolucion} {...chartProps}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="fecha" tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 800 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }} tickLine={false} axisLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', paddingTop: 8 }} />
                      <Line type="monotone" dataKey="total" name="Enviadas" stroke="#cbd5e1" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                      <Line type="monotone" dataKey="aprobadas" name="Aprobadas" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 3, fill: "#8b5cf6", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 5, strokeWidth: 0 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </motion.div>
            </TabsContent>

            <TabsContent value="sucursales" className="absolute inset-0 mt-0 data-[state=active]:flex data-[state=active]:flex-col">
              <motion.div key="sucursales" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }} className="flex-1 h-full w-full">
                {sucursalesData.length === 0 ? <EmptyChart message="Sin datos de sucursales" /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sucursalesData} {...chartProps}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="nombre" tick={{ fill: "#94a3b8", fontSize: 9, fontWeight: 800 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }} tickLine={false} axisLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="aprobadas" name="Aprobadas" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={40} />
                      <Bar dataKey="total"     name="Total"     fill="#e2e8f0" radius={[6, 6, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </motion.div>
            </TabsContent>

            <TabsContent value="ciudades" className="absolute inset-0 mt-0 data-[state=active]:flex data-[state=active]:flex-col">
              <motion.div key="ciudades" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }} className="flex-1 h-full w-full">
                {ciudadesData.length === 0 ? <EmptyChart message="Sin datos de ciudades" /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ciudadesData} {...chartProps}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="nombre" tick={{ fill: "#94a3b8", fontSize: 9, fontWeight: 800 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }} tickLine={false} axisLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="aprobadas" name="Aprobadas" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={40} />
                      <Bar dataKey="total"     name="Total"     fill="#e2e8f0" radius={[6, 6, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </motion.div>
            </TabsContent>

            {empresas.length > 0 && (
              <TabsContent value="empresas" className="absolute inset-0 mt-0 data-[state=active]:flex data-[state=active]:flex-col">
                <motion.div key="empresas" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }} className="flex-1 h-full w-full">
                  {empresasData.length === 0 ? <EmptyChart message="Sin datos de empresas" /> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={empresasData} {...chartProps}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="nombre" tick={{ fill: "#94a3b8", fontSize: 9, fontWeight: 800 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }} tickLine={false} axisLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="aprobadas" name="Aprobadas" fill="#a855f7" radius={[6, 6, 0, 0]} maxBarSize={40} />
                        <Bar dataKey="total"     name="Total"     fill="#e2e8f0" radius={[6, 6, 0, 0]} maxBarSize={40} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </motion.div>
              </TabsContent>
            )}

          </AnimatePresence>
        </div>
      </Tabs>
    </Card>
  );
}
