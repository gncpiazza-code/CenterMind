"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Check, X, Flame, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActiveRankMovement } from "@/lib/ranking-position-movement";
import {
  PUSH_DOWN_SCALE_KEYFRAMES,
  PUSH_DOWN_SCALE_TIMES,
  PUSH_DOWN_Y_KEYFRAMES,
  PUSH_UP_SCALE_KEYFRAMES,
  PUSH_UP_SCALE_TIMES,
  PUSH_UP_Y_KEYFRAMES,
  REORDER_ANIM_MS,
  REORDER_EASE,
} from "@/lib/ranking-reorder-animation";
import type { RankingCompaniaRow, VendedorRanking } from "@/lib/api";
import { RankMovementBadge } from "@/components/dashboard/RankMovementBadge";

const STAT_ICON_CLASS = "shrink-0 stroke-[2.5]";

const LAYOUT_TRANSITION = {
  type: "tween" as const,
  duration: REORDER_ANIM_MS / 1000,
  ease: REORDER_EASE,
};

const PUSH_UP_TRANSITION = {
  duration: REORDER_ANIM_MS / 1000,
  ease: REORDER_EASE,
  times: PUSH_UP_SCALE_TIMES,
};

const PUSH_DOWN_TRANSITION = {
  duration: REORDER_ANIM_MS / 1000,
  ease: REORDER_EASE,
  times: PUSH_DOWN_SCALE_TIMES,
};

const SURGE_WINDOW_MS = 4_500;

export function rankingGridColumns(showCompaniaLens: boolean): string {
  return showCompaniaLens
    ? "3rem minmax(0,1fr) 4.5rem 4.5rem 4.5rem 4.5rem 4rem 3.5rem"
    : "3rem minmax(0,1fr) 4.5rem 4.5rem 4.5rem 4.5rem";
}

type RowStyle = {
  row: string;
  badge: string;
  pts: string;
};

export interface RankingMotionRowProps {
  v: VendedorRanking;
  rankIndex: number;
  isDark: boolean;
  dense: boolean;
  showCompaniaLens: boolean;
  style: RowStyle | null;
  movement?: ActiveRankMovement;
  companiaRow?: RankingCompaniaRow;
  layoutEnabled?: boolean;
  layoutId?: string;
  surgeNow?: number;
  isPushing?: boolean;
}

