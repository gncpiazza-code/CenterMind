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
        ${glass ? "bg-white/80 dark:bg-slate-950/40 backdrop-blur-2xl backdrop-saturate-200 border-white/20 dark:border-white/5 ring-1 ring-white/10 shadow-2xl" : "bg-[var(--shelfy-panel)] shadow-sm"}
        ${glow ? "shadow-lg shadow-[var(--shelfy-glow)]" : ""}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
}
