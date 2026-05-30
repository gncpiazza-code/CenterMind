"use client";

import React, { useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DashboardPeriodPills } from "./DashboardPeriodPills";
import { DashboardThemeToggle } from "./DashboardThemeToggle";
import { DashboardFullscreenButton } from "./DashboardFullscreenButton";
import type { SucursalStats } from "@/lib/api";
import { sucursalFilterKey } from "@/lib/api";
import type { PeriodPreset } from "@/lib/dashboard-period";
import { resolvePeriodBounds, PERIOD_PRESETS } from "@/lib/dashboard-period";
import { cn } from "@/lib/utils";

const MESES_SHORT = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];

interface DashboardFilterBarProps {
  periodPreset: PeriodPreset;
  customYear?: number;
  customMonth?: number;
  onPeriodChange: (preset: PeriodPreset, year?: number, month?: number) => void;
  sucursalFiltro: string;
  sucursales: SucursalStats[];
  onSucursal: (s: string) => void;
  isDark?: boolean;
  onToggleTheme: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  className?: string;
  /** vertical: columna fija a la derecha del dashboard (iconos apilados) */
  layout?: "horizontal" | "stacked";
}

export function DashboardFilterBar({
  periodPreset,
  customYear,
  customMonth,
  onPeriodChange,
  sucursalFiltro,
  sucursales,
  onSucursal,
  isDark = false,
  onToggleTheme,
  isFullscreen,
  onToggleFullscreen,
  className,
  layout = "horizontal",
}: DashboardFilterBarProps) {
  const stacked = layout === "stacked";
  const [open, setOpen] = useState(false);

  const bounds = resolvePeriodBounds(periodPreset, customYear, customMonth);

  const sucursalLabel = sucursalFiltro
    ? (sucursales.find((s) => sucursalFilterKey(s) === sucursalFiltro)?.sucursal ?? sucursalFiltro).toUpperCase()
    : "TODAS";

  const periodLabel =
    periodPreset === "mes-custom" && customMonth
      ? `${MESES_SHORT[(customMonth - 1) % 12]} ${customYear ?? ""}`
      : (PERIOD_PRESETS.find((p) => p.key === periodPreset)?.label ?? "MES").toUpperCase();

  const isFiltered = sucursalFiltro !== "" || periodPreset !== "mes";

  const filterTriggerClass = cn(
    "relative flex items-center justify-center rounded-xl border transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
    stacked ? "h-8 w-8 shrink-0" : "gap-2 h-8 px-3 text-[10px] font-black uppercase tracking-widest",
    isDark
      ? "bg-slate-800 border-slate-600/80 text-slate-200 hover:bg-slate-750 hover:border-slate-500"
      : [
          "bg-white/90 backdrop-blur-sm text-slate-700",
          "border-violet-200/60 hover:border-violet-300",
          "shadow-sm shadow-violet-500/8 ring-1 ring-violet-500/10",
          "hover:bg-violet-50/80 hover:shadow-violet-500/15",
        ].join(" "),
    open && (
      isDark
        ? "bg-slate-750 border-slate-500"
        : "bg-violet-50/90 border-violet-300 shadow-violet-500/15"
    ),
  );

  const controls = (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <motion.button
            type="button"
            whileHover={{ scale: 1.015 }}
            whileTap={{ scale: 0.975 }}
            transition={{ duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
            className={filterTriggerClass}
            title={`${sucursalLabel} · ${periodLabel}`}
            aria-label={`Filtros: ${sucursalLabel}, ${periodLabel}`}
          >
            <AnimatePresence>
              {isFiltered && (
                <motion.span
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "backOut" }}
                  className={cn(
                    "absolute -top-1 -right-1 w-2 h-2 rounded-full",
                    isDark ? "bg-violet-400" : "bg-violet-500",
                  )}
                />
              )}
            </AnimatePresence>

            <SlidersHorizontal
              size={stacked ? 14 : 10}
              className={cn(
                "transition-colors duration-200 shrink-0",
                isDark
                  ? open ? "text-violet-400" : "text-slate-500"
                  : open ? "text-violet-500" : "text-violet-400/70",
              )}
            />

            {!stacked && (
              <>
                <span className="tracking-widest">
                  {sucursalLabel}
                  <span className={cn("mx-1.5", isDark ? "text-slate-600" : "text-slate-300")}>·</span>
                  {periodLabel}
                </span>
                <ChevronDown
                  size={9}
                  className={cn(
                    "transition-transform duration-250 ease-[cubic-bezier(0.34,1.56,0.64,1)] shrink-0",
                    open && "rotate-180",
                    isDark ? "text-slate-500" : "text-slate-400",
                  )}
                />
              </>
            )}
          </motion.button>
        </PopoverTrigger>

        <PopoverContent
          align="end"
          sideOffset={8}
          className={cn(
            "w-60 p-4 rounded-2xl border",
            isDark
              ? "bg-slate-900 border-slate-700 shadow-2xl shadow-black/40"
              : "bg-white border-violet-100 shadow-2xl shadow-violet-500/12",
          )}
          style={{
            animation: "none",
          }}
        >
          {/* Sucursal */}
          {sucursales.length > 1 && (
            <div className="mb-4">
              <p className={cn(
                "text-[9px] font-black uppercase tracking-[0.18em] mb-2 flex items-center gap-1.5",
                isDark ? "text-slate-500" : "text-slate-400",
              )}>
                Sucursal
              </p>
              <Select
                value={sucursalFiltro || "__all__"}
                onValueChange={(val) => onSucursal(val === "__all__" ? "" : val)}
              >
                <SelectTrigger className={cn(
                  "h-8 rounded-xl text-[10px] font-black uppercase tracking-widest",
                  isDark
                    ? "bg-slate-800 border-slate-600 text-slate-200"
                    : "border-slate-200 text-slate-700",
                )}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="__all__" className="text-[10px] font-black uppercase tracking-widest">
                    Todas
                  </SelectItem>
                  {sucursales.map((s) => (
                    <SelectItem
                      key={sucursalFilterKey(s)}
                      value={sucursalFilterKey(s)}
                      className="text-[10px] font-black uppercase tracking-widest"
                    >
                      {s.sucursal}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Período */}
          <div>
            <p className={cn(
              "text-[9px] font-black uppercase tracking-[0.18em] mb-2",
              isDark ? "text-slate-500" : "text-slate-400",
            )}>
              Período
            </p>
            <DashboardPeriodPills
              value={periodPreset}
              customYear={customYear}
              customMonth={customMonth}
              onChange={(preset, year, month) => {
                onPeriodChange(preset, year, month);
                if (preset !== "mes-custom") setOpen(false);
              }}
              isDark={isDark}
              compact
            />
          </div>

          {/* Hint de fechas */}
          <p className={cn(
            "text-[9px] font-bold tracking-wide mt-3 text-center tabular-nums",
            isDark ? "text-slate-600" : "text-slate-300",
          )}>
            {bounds.hint}
          </p>
        </PopoverContent>
      </Popover>

      <DashboardThemeToggle
        isDark={isDark}
        onToggle={onToggleTheme}
        className="h-8 w-8 shrink-0"
      />
      <DashboardFullscreenButton
        isImmersive={isFullscreen}
        isDark={isDark}
        onToggle={onToggleFullscreen}
        className="h-8 w-8 shrink-0"
      />
    </>
  );

  if (stacked) {
    return (
      <aside
        className={cn(
          "flex flex-col flex-nowrap items-center justify-start gap-2 shrink-0 w-8 ml-auto",
          className,
        )}
        aria-label="Controles del dashboard"
      >
        {controls}
      </aside>
    );
  }

  return (
    <div className={cn("flex flex-row items-center justify-end gap-1.5", className)}>
      {controls}
    </div>
  );
}
