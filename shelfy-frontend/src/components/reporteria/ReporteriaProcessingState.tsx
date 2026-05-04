"use client";

import { motion } from "framer-motion";
import { FileSpreadsheet, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { ReporteriaJob, ReporteriaSource } from "@/lib/api";

const SOURCE_LABELS: Record<ReporteriaSource, string> = {
  sigo: "SIGO",
  comprobantes: "Comprobantes",
  bultos: "Bultos",
};

interface Props {
  job: ReporteriaJob | null;
  source: ReporteriaSource;
  filename: string;
  onRetry?: () => void;
}

export function ReporteriaProcessingState({ job, source, filename, onRetry }: Props) {
  const isFailed = job?.status === "failed";
  const isMock = !job;

  return (
    <div className="flex flex-col items-center justify-center gap-0 max-w-md mx-auto text-center py-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="w-full"
      >
        <div className={cn(
          "w-full rounded-2xl border p-8 shadow-sm",
          isFailed
            ? "bg-rose-50 border-rose-200"
            : "bg-white border-[var(--shelfy-border)]"
        )}>
          {/* Icon area */}
          <div className="flex justify-center mb-5">
            {isFailed ? (
              <div className="size-16 rounded-2xl bg-rose-100 flex items-center justify-center">
                <AlertCircle size={28} className="text-rose-500" />
              </div>
            ) : (
              <div className="relative size-16">
                <div className="size-16 rounded-2xl bg-[var(--shelfy-primary)]/10 flex items-center justify-center">
                  <FileSpreadsheet size={26} className="text-[var(--shelfy-primary)]" />
                </div>
                <div className="absolute -bottom-1 -right-1 size-6 rounded-full bg-[var(--shelfy-primary)] flex items-center justify-center">
                  <Dots />
                </div>
              </div>
            )}
          </div>

          {/* Title */}
          <h3 className={cn(
            "text-[18px] font-black tracking-tight mb-2",
            isFailed ? "text-rose-700" : "text-[var(--shelfy-text)]"
          )}>
            {isFailed
              ? "El análisis falló"
              : `Analizando tu reporte de ${SOURCE_LABELS[source]}`
            }
          </h3>

          {/* Subtitle / filename */}
          <p className="text-[12px] text-[var(--shelfy-muted)] font-medium mb-1 truncate max-w-xs mx-auto">
            {filename}
          </p>

          {isMock && !isFailed && (
            <p className="text-[11px] text-amber-600 font-semibold bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mt-3 inline-block">
              Generando análisis de demostración…
            </p>
          )}

          {/* Progress bar */}
          {!isFailed && (
            <div className="mt-6 h-1.5 bg-[var(--shelfy-bg)] rounded-full overflow-hidden border border-[var(--shelfy-border)]">
              <motion.div
                className="h-full rounded-full bg-[var(--shelfy-primary)]"
                initial={{ x: "-100%" }}
                animate={{ x: "100%" }}
                transition={{
                  duration: 1.6,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                style={{ width: "45%" }}
              />
            </div>
          )}

          {/* Error message */}
          {isFailed && job?.error_msg && (
            <p className="text-[12px] text-rose-600 font-medium mt-3 bg-rose-100 rounded-xl p-3 leading-relaxed">
              {job.error_msg}
            </p>
          )}

          {/* Retry button */}
          {isFailed && onRetry && (
            <Button
              onClick={onRetry}
              className="mt-5 w-full h-11 rounded-xl font-bold bg-[var(--shelfy-primary)] hover:bg-[var(--shelfy-accent)] text-white shadow-md"
            >
              <RefreshCw size={15} className="mr-2" />
              Reintentar
            </Button>
          )}

          {/* Job metadata */}
          {job && (
            <p className="text-[10px] text-[var(--shelfy-muted)] mt-4 font-mono opacity-60">
              Job {job.id.slice(0, 8)}…
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function Dots() {
  return (
    <div className="flex items-center gap-0.5">
      {[0, 0.18, 0.36].map((delay, i) => (
        <motion.span
          key={i}
          className="size-1 rounded-full bg-white block"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 0.9, delay, repeat: Infinity }}
        />
      ))}
    </div>
  );
}
