"use client";

import { useAuth } from "@/hooks/useAuth";

interface TopbarProps {
  title: string;
}

export function Topbar({ title }: TopbarProps) {
  const { user } = useAuth();

  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-[var(--shelfy-border)] bg-[var(--shelfy-panel)]">
      <h1 className="text-[var(--shelfy-text)] font-semibold text-base">{title}</h1>
      {user && (
        <span className="text-xs text-[var(--shelfy-muted)]">
          {user.usuario} · {user.nombre_empresa}
        </span>
      )}
    </header>
  );
}