export function RankingMotionRow({
  v,
  rankIndex,
  isDark,
  dense,
  showCompaniaLens,
  style,
  movement,
  companiaRow,
  layoutEnabled = true,
  layoutId,
  surgeNow = Date.now(),
  isPushing = false,
}: RankingMotionRowProps) {
  const isTop3 = rankIndex < 3;
  const ratio =
    v.aprobadas + v.rechazadas > 0
      ? Math.round((v.aprobadas / (v.aprobadas + v.rechazadas)) * 100)
      : null;
  const subtitulo = v.sucursal || v.ciudad_dominante || null;

  const surgeAge = movement ? surgeNow - movement.changedAt : Infinity;
  const movementActive = !!movement && surgeAge < SURGE_WINDOW_MS;
  const showMovementBadge = !!movement && (isPushing || movementActive);
  const movedUp = movement?.direction === "up";
  const movedDown = movement?.direction === "down";
  const highlightUp = movedUp && (isPushing || movementActive);
  const highlightDown = movedDown && (isPushing || movementActive);

  const pushAnimate = useMemo(() => {
    if (isPushing && movedUp) {
      return { scale: PUSH_UP_SCALE_KEYFRAMES, y: PUSH_UP_Y_KEYFRAMES };
    }
    if (isPushing && movedDown) {
      return { scale: PUSH_DOWN_SCALE_KEYFRAMES, y: PUSH_DOWN_Y_KEYFRAMES };
    }
    return { scale: 1, y: 0 };
  }, [isPushing, movedUp, movedDown, movement?.changedAt]);

  const pushTransition = useMemo(() => {
    if (isPushing && movedUp) return PUSH_UP_TRANSITION;
    if (isPushing && movedDown) return PUSH_DOWN_TRANSITION;
    return { duration: 0.2 };
  }, [isPushing, movedUp, movedDown]);

  const cellPy = dense ? "py-2" : "py-2.5";

  const content = (
    <div
      className="grid w-full items-center"
      style={{ gridTemplateColumns: rankingGridColumns(showCompaniaLens) }}
    >
      <div className={cn("px-3 flex items-center", cellPy)}>
        <div
          className={cn(
            "w-7 h-7 flex items-center justify-center text-[11px] font-black rounded-xl transition-all",
            isDark ? "shadow-none" : "shadow-md group-hover:scale-110",
            style?.badge ?? (isDark ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-500 shadow-sm"),
          )}
        >
          {rankIndex === 0 ? (
            <Crown
              size={15}
              className={cn(
                "shrink-0",
                isDark ? "text-amber-400 fill-amber-500/40" : "text-amber-600 fill-amber-400/50",
              )}
              aria-label="Primer puesto"
            />
          ) : (
            rankIndex + 1
          )}
        </div>
      </div>

      <div className={cn("px-2 min-w-0 flex items-center", cellPy)}>
        <div className="flex flex-col min-w-0 w-full">
          <div className="flex items-center gap-1 min-w-0">
            <span
              className={cn(
                "font-black tracking-tight truncate",
                isDark ? "text-[14px]" : "text-[13px]",
                isTop3
                  ? isDark
                    ? "text-white"
                    : "text-slate-900"
                  : isDark
                    ? "text-slate-200"
                    : "text-slate-700",
              )}
              title={v.vendedor}
            >
              {v.vendedor}
            </span>
            {showMovementBadge && movement && (
              <RankMovementBadge movement={movement} isDark={isDark} />
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {subtitulo && (
              <span
                className={cn(
                  "text-[9px] font-bold uppercase tracking-wider whitespace-nowrap",
                  isDark ? "text-slate-500" : "text-slate-400",
                )}
              >
                {subtitulo}
              </span>
            )}
            {ratio !== null && (
              <span
                className={cn(
                  "text-[8px] font-black px-1 py-0 rounded-md",
                  ratio >= 80
                    ? isDark
                      ? "bg-emerald-950 text-emerald-400"
                      : "bg-emerald-50 text-emerald-600"
                    : ratio >= 60
                      ? isDark
                        ? "bg-amber-950 text-amber-400"
                        : "bg-amber-50 text-amber-600"
                      : isDark
                        ? "bg-red-950 text-red-400"
                        : "bg-red-50 text-red-500",
                )}
              >
                {ratio}%
              </span>
            )}
          </div>
        </div>
      </div>

      <div className={cn("px-2 flex items-center justify-end", cellPy)}>
        <span
          className={cn(
            "inline-flex items-center justify-end gap-1.5 min-w-[3.25rem] text-xs font-black px-2.5 py-1 rounded-xl border",
            isDark
              ? "bg-emerald-950/70 text-emerald-400 border-emerald-800"
              : "bg-emerald-50 text-emerald-700 border-emerald-200/60 shadow-sm shadow-emerald-500/5",
          )}
        >
          <Check size={14} className={cn(STAT_ICON_CLASS, "text-emerald-600")} />
          {v.aprobadas}
        </span>
      </div>

      <div className={cn("px-2 flex items-center justify-end", cellPy)}>
        <span
          className={cn(
            "inline-flex items-center justify-end gap-1.5 min-w-[3.25rem] text-xs font-black px-2.5 py-1 rounded-xl border",
            v.rechazadas > 0
              ? isDark
                ? "bg-red-950/70 text-red-400 border-red-800"
                : "bg-red-50 text-red-600 border-red-200/60 shadow-sm shadow-red-500/5"
              : isDark
                ? "bg-slate-800 text-slate-500 border-slate-700"
                : "bg-slate-50 text-slate-400 border-slate-200/50",
          )}
        >
          <X size={14} className={cn(STAT_ICON_CLASS, v.rechazadas > 0 ? "text-red-500" : "text-slate-300")} />
          {v.rechazadas ?? 0}
        </span>
      </div>

      <div className={cn("px-2 flex items-center justify-end", cellPy)}>
        <span
          className={cn(
            "inline-flex items-center justify-end gap-1.5 min-w-[3.25rem] text-xs font-black px-2.5 py-1 rounded-xl border",
            isDark
              ? "bg-amber-950/70 text-amber-400 border-amber-800"
              : "bg-amber-50 text-amber-700 border-amber-200/60 shadow-sm shadow-amber-500/5",
          )}
        >
          <Flame size={14} className={cn(STAT_ICON_CLASS, "text-amber-600")} />
          {v.destacadas || 0}
        </span>
      </div>

      <div className={cn("px-4 flex items-center justify-end", cellPy, !showCompaniaLens && "pr-3")}>
        <div className="flex flex-col items-end">
          <span
            className={cn(
              "font-black tracking-tighter",
              isDark ? "text-lg" : "text-base",
              style?.pts ?? (isDark ? "text-slate-200" : "text-slate-800"),
            )}
          >
            {v.puntos}
          </span>
          <span
            className={cn(
              "text-[7px] font-black uppercase tracking-widest -mt-0.5",
              isDark ? "text-slate-500" : "text-slate-400",
            )}
          >
            Pts
          </span>
        </div>
      </div>

      {showCompaniaLens && (
        <>
          <div className={cn("px-2 flex items-center justify-end", cellPy)}>
            <div className="flex flex-col items-end">
              <span className="font-black text-sm tracking-tighter text-violet-600">
                {companiaRow ? companiaRow.puntos_compania : v.puntos}
              </span>
              <span className="text-[7px] font-black text-violet-400 uppercase tracking-widest -mt-0.5">
                Cía
              </span>
            </div>
          </div>
          <div className={cn("px-3 flex items-center justify-end", cellPy)}>
            {(() => {
              const delta = companiaRow ? companiaRow.delta_puntos : 0;
              return (
                <span
                  className={`text-[11px] font-black px-1.5 py-0.5 rounded-lg border ${
                    delta > 0
                      ? "bg-emerald-50 text-emerald-600 border-emerald-100/50"
                      : delta < 0
                        ? "bg-red-50 text-red-500 border-red-100/50"
                        : "bg-slate-50 text-slate-400 border-slate-100/50"
                  }`}
                >
                  {delta > 0 ? `+${delta}` : delta}
                </span>
              );
            })()}
          </div>
        </>
      )}
    </div>
  );

  const rowSurfaceClass = cn(
    "rounded-2xl overflow-hidden cursor-default group w-full",
    style?.row ??
      (isDark
        ? rankIndex % 2 === 0
          ? "bg-slate-800/80 border border-slate-700/80"
          : "bg-slate-900 border border-slate-800"
        : rankIndex % 2 === 0
          ? "bg-white/90 border border-violet-100/60 hover:bg-violet-50/50"
          : "bg-indigo-50/35 border border-indigo-100/40 hover:bg-indigo-50/55"),
    highlightUp &&
      (isDark
        ? "border-2 border-emerald-400 ring-2 ring-emerald-500/50 shadow-[0_24px_52px_rgba(16,185,129,0.35)]"
        : "border-2 border-emerald-500 ring-2 ring-emerald-400/60 shadow-[0_26px_56px_rgba(16,185,129,0.28)]"),
    highlightDown &&
      (isDark
        ? "border-2 border-red-500 ring-2 ring-red-500/50 shadow-[0_24px_52px_rgba(239,68,68,0.35)]"
        : "border-2 border-red-500 ring-2 ring-red-400/60 shadow-[0_26px_56px_rgba(239,68,68,0.28)]"),
  );

  if (!layoutEnabled) {
    return <div className={rowSurfaceClass}>{content}</div>;
  }

  return (
    <motion.div
      layout="position"
      layoutScroll
      layoutId={layoutId ?? v.vendedor}
      initial={false}
      transition={{ layout: LAYOUT_TRANSITION }}
      className={cn(
        "relative w-full",
        isPushing && movedUp ? "z-50" : isPushing && movedDown ? "z-40" : "z-0",
      )}
      style={{ transformOrigin: "50% 0%" }}
    >
      <motion.div
        initial={false}
        animate={pushAnimate}
        transition={pushTransition}
        className={rowSurfaceClass}
        style={{ transformOrigin: "50% 0%" }}
        whileHover={isDark ? undefined : { x: 4, transition: { duration: 0.15 } }}
      >
        {content}
      </motion.div>
    </motion.div>
  );
}
