"use client";

import { useEffect, useRef } from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GaleriaPublicacion } from "@/lib/galeria-publicaciones";
import { formatGaleriaFechaVisita } from "@/lib/fecha-ar";

interface Props {
  publicaciones: GaleriaPublicacion[];
  activePubIdx: number;
  onSelectPub: (idx: number) => void;
  mesLabel?: string;
}

const ESTADO_RING: Record<string, string> = {
  Aprobada: "ring-emerald-400/80",
  Aprobado: "ring-emerald-400/80",
  Destacada: "ring-amber-400/80",
  Destacado: "ring-amber-400/80",
  Rechazada: "ring-red-400/80",
  Rechazado: "ring-red-400/80",
  Pendiente: "ring-white/30",
};

const ESTADO_DOT: Record<string, string> = {
  Aprobada: "bg-emerald-400",
  Aprobado: "bg-emerald-400",
  Destacada: "bg-amber-400",
  Destacado: "bg-amber-400",
  Rechazada: "bg-red-400",
  Rechazado: "bg-red-400",
  Pendiente: "bg-white/40",
};

export function GaleriaExhibicionTimeline({
  publicaciones,
  activePubIdx,
  onSelectPub,
  mesLabel,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activePubIdx]);

  if (publicaciones.length <= 1) return null;

  return (
    <section
      className="shrink-0 mx-2 md:mx-4 mb-2 rounded-xl border border-white/20 bg-black/75 backdrop-blur-xl shadow-[0_-8px_32px_rgba(0,0,0,0.35)] overflow-hidden"
      aria-label="Historial de visitas"
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/10">
        <div className="flex items-center gap-2 min-w-0">
          <CalendarDays className="w-4 h-4 text-amber-300 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-white leading-tight">Historial de visitas</p>
            <p className="text-[10px] text-white/55 truncate">
              {publicaciones.length} visita{publicaciones.length !== 1 ? "s" : ""}
              {mesLabel ? ` · mes activo: ${mesLabel}` : ""}
            </p>
          </div>
        </div>
        {activePubIdx >= 0 && publicaciones[activePubIdx] && (
          <span className="text-[10px] font-semibold text-amber-200/90 tabular-nums shrink-0">
            {formatGaleriaFechaVisita(publicaciones[activePubIdx].dia_ar).fecha}
          </span>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto px-3 py-2.5"
        style={{ scrollbarWidth: "none" }}
      >
        {publicaciones.map((pub, i) => {
          const isActive = i === activePubIdx;
          const thumb = pub.fotos[0]?.url_foto;
          const ringClass = ESTADO_RING[pub.estado_dia] ?? ESTADO_RING.Pendiente;
          const dotClass = ESTADO_DOT[pub.estado_dia] ?? ESTADO_DOT.Pendiente;
          const label = formatGaleriaFechaVisita(pub.dia_ar).fecha;

          return (
            <button
              key={pub.dia_ar}
              ref={isActive ? activeRef : undefined}
              type="button"
              onClick={() => onSelectPub(i)}
              className={cn(
                "shrink-0 flex flex-col items-center gap-1.5 rounded-xl p-1 transition-all duration-150",
                isActive ? "bg-white/12 scale-[1.02]" : "hover:bg-white/8",
              )}
              aria-label={`Ir a visita del ${label}`}
              aria-current={isActive ? "true" : undefined}
            >
              <div
                className={cn(
                  "relative w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden ring-2 bg-white/5",
                  isActive ? ringClass : "ring-white/15",
                )}
              >
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                    draggable={false}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/30 text-[10px]">
                    Sin foto
                  </div>
                )}
                <span
                  className={cn(
                    "absolute bottom-1 right-1 w-2 h-2 rounded-full border border-black/40",
                    dotClass,
                  )}
                />
              </div>
              <span
                className={cn(
                  "text-[10px] font-bold tabular-nums leading-none max-w-[4.5rem] truncate",
                  isActive ? "text-white" : "text-white/55",
                )}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
