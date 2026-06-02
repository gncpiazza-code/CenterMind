"use client";

import { formatBultosCantidad, DEFAULT_UNIDADES_POR_BULTO } from "@/lib/bultos-display";
import { cn } from "@/lib/utils";

interface BultosCantidadTextProps {
  bultos: number;
  factor?: number;
  className?: string;
  secondaryClassName?: string;
}

/** Muestra bultos o unidades según regla Shelfy (< 1 bulto → unidades). */
export function BultosCantidadText({
  bultos,
  factor = DEFAULT_UNIDADES_POR_BULTO,
  className,
  secondaryClassName,
}: BultosCantidadTextProps) {
  const fmt = formatBultosCantidad(bultos, factor);
  return (
    <span className={cn("inline-flex flex-col items-end leading-tight", className)}>
      <span>{fmt.primary}</span>
      {fmt.secondary && (
        <span className={cn("text-[10px] font-semibold opacity-70", secondaryClassName)}>
          {fmt.secondary}
        </span>
      )}
    </span>
  );
}
