"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { PageSpinner } from "@/components/ui/Spinner";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState, useCallback } from "react";
import {
  fetchKPIs, fetchRanking, fetchUltimasEvaluadas, fetchPorSucursal,
  fetchEvolucionTiempo, fetchRendimientoCiudad,
  resolveImageUrl,
  type KPIs, type VendedorRanking, type UltimaEvaluada, type SucursalStats,
  type EvolucionTiempo, type RendimientoCiudad,
} from "@/lib/api";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from "recharts";
import {
  ChevronLeft, ChevronRight, ImageOff, RefreshCw,
  Clock, CheckCircle, Star, XCircle, Calendar, GitBranch, MapPin
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(dateInput: string | Date): string {
  const date = new Date(dateInput);
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'hace un momento';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} minuto${minutes > 1 ? 's' : ''}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} hora${hours > 1 ? 's' : ''}`;
  const days = Math.floor(hours / 24);
  return `hace ${days} día${days > 1 ? 's' : ''}`;
}

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function getCurrentYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: 0 };
}

function periodoString(year: number, month: number, day: number): string {
  if (day !== 0) return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (year === 0) return "hoy";
  const now = new Date();
  if (year === now.getFullYear() && month === now.getMonth() + 1) return "mes";
  return `${year}-${String(month).padStart(2, "0")}`;
}

// ── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({ label, value, icon, color, bgColor }: { label: string; value: number; icon: React.ReactNode; color: string; bgColor: string }) {
  return (
    <div className={`p-4 rounded-3xl border border-slate-200/50 shadow-sm flex flex-col justify-between ${bgColor}`}>
      <div className="flex items-start justify-between">
        <div className={`p-2 rounded-xl mb-2 text-white shadow-sm ring-1 ring-white/20`} style={{ backgroundColor: color }}>
          {icon}
        </div>
        <div className="text-3xl font-black text-slate-800 tracking-tighter" style={{ color }}>{value}</div>
      </div>
      <div className="text-[11px] font-black uppercase tracking-widest text-slate-500 mt-2">{label}</div>
    </div>
  );
}

// ── Carousel Izquierdo 50% ────────────────────────────────────────────────

function HeroCarousel({ items }: { items: UltimaEvaluada[] }) {
  const [ci, setCi] = useState(0);
  const [imgErr, setImgErr] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Auto-play
  useEffect(() => {
    if (items.length <= 1) return;
    const timer = setInterval(() => {
      setCi(curr => (curr + 1) % items.length);
      setImgErr(false);
      setLoaded(false);
    }, 8000);
    return () => clearInterval(timer);
  }, [items.length]);

  if (items.length === 0) return (
    <Card className="h-full flex flex-col items-center justify-center bg-slate-50 border-slate-200 shadow-inner">
      <ImageOff size={48} className="text-slate-300 mb-4" />
      <span className="text-slate-500 font-bold">No hay exhibiciones en este filtro</span>
    </Card>
  );

  const item = items[ci];
  const imgSrc = resolveImageUrl(item.drive_link, item.id_exhibicion);

  const prev = () => { setCi((i) => (i === 0 ? items.length - 1 : i - 1)); setImgErr(false); setLoaded(false); };
  const next = () => { setCi((i) => (i === items.length - 1 ? 0 : i + 1)); setImgErr(false); setLoaded(false); };

  const getStatusColor = (e: string) => {
    if (e === "Destacado") return "from-purple-600 to-fuchsia-600";
    if (e === "Rechazado") return "from-red-600 to-rose-600";
    return "from-emerald-600 to-teal-500";
  };

  return (
    <div className="relative w-full h-[600px] lg:h-full rounded-3xl overflow-hidden shadow-xl ring-1 ring-slate-200 flex flex-col bg-slate-900 group">

      {/* IMAGEN DE FONDO & CONTENIDO */}
      <AnimatePresence mode="wait">
        <motion.div
          key={ci}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="absolute inset-0"
        >
          {!imgErr && imgSrc ? (
            <img
              src={imgSrc}
              alt="Exhibicion"
              className="w-full h-full object-cover opacity-80"
              onLoad={() => setLoaded(true)}
              onError={() => setImgErr(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-slate-800">
              <ImageOff size={40} className="text-slate-600" />
            </div>
          )}
          {/* Gradiente Oscuro */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/60 to-transparent" />
        </motion.div>
      </AnimatePresence>

      {/* DETALLES DE EXHIBICION */}
      <div className="absolute bottom-0 left-0 right-0 p-8 z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={`info-${ci}`}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <div className="flex items-center gap-3 mb-4">
              <span className={`px-4 py-1.5 rounded-full text-xs font-black tracking-widest text-white uppercase shadow-lg bg-gradient-to-r ${getStatusColor(item.estado)}`}>
                {item.estado}
              </span>
              <span className="text-slate-300 text-sm font-semibold flex items-center gap-1">
                <Clock size={14} />
                {item.fecha_evaluacion ? formatTime(item.fecha_evaluacion) : 'Reciente'}
              </span>
            </div>

            <h2 className="text-4xl md:text-5xl font-black text-white leading-tight mb-2 drop-shadow-md">
              {item.vendedor}
            </h2>
            <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 text-slate-300 font-medium">
              <div className="flex items-center gap-2 bg-slate-800/50 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                Cliente #{item.nro_cliente} {item.tipo_pdv}
              </div>
              {item.ciudad && (
                <div className="flex items-center gap-1.5 text-slate-400">
                  <MapPin size={16} /> {item.ciudad}
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* CONTROLES */}
      <div className="absolute top-1/2 -translate-y-1/2 w-full px-4 flex justify-between z-20 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={prev} className="w-12 h-12 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md flex items-center justify-center text-white transition-transform hover:scale-110 active:scale-90 border border-white/10">
          <ChevronLeft size={24} />
        </button>
        <button onClick={next} className="w-12 h-12 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md flex items-center justify-center text-white transition-transform hover:scale-110 active:scale-90 border border-white/10">
          <ChevronRight size={24} />
        </button>
      </div>

      {/* INDICADORES */}
      <div className="absolute top-6 right-6 flex gap-1.5 z-20">
        {items.map((_, i) => (
          <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === ci ? 'w-6 bg-white shadow-glow' : 'w-1.5 bg-white/30'}`} />
        ))}
      </div>
    </div>
  );
}

