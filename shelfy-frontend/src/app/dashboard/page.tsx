"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  fetchKPIs, fetchRanking, fetchUltimasEvaluadas, fetchPorSucursal,
  fetchEvolucionTiempo, getWSUrl,
} from "@/lib/api";
import type {
  KPIs, VendedorRanking, UltimaEvaluada, SucursalStats, EvolucionTiempo,
} from "@/lib/api";
import { XCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { DashboardKpiCarousel } from "@/components/dashboard/DashboardKpiCarousel";
import { DashboardToolbar } from "@/components/dashboard/DashboardToolbar";
import { HeroCarousel } from "@/components/dashboard/HeroCarousel";
import { RankingTable } from "@/components/dashboard/RankingTable";
import { CCDifusionGuiaDialog } from "@/components/onboarding/CCDifusionGuiaDialog";

import {
  type PeriodPreset,
  resolvePeriodBounds,
} from "@/lib/dashboard-period";

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  const queryClient = useQueryClient();

  // Período
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("mes");
  const [customYear, setCustomYear]     = useState<number | undefined>(undefined);
  const [customMonth, setCustomMonth]   = useState<number | undefined>(undefined);

  // Sucursal
  const [sucursalFiltro, setSucursalFiltro] = useState("");

  // Pantalla completa
  const [isImmersive, setIsImmersive] = useState(false);

  const bounds  = resolvePeriodBounds(periodPreset, customYear, customMonth);
  const periodo = bounds.apiPeriodo;

  const distId    = effectiveDistribuidorId ?? 0;
  const isSuper   = user?.is_superadmin;
  const enabled   = !!user && distId > 0;
  const isCompania =
    isSuper ||
    (user?.rol ?? "").toLowerCase() === "directorio" ||
    (user?.rol ?? "").toLowerCase() === "superadmin";

  function handlePeriodChange(preset: PeriodPreset, year?: number, month?: number) {
    setPeriodPreset(preset);
    setCustomYear(year);
    setCustomMonth(month);
    setSucursalFiltro("");
  }

  const toggleImmersive = useCallback(() => setIsImmersive(v => !v), []);

  // Queries
  const { data: kpis, isLoading: loadingKpis, isFetching: fetchingKpis, error: errorKpis } = useQuery<KPIs>({
    queryKey: ["dashboard", "kpis", distId, periodo, sucursalFiltro],
    queryFn: () => fetchKPIs(distId, periodo, sucursalFiltro),
    enabled,
    placeholderData: (prev: unknown) => prev as KPIs | undefined,
    refetchInterval: 300_000,
  });

  const { data: ranking = [], isLoading: loadingRanking, isFetching: fetchingRanking, error: errorRanking } = useQuery<VendedorRanking[]>({
    queryKey: ["dashboard", "ranking", distId, periodo, sucursalFiltro],
    queryFn: () => fetchRanking(distId, periodo, sucursalFiltro),
    enabled,
    placeholderData: (prev: unknown) => prev as VendedorRanking[] | undefined,
    refetchInterval: 300_000,
  });

  const { data: ultimas = [], isLoading: loadingUltimas, isFetching: fetchingUltimas } = useQuery<UltimaEvaluada[]>({
    queryKey: ["dashboard", "ultimas", distId, sucursalFiltro],
    queryFn: () => fetchUltimasEvaluadas(distId, 12, sucursalFiltro),
    enabled,
    placeholderData: (prev: unknown) => prev as UltimaEvaluada[] | undefined,
    refetchInterval: 300_000,
  });

  const { data: sucursales = [], isLoading: loadingSucursales } = useQuery<SucursalStats[]>({
    queryKey: ["dashboard", "sucursales", distId, periodo, sucursalFiltro],
    queryFn: () => fetchPorSucursal(distId, periodo, sucursalFiltro),
    enabled,
    placeholderData: (prev: unknown) => prev as SucursalStats[] | undefined,
    refetchInterval: 300_000,
  });

  const { data: evolucion = [] } = useQuery<EvolucionTiempo[]>({
    queryKey: ["dashboard", "evolucion", distId, periodo, sucursalFiltro],
    queryFn: () => fetchEvolucionTiempo(distId, periodo, sucursalFiltro),
    enabled,
    placeholderData: (prev: unknown) => prev as EvolucionTiempo[] | undefined,
    refetchInterval: 300_000,
  });

  const loading = loadingKpis || loadingRanking || loadingUltimas || loadingSucursales;
  const error   = errorKpis || errorRanking;

  const isFetchingLeft  = fetchingUltimas && !loadingUltimas;
  const isFetchingRight = (fetchingKpis && !loadingKpis) || (fetchingRanking && !loadingRanking);

  // WS: invalida todas las queries del dashboard al recibir eventos
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
            queryClient.invalidateQueries({ queryKey: ["dashboard", "ultimas"] });
            queryClient.invalidateQueries({ queryKey: ["dashboard", "evolucion"] });
            queryClient.invalidateQueries({ queryKey: ["dashboard", "sucursales"] });
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

  // Filtro local de ranking (el backend ya filtra; esto alinea si location_id viene en la fila)
  const rankingFiltrado = sucursalFiltro
    ? ranking.filter((v) => String(v.location_id ?? "") === String(sucursalFiltro))
    : ranking;

  return (
    <div className={cn(
      "flex h-screen overflow-hidden font-sans",
      isImmersive && "fixed inset-0 z-50 bg-slate-950",
    )} style={{
      background: isImmersive
        ? "#020617"
        : "linear-gradient(145deg, #f8f7ff 0%, #f1f5f9 42%, #eef2ff 100%)",
    }}>
      {!isImmersive && <Sidebar />}
      {!isImmersive && <BottomNav />}

      <div className="flex flex-col flex-1 min-w-0 relative h-full">

        {/* Blobs decorativos */}
        <div className="absolute top-[-15%] right-[-8%] w-[45%] h-[45%] rounded-full bg-violet-400/20 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] left-[-8%] w-[35%] h-[35%] rounded-full bg-indigo-400/15 blur-[100px] pointer-events-none" />
        <div className="absolute top-[35%] left-[20%] w-[30%] h-[30%] rounded-full bg-emerald-400/10 blur-[90px] pointer-events-none" />

        {!isImmersive && <Topbar title="Dashboard" live />}

        <main className={cn(
          "flex-1 flex flex-col min-h-0 overflow-hidden p-4 md:p-6 pb-20 md:pb-4 w-full max-w-[1800px] mx-auto z-10",
          isImmersive && "pb-4",
        )}>

          {error && (
            <Alert variant="destructive" className="shrink-0 mb-3 rounded-3xl">
              <XCircle className="size-4" />
              <AlertDescription className="text-sm font-black">
                Falló la conexión de red ({error instanceof Error ? error.message : "Error al cargar"}). Asegúrese de que el backend esté activo.
              </AlertDescription>
            </Alert>
          )}

          {/* Carrusel KPI — 3 slides */}
          <motion.div
            className="shrink-0 mb-3"
            variants={sectionVariants}
            initial="hidden"
            animate="show"
            custom={0}
          >
            <DashboardKpiCarousel
              kpis={kpis}
              ranking={rankingFiltrado}
              evolucion={evolucion}
              loading={loadingKpis}
            />
          </motion.div>

          {/* Toolbar: Sucursal + Período + Hint */}
          <motion.div
            className="shrink-0 mb-2"
            variants={sectionVariants}
            initial="hidden"
            animate="show"
            custom={1}
          >
            <DashboardToolbar
              periodPreset={periodPreset}
              customYear={customYear}
              customMonth={customMonth}
              onPeriodChange={handlePeriodChange}
              sucursalFiltro={sucursalFiltro}
              sucursales={sucursales}
              onSucursal={setSucursalFiltro}
            />
          </motion.div>

          {/* Layout 25% hero / 75% ranking */}
          <div className="relative flex-1 min-h-0 w-full">
            <div className="hidden md:block absolute left-[25%] top-0 bottom-0 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-violet-300/50 to-transparent pointer-events-none z-10" />

            <div className="flex flex-col md:flex-row md:items-stretch gap-4 h-full min-h-0 overflow-hidden">
              {/* HeroCarousel — 25% */}
              <motion.div
                className="relative w-full md:w-1/4 md:min-w-0 flex flex-col min-h-0 md:h-full"
                variants={sectionVariants}
                initial="hidden"
                animate="show"
                custom={2}
              >
                {isFetchingLeft && (
                  <div className="absolute inset-0 bg-white/30 rounded-3xl backdrop-blur-[1px] z-50 flex items-center justify-center pointer-events-none">
                    <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {loading && ultimas.length === 0 ? (
                  <Card className="h-full min-h-0 flex items-center justify-center p-12 bg-white rounded-3xl">
                    <Skeleton className="h-8 w-full rounded-2xl" />
                  </Card>
                ) : (
                  <div className="h-full min-h-[280px] md:min-h-0 flex-1 rounded-3xl overflow-hidden ring-1 ring-violet-500/20 shadow-lg shadow-violet-500/10 bg-slate-950">
                    <HeroCarousel items={ultimas} compact />
                  </div>
                )}
              </motion.div>

              {/* RankingTable — 75% */}
              <motion.div
                className="relative w-full md:w-3/4 md:min-w-0 flex flex-col min-h-0 flex-1 md:h-full overflow-hidden"
                variants={sectionVariants}
                initial="hidden"
                animate="show"
                custom={3}
              >
                {isFetchingRight && (
                  <div className="absolute inset-0 bg-white/30 rounded-3xl backdrop-blur-[1px] z-50 flex items-center justify-center pointer-events-none">
                    <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                <div className="h-full min-h-0 overflow-hidden rounded-3xl">
                  <RankingTable
                    dense
                    ranking={rankingFiltrado}
                    periodo={periodo}
                    periodoLabel={bounds.hint}
                    sucursalFiltro={sucursalFiltro}
                    sucursales={sucursales}
                    kpis={kpis ?? null}
                    evolucion={evolucion}
                    distId={distId}
                    nombreEmpresa={user?.nombre_empresa || "Distribuidora"}
                    isCompania={isCompania}
                    isImmersive={isImmersive}
                    onToggleImmersive={toggleImmersive}
                  />
                </div>
              </motion.div>
            </div>
          </div>

        </main>
      </div>

      <CCDifusionGuiaDialog autoOpenIfUnseen sessionReady={!!user} />
    </div>
  );
}
