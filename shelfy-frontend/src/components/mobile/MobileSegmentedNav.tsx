"use client";

import { cn } from "@/lib/utils";

export interface MobileSegmentItem<T extends string> {
  key: T;
  label: string;
}

interface MobileSegmentedNavProps<T extends string> {
  items: MobileSegmentItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function MobileSegmentedNav<T extends string>({
  items,
  value,
  onChange,
  className,
}: MobileSegmentedNavProps<T>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] p-1 flex gap-1",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={cn(
              "flex-1 h-9 rounded-lg text-xs font-semibold transition-colors",
              active
                ? "bg-[var(--shelfy-primary)]/20 text-[var(--shelfy-primary)]"
                : "text-[var(--shelfy-muted)] hover:bg-[var(--shelfy-primary)]/10",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
