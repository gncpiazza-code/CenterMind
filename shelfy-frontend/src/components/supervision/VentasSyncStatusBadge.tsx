"use client";

import { useEffect, useState } from "react";
import type { SyncStatusEntry } from "@/lib/api";
import {
  formatCcLastUpdate,
  formatCcNextUpdateCountdown,
} from "@/lib/supervision-cc-sync";
import { cn } from "@/lib/utils";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface VentasSyncStatusBadgeProps {
  entry?: SyncStatusEntry;
  /** next_run_hint del payload avance-ventas (ingestas Consolido 09:45/13/17/21 AR). */
  nextRunHint?: string | null;
  className?: string;
}

const ESTADO_LABEL: Record<string, string> = {
  error: "falló",
  en_curso: "en curso",
  sin_cambios: "sin cambios",
  ok: "ok",
};

function fmtTs(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Badge de frescura del Informe de Ventas (R3): siempre muestra la última sync
 * OK; si el último intento no fue OK (error / colgado), lo expone en ámbar/rojo
 * en lugar de mentir frescura.
 */
export function VentasSyncStatusBadge({ entry, nextRunHint, className }: VentasSyncStatusBadgeProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const lastOkLabel = formatCcLastUpdate(entry);
  const nextLabel = formatCcNextUpdateCountdown(nextRunHint ?? entry?.next_run_at, now);

  // Último intento distinto de la última OK y no exitoso → mostrar honesto.
  const estado = entry?.last_run_estado ?? null;
  const attemptLabel = fmtTs(entry?.last_attempt_at);
  const intentoFallido =
    !!attemptLabel &&
    !!estado &&
    estado !== "ok" &&
    estado !== "sin_cambios" &&
    (entry?.last_attempt_at ?? "") > (entry?.last_run_ok_at ?? entry?.last_updated ?? "");
  const esError = estado === "error" || !!entry?.has_zombie;

  if (!lastOkLabel && !nextLabel && !attemptLabel) return null;

  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 rounded-lg border border-slate-200/80 bg-slate-50/90 px-2.5 py-1.5",
        "dark:border-slate-700/60 dark:bg-slate-900/50 text-[10px] leading-snug min-w-0",
        intentoFallido &&
          (esError
            ? "border-rose-300/80 bg-rose-50/80 dark:border-rose-900/60 dark:bg-rose-950/30"
            : "border-amber-300/80 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/30"),
        className,
      )}
    >
      {lastOkLabel ? (
        <p className="text-slate-600 dark:text-slate-300">
          <span className="font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Última sync OK:{" "}
          </span>
          <span className="font-semibold tabular-nums">{lastOkLabel}</span>
        </p>
      ) : null}
      {intentoFallido ? (
        <p
          className={cn(
            "inline-flex items-center gap-1 font-semibold",
            esError
              ? "text-rose-700 dark:text-rose-300"
              : "text-amber-700 dark:text-amber-300",
          )}
        >
          <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden />
          <span>
            Último intento: <span className="tabular-nums">{attemptLabel}</span> —{" "}
            {entry?.has_zombie ? "colgado (>2 h)" : (ESTADO_LABEL[estado ?? ""] ?? estado)}
          </span>
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
