"use client";

import { formatFechaDiaAR } from "@/lib/fecha-ar";
import { cn } from "@/lib/utils";

interface VisorPdvIdentityHeaderProps {
  nombreFantasia?: string | null;
  nombreRazon?: string | null;
  codigoCliente?: string | null;
  fechaAlta?: string | null;
  className?: string;
}

const badgeCodigo =
  "inline-flex items-center rounded-md px-3 py-1.5 text-[12px] font-black font-mono tabular-nums shrink-0 " +
  "bg-slate-900 text-white shadow-md ring-1 ring-slate-700/50 dark:bg-slate-100 dark:text-slate-900 dark:ring-slate-300/40";

/** Nombre del PDV + fecha de alta inline + código ERP (#) alineado a la derecha */
export function VisorPdvIdentityHeader({
  nombreFantasia,
  nombreRazon,
  codigoCliente,
  fechaAlta,
  className,
}: VisorPdvIdentityHeaderProps) {
  const titulo = (nombreFantasia || nombreRazon)?.trim();
  const razon = nombreRazon?.trim();
  const codigo = codigoCliente?.trim().replace(/^#/, "");
  const altaLabel = formatFechaDiaAR(fechaAlta);

  if (!titulo && !codigo) return null;

  const showRazon = razon && razon !== (nombreFantasia?.trim() || titulo);

  return (
    <div className={cn("mb-2", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1.5 min-w-0 w-full">
        {titulo ? (
          <p className="text-[13px] font-extrabold text-slate-900 dark:text-slate-50 leading-tight uppercase tracking-tight min-w-0 flex-1 basis-[min(100%,12rem)]">
            <span>{titulo}</span>
            {fechaAlta ? (
              <span className="ml-2 text-[10px] font-semibold normal-case tracking-normal text-slate-500 dark:text-slate-400 whitespace-nowrap">
                Alta {altaLabel}
              </span>
            ) : null}
          </p>
        ) : null}
        {codigo ? <span className={cn(badgeCodigo, "ml-auto shrink-0")}>#{codigo}</span> : null}
      </div>
      {showRazon ? (
        <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 mt-1 uppercase tracking-wide leading-snug">
          {razon}
        </p>
      ) : null}
    </div>
  );
}
