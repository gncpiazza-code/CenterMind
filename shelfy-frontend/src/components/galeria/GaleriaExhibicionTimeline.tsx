"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { GaleriaPublicacion } from "@/lib/galeria-publicaciones";

interface Props {
  publicaciones: GaleriaPublicacion[];
  activePubIdx: number;
  onSelectPub: (idx: number) => void;
}

const ESTADO_DOT: Record<string, string> = {
  Aprobada:  "bg-emerald-400",
  Aprobado:  "bg-emerald-400",
  Destacada: "bg-amber-400",
  Destacado: "bg-amber-400",
  Rechazada: "bg-red-400",
  Rechazado: "bg-red-400",
  Pendiente: "bg-white/35",
};

export function GaleriaExhibicionTimeline({ publicaciones, activePubIdx, onSelectPub }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // Scroll active item into view when it changes
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activePubIdx]);

  if (publicaciones.length <= 1) return null;

  return (
    <div className="w-full px-3 pb-2 shrink-0">
      <div
        ref={scrollRef}
        className="flex gap-1.5 overflow-x-auto py-1.5"
        style={{ scrollbarWidth: "none" }}
      >
        {publicaciones.map((pub, i) => {
          const isActive = i === activePubIdx;
          const dotClass = ESTADO_DOT[pub.estado_dia] ?? "bg-white/35";
          // Show MM-DD from dia_ar (YYYY-MM-DD)
          const label = pub.dia_ar.length >= 10 ? pub.dia_ar.slice(5) : pub.dia_ar;
          return (
            <button
              key={pub.dia_ar}
              ref={isActive ? activeRef : undefined}
              type="button"
              onClick={() => onSelectPub(i)}
              className={cn(
                "shrink-0 flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg border transition-all duration-150",
                isActive
                  ? "bg-white/20 border-white/45 shadow-sm"
                  : "border-white/10 hover:bg-white/10 hover:border-white/20",
              )}
            >
              <span
                className={cn(
                  "text-[9px] font-bold tabular-nums leading-none",
                  isActive ? "text-white" : "text-white/50",
                )}
              >
                {label}
              </span>
              <span
                className={cn(
                  "rounded-full transition-all duration-150",
                  dotClass,
                  isActive ? "w-2 h-2" : "w-1.5 h-1.5",
                )}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
