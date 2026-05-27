"use client";

import React from "react";
import { GitBranch, X } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DashboardPeriodPills } from "./DashboardPeriodPills";
import type { SucursalStats } from "@/lib/api";
import { sucursalFilterKey } from "@/lib/api";
import type { PeriodPreset } from "@/lib/dashboard-period";
import { resolvePeriodBounds } from "@/lib/dashboard-period";
import { cn } from "@/lib/utils";

interface DashboardToolbarProps {
  periodPreset: PeriodPreset;
  customYear?: number;
  customMonth?: number;
  onPeriodChange: (preset: PeriodPreset, year?: number, month?: number) => void;
  sucursalFiltro: string;
  sucursales: SucursalStats[];
  onSucursal: (s: string) => void;
  className?: string;
}

export function DashboardToolbar({
  periodPreset,
  customYear,
  customMonth,
  onPeriodChange,
  sucursalFiltro,
  sucursales,
  onSucursal,
  className,
}: DashboardToolbarProps) {
  const bounds = resolvePeriodBounds(periodPreset, customYear, customMonth);
  const activeSucursalLabel = sucursalFiltro
    ? (sucursales.find((s) => sucursalFilterKey(s) === sucursalFiltro)?.sucursal ?? sucursalFiltro)
    : null;

  return (
    <div className={cn(
      "flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl border border-slate-100/80 bg-white/60 backdrop-blur-sm relative z-20",
      className,
    )}>
      {/* Sucursal — izquierda, solo si hay >1 */}
      <div className="flex items-center gap-1.5 min-w-0">
        {sucursales.length > 1 && (
          <div className="flex items-center gap-1 group">
            <GitBranch size={11} className="text-slate-400 shrink-0" />
            <Select
              value={sucursalFiltro || "__all__"}
              onValueChange={(val) => onSucursal(val === "__all__" ? "" : val)}
            >
              <SelectTrigger className="bg-transparent text-[10px] font-black uppercase tracking-widest border-none shadow-none focus:ring-0 h-auto py-0 px-0 gap-1 text-slate-500 hover:text-slate-800 w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__" className="text-[11px] font-black uppercase tracking-widest">
                  Todas
                </SelectItem>
                {sucursales.map((s) => (
                  <SelectItem
                    key={sucursalFilterKey(s)}
                    value={sucursalFilterKey(s)}
                    className="text-[11px] font-black uppercase tracking-widest"
                  >
                    {s.sucursal}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {activeSucursalLabel && (
          <button
            onClick={() => onSucursal("")}
            className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-violet-600 bg-violet-50 border border-violet-200/60 px-2 py-0.5 rounded-md hover:bg-violet-100 transition-colors"
          >
            {activeSucursalLabel}
            <X size={9} className="opacity-60" />
          </button>
        )}
      </div>

      {/* Período + hint — derecha */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[9px] font-bold text-slate-400 tracking-wide hidden sm:block">
          {bounds.hint}
        </span>
        <DashboardPeriodPills
          value={periodPreset}
          customYear={customYear}
          customMonth={customMonth}
          onChange={onPeriodChange}
        />
      </div>
    </div>
  );
}
