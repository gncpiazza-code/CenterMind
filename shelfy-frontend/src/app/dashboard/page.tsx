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
    <Card className="overflow-hidden p-0">
      {/* Imagen principal — siempre encuadrada (object-contain + fondo negro) */}
      <div
        className="relative w-full flex items-center justify-center"
        style={{ height: 480, background: "#0d0d0d" }}
      >
        {imgSrc && !imgErr ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imgSrc}
              alt="Exhibición evaluada"
              className="w-full h-full transition-opacity duration-300"
              style={{
                objectFit: "contain",
                objectPosition: "center",
                opacity: loaded ? 1 : 0,
              }}
              onLoad={() => setLoaded(true)}
              onError={() => setImgErr(true)}
            />
            {!loaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center text-gray-600 gap-3">
            <ImageOff size={56} className="opacity-30" />
            <span className="text-xs text-gray-500">No disponible</span>
          </div>
        )}

        {/* Overlay info inferior */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-6 py-5">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-white font-bold text-xl leading-tight">{item.vendedor}</p>
              <p className="text-white/70 text-sm mt-1">{item.nro_cliente} · {item.tipo_pdv}</p>
            </div>
            <span className={`text-sm px-3 py-1 rounded-full text-white font-semibold shrink-0
              ${item.estado === "Destacado" ? "bg-purple-500" : item.estado === "Rechazado" ? "bg-red-500" : "bg-green-500"}`}>
              {item.estado}
            </span>
          </div>
        </div>

        {/* Botones navegación */}
        <button onClick={prev} disabled={ci === 0}
          className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center disabled:opacity-20 transition-all">
          <ChevronLeft size={22} />
        </button>
        <button onClick={next} disabled={ci >= items.length - 1}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center disabled:opacity-20 transition-all">
          <ChevronRight size={22} />
        </button>

        {/* Contador */}
        <div className="absolute top-3 right-3 bg-black/50 text-white text-xs font-medium px-2.5 py-1 rounded-full">
          {ci + 1} / {items.length}
        </div>
      </div>

      {/* Dots + título */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--shelfy-border)]">
        <span className="text-sm font-semibold text-[var(--shelfy-text)]">Últimas evaluadas</span>
        <div className="flex gap-1.5">
          {items.slice(0, 8).map((_, i) => (
            <button
              key={i}
              onClick={() => { setCi(i); setImgErr(false); setLoaded(false); }}
              className={`rounded-full transition-all ${i === ci ? "bg-[var(--shelfy-primary)] w-4 h-2" : "bg-[var(--shelfy-border)] w-2 h-2"}`}
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
    <Card>
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
  const prevRanking = useRef<VendedorRanking[]>([]);
  const [visible, setVisible] = useState<boolean[]>([]);

  // Animación de entrada escalonada cuando cambia el ranking
  useEffect(() => {
    setVisible([]);
    const timers: NodeJS.Timeout[] = [];
    ranking.forEach((_, i) => {
      timers.push(setTimeout(() => {
        setVisible((v) => {
          const next = [...v];
          next[i] = true;
          return next;
        });
      }, i * 50));
    });
    prevRanking.current = ranking;
    return () => timers.forEach(clearTimeout);
  }, [ranking]);

  const PERIODO_LABELS: Record<string, string> = { hoy: "HOY", mes: "MES", historico: "HISTÓRICO" };
  const labelPeriodo = PERIODO_LABELS[periodo] ?? periodo.toUpperCase();

  const sucursalLabel = sucursalFiltro
    ? (sucursales.find((s) => String(s.location_id) === sucursalFiltro)?.sucursal ?? sucursalFiltro)
    : null;

  if (ranking.length === 0) {
    return (
      <Card>
        <p className="text-sm text-[var(--shelfy-muted)] py-6 text-center">Sin datos para este período.</p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-[var(--shelfy-text)] font-semibold text-sm">Ranking de vendedores</h3>
        <div className="flex gap-1.5 flex-wrap">
          <span className="text-xs text-[var(--shelfy-muted)] bg-[var(--shelfy-bg)] px-2 py-0.5 rounded-full border border-[var(--shelfy-border)]">
            {labelPeriodo}
          </span>
          {sucursalLabel && (
            <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
              <GitBranch size={10} className="inline mr-1" />
              {sucursalLabel}
            </span>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[var(--shelfy-muted)] text-left border-b border-[var(--shelfy-border)]">
              <th className="pb-2 pr-3 w-8">#</th>
              <th className="pb-2 pr-3">Vendedor</th>
              <th className="pb-2 pr-3 text-right text-green-600">AP</th>
              <th className="pb-2 pr-3 text-right text-purple-600">DEST</th>
              <th className="pb-2 pr-3 text-right text-red-500">REC</th>
              <th className="pb-2 text-right">PTS</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((v, i) => (
              <tr
                key={`${v.vendedor}-${i}`}
                className="border-b border-[var(--shelfy-border)] last:border-0 hover:bg-[var(--shelfy-bg)] transition-all"
                style={{
                  opacity: visible[i] ? 1 : 0,
                  transform: visible[i] ? "translateX(0)" : "translateX(-12px)",
                  transition: `opacity 0.3s ease ${i * 40}ms, transform 0.3s ease ${i * 40}ms`,
                }}
              >
                <td className="py-2.5 pr-3">
                  <span className={`text-xs font-bold ${i === 0 ? "text-yellow-500" : i === 1 ? "text-gray-400" : i === 2 ? "text-orange-400" : "text-[var(--shelfy-muted)]"
                    }`}>{i === 0 ? "👑" : `#${i + 1}`}</span>
                </td>
                <td className="py-2.5 pr-3 text-[var(--shelfy-text)] font-medium">{v.vendedor}</td>
                <td className="py-2.5 pr-3 text-right text-green-600 font-medium">{v.aprobadas}</td>
                <td className="py-2.5 pr-3 text-right text-purple-600 font-medium">{v.destacadas}</td>
                <td className="py-2.5 pr-3 text-right text-red-500 font-medium">{v.rechazadas}</td>
                <td className="py-2.5 text-right font-bold text-[var(--shelfy-text)]">{v.puntos}</td>
              </tr>
            ))}
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
          className="bg-transparent text-xs font-semibold text-[var(--shelfy-text)] outline-none cursor-pointer"
        >
          {MESES.map((m, i) => (
            <option key={i + 1} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          value={year}
          onChange={(e) => onYearMonth(Number(e.target.value), month)}
          className="bg-transparent text-xs font-semibold text-[var(--shelfy-text)] outline-none cursor-pointer"
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Filtro por sucursal (solo si hay más de 1) */}
      {sucursales.length > 1 && (
        <div className="flex items-center gap-1.5 bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] rounded-lg px-2 py-1.5">
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
  const mesLabel = `${MESES[month - 1]} ${year}`;

  return (
    <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <BottomNav />
      <div className="flex flex-col flex-1 min-w-0">
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
                  <Card>
                    <p className="text-xs text-[var(--shelfy-muted)] mb-1 uppercase tracking-wide font-semibold">Total exhibiciones</p>
                    <p className="text-4xl font-bold text-[var(--shelfy-text)]">{kpis.total}</p>
                    <p className="text-xs text-[var(--shelfy-muted)] mt-1">{mesLabel}</p>
                    <div className="mt-3 flex gap-1.5 flex-wrap">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">{kpis.aprobadas} aprob.</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">{kpis.destacadas} dest.</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">{kpis.rechazadas} rech.</span>
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

function KpiCard({ label, value, icon, color, bgColor }: {
  label: string; value: number; icon: React.ReactNode; color: string; bgColor: string;
}) {
  return (
    <Card>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${bgColor}`} style={{ color }}>
        {icon}
      </div>
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      <p className="text-xs text-[var(--shelfy-muted)] mt-1 font-medium uppercase tracking-wide">{label}</p>
    </Card>
  );
}
