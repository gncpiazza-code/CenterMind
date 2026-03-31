import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid 
} from 'recharts';
import { Card } from '@/components/ui/Card';
import { type SucursalStats, type EvolucionTiempo, type RendimientoCiudad } from '@/lib/api';

interface ChartCarouselProps {
  sucursales: SucursalStats[];
  evolucion: EvolucionTiempo[];
  ciudades: RendimientoCiudad[];
  empresas?: RendimientoCiudad[];
}

export function ChartCarousel({ evolucion }: ChartCarouselProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted || evolucion.length === 0) return (
    <Card className="p-6 border-slate-200/60 shadow-sm relative overflow-hidden h-[350px] flex flex-col group bg-white rounded-[2rem] items-center justify-center">
      <span className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Sin datos de evolución para gráficos</span>
    </Card>
  );

  return (
    <Card className="p-6 border-slate-200/60 shadow-sm relative overflow-hidden h-[350px] flex flex-col group bg-white rounded-[2rem]">
      <AnimatePresence mode="wait">
        <motion.div
          key="evolucion"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: "circOut" }}
          className="flex-1 w-full h-full flex flex-col"
        >
          <div className="mb-6">
            <h3 className="text-slate-900 font-black text-sm uppercase tracking-widest opacity-80">Evolución de Fotos</h3>
            <div className="h-1 w-12 bg-blue-500 rounded-full mt-1.5" />
          </div>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={evolucion} margin={{ top: 10, right: 10, bottom: 0, left: -25 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f8fafc" />
                <XAxis dataKey="fecha" tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 800 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: "rgba(255,255,255,0.9)", backdropFilter: "blur(12px)", border: "1px solid #f1f5f9", borderRadius: 16, boxShadow: "0 20px 25px -5px rgba(0,0,0,0.05)" }}
                  labelStyle={{ color: "#0f172a", fontWeight: 900, marginBottom: 4 }}
                  itemStyle={{ fontWeight: 700, fontSize: 11 }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', paddingTop: 10 }} />
                <Line type="monotone" dataKey="total" name="Enviadas" stroke="#cbd5e1" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                <Line type="monotone" dataKey="aprobadas" name="Aprobadas" stroke="#3b82f6" strokeWidth={4} dot={{ r: 4, fill: "#3b82f6", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 6, strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </AnimatePresence>
    </Card>
  );
}
