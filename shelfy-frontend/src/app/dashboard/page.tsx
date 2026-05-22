"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  fetchKPIs, fetchRanking, fetchUltimasEvaluadas, fetchPorSucursal,
  fetchEvolucionTiempo, getWSUrl,
} from "@/lib/api";
import type {
  KPIs, VendedorRanking, UltimaEvaluada, SucursalStats, EvolucionTiempo,
} from "@/lib/api";
import { Clock, CheckCircle, Star, XCircle, TrendingUp, BarChart2, ChevronDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { KpiCard } from "@/components/dashboard/KpiCard";
import { HeroCarousel } from "@/components/dashboard/HeroCarousel";
import { ChartCarousel } from "@/components/dashboard/ChartCarousel";
import { RankingTable } from "@/components/dashboard/RankingTable";
import { FiltrosBar } from "@/components/dashboard/FiltrosBar";
import { CCDifusionGuiaDialog } from "@/components/onboarding/CCDifusionGuiaDialog";

// ── Helpers ──────────────────────────────────────────────────────────────────

const MESES_ES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
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
  if (periodo === "mes") return `${MESES_ES[now.getMonth()]} ${now.getFullYear()}`;
  if (periodo === "hoy") return `Hoy ${now.toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })}`;
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

const sectionVariants = {
  hidden: { opacity: 0, y: 24 },
  show: (delay: number) => ({
    opacity: 1, y: 0,
    transition: { delay: delay * 0.1, duration: 0.4, ease: "easeOut" as const },
  }),
};

// ── Página principal ──────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, effectiveDistribuidorId } = useAuth();
  const queryClient    = useQueryClient();
  const initVars       = getCurrentYearMonth();

  const [year, setYear]                 = useState(initVars.year);
  const [month, setMonth]               = useState(initVars.month);
  const [day, setDay]                   = useState(initVars.day);
  const [sucursalFiltro, setSucursalFiltro] = useState("");

  // Mejora #18: último update exitoso
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const prevKpisRef = useRef<KPIs | undefined>(undefined);

  const periodo = periodoString(year, month, day);
  const distId = effectiveDistribuidorId ?? 0;
  const isSuper = user?.is_superadmin;
  const enabled = !!user && distId > 0;
  const isCompania =
    isSuper ||
    (user?.rol ?? "").toLowerCase() === "directorio" ||
    (user?.rol ?? "").toLowerCase() === "superadmin";

  // Mejora #17: estado de refresh manual
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  // Panel de análisis (gráficos) colapsado por defecto — First View sin scroll de página
  const [chartsExpanded, setChartsExpanded] = useState(false);

  // KPI rotating groups: 0 = grupo A (Pendientes/Aprobadas/Destacadas), 1 = grupo B (Rechazadas/Tasa/Total)
  const [kpiGroup, setKpiGroup] = useState(0);
  const kpiGroupRef = useRef(0);
  useEffect(() => {
    const interval = setInterval(() => {
      kpiGroupRef.current = (kpiGroupRef.current + 1) % 2;
      setKpiGroup(kpiGroupRef.current);
    }, 7000);
    return () => clearInterval(interval);
  }, []);

  function handleRefresh() {
    setIsManualRefreshing(true);
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    // El flag se resetea cuando los queries terminan (ver useEffect abajo)
  }

  const { data: kpis, isLoading: loadingKpis, isFetching: fetchingKpis, error: errorKpis } = useQuery<KPIs>({
    queryKey: ["dashboard","kpis",distId,periodo,sucursalFiltro],
    queryFn: () => fetchKPIs(distId, periodo, sucursalFiltro),
    enabled, placeholderData: (prev: unknown) => prev as KPIs | undefined, refetchInterval: 90_000,
  });

  const { data: ranking = [], isLoading: loadingRanking, isFetching: fetchingRanking, error: errorRanking } = useQuery<VendedorRanking[]>({
    queryKey: ["dashboard","ranking",distId,periodo,sucursalFiltro],
    queryFn: () => fetchRanking(distId, periodo, sucursalFiltro),
    enabled, placeholderData: (prev: unknown) => prev as VendedorRanking[] | undefined, refetchInterval: 90_000,
  });

  const { data: ultimas = [], isLoading: loadingUltimas, isFetching: fetchingUltimas } = useQuery<UltimaEvaluada[]>({
    queryKey: ["dashboard","ultimas",distId,sucursalFiltro],
    queryFn: () => fetchUltimasEvaluadas(distId, 12, sucursalFiltro),
    enabled, placeholderData: (prev: unknown) => prev as UltimaEvaluada[] | undefined, refetchInterval: 90_000,
  });

  const { data: sucursales = [], isLoading: loadingSucursales } = useQuery<SucursalStats[]>({
    queryKey: ["dashboard","sucursales",distId,periodo,sucursalFiltro],
    queryFn: () => fetchPorSucursal(distId, periodo, sucursalFiltro),
    enabled, placeholderData: (prev: unknown) => prev as SucursalStats[] | undefined, refetchInterval: 90_000,
  });

  const { data: evolucion = [] } = useQuery<EvolucionTiempo[]>({
    queryKey: ["dashboard","evolucion",distId,periodo,sucursalFiltro],
    queryFn: () => fetchEvolucionTiempo(distId, periodo, sucursalFiltro),
    enabled, placeholderData: (prev: unknown) => prev as EvolucionTiempo[] | undefined, refetchInterval: 90_000,
  });

  const loading = loadingKpis || loadingRanking || loadingUltimas || loadingSucursales;
  const error   = errorKpis || errorRanking;

  const isFetchingLeft  = fetchingUltimas && !loadingUltimas;
  const isFetchingRight = (fetchingKpis && !loadingKpis) || (fetchingRanking && !loadingRanking);
  const isAnyFetching   = fetchingKpis || fetchingRanking || fetchingUltimas;

  // Mejora #18: registrar cuando los datos llegan exitosamente
  useEffect(() => {
    if (kpis && kpis !== prevKpisRef.current) {
      setLastUpdated(new Date());
      setIsManualRefreshing(false);
      prevKpisRef.current = kpis;
    }
  }, [kpis]);

  // Reset manual refresh si se cancela
  useEffect(() => {
    if (!isAnyFetching && isManualRefreshing) {
      setIsManualRefreshing(false);
    }
  }, [isAnyFetching, isManualRefreshing]);

  // Realtime: WS listener que invalida ranking/KPIs al recibir evaluaciones o nuevas fotos
  useEffect(() => {
    if (!distId) return;
    let socket: WebSocket | null = null;
    let alive = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      socket = new WebSocket(getWSUrl(distId));
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "new_exhibition" || data.type === "evaluation_updated") {
            queryClient.invalidateQueries({ queryKey: ["dashboard", "kpis"] });
            queryClient.invalidateQueries({ queryKey: ["dashboard", "ranking"] });
          }
        } catch {}
      };
      socket.onclose = () => {
        if (!alive) return;
        reconnectTimer = setTimeout(connect, 5000);
      };
      socket.onerror = () => {};
    };

    connect();

    return () => {
      alive = false;
      if (socket) socket.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [distId, queryClient]);

  function handleDateChange(y: number, m: number, d: number) {
    setYear(y); setMonth(m); setDay(d);
    setSucursalFiltro("");
  }

  // El servidor ya filtra por sucursal_id; este filter local es fallback por si el campo viene en la respuesta
  const rankingFiltrado = sucursalFiltro && ranking.some(v => v.location_id != null)
    ? ranking.filter(v => String(v.location_id ?? "") === String(sucursalFiltro))
    : ranking;

  // Mejora #24: tasa de aprobación calculada
  const tasaAprobacion = kpis && (kpis.aprobadas + kpis.rechazadas) > 0
    ? Math.round((kpis.aprobadas / (kpis.aprobadas + kpis.rechazadas)) * 100)
    : null;

  return (
    <div className="flex h-screen overflow-hidden font-sans" style={{ background: "var(--shelfy-bg)" }}>
      <Sidebar />
      <BottomNav />
      <div className="flex flex-col flex-1 min-w-0 relative h-full">

        {/* Mejora #19: blobs decorativos más visibles (5% → 10/12%) */}
        <div className="absolute top-[-15%] right-[-8%] w-[45%] h-[45%] rounded-full bg-violet-500/[0.10] blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] left-[-8%] w-[35%] h-[35%] rounded-full bg-indigo-500/[0.08] blur-[100px] pointer-events-none" />
        <div className="absolute top-[40%] left-[30%] w-[25%] h-[25%] rounded-full bg-fuchsia-500/[0.05] blur-[80px] pointer-events-none" />

        {/* Mejora #4: live prop en el Topbar */}
        <Topbar title="Dashboard" live />

        <main className="flex-1 flex flex-col min-h-0 overflow-hidden p-4 md:p-6 pb-20 md:pb-4 w-full max-w-[1800px] mx-auto z-10">

          <motion.div className="shrink-0" variants={sectionVariants} initial="hidden" animate="show" custom={0}>
            <FiltrosBar
              year={year} month={month} day={day}
              sucursalFiltro={sucursalFiltro} sucursales={sucursales}
              onDateChange={handleDateChange}
              onSucursal={setSucursalFiltro}
              onRefresh={handleRefresh}
              isRefreshing={isManualRefreshing || isAnyFetching}
              lastUpdated={lastUpdated}
            />
          </motion.div>

          {error && (
            <Alert variant="destructive" className="shrink-0 mb-3 rounded-3xl">
              <XCircle className="size-4" />
              <AlertDescription className="text-sm font-black">
                Falló la conexión de red con el servidor ({error instanceof Error ? error.message : "Error al cargar"}). Asegúrese de encender el backend de la API e intente nuevamente.
              </AlertDescription>
            </Alert>
          )}

          {/* KPIs generales — arriba, altura fija */}
          <motion.section
            className="shrink-0 mb-3"
            variants={sectionVariants}
            initial="hidden"
            animate="show"
            custom={1}
          >
            {kpis ? (
              <div className="relative">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    KPI generales
                  </p>
                  <div className="flex items-center gap-1.5">
                    {[0, 1].map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setKpiGroup(g)}
                        className={`h-1.5 rounded-full transition-all duration-300 ${
                          kpiGroup === g ? "bg-violet-500 w-4" : "w-1.5 bg-slate-300"
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={kpiGroup}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                    className="grid grid-cols-3 gap-2 md:gap-3"
                  >
                    {kpiGroup === 0 ? (
                      <>
                        <KpiCard variant="compact" label="Pendientes" value={kpis.pendientes} icon={<Clock size={16} />} colorName="amber" bgColor="bg-white" />
                        <KpiCard variant="compact" label="Aprobadas" value={kpis.aprobadas} icon={<CheckCircle size={16} />} colorName="emerald" bgColor="bg-white" total={kpis.aprobadas + kpis.rechazadas} />
                        <KpiCard variant="compact" label="Destacadas" value={kpis.destacadas} icon={<Star size={16} />} colorName="violet" bgColor="bg-gradient-to-br from-violet-50/60 to-fuchsia-50/40" />
                      </>
                    ) : (
                      <>
                        <KpiCard variant="compact" label="Rechazadas" value={kpis.rechazadas} icon={<XCircle size={16} />} colorName="red" bgColor="bg-white" />
                        <KpiCard variant="compact" label="Tasa Aprob." value={tasaAprobacion ?? 0} icon={<TrendingUp size={16} />} colorName="blue" bgColor="bg-white" subtitle={`de ${kpis.aprobadas + kpis.rechazadas} eval.`} />
                        <KpiCard variant="compact" label="Total" value={kpis.total} icon={<BarChart2 size={16} />} colorName="slate" bgColor="bg-white" subtitle="del período" />
                      </>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            ) : loadingKpis ? (
              <div className="grid grid-cols-3 gap-2 md:gap-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-2xl" />
                ))}
              </div>
            ) : null}
          </motion.section>

          {/* First view: carrusel + ranking — ocupa el alto disponible, sin scroll de página */}
          <div className="relative flex-1 min-h-0 w-full">
            <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-slate-200/60 to-transparent pointer-events-none z-10" />

            <div className="flex flex-col md:flex-row md:items-stretch gap-4 h-full min-h-0 overflow-hidden">
              <motion.div
                className="relative w-full md:w-1/2 md:min-w-0 flex flex-col min-h-0 flex-1 md:flex-none md:h-full"
                variants={sectionVariants}
                initial="hidden"
                animate="show"
                custom={2}
              >
                {isFetchingLeft && (
                  <div className="absolute inset-0 bg-white/30 rounded-[2rem] backdrop-blur-[1px] z-50 flex items-center justify-center pointer-events-none">
                    <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {loading && ultimas.length === 0 ? (
                  <Card className="h-full min-h-0 flex items-center justify-center p-12 bg-white rounded-[2.5rem]">
                    <Skeleton className="h-8 w-full" />
                  </Card>
                ) : (
                  <div className="h-full min-h-0 flex-1 overflow-hidden">
                    <HeroCarousel items={ultimas} compact />
                  </div>
                )}
              </motion.div>

              <motion.div
                className="relative w-full md:w-1/2 md:min-w-0 flex flex-col min-h-0 flex-1 md:flex-none md:h-full overflow-hidden"
                variants={sectionVariants}
                initial="hidden"
                animate="show"
                custom={3}
              >
                {isFetchingRight && (
                  <div className="absolute inset-0 bg-white/30 rounded-[2rem] backdrop-blur-[1px] z-50 flex items-center justify-center pointer-events-none">
                    <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                <div className="h-full min-h-0 overflow-hidden">
                  <RankingTable
                    dense
                    ranking={rankingFiltrado}
                    periodo={periodo}
                    periodoLabel={formatPeriodoLabel(periodo)}
                    sucursalFiltro={sucursalFiltro}
                    sucursales={sucursales}
                    kpis={kpis ?? null}
                    evolucion={evolucion}
                    distId={distId}
                    nombreEmpresa={user?.nombre_empresa || "Distribuidora"}
                    isCompania={isCompania}
                  />
                </div>
              </motion.div>
            </div>
          </div>

          {/* Panel análisis colapsable — colapsado por defecto para maximizar First View */}
          <div className="shrink-0 mt-2">
            <button
              type="button"
              onClick={() => setChartsExpanded(v => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 rounded-2xl border border-slate-200/50 bg-white/60 backdrop-blur-sm hover:bg-white/90 transition-all duration-200 text-slate-500 hover:text-slate-700 group shadow-sm"
            >
              <div className="flex items-center gap-2">
                <BarChart2 size={13} className="text-slate-400 group-hover:text-violet-500 transition-colors" />
                <span className="text-[10px] font-black uppercase tracking-widest">
                  Análisis — Evolución / Sucursales / Vendedores
                </span>
              </div>
              <ChevronDown
                size={14}
                className={cn(
                  "text-slate-400 transition-transform duration-300 ease-in-out",
                  chartsExpanded && "rotate-180"
                )}
              />
            </button>

            <div
              className={cn(
                "overflow-hidden transition-[max-height] duration-300 ease-in-out",
                chartsExpanded ? "max-h-[38vh]" : "max-h-0"
              )}
            >
              <div className="h-[38vh] pt-2 overflow-y-auto custom-scrollbar">
                <ChartCarousel
                  sucursales={sucursales}
                  evolucion={evolucion}
                  ranking={rankingFiltrado}
                  autoRotate={chartsExpanded}
                  fillHeight
                />
              </div>
            </div>
          </div>

        </main>
      </div>

      {/* Comunicado CC + Difusión: primera entrada tras login (localStorage → no repetir hasta bump de versión) */}
      <CCDifusionGuiaDialog autoOpenIfUnseen sessionReady={!!user} />
    </div>
  );
}
