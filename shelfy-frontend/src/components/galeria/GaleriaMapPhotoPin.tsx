"use client";

import { Images } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GaleriaMapaPin } from "@/lib/api";

interface GaleriaMapPhotoPinProps {
  pin: GaleriaMapaPin;
  selected?: boolean;
  onClick: () => void;
}

const ringByEstado: Record<string, string> = {
  Destacado: "ring-amber-400",
  Aprobado: "ring-green-500",
  Rechazado: "ring-red-500",
  Pendiente: "ring-slate-300",
};

export function GaleriaMapPhotoPin({
  pin,
  selected = false,
  onClick,
}: GaleriaMapPhotoPinProps) {
  const ring = ringByEstado[pin.estado_cover] ?? "ring-slate-300";
  const label = pin.nombre_cliente?.trim() || "PDV";

  return (
    <button
      type="button"
      className="flex flex-col items-center gap-1 max-w-[120px] pointer-events-auto origin-bottom"
      style={{
        transform: "scale(var(--galeria-map-pin-scale, 1))",
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={`${label}, ${pin.total_exhibiciones} exhibiciones`}
    >
      <div
        className={cn(
          "relative w-[72px] h-[72px] rounded-xl overflow-hidden bg-white shadow-lg",
          "ring-2 ring-offset-2 ring-offset-white transition-shadow duration-150",
          ring,
          selected && "ring-blue-600 shadow-xl scale-105"
        )}
      >
        {pin.cover_url ? (
          <img
            src={pin.cover_url}
            alt={label}
            className="w-full h-full object-cover"
            loading="lazy"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-slate-100">
            <Images className="w-8 h-8 text-slate-400" />
          </div>
        )}
        <Badge
          variant="secondary"
          className="absolute top-1 right-1 h-5 min-w-5 px-1 text-[10px] font-bold bg-black/70 text-white border-0"
        >
          {pin.total_exhibiciones}
        </Badge>
      </div>

      <span
        className={cn(
          "text-[10px] font-semibold leading-tight text-center line-clamp-2 px-1 py-0.5 rounded-md",
          "bg-white/95 text-slate-800 shadow-sm border border-slate-200/80 max-w-[110px]"
        )}
      >
        {label}
      </span>
    </button>
  );
}
