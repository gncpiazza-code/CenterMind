"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { PageSpinner } from "@/components/ui/Spinner";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  fetchKPIs, fetchRanking, fetchUltimasEvaluadas, fetchPorSucursal,
  resolveImageUrl,
  type KPIs, type VendedorRanking, type UltimaEvaluada, type SucursalStats,
} from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  ChevronLeft, ChevronRight, ImageOff, RefreshCw,
  Clock, CheckCircle, Star, XCircle, Calendar, GitBranch,
} from "lucide-react";

// ── Helpers de fecha ──────────────────────────────────────────────────────────

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function getCurrentYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/** Convierte year+month en el string que acepta el API como `periodo`.
 *  Si corresponde al mes actual usa "mes", si no usa "yyyy-MM" (el API lo soporta
 *  o enviamos el rango como fecha; por ahora lo pasamos como string mes). */
function periodoString(year: number, month: number): string {
  if (year === 0) return "hoy";
  const now = new Date();
  if (year === now.getFullYear() && month === now.getMonth() + 1) return "mes";
  return `${year}-${String(month).padStart(2, "0")}`;
}

// ── Carousel ─────────────────────────────────────────────────────────────────

function CarouselGrande({ items }: { items: UltimaEvaluada[] }) {
  const [ci, setCi] = useState(0);
  const [imgErr, setImgErr] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (items.length === 0) return null;

  const item = items[ci];
  const imgSrc = resolveImageUrl(item.drive_link, item.id_exhibicion);

  const prev = () => { setCi((i) => Math.max(0, i - 1)); setImgErr(false); setLoaded(false); };
  const next = () => { setCi((i) => Math.min(items.length - 1, i + 1)); setImgErr(false); setLoaded(false); };

  return (
    <Card glass className="overflow-hidden p-0 border-[var(--shelfy-border)] shadow-md">
      <div
        className="relative w-full flex items-center justify-center overflow-hidden"
        style={{ height: 480, background: "#060606" }}
      >
        <AnimatePresence mode="wait">
          {!imgErr ? (
            <motion.div
              key={ci}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="w-full h-full relative"
            >
              {imgSrc && (
                <img
                  src={imgSrc}
                  alt="Exhibición evaluada"
                  className="w-full h-full"
                  style={{
                    objectFit: "contain",
                    objectPosition: "center",
                    opacity: loaded ? 1 : 0,
                  }}
                  onLoad={() => setLoaded(true)}
                  onError={() => setImgErr(true)}
                />
              )}

              {!loaded && !imgErr && (
                <motion.div
                  animate={{ opacity: [0.4, 0.7, 0.4] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="absolute inset-0 bg-white/5 flex items-center justify-center"
                >
                  <div className="w-10 h-10 border-2 border-white/10 border-t-white/40 rounded-full animate-spin" />
                </motion.div>
              )}
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center text-gray-600 gap-3"
            >
              <ImageOff size={56} className="opacity-30" />
              <span className="text-xs text-gray-500">No disponible</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Overlay info inferior */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent px-6 py-6 pt-12">
          <div className="flex items-end justify-between">
            <motion.div
              key={`info-${ci}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <p className="text-white font-bold text-xl leading-tight drop-shadow-sm">{item.vendedor}</p>
              <p className="text-white/70 text-sm mt-1">{item.nro_cliente} · {item.tipo_pdv}</p>
            </motion.div>
            <motion.span
              key={`badge-${ci}`}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`text-sm px-3 py-1 rounded-full text-white font-semibold shadow-lg
                ${item.estado === "Destacado" ? "bg-purple-500" : item.estado === "Rechazado" ? "bg-red-500" : "bg-emerald-500"}`}>
              {item.estado}
            </motion.span>
          </div>
        </div>

        {/* Botones navegación con micro-interacciones */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={prev} disabled={ci === 0}
          className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white flex items-center justify-center disabled:opacity-0 transition-opacity">
          <ChevronLeft size={22} />
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={next} disabled={ci >= items.length - 1}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white flex items-center justify-center disabled:opacity-0 transition-opacity">
          <ChevronRight size={22} />
        </motion.button>

        <div className="absolute top-3 right-3 bg-black/40 backdrop-blur-md border border-white/10 text-white text-[10px] uppercase font-bold px-3 py-1 rounded-full tracking-wider">
          {ci + 1} / {items.length}
        </div>
      </div>

      {/* Dots + título */}
      <div className="flex items-center justify-between px-5 py-3.5 border-t border-[var(--shelfy-border)] bg-[var(--shelfy-bg)]">
        <span className="text-xs font-bold uppercase tracking-widest text-[var(--shelfy-muted)]">Últimas evaluadas</span>
        <div className="flex gap-1.5">
          {items.slice(0, 8).map((_, i) => (
            <button
              key={i}
              onClick={() => { setCi(i); setImgErr(false); setLoaded(false); }}
              className={`rounded-full transition-all duration-300 ${i === ci ? "bg-[var(--shelfy-primary)] w-5 h-1.5" : "bg-[var(--shelfy-border)] w-1.5 h-1.5"}`}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}

// ── Gráfico por sucursal ──────────────────────────────────────────────────────

function GraficoSucursales({ data }: { data: SucursalStats[] }) {
  if (data.length <= 1) return null;
  return (
    <Card glass>
      <h3 className="text-[var(--shelfy-text)] font-semibold text-sm mb-4">Rendimiento por sucursal</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
          <XAxis dataKey="sucursal" tick={{ fill: "#6B7280", fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: "#6B7280", fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
            labelStyle={{ color: "#111827", fontWeight: 600 }}
            itemStyle={{ color: "#6B7280" }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: "#6B7280" }} />
          <Bar dataKey="aprobadas" name="Aprobadas" fill="#059669" radius={[4, 4, 0, 0]} />
          <Bar dataKey="rechazadas" name="Rechazadas" fill="#DC2626" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
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
  const PERIODO_LABELS: Record<string, string> = { hoy: "HOY", mes: "MES", historico: "HISTÓRICO" };
  const labelPeriodo = PERIODO_LABELS[periodo] ?? periodo.toUpperCase();

  const sucursalLabel = sucursalFiltro
    ? (sucursales.find((s) => String(s.location_id) === sucursalFiltro)?.sucursal ?? sucursalFiltro)
    : null;

  if (ranking.length === 0) {
    return (
      <Card glass>
        <p className="text-sm text-[var(--shelfy-muted)] py-6 text-center">Sin datos para este período.</p>
      </Card>
    );
  }

  return (
    <Card className="border-[var(--shelfy-border)] shadow-md overflow-hidden">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2 px-1">
        <h3 className="text-[var(--shelfy-text)] font-bold text-base">Ranking de vendedores</h3>
        <div className="flex gap-2 flex-wrap">
          <span className="text-[10px] font-bold tracking-widest text-[var(--shelfy-muted)] bg-[var(--shelfy-bg)] px-3 py-1 rounded-full border border-[var(--shelfy-border)]">
            {labelPeriodo}
          </span>
          {sucursalLabel && (
            <span className="text-[10px] font-bold tracking-widest text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
              {sucursalLabel.toUpperCase()}
            </span>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[var(--shelfy-muted)] text-left border-b border-[var(--shelfy-border)]">
              <th className="pb-3 pr-3 w-10 font-bold uppercase tracking-tighter text-[10px]">Pos</th>
              <th className="pb-3 pr-3 font-bold uppercase tracking-tighter text-[10px]">Vendedor</th>
              <th className="pb-3 pr-3 text-right font-bold uppercase tracking-tighter text-[10px] text-emerald-600">AP</th>
              <th className="pb-3 pr-3 text-right font-bold uppercase tracking-tighter text-[10px] text-purple-600">DEST</th>
              <th className="pb-3 pr-3 text-right font-bold uppercase tracking-tighter text-[10px] text-red-500">REC</th>
              <th className="pb-3 text-right font-bold uppercase tracking-tighter text-[10px]">Puntos</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {ranking.map((v, i) => (
                <motion.tr
                  key={v.vendedor}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{
                    duration: 0.3,
                    delay: i * 0.05,
                    layout: { type: "spring", stiffness: 300, damping: 30 }
                  }}
                  className="border-b border-[var(--shelfy-border)] last:border-0 hover:bg-[var(--shelfy-bg)] group transition-colors"
                >
                  <td className="py-3.5 pr-3">
                    <span className={`text-xs font-black px-2 py-0.5 rounded ${i === 0 ? "bg-yellow-100 text-yellow-700" :
                      i === 1 ? "bg-slate-100 text-slate-500" :
                        i === 2 ? "bg-orange-100 text-orange-700" :
                          "text-[var(--shelfy-muted)]"
                      }`}>
                      {i + 1}
                    </span>
                  </td>
                  <td className="py-3.5 pr-3 text-[var(--shelfy-text)] font-semibold">{v.vendedor}</td>
                  <td className="py-3.5 pr-3 text-right text-emerald-600 font-medium">{v.aprobadas}</td>
                  <td className="py-3.5 pr-3 text-right text-purple-600 font-medium">{v.destacadas}</td>
                  <td className="py-3.5 pr-3 text-right text-red-500 font-medium">{v.rechazadas}</td>
                  <td className="py-3.5 text-right font-black text-[var(--shelfy-text)]">{v.puntos}</td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Filtros: Año/Mes + Sucursal ───────────────────────────────────────────────

function FiltrosBar({
  year, month, sucursalFiltro, sucursales,
  onYearMonth, onSucursal, onRefresh,
}: {
  year: number;
  month: number;
  sucursalFiltro: string;
  sucursales: SucursalStats[];
  onYearMonth: (y: number, m: number) => void;
  onSucursal: (s: string) => void;
  onRefresh: () => void;
}) {
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <div className="flex flex-wrap items-center gap-2 mb-5">

      {/* Selector de mes */}
      <div className="flex items-center gap-1.5 bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] rounded-lg px-2 py-1.5">
        <Calendar size={14} className="text-[var(--shelfy-muted)]" />
        <select
          value={month}
          onChange={(e) => onYearMonth(year, Number(e.target.value))}
          disabled={year === 0}
          className="bg-transparent text-xs font-semibold text-[var(--shelfy-text)] outline-none cursor-pointer disabled:opacity-50"
        >
          {MESES.map((m, i) => (
            <option key={i + 1} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          value={year}
          onChange={(e) => {
            const y = Number(e.target.value);
            if (y === 0) onYearMonth(0, 0);
            else onYearMonth(y, month);
          }}
          className="bg-transparent text-xs font-semibold text-[var(--shelfy-text)] outline-none cursor-pointer"
        >
          <option value="0">Hoy</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Botón rápido "Hoy" */}
      <button
        onClick={() => onYearMonth(0, 0)}
        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border
          ${year === 0
            ? "bg-[var(--shelfy-primary)] text-white border-[var(--shelfy-primary)] shadow-sm shadow-[var(--shelfy-primary)]/40"
            : "bg-[var(--shelfy-panel)] text-[var(--shelfy-muted)] border-[var(--shelfy-border)] hover:text-[var(--shelfy-text)]"
          }`}
      >
        Hoy
      </button>

      {/* Filtro por sucursal (solo si hay más de 1) */}
      {sucursales.length > 1 && (
        <div className="flex items-center gap-1.5 bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] rounded-lg px-2 py-1.5 ml-1">
          <GitBranch size={14} className="text-[var(--shelfy-muted)]" />
          <select
            value={sucursalFiltro}
            onChange={(e) => onSucursal(e.target.value)}
            className="bg-transparent text-xs font-semibold text-[var(--shelfy-text)] outline-none cursor-pointer"
          >
            <option value="">Todas las sucursales</option>
            {sucursales.map((s) => (
              <option key={s.location_id} value={String(s.location_id)}>{s.sucursal}</option>
            ))}
          </select>
        </div>
      )}

      {/* Botón refresh */}
      <button onClick={onRefresh} title="Recargar"
        className="ml-auto p-2 text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] border border-[var(--shelfy-border)] rounded-lg bg-[var(--shelfy-panel)] transition-colors">
        <RefreshCw size={14} />
      </button>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth();
  const { year: initYear, month: initMonth } = getCurrentYearMonth();

  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [ranking, setRanking] = useState<VendedorRanking[]>([]);
  const [ultimas, setUltimas] = useState<UltimaEvaluada[]>([]);
  const [sucursales, setSucursales] = useState<SucursalStats[]>([]);

  const [year, setYear] = useState(initYear);
  const [month, setMonth] = useState(initMonth);
  const [sucursalFiltro, setSucursalFiltro] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const periodo = periodoString(year, month);

  const cargar = useCallback(async (p = periodo) => {
    if (!user) return;
    setError(null);
    try {
      const distId = user?.id_distribuidor || 0;
      const [k, r, u, s] = await Promise.all([
        fetchKPIs(distId, p),
        fetchRanking(distId, p),
        fetchUltimasEvaluadas(distId, 8),
        fetchPorSucursal(distId, p),
      ]);
      setKpis(k); setRanking(r); setUltimas(u); setSucursales(s);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, periodo]);

  useEffect(() => { cargar(); }, [cargar]);

  // Auto-refresh cada 60s
  useEffect(() => {
    const t = setInterval(() => cargar(), 60_000);
    return () => clearInterval(t);
  }, [cargar]);

  function handleYearMonth(y: number, m: number) {
    setYear(y);
    setMonth(m);
    setLoading(true);
    setSucursalFiltro("");
  }

  // Filtrar ranking por sucursal en cliente (usando el nombre del grupo que ya tenemos en sucursales)
  const rankingFiltrado = sucursalFiltro
    ? ranking.filter((v) => {
      // Intentamos asociar por location_id si la API lo devuelve en el ranking
      // Si no, mostramos todo (el filtro por sucursal afecta principalmente al gráfico)
      return true;
    })
    : ranking;

  // Título del período activo
  const mesLabel = year === 0 ? "Hoy" : `${MESES[month - 1]} ${year}`;

  return (
    <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <BottomNav />
      <div className="flex flex-col flex-1 min-w-0 relative overflow-hidden">
        {/* Decorative background blobs */}
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-400/10 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-purple-400/10 blur-[120px] pointer-events-none" />

        <Topbar title="Dashboard" />
        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 overflow-auto">

          {/* ── Header ── */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-[var(--shelfy-text)]">Resumen general</h2>
              <p className="text-sm text-[var(--shelfy-muted)]">{user?.nombre_empresa} · {mesLabel}</p>
            </div>
          </div>

          {/* ── Filtros ── */}
          <FiltrosBar
            year={year}
            month={month}
            sucursalFiltro={sucursalFiltro}
            sucursales={sucursales}
            onYearMonth={handleYearMonth}
            onSucursal={setSucursalFiltro}
            onRefresh={() => { setLoading(true); cargar(); }}
          />

          {loading && <PageSpinner />}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
              {error}
            </div>
          )}

          {!loading && kpis && (
            <div className="flex flex-col gap-5">

              {/* ── Fila 1: KPIs ── */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KpiCard label="Pendientes" value={kpis.pendientes} icon={<Clock size={20} />} color="#D97706" bgColor="bg-amber-50" />
                <KpiCard label="Aprobadas" value={kpis.aprobadas} icon={<CheckCircle size={20} />} color="#059669" bgColor="bg-emerald-50" />
                <KpiCard label="Destacadas" value={kpis.destacadas} icon={<Star size={20} />} color="#7C3AED" bgColor="bg-violet-50" />
                <KpiCard label="Rechazadas" value={kpis.rechazadas} icon={<XCircle size={20} />} color="#DC2626" bgColor="bg-red-50" />
              </div>

              {/* ── Fila 2: Carousel ── */}
              {ultimas.length > 0 && (
                <CarouselGrande items={ultimas} />
              )}

              {/* ── Fila 3: Ranking + Sucursales ── */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                {/* Ranking animado */}
                <RankingTable
                  ranking={rankingFiltrado}
                  periodo={periodo}
                  sucursalFiltro={sucursalFiltro}
                  sucursales={sucursales}
                />

                {/* Sucursales + Total */}
                <div className="flex flex-col gap-5">
                  <GraficoSucursales data={sucursales} />
                  <Card
                    glass
                    className="relative overflow-hidden border-[var(--shelfy-border)] group"
                    style={{
                      backgroundColor: 'rgba(59, 130, 246, 0.05)',
                      '--glow-color': '#3b82f6'
                    } as any}
                  >
                    {/* Subtle glow for total card */}
                    <div
                      className="absolute -top-10 -right-10 w-32 h-32 blur-[60px] opacity-10 pointer-events-none group-hover:opacity-20 transition-opacity"
                      style={{ background: '#3b82f6' }}
                    />

                    <p className="text-[10px] text-[var(--shelfy-muted)] mb-3 uppercase tracking-[0.2em] font-black">Total exhibiciones</p>
                    <p className="text-5xl font-black text-[var(--shelfy-text)] tracking-tighter leading-none">{kpis.total}</p>
                    <p className="text-xs text-[var(--shelfy-muted)] mt-2.5 font-bold">{mesLabel}</p>
                    <div className="mt-5 flex gap-1.5 flex-wrap">
                      <span className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500 font-bold border border-emerald-500/20">{kpis.aprobadas} aprob.</span>
                      <span className="text-[10px] px-2.5 py-1 rounded-full bg-violet-500/10 text-violet-500 font-bold border border-violet-500/20">{kpis.destacadas} dest.</span>
                      <span className="text-[10px] px-2.5 py-1 rounded-full bg-red-500/10 text-red-500 font-bold border border-red-500/20">{kpis.rechazadas} rech.</span>
                    </div>
                  </Card>
                </div>
              </div>

            </div>
          )}
        </main>
      </div>
    </div>
  );
}

import { motion, AnimatePresence } from "framer-motion";

function KpiCard({ label, value, icon, color, bgColor }: {
  label: string; value: number; icon: React.ReactNode; color: string; bgColor: string;
}) {
  return (
    <motion.div
      whileHover={{ scale: 1.02, translateY: -2 }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-full"
    >
      <Card
        glass
        className="h-full transition-all duration-300 hover:shadow-lg border-[var(--shelfy-border)] group relative overflow-hidden"
        style={{
          '--glow-color': color,
          backgroundColor: `${color}10` // Subtle tint 10% opacity
        } as any}
      >
        {/* Subtle accent glow */}
        <div
          className="absolute -top-10 -right-10 w-24 h-24 blur-[50px] opacity-20 transition-opacity group-hover:opacity-40 pointer-events-none"
          style={{ background: color }}
        />

        <motion.div
          whileHover={{ rotate: 10, scale: 1.15 }}
          className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 shadow-inner transition-transform"
          style={{
            color,
            backgroundColor: `${color}20`, // 20% opacity for the icon box
            border: `1px solid ${color}40`
          }}
        >
          {icon}
        </motion.div>

        <p className="text-4xl font-black tracking-tight leading-none" style={{ color }}>{value}</p>
        <p className="text-[10px] text-[var(--shelfy-muted)] mt-2.5 font-black uppercase tracking-[0.2em]">{label}</p>
      </Card>
    </motion.div>
  );
}
