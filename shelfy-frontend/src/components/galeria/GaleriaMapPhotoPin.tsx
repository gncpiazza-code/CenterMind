"use client";

import { Images } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GaleriaMapaPin } from "@/lib/api";

interface GaleriaMapPhotoPinProps {
  pin: GaleriaMapaPin;
  selected?: boolean;
  onClick: () => void;
}

const bgByEstado: Record<string, string> = {
  Destacado: "bg-amber-50",
  Aprobado: "bg-green-50",
  Rechazado: "bg-red-50",
  Pendiente: "bg-slate-100",
};

const badgeByEstado: Record<string, string> = {
  Destacado: "bg-amber-400 text-white",
  Aprobado: "bg-green-500 text-white",
  Rechazado: "bg-red-500 text-white",
  Pendiente: "bg-slate-400 text-white",
};

export function GaleriaMapPhotoPin({
  pin,
  selected = false,
  onClick,
}: GaleriaMapPhotoPinProps) {
  const bg = bgByEstado[pin.estado_cover] ?? "bg-slate-100";
  const badgeCls = badgeByEstado[pin.estado_cover] ?? "bg-slate-400 text-white";

  return (
    <div className="flex flex-col items-center" onClick={onClick}>
      {/* Pin box */}
      <div
        className={cn(
          "relative w-[60px] h-[60px] rounded-lg shadow-md overflow-hidden cursor-pointer",
          "transition-all duration-150",
          bg,
          selected
            ? "ring-2 ring-blue-500 ring-offset-1 scale-110"
            : "ring-0 hover:ring-2 hover:ring-blue-300 hover:ring-offset-1"
        )}
      >
        {/* Cover photo or fallback icon */}
        {pin.cover_url ? (
          <img
            src={pin.cover_url}
            alt={pin.nombre_cliente}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Images className="w-7 h-7 text-slate-400" />
          </div>
        )}

        {/* Badge numérico esquina superior derecha */}
        <span
          className={cn(
            "absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full",
            "text-[10px] font-bold leading-[18px] text-center",
            badgeCls
          )}
        >
          {pin.total_exhibiciones}
        </span>
      </div>

      {/* Tail triangular */}
      <svg
        width="14"
        height="8"
        viewBox="0 0 14 8"
        className="-mt-px"
        aria-hidden
      >
        <polygon
          points="0,0 14,0 7,8"
          className={cn(
            "transition-colors duration-150",
            selected ? "fill-blue-500" : "fill-white"
          )}
          style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.15))" }}
        />
      </svg>
    </div>
  );
}
