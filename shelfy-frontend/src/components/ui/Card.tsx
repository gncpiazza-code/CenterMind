import { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  glow?: boolean;
}

export function Card({ glow, className = "", children, ...props }: CardProps) {
  return (
    <div
      className={`
        rounded-xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] p-4
        ${glow ? "shadow-[0_0_20px_var(--shelfy-glow)]" : ""}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
}
