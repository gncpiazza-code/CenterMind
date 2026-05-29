"use client";

import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Award, Pause, Play, Check, X, Flame } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { fetchRankingCompania } from '@/lib/api';
import type { VendedorRanking, SucursalStats, KPIs, EvolucionTiempo, RankingCompaniaRow } from '@/lib/api';
import { sucursalFilterKey } from '@/lib/api';
import { DashboardFullscreenButton } from './DashboardFullscreenButton';
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
  isImmersive?: boolean;
  onToggleImmersive?: () => void;
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

/** px/ms — ~36 px/s a 60fps */
const SCROLL_SPEED_PX_PER_MS = 0.036;
const HOVER_RESUME_MS = 400;
/** Tras scroll manual (Safari pelea con rAF si reanudamos al instante) */
const USER_SCROLL_COOLDOWN_MS = 2800;

const STAT_ICON_CLASS = "shrink-0 stroke-[2.5]";
const STAT_ICON_SIZE = 16;

export function RankingTable({
  ranking, periodo, periodoLabel, sucursalFiltro, sucursales,
  kpis, evolucion = [], distId = 0, nombreEmpresa = 'Distribuidora',
  isCompania = false, dense = false,
  isImmersive = false, onToggleImmersive,
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

  const baseRows = useMemo(() => ranking.slice(0, 30), [ranking]);
  const isLoopDuplicated = baseRows.length > 1;
  const displayRows = useMemo(
    () => (isLoopDuplicated ? [...baseRows, ...baseRows] : baseRows),
    [baseRows, isLoopDuplicated],
  );

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

  // Auto-scroll continuo (rAF + delta) — no compite con scroll nativo del usuario
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || ranking.length === 0) return;

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
  }, [ranking.length, displayRows.length, autoScrollPaused, isLoopDuplicated]);

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
      isImmersive
        ? "bg-slate-900 border border-slate-700 shadow-none ring-0"
        : "border-violet-200/70 shadow-lg shadow-violet-500/10 bg-gradient-to-br from-violet-50/40 via-white to-indigo-50/30 ring-1 ring-violet-400/20",
    )}>
      {/* Barra superior — sin gradiente en proyección */}
      {!isImmersive && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 via-fuchsia-400 to-indigo-500 z-20" />
      )}

      {/* Header */}
      <div className={cn(
        "border-b flex items-center justify-between sticky top-0 z-20 gap-3",
        isImmersive
          ? "bg-slate-900 border-slate-700"
          : "border-violet-100/60 bg-white/85 backdrop-blur-xl shadow-sm",
        dense ? "pt-5 px-4 pb-3" : "pt-7 px-6 pb-4",
      )}>
        {/* Título centrado */}
        <div className="flex-1 text-center">
          <h3 className={cn(
            "font-black text-base tracking-tighter uppercase",
            isImmersive ? "text-white" : "text-slate-900",
          )}>
            Ranking {nombreEmpresa}
          </h3>
          {sucursalLabel && (
            <p className={cn(
              "text-[9px] font-black uppercase tracking-[0.15em] mt-0.5",
              isImmersive ? "text-slate-400" : "text-blue-500",
            )}>{sucursalLabel}</p>
          )}
        </div>

        {/* Controles derecha */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Pausa autoscroll */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => setAutoScrollPaused(v => !v)}
            title={autoScrollPaused ? "Reanudar scroll" : "Pausar scroll"}
            className={cn(
              "h-8 w-8 rounded-xl transition-all",
              isImmersive
                ? "border-slate-600 text-slate-400 hover:text-white hover:bg-slate-800"
                : "border-slate-200 text-slate-400 hover:text-slate-700",
            )}
          >
            {autoScrollPaused ? <Play size={13} /> : <Pause size={13} />}
          </Button>

          {/* Vista Cía */}
          {isCompania && (
            <button
              onClick={() => setShowCompaniaLens(v => !v)}
              className={`shrink-0 text-[9px] font-black tracking-[0.12em] uppercase px-3 py-1.5 rounded-2xl border transition-all ${
                showCompaniaLens
                  ? isImmersive ? 'bg-violet-600 text-white border-violet-500' : 'bg-violet-600 text-white border-violet-600 shadow-sm'
                  : isImmersive ? 'text-violet-400 border-violet-700 bg-violet-950/50 hover:bg-violet-950' : 'text-violet-600 border-violet-200 bg-violet-50/50 hover:bg-violet-50'
              }`}
            >
              {showCompaniaLens ? '✦ Cía' : '◇ Cía'}
            </button>
          )}

          {/* Fullscreen */}
          {onToggleImmersive && (
            <DashboardFullscreenButton
              isImmersive={isImmersive}
              onToggle={onToggleImmersive}
            />
          )}
        </div>
      </div>

      {/* Tabla con autoscroll */}
      <div
        ref={scrollRef}
        tabIndex={0}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar px-5 pb-4 pt-1 [overscroll-behavior:contain] focus:outline-none"
        style={{
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <table className="w-full text-sm border-separate border-spacing-y-1.5">
          <thead className={cn("sticky top-0 z-10", isImmersive ? "bg-slate-900" : "bg-white/95 backdrop-blur-md")}>
            <tr className="text-left">
              <th className={cn("py-3 px-3 font-black uppercase tracking-[0.2em] text-[9px] w-12", isImmersive ? "text-slate-500" : "text-slate-400")}>Pos</th>
              <th className={cn("py-3 px-2 font-black uppercase tracking-[0.2em] text-[9px]", isImmersive ? "text-slate-500" : "text-slate-400")}>Vendedor</th>
              <th className={cn("py-3 px-2 text-right font-black uppercase tracking-[0.2em] text-[9px] text-emerald-500", isImmersive && "text-emerald-400")} title="Aprobadas">
                <span className={cn(
                  "inline-flex items-center justify-end gap-1 rounded-lg px-2 py-1",
                  isImmersive ? "bg-emerald-950/60 ring-1 ring-emerald-800" : "bg-emerald-100/80 ring-1 ring-emerald-200/60",
                )}>
                  <Check size={STAT_ICON_SIZE} className={cn(STAT_ICON_CLASS, isImmersive ? "text-emerald-400" : "text-emerald-600")} />
                </span>
              </th>
              <th className={cn("py-3 px-2 text-right font-black uppercase tracking-[0.2em] text-[9px] text-red-500", isImmersive && "text-red-400")} title="Rechazadas">
                <span className={cn(
                  "inline-flex items-center justify-end gap-1 rounded-lg px-2 py-1",
                  isImmersive ? "bg-red-950/60 ring-1 ring-red-800" : "bg-red-100/80 ring-1 ring-red-200/60",
                )}>
                  <X size={STAT_ICON_SIZE} className={cn(STAT_ICON_CLASS, isImmersive ? "text-red-400" : "text-red-500")} />
                </span>
              </th>
              <th className={cn("py-3 px-2 text-right font-black uppercase tracking-[0.2em] text-[9px] text-amber-600", isImmersive && "text-amber-400")} title="Destacadas">
                <span className={cn(
                  "inline-flex items-center justify-end gap-1 rounded-lg px-2 py-1",
                  isImmersive ? "bg-amber-950/60 ring-1 ring-amber-800" : "bg-amber-100/80 ring-1 ring-amber-200/60",
                )}>
                  <Flame size={STAT_ICON_SIZE} className={cn(STAT_ICON_CLASS, isImmersive ? "text-amber-400" : "text-amber-600")} />
                </span>
              </th>
              <th className={cn("py-3 px-4 text-right font-black uppercase tracking-[0.2em] text-[9px]", isImmersive ? "text-slate-300" : "text-slate-950")}>Pts</th>
              {showCompaniaLens && (
                <>
                  <th className="py-3 px-2 text-right font-black uppercase tracking-[0.2em] text-[9px] text-violet-500">Cía</th>
                  <th className="py-3 px-2 text-right font-black uppercase tracking-[0.2em] text-[9px] text-slate-400">Δ</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {displayRows.map((v, i) => {
                const rankIndex = i % Math.min(ranking.length, 30);
                const isTop3 = rankIndex < 3;
                const style  = isTop3 ? (isImmersive ? TOP3_IMMERSIVE[rankIndex] : TOP3_STYLES[rankIndex]) : null;
                const ratio  = v.aprobadas + v.rechazadas > 0
                  ? Math.round((v.aprobadas / (v.aprobadas + v.rechazadas)) * 100)
                  : null;
                const subtitulo = v.sucursal || v.ciudad_dominante || null;

                return (
                  <motion.tr
                    key={`${v.vendedor}-${rankIndex}-${i}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    whileHover={isImmersive ? undefined : { x: 4, transition: { duration: 0.15 } }}
                    className={cn(
                      "relative group rounded-2xl overflow-hidden transition-colors cursor-default",
                      style?.row ?? (
                        isImmersive
                          ? rankIndex % 2 === 0
                            ? "bg-slate-800/80 border border-slate-700/80"
                            : "bg-slate-900 border border-slate-800"
                          : rankIndex % 2 === 0
                            ? "bg-white/90 border border-violet-100/60 hover:bg-violet-50/50"
                            : "bg-indigo-50/35 border border-indigo-100/40 hover:bg-indigo-50/55"
                      ),
                    )}
                  >
                    <td className={cn("px-3 first:rounded-l-2xl", dense ? "py-2" : "py-2.5")}>
                      <div className={cn(
                        "w-7 h-7 flex items-center justify-center text-[11px] font-black rounded-xl transition-all",
                        isImmersive ? "shadow-none" : "shadow-md group-hover:scale-110",
                        style?.badge ?? (isImmersive ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-500 shadow-sm"),
                      )}>
                        {rankIndex + 1}
                      </div>
                    </td>

                    <td className={cn("px-2", dense ? "py-2" : "py-2.5")}>
                      <div className="flex flex-col min-w-0">
                        <span
                          className={cn(
                            "font-black tracking-tight whitespace-nowrap",
                            isImmersive ? "text-[14px]" : "text-[13px]",
                            isTop3
                              ? isImmersive ? "text-white" : "text-slate-900"
                              : isImmersive ? "text-slate-200" : "text-slate-700",
                          )}
                          title={v.vendedor}
                        >
                          {v.vendedor}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {subtitulo && (
                            <span className={cn(
                              "text-[9px] font-bold uppercase tracking-wider whitespace-nowrap",
                              isImmersive ? "text-slate-500" : "text-slate-400",
                            )}>
                              {subtitulo}
                            </span>
                          )}
                          {ratio !== null && (
                            <span className={cn(
                              "text-[8px] font-black px-1 py-0 rounded-md",
                              ratio >= 80 ? (isImmersive ? "bg-emerald-950 text-emerald-400" : "bg-emerald-50 text-emerald-600") :
                              ratio >= 60 ? (isImmersive ? "bg-amber-950 text-amber-400" : "bg-amber-50 text-amber-600") :
                                            (isImmersive ? "bg-red-950 text-red-400" : "bg-red-50 text-red-500"),
                            )}>
                              {ratio}%
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className={cn("px-2 text-right", dense ? "py-2" : "py-2.5")}>
                      <span className={cn(
                        "inline-flex items-center justify-end gap-1.5 min-w-[3.25rem] text-xs font-black px-2.5 py-1 rounded-xl border",
                        isImmersive
                          ? "bg-emerald-950/70 text-emerald-400 border-emerald-800"
                          : "bg-emerald-50 text-emerald-700 border-emerald-200/60 shadow-sm shadow-emerald-500/5",
                      )}>
                        <Check size={14} className={cn(STAT_ICON_CLASS, "text-emerald-600")} />
                        {v.aprobadas}
                      </span>
                    </td>

                    <td className={cn("px-2 text-right", dense ? "py-2" : "py-2.5")}>
                      <span className={cn(
                        "inline-flex items-center justify-end gap-1.5 min-w-[3.25rem] text-xs font-black px-2.5 py-1 rounded-xl border",
                        v.rechazadas > 0
                          ? isImmersive
                            ? "bg-red-950/70 text-red-400 border-red-800"
                            : "bg-red-50 text-red-600 border-red-200/60 shadow-sm shadow-red-500/5"
                          : isImmersive
                            ? "bg-slate-800 text-slate-500 border-slate-700"
                            : "bg-slate-50 text-slate-400 border-slate-200/50",
                      )}>
                        <X size={14} className={cn(STAT_ICON_CLASS, v.rechazadas > 0 ? "text-red-500" : "text-slate-300")} />
                        {v.rechazadas ?? 0}
                      </span>
                    </td>

                    <td className={cn("px-2 text-right", dense ? "py-2" : "py-2.5")}>
                      <span className={cn(
                        "inline-flex items-center justify-end gap-1.5 min-w-[3.25rem] text-xs font-black px-2.5 py-1 rounded-xl border",
                        isImmersive
                          ? "bg-amber-950/70 text-amber-400 border-amber-800"
                          : "bg-amber-50 text-amber-700 border-amber-200/60 shadow-sm shadow-amber-500/5",
                      )}>
                        <Flame size={14} className={cn(STAT_ICON_CLASS, "text-amber-600")} />
                        {v.destacadas || 0}
                      </span>
                    </td>

                    <td className={cn("px-4 text-right", dense ? "py-2" : "py-2.5", !showCompaniaLens ? 'last:rounded-r-2xl' : '')}>
                      <div className="flex flex-col items-end">
                        <span className={cn(
                          "font-black tracking-tighter",
                          isImmersive ? "text-lg" : "text-base",
                          style?.pts ?? (isImmersive ? "text-slate-200" : "text-slate-800"),
                        )}>
                          {v.puntos}
                        </span>
                        <span className={cn(
                          "text-[7px] font-black uppercase tracking-widest -mt-0.5",
                          isImmersive ? "text-slate-500" : "text-slate-400",
                        )}>Pts</span>
                      </div>
                    </td>

                    {showCompaniaLens && (() => {
                      const cr    = companiaByVendedor.get(v.vendedor);
                      const delta = cr ? cr.delta_puntos : 0;
                      return (
                        <>
                          <td className={cn("px-2 text-right", dense ? "py-2" : "py-2.5")}>
                            <div className="flex flex-col items-end">
                              <span className="font-black text-sm tracking-tighter text-violet-600">
                                {cr ? cr.puntos_compania : v.puntos}
                              </span>
                              <span className="text-[7px] font-black text-violet-400 uppercase tracking-widest -mt-0.5">Cía</span>
                            </div>
                          </td>
                          <td className={cn("px-3 text-right last:rounded-r-2xl", dense ? "py-2" : "py-2.5")}>
                            <span className={`text-[11px] font-black px-1.5 py-0.5 rounded-lg border ${
                              delta > 0
                                ? 'bg-emerald-50 text-emerald-600 border-emerald-100/50'
                                : delta < 0
                                  ? 'bg-red-50 text-red-500 border-red-100/50'
                                  : 'bg-slate-50 text-slate-400 border-slate-100/50'
                            }`}>
                              {delta > 0 ? `+${delta}` : delta}
                            </span>
                          </td>
                        </>
                      );
                    })()}
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </Card>
  );
}
