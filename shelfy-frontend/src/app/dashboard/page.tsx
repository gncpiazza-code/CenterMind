"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  fetchDashboardBundle, getWSUrl, warmPortalBundles,
  type DashboardBundle, type KPIs, type VendedorRanking, type UltimaEvaluada, type SucursalStats, type EvolucionTiempo,
} from "@/lib/api";
import { XCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { DashboardKpiCarousel } from "@/components/dashboard/DashboardKpiCarousel";
import { DashboardFilterBar } from "@/components/dashboard/DashboardFilterBar";
import { HeroCarousel } from "@/components/dashboard/HeroCarousel";
import { RankingTable } from "@/components/dashboard/RankingTable";

import {
  type PeriodPreset,
  resolvePeriodBounds,
} from "@/lib/dashboard-period";
import { filterUltimasCoherentes } from "@/lib/dashboard-ultimas";
import { bundleKeys } from "@/lib/query-keys";
import { BUNDLE_STALE_MS, BUNDLE_GC_MS } from "@/components/providers/ReactQueryProvider";
import { invalidateDashboardBundle } from "@/lib/query-invalidation";
import { HeroCarouselSkeleton } from "@/components/dashboard/HeroCarouselSkeleton";
import { loadDashboardTheme, saveDashboardTheme } from "@/lib/dashboard-theme";
import {
  loadDashboardLayout,
  saveDashboardLayout,
  type DashboardLayoutConfig,
} from "@/lib/dashboard-layout";
import { DashboardLayoutTuner } from "@/components/dashboard/DashboardLayoutTuner";
import { DashboardMobileScroll } from "@/components/dashboard/DashboardMobileScroll";

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
  const lastWsInvalidateAtRef = useRef(0);

  // Período
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("mes");
  const [customYear, setCustomYear]     = useState<number | undefined>(undefined);
  const [customMonth, setCustomMonth]   = useState<number | undefined>(undefined);

  // Sucursal
  const [sucursalFiltro, setSucursalFiltro] = useState("");

  // Pantalla completa + tema
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [dashLayout, setDashLayout] = useState<DashboardLayoutConfig>(() => loadDashboardLayout());

  useEffect(() => {
    setIsDark(loadDashboardTheme() === "dark");
    setDashLayout(loadDashboardLayout());
  }, []);

  const handleDashLayoutChange = useCallback((next: DashboardLayoutConfig) => {
    setDashLayout(next);
    saveDashboardLayout(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      saveDashboardTheme(next ? "dark" : "light");
      return next;
    });
  }, []);

  const toggleFullscreen = useCallback(() => setIsFullscreen((v) => !v), []);

  const bounds  = resolvePeriodBounds(periodPreset, customYear, customMonth);
  const periodo = bounds.apiPeriodo;

  const distId    = effectiveDistribuidorId ?? 0;
  const isSuper   = user?.is_superadmin;
  const enabled   = !!user && distId > 0;
  const isCompania =
    isSuper ||
    ["directorio", "compania"].includes((user?.rol ?? "").toLowerCase()) ||
    (user?.rol ?? "").toLowerCase() === "superadmin";

  function handlePeriodChange(preset: PeriodPreset, year?: number, month?: number) {
    setPeriodPreset(preset);
    setCustomYear(year);
    setCustomMonth(month);
    setSucursalFiltro("");
  }

  // Pre-calienta snapshot en backend al elegir mes histórico (p.ej. 2026-05).
  useEffect(() => {
    if (!enabled || distId <= 0) return;
    if (!/^\d{4}-\d{2}$/.test(periodo)) return;
    void warmPortalBundles(distId, ["dashboard", "estadisticas"], periodo).catch(() => {});
  }, [distId, periodo, enabled]);

  // Bundle query — replaces 5 separate queries
  const {
    data: bundle,
    isLoading: loadingBundle,
    isFetching: fetchingBundle,
    error: errorBundle,
  } = useQuery<DashboardBundle>({
    queryKey: bundleKeys.dashboard(distId, periodo, sucursalFiltro || null),
    queryFn: () => fetchDashboardBundle(distId, periodo, sucursalFiltro || null),
    enabled,
    placeholderData: (prev, prevQuery) => {
      if (!prev || !prevQuery) return undefined;
      const key = prevQuery.queryKey;
      if (key[3] !== periodo || key[4] !== (sucursalFiltro || null)) return undefined;
      return prev;
    },
    staleTime: BUNDLE_STALE_MS,
    gcTime: BUNDLE_GC_MS,
    // Poll mientras el backend computa snapshot (mes histórico u otro cache miss).
    refetchInterval: (query) => {
      const data = query.state.data;
      const meta = data?.meta;
      if (!meta?.revalidating) return false;
      const hasData = (data?.ranking?.length ?? 0) > 0 || (data?.kpis?.total ?? 0) > 0;
      if (hasData) return false;
      return 5_000;
    },
  });

  // Desestructurar para mantener compatibilidad con el JSX existente
  const kpis = bundle?.kpis;
  const ranking = bundle?.ranking ?? [];
  const ultimas = bundle?.ultimas ?? [];
  const sucursales = bundle?.sucursales ?? [];
  const evolucion = bundle?.evolucion ?? [];

  const waitingSnapshot =
    !!bundle?.meta?.revalidating &&
    ranking.length === 0 &&
    (kpis?.total ?? 0) === 0;
  // SWR: solo bloquear si no hay ningún dato (RAM o persist)
  const loading = loadingBundle && !bundle;
  const loadingHero = loading;
  const periodLoading = fetchingBundle && waitingSnapshot && !!bundle;
  const rankingLoading = loading;
  const error = errorBundle;

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
            const now = Date.now();
            if (now - lastWsInvalidateAtRef.current < 5000) return;
            lastWsInvalidateAtRef.current = now;
            invalidateDashboardBundle(queryClient, distId);
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

  const ultimasCoherentes = filterUltimasCoherentes(ultimas, rankingFiltrado);
  const ultimasAsignadas = ultimas.filter((u) => u.pdv_asignado_vendedor !== false);
  const ultimasNoRechazadas = ultimas.filter((u) => !/rechaz/i.test(u.estado ?? ""));
  // Fallbacks: coherentes → asignadas al vendedor → cualquier evaluada no rechazada (evita hero vacío)
  const ultimasHero =
    ultimasCoherentes.length > 0
      ? ultimasCoherentes
      : ultimasAsignadas.length > 0
        ? ultimasAsignadas
        : ultimasNoRechazadas;

  return (
    <div className={cn(
      "flex h-screen overflow-hidden font-sans",
      isFullscreen && "fixed inset-0 z-50",
      isDark && "bg-slate-950",
    )} style={{
      background: isDark
        ? "#020617"
        : "linear-gradient(145deg, #f8f7ff 0%, #f1f5f9 42%, #eef2ff 100%)",
    }}>
      {!isFullscreen && <Sidebar />}
      {!isFullscreen && <BottomNav />}

      {/* Mobile: scroll vertical continuo */}
      <div className="flex flex-col flex-1 min-w-0 md:hidden h-full overflow-hidden">
        <DashboardMobileScroll
          kpis={kpis}
          evolucion={evolucion}
          ranking={rankingFiltrado}
          ultimasHero={ultimasHero}
          sucursales={sucursales}
          loading={loading}
          isDark={isDark}
          periodPreset={periodPreset}
          customYear={customYear}
          customMonth={customMonth}
          kpiHeightPx={dashLayout.kpiHeightPx}
          chartYear={bounds.start.getFullYear()}
          chartMonth={bounds.start.getMonth()}
          onPeriodChange={handlePeriodChange}
          sucursalFiltro={sucursalFiltro}
          onSucursal={setSucursalFiltro}
          onToggleTheme={toggleTheme}
        />
      </div>

      {/* Desktop: layout original intacto */}
      <div className="hidden md:flex flex-col flex-1 min-w-0 relative h-full">

        {/* Blobs decorativos — solo en modo claro */}
        {!isDark && (
          <>
            <div className="absolute top-[-15%] right-[-8%] w-[45%] h-[45%] rounded-full bg-violet-400/20 blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-10%] left-[-8%] w-[35%] h-[35%] rounded-full bg-indigo-400/15 blur-[100px] pointer-events-none" />
            <div className="absolute top-[35%] left-[20%] w-[30%] h-[30%] rounded-full bg-emerald-400/10 blur-[90px] pointer-events-none" />
          </>
        )}

        {!isFullscreen && <Topbar title="Dashboard" live />}

        <main className={cn(
          "flex-1 flex flex-col min-h-0 overflow-hidden p-4 md:p-6 pb-20 md:pb-4 w-full max-w-[1800px] mx-auto z-10",
          isFullscreen && "pb-4",
        )}>

          {error && (
            <Alert variant="destructive" className="shrink-0 mb-3 rounded-3xl">
              <XCircle className="size-4" />
              <AlertDescription className="text-sm font-black">
                Falló la conexión de red ({error instanceof Error ? error.message : "Error al cargar"}). Asegúrese de que el backend esté activo.
              </AlertDescription>
            </Alert>
          )}

          {/* KPIs (izq) + filtros/tema/fullscreen en columna (der) */}
          <motion.div
            className="shrink-0 mb-1.5 flex flex-col sm:flex-row items-stretch justify-between gap-2 md:gap-3 w-full min-w-0"
            variants={sectionVariants}
            initial="hidden"
            animate="show"
            custom={0}
          >
            <div
              className="flex-1 min-w-0 overflow-hidden w-full shrink-0"
              style={{ height: dashLayout.kpiHeightPx, maxHeight: dashLayout.kpiHeightPx }}
            >
              <DashboardKpiCarousel
                kpis={kpis}
                evolucion={evolucion}
                loading={(loading && !kpis) || periodLoading}
                isDark={isDark}
                bandHeightPx={dashLayout.kpiHeightPx}
                chartYear={bounds.start.getFullYear()}
                chartMonth={bounds.start.getMonth()}
              />
            </div>
            <DashboardFilterBar
              layout="stacked"
              className="self-end sm:self-start shrink-0"
              periodPreset={periodPreset}
              customYear={customYear}
              customMonth={customMonth}
              onPeriodChange={handlePeriodChange}
              sucursalFiltro={sucursalFiltro}
              sucursales={sucursales}
              onSucursal={setSucursalFiltro}
              isDark={isDark}
              onToggleTheme={toggleTheme}
              isFullscreen={isFullscreen}
              onToggleFullscreen={toggleFullscreen}
            />
          </motion.div>

          {/* Layout 25% hero / 75% ranking */}
          <div className="relative flex-1 min-h-0 w-full">
            {!isDark && (
              <div
                className="hidden md:block absolute top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-violet-300/50 to-transparent pointer-events-none z-10"
                style={{ left: `${dashLayout.heroWidthPercent}%`, transform: "translateX(-50%)" }}
              />
            )}

            <div
              className="flex flex-col md:flex-row md:items-stretch gap-4 h-full min-h-0 overflow-hidden flex-1"
              style={{ ["--dash-hero-w" as string]: `${dashLayout.heroWidthPercent}%` }}
            >
              {/* HeroCarousel */}
              <motion.div
                className="relative w-full md:w-[var(--dash-hero-w)] md:max-w-[var(--dash-hero-w)] md:shrink-0 md:min-w-0 flex flex-col min-h-0 md:h-full"
                variants={sectionVariants}
                initial="hidden"
                animate="show"
                custom={2}
              >
                {loadingHero || periodLoading ? (
                  <HeroCarouselSkeleton className="h-full min-h-0 flex-1" />
                ) : (
                  <HeroCarousel
                    items={ultimasHero}
                    compact
                    isDark={isDark}
                    className="h-full min-h-0 flex-1"
                  />
                )}
              </motion.div>

              {/* RankingTable */}
              <motion.div
                className="relative w-full md:flex-1 md:min-w-0 flex flex-col min-h-0 flex-1 md:h-full overflow-hidden"
                variants={sectionVariants}
                initial="hidden"
                animate="show"
                custom={3}
              >
                <div className="h-full min-h-0 overflow-hidden rounded-3xl">
                  <RankingTable
                    dense
                    loading={rankingLoading}
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
                    isDark={isDark}
                  />
                </div>
              </motion.div>
            </div>
          </div>

        </main>
      </div>
      {/* Fin desktop layout */}

      <DashboardLayoutTuner layout={dashLayout} onChange={handleDashLayoutChange} />
    </div>
  );
}
