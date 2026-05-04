"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import type { ReporteriaJob } from "@/lib/api";
import { cn } from "@/lib/utils";

const STATUS_MAP = {
  queued:    { icon: Clock,         color: "text-amber-500",   bg: "bg-amber-50 border-amber-100",   label: "En cola" },
  running:   { icon: Loader2,       color: "text-blue-500",    bg: "bg-blue-50 border-blue-100",     label: "Procesando..." },
  completed: { icon: CheckCircle2,  color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100", label: "Completado" },
  failed:    { icon: XCircle,       color: "text-rose-500",    bg: "bg-rose-50 border-rose-100",     label: "Error" },
};

interface Props {
  job: ReporteriaJob | null;
}

export function ReporteriaJobStatus({ job }: Props) {
  if (!job) return null;

  const st = STATUS_MAP[job.status];
  const Icon = st.icon;
  const isRunning = job.status === "running" || job.status === "queued";

  function elapsed() {
    if (!job?.started_at) return null;
    const start = new Date(job.started_at).getTime();
    const end = job.finished_at ? new Date(job.finished_at).getTime() : Date.now();
    const s = Math.round((end - start) / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  }

  return (
    <AnimatePresence>
      <motion.div
        key={job.id}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.3 }}
        className={cn("flex items-start gap-3 p-4 rounded-xl border text-sm", st.bg)}
      >
        <div className={cn("mt-0.5 shrink-0", st.color)}>
          {isRunning
            ? <Loader2 size={16} className="animate-spin" />
            : <Icon size={16} />
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn("font-bold text-[13px]", st.color)}>{st.label}</p>
          {job.error_msg && (
            <p className="text-xs text-rose-600 mt-1 font-medium">{job.error_msg}</p>
          )}
          <p className="text-[10px] text-[var(--shelfy-muted)] mt-1 font-medium">
            Job ID: <span className="font-mono">{job.id.slice(0, 8)}…</span>
            {elapsed() && ` · ${elapsed()}`}
          </p>
        </div>
        {isRunning && (
          <div className="shrink-0 flex items-center gap-1">
            {[0, 0.15, 0.3].map((d, i) => (
              <motion.div
                key={i}
                className="size-1.5 rounded-full bg-blue-400"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1, delay: d, repeat: Infinity }}
              />
            ))}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
