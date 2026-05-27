"use client";

import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/Button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  type PeriodPreset,
  PERIOD_PRESETS,
  resolvePeriodBounds,
} from "@/lib/dashboard-period";
import { cn } from "@/lib/utils";

const MESES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

interface DashboardPeriodPillsProps {
  value: PeriodPreset;
  customYear?: number;
  customMonth?: number;
  onChange: (preset: PeriodPreset, year?: number, month?: number) => void;
  className?: string;
}

export function DashboardPeriodPills({
  value,
  customYear,
  customMonth,
  onChange,
  className,
}: DashboardPeriodPillsProps) {
  const now = new Date();
  const [popYear, setPopYear]   = useState(customYear  ?? now.getFullYear());
  const [popMonth, setPopMonth] = useState(customMonth ?? (now.getMonth() + 1));
  const [open, setOpen]         = useState(false);

  const currentYear = now.getFullYear();
  const years = [currentYear - 1, currentYear];

  function applyCustom() {
    onChange("mes-custom", popYear, popMonth);
    setOpen(false);
  }

  const isCustomActive = value === "mes-custom";

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <ToggleGroup
        type="single"
        value={isCustomActive ? "" : value}
        onValueChange={(v) => {
          if (v && v !== "mes-custom") onChange(v as PeriodPreset);
        }}
        className="gap-1"
      >
        {PERIOD_PRESETS.map((p) => (
          <ToggleGroupItem
            key={p.key}
            value={p.key}
            aria-label={p.label}
            className={cn(
              "h-8 px-3.5 text-[10px] font-black uppercase tracking-widest rounded-xl border transition-all",
              "data-[state=on]:bg-slate-900 data-[state=on]:text-white data-[state=on]:border-slate-900",
              "data-[state=off]:bg-white data-[state=off]:text-slate-500 data-[state=off]:border-slate-200",
              "hover:bg-slate-50 hover:text-slate-800"
            )}
          >
            {p.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {/* Seleccionar mes — popover */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex items-center gap-1 h-8 px-3.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all",
              isCustomActive
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:text-slate-800"
            )}
          >
            {isCustomActive
              ? `${MESES[popMonth - 1]} ${popYear}`.slice(0, 8) + (MESES[popMonth - 1].length > 5 ? "…" : "")
              : "Mes ▾"}
            <ChevronDown size={11} className={cn("transition-transform", open && "rotate-180")} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-3 rounded-2xl shadow-xl border-slate-100">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Seleccionar mes</p>
          <div className="flex flex-col gap-2">
            <Select value={String(popYear)} onValueChange={(v) => setPopYear(Number(v))}>
              <SelectTrigger className="h-8 rounded-xl text-[11px] font-black">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)} className="text-[11px] font-black">{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(popMonth)} onValueChange={(v) => setPopMonth(Number(v))}>
              <SelectTrigger className="h-8 rounded-xl text-[11px] font-black">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESES.map((m, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)} className="text-[11px] font-black">{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={applyCustom}
              className="w-full text-[10px] font-black uppercase tracking-wider h-8 rounded-xl bg-slate-900 hover:bg-black text-white"
            >
              Aplicar
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
