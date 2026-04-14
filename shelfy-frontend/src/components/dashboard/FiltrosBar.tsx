"use client";

import React, { useState } from 'react';
import { Calendar, GitBranch, RefreshCw, X, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { type SucursalStats } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const MESES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

interface FiltrosBarProps {
  year: number;
  month: number;
  day: number;
  sucursalFiltro: string;
  sucursales: SucursalStats[];
  onDateChange: (y: number, m: number, d: number) => void;
  onSucursal: (s: string) => void;
  onRefresh: () => void;
  /** Mejora #17: estado de fetch activo */
  isRefreshing?: boolean;
  /** Mejora #18: última actualización exitosa */
  lastUpdated?: Date | null;
}

// Mejora #5: presets de fecha simplificados
type Preset = "hoy" | "mes" | "mes_ant" | "custom";

function getPresetValues(preset: Preset): { y: number; m: number; d: number } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (preset === "hoy")     return { y, m, d: now.getDate() };
  if (preset === "mes")     return { y, m, d: 0 };
  if (preset === "mes_ant") {
    const prev = new Date(y, m - 2, 1);
    return { y: prev.getFullYear(), m: prev.getMonth() + 1, d: 0 };
  }
  return { y, m, d: 0 };
}

function detectPreset(year: number, month: number, day: number): Preset {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (year === y && month === m && day === now.getDate()) return "hoy";
  if (year === y && month === m && day === 0)            return "mes";
  const prev = new Date(y, m - 2, 1);
  if (year === prev.getFullYear() && month === prev.getMonth() + 1 && day === 0) return "mes_ant";
  return "custom";
}

function formatLastUpdated(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs <= 10) return "Actualizado";
  if (secs < 60)  return `hace ${secs}s`;
  if (secs < 3600) return `hace ${Math.floor(secs / 60)}m`;
  return `hace ${Math.floor(secs / 3600)}h`;
}

const selectTriggerClass =
  "bg-transparent text-[11px] font-black uppercase tracking-widest border-none shadow-none focus:ring-0 h-auto py-0 px-0 gap-1 text-slate-700 hover:text-slate-900";

