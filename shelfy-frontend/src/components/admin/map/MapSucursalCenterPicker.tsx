"use client";

import { Building2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MapSucursalCenterPickerProps {
  sucursales: string[];
  loading?: boolean;
  onSelect: (sucursal: string) => void;
  className?: string;
}

/** Selector inicial de sucursal — centrado en el mapa (solo hasta la primera elección). */
export function MapSucursalCenterPicker({
  sucursales,
  loading = false,
  onSelect,
  className,
}: MapSucursalCenterPickerProps) {
  if (loading && sucursales.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-3", className)}>
        <Loader2 className="w-8 h-8 animate-spin text-amber-400/80" />
        <p className="text-sm text-white/70">Cargando sucursales…</p>
      </div>
    );
  }

  if (sucursales.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-3 text-white/50 px-6 text-center", className)}>
        <Building2 className="w-10 h-10 opacity-30" />
        <p className="text-sm">No hay sucursales disponibles para este distribuidor.</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 px-6 py-6 rounded-2xl",
        "bg-slate-950/88 backdrop-blur-xl border border-white/20 shadow-2xl",
        "max-w-lg w-[min(92vw,28rem)]",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-amber-300">
        <Building2 className="w-5 h-5 shrink-0" />
        <p className="text-sm font-bold text-white">¿Qué sucursal querés supervisar?</p>
      </div>
      <p className="text-[11px] text-white/55 text-center leading-relaxed">
        Elegí una para ver vendedores y PDVs en el mapa. Después podés cambiarla desde el panel lateral.
      </p>
      <div className="flex flex-wrap gap-2 justify-center w-full">
        {sucursales.map((suc) => (
          <button
            key={suc}
            type="button"
            onClick={() => onSelect(suc)}
            className="px-4 py-2 rounded-xl text-xs font-bold border border-white/25 bg-white/10 text-white hover:bg-amber-500/25 hover:border-amber-400/50 hover:text-amber-100 transition-all shadow-sm"
          >
            {suc}
          </button>
        ))}
      </div>
    </div>
  );
}
