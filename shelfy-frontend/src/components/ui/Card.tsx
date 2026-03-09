import { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  glow?: boolean;
  glass?: boolean;
}

export function Card({ glow, glass, className = "", children, ...props }: CardProps) {
  return (
    <div
      className={`
        rounded-xl border border-[var(--shelfy-border)] p-4
        ${glass ? "bg-slate-100/70 dark:bg-slate-900/60 backdrop-blur-xl border-white/20 dark:border-white/10 ring-1 ring-white/10 shadow-2xl" : "bg-[var(--shelfy-panel)] shadow-sm"}
        ${glow ? "shadow-lg shadow-[var(--shelfy-glow)]" : ""}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
}
