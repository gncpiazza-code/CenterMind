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
        ${glass ? "bg-white/80 dark:bg-black/40 backdrop-blur-md border-white/20 shadow-xl" : "bg-[var(--shelfy-panel)] shadow-sm"}
        ${glow ? "shadow-lg shadow-[var(--shelfy-glow)]" : ""}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
}
