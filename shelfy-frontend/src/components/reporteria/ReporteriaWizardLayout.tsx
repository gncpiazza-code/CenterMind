"use client";

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { ReporteriaSource } from "@/lib/api";

const STEPS = [
  { index: 0, key: "pick",       label: "Reporte" },
  { index: 1, key: "guide",      label: "Guía" },
  { index: 2, key: "upload",     label: "Archivo" },
  { index: 3, key: "processing", label: "Procesando" },
  { index: 4, key: "panel",      label: "Panel" },
] as const;

type StepKey = typeof STEPS[number]["key"];

interface Props {
  step: StepKey;
  reportType: ReporteriaSource | null;
  children: React.ReactNode;
}

function StepIndicator({ step }: { step: StepKey }) {
  const activeIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="flex items-center gap-0 w-full max-w-lg mx-auto mb-8">
      {STEPS.map((s, i) => {
        const done    = i < activeIndex;
        const active  = i === activeIndex;

        return (
          <div key={s.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <div
                className={cn(
                  "size-7 rounded-full flex items-center justify-center text-[11px] font-black transition-all duration-300",
                  done
                    ? "bg-[var(--shelfy-primary)] text-white"
                    : active
                      ? "bg-[var(--shelfy-primary)] text-white ring-4 ring-[var(--shelfy-primary)]/20"
                      : "bg-[var(--shelfy-border)] text-[var(--shelfy-muted)] border border-[var(--shelfy-border)]"
                )}
                style={
                  done || active
                    ? {}
                    : { background: "rgba(0,0,0,0.05)" }
                }
              >
                {done ? (
                  <svg viewBox="0 0 12 12" className="size-3.5 fill-none stroke-white stroke-[2]">
                    <polyline points="2,6 5,9 10,3" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={cn(
                  "text-[9px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors duration-200",
                  active ? "text-[var(--shelfy-primary)]" : done ? "text-[var(--shelfy-primary)]/70" : "text-[var(--shelfy-muted)]"
                )}
              >
                {s.label}
              </span>
            </div>

            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "h-px flex-1 mx-1 mb-5 transition-all duration-300",
                  i < activeIndex
                    ? "bg-[var(--shelfy-primary)]"
                    : "bg-[var(--shelfy-border)]"
                )}
                style={{ opacity: i < activeIndex ? 1 : 0.35 }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ReporteriaWizardLayout({ step, reportType, children }: Props) {
  const activeIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="w-full">
      <StepIndicator step={step} />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
          style={{
            willChange: "transform, opacity",
          }}
          className="w-full"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
