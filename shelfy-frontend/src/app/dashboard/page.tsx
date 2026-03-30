"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { PageSpinner } from "@/components/ui/Spinner";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import {
  fetchKPIs, fetchRanking, fetchUltimasEvaluadas, fetchPorSucursal,
  fetchEvolucionTiempo, fetchRendimientoCiudad, fetchPorEmpresa,
  type KPIs, type VendedorRanking, type UltimaEvaluada, type SucursalStats,
  type EvolucionTiempo, type RendimientoCiudad,
} from "@/lib/api";
import {
  Clock, CheckCircle, Star, XCircle
} from "lucide-react";

// Dashboard Components
import { KpiCard } from "@/components/dashboard/KpiCard";
import { HeroCarousel } from "@/components/dashboard/HeroCarousel";
import { ChartCarousel } from "@/components/dashboard/ChartCarousel";
import { RankingTable } from "@/components/dashboard/RankingTable";
import { FiltrosBar } from "@/components/dashboard/FiltrosBar";

// ── Helpers ─────────────────────────────────────────────────────────────────

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

// ── Página principal ──────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const initVars = getCurrentYearMonth();

  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [ranking, setRanking] = useState<VendedorRanking[]>([]);
  const [ultimas, setUltimas] = useState<UltimaEvaluada[]>([]);
  const [sucursales, setSucursales] = useState<SucursalStats[]>([]);
  const [evolucion, setEvolucion] = useState<EvolucionTiempo[]>([]);
  const [ciudades, setCiudades] = useState<RendimientoCiudad[]>([]);
  const [empresas, setEmpresas] = useState<RendimientoCiudad[]>([]);

  const [year, setYear] = useState(initVars.year);
  const [month, setMonth] = useState(initVars.month);
  const [day, setDay] = useState(initVars.day);
  const [sucursalFiltro, setSucursalFiltro] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const periodo = periodoString(year, month, day);

  const cargar = useCallback(async (p = periodo, sId = sucursalFiltro) => {
    if (!user) return;
    setError(null);
    try {
      const distId = user?.id_distribuidor || 0;
      const isSuper = user?.is_superadmin;

      const [k, r, u, s, ev, ci, emp] = await Promise.all([
        fetchKPIs(distId, p, sId),
        fetchRanking(distId, p, sId),
        fetchUltimasEvaluadas(distId, 12, sId),
        fetchPorSucursal(distId, p, sId),
        fetchEvolucionTiempo(distId, p, sId),
        fetchRendimientoCiudad(distId, p, sId),
        isSuper ? fetchPorEmpresa(p, sId) : Promise.resolve([]),
      ]);
      setKpis(k); setRanking(r); setUltimas(u); setSucursales(s);
      setEvolucion(ev); setCiudades(ci); setEmpresas(emp);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [user, periodo, sucursalFiltro]);

  useEffect(() => {
    const locallySeen = typeof window !== "undefined" && localStorage.getItem("shelfy_tutorial_v2_seen") === "true";
    console.log("DEBUG: Dashboard check - user.show_tutorial:", user?.show_tutorial, "locallySeen:", locallySeen);
    if (user?.show_tutorial && !locallySeen) {
      console.log("DEBUG: Redirection condition met! Redirecting to /tutorial");
      router.replace("/tutorial");
    }
  }, [user, router]);

  useEffect(() => { cargar(); }, [cargar]);

  // Auto-refresh cada 90s
  useEffect(() => {
    const t = setInterval(() => cargar(), 90_000);
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
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-3xl px-5 py-4 text-sm font-black mb-6 flex items-center gap-3 shadow-md">
              <XCircle size={20} className="text-red-500" />
              Falló la conexión de red con el servidor ({error}). Asegúrese de encender el backend de la API e intente nuevamente.
            </div>
          )}

          {/* Layout 50/50 principal */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 h-auto xl:h-[calc(100vh-220px)] min-h-[850px]">

            {/* LADO IZQUIERDO: Carrusel masivo y Gráficos */}
            <div className="flex flex-col gap-6 xl:h-full">
              <div className="flex-1 min-h-[500px]">
                {loading && ultimas.length === 0 ? (
                  <Card className="h-full flex items-center justify-center p-12 bg-white rounded-[2.5rem]"><PageSpinner /></Card>
                ) : (
                  <HeroCarousel items={ultimas} />
                )}
              </div>
              
              <div className="shrink-0">
                <ChartCarousel 
                   sucursales={sucursales}
                   evolucion={evolucion}
                   ciudades={ciudades}
                   empresas={empresas}
                 />
              </div>
            </div>

            {/* LADO DERECHO: Métricas & Ranking */}
            <div className="flex flex-col gap-6 xl:h-full">
              {/* KPIs ROW */}
              {kpis && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
                  <KpiCard label="Pendientes" value={kpis.pendientes} icon={<Clock size={20} />} color="#f59e0b" bgColor="bg-white" />
                  <KpiCard label="Aprobadas" value={kpis.aprobadas} icon={<CheckCircle size={20} />} color="#10b981" bgColor="bg-white" />
                  <KpiCard label="Destacadas" value={kpis.destacadas} icon={<Star size={20} />} color="#8b5cf6" bgColor="bg-gradient-to-br from-violet-50/50 to-fuchsia-50/50" />
                  <KpiCard label="Rechazadas" value={kpis.rechazadas} icon={<XCircle size={20} />} color="#ef4444" bgColor="bg-white" />
                </div>
              )}

              {/* RANKING TOP 15 */}
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
