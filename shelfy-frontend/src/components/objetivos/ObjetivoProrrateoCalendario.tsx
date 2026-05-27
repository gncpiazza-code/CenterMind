"use client";

import { useMemo } from "react";
import type { Objetivo } from "@/lib/api";
import {
  buildProrrateoGrid,
  type CeldaProrrateo,
} from "@/lib/objetivo-utils";
import { Progress } from "@/components/ui/progress";

const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function colorClase(pct: number, isPast: boolean): string {
  if (!isPast) return "bg-slate-50 border-[var(--shelfy-border)]/50";
  if (pct >= 100) return "bg-emerald-50 border-emerald-200";
  if (pct >= 60) return "bg-amber-50 border-amber-200";
  return "bg-red-50 border-red-200";
}

function textColorClase(pct: number, isPast: boolean): string {
  if (!isPast) return "text-[var(--shelfy-muted)]";
  if (pct >= 100) return "text-emerald-700";
  if (pct >= 60) return "text-amber-700";
  return "text-red-600";
}

function CeldaDia({ celda, dense }: { celda: CeldaProrrateo; dense?: boolean }) {
  const { dia, metaDia, avanceDia, pct, isPastOrToday } = celda;
  const bg = colorClase(pct, isPastOrToday);
  const txt = textColorClase(pct, isPastOrToday);

  return (
    <div
      className={`rounded border p-0.5 flex flex-col justify-between ${dense ? "min-h-[34px]" : "min-h-[44px]"} ${bg} ${
        dia.isToday ? "ring-1 ring-violet-400" : ""
      }`}
      title={`${dia.iso} — ${
        isPastOrToday
          ? `${Math.round(avanceDia)}/${Math.round(metaDia)}`
          : `Meta: ${Math.ceil(metaDia)}`
      }`}
    >
      <span className="text-[9px] text-[var(--shelfy-muted)]/70">
        {String(dia.date.getDate()).padStart(2, "0")}
      </span>
      {isPastOrToday ? (
        <span className={`text-[10px] font-semibold ${txt} tabular-nums`}>
          {Math.round(avanceDia)}/{Math.round(metaDia)}
        </span>
      ) : (
        <span className="text-[10px] text-[var(--shelfy-muted)] tabular-nums">
          {Math.ceil(metaDia)}
        </span>
      )}
    </div>
  );
}

export function ObjetivoProrrateoCalendario({
  obj,
  visualActual,
  compact = false,
}: {
  obj: Objetivo;
  visualActual?: number;
  compact?: boolean;
}) {
  const data = useMemo(
    () => buildProrrateoGrid(obj, visualActual),
    [obj, visualActual]
  );

  if (!data) return null;

  const semanasActivas = data.semanas.filter((s) => s.aplicable);
  const semanasInactivas = data.semanas.filter((s) => !s.aplicable);
  const cellMinH = compact ? "min-h-[34px]" : "min-h-[44px]";

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold text-amber-700">{data.label}</p>
        <span className="text-[10px] text-amber-700/70 shrink-0">
          {data.futuros} día{data.futuros !== 1 ? "s" : ""} restante
          {data.futuros !== 1 ? "s" : ""}
        </span>
      </div>

      {semanasInactivas.length > 0 && (
        <p className="text-[9px] text-[var(--shelfy-muted)] italic">
          {semanasInactivas.length === 1
            ? `${semanasInactivas[0].label}: sin objetivo activo`
            : `${semanasInactivas[0].label}–${semanasInactivas[semanasInactivas.length - 1].label}: sin objetivo activo (antes del inicio)`}
        </p>
      )}

      <div className="grid grid-cols-6 gap-0.5 text-[9px] text-center text-[var(--shelfy-muted)] font-medium">
        {DIAS_CORTOS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="space-y-1">
        {semanasActivas.map((semana) => (
          <div key={semana.key} className="space-y-0.5">
            <p className="text-[9px] font-medium text-[var(--shelfy-muted)] px-0.5">
              {semana.label}
            </p>
            <div className="grid grid-cols-6 gap-0.5">
              {semana.celdas.map((celda, colIdx) => {
                if (celda === null) {
                  return (
                    <div
                      key={colIdx}
                      className={`rounded border border-dashed border-[var(--shelfy-border)]/30 bg-slate-50/50 p-0.5 ${cellMinH} flex items-center justify-center`}
                    >
                      <span className="text-[8px] text-[var(--shelfy-muted)]/40">—</span>
                    </div>
                  );
                }
                if (celda === "pre") {
                  return (
                    <div
                      key={colIdx}
                      className={`rounded border border-dashed border-[var(--shelfy-border)]/30 bg-slate-50/30 p-0.5 ${cellMinH} flex items-center justify-center`}
                      title="Antes del inicio del objetivo"
                    >
                      <span className="text-[7px] text-[var(--shelfy-muted)]/50">N/A</span>
                    </div>
                  );
                }
                return <CeldaDia key={colIdx} celda={celda} dense={compact} />;
              })}
            </div>
            <div className="flex items-center gap-2 px-0.5">
              <Progress value={semana.weekPct} className="flex-1 h-1" />
              <span className="text-[9px] text-[var(--shelfy-muted)] tabular-nums whitespace-nowrap">
                {Math.round(semana.weekAvance)}/{Math.round(semana.weekMeta)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {data.restante > 0 && data.futuros > 0 && (
        <p className="text-[10px] text-amber-700">
          Debe avanzar{" "}
          <span className="font-semibold">
            {Math.ceil(data.metaDiariaFutura)}
          </span>{" "}
          por día (lun–sáb) para cumplir la meta.
        </p>
      )}
      {data.restante === 0 && (
        <p className="text-[10px] text-emerald-600 font-medium">
          ¡Objetivo cumplido!
        </p>
      )}
      {data.futuros === 0 && data.restante > 0 && (
        <p className="text-[10px] text-red-500 font-medium">
          Sin días restantes. Faltaron {Math.round(data.restante)}.
        </p>
      )}
    </div>
  );
}
