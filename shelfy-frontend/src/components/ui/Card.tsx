import { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  glow?: boolean;
}

export function Card({ glow, className = "", children, ...props }: CardProps) {
  return (
    <div
      className={`
        rounded-xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] p-4
        ${glow ? "shadow-lg shadow-[var(--shelfy-glow)]" : "shadow-sm"}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
}
