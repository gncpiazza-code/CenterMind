"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { PageSpinner } from "@/components/ui/Spinner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
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
import { ChevronLeft, ChevronRight, ImageOff, RefreshCw } from "lucide-react";

const PERIODO_LABELS: Record<string, string> = {
  hoy: "HOY",
  mes: "MES",
  historico: "HISTÓRICO",
};

// ── Carousel de últimas evaluadas ───────────────────────────────────────────

function Carousel({ items }: { items: UltimaEvaluada[] }) {
  const [ci, setCi] = useState(0);
  if (items.length === 0) return null;
  const item = items[ci];
  const fileId = extractDriveId(item.drive_link);
  const imgSrc = fileId ? getImageUrl(fileId) : null;
  const [imgErr, setImgErr] = useState(false);

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[var(--shelfy-text)] font-semibold text-sm">Últimas evaluadas</h3>
        <span className="text-xs text-[var(--shelfy-muted)]">{ci + 1} / {items.length}</span>
      </div>

      <div className="relative aspect-video bg-[var(--shelfy-bg)] rounded-lg overflow-hidden mb-3">
        {imgSrc && !imgErr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgSrc} alt="Exhibición evaluada" className="w-full h-full object-cover"
            onError={() => setImgErr(true)} />
        ) : (
          <div className="flex items-center justify-center h-full text-[var(--shelfy-muted)]">
            <ImageOff size={32} className="opacity-40" />
          </div>
        )}
        {/* Overlay con info */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
          <p className="text-white text-sm font-medium">{item.vendedor}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-white/70 text-xs">{item.nro_cliente} · {item.tipo_pdv}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium
              ${item.estado === "Destacado" ? "bg-purple-500/80 text-white" : "bg-green-500/80 text-white"}`}>
              {item.estado}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button onClick={() => { setCi((i) => Math.max(0, i - 1)); setImgErr(false); }}
          disabled={ci === 0}
          className="p-1 text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] disabled:opacity-30">
          <ChevronLeft size={20} />
        </button>
        {/* Dots */}
        <div className="flex gap-1.5">
          {items.map((_, i) => (
            <button key={i} onClick={() => { setCi(i); setImgErr(false); }}
              className={`w-1.5 h-1.5 rounded-full transition-colors
                ${i === ci ? "bg-[var(--shelfy-primary)]" : "bg-[var(--shelfy-border)]"}`} />
          ))}
        </div>
        <button onClick={() => { setCi((i) => Math.min(items.length - 1, i + 1)); setImgErr(false); }}
          disabled={ci >= items.length - 1}
          className="p-1 text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] disabled:opacity-30">
          <ChevronRight size={20} />
        </button>
      </div>
    </Card>
  );
}

// ── Gráfico por sucursal ─────────────────────────────────────────────────────

function GraficoSucursales({ data }: { data: SucursalStats[] }) {
  if (data.length <= 1) return null;
  return (
    <Card>
      <h3 className="text-[var(--shelfy-text)] font-semibold text-sm mb-4">Rendimiento por sucursal</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
          <XAxis dataKey="sucursal" tick={{ fill: "var(--shelfy-muted)", fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: "var(--shelfy-muted)", fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: "var(--shelfy-panel)", border: "1px solid var(--shelfy-border)", borderRadius: 8 }}
            labelStyle={{ color: "var(--shelfy-text)" }}
            itemStyle={{ color: "var(--shelfy-muted)" }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: "var(--shelfy-muted)" }} />
          <Bar dataKey="aprobadas" name="Aprobadas" fill="#10B981" radius={[4, 4, 0, 0]} />
          <Bar dataKey="rechazadas" name="Rechazadas" fill="#EF4444" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────

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

  // Auto-refresh cada 60 segundos
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
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar title="Dashboard" />
        <main className="flex-1 p-4 md:p-6 overflow-auto">

          {/* ── Selector de período ── */}
          <div className="flex gap-2 mb-6 flex-wrap">
            {["hoy", "mes", "historico"].map((p) => (
              <button key={p} onClick={() => cambiarPeriodo(p)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors
                  ${periodo === p
                    ? "bg-[var(--shelfy-primary)] text-white"
                    : "bg-[var(--shelfy-panel)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] border border-[var(--shelfy-border)]"
                  }`}>
                {PERIODO_LABELS[p]}
              </button>
            ))}
            <button onClick={() => cargar()} title="Forzar recarga"
              className="ml-auto p-1.5 text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] border border-[var(--shelfy-border)] rounded-lg">
              <RefreshCw size={14} />
            </button>
          </div>

          {loading && <PageSpinner />}
          {error && <p className="text-[var(--shelfy-error)] text-sm mb-4">{error}</p>}

          {!loading && kpis && (
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
              {/* ── Columna izquierda ── */}
              <div className="flex flex-col gap-6">
                {/* KPI cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <KpiCard label="Pendientes" value={kpis.pendientes} color="var(--shelfy-warning)" />
                  <KpiCard label="Aprobadas"  value={kpis.aprobadas}  color="var(--shelfy-success)" />
                  <KpiCard label="Destacadas" value={kpis.destacadas} color="var(--shelfy-primary)" />
                  <KpiCard label="Rechazadas" value={kpis.rechazadas} color="var(--shelfy-error)" />
                </div>

                {/* Gráfico sucursales */}
                <GraficoSucursales data={sucursales} />

                {/* Ranking */}
                {ranking.length > 0 && (
                  <Card>
                    <h3 className="text-[var(--shelfy-text)] font-semibold mb-4 text-sm">
                      Ranking de vendedores · {PERIODO_LABELS[periodo]}
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[var(--shelfy-muted)] text-left border-b border-[var(--shelfy-border)]">
                            <th className="pb-2 pr-3 w-8">#</th>
                            <th className="pb-2 pr-3">Vendedor</th>
                            <th className="pb-2 pr-3 text-right">AP</th>
                            <th className="pb-2 pr-3 text-right">DEST</th>
                            <th className="pb-2 pr-3 text-right">REC</th>
                            <th className="pb-2 text-right">PTS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ranking.map((v, i) => (
                            <tr key={v.vendedor} className="border-b border-[var(--shelfy-border)]/40 hover:bg-[var(--shelfy-bg)]/40">
                              <td className="py-2 pr-3">
                                <span className={`text-xs font-bold ${
                                  i === 0 ? "text-yellow-400" : i === 1 ? "text-gray-400" : i === 2 ? "text-orange-400" : "text-[var(--shelfy-muted)]"
                                }`}>{i === 0 ? "👑" : `#${i + 1}`}</span>
                              </td>
                              <td className="py-2 pr-3 text-[var(--shelfy-text)] font-medium">{v.vendedor}</td>
                              <td className="py-2 pr-3 text-right text-[var(--shelfy-success)]">{v.aprobadas}</td>
                              <td className="py-2 pr-3 text-right text-[var(--shelfy-primary)]">{v.destacadas}</td>
                              <td className="py-2 pr-3 text-right text-[var(--shelfy-error)]">{v.rechazadas}</td>
                              <td className="py-2 text-right font-bold text-[var(--shelfy-text)]">{v.puntos}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}
              </div>

              {/* ── Columna derecha: carousel ── */}
              <div className="flex flex-col gap-4">
                <Carousel items={ultimas} />

                {/* Total */}
                <Card>
                  <p className="text-xs text-[var(--shelfy-muted)] mb-1">Total exhibiciones</p>
                  <p className="text-4xl font-bold text-[var(--shelfy-text)]">{kpis.total}</p>
                  <p className="text-xs text-[var(--shelfy-muted)] mt-1">{PERIODO_LABELS[periodo]}</p>
                </Card>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card>
      <p className="text-xs text-[var(--shelfy-muted)] mb-1">{label}</p>
      <p className="text-3xl font-bold" style={{ color }}>{value}</p>
    </Card>
  );
}
