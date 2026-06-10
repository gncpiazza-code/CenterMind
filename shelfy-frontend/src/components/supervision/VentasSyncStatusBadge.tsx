"use client";

import { useEffect, useState } from "react";
import type { SyncStatusEntry } from "@/lib/api";
import {
  formatCcLastUpdate,
  formatCcNextUpdateCountdown,
} from "@/lib/supervision-cc-sync";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";

interface VentasSyncStatusBadgeProps {
  entry?: SyncStatusEntry;
  /** next_run_hint del payload avance-ventas (ingestas Consolido 09:30/13/17/21 AR). */
  nextRunHint?: string | null;
  className?: string;
}

/** Badge de frescura del Informe de Ventas — mismo patrón que CcSyncStatusBadge. */
export function VentasSyncStatusBadge({ entry, nextRunHint, className }: VentasSyncStatusBadgeProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const lastLabel = formatCcLastUpdate(entry);
  const nextLabel = formatCcNextUpdateCountdown(nextRunHint ?? entry?.next_run_at, now);

  if (!lastLabel && !nextLabel) return null;

  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 rounded-lg border border-slate-200/80 bg-slate-50/90 px-2.5 py-1.5",
        "dark:border-slate-700/60 dark:bg-slate-900/50 text-[10px] leading-snug min-w-0",
        className,
      )}
    >
      {lastLabel ? (
        <p className="text-slate-600 dark:text-slate-300">
          <span className="font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Última sync ventas:{" "}
          </span>
          <span className="font-semibold tabular-nums">{lastLabel}</span>
        </p>
      ) : null}
      {nextLabel ? (
        <p className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 font-semibold">
          <RefreshCw className="w-3 h-3 shrink-0 opacity-70" aria-hidden />
          <span>
            Próximo batch en <span className="tabular-nums">{nextLabel}</span>
          </span>
        </p>
      ) : null}
    </div>
  );
}
