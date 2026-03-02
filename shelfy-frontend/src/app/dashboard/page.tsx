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
  extractDriveId, getImageUrl,
  type KPIs, type VendedorRanking, type UltimaEvaluada, type SucursalStats,
} from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { ChevronLeft, ChevronRight, ImageOff, RefreshCw, Clock, CheckCircle, Star, XCircle } from "lucide-react";

const PERIODO_LABELS: Record<string, string> = {
  hoy: "HOY",
  mes: "MES",
  historico: "HISTÓRICO",
};

// ── Carousel grande centrado ─────────────────────────────────────────────────

function CarouselGrande({ items }: { items: UltimaEvaluada[] }) {
  const [ci, setCi] = useState(0);
  const [imgErr, setImgErr] = useState(false);

  if (items.length === 0) return null;

  const item = items[ci];
  const fileId = extractDriveId(item.drive_link);
  const imgSrc = fileId ? getImageUrl(fileId) : null;

  const prev = () => { setCi((i) => Math.max(0, i - 1)); setImgErr(false); };
  const next = () => { setCi((i) => Math.min(items.length - 1, i + 1)); setImgErr(false); };

  return (
    <Card className="overflow-hidden p-0">
      {/* Imagen principal */}
      <div className="relative w-full bg-gray-900" style={{ minHeight: 480 }}>
        {imgSrc && !imgErr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imgSrc}
            alt="Exhibición evaluada"
            className="w-full object-cover"
            style={{ minHeight: 480, maxHeight: 600 }}
            onError={() => setImgErr(true)}
          />
        ) : (
          <div className="flex items-center justify-center text-gray-500" style={{ minHeight: 480 }}>
            <ImageOff size={56} className="opacity-30" />
          </div>
        )}

        {/* Overlay info en la parte inferior */}
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

        {/* Botones navegación sobre la imagen */}
        <button
          onClick={prev}
          disabled={ci === 0}
          className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center disabled:opacity-20 transition-all"
        >
          <ChevronLeft size={22} />
        </button>
        <button
          onClick={next}
          disabled={ci >= items.length - 1}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center disabled:opacity-20 transition-all"
        >
          <ChevronRight size={22} />
        </button>

        {/* Contador top-right */}
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
              onClick={() => { setCi(i); setImgErr(false); }}
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

// ── Página principal ──────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth();
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [ranking, setRanking] = useState<VendedorRanking[]>([]);
  const [ultimas, setUltimas] = useState<UltimaEvaluada[]>([]);
  const [sucursales, setSucursales] = useState<SucursalStats[]>([]);
  const [periodo, setPeriodo] = useState("mes");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (p = periodo) => {
    if (!user) return;
    setError(null);
    try {
      const [k, r, u, s] = await Promise.all([
        fetchKPIs(user.id_distribuidor, p),
        fetchRanking(user.id_distribuidor, p),
        fetchUltimasEvaluadas(user.id_distribuidor, 8),
        fetchPorSucursal(user.id_distribuidor, p),
      ]);
      setKpis(k); setRanking(r); setUltimas(u); setSucursales(s);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [user, periodo]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    const t = setInterval(() => cargar(), 60_000);
    return () => clearInterval(t);
  }, [cargar]);

  function cambiarPeriodo(p: string) {
    setPeriodo(p);
    setLoading(true);
    cargar(p);
  }

  return (
    <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <BottomNav />
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar title="Dashboard" />
        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 overflow-auto">

          {/* ── Header ── */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between mb-5">
            <div>
              <h2 className="text-lg font-bold text-[var(--shelfy-text)]">Resumen general</h2>
              <p className="text-sm text-[var(--shelfy-muted)]">{user?.nombre_empresa}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex gap-1 bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] rounded-lg p-1">
                {["hoy", "mes", "historico"].map((p) => (
                  <button key={p} onClick={() => cambiarPeriodo(p)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all
                      ${periodo === p ? "bg-[var(--shelfy-primary)] text-white shadow-sm" : "text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"}`}>
                    {PERIODO_LABELS[p]}
                  </button>
                ))}
              </div>
              <button onClick={() => cargar()} title="Recargar"
                className="p-2 text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] border border-[var(--shelfy-border)] rounded-lg bg-[var(--shelfy-panel)] transition-colors">
                <RefreshCw size={14} />
              </button>
            </div>
          </div>

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
                <KpiCard label="Pendientes" value={kpis.pendientes} icon={<Clock size={20} />}       color="#D97706" bgColor="bg-amber-50" />
                <KpiCard label="Aprobadas"  value={kpis.aprobadas}  icon={<CheckCircle size={20} />} color="#059669" bgColor="bg-emerald-50" />
                <KpiCard label="Destacadas" value={kpis.destacadas} icon={<Star size={20} />}        color="#7C3AED" bgColor="bg-violet-50" />
                <KpiCard label="Rechazadas" value={kpis.rechazadas} icon={<XCircle size={20} />}     color="#DC2626" bgColor="bg-red-50" />
              </div>

              {/* ── Fila 2: Carousel GRANDE centrado ── */}
              {ultimas.length > 0 && (
                <CarouselGrande items={ultimas} />
              )}

              {/* ── Fila 3: Ranking + Sucursales ── */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Ranking */}
                {ranking.length > 0 && (
                  <Card>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-[var(--shelfy-text)] font-semibold text-sm">Ranking de supervisores</h3>
                      <span className="text-xs text-[var(--shelfy-muted)] bg-[var(--shelfy-bg)] px-2 py-0.5 rounded-full border border-[var(--shelfy-border)]">
                        {PERIODO_LABELS[periodo]}
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[var(--shelfy-muted)] text-left border-b border-[var(--shelfy-border)]">
                            <th className="pb-2 pr-3 w-8">#</th>
                            <th className="pb-2 pr-3">Supervisor</th>
                            <th className="pb-2 pr-3 text-right text-green-600">AP</th>
                            <th className="pb-2 pr-3 text-right text-purple-600">DEST</th>
                            <th className="pb-2 pr-3 text-right text-red-500">REC</th>
                            <th className="pb-2 text-right">PTS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ranking.map((v, i) => (
                            <tr key={v.vendedor} className="border-b border-[var(--shelfy-border)] last:border-0 hover:bg-[var(--shelfy-bg)] transition-colors">
                              <td className="py-2.5 pr-3">
                                <span className={`text-xs font-bold ${
                                  i === 0 ? "text-yellow-500" : i === 1 ? "text-gray-400" : i === 2 ? "text-orange-400" : "text-[var(--shelfy-muted)]"
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
                )}

                {/* Sucursales + Total */}
                <div className="flex flex-col gap-5">
                  <GraficoSucursales data={sucursales} />
                  <Card>
                    <p className="text-xs text-[var(--shelfy-muted)] mb-1 uppercase tracking-wide font-semibold">Total exhibiciones</p>
                    <p className="text-4xl font-bold text-[var(--shelfy-text)]">{kpis.total}</p>
                    <p className="text-xs text-[var(--shelfy-muted)] mt-1">{PERIODO_LABELS[periodo]}</p>
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
