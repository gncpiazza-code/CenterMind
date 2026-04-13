"use client";

import React from 'react';
import { Calendar, GitBranch, RefreshCw, X } from 'lucide-react';
import { type SucursalStats } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
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
}

export function FiltrosBar({
  year, month, day, sucursalFiltro, sucursales,
  onDateChange, onSucursal, onRefresh,
}: FiltrosBarProps) {
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];

  const daysInMonth = year !== 0 ? new Date(year, month, 0).getDate() : 31;
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Nombre legible de la sucursal activa para el badge (Mejora #8)
  const activeSucursalLabel = sucursalFiltro
    ? (sucursales.find((s) => s.location_id === sucursalFiltro)?.sucursal ?? sucursalFiltro)
    : null;

  const selectTriggerClass =
    "bg-transparent text-[11px] font-black uppercase tracking-widest border-none shadow-none focus:ring-0 h-auto py-0 px-0 gap-1 text-slate-700 hover:text-slate-900";

  return (
    <div className="flex flex-wrap items-center gap-4 bg-white/70 backdrop-blur-xl p-3 px-5 rounded-[1.5rem] border border-slate-200/50 shadow-sm mt-2 mb-8 w-full relative z-30 transition-all hover:shadow-md">

      <div className="flex-1 flex flex-wrap items-center gap-4">

        {/* Mejora #7: Live indicator */}
        <div className="flex items-center gap-1.5">
          <span className="animate-pulse text-emerald-500 text-xs leading-none">●</span>
          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
            En vivo
          </span>
        </div>

        {/* Separador visual */}
        <div className="h-4 w-px bg-slate-200" />

        {/* Mejora #5: shadcn Select — Año */}
        <div className="flex items-center gap-1.5 bg-slate-50/50 px-3 py-2 rounded-2xl border border-slate-100 hover:bg-white hover:border-slate-200 transition-all group">
          <Calendar size={15} className="text-slate-400 group-hover:text-blue-500 transition-colors shrink-0" />
          <Select
            value={String(year)}
            onValueChange={(val) => {
              const y = Number(val);
              onDateChange(y, y === 0 ? 0 : month, y === 0 ? 0 : day);
            }}
          >
            <SelectTrigger className={selectTriggerClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0" className="text-[11px] font-black uppercase tracking-widest">
                Toda la historia
              </SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)} className="text-[11px] font-black uppercase tracking-widest">
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Mes */}
        {year !== 0 && (
          <div className="flex items-center gap-1.5 bg-slate-50/50 px-3 py-2 rounded-2xl border border-slate-100 hover:bg-white hover:border-slate-200 transition-all group">
            <Select
              value={String(month)}
              onValueChange={(val) => onDateChange(year, Number(val), 0)}
            >
              <SelectTrigger className={selectTriggerClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESES.map((m, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)} className="text-[11px] font-black uppercase tracking-widest">
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Día */}
        {year !== 0 && (
          <div className="flex items-center gap-1.5 bg-slate-50/50 px-3 py-2 rounded-2xl border border-slate-100 hover:bg-white hover:border-slate-200 transition-all group">
            <Select
              value={String(day)}
              onValueChange={(val) => onDateChange(year, month, Number(val))}
            >
              <SelectTrigger className={selectTriggerClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0" className="text-[11px] font-black uppercase tracking-widest">
                  Mes Completo
                </SelectItem>
                {daysArray.map((d) => (
                  <SelectItem key={d} value={String(d)} className="text-[11px] font-black uppercase tracking-widest">
                    Día {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Mejora #5: shadcn Select — Sucursal */}
        {sucursales.length > 1 && (
          <div className="flex items-center gap-1.5 bg-slate-50/50 px-3 py-2 rounded-2xl border border-slate-100 hover:bg-white hover:border-slate-200 transition-all group">
            <GitBranch size={15} className="text-slate-400 group-hover:text-emerald-500 transition-colors shrink-0" />
            <Select
              value={sucursalFiltro || "__all__"}
              onValueChange={(val) => onSucursal(val === "__all__" ? "" : val)}
            >
              <SelectTrigger className={selectTriggerClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__" className="text-[11px] font-black uppercase tracking-widest">
                  Todas las sucursales
                </SelectItem>
                {sucursales.map((s) => (
                  <SelectItem key={s.location_id} value={s.location_id} className="text-[11px] font-black uppercase tracking-widest">
                    {s.sucursal}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Mejora #8: Badge de filtro activo dismissable */}
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
      </div>

      {/* Mejora #6: Botón Refrescar conectado */}
      <button
        onClick={onRefresh}
        className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-black text-white font-black text-[10px] uppercase tracking-[0.2em] rounded-2xl transition-all shadow-lg active:scale-95 group"
      >
        <RefreshCw size={14} className="group-active:rotate-180 transition-transform duration-500" />
        Refrescar
      </button>
    </div>
  );
}
