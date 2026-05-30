"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AlertTriangle, Camera, Store } from "lucide-react";

interface VisorMetaMinimizedBarProps {
  vendedor: string;
  pdvNombre: string;
  codigoCliente: string;
  envio?: string;
  currentIndex: number;
  totalGrupos: number;
  sinContacto?: boolean;
  className?: string;
}

/** Resumen compacto de Exhibición + PDV cuando el remito está expandido */
export function VisorMetaMinimizedBar({
  vendedor,
  pdvNombre,
  codigoCliente,
  envio,
  currentIndex,
  totalGrupos,
  sinContacto,
  className,
}: VisorMetaMinimizedBarProps) {
  const codigo = codigoCliente.trim().replace(/^#/, "");

  return (
    <div
      className={cn(
        "rounded-lg border border-slate-200/90 dark:border-slate-700/80",
        "bg-gradient-to-r from-violet-50/90 via-white to-sky-50/80",
        "dark:from-violet-950/40 dark:via-slate-950/50 dark:to-sky-950/30",
        "shadow-sm px-2.5 py-2 min-w-0",
        className,
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Camera className="w-3.5 h-3.5 shrink-0 text-violet-600 dark:text-violet-400" aria-hidden />
        <span className="text-[9px] font-bold uppercase tracking-wider text-violet-800 dark:text-violet-300 shrink-0">
          Exhibición
        </span>
        <Badge
          variant="outline"
          className="h-4 px-1.5 text-[9px] font-black tabular-nums border-violet-300/60 bg-violet-500/10 text-violet-800 shrink-0"
        >
          {currentIndex + 1}/{totalGrupos}
        </Badge>
        <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200 truncate min-w-0 flex-1 text-right">
          {vendedor}
        </span>
      </div>

      <div className="mt-1.5 pt-1.5 border-t border-slate-200/70 dark:border-slate-700/50 flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
        <Store className="w-3.5 h-3.5 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden />
        <span className="text-[11px] font-bold text-slate-900 dark:text-slate-50 uppercase truncate min-w-0 flex-1 basis-[8rem]">
          {pdvNombre}
        </span>
        {codigo ? (
          <span className="inline-flex shrink-0 rounded-md bg-slate-900 px-2 py-0.5 text-[10px] font-black font-mono text-white dark:bg-slate-100 dark:text-slate-900">
            #{codigo}
          </span>
        ) : null}
        {envio ? (
          <span className="text-[9px] font-medium text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
            {envio}
          </span>
        ) : null}
      </div>

      {sinContacto ? (
        <p className="mt-1 flex items-center gap-1 text-[9px] font-semibold text-amber-800 dark:text-amber-300">
          <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden />
          Sin teléfono en padrón
        </p>
      ) : null}
    </div>
  );
}
