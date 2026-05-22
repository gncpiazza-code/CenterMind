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
import { Clock, CheckCircle, Star, XCircle, TrendingUp, BarChart2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
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

        <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6 overflow-y-auto w-full max-w-[1800px] mx-auto z-10 custom-scrollbar">

          <motion.div variants={sectionVariants} initial="hidden" animate="show" custom={0}>
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
            <Alert variant="destructive" className="mb-6 rounded-3xl">
              <XCircle className="size-4" />
              <AlertDescription className="text-sm font-black">
                Falló la conexión de red con el servidor ({error instanceof Error ? error.message : "Error al cargar"}). Asegúrese de encender el backend de la API e intente nuevamente.
              </AlertDescription>
            </Alert>
          )}

          {/* Fila superior 50/50: carrusel (izq) | ranking (der) */}
          <div className="relative w-full">
            <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-slate-200/60 to-transparent pointer-events-none z-10" />

            <div className="flex flex-col md:flex-row md:items-stretch gap-6 w-full md:min-h-[min(68vh,640px)]">
              <motion.div
                className="relative w-full md:w-1/2 md:min-w-0 flex flex-col min-h-[340px] sm:min-h-[400px] md:min-h-0 md:h-auto"
                variants={sectionVariants}
                initial="hidden"
                animate="show"
                custom={1}
              >
                {isFetchingLeft && (
                  <div className="absolute inset-0 bg-white/30 rounded-[2rem] backdrop-blur-[1px] z-50 flex items-center justify-center pointer-events-none">
                    <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {loading && ultimas.length === 0 ? (
                  <Card className="flex-1 flex items-center justify-center p-12 bg-white rounded-[2.5rem] min-h-[340px]">
                    <Skeleton className="h-8 w-full" />
                  </Card>
                ) : (
                  <div className="flex-1 min-h-[340px] sm:min-h-[400px] md:min-h-[480px] h-full">
                    <HeroCarousel items={ultimas} />
                  </div>
                )}
              </motion.div>

              <motion.div
                className="relative w-full md:w-1/2 md:min-w-0 flex flex-col min-h-[380px] md:min-h-0 md:h-auto"
                variants={sectionVariants}
                initial="hidden"
                animate="show"
                custom={2}
              >
                {isFetchingRight && (
                  <div className="absolute inset-0 bg-white/30 rounded-[2rem] backdrop-blur-[1px] z-50 flex items-center justify-center pointer-events-none">
                    <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                <div className="flex-1 min-h-[380px] md:min-h-[480px] h-full">
                  <RankingTable
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

          {/* Debajo: KPIs + gráficos (Evolución / Sucursales / Vendedores) */}
          <motion.section
            className="mt-6 flex flex-col gap-4"
            variants={sectionVariants}
            initial="hidden"
            animate="show"
            custom={3}
          >
            {kpis ? (
              <div className="relative">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Indicadores del período
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
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25 }}
                    className="grid grid-cols-1 sm:grid-cols-3 gap-3"
                  >
                    {kpiGroup === 0 ? (
                      <>
                        <KpiCard label="Pendientes" value={kpis.pendientes} icon={<Clock size={18} />} colorName="amber" bgColor="bg-white" />
                        <KpiCard label="Aprobadas" value={kpis.aprobadas} icon={<CheckCircle size={18} />} colorName="emerald" bgColor="bg-white" total={kpis.aprobadas + kpis.rechazadas} />
                        <KpiCard label="Destacadas" value={kpis.destacadas} icon={<Star size={18} />} colorName="violet" bgColor="bg-gradient-to-br from-violet-50/60 to-fuchsia-50/40" />
                      </>
                    ) : (
                      <>
                        <KpiCard label="Rechazadas" value={kpis.rechazadas} icon={<XCircle size={18} />} colorName="red" bgColor="bg-white" />
                        <KpiCard label="Tasa Aprob." value={tasaAprobacion ?? 0} icon={<TrendingUp size={18} />} colorName="blue" bgColor="bg-white" subtitle={`de ${kpis.aprobadas + kpis.rechazadas} eval.`} />
                        <KpiCard label="Total" value={kpis.total} icon={<BarChart2 size={18} />} colorName="slate" bgColor="bg-white" subtitle="del período" />
                      </>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            ) : loadingKpis ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-[2rem]" />
                ))}
              </div>
            ) : null}

            <ChartCarousel
              sucursales={sucursales}
              evolucion={evolucion}
              ranking={rankingFiltrado}
              autoRotate
            />
          </motion.section>

        </main>
      </div>

      {/* Comunicado CC + Difusión: primera entrada tras login (localStorage → no repetir hasta bump de versión) */}
      <CCDifusionGuiaDialog autoOpenIfUnseen sessionReady={!!user} />
    </div>
  );
}
