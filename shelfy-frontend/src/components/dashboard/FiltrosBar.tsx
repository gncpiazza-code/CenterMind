import React from 'react';
import { Calendar, GitBranch, RefreshCw, ChevronDown } from 'lucide-react';
import { type SucursalStats } from '@/lib/api';

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

  return (
    <div className="flex flex-wrap items-center gap-4 bg-white/70 backdrop-blur-xl p-3 px-5 rounded-[1.5rem] border border-slate-200/50 shadow-sm mt-2 mb-8 w-full relative z-30 transition-all hover:shadow-md">
      
      <div className="flex-1 flex flex-wrap items-center gap-4">
        {/* Selector de Fecha */}
        <div className="flex items-center gap-1.5 bg-slate-50/50 px-3 py-2 rounded-2xl border border-slate-100 hover:bg-white hover:border-slate-200 transition-all group">
          <Calendar size={15} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
          
          <div className="flex items-center">
            <select 
              value={year} 
              onChange={(e) => {
                const y = Number(e.target.value);
                onDateChange(y, y === 0 ? 0 : month, y === 0 ? 0 : day);
              }} 
              className="bg-transparent text-[11px] font-black uppercase tracking-widest text-slate-700 outline-none cursor-pointer appearance-none pr-1"
            >
              <option value="0">Toda la historia</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <ChevronDown size={10} className="text-slate-300" />
          </div>

          {year !== 0 && (
            <>
              <span className="text-slate-300 mx-1">/</span>
              <div className="flex items-center">
                <select 
                  value={month} 
                  onChange={(e) => onDateChange(year, Number(e.target.value), 0)} 
                  className="bg-transparent text-[11px] font-black uppercase tracking-widest text-slate-700 outline-none cursor-pointer appearance-none pr-1"
                >
                  {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                </select>
                <ChevronDown size={10} className="text-slate-300" />
              </div>
              
              <span className="text-slate-300 mx-1">/</span>
              <div className="flex items-center">
                <select 
                  value={day} 
                  onChange={(e) => onDateChange(year, month, Number(e.target.value))} 
                  className="bg-transparent text-[11px] font-black uppercase tracking-widest text-slate-700 outline-none cursor-pointer appearance-none pr-1"
                >
                  <option value="0">Mes Completo</option>
                  {daysArray.map((d) => <option key={d} value={d}>Día {d}</option>)}
                </select>
                <ChevronDown size={10} className="text-slate-300" />
              </div>
            </>
          )}
        </div>

        {/* Selector de Sucursal */}
        {sucursales.length > 1 && (
          <div className="flex items-center gap-1.5 bg-slate-50/50 px-3 py-2 rounded-2xl border border-slate-100 hover:bg-white hover:border-slate-200 transition-all group">
            <GitBranch size={15} className="text-slate-400 group-hover:text-emerald-500 transition-colors" />
            <div className="flex items-center">
              <select 
                value={sucursalFiltro} 
                onChange={(e) => onSucursal(e.target.value)} 
                className="bg-transparent text-[11px] font-black uppercase tracking-widest text-slate-700 outline-none cursor-pointer appearance-none pr-1 min-w-[120px]"
              >
                <option value="">Todas las sucursales</option>
                {sucursales.map((s) => <option key={s.location_id} value={s.location_id}>{s.sucursal}</option>)}
              </select>
              <ChevronDown size={10} className="text-slate-300" />
            </div>
          </div>
        )}
      </div>

      {/* Boton Refrescar */}
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
