"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { PageSpinner } from "@/components/ui/Spinner";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { fetchKPIs, fetchRanking, type KPIs, type VendedorRanking } from "@/lib/api";

export default function DashboardPage() {
  const { user } = useAuth();
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [ranking, setRanking] = useState<VendedorRanking[]>([]);
  const [periodo, setPeriodo] = useState("mes");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchKPIs(user.id_distribuidor, periodo),
      fetchRanking(user.id_distribuidor, periodo),
    ])
      .then(([k, r]) => { setKpis(k); setRanking(r); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user, periodo]);

  return (
    <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar title="Dashboard" />
        <main className="flex-1 p-6 overflow-auto">
          {/* Selector de período */}
          <div className="flex gap-2 mb-6">
            {["hoy", "mes", "historico"].map((p) => (
              <button
                key={p}
                onClick={() => setPeriodo(p)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors capitalize
                  ${periodo === p
                    ? "bg-[var(--shelfy-primary)] text-white"
                    : "bg-[var(--shelfy-panel)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] border border-[var(--shelfy-border)]"
                  }`}
              >
                {p === "historico" ? "Histórico" : p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>

          {loading && <PageSpinner />}
          {error && <p className="text-[var(--shelfy-error)] text-sm">{error}</p>}

          {!loading && kpis && (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <KpiCard label="Total" value={kpis.total} color="var(--shelfy-muted)" />
                <KpiCard label="Pendientes" value={kpis.pendientes} color="var(--shelfy-warning)" />
                <KpiCard label="Aprobadas" value={kpis.aprobadas} color="var(--shelfy-success)" />
                <KpiCard label="Rechazadas" value={kpis.rechazadas} color="var(--shelfy-error)" />
              </div>

              {/* Ranking */}
              {ranking.length > 0 && (
                <Card>
                  <h3 className="text-[var(--shelfy-text)] font-semibold mb-4">Ranking de vendedores</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[var(--shelfy-muted)] text-left border-b border-[var(--shelfy-border)]">
                          <th className="pb-2 pr-4">#</th>
                          <th className="pb-2 pr-4">Vendedor</th>
                          <th className="pb-2 pr-4 text-right">Aprobadas</th>
                          <th className="pb-2 pr-4 text-right">Destacadas</th>
                          <th className="pb-2 text-right">Puntos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ranking.map((v, i) => (
                          <tr key={v.vendedor} className="border-b border-[var(--shelfy-border)]/40 hover:bg-[var(--shelfy-bg)]/40">
                            <td className="py-2 pr-4 text-[var(--shelfy-muted)]">{i + 1}</td>
                            <td className="py-2 pr-4 text-[var(--shelfy-text)]">{v.vendedor}</td>
                            <td className="py-2 pr-4 text-right text-[var(--shelfy-success)]">{v.aprobadas}</td>
                            <td className="py-2 pr-4 text-right text-[var(--shelfy-primary)]">{v.destacadas}</td>
                            <td className="py-2 text-right font-semibold text-[var(--shelfy-text)]">{v.puntos}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </>
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
