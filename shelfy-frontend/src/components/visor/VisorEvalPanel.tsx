"use client";

import { ClipboardCheck } from "lucide-react";
import { VisorPanelCard } from "@/components/visor/VisorPanelCard";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface VisorEvalPanelProps {
  children: ReactNode;
  className?: string;
}

export function VisorEvalPanel({ children, className }: VisorEvalPanelProps) {
  return (
    <VisorPanelCard
      title="Evaluar"
      icon={ClipboardCheck}
      accent="violet"
      stretch
      className={cn("h-full min-h-0", className)}
    >
      <div
        className={cn(
          "flex flex-1 min-h-0 w-full items-center justify-center",
          "rounded-md border border-violet-200/60 dark:border-violet-800/50",
          "bg-white/75 dark:bg-slate-950/35 px-3 py-2",
        )}
      >
        {children}
      </div>
    </VisorPanelCard>
  );
}
