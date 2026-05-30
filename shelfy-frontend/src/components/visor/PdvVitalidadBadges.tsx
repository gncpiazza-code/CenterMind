"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Props {
  activoComercial?: boolean;
  className?: string;
}

/** Solo avisa inactividad comercial (sin compra 30d). Si está activo, no muestra nada. */
export function PdvVitalidadBadges({
  activoComercial = true,
  className,
}: Props) {
  if (activoComercial) return null;

  return (
    <div className={cn("pt-1", className)}>
      <Badge
        variant="outline"
        className="h-5 px-1.5 text-[9px] font-semibold border-slate-400/50 bg-slate-500/8 text-slate-600 dark:text-slate-400"
      >
        Inactivo — Sin compras en los últimos 30D
      </Badge>
    </div>
  );
}
