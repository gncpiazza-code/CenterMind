"use client";

import { cn } from "@/lib/utils";

interface GaleriaMapClusterPinProps {
  /** Total de PDVs en el cluster */
  count: number;
  /** Callback para hacer zoom in al cluster */
  onZoomIn: () => void;
}

/** Placeholder cluster pin — producción usa MapClusterLayer (WebGL nativo). */
export function GaleriaMapClusterPin({
  count,
  onZoomIn,
}: GaleriaMapClusterPinProps) {
  // Tamaño dinámico según cantidad de puntos
  const sizeClass =
    count >= 100
      ? "w-14 h-14 text-sm font-bold"
      : count >= 20
        ? "w-11 h-11 text-xs font-semibold"
        : "w-9 h-9 text-xs font-medium";

  return (
    <button
      type="button"
      onClick={onZoomIn}
      aria-label={`Cluster de ${count} PDVs. Clic para acercar.`}
      className={cn(
        "rounded-full bg-blue-600 text-white flex items-center justify-center",
        "border-2 border-white shadow-md cursor-pointer",
        "hover:bg-blue-700 transition-colors duration-150",
        sizeClass
      )}
    >
      {count}
    </button>
  );
}
