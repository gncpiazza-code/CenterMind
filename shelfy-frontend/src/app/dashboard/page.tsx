"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  fetchKPIs, fetchRanking, fetchUltimasEvaluadas, fetchPorSucursal,
  fetchEvolucionTiempo, fetchRendimientoCiudad, fetchPorEmpresa,
} from "@/lib/api";
import type {
  KPIs, VendedorRanking, UltimaEvaluada, SucursalStats, EvolucionTiempo, RendimientoCiudad,
} from "@/lib/api";
import {
  Clock, CheckCircle, Star, XCircle
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
  if (/^\d{4}-\d{2}$/.test(periodo)) {
    const [y, m] = periodo.split("-").map(Number);
    return `${MESES_ES[m - 1]} ${y}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(periodo)) {
    const [y, m, d] = periodo.split("-").map(Number);
    return `${d} de ${MESES_ES[m - 1]} ${y}`;
  }
  return periodo;
}

const kpiVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const kpiItemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

// Mejora #23: Variantes para entrada staggered de secciones
const sectionVariants = {
  hidden: { opacity: 0, y: 24 },
  show: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: delay * 0.1, duration: 0.4, ease: "easeOut" as const },
  }),
};

// ── Página principal ──────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const initVars = getCurrentYearMonth();

  const [year, setYear] = useState(initVars.year);
  const [month, setMonth] = useState(initVars.month);
  const [day, setDay] = useState(initVars.day);
  const [sucursalFiltro, setSucursalFiltro] = useState("");

  const periodo = periodoString(year, month, day);
  const distId = user?.id_distribuidor || 0;
  const isSuper = user?.is_superadmin;

  const enabled = !!user;

  // Mejora #6: onRefresh conectado a queryClient.invalidateQueries
  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const { data: kpis, isLoading: loadingKpis, isFetching: fetchingKpis, error: errorKpis } = useQuery<KPIs>({
    queryKey: ["dashboard", "kpis", distId, periodo, sucursalFiltro],
    queryFn: () => fetchKPIs(distId, periodo, sucursalFiltro),
    enabled,
    placeholderData: (prev: unknown) => prev as KPIs | undefined,
    refetchInterval: 90_000,
  });

  const { data: ranking = [], isLoading: loadingRanking, isFetching: fetchingRanking, error: errorRanking } = useQuery<VendedorRanking[]>({
    queryKey: ["dashboard", "ranking", distId, periodo, sucursalFiltro],
    queryFn: () => fetchRanking(distId, periodo, sucursalFiltro),
    enabled,
    placeholderData: (prev: unknown) => prev as VendedorRanking[] | undefined,
    refetchInterval: 90_000,
  });

  const { data: ultimas = [], isLoading: loadingUltimas, isFetching: fetchingUltimas } = useQuery<UltimaEvaluada[]>({
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

  // Mejora #24: estados de refetch (datos placeholder visibles pero actualizando)
  const isFetchingLeft = fetchingUltimas && !loadingUltimas;
  const isFetchingRight = (fetchingKpis && !loadingKpis) || (fetchingRanking && !loadingRanking);

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
        {/* Mejora #9: Background blobs violet/indigo */}
        <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-violet-500/5 blur-[100px] pointer-events-none" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-500/5 blur-[100px] pointer-events-none" />

        <Topbar title="Dashboard en Vivo" />

        <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6 overflow-y-auto w-full max-w-[1800px] mx-auto z-10 custom-scrollbar">

          {/* Mejora #23: FiltrosBar entra primero (delay 0) */}
          <motion.div
            variants={sectionVariants}
            initial="hidden"
            animate="show"
            custom={0}
          >
            <FiltrosBar
              year={year} month={month} day={day}
              sucursalFiltro={sucursalFiltro} sucursales={sucursales}
              onDateChange={handleDateChange}
              onSucursal={setSucursalFiltro}
              onRefresh={handleRefresh}
            />
          </motion.div>

          {error && (
            <Alert variant="destructive" className="mb-6 rounded-3xl">
              <XCircle className="size-4" />
              <AlertDescription className="text-sm font-black">
                Falló la conexión de red con el servidor ({error instanceof Error ? error.message : "Error al cargar"}). Asegúrese de encender el backend de la API e intente nuevamente.
              </AlertDescription>
            </Alert>
          )}

          {/* Mejora #26: Grid 3fr 2fr en lugar de 50/50 */}
          <div className="grid grid-cols-1 xl:grid-cols-[3fr_2fr] gap-8 h-auto xl:h-[calc(100vh-220px)] min-h-[850px]">

            {/* LADO IZQUIERDO: Carrusel masivo y Gráficos — Mejora #23 delay 1 */}
            <motion.div
              className="flex flex-col gap-6 xl:h-full relative"
              variants={sectionVariants}
              initial="hidden"
              animate="show"
              custom={1}
            >
              {/* Mejora #24: Loading overlay izquierdo */}
              {isFetchingLeft && (
                <div className="absolute inset-0 bg-white/30 rounded-[2rem] backdrop-blur-[1px] z-50 flex items-center justify-center pointer-events-none">
                  <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              <div className="flex-1 min-h-[500px]">
                {loading && ultimas.length === 0 ? (
                  <Card className="h-full flex items-center justify-center p-12 bg-white rounded-[2.5rem]">
                    <Skeleton className="h-8 w-full" />
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
            </motion.div>

            {/* LADO DERECHO: Métricas & Ranking — Mejora #23 delay 2 */}
            <motion.div
              className="flex flex-col gap-6 xl:h-full relative"
              variants={sectionVariants}
              initial="hidden"
              animate="show"
              custom={2}
            >
              {/* Mejora #24: Loading overlay derecho */}
              {isFetchingRight && (
                <div className="absolute inset-0 bg-white/30 rounded-[2rem] backdrop-blur-[1px] z-50 flex items-center justify-center pointer-events-none">
                  <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}

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
                    <KpiCard
                      label="Aprobadas"
                      value={kpis.aprobadas}
                      icon={<CheckCircle size={20} />}
                      color="#10b981"
                      bgColor="bg-white"
                      total={kpis.aprobadas + kpis.rechazadas}
                    />
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
                    <Skeleton key={i} className="h-24 w-full rounded-[2rem]" />
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
            </motion.div>

          </div>

        </main>
      </div>
    </div>
  );
}
