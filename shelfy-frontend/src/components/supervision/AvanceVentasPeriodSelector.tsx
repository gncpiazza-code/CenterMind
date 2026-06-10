"use client";

import { useMemo } from "react";
import type { AvanceVentasModo } from "@/lib/api";
import {
  addDaysIso,
  buildMesOptions,
  buildSemanaOptions,
  mondayOfWeek,
  todayIsoAr,
} from "@/lib/avance-ventas-format";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface AvanceVentasPeriodSelectorProps {
  modo: AvanceVentasModo;
  fecha: string;
  onChange: (modo: AvanceVentasModo, fecha: string) => void;
  className?: string;
}

const MODOS: Array<{ id: AvanceVentasModo; label: string }> = [
  { id: "dia", label: "Día" },
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mes" },
];

/** Selector día / semana lun–sáb / mes calendario — sin rango libre. */
export function AvanceVentasPeriodSelector({
  modo,
  fecha,
  onChange,
  className,
}: AvanceVentasPeriodSelectorProps) {
  const hoy = todayIsoAr();
  const ayer = addDaysIso(hoy, -1);

  const semanaOptions = useMemo(() => buildSemanaOptions(12, hoy), [hoy]);
  const mesOptions = useMemo(() => buildMesOptions(12, hoy), [hoy]);

  const handleModo = (nuevo: AvanceVentasModo) => {
    if (nuevo === modo) return;
    // Ancla por defecto al cambiar de modo: hoy / semana en curso / mes en curso.
    if (nuevo === "dia") onChange(nuevo, hoy);
    else if (nuevo === "semana") onChange(nuevo, mondayOfWeek(hoy));
    else onChange(nuevo, `${hoy.slice(0, 7)}-01`);
  };

  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      <div
        role="tablist"
        aria-label="Periodo"
        className="inline-flex items-center rounded-lg border border-[var(--shelfy-border)] bg-muted/60 p-0.5 gap-0.5"
      >
        {MODOS.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={modo === m.id}
            onClick={() => handleModo(m.id)}
            className={cn(
              "rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors",
              modo === m.id
                ? "bg-card text-[var(--shelfy-text)] shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {modo === "dia" && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onChange("dia", hoy)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
              fecha === hoy
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "border-[var(--shelfy-border)] text-muted-foreground hover:text-foreground",
            )}
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => onChange("dia", ayer)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
              fecha === ayer
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "border-[var(--shelfy-border)] text-muted-foreground hover:text-foreground",
            )}
          >
            Ayer
          </button>
          <DatePicker
            value={fecha}
            onChange={(v) => v && onChange("dia", v)}
            maxDate={hoy}
            className="h-8 w-36 text-xs"
          />
        </div>
      )}

      {modo === "semana" && (
        <Select value={mondayOfWeek(fecha)} onValueChange={(v) => onChange("semana", v)}>
          <SelectTrigger className="h-8 text-xs w-56">
            <SelectValue placeholder="Semana" />
          </SelectTrigger>
          <SelectContent>
            {semanaOptions.map((s) => (
              <SelectItem key={s.value} value={s.value} className="text-xs">
                Semana {s.label}
                {s.parcial ? " · en curso" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {modo === "mes" && (
        <Select value={`${fecha.slice(0, 7)}-01`} onValueChange={(v) => onChange("mes", v)}>
          <SelectTrigger className="h-8 text-xs w-44">
            <SelectValue placeholder="Mes" />
          </SelectTrigger>
          <SelectContent>
            {mesOptions.map((m) => (
              <SelectItem key={m.value} value={m.value} className="text-xs">
                {m.label}
                {m.parcial ? " · en curso" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
