"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { SupervisionReveal, SupervisionRevealItem } from "./SupervisionReveal";

export function SupervisionKpiSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-[var(--shelfy-border)] bg-card p-4 space-y-2"
        >
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-28" />
        </div>
      ))}
    </div>
  );
}

export function SupervisionPanelsSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-[var(--shelfy-border)]/50">
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="p-4 space-y-2">
            {Array.from({ length: 6 }).map((_, j) => (
              <Skeleton key={j} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Shell inicial mientras llegan vendedores (filtros + KPIs). */
export function SupervisionPageLoadingShell() {
  return (
    <SupervisionReveal>
      <SupervisionRevealItem>
        <div className="flex flex-wrap gap-2 mb-5">
          <Skeleton className="h-8 w-40 rounded-md" />
          <Skeleton className="h-8 w-44 rounded-md" />
        </div>
      </SupervisionRevealItem>
      <SupervisionRevealItem>
        <SupervisionKpiSkeleton />
      </SupervisionRevealItem>
      <SupervisionRevealItem className="mt-5">
        <SupervisionPanelsSkeleton />
      </SupervisionRevealItem>
    </SupervisionReveal>
  );
}
