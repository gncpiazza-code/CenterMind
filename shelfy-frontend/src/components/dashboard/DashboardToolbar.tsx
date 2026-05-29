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
  isImmersive?: boolean;
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
  isImmersive = false,
}: DashboardToolbarProps) {
  const bounds = resolvePeriodBounds(periodPreset, customYear, customMonth);
  const activeSucursalLabel = sucursalFiltro
    ? (sucursales.find((s) => sucursalFilterKey(s) === sucursalFiltro)?.sucursal ?? sucursalFiltro)
    : null;

  return (
    <div className={cn(
      "flex items-center justify-between gap-2 px-3 py-2 rounded-2xl border relative z-20",
      isImmersive
        ? "bg-slate-900 border-slate-700"
        : "border-violet-200/50 bg-white/75 backdrop-blur-md shadow-sm shadow-violet-500/5 ring-1 ring-violet-500/10",
      className,
    )}>
      {/* Sucursal — izquierda, solo si hay >1 */}
      <div className="flex items-center gap-1.5 min-w-0">
        {sucursales.length > 1 && (
          <div className="flex items-center gap-1 group">
            <GitBranch size={11} className={cn("shrink-0", isImmersive ? "text-slate-500" : "text-slate-400")} />
            <Select
              value={sucursalFiltro || "__all__"}
              onValueChange={(val) => onSucursal(val === "__all__" ? "" : val)}
            >
              <SelectTrigger className={cn(
                "bg-transparent text-[10px] font-black uppercase tracking-widest border-none shadow-none focus:ring-0 h-auto py-0 px-0 gap-1 w-auto",
                isImmersive ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-800",
              )}>
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
            className={cn(
              "flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md transition-colors",
              isImmersive
                ? "text-violet-400 bg-violet-950/60 border border-violet-800 hover:bg-violet-950"
                : "text-violet-600 bg-violet-50 border border-violet-200/60 hover:bg-violet-100",
            )}
          >
            {activeSucursalLabel}
            <X size={9} className="opacity-60" />
          </button>
        )}
      </div>

      {/* Período + hint — derecha */}
      <div className="flex items-center gap-2 shrink-0">
        <span className={cn(
          "text-[9px] font-bold tracking-wide hidden sm:block",
          isImmersive ? "text-slate-500" : "text-slate-400",
        )}>
          {bounds.hint}
        </span>
        <DashboardPeriodPills
          value={periodPreset}
          customYear={customYear}
          customMonth={customMonth}
          onChange={onPeriodChange}
          isImmersive={isImmersive}
        />
      </div>
    </div>
  );
}
