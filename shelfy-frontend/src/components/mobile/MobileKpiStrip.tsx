"use client";

import { cn } from "@/lib/utils";

interface MobileKpiItem {
  label: string;
  value: string;
}

interface MobileKpiStripProps {
  items: MobileKpiItem[];
  className?: string;
}

export function MobileKpiStrip({ items, className }: MobileKpiStripProps) {
  return (
    <div className={cn("flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]", className)}>
      {items.map((item) => (
        <div
          key={item.label}
          className="shrink-0 min-w-[140px] rounded-xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] px-3 py-2"
        >
          <p className="text-[10px] font-semibold uppercase text-[var(--shelfy-muted)]">{item.label}</p>
          <p className="text-sm font-black text-[var(--shelfy-text)] mt-1">{item.value}</p>
        </div>
      ))}
    </div>
  );
}
