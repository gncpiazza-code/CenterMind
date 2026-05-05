"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Users, X } from "lucide-react";
import type { ReporteriaSource } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface VendorSummary {
  name: string;
  isActive: boolean;
  metric: number;
  metricUnit: string;
  sucursal?: string;
  diasConDatos?: number;
}

interface Props {
  vendors: VendorSummary[];
  selected: string | null;
  onSelect: (name: string | null) => void;
  source: ReporteriaSource;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  "bg-violet-100 text-violet-700",
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
  "bg-orange-100 text-orange-700",
  "bg-indigo-100 text-indigo-700",
];

function avatarColor(name: string, inactive: boolean): string {
  if (inactive) return "bg-slate-100 text-slate-400";
  const code = name.charCodeAt(0) + (name.charCodeAt(1) || 0);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

function MetricBadge({ value, unit, source }: { value: number; unit: string; source: ReporteriaSource }) {
  const color =
    source === "sigo"
      ? value >= 70
        ? "bg-emerald-100 text-emerald-700"
        : value >= 50
        ? "bg-amber-100 text-amber-700"
        : "bg-rose-100 text-rose-700"
      : "bg-[var(--shelfy-primary)]/10 text-[var(--shelfy-primary)]";

  const label =
    unit === "%" ? `${value.toFixed(1)}%` :
    value >= 1_000_000 ? `$${(value / 1_000_000).toFixed(1)}M` :
    value >= 1_000 ? `$${Math.round(value / 1_000)}k` :
    String(Math.round(value));

  return (
    <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-full shrink-0", color)}>
      {label}
    </span>
  );
}

export function ReporteriaVendorSelector({ vendors, selected, onSelect, source }: Props) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return vendors;
    return vendors.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        (v.sucursal ?? "").toLowerCase().includes(q)
    );
  }, [vendors, search]);

  const activeCount = vendors.filter((v) => v.isActive).length;

  return (
    <div className="bg-white border border-[var(--shelfy-border)] rounded-2xl overflow-hidden shadow-sm flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-[var(--shelfy-border)]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center size-7 rounded-lg bg-[var(--shelfy-primary)]/10">
              <Users size={13} className="text-[var(--shelfy-primary)]" />
            </span>
            <span className="text-xs font-black text-[var(--shelfy-text)] uppercase tracking-wider">
              Vendedores
            </span>
          </div>
          <span className="text-[10px] font-bold text-[var(--shelfy-muted)]">
            {activeCount} activos · {vendors.length} total
          </span>
        </div>
        {/* Search */}
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--shelfy-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar vendedor…"
            className="w-full text-xs pl-8 pr-7 py-2 bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-xl focus:outline-none focus:border-[var(--shelfy-primary)] transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] transition-colors"
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* "Todos" option */}
      <button
        onClick={() => onSelect(null)}
        className={cn(
          "flex items-center gap-2.5 w-full px-4 py-2.5 border-b border-[var(--shelfy-border)] transition-all text-left",
          selected === null
            ? "bg-[var(--shelfy-primary)]/8 border-l-2 border-l-[var(--shelfy-primary)]"
            : "hover:bg-[var(--shelfy-primary)]/4 border-l-2 border-l-transparent"
        )}
      >
        <span className={cn(
          "inline-flex items-center justify-center size-7 rounded-full text-[10px] font-black shrink-0",
          selected === null ? "bg-[var(--shelfy-primary)] text-white" : "bg-slate-100 text-slate-500"
        )}>
          ∑
        </span>
        <div className="flex-1 min-w-0">
          <p className={cn("text-xs font-bold truncate", selected === null ? "text-[var(--shelfy-primary)]" : "text-[var(--shelfy-text)]")}>
            Todos los vendedores
          </p>
          <p className="text-[10px] text-[var(--shelfy-muted)]">{vendors.length} vendedores</p>
        </div>
      </button>

      {/* Vendor list */}
      <div className="overflow-y-auto max-h-[380px]">
        <AnimatePresence mode="sync">
          {filtered.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-10 gap-2 text-[var(--shelfy-muted)]"
            >
              <Search size={20} className="opacity-30" />
              <p className="text-xs font-semibold">Sin resultados</p>
            </motion.div>
          ) : (
            filtered.map((v, i) => {
              const isSelected = selected === v.name;
              return (
                <motion.button
                  key={v.name}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.025, 0.3), type: "spring", stiffness: 320, damping: 30 }}
                  onClick={() => onSelect(isSelected ? null : v.name)}
                  className={cn(
                    "flex items-center gap-2.5 w-full px-4 py-2.5 border-b border-[var(--shelfy-border)]/60 transition-all text-left border-l-2",
                    isSelected
                      ? "bg-[var(--shelfy-primary)]/8 border-l-[var(--shelfy-primary)]"
                      : "border-l-transparent hover:bg-[var(--shelfy-primary)]/4",
                    !v.isActive && "opacity-60"
                  )}
                >
                  {/* Avatar */}
                  <span className={cn(
                    "inline-flex items-center justify-center size-7 rounded-full text-[10px] font-black shrink-0 transition-colors",
                    isSelected ? "bg-[var(--shelfy-primary)] text-white" : avatarColor(v.name, !v.isActive)
                  )}>
                    {initials(v.name)}
                  </span>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-xs font-semibold truncate leading-tight",
                      isSelected ? "text-[var(--shelfy-primary)]" : "text-[var(--shelfy-text)]"
                    )}>
                      {v.name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {v.sucursal && (
                        <span className="text-[9px] text-[var(--shelfy-muted)] truncate max-w-[90px]">{v.sucursal}</span>
                      )}
                      {!v.isActive && (
                        <span className="text-[8px] font-black bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-full shrink-0">
                          SIN ACTIVIDAD
                        </span>
                      )}
                      {v.diasConDatos !== undefined && v.isActive && (
                        <span className="text-[8px] text-[var(--shelfy-muted)] shrink-0">
                          {v.diasConDatos}d
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Metric */}
                  <MetricBadge value={v.metric} unit={v.metricUnit} source={source} />
                </motion.button>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
