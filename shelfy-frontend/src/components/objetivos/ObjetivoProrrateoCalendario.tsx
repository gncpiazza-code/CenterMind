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
  if (!isPast) return "bg-slate-50 border-[var(--shelfy-border)]";
  if (pct >= 100) return "bg-emerald-50 border-emerald-300";
  if (pct >= 60) return "bg-amber-50 border-amber-300";
  return "bg-red-50 border-red-200";
}

function textColorClase(pct: number, isPast: boolean): string {
  if (!isPast) return "text-[var(--shelfy-muted)]";
  if (pct >= 100) return "text-emerald-800";
  if (pct >= 60) return "text-amber-800";
  return "text-red-700";
}

function fmtAvance(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function CeldaDia({ celda }: { celda: CeldaProrrateo }) {
  const { dia, metaDia, avanceDia, pct, isPastOrToday } = celda;
  const bg = colorClase(pct, isPastOrToday);
  const txt = textColorClase(pct, isPastOrToday);
  const metaShow = Math.max(1, Math.round(metaDia * 10) / 10);

  return (
    <div
      className={`rounded-md border px-0.5 py-1 min-h-[52px] flex flex-col items-center justify-center gap-0.5 text-center ${bg} ${
        dia.isToday ? "ring-2 ring-violet-400 ring-offset-1" : ""
      }`}
      title={`${dia.iso}: ${isPastOrToday ? `${fmtAvance(avanceDia)} de ${fmtAvance(metaShow)}` : `meta ${fmtAvance(metaShow)}`}`}
    >
      <span className="text-[10px] font-medium text-[var(--shelfy-text)] tabular-nums">
        {dia.date.getDate()}
      </span>
      {isPastOrToday ? (
        <span className={`text-[11px] font-bold leading-none ${txt} tabular-nums`}>
          {fmtAvance(avanceDia)}
          <span className="font-normal opacity-70">/{fmtAvance(metaShow)}</span>
        </span>
      ) : (
        <span className="text-[10px] text-[var(--shelfy-muted)] tabular-nums">
          meta {fmtAvance(metaShow)}
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

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-semibold text-amber-800">{data.label}</p>
        <span className="text-[10px] text-amber-800/80">
          {data.futuros} día{data.futuros !== 1 ? "s" : ""} hábil
          {data.futuros !== 1 ? "es" : ""} restante{data.futuros !== 1 ? "s" : ""}
        </span>
      </div>

      <p className="text-[9px] text-[var(--shelfy-muted)] leading-snug">
        Cada celda: <span className="text-emerald-700">avance/meta del día</span>.
        Verde ≥100%, ámbar ≥60%, rojo &lt;60%. Número grande = día del mes.
      </p>

      {semanasInactivas.length > 0 && (
        <p className="text-[9px] text-[var(--shelfy-muted)] italic">
          Antes del inicio del objetivo:{" "}
          {semanasInactivas.map((s) => s.label).join(", ")}
        </p>
      )}

      <div className="space-y-2.5">
        {semanasActivas.map((semana) => (
          <div
            key={semana.key}
            className="rounded-md border border-[var(--shelfy-border)] bg-white/80 p-2 space-y-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold text-[var(--shelfy-text)]">
                {semana.label}
              </span>
              <span className="text-[10px] text-[var(--shelfy-muted)] tabular-nums">
                Semana: {fmtAvance(semana.weekAvance)}/{fmtAvance(semana.weekMeta)}
              </span>
            </div>

            <div className="grid grid-cols-6 gap-1">
              {DIAS_CORTOS.map((d) => (
                <div
                  key={d}
                  className="text-[9px] text-center font-medium text-[var(--shelfy-muted)]"
                >
                  {d}
                </div>
              ))}
              {semana.celdas.map((celda, colIdx) => {
                if (celda === null) {
                  return (
                    <div
                      key={colIdx}
                      className="rounded-md border border-dashed border-[var(--shelfy-border)]/40 bg-slate-50/60 min-h-[52px] flex items-center justify-center"
                    >
                      <span className="text-[9px] text-[var(--shelfy-muted)]/35">—</span>
                    </div>
                  );
                }
                if (celda === "pre") {
                  return (
                    <div
                      key={colIdx}
                      className="rounded-md border border-dashed border-[var(--shelfy-border)]/30 bg-slate-50/40 min-h-[52px] flex items-center justify-center"
                      title="Antes del inicio"
                    >
                      <span className="text-[8px] text-[var(--shelfy-muted)]/50">—</span>
                    </div>
                  );
                }
                return <CeldaDia key={colIdx} celda={celda} />;
              })}
            </div>

            <Progress value={semana.weekPct} className="h-1" />
          </div>
        ))}
      </div>

      {data.restante > 0 && data.futuros > 0 && (
        <p className="text-[10px] text-amber-800">
          Para cumplir faltan{" "}
          <span className="font-semibold">{Math.round(data.restante)}</span> altas
          (~<span className="font-semibold">{Math.ceil(data.metaDiariaFutura)}</span>/día hábil).
        </p>
      )}
      {data.restante === 0 && (
        <p className="text-[10px] text-emerald-600 font-medium">Objetivo cumplido.</p>
      )}
      {data.futuros === 0 && data.restante > 0 && (
        <p className="text-[10px] text-red-600 font-medium">
          Sin días hábiles restantes. Faltaron {Math.round(data.restante)}.
        </p>
      )}
    </div>
  );
}
