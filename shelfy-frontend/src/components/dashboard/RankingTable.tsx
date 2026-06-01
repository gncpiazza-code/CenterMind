"use client";

import React, { useMemo, useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { LayoutGroup, motion } from 'framer-motion';
import { Award, Pause, Play, Check, X, Flame } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { fetchRankingCompania } from '@/lib/api';
import { useLiveRankingMovements } from '@/hooks/use-live-ranking-movements';
import { RankingMotionRow, rankingGridColumns } from '@/components/dashboard/RankingMotionRow';
import type { VendedorRanking, SucursalStats, KPIs, EvolucionTiempo, RankingCompaniaRow } from '@/lib/api';
import { sucursalFilterKey } from '@/lib/api';
import { cn } from '@/lib/utils';

interface RankingTableProps {
  ranking: VendedorRanking[];
  periodo: string;
  periodoLabel?: string;
  sucursalFiltro: string;
  sucursales: SucursalStats[];
  kpis?: KPIs | null;
  evolucion?: EvolucionTiempo[];
  distId?: number;
  nombreEmpresa?: string;
  isCompania?: boolean;
  dense?: boolean;
  loading?: boolean;
  isDark?: boolean;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onToggleTheme?: () => void;
}

const TOP3_STYLES = [
  {
    row:    "bg-gradient-to-r from-amber-50/80 to-white border-2 border-amber-200/50",
    badge:  "bg-amber-400 text-white shadow-amber-200/60",
    avatar: "bg-amber-100 text-amber-700",
    pts:    "text-amber-600",
  },
  {
    row:    "bg-slate-50/60 border border-slate-200/40",
    badge:  "bg-slate-400 text-white shadow-slate-200/60",
    avatar: "bg-slate-100 text-slate-600",
    pts:    "text-slate-600",
  },
  {
    row:    "bg-orange-50/40 border border-orange-200/30",
    badge:  "bg-orange-400 text-white shadow-orange-200/60",
    avatar: "bg-orange-100 text-orange-700",
    pts:    "text-orange-600",
  },
];

const TOP3_IMMERSIVE = [
  { row: "bg-amber-950/50 border border-amber-700/50", badge: "bg-amber-500 text-white", pts: "text-amber-400" },
  { row: "bg-slate-800 border border-slate-600", badge: "bg-slate-400 text-white", pts: "text-slate-200" },
  { row: "bg-orange-950/40 border border-orange-700/40", badge: "bg-orange-500 text-white", pts: "text-orange-400" },
];

/** Mínimo de filas para loop + autoscroll; debajo se muestra lista única sin duplicar */
const MIN_RANKING_FOR_AUTOSCROLL = 6;
/** px/ms — ~36 px/s a 60fps */
const SCROLL_SPEED_PX_PER_MS = 0.036;
const HOVER_RESUME_MS = 400;
/** Tras scroll manual (Safari pelea con rAF si reanudamos al instante) */
const USER_SCROLL_COOLDOWN_MS = 2800;

const STAT_ICON_CLASS = "shrink-0 stroke-[2.5]";
const STAT_ICON_SIZE = 16;

function rankingHeaderBandClass(isDark: boolean) {
  return isDark
    ? "bg-slate-800/90 border-slate-700"
    : "bg-violet-50/90 border-violet-100/80";
}

function RankingColumnHeaders({
  isDark,
  showCompaniaLens,
}: {
  isDark: boolean;
  showCompaniaLens: boolean;
}) {
  const thBase = isDark ? "bg-slate-800/90" : "bg-violet-50/90";
  const th = (extra: string, children: ReactNode, title?: string) => (
    <div
      className={cn("py-2.5 font-black uppercase tracking-[0.2em] text-[9px]", thBase, extra)}
      title={title}
    >
      {children}
    </div>
  );
  return (
    <div
      className={cn(
        "grid w-full text-left border-b",
        isDark ? "border-slate-600/80" : "border-violet-200/50",
      )}
      style={{ gridTemplateColumns: rankingGridColumns(showCompaniaLens) }}
    >
      {th("px-3 text-slate-400", "Pos")}
      {th("px-2 text-slate-400", "Vendedor")}
      {th(
        "px-2 flex justify-end text-emerald-500",
        <span className={cn(
          "inline-flex items-center justify-end gap-1 rounded-lg px-2 py-1",
          isDark ? "bg-emerald-950/60 ring-1 ring-emerald-800" : "bg-emerald-100/80 ring-1 ring-emerald-200/60",
        )}>
          <Check size={STAT_ICON_SIZE} className={cn(STAT_ICON_CLASS, isDark ? "text-emerald-400" : "text-emerald-600")} />
        </span>,
        "Aprobadas",
      )}
      {th(
        "px-2 flex justify-end text-red-500",
        <span className={cn(
          "inline-flex items-center justify-end gap-1 rounded-lg px-2 py-1",
          isDark ? "bg-red-950/60 ring-1 ring-red-800" : "bg-red-100/80 ring-1 ring-red-200/60",
        )}>
          <X size={STAT_ICON_SIZE} className={cn(STAT_ICON_CLASS, isDark ? "text-red-400" : "text-red-500")} />
        </span>,
        "Rechazadas",
      )}
      {th(
        "px-2 flex justify-end text-amber-600",
        <span className={cn(
          "inline-flex items-center justify-end gap-1 rounded-lg px-2 py-1",
          isDark ? "bg-amber-950/60 ring-1 ring-amber-800" : "bg-amber-100/80 ring-1 ring-amber-200/60",
        )}>
          <Flame size={STAT_ICON_SIZE} className={cn(STAT_ICON_CLASS, isDark ? "text-amber-400" : "text-amber-600")} />
        </span>,
        "Destacadas",
      )}
      {th("px-4 flex justify-end text-slate-950", "Pts")}
      {showCompaniaLens && (
        <>
          {th("px-2 flex justify-end text-violet-500", "Cía")}
          {th("px-2 flex justify-end text-slate-400", "Δ")}
        </>
      )}
    </div>
  );
}

export function RankingTable({
  ranking, periodo, periodoLabel, sucursalFiltro, sucursales,
  kpis, evolucion = [], distId = 0, nombreEmpresa = 'Distribuidora',
  isCompania = false, dense = false, loading = false,
  isDark = false,
  isFullscreen = false,
  onToggleFullscreen,
  onToggleTheme,
}: RankingTableProps) {
  const [showCompaniaLens, setShowCompaniaLens] = useState(false);
  const [autoScrollPaused, setAutoScrollPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pauseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userInteractingRef = useRef(false);
  const userScrollResumeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programmaticScrollRef = useRef(false);

  const { data: companiaData } = useQuery({
    queryKey: ['ranking-compania-lens', distId, periodo, sucursalFiltro],
    queryFn: () => fetchRankingCompania(distId, periodo, sucursalFiltro || undefined),
    enabled: isCompania && showCompaniaLens && !!distId,
    staleTime: 60_000,
  });

  const companiaByVendedor = useMemo(() => {
    if (!companiaData) return new Map<string, RankingCompaniaRow>();
    return new Map(companiaData.map(r => [r.vendedor, r]));
  }, [companiaData]);

  const {
    moverVisuals: displayMovements,
    pushing,
    reorderActive,
    animTick,
  } = useLiveRankingMovements(ranking, distId, periodo, sucursalFiltro);

  const baseRows = useMemo(() => ranking.slice(0, 30), [ranking]);
  const enableAutoscrollLoop = baseRows.length >= MIN_RANKING_FOR_AUTOSCROLL;
  const isLoopDuplicated = enableAutoscrollLoop;
  void animTick;

  useEffect(() => {
    if (!reorderActive) return;
    setAutoScrollPaused(true);
    const id = setTimeout(() => setAutoScrollPaused(false), 1_500);
    return () => clearTimeout(id);
  }, [reorderActive, animTick]);

  const markUserScrolling = useCallback(() => {
    userInteractingRef.current = true;
    if (userScrollResumeRef.current) clearTimeout(userScrollResumeRef.current);
    userScrollResumeRef.current = setTimeout(() => {
      userInteractingRef.current = false;
    }, USER_SCROLL_COOLDOWN_MS);
  }, []);

  // Pausar autoscroll mientras el usuario hace wheel/touch/scroll (crítico en Safari)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onWheel = () => markUserScrolling();
    const onTouch = () => markUserScrolling();
    const onKeyDown = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(e.key)) {
        markUserScrolling();
      }
    };
    const onScroll = () => {
      if (!programmaticScrollRef.current) markUserScrolling();
    };

    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("touchstart", onTouch, { passive: true });
    el.addEventListener("touchmove", onTouch, { passive: true });
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("keydown", onKeyDown);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouch);
      el.removeEventListener("touchmove", onTouch);
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("keydown", onKeyDown);
      if (userScrollResumeRef.current) clearTimeout(userScrollResumeRef.current);
    };
  }, [markUserScrolling, ranking.length]);

  // Auto-scroll continuo (rAF + delta) — solo con 6+ integrantes
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || ranking.length === 0 || !enableAutoscrollLoop) return;

    let rafId = 0;
    let lastTs = performance.now();

    const step = (now: number) => {
      const dt = Math.min(now - lastTs, 48);
      lastTs = now;

      if (!autoScrollPaused && !userInteractingRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = el;
        if (scrollHeight > clientHeight + 4) {
          const loopHeight = isLoopDuplicated ? scrollHeight / 2 : scrollHeight;
          let next = scrollTop + SCROLL_SPEED_PX_PER_MS * dt;
          if (next >= loopHeight) {
            next -= loopHeight;
          }
          programmaticScrollRef.current = true;
          el.scrollTop = next;
          requestAnimationFrame(() => {
            programmaticScrollRef.current = false;
          });
        }
      }

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [ranking.length, baseRows.length, autoScrollPaused, isLoopDuplicated, enableAutoscrollLoop]);

  // Pause on hover
  function handleMouseEnter() {
    if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current);
    setAutoScrollPaused(true);
  }
  function handleMouseLeave() {
    pauseTimeoutRef.current = setTimeout(() => setAutoScrollPaused(false), HOVER_RESUME_MS);
  }

  const sucursalLabel = sucursalFiltro
    ? (sucursales.find((s) => sucursalFilterKey(s) === sucursalFiltro)?.sucursal ?? sucursalFiltro)
    : null;

  if (loading) {
    return (
      <Card className="flex flex-col items-center justify-center p-12 border-slate-200 border-dashed border-2 h-full bg-slate-50/50 rounded-3xl animate-pulse">
        <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mb-4" />
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] text-center">
          Cargando período{periodoLabel ? ` · ${periodoLabel}` : ""}…
        </p>
      </Card>
    );
  }

  if (ranking.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center p-12 border-slate-200 border-dashed border-2 h-full bg-slate-50/50 rounded-3xl">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
          <Award className="text-slate-300" size={32} />
        </div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-center mb-3">
          No hay actividad para el ranking todavía
        </p>
      </Card>
    );
  }

  return (
    <Card className={cn(
      "overflow-hidden flex flex-col h-full relative rounded-3xl",
      isDark
        ? "bg-slate-900 border border-slate-700 shadow-none ring-0"
        : "border-violet-200/70 shadow-lg shadow-violet-500/10 bg-gradient-to-br from-violet-50/40 via-white to-indigo-50/30 ring-1 ring-violet-400/20",
    )}>
      {/* Barra superior — sin gradiente en proyección */}
      {!isDark && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 via-fuchsia-400 to-indigo-500 z-20" />
      )}

      {/* Header título */}
      <div className={cn(
        "flex items-center justify-between shrink-0 gap-3",
        isDark
          ? "bg-slate-900 border-b border-slate-700"
          : "border-b border-violet-100/60 bg-white shadow-sm",
        dense ? "pt-5 px-4 pb-2" : "pt-7 px-6 pb-3",
      )}>
        {/* Título centrado */}
        <div className="flex-1 text-center">
          <h3 className={cn(
            "font-black text-base tracking-tighter uppercase",
            isDark ? "text-white" : "text-slate-900",
          )}>
            Ranking {nombreEmpresa}
          </h3>
          {sucursalLabel && (
            <p className={cn(
              "text-[9px] font-black uppercase tracking-[0.15em] mt-0.5",
              isDark ? "text-slate-400" : "text-blue-500",
            )}>{sucursalLabel}</p>
          )}
        </div>

        {/* Controles derecha */}
        <div className="flex items-center gap-1.5 shrink-0">
          {enableAutoscrollLoop && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => setAutoScrollPaused(v => !v)}
              title={autoScrollPaused ? "Reanudar scroll" : "Pausar scroll"}
              className={cn(
                "h-8 w-8 rounded-xl transition-all",
                isDark
                  ? "border-slate-600 text-slate-400 hover:text-white hover:bg-slate-800"
                  : "border-slate-200 text-slate-400 hover:text-slate-700",
              )}
            >
              {autoScrollPaused ? <Play size={13} /> : <Pause size={13} />}
            </Button>
          )}

          {/* Vista Cía */}
          {isCompania && (
            <button
              onClick={() => setShowCompaniaLens(v => !v)}
              className={`shrink-0 text-[9px] font-black tracking-[0.12em] uppercase px-3 py-1.5 rounded-2xl border transition-all ${
                showCompaniaLens
                  ? isDark ? 'bg-violet-600 text-white border-violet-500' : 'bg-violet-600 text-white border-violet-600 shadow-sm'
                  : isDark ? 'text-violet-400 border-violet-700 bg-violet-950/50 hover:bg-violet-950' : 'text-violet-600 border-violet-200 bg-violet-50/50 hover:bg-violet-50'
              }`}
            >
              {showCompaniaLens ? '✦ Cía' : '◇ Cía'}
            </button>
          )}

        </div>
      </div>

      {/* Encabezados de columnas — fijos, pegados al título (solo el tbody hace scroll) */}
      <div
        className={cn(
          "shrink-0 border-b",
          rankingHeaderBandClass(isDark),
          dense ? "px-4 pb-1.5 pt-0" : "px-6 pb-2 pt-0",
        )}
      >
        <RankingColumnHeaders isDark={isDark} showCompaniaLens={showCompaniaLens} />
      </div>

      <div
        ref={scrollRef}
        tabIndex={0}
        className={cn(
          "flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar pb-4 pt-1 [overscroll-behavior:contain] focus:outline-none relative",
          dense ? "px-4" : "px-6",
        )}
        style={{
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <motion.div layoutRoot className="flex flex-col gap-2 w-full text-sm">
          <LayoutGroup id={`ranking-layout-${distId}-${periodo}-${sucursalFiltro || "all"}`}>
            {baseRows.map((v, rankIndex) => {
              const isTop3 = rankIndex < 3;
              const style = isTop3 ? (isDark ? TOP3_IMMERSIVE[rankIndex] : TOP3_STYLES[rankIndex]) : null;
              return (
                <RankingMotionRow
                  key={v.vendedor}
                  layoutId={v.vendedor}
                  layoutEnabled
                  v={v}
                  rankIndex={rankIndex}
                  isDark={isDark}
                  dense={dense}
                  showCompaniaLens={showCompaniaLens}
                  style={style}
                  movement={displayMovements.get(v.vendedor)}
                  companiaRow={companiaByVendedor.get(v.vendedor)}
                  surgeNow={Date.now()}
                  isPushing={pushing.has(v.vendedor)}
                />
              );
            })}
          </LayoutGroup>
          {isLoopDuplicated &&
            baseRows.map((v, rankIndex) => {
              const isTop3 = rankIndex < 3;
              const style = isTop3 ? (isDark ? TOP3_IMMERSIVE[rankIndex] : TOP3_STYLES[rankIndex]) : null;
              return (
                <RankingMotionRow
                  key={`loop-${v.vendedor}`}
                  layoutEnabled={false}
                  v={v}
                  rankIndex={rankIndex}
                  isDark={isDark}
                  dense={dense}
                  showCompaniaLens={showCompaniaLens}
                  style={style}
                  movement={displayMovements.get(v.vendedor)}
                  companiaRow={companiaByVendedor.get(v.vendedor)}
                  surgeNow={Date.now()}
                  isPushing={false}
                />
              );
            })}
        </motion.div>
      </div>
    </Card>
  );
}
