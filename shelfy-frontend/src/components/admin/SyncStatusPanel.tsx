"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  RefreshCw, AlertTriangle, CheckCircle2, Clock, Database,
  Users, XCircle, ChevronDown, ChevronUp, ShoppingCart, Wallet,
} from "lucide-react";
import type { SyncStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return "Nunca";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "Hace un momento";
  if (m < 60) return `Hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Hace ${h}h`;
  const d = Math.floor(h / 24);
  return `Hace ${d}d`;
}

function isStale(iso: string | null, thresholdHours = 12): boolean {
  if (!iso) return true;
  return Date.now() - new Date(iso).getTime() > thresholdHours * 3_600_000;
}

// ── Animated pulse dot ────────────────────────────────────────────────────────

function PulseDot({ color }: { color: string }) {
  return (
    <span className="relative inline-flex size-2 shrink-0">
      <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-60", color)} />
      <span className={cn("relative inline-flex size-2 rounded-full", color)} />
    </span>
  );
}

// ── Mini progress bar ─────────────────────────────────────────────────────────

function MiniProgress({ value, total, color }: { value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
      <motion.div
        className={cn("h-full rounded-full", color)}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  );
}

// ── Stat chip ────────────────────────────────────────────────────────────────

function StatChip({
  label, value, colorClass,
}: { label: string; value: number; colorClass: string }) {
  return (
    <div className={cn("flex flex-col gap-0 px-2 py-1 rounded-lg border text-center", colorClass)}>
      <span className="text-[9px] font-bold uppercase tracking-wider opacity-70">{label}</span>
      <span className="text-sm font-black tabular-nums leading-none">{value.toLocaleString("es-AR")}</span>
    </div>
  );
}

// ── Padrón breakdown row ──────────────────────────────────────────────────────

function PadronBreakdown({ padron }: { padron: SyncStatus["padron"] }) {
  const activos = padron.activos ?? 0;
  const anulados = padron.anulados ?? 0;
  const ausentes = padron.ausentes ?? 0;
  const total = padron.count;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25, ease: "easeInOut" }}
      className="overflow-hidden"
    >
      <div className="pt-2 space-y-2">
        {/* Stat chips */}
        <div className="grid grid-cols-3 gap-1.5">
          <StatChip
            label="Activos"
            value={activos}
            colorClass="bg-emerald-50 border-emerald-100 text-emerald-700"
          />
          <StatChip
            label="Anulados"
            value={anulados}
            colorClass={anulados > 0
              ? "bg-rose-50 border-rose-100 text-rose-700"
              : "bg-slate-50 border-slate-100 text-slate-400"}
          />
          <StatChip
            label="Absent (leg.)"
            value={ausentes}
            colorClass={ausentes > 0
              ? "bg-amber-50 border-amber-100 text-amber-700"
              : "bg-slate-50 border-slate-100 text-slate-400"}
          />
        </div>
        <p className="text-[9px] text-[var(--shelfy-muted)] leading-snug">
          «Anulados» incluye marcados en Consolido como anulados y clientes fuera del padrón cargado
          (no se muestran en el mapa). «Absent (leg.)» son filas con motivo histórico{' '}
          <code className="text-[8px]">padron_absent</code>. PDV inactivos solo por última compra
          siguen en el mapa.
        </p>
        {/* Progress bar: activos / total */}
        {total > 0 && (
          <div className="space-y-0.5">
            <MiniProgress value={activos} total={total} color="bg-emerald-400" />
            <p className="text-[9px] text-[var(--shelfy-muted)] text-right">
              {total > 0 ? ((activos / total) * 100).toFixed(1) : "0"}% operativos
            </p>
          </div>
        )}
        {/* Zombie alert */}
        {padron.has_zombie && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5"
          >
            <AlertTriangle size={11} className="text-red-500 shrink-0" />
            <span className="text-[10px] font-bold text-red-600">
              Ingesta bloqueada (run zombie &gt;2h) — verificar Railway
            </span>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// ── Source row ────────────────────────────────────────────────────────────────

interface SourceRowProps {
  label: string;
  icon: React.ElementType;
  entry: SyncStatus["padron"] | SyncStatus["cuentas_corrientes"] | SyncStatus["ventas"];
  countLabel: string;
  staleHours?: number;
  expandable?: boolean;
}

function SourceRow({ label, icon: Icon, entry, countLabel, staleHours = 12, expandable = false }: SourceRowProps) {
  const [expanded, setExpanded] = useState(false);
  const stale = isStale(entry.last_updated, staleHours);
  const running = (entry as SyncStatus["padron"]).last_run_estado === "en_curso";

  const dotColor = running
    ? "bg-blue-400"
    : stale
    ? "bg-amber-400"
    : "bg-emerald-400";

  const textColor = running
    ? "text-blue-600"
    : stale
    ? "text-amber-600"
    : "text-emerald-600";

  const bgColor = running
    ? "bg-blue-50/60 border-blue-100/60"
    : stale
    ? "bg-amber-50/60 border-amber-100/60"
    : "bg-emerald-50/60 border-emerald-100/60";

  return (
    <div className={cn("rounded-xl border px-3 py-2 transition-all", bgColor)}>
      <div
        className={cn("flex items-center gap-2", expandable && "cursor-pointer select-none")}
        onClick={expandable ? () => setExpanded((v) => !v) : undefined}
      >
        {/* Icon */}
        <span className={cn(
          "inline-flex items-center justify-center size-6 rounded-lg shrink-0",
          running ? "bg-blue-100" : stale ? "bg-amber-100" : "bg-emerald-100"
        )}>
          {running
            ? <RefreshCw size={11} className="text-blue-600 animate-spin" />
            : <Icon size={11} className={textColor} />
          }
        </span>

        {/* Label + time */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--shelfy-text)]">
              {label}
            </span>
            {running && (
              <span className="text-[8px] font-black bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">
                PROCESANDO
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <PulseDot color={running ? "bg-blue-400" : dotColor} />
            <span className={cn("text-[9px] font-semibold", textColor)}>
              {relativeTime(entry.last_updated)}
            </span>
            {entry.count > 0 && (
              <>
                <span className="text-[var(--shelfy-muted)] text-[9px]">·</span>
                <span className="text-[9px] text-[var(--shelfy-muted)]">
                  {entry.count.toLocaleString("es-AR")} {countLabel}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Expand toggle */}
        {expandable && (
          <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown size={13} className="text-[var(--shelfy-muted)]" />
          </motion.div>
        )}
      </div>

      {/* Expandable padrón breakdown */}
      <AnimatePresence>
        {expandable && expanded && (
          <PadronBreakdown padron={entry as SyncStatus["padron"]} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface Props {
  syncStatus: SyncStatus;
  className?: string;
}

export function SyncStatusPanel({ syncStatus, className }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={cn("space-y-1.5", className)}
    >
      <SourceRow
        label="Padrón"
        icon={Database}
        entry={syncStatus.padron}
        countLabel="PDVs"
        staleHours={20}
        expandable
      />
      <SourceRow
        label="CC"
        icon={Wallet}
        entry={syncStatus.cuentas_corrientes}
        countLabel="deudores"
        staleHours={14}
      />
      <SourceRow
        label="Ventas"
        icon={ShoppingCart}
        entry={syncStatus.ventas}
        countLabel="registros"
        staleHours={48}
      />
    </motion.div>
  );
}
