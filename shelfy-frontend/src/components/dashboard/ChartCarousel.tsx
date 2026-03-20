import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid 
} from 'recharts';
import { Card } from '@/components/ui/Card';
import { type SucursalStats, type EvolucionTiempo, type RendimientoCiudad } from '@/lib/api';

interface ChartCarouselProps {
  sucursales: SucursalStats[];
  evolucion: EvolucionTiempo[];
  ciudades: RendimientoCiudad[];
}

export function ChartCarousel({ sucursales, evolucion, ciudades }: ChartCarouselProps) {
  const [slide, setSlide] = useState(0);
  const slidesCount = 3;

  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % slidesCount), 12000);
    return () => clearInterval(t);
  }, []);

  if (sucursales.length <= 1 && evolucion.length === 0) return (
    <Card className="h-full flex items-center justify-center bg-slate-50 border-slate-200 border-dashed border-2">
      <span className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Sin datos suficientes para gráficos</span>
    </Card>
  );

  return (
    <Card className="p-6 border-slate-200/60 shadow-sm relative overflow-hidden h-[350px] flex flex-col group bg-white rounded-[2rem]">
      
      {/* Indicadores */}
      <div className="absolute top-6 right-8 z-20 flex gap-2">
        {[0, 1, 2].map(i => (
          <button 
            key={i} 
            onClick={() => setSlide(i)}
            className={`h-1 rounded-full transition-all duration-500 ${i === slide ? 'w-8 bg-slate-900' : 'w-2 bg-slate-100 hover:bg-slate-200'}`} 
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={slide}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.5, ease: "circOut" }}
          className="flex-1 w-full h-full flex flex-col"
        >
          {slide === 0 && (
            <>
              <div className="mb-6">
                <h3 className="text-slate-900 font-black text-sm uppercase tracking-widest opacity-80">Rendimiento por Sucursal</h3>
                <div className="h-1 w-12 bg-emerald-500 rounded-full mt-1.5" />
              </div>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sucursales} margin={{ top: 10, right: 10, bottom: 0, left: -25 }}>
                    <XAxis dataKey="sucursal" tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 800 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ background: "rgba(255,255,255,0.9)", backdropFilter: "blur(12px)", border: "1px solid #f1f5f9", borderRadius: 16, boxShadow: "0 20px 25px -5px rgba(0,0,0,0.05)" }}
                      labelStyle={{ color: "#0f172a", fontWeight: 900, marginBottom: 4 }}
                      cursor={{ fill: "#f8fafc" }}
                      itemStyle={{ fontWeight: 700, fontSize: 11 }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', paddingTop: 10 }} />
                    <Bar dataKey="aprobadas" name="Aprobadas" stackId="a" fill="#10b981" radius={[0, 0, 4, 4]} barSize={32} />
                    <Bar dataKey="rechazadas" name="Rechazadas" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {slide === 1 && (
            <>
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
            </>
          )}

          {slide === 2 && (
            <>
              <div className="mb-6">
                <h3 className="text-slate-900 font-black text-sm uppercase tracking-widest opacity-80">Rendimiento por Ciudad</h3>
                <div className="h-1 w-12 bg-purple-500 rounded-full mt-1.5" />
              </div>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ciudades.slice(0, 7)} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 10 }}>
                    <XAxis type="number" hide />
                    <YAxis dataKey="ciudad" type="category" tick={{ fill: "#64748b", fontSize: 10, fontWeight: 800 }} tickLine={false} axisLine={false} width={100} />
                    <Tooltip
                      contentStyle={{ background: "rgba(255,255,255,0.9)", backdropFilter: "blur(12px)", border: "1px solid #f1f5f9", borderRadius: 16, boxShadow: "0 20px 25px -5px rgba(0,0,0,0.05)" }}
                      cursor={{ fill: "#f8fafc" }}
                      itemStyle={{ fontWeight: 700, fontSize: 11 }}
                    />
                    <Bar dataKey="aprobadas" name="Aprobadas" fill="#8b5cf6" radius={[0, 8, 8, 0]} barSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
      
      {/* Botones invisibles para adelantar clickeando a los lados */}
      <button onClick={() => setSlide(s => (s === 0 ? 2 : s - 1))} className="absolute left-0 top-0 bottom-0 w-16 z-10 cursor-pointer opacity-0" />
      <button onClick={() => setSlide(s => (s === 2 ? 0 : s + 1))} className="absolute right-0 top-0 bottom-0 w-16 z-10 cursor-pointer opacity-0" />
    </Card>
  );
}
