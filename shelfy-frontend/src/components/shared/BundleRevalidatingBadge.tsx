"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface BundleRevalidatingBadgeProps {
  visible?: boolean;
  className?: string;
}

/** Indicador discreto cuando el bundle se sirvió stale y refresca en background. */
export function BundleRevalidatingBadge({ visible, className }: BundleRevalidatingBadgeProps) {
  if (!visible) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide",
        "bg-amber-500/15 text-amber-800 dark:text-amber-200 border border-amber-500/25",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-3 animate-spin shrink-0" aria-hidden />
      Actualizando datos…
    </span>
  );
}