export function FiltrosBar({
  year, month, day, sucursalFiltro, sucursales,
  onDateChange, onSucursal, onRefresh,
  isRefreshing = false,
  lastUpdated = null,
}: FiltrosBarProps) {
  const currentYear  = new Date().getFullYear();
  const years        = [currentYear - 1, currentYear, currentYear + 1];
  const daysInMonth  = year !== 0 ? new Date(year, month, 0).getDate() : 31;
  const daysArray    = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const activePreset      = detectPreset(year, month, day);
  const activeSucursalLabel = sucursalFiltro
    ? (sucursales.find(s => s.location_id === sucursalFiltro)?.sucursal ?? sucursalFiltro)
    : null;

  // Mejora #22: collapse de filtros custom en mobile
  const [showCustom, setShowCustom] = useState(activePreset === "custom");

  function handlePreset(preset: Preset) {
    const vals = getPresetValues(preset);
    onDateChange(vals.y, vals.m, vals.d);
    setShowCustom(false);
  }

  const PRESETS: { key: Preset; label: string }[] = [
    { key: "hoy",     label: "Hoy" },
    { key: "mes",     label: "Este Mes" },
    { key: "mes_ant", label: "Mes Ant." },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3 bg-white/80 backdrop-blur-xl p-3 px-4 rounded-[1.5rem] border border-slate-200/50 shadow-sm mt-2 mb-6 w-full relative z-30 transition-all hover:shadow-md">

      {/* Mejora #23: Indicador "En vivo" con ring animation */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="relative flex size-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
        </span>
        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 hidden sm:block">
          En vivo
        </span>
      </div>

      <div className="h-4 w-px bg-slate-200 shrink-0 hidden sm:block" />

      {/* Mejora #5: Preset pills de fecha */}
      <div className="flex items-center gap-1.5 shrink-0">
        {PRESETS.map(p => (
          <button
            key={p.key}
            onClick={() => handlePreset(p.key)}
            className={cn(
              "px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-200",
              activePreset === p.key
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-slate-50 border border-slate-100 text-slate-500 hover:bg-white hover:text-slate-900 hover:border-slate-200"
            )}
          >
            {p.label}
          </button>
        ))}

        {/* Mejora #22: botón para mostrar/ocultar filtros custom */}
        <button
          onClick={() => setShowCustom(v => !v)}
          className={cn(
            "flex items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 border",
            showCustom
              ? "bg-violet-50 border-violet-200 text-violet-700"
              : "bg-slate-50 border-slate-100 text-slate-400 hover:bg-white hover:text-slate-600"
          )}
        >
          <SlidersHorizontal size={12} />
          <span className="hidden sm:inline">Custom</span>
          <ChevronDown size={11} className={cn("transition-transform duration-200", showCustom && "rotate-180")} />
        </button>
      </div>

      {/* Mejora #22: controles custom colapsables — hidden en mobile por defecto */}
      {showCustom && (
        <>
          <div className="h-4 w-px bg-slate-100 shrink-0" />

          {/* Año */}
          <div className="flex items-center gap-1.5 bg-slate-50/60 px-3 py-2 rounded-2xl border border-slate-100 hover:bg-white hover:border-slate-200 transition-all group">
            <Calendar size={13} className="text-slate-400 group-hover:text-blue-500 transition-colors shrink-0" />
            <Select
              value={String(year)}
              onValueChange={(val) => {
                const y = Number(val);
                onDateChange(y, y === 0 ? 0 : month, y === 0 ? 0 : day);
              }}
            >
              <SelectTrigger className={selectTriggerClass}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0" className="text-[11px] font-black uppercase tracking-widest">Toda la historia</SelectItem>
                {years.map(y => (
                  <SelectItem key={y} value={String(y)} className="text-[11px] font-black uppercase tracking-widest">{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {year !== 0 && (
            <div className="flex items-center gap-1.5 bg-slate-50/60 px-3 py-2 rounded-2xl border border-slate-100 hover:bg-white hover:border-slate-200 transition-all">
              <Select value={String(month)} onValueChange={val => onDateChange(year, Number(val), 0)}>
                <SelectTrigger className={selectTriggerClass}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MESES.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)} className="text-[11px] font-black uppercase tracking-widest">{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {year !== 0 && (
            <div className="flex items-center gap-1.5 bg-slate-50/60 px-3 py-2 rounded-2xl border border-slate-100 hover:bg-white hover:border-slate-200 transition-all">
              <Select value={String(day)} onValueChange={val => onDateChange(year, month, Number(val))}>
                <SelectTrigger className={selectTriggerClass}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0" className="text-[11px] font-black uppercase tracking-widest">Mes Completo</SelectItem>
                  {daysArray.map(d => (
                    <SelectItem key={d} value={String(d)} className="text-[11px] font-black uppercase tracking-widest">Día {d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </>
      )}

      {/* Sucursal */}
      {sucursales.length > 1 && (
        <>
          <div className="h-4 w-px bg-slate-100 shrink-0" />
          <div className="flex items-center gap-1.5 bg-slate-50/60 px-3 py-2 rounded-2xl border border-slate-100 hover:bg-white hover:border-slate-200 transition-all group">
            <GitBranch size={13} className="text-slate-400 group-hover:text-emerald-500 transition-colors shrink-0" />
            <Select
              value={sucursalFiltro || "__all__"}
              onValueChange={val => onSucursal(val === "__all__" ? "" : val)}
            >
              <SelectTrigger className={selectTriggerClass}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__" className="text-[11px] font-black uppercase tracking-widest">Todas las sucursales</SelectItem>
                {sucursales.map(s => (
                  <SelectItem key={s.location_id} value={s.location_id} className="text-[11px] font-black uppercase tracking-widest">{s.sucursal}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {/* Badge de filtro activo dismissable */}
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

      {/* Spacer */}
      <div className="flex-1" />

      {/* Mejora #18: último actualizado */}
      {lastUpdated && (
        <span className="text-[10px] font-bold text-slate-400 shrink-0 hidden md:block">
          {formatLastUpdated(lastUpdated)}
        </span>
      )}

      {/* Mejora #17: Botón Refrescar con estado de loading */}
      <button
        onClick={onRefresh}
        disabled={isRefreshing}
        className={cn(
          "flex items-center gap-2 px-5 py-2.5 font-black text-[10px] uppercase tracking-[0.18em] rounded-2xl transition-all shadow-sm active:scale-95 shrink-0",
          isRefreshing
            ? "bg-slate-200 text-slate-400 cursor-not-allowed"
            : "bg-slate-900 hover:bg-black text-white"
        )}
      >
        <RefreshCw
          size={13}
          className={cn("transition-transform duration-500", isRefreshing && "animate-spin")}
        />
        <span className="hidden sm:inline">{isRefreshing ? "Cargando..." : "Refrescar"}</span>
      </button>
    </div>
  );
}
