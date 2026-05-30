"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActiveRankMovement } from "@/lib/ranking-position-movement";

export function RankMovementBadge({
  movement,
  isDark,
}: {
  movement: ActiveRankMovement;
  isDark: boolean;
}) {
  const isUp = movement.direction === "up";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 shrink-0 text-[10px] font-black tabular-nums",
        isUp
          ? isDark
            ? "text-emerald-400"
            : "text-emerald-600"
          : isDark
            ? "text-red-400"
            : "text-red-500",
      )}
      title={
        isUp
          ? `Subió ${movement.positions} posición${movement.positions === 1 ? "" : "es"}`
          : `Bajó ${movement.positions} posición${movement.positions === 1 ? "" : "es"}`
      }
    >
      {isUp ? (
        <ArrowUp size={12} strokeWidth={3} className="shrink-0" />
      ) : (
        <ArrowDown size={12} strokeWidth={3} className="shrink-0" />
      )}
      {movement.positions}
    </span>
  );
}
