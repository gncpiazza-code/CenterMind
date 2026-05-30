"use client";

import {
  DEFAULT_DASHBOARD_LAYOUT,
  saveDashboardLayout,
  type DashboardLayoutConfig,
} from "@/lib/dashboard-layout";
import { cn } from "@/lib/utils";
import { RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface DashboardLayoutTunerProps {
  layout: DashboardLayoutConfig;
  onChange: (next: DashboardLayoutConfig) => void;
}

/** Solo desarrollo: sliders para altura KPIs y proporción hero/ranking */
export function DashboardLayoutTuner({ layout, onChange }: DashboardLayoutTunerProps) {
  const [open, setOpen] = useState(false);
  const isDev = process.env.NODE_ENV === "development";

  useEffect(() => {
    if (!isDev) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === "l") setOpen((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDev]);

  const patch = useCallback(
    (partial: Partial<DashboardLayoutConfig>) => {
      const next = { ...layout, ...partial };
      onChange(next);
      saveDashboardLayout(next);
    },
    [layout, onChange],
  );

  const reset = useCallback(() => {
    onChange(DEFAULT_DASHBOARD_LAYOUT);
    saveDashboardLayout(DEFAULT_DASHBOARD_LAYOUT);
  }, [onChange]);

  if (!isDev) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 z-[200] flex flex-col items-start gap-2 pointer-events-auto">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-bold uppercase tracking-wide shadow-lg",
          "bg-violet-600 text-white border-violet-500 hover:bg-violet-500",
          open && "ring-2 ring-violet-300",
        )}
        title="Alt+L — Ajustar layout del dashboard"
      >
        <SlidersHorizontal className="w-4 h-4" />
        Layout
      </button>

      {open ? (
        <div
          className={cn(
            "w-[min(20rem,calc(100vw-2rem))] rounded-2xl border p-4 shadow-2xl",
            "bg-white/95 border-slate-200 backdrop-blur-md",
            "dark:bg-slate-900/95 dark:border-slate-600",
          )}
        >
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Ajuste de alturas
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <label className="block mb-4">
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
              Altura KPIs — {layout.kpiHeightPx}px
            </span>
            <input
              type="range"
              min={72}
              max={180}
              step={4}
              value={layout.kpiHeightPx}
              onChange={(e) => patch({ kpiHeightPx: Number(e.target.value) })}
              className="mt-2 w-full accent-violet-600"
            />
            <p className="mt-1 text-[10px] text-slate-500">Menos alto = más espacio para ranking y carrusel</p>
          </label>

          <label className="block mb-4">
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
              Ancho carrusel — {layout.heroWidthPercent}%
            </span>
            <input
              type="range"
              min={22}
              max={50}
              step={1}
              value={layout.heroWidthPercent}
              onChange={(e) => patch({ heroWidthPercent: Number(e.target.value) })}
              className="mt-2 w-full accent-violet-600"
            />
            <p className="mt-1 text-[10px] text-slate-500">Ranking ocupa el resto ({100 - layout.heroWidthPercent}%)</p>
          </label>

          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-violet-700 hover:text-violet-900 dark:text-violet-300"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restaurar defaults
          </button>
          <p className="mt-3 text-[10px] text-slate-400">Atajo: Alt+L · Se guarda en localStorage</p>
        </div>
      ) : null}
    </div>
  );
}