function ChartCarousel({
  sucursales, evolucion, ciudades
}: {
  sucursales: SucursalStats[];
  evolucion: EvolucionTiempo[];
  ciudades: RendimientoCiudad[];
}) {
  const [slide, setSlide] = useState(0);
  const slidesCount = 3;

  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % slidesCount), 10000);
    return () => clearInterval(t);
  }, []);

  if (sucursales.length <= 1 && evolucion.length === 0) return null;

  return (
    <Card className="p-5 border-slate-200 relative overflow-hidden h-[300px] flex flex-col group">
      
      {/* Indicadores */}
      <div className="absolute top-4 right-5 z-20 flex gap-1.5">
        {[0, 1, 2].map(i => (
          <button 
            key={i} 
            onClick={() => setSlide(i)}
            className={`h-1.5 rounded-full transition-all duration-300 ${i === slide ? 'w-6 bg-slate-800' : 'w-2 bg-slate-200'}`} 
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={slide}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.4 }}
          className="flex-1 w-full h-full flex flex-col"
        >
          {slide === 0 && (
            <>
              <h3 className="text-slate-800 font-bold text-sm mb-4">Rendimiento por Sucursal</h3>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sucursales} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                  <XAxis dataKey="sucursal" tick={{ fill: "#64748b", fontSize: 10, fontWeight: 600 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: "rgba(255,255,255,0.95)", backdropFilter: "blur(10px)", border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)" }}
                    labelStyle={{ color: "#0f172a", fontWeight: 900 }}
                    cursor={{ fill: "#f1f5f9" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600, color: "#475569" }} />
                  <Bar dataKey="aprobadas" name="Aprobadas" stackId="a" fill="#10b981" radius={[0, 0, 4, 4]} barSize={32} />
                  <Bar dataKey="rechazadas" name="Rechazadas" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </>
          )}

          {slide === 1 && (
            <>
              <h3 className="text-slate-800 font-bold text-sm mb-4">Evolución Temporal de Fotos</h3>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={evolucion} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="fecha" tick={{ fill: "#64748b", fontSize: 10, fontWeight: 600 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: "rgba(255,255,255,0.95)", backdropFilter: "blur(10px)", border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)" }}
                    labelStyle={{ color: "#0f172a", fontWeight: 900 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600, color: "#475569" }} />
                  <Line type="monotone" dataKey="total" name="Enviadas" stroke="#94a3b8" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="aprobadas" name="Aprobadas" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: "#3b82f6", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </>
          )}

          {slide === 2 && (
            <>
              <h3 className="text-slate-800 font-bold text-sm mb-4">Aprobación por Ciudad</h3>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ciudades.slice(0, 8)} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 10 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="ciudad" type="category" tick={{ fill: "#64748b", fontSize: 10, fontWeight: 600 }} tickLine={false} axisLine={false} width={100} />
                  <Tooltip
                    contentStyle={{ background: "rgba(255,255,255,0.95)", backdropFilter: "blur(10px)", border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)" }}
                    labelStyle={{ color: "#0f172a", fontWeight: 900 }}
                    cursor={{ fill: "#f1f5f9" }}
                  />
                  <Bar dataKey="aprobadas" name="Aprobadas" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
        </motion.div>
      </AnimatePresence>
      
      {/* Botones invisibles para adelantar clickeando a los lados */}
      <button onClick={() => setSlide(s => (s === 0 ? 2 : s - 1))} className="absolute left-0 top-0 bottom-0 w-12 z-10 cursor-pointer opacity-0" />
      <button onClick={() => setSlide(s => (s === 2 ? 0 : s + 1))} className="absolute right-0 top-0 bottom-0 w-12 z-10 cursor-pointer opacity-0" />
    </Card>
  );
}

// ── Ranking animado ───────────────────────────────────────────────────────────

function RankingTable({
  ranking, periodo, sucursalFiltro, sucursales,
}: {
  ranking: VendedorRanking[];
  periodo: string;
  sucursalFiltro: string;
  sucursales: SucursalStats[];
}) {
  const sucursalLabel = sucursalFiltro
    ? (sucursales.find((s) => s.location_id === sucursalFiltro)?.sucursal ?? sucursalFiltro)
    : null;

  if (ranking.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center p-8 border-slate-200 border-dashed h-full">
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest py-6 text-center">No hay actividad para el ranking todavía</p>
      </Card>
    );
  }

  // Top 15 solamente
  const top15 = ranking.slice(0, 15);

  return (
    <Card className="border-slate-200 shadow-md overflow-hidden flex flex-col h-full bg-white relative">
      {/* Luz decorativa en la parte superior del ranking */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-yellow-200 to-amber-400 z-20" />
      
      <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/90 backdrop-blur-md z-10">
        <div>
          <h3 className="text-slate-900 font-black text-xl flex items-center gap-2">
            <Star className="text-amber-500 fill-amber-500 animate-pulse" size={24} /> Ranking Top 15 en Vivo
          </h3>
          <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest mt-1 opacity-70">Líderes de rendimiento en tiempo real</p>
        </div>
        {sucursalLabel && (
          <span className="text-[11px] font-black tracking-widest text-blue-600 bg-blue-50 px-4 py-2 rounded-xl border border-blue-100 shadow-sm">
            {sucursalLabel}
          </span>
        )}
      </div>

      <div className="overflow-x-auto flex-1 custom-scrollbar">
        <table className="w-full text-sm border-separate border-spacing-y-1.5 px-3">
          <thead className="sticky top-0 bg-white z-10 transition-colors">
            <tr className="text-left">
              <th className="py-4 px-4 font-black uppercase tracking-widest text-[10px] text-slate-400 w-16">PUESTO</th>
              <th className="py-4 px-2 font-black uppercase tracking-widest text-[10px] text-slate-400">INTEGRANTE</th>
              <th className="py-4 px-2 text-right font-black uppercase tracking-widest text-[10px] text-emerald-500">APROB</th>
              <th className="py-4 px-4 text-right font-black uppercase tracking-widest text-[10px] text-slate-800">PUNTOS</th>
            </tr>
          </thead>
          <tbody className="pb-4">
            <AnimatePresence initial={false}>
              {top15.map((v, i) => (
                <motion.tr
                  key={v.vendedor}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ 
                    opacity: 1, 
                    y: 0,
                    scale: i === 0 ? 1.02 : 1,
                    zIndex: 15 - i
                  }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  whileHover={{ backgroundColor: "rgba(241, 245, 249, 1)", scale: 1.01 }}
                  transition={{
                    type: "spring",
                    stiffness: 400,
                    damping: 30,
                    mass: 0.8
                  }}
                  className={`
                    relative group shadow-sm rounded-xl overflow-hidden
                    ${i === 0 ? "bg-gradient-to-r from-amber-50 to-white border-2 border-amber-200" :
                      i === 1 ? "bg-gradient-to-r from-slate-50 to-white" :
                        i === 2 ? "bg-gradient-to-r from-orange-50 to-white" : "bg-white border border-slate-100"}
                  `}
                >
                  <td className="py-3 px-4 first:rounded-l-xl">
                    <div className={`w-8 h-8 flex items-center justify-center text-[12px] font-black rounded-lg shadow-sm transition-transform group-hover:rotate-12 ${
                      i === 0 ? "bg-amber-400 text-amber-950 scale-110 shadow-amber-200" :
                      i === 1 ? "bg-slate-300 text-slate-800 shadow-slate-100" :
                      i === 2 ? "bg-orange-300 text-orange-950 shadow-orange-100" :
                      "bg-slate-100 text-slate-500"
                    }`}>
                      {i + 1}
                    </div>
                  </td>
                  <td className="py-3 px-2">
                    <div className="flex flex-col">
                      <span className={`font-black text-[15px] ${i < 3 ? "text-slate-900" : "text-slate-700"}`}>
                        {v.vendedor}
                      </span>
                      {i < 3 && (
                        <span className="text-[9px] uppercase font-black tracking-widest text-slate-400 opacity-80">
                          {i === 0 ? "👑 Líder Global" : i === 1 ? "⭐ Excelente" : "🔥 En racha"}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-2 text-right">
                    <span className="inline-flex items-center justify-center bg-emerald-100 text-emerald-700 text-[11px] font-black px-2 py-0.5 rounded-full min-w-[28px]">
                      {v.aprobadas}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right last:rounded-r-xl">
                    <span className={`font-black text-lg ${i < 3 ? "text-slate-900" : "text-slate-600"}`}>
                      {v.puntos}
                      <span className="text-[10px] ml-1 opacity-50 font-bold uppercase">pts</span>
                    </span>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Filtros Bar ───────────────────────────────────────────────────────────────

function FiltrosBar({
  year, month, day, sucursalFiltro, sucursales,
  onDateChange, onSucursal, onRefresh,
}: {
  year: number; month: number; day: number;
  sucursalFiltro: string; sucursales: SucursalStats[];
  onDateChange: (y: number, m: number, d: number) => void;
  onSucursal: (s: string) => void;
  onRefresh: () => void;
}) {
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];

  // Helper arrays
  const daysInMonth = year !== 0 ? new Date(year, month, 0).getDate() : 31;
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm mt-2 mb-6 w-full relative z-30">
      <div className="flex-1 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
          <Calendar size={16} className="text-slate-400" />
          <select value={year} onChange={(e) => {
            const y = Number(e.target.value);
            onDateChange(y, y === 0 ? 0 : month, y === 0 ? 0 : day);
          }} className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer">
            <option value="0">Toda la historia (Hoy)</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>

          {year !== 0 && (
            <>
              <span className="text-slate-300">/</span>
              <select value={month} onChange={(e) => onDateChange(year, Number(e.target.value), 0)} className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer">
                {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
              <span className="text-slate-300">/</span>
              <select value={day} onChange={(e) => onDateChange(year, month, Number(e.target.value))} className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer">
                <option value="0">Mes entero</option>
                {daysArray.map((d) => <option key={d} value={d}>Día {d}</option>)}
              </select>
            </>
          )}
        </div>

        {sucursales.length > 1 && (
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
            <GitBranch size={16} className="text-slate-400" />
            <select value={sucursalFiltro} onChange={(e) => onSucursal(e.target.value)} className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer min-w-[150px]">
              <option value="">Todas las sucursales</option>
              {sucursales.map((s) => <option key={s.location_id} value={s.location_id}>{s.sucursal}</option>)}
            </select>
          </div>
        )}
      </div>

      <button onClick={onRefresh} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-sm rounded-xl transition-all shadow-md active:scale-95">
        <RefreshCw size={16} /> Refrescar
      </button>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth();
  const initVars = getCurrentYearMonth();

  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [ranking, setRanking] = useState<VendedorRanking[]>([]);
  const [ultimas, setUltimas] = useState<UltimaEvaluada[]>([]);
  const [sucursales, setSucursales] = useState<SucursalStats[]>([]);
  const [evolucion, setEvolucion] = useState<EvolucionTiempo[]>([]);
  const [ciudades, setCiudades] = useState<RendimientoCiudad[]>([]);

  const [year, setYear] = useState(initVars.year);
  const [month, setMonth] = useState(initVars.month);
  const [day, setDay] = useState(initVars.day);
  const [sucursalFiltro, setSucursalFiltro] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const periodo = periodoString(year, month, day);

  const cargar = useCallback(async (p = periodo) => {
    if (!user) return;
    setError(null);
    try {
      const distId = user?.id_distribuidor || 0;
      const [k, r, u, s, ev, ci] = await Promise.all([
        fetchKPIs(distId, p),
        fetchRanking(distId, p),
        fetchUltimasEvaluadas(distId, 12),
        fetchPorSucursal(distId, p),
        fetchEvolucionTiempo(distId, p),
        fetchRendimientoCiudad(distId, p),
      ]);
      setKpis(k); setRanking(r); setUltimas(u); setSucursales(s);
      setEvolucion(ev); setCiudades(ci);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [user, periodo]);

  useEffect(() => { cargar(); }, [cargar]);

  // Auto-refresh cada 60s
  useEffect(() => {
    const t = setInterval(() => cargar(), 60_000);
    return () => clearInterval(t);
  }, [cargar]);

  function handleDateChange(y: number, m: number, d: number) {
    setYear(y); setMonth(m); setDay(d);
    setLoading(true); setSucursalFiltro("");
  }

  // Filtrar ranking por sucursal
  const rankingFiltrado = sucursalFiltro
    ? ranking.filter((v) => v.location_id === sucursalFiltro)
    : ranking;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      <Sidebar />
      <BottomNav />
      <div className="flex flex-col flex-1 min-w-0 relative h-full">
        {/* Decorative background vectors */}
        <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500/5 blur-[100px] pointer-events-none" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-emerald-500/5 blur-[100px] pointer-events-none" />

        <Topbar title="Dashboard en Vivo" />

        <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6 overflow-y-auto w-full max-w-[1800px] mx-auto z-10 custom-scrollbar">

          <FiltrosBar
            year={year} month={month} day={day}
            sucursalFiltro={sucursalFiltro} sucursales={sucursales}
            onDateChange={handleDateChange}
            onSucursal={setSucursalFiltro}
            onRefresh={() => { setLoading(true); cargar(); }}
          />

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 text-sm font-bold mb-6 flex items-center gap-3 shadow-sm">
              <XCircle size={20} className="text-red-500" />
              Falló la conexión de red con el servidor ({error}). Asegúrese de encender el backend de la API e intente nuevamente.
            </div>
          )}

          {/* Layout 50/50 principal */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 h-auto xl:h-[calc(100vh-210px)] min-h-[800px]">

            {/* LADO IZQUIERDO: Carrusel masivo */}
            <div className="xl:h-full pb-4">
              {loading && ultimas.length === 0 ? (
                <Card className="h-full flex items-center justify-center p-12 bg-white"><PageSpinner /></Card>
              ) : (
                <HeroCarousel items={ultimas.filter(u => (!sucursalFiltro || u.nro_cliente) /* apply basic fitlering here if possible */)} />
              )}
            </div>

            {/* LADO DERECHO: Métricas & Ranking */}
            <div className="flex flex-col gap-6 xl:h-full lg:overflow-y-auto lg:pr-2 lg:-mr-2 custom-scrollbar pb-6">
              {/* KPIs ROW (Aprox 20% altura visual o fija) */}
              {kpis && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
                  <KpiCard label="Pendientes" value={kpis.pendientes} icon={<Clock size={20} />} color="#f59e0b" bgColor="bg-white" />
                  <KpiCard label="Aprobadas" value={kpis.aprobadas} icon={<CheckCircle size={20} />} color="#10b981" bgColor="bg-white" />
                  <KpiCard label="Destacadas" value={kpis.destacadas} icon={<Star size={20} />} color="#8b5cf6" bgColor="bg-gradient-to-br from-violet-50 to-fuchsia-50" />
                  <KpiCard label="Rechazadas" value={kpis.rechazadas} icon={<XCircle size={20} />} color="#ef4444" bgColor="bg-white" />
                </div>
              )}

              {/* RANKING TOP 15 - AHORA MÁS PROMIMENTE (Aprox 80% restante) */}
              <div className="flex-1 min-h-0">
                <RankingTable
                  ranking={rankingFiltrado}
                  periodo={periodo}
                  sucursalFiltro={sucursalFiltro}
                  sucursales={sucursales}
                />
              </div>
            </div>

          </div>

        </main>
      </div>
    </div>
  );
}
