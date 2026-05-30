"use client";

import { Check, CircleHelp, Flame, RefreshCw, RotateCcw, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const BTN_BASE =
  "inline-flex items-center justify-center rounded-full shrink-0 transition-transform hover:scale-[1.04] active:scale-95 disabled:opacity-25 disabled:pointer-events-none disabled:scale-100";

interface VisorEvalBarProps {
  onRevertir: () => void;
  onRechazado: () => void;
  onDestacado: () => void;
  onAprobado: () => void;
  onRefresh: () => void;
  canRevertir: boolean;
  revertirPending?: boolean;
  evaluarPending?: boolean;
  evaluarDisabled?: boolean;
  kbdLegend: ReactNode;
  /** Botones más grandes para panel desktop (70% ancho) */
  prominent?: boolean;
}

export function VisorEvalBar({
  onRevertir,
  onRechazado,
  onDestacado,
  onAprobado,
  onRefresh,
  canRevertir,
  revertirPending,
  evaluarPending,
  evaluarDisabled,
  kbdLegend,
  prominent = false,
}: VisorEvalBarProps) {
  const busy = evaluarPending || evaluarDisabled;

  const utilBtn = prominent ? "size-12" : "size-10";
  const actionBtn = prominent ? "size-[3.75rem]" : "size-12";
  const iconSm = prominent ? 20 : 16;
  const iconMd = prominent ? 28 : 22;
  const iconLg = prominent ? 32 : 24;

  return (
    <div
      className={cn(
        "grid w-full grid-cols-6 items-center justify-items-center mx-auto",
        prominent ? "gap-x-2.5 gap-y-0 py-0 max-w-none" : "gap-x-2 gap-y-0 py-1 max-w-[21.5rem]",
      )}
      role="toolbar"
      aria-label="Evaluar exhibición"
    >
      <button
        type="button"
        onClick={onRevertir}
        disabled={!canRevertir || revertirPending}
        title="Revertir (Ctrl/Cmd + Z)"
        className={cn(
          BTN_BASE,
          utilBtn,
          "bg-white border border-slate-200/90 text-slate-600 shadow-sm hover:bg-slate-50 dark:bg-slate-900/60 dark:border-slate-600",
        )}
      >
        <RotateCcw size={iconSm} strokeWidth={2.5} />
      </button>

      <button
        type="button"
        onClick={onRechazado}
        disabled={busy}
        title="Rechazar (Ctrl/Cmd + R)"
        className={cn(
          BTN_BASE,
          actionBtn,
          "bg-[#ef4444] text-white shadow-[0_4px_14px_rgba(239,68,68,0.35)]",
        )}
      >
        <X size={iconMd} strokeWidth={3} />
      </button>

      <button
        type="button"
        onClick={onDestacado}
        disabled={busy}
        title="Destacar (Ctrl/Cmd + D)"
        className={cn(
          BTN_BASE,
          actionBtn,
          "bg-[#f97316] text-white shadow-[0_4px_14px_rgba(249,115,22,0.4)]",
        )}
      >
        <Flame size={iconLg} strokeWidth={2.75} className="fill-white/25" />
      </button>

      <button
        type="button"
        onClick={onAprobado}
        disabled={busy}
        title="Aprobar (Ctrl/Cmd + A)"
        className={cn(
          BTN_BASE,
          actionBtn,
          "bg-[#10b981] text-white shadow-[0_4px_14px_rgba(16,185,129,0.35)]",
        )}
      >
        <Check size={iconMd} strokeWidth={3} />
      </button>

      <button
        type="button"
        onClick={onRefresh}
        title="Refrescar pendientes"
        className={cn(
          BTN_BASE,
          utilBtn,
          "bg-amber-100 border border-amber-300/90 text-amber-800 shadow-sm hover:bg-amber-200 dark:bg-amber-950/50 dark:border-amber-700 dark:text-amber-200",
        )}
      >
        <RefreshCw size={iconSm} strokeWidth={2.5} />
      </button>

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="Atajos de teclado"
            className={cn(
              BTN_BASE,
              utilBtn,
              "bg-white border border-slate-200/90 text-slate-600 shadow-sm hover:bg-slate-50 dark:bg-slate-900/60 dark:border-slate-600",
            )}
          >
            <CircleHelp size={iconSm} strokeWidth={2} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          className="w-[min(920px,86vw)] border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] p-3"
        >
          <p className="text-[10px] font-black text-[var(--shelfy-muted)] uppercase tracking-wider mb-2">
            Atajos de teclado
          </p>
          {kbdLegend}
        </PopoverContent>
      </Popover>
    </div>
  );
}
