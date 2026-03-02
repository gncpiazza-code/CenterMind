import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading, children, disabled, className = "", ...props }, ref) => {
    const base = "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed";

    const variants = {
      primary:   "bg-[var(--shelfy-primary)] hover:bg-[var(--shelfy-primary-2)] text-white focus:ring-[var(--shelfy-primary)]",
      secondary: "bg-white hover:bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] border border-[var(--shelfy-border)] focus:ring-[var(--shelfy-primary)]",
      ghost:     "bg-transparent hover:bg-[var(--shelfy-bg)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] focus:ring-[var(--shelfy-border)]",
      danger:    "bg-[var(--shelfy-error)] hover:opacity-90 text-white focus:ring-[var(--shelfy-error)]",
    };

    const sizes = {
      sm: "px-3 py-1.5 text-sm",
      md: "px-4 py-2 text-sm",
      lg: "px-6 py-3 text-base",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      >
        {loading && (
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
