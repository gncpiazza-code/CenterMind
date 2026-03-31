"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
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

const MESES_ES = [
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

function formatPeriodoLabel(periodo: string): string {
  const now = new Date();

  if (periodo === "mes") {
    return `${MESES_ES[now.getMonth()]} ${now.getFullYear()}`;
  }
  if (periodo === "hoy") {
    return `Hoy ${now.toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })}`;
  }
  // "2026-03"
  if (/^\d{4}-\d{2}$/.test(periodo)) {
    const [y, m] = periodo.split("-").map(Number);
    return `${MESES_ES[m - 1]} ${y}`;
  }
  // "2026-03-15" — a specific day
  if (/^\d{4}-\d{2}-\d{2}$/.test(periodo)) {
    const [y, m, d] = periodo.split("-").map(Number);
    return `${d} de ${MESES_ES[m - 1]} ${y}`;
  }
  return periodo;
}

const kpiVariants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const kpiItemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

// ── Página principal ──────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const initVars = getCurrentYearMonth();

  const [year, setYear] = useState(initVars.year);
  const [month, setMonth] = useState(initVars.month);
  const [day, setDay] = useState(initVars.day);
  const [sucursalFiltro, setSucursalFiltro] = useState("");

  const periodo = periodoString(year, month, day);
  const distId = user?.id_distribuidor || 0;
  const isSuper = user?.is_superadmin;

  useEffect(() => {
    const locallySeen = typeof window !== "undefined" && localStorage.getItem("shelfy_tutorial_v2_seen") === "true";
    if (user?.show_tutorial && !locallySeen) {
      router.replace("/tutorial");
    }
  }, [user, router]);

  const enabled = !!user;

  const { data: kpis, isLoading: loadingKpis, error: errorKpis } = useQuery<KPIs>({
    queryKey: ["dashboard", "kpis", distId, periodo, sucursalFiltro],
    queryFn: () => fetchKPIs(distId, periodo, sucursalFiltro),
    enabled,
    placeholderData: (prev: unknown) => prev as KPIs | undefined,
    refetchInterval: 90_000,
  });

  const { data: ranking = [], isLoading: loadingRanking, error: errorRanking } = useQuery<VendedorRanking[]>({
    queryKey: ["dashboard", "ranking", distId, periodo, sucursalFiltro],
    queryFn: () => fetchRanking(distId, periodo, sucursalFiltro),
    enabled,
    placeholderData: (prev: unknown) => prev as VendedorRanking[] | undefined,
    refetchInterval: 90_000,
  });

  const { data: ultimas = [], isLoading: loadingUltimas } = useQuery<UltimaEvaluada[]>({
    queryKey: ["dashboard", "ultimas", distId, sucursalFiltro],
    queryFn: () => fetchUltimasEvaluadas(distId, 12, sucursalFiltro),
    enabled,
    placeholderData: (prev: unknown) => prev as UltimaEvaluada[] | undefined,
    refetchInterval: 90_000,
  });

  const { data: sucursales = [], isLoading: loadingSucursales } = useQuery<SucursalStats[]>({
    queryKey: ["dashboard", "sucursales", distId, periodo, sucursalFiltro],
    queryFn: () => fetchPorSucursal(distId, periodo, sucursalFiltro),
    enabled,
    placeholderData: (prev: unknown) => prev as SucursalStats[] | undefined,
    refetchInterval: 90_000,
  });

  const { data: evolucion = [] } = useQuery<EvolucionTiempo[]>({
    queryKey: ["dashboard", "evolucion", distId, periodo, sucursalFiltro],
    queryFn: () => fetchEvolucionTiempo(distId, periodo, sucursalFiltro),
    enabled,
    placeholderData: (prev: unknown) => prev as EvolucionTiempo[] | undefined,
    refetchInterval: 90_000,
  });

  const { data: ciudades = [] } = useQuery<RendimientoCiudad[]>({
    queryKey: ["dashboard", "ciudades", distId, periodo, sucursalFiltro],
    queryFn: () => fetchRendimientoCiudad(distId, periodo, sucursalFiltro),
    enabled,
    placeholderData: (prev: unknown) => prev as RendimientoCiudad[] | undefined,
    refetchInterval: 90_000,
  });

  const { data: empresas = [] } = useQuery<RendimientoCiudad[]>({
    queryKey: ["dashboard", "empresas", periodo, sucursalFiltro],
    queryFn: () => isSuper ? fetchPorEmpresa(periodo, sucursalFiltro) : Promise.resolve([]),
    enabled,
    placeholderData: (prev: unknown) => prev as RendimientoCiudad[] | undefined,
    refetchInterval: 90_000,
  });

  const loading = loadingKpis || loadingRanking || loadingUltimas || loadingSucursales;
  const error = errorKpis || errorRanking;

  function handleDateChange(y: number, m: number, d: number) {
    setYear(y); setMonth(m); setDay(d);
    setSucursalFiltro("");
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
            onRefresh={() => {}}
          />

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-3xl px-5 py-4 text-sm font-black mb-6 flex items-center gap-3 shadow-md">
              <XCircle size={20} className="text-red-500" />
              Falló la conexión de red con el servidor ({error instanceof Error ? error.message : "Error al cargar"}). Asegúrese de encender el backend de la API e intente nuevamente.
            </div>
          )}

          {/* Layout 50/50 principal */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 h-auto xl:h-[calc(100vh-220px)] min-h-[850px]">

            {/* LADO IZQUIERDO: Carrusel masivo y Gráficos */}
            <div className="flex flex-col gap-6 xl:h-full">
              <div className="flex-1 min-h-[500px]">
                {loading && ultimas.length === 0 ? (
                  <Card className="h-full flex items-center justify-center p-12 bg-white rounded-[2.5rem]">
                    <div className="animate-pulse bg-white/5 rounded h-8 w-full" />
                  </Card>
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
              {kpis ? (
                <motion.div
                  className="grid grid-cols-2 lg:grid-cols-4 gap-4 shrink-0"
                  variants={kpiVariants}
                  initial="hidden"
                  animate="show"
                >
                  <motion.div variants={kpiItemVariants}>
                    <KpiCard label="Pendientes" value={kpis.pendientes} icon={<Clock size={20} />} color="#f59e0b" bgColor="bg-white" />
                  </motion.div>
                  <motion.div variants={kpiItemVariants}>
                    <KpiCard label="Aprobadas" value={kpis.aprobadas} icon={<CheckCircle size={20} />} color="#10b981" bgColor="bg-white" />
                  </motion.div>
                  <motion.div variants={kpiItemVariants}>
                    <KpiCard label="Destacadas" value={kpis.destacadas} icon={<Star size={20} />} color="#8b5cf6" bgColor="bg-gradient-to-br from-violet-50/50 to-fuchsia-50/50" />
                  </motion.div>
                  <motion.div variants={kpiItemVariants}>
                    <KpiCard label="Rechazadas" value={kpis.rechazadas} icon={<XCircle size={20} />} color="#ef4444" bgColor="bg-white" />
                  </motion.div>
                </motion.div>
              ) : loadingKpis ? (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse bg-white/5 rounded h-24 w-full" />
                  ))}
                </div>
              ) : null}

              {/* RANKING TOP 15 */}
              <div className="flex-1 min-h-0">
                <RankingTable
                  ranking={rankingFiltrado}
                  periodo={periodo}
                  periodoLabel={formatPeriodoLabel(periodo)}
                  sucursalFiltro={sucursalFiltro}
                  sucursales={sucursales}
                  kpis={kpis ?? null}
                  evolucion={evolucion}
                  distId={user?.id_distribuidor || 0}
                  nombreEmpresa={user?.nombre_empresa || "Distribuidora"}
                />
              </div>
            </div>

          </div>

        </main>
      </div>
    </div>
  );
}
