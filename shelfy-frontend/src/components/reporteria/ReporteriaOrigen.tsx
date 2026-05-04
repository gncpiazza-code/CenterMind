"use client";

import { Info, Database, Clock } from "lucide-react";
import type { ReporteriaExploreResponse } from "@/lib/api";

interface Props {
  data: ReporteriaExploreResponse;
}

export function ReporteriaOrigen({ data }: Props) {
  const { origen_datos } = data;
  if (!origen_datos) return null;

  const snapshotDate = origen_datos.snapshot_at
    ? new Date(origen_datos.snapshot_at).toLocaleString("es-AR", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : null;

  return (
    <div className="flex items-start gap-3 bg-slate-50 border border-slate-100 rounded-xl p-4">
      <Database size={15} className="text-[var(--shelfy-muted)] mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-black text-[var(--shelfy-text)] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
          <Info size={10} /> Origen de datos
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1">
          <div>
            <span className="text-[10px] text-[var(--shelfy-muted)] font-medium">Fuente: </span>
            <span className="text-[10px] font-bold text-[var(--shelfy-text)]">{origen_datos.fuente}</span>
          </div>
          <div>
            <span className="text-[10px] text-[var(--shelfy-muted)] font-medium">Menú ERP: </span>
            <span className="text-[10px] font-bold text-[var(--shelfy-text)]">{origen_datos.menu_referencia}</span>
          </div>
          {snapshotDate && (
            <div className="flex items-center gap-1">
              <Clock size={9} className="text-[var(--shelfy-muted)]" />
              <span className="text-[10px] text-[var(--shelfy-muted)] font-medium">Snapshot: </span>
              <span className="text-[10px] font-bold text-[var(--shelfy-text)]">{snapshotDate}</span>
            </div>
          )}
        </div>
        {origen_datos.filtros_aplicados?.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {origen_datos.filtros_aplicados.map((f, i) => (
              <span key={i} className="text-[9px] font-semibold bg-white border border-slate-200 text-[var(--shelfy-muted)] px-2 py-0.5 rounded-full">
                {f}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
