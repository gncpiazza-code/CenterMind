"use client";

import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
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
  isDark?: boolean;
  compact?: boolean;
}

export function DashboardPeriodPills({
  value,
  customYear,
  customMonth,
  onChange,
  className,
  isDark = false,
  compact = false,
}: DashboardPeriodPillsProps) {
  const now = new Date();
  const [popYear, setPopYear]   = useState(customYear  ?? now.getFullYear());
  const [popMonth, setPopMonth] = useState(customMonth ?? (now.getMonth() + 1));
  const [open, setOpen]         = useState(false);

  const currentYear = now.getFullYear();
  const years       = [currentYear - 1, currentYear];
  const isCustom    = value === "mes-custom";

  function applyCustom() {
    onChange("mes-custom", popYear, popMonth);
    setOpen(false);
  }

  const pillBase = compact
    ? "h-7 px-2 text-[9px] font-black uppercase tracking-widest rounded-lg border transition-all duration-150 flex-1"
    : "h-6 px-2.5 text-[9px] font-black uppercase tracking-widest rounded-lg border transition-all duration-150";
  const pillOn   = isDark ? "bg-slate-200 text-slate-900 border-slate-200" : "bg-slate-800 text-white border-slate-800";
  const pillOff  = isDark
    ? "bg-transparent text-slate-400 border-slate-600 hover:bg-slate-800 hover:text-slate-200 hover:border-slate-500"
    : "bg-white/0 text-slate-500 border-slate-200/60 hover:bg-slate-50 hover:text-slate-800 hover:border-slate-300";

  return (
    <div className={cn("flex items-center gap-1", compact && "w-full", className)}>
      {PERIOD_PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => onChange(p.key)}
          className={cn(pillBase, value === p.key && !isCustom ? pillOn : pillOff)}
        >
          {p.label}
        </button>
      ))}

      {/* Seleccionar mes — popover */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(pillBase, "flex items-center gap-0.5", isCustom ? pillOn : pillOff)}
          >
            {isCustom ? `${MESES[popMonth - 1].slice(0, 3)} ${popYear}` : "Mes"}
            <ChevronDown size={9} className={cn("transition-transform", open && "rotate-180")} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-52 p-3 rounded-2xl shadow-xl border-slate-100">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Mes histórico</p>
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
