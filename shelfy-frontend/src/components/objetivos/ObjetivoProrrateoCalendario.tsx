"use client";

import { useMemo } from "react";
import type { Objetivo } from "@/lib/api";
import { periodoProrrateo, type DiaHabil } from "@/lib/objetivo-utils";
import { Progress } from "@/components/ui/progress";

// ── helpers ───────────────────────────────────────────────────────────────────

function semanaKey(d: Date): string {
  // Agrupamos por semana ISO-like: lunes de la semana
  const day = new Date(d);
  const wd = day.getDay() || 7; // domingo=7
  day.setDate(day.getDate() - wd + 1); // retrocede al lunes
  return day.toISOString().slice(0, 10);
}

function agruparPorSemana(dias: DiaHabil[]): Map<string, DiaHabil[]> {
  const map = new Map<string, DiaHabil[]>();
  for (const d of dias) {
    const k = semanaKey(d.date);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(d);
  }
  return map;
}

const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function diaSemanaIdx(d: Date): number {
  // Lun=0 … Sáb=5
  return (d.getDay() + 6) % 7; // dom=6 pero no aparece (lun-sáb filter)
}

// ── tipos celda ───────────────────────────────────────────────────────────────

interface CeldaInfo {
  dia: DiaHabil;
  metaDia: number;
  avanceDia: number;
  pct: number;
}

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

// ── componente ────────────────────────────────────────────────────────────────

export function ObjetivoProrrateoCalendario({
  obj,
  visualActual,
}: {
  obj: Objetivo;
  visualActual?: number;
}) {
  const periodo = useMemo(() => periodoProrrateo(obj), [obj]);

  const data = useMemo(() => {
    if (!periodo || !obj.valor_objetivo) return null;

    const meta = obj.valor_objetivo;
    const actual = Math.max(obj.valor_actual ?? 0, visualActual ?? 0);

    const progresoDiario: Record<string, number> =
      (obj.desglose_cache as any)?.progreso_diario ?? {};
    const hasReal = Object.keys(progresoDiario).length > 0;

    const diasValidos = periodo.diasValidos;
    const pasados = diasValidos.filter((d) => d.isPast || d.isToday);
    const futuros = diasValidos.filter((d) => d.isFuture);

    let avancePasado = 0;
    if (hasReal) {
      pasados.forEach((d) => {
        avancePasado += progresoDiario[d.iso] ?? 0;
      });
    } else {
      avancePasado = actual;
    }

    const metaDiariaOriginal =
      diasValidos.length > 0 ? meta / diasValidos.length : 0;
    const restante = Math.max(0, meta - actual);
    const metaDiariaFutura =
      futuros.length > 0 ? restante / futuros.length : 0;
    const avgPasado = pasados.length > 0 ? actual / pasados.length : 0;

    const semanas = agruparPorSemana(periodo.todosDias);

    const semanasArr = Array.from(semanas.entries()).map(([lunes, dias]) => {
      const celdas: (CeldaInfo | null)[] = Array(6).fill(null); // idx 0=Lun … 5=Sáb

      for (const dia of dias) {
        const colIdx = diaSemanaIdx(dia.date);
        if (colIdx > 5) continue;

        let metaDia: number;
        let avanceDia: number;

        if (dia.isPreStart) {
          celdas[colIdx] = null; // N/A
          continue;
        }

        if (dia.isPast || dia.isToday) {
          metaDia = metaDiariaOriginal;
          avanceDia = hasReal
            ? (progresoDiario[dia.iso] ?? 0)
            : avgPasado;
        } else {
          metaDia = metaDiariaFutura;
          avanceDia = 0;
        }

        const pct =
          metaDia > 0
            ? Math.min(100, Math.round((avanceDia / metaDia) * 100))
            : avanceDia > 0
            ? 100
            : 0;

        celdas[colIdx] = { dia, metaDia, avanceDia, pct };
      }

      const weekMeta = celdas.reduce((s, c) => s + (c?.metaDia ?? 0), 0);
      const weekAvance = celdas.reduce((s, c) => s + (c?.avanceDia ?? 0), 0);
      const weekPct =
        weekMeta > 0
          ? Math.min(100, Math.round((weekAvance / weekMeta) * 100))
          : 0;

      return { lunes, celdas, weekMeta, weekAvance, weekPct };
    });

    return {
      semanasArr,
      metaDiariaFutura,
      restante,
      futuros: futuros.length,
      diasValidos: diasValidos.length,
    };
  }, [periodo, obj, visualActual]);

  if (!periodo || !data) return null;

  const isCompania = obj.origen === "compania";
  const label = isCompania ? "Prorrateo mensual (lun–sáb)" : "Prorrateo por período (lun–sáb)";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-amber-700">{label}</p>
        <span className="text-[10px] text-amber-700/70">
          {data.futuros} día{data.futuros !== 1 ? "s" : ""} restante{data.futuros !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Header días */}
      <div className="grid grid-cols-6 gap-1 text-[10px] text-center text-[var(--shelfy-muted)] font-medium">
        {DIAS_CORTOS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      {/* Semanas */}
      <div className="space-y-1">
        {data.semanasArr.map(({ lunes, celdas, weekMeta, weekAvance, weekPct }) => (
          <div key={lunes} className="space-y-0.5">
            {/* Fila días */}
            <div className="grid grid-cols-6 gap-1">
              {celdas.map((celda, colIdx) => {
                if (!celda) {
                  // Celda vacía (día fuera del rango o N/A)
                  return (
                    <div
                      key={colIdx}
                      className="rounded border border-dashed border-[var(--shelfy-border)]/30 bg-slate-50/50 p-1 min-h-[44px] flex flex-col items-center justify-center"
                    >
                      <span className="text-[9px] text-[var(--shelfy-muted)]/40">—</span>
                    </div>
                  );
                }

                const { dia, metaDia, avanceDia, pct } = celda;
                const isPastOrToday = dia.isPast || dia.isToday;
                const bg = colorClase(pct, isPastOrToday);
                const txt = textColorClase(pct, isPastOrToday);

                return (
                  <div
                    key={colIdx}
                    className={`rounded border p-1 min-h-[44px] flex flex-col justify-between ${bg} ${dia.isToday ? "ring-1 ring-violet-400" : ""}`}
                    title={`${dia.iso} — ${isPastOrToday ? `${Math.round(avanceDia)}/${Math.round(metaDia)}` : `Meta: ${Math.ceil(metaDia)}`}`}
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
              })}
            </div>

            {/* Resumen semana */}
            <div className="flex items-center gap-2 px-0.5">
              <Progress value={weekPct} className="flex-1 h-1" />
              <span className="text-[9px] text-[var(--shelfy-muted)] tabular-nums whitespace-nowrap">
                {Math.round(weekAvance)}/{Math.round(weekMeta)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {data.restante > 0 && data.futuros > 0 && (
        <p className="text-[10px] text-amber-700">
          Debe avanzar{" "}
          <span className="font-semibold">{Math.ceil(data.metaDiariaFutura)}</span> por día (lun–sáb)
          para cumplir la meta.
        </p>
      )}
      {data.restante === 0 && (
        <p className="text-[10px] text-emerald-600 font-medium">¡Objetivo cumplido!</p>
      )}
      {data.futuros === 0 && data.restante > 0 && (
        <p className="text-[10px] text-red-500 font-medium">
          Sin días restantes. Faltaron {Math.round(data.restante)}.
        </p>
      )}
    </div>
  );
}
