"use client";

import { CreditCard, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export type SupervisionMode = "cc" | "avance";

interface SupervisionModeToggleProps {
  mode: SupervisionMode;
  onChange: (mode: SupervisionMode) => void;
  /** Precarga avance de ventas al pasar el mouse (TanStack prefetch). */
  onAvanceIntent?: () => void;
  className?: string;
}

/** Segment control CC | Avance de ventas en el header sticky de /supervision. */
export function SupervisionModeToggle({
  mode,
  onChange,
  onAvanceIntent,
  className,
}: SupervisionModeToggleProps) {
  return (
    <div
      role="tablist"
      aria-label="Modo de supervisión"
      className={cn(
        "inline-flex items-center rounded-lg border border-[var(--shelfy-border)] bg-muted/60 p-0.5 gap-0.5",
        className,
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === "cc"}
        onClick={() => onChange("cc")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold tracking-tight transition-colors",
          mode === "cc"
            ? "bg-card text-[var(--shelfy-text)] shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <CreditCard size={13} className={mode === "cc" ? "text-rose-500" : undefined} />
        Cuentas Corrientes
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "avance"}
        onMouseEnter={onAvanceIntent}
        onFocus={onAvanceIntent}
        onClick={() => onChange("avance")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold tracking-tight transition-colors",
          mode === "avance"
            ? "bg-card text-[var(--shelfy-text)] shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <TrendingUp size={13} className={mode === "avance" ? "text-emerald-500" : undefined} />
        Avance de ventas
      </button>
    </div>
  );
}
