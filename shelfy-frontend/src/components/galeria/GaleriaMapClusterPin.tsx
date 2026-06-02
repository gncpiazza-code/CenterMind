"use client";

import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";

interface GaleriaMapClusterPinProps {
  count: number;
  selected?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
}

export function GaleriaMapClusterPin({
  count,
  selected,
  onClick,
  onDoubleClick,
}: GaleriaMapClusterPinProps) {
  const size = count >= 50 ? "lg" : count >= 15 ? "md" : "sm";
  const dim =
    size === "lg"
      ? "w-[88px] h-[88px]"
      : size === "md"
        ? "w-[72px] h-[72px]"
        : "w-[58px] h-[58px]";
  return (
    <button
      type="button"
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border-2 shadow-xl transition-transform duration-200 origin-bottom",
        "bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 text-white",
        "border-white/90 ring-4 ring-indigo-500/25 hover:scale-105 active:scale-95",
        dim,
        selected && "ring-violet-300",
      )}
      style={{
        transform: `scale(calc(var(--galeria-map-pin-scale, 1) * ${selected ? 1.05 : 1}))`,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick?.();
      }}
      title="Tocá para acercar y desgranar el grupo"
    >
      <Layers className="w-4 h-4 opacity-90 mb-0.5 drop-shadow" />
      <span className="text-2xl font-black leading-none tabular-nums drop-shadow-sm">{count}</span>
      <span className="text-[8px] font-bold uppercase tracking-wider opacity-95 mt-0.5 text-center leading-tight px-1">
        PDVs con exhibición
      </span>
    </button>
  );
}
