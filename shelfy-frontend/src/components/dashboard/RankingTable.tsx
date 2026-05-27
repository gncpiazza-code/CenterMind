"use client";

import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Award, Pause, Play, Check, X, Flame } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { fetchRankingCompania } from '@/lib/api';
import type { VendedorRanking, SucursalStats, KPIs, EvolucionTiempo, RankingCompaniaRow } from '@/lib/api';
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

const SCROLL_SPEED = 0.6; // px per tick (~30ms)

export function RankingTable({
  ranking, periodo, periodoLabel, sucursalFiltro, sucursales,
  kpis, evolucion = [], distId = 0, nombreEmpresa = 'Distribuidora',
  isCompania = false, dense = false,
  isImmersive = false, onToggleImmersive,
}: RankingTableProps) {
  const [showCompaniaLens, setShowCompaniaLens] = useState(false);
  const [autoScrollPaused, setAutoScrollPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollAnimRef = useRef<number | null>(null);
  const pauseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Auto-scroll suave
  const doScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || autoScrollPaused) {
      scrollAnimRef.current = requestAnimationFrame(doScroll);
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight) {
      scrollAnimRef.current = requestAnimationFrame(doScroll);
      return;
    }
    if (scrollTop + clientHeight >= scrollHeight - 4) {
      el.scrollTop = 0;
    } else {
      el.scrollTop += SCROLL_SPEED;
    }
    scrollAnimRef.current = requestAnimationFrame(doScroll);
  }, [autoScrollPaused]);

  useEffect(() => {
    scrollAnimRef.current = requestAnimationFrame(doScroll);
    return () => {
      if (scrollAnimRef.current) cancelAnimationFrame(scrollAnimRef.current);
    };
  }, [doScroll]);

  // Pause on hover
  function handleMouseEnter() {
    if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current);
    setAutoScrollPaused(true);
  }
  function handleMouseLeave() {
    pauseTimeoutRef.current = setTimeout(() => setAutoScrollPaused(false), 1500);
  }

  const sucursalLabel = sucursalFiltro
    ? (sucursales.find(s => s.location_id === sucursalFiltro)?.sucursal ?? sucursalFiltro)
    : null;

  if (ranking.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center p-12 border-slate-200 border-dashed border-2 h-full bg-slate-50/50 rounded-[2rem]">
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
    <Card className="border-slate-200/60 shadow-xl overflow-hidden flex flex-col h-full bg-white relative rounded-[2rem]">
      {/* Barra superior violet */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-violet-500 via-indigo-400 to-violet-500 z-20" />

      {/* Header */}
      <div className={cn(
        "border-b border-slate-50 flex items-center justify-between sticky top-0 bg-white/80 backdrop-blur-xl z-20 gap-3 shadow-sm",
        dense ? "pt-5 px-4 pb-3" : "pt-7 px-6 pb-4",
      )}>
        {/* Título centrado */}
        <div className="flex-1 text-center">
          <h3 className="text-slate-900 font-black text-base tracking-tighter uppercase">
            Ranking {nombreEmpresa}
          </h3>
          {sucursalLabel && (
            <p className="text-[9px] font-black uppercase tracking-[0.15em] text-blue-500 mt-0.5">{sucursalLabel}</p>
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
            className="h-8 w-8 rounded-xl border-slate-200 text-slate-400 hover:text-slate-700"
          >
            {autoScrollPaused ? <Play size={13} /> : <Pause size={13} />}
          </Button>

          {/* Vista Cía */}
          {isCompania && (
            <button
              onClick={() => setShowCompaniaLens(v => !v)}
              className={`shrink-0 text-[9px] font-black tracking-[0.12em] uppercase px-3 py-1.5 rounded-2xl border transition-all ${
                showCompaniaLens
                  ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                  : 'text-violet-600 border-violet-200 bg-violet-50/50 hover:bg-violet-50'
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
        className="flex-1 overflow-y-auto custom-scrollbar px-5 pb-4 pt-1"
        style={{ scrollbarWidth: "none" }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <table className="w-full text-sm border-separate border-spacing-y-1.5">
          <thead className="sticky top-0 bg-white/95 backdrop-blur-md z-10">
            <tr className="text-left">
              <th className="py-3 px-3 font-black uppercase tracking-[0.2em] text-[9px] text-slate-400 w-12">Pos</th>
              <th className="py-3 px-2 font-black uppercase tracking-[0.2em] text-[9px] text-slate-400">Vendedor</th>
              <th className="py-3 px-2 text-right font-black uppercase tracking-[0.2em] text-[9px] text-emerald-500" title="Aprobadas">
                <Check size={11} className="inline" />
              </th>
              <th className="py-3 px-2 text-right font-black uppercase tracking-[0.2em] text-[9px] text-red-400" title="Rechazadas">
                <X size={11} className="inline" />
              </th>
              <th className="py-3 px-2 text-right font-black uppercase tracking-[0.2em] text-[9px] text-amber-500" title="Destacadas">
                <Flame size={11} className="inline" />
              </th>
              <th className="py-3 px-4 text-right font-black uppercase tracking-[0.2em] text-[9px] text-slate-950">Pts</th>
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
              {ranking.slice(0, 30).map((v, i) => {
                const isTop3 = i < 3;
                const style  = isTop3 ? TOP3_STYLES[i] : null;
                const ratio  = v.aprobadas + v.rechazadas > 0
                  ? Math.round((v.aprobadas / (v.aprobadas + v.rechazadas)) * 100)
                  : null;
                const subtitulo = v.sucursal || v.ciudad_dominante || null;

                return (
                  <motion.tr
                    key={`${v.vendedor}-${i}`}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    whileHover={{ x: 4, transition: { duration: 0.15 } }}
                    className={cn(
                      "relative group rounded-2xl overflow-hidden transition-all cursor-default",
                      style?.row ?? "bg-white border border-slate-100/50 hover:bg-slate-50/60",
                    )}
                  >
                    <td className={cn("px-3 first:rounded-l-2xl", dense ? "py-2" : "py-2.5")}>
                      <div className={cn(
                        "w-7 h-7 flex items-center justify-center text-[11px] font-black rounded-xl shadow-md transition-all group-hover:scale-110",
                        style?.badge ?? "bg-slate-100 text-slate-500 shadow-sm",
                      )}>
                        {i + 1}
                      </div>
                    </td>

                    <td className={cn("px-2", dense ? "py-2" : "py-2.5")}>
                      <div className="flex flex-col min-w-0">
                        <span
                          className={cn(
                            "font-black text-[13px] tracking-tight whitespace-nowrap",
                            isTop3 ? "text-slate-900" : "text-slate-700",
                          )}
                          title={v.vendedor}
                        >
                          {v.vendedor}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {subtitulo && (
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                              {subtitulo}
                            </span>
                          )}
                          {ratio !== null && (
                            <span className={cn(
                              "text-[8px] font-black px-1 py-0 rounded-md",
                              ratio >= 80 ? "bg-emerald-50 text-emerald-600" :
                              ratio >= 60 ? "bg-amber-50 text-amber-600" :
                                            "bg-red-50 text-red-500",
                            )}>
                              {ratio}%
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className={cn("px-2 text-right", dense ? "py-2" : "py-2.5")}>
                      <span className="inline-flex items-center justify-center bg-emerald-50 text-emerald-600 text-[10px] font-black px-2 py-0.5 rounded-lg border border-emerald-100/50">
                        {v.aprobadas}
                      </span>
                    </td>

                    <td className={cn("px-2 text-right", dense ? "py-2" : "py-2.5")}>
                      <span className={cn(
                        "inline-flex items-center justify-center text-[10px] font-black px-2 py-0.5 rounded-lg border",
                        v.rechazadas > 0
                          ? "bg-red-50 text-red-500 border-red-100/50"
                          : "bg-slate-50 text-slate-300 border-slate-100/50",
                      )}>
                        {v.rechazadas ?? 0}
                      </span>
                    </td>

                    <td className={cn("px-2 text-right", dense ? "py-2" : "py-2.5")}>
                      <span className="inline-flex items-center justify-center bg-amber-50 text-amber-600 text-[10px] font-black px-2 py-0.5 rounded-lg border border-amber-100/50">
                        {v.destacadas || 0}
                      </span>
                    </td>

                    <td className={cn("px-4 text-right", dense ? "py-2" : "py-2.5", !showCompaniaLens ? 'last:rounded-r-2xl' : '')}>
                      <div className="flex flex-col items-end">
                        <span className={cn("font-black text-base tracking-tighter", style?.pts ?? "text-slate-800")}>
                          {v.puntos}
                        </span>
                        <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest -mt-0.5">Pts</span>
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
