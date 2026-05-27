"use client";

import React from "react";
import { GitBranch, X } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DashboardPeriodPills } from "./DashboardPeriodPills";
import type { SucursalStats } from "@/lib/api";
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
    ? (sucursales.find((s) => s.location_id === sucursalFiltro)?.sucursal ?? sucursalFiltro)
    : null;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl border border-slate-200/50 bg-white/80 backdrop-blur-xl shadow-sm relative z-20",
        className,
      )}
    >
      {/* Sucursal — izquierda */}
      <div className="flex items-center gap-2 min-w-0">
        {sucursales.length > 1 && (
          <div className="flex items-center gap-1.5 bg-slate-50/60 px-3 py-1.5 rounded-xl border border-slate-100 hover:bg-white hover:border-slate-200 transition-all group">
            <GitBranch size={13} className="text-slate-400 group-hover:text-emerald-500 transition-colors shrink-0" />
            <Select
              value={sucursalFiltro || "__all__"}
              onValueChange={(val) => onSucursal(val === "__all__" ? "" : val)}
            >
              <SelectTrigger className="bg-transparent text-[11px] font-black uppercase tracking-widest border-none shadow-none focus:ring-0 h-auto py-0 px-0 gap-1 text-slate-700 hover:text-slate-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__" className="text-[11px] font-black uppercase tracking-widest">
                  Todas las sucursales
                </SelectItem>
                {sucursales.map((s) => (
                  <SelectItem
                    key={s.location_id}
                    value={s.location_id}
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
          <Badge
            variant="secondary"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-violet-50 text-violet-700 border border-violet-200/60 cursor-pointer hover:bg-violet-100 transition-colors"
            onClick={() => onSucursal("")}
          >
            {activeSucursalLabel}
            <X size={10} className="opacity-60" />
          </Badge>
        )}

        {sucursales.length <= 1 && (
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 hidden sm:block">
            Filtros
          </span>
        )}
      </div>

      {/* Período + hint — derecha */}
      <div className="flex flex-col items-end gap-0.5">
        <DashboardPeriodPills
          value={periodPreset}
          customYear={customYear}
          customMonth={customMonth}
          onChange={onPeriodChange}
        />
        <span className="text-[9px] font-bold text-slate-400 tracking-wide pr-0.5">
          {bounds.hint}
        </span>
      </div>
    </div>
  );
}
