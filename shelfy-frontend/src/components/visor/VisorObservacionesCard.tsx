"use client";

import { MessageSquareText } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { VisorPanelCard } from "@/components/visor/VisorPanelCard";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface VisorObservacionesCardProps {
  value: string;
  onChange: (value: string) => void;
  frasesSlot: ReactNode;
  className?: string;
  placeholder?: string;
}

export function VisorObservacionesCard({
  value,
  onChange,
  frasesSlot,
  className,
  placeholder = "Escribe una observación…",
}: VisorObservacionesCardProps) {
  return (
    <VisorPanelCard
      title="Observaciones"
      icon={MessageSquareText}
      accent="slate"
      stretch
      className={cn("h-full min-h-0", className)}
    >
      <div className="flex flex-1 min-h-0 flex-col gap-2">
        <Textarea
          placeholder={placeholder}
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "resize-none flex-1 min-h-[4rem] text-[11px] leading-relaxed",
            "rounded-md border-slate-200/90 bg-white/80 dark:bg-slate-950/40 dark:border-slate-600",
            "text-slate-800 dark:text-slate-100 placeholder:text-slate-400",
            "focus-visible:ring-violet-500/25 focus-visible:border-violet-300/80",
          )}
        />
        <div className="shrink-0">{frasesSlot}</div>
      </div>
    </VisorPanelCard>
  );
}
