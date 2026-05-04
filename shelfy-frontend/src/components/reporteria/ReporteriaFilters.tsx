"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Calendar, SlidersHorizontal, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { ReporteriaSource } from "@/lib/api";

interface Props {
  distId: number;
  onRun: (params: {
    source: ReporteriaSource;
    dateFrom: string;
    dateTo: string;
    sucursal: string;
    vendedor: string;
  }) => void;
  isRunning: boolean;
  sucursales?: string[];
  vendedores?: string[];
}

const SOURCES: { value: ReporteriaSource; label: string; desc: string; color: string }[] = [
  { value: "sigo",          label: "SIGO",          desc: "Gestión en calle",        color: "from-violet-500 to-purple-600" },
  { value: "comprobantes",  label: "Comprobantes",  desc: "Facturación CHESS",       color: "from-blue-500 to-indigo-600" },
  { value: "bultos",        label: "Bultos",         desc: "Distribución artículos",  color: "from-emerald-500 to-teal-600" },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function firstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function ReporteriaFilters({ onRun, isRunning, sucursales = [], vendedores = [] }: Props) {
  const [source, setSource] = useState<ReporteriaSource>("sigo");
  const [dateFrom, setDateFrom] = useState(firstOfMonthStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [sucursal, setSucursal] = useState("");
  const [vendedor, setVendedor] = useState("");

  const handleRun = () => {
    if (!dateFrom || !dateTo) return;
    onRun({ source, dateFrom, dateTo, sucursal, vendedor });
  };

  return (
    <div className="bg-white/90 backdrop-blur-sm border border-[var(--shelfy-border)] rounded-2xl p-5 shadow-sm">
      {/* Source selector */}
      <div className="mb-5">
        <p className="text-[11px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider mb-3 flex items-center gap-2">
          <SlidersHorizontal size={12} />
          Fuente de datos
        </p>
        <div className="grid grid-cols-3 gap-2">
          {SOURCES.map((s) => (
            <motion.button
              key={s.value}
              whileTap={{ scale: 0.97 }}
              onClick={() => setSource(s.value)}
              className={cn(
                "relative rounded-xl p-3 text-left border-2 transition-all duration-200 overflow-hidden",
                source === s.value
                  ? "border-[var(--shelfy-primary)] bg-[var(--shelfy-primary)]/5"
                  : "border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] hover:border-[var(--shelfy-primary)]/40"
              )}
            >
              {source === s.value && (
                <motion.div
                  layoutId="source-indicator"
                  className={cn("absolute inset-0 opacity-[0.07] bg-gradient-to-br", s.color)}
                  transition={{ type: "spring", stiffness: 400, damping: 35 }}
                />
              )}
              <p className={cn(
                "text-[13px] font-black tracking-tight relative z-10",
                source === s.value ? "text-[var(--shelfy-primary)]" : "text-[var(--shelfy-text)]"
              )}>
                {s.label}
              </p>
              <p className="text-[10px] text-[var(--shelfy-muted)] mt-0.5 relative z-10">{s.desc}</p>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Date range + filters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div>
          <label className="block text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <Calendar size={10} /> Desde
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            max={dateTo}
            className="w-full text-sm font-medium text-[var(--shelfy-text)] bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--shelfy-primary)] transition-colors"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <Calendar size={10} /> Hasta
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            min={dateFrom}
            className="w-full text-sm font-medium text-[var(--shelfy-text)] bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--shelfy-primary)] transition-colors"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider mb-1.5">Sucursal</label>
          <select
            value={sucursal}
            onChange={(e) => setSucursal(e.target.value)}
            className="w-full text-sm font-medium text-[var(--shelfy-text)] bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--shelfy-primary)] transition-colors"
          >
            <option value="">Todas</option>
            {sucursales.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider mb-1.5">Vendedor</label>
          <select
            value={vendedor}
            onChange={(e) => setVendedor(e.target.value)}
            className="w-full text-sm font-medium text-[var(--shelfy-text)] bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--shelfy-primary)] transition-colors"
          >
            <option value="">Todos</option>
            {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>

      <Button
        onClick={handleRun}
        disabled={isRunning || !dateFrom || !dateTo}
        className="w-full bg-[var(--shelfy-primary)] hover:bg-[var(--shelfy-accent)] text-white font-bold rounded-xl h-11 text-sm tracking-wide transition-all duration-200 shadow-sm hover:shadow-md"
      >
        {isRunning ? (
          <><Loader2 size={15} className="animate-spin mr-2" /> Ejecutando análisis...</>
        ) : (
          <><RefreshCw size={15} className="mr-2" /> Ejecutar Análisis</>
        )}
      </Button>
    </div>
  );
}
