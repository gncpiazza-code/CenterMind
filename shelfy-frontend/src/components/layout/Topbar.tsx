"use client";

import { useAuth } from "@/hooks/useAuth";

interface TopbarProps {
  title: string;
}

export function Topbar({ title }: TopbarProps) {
  const { user } = useAuth();

  return (
    <header className="h-14 flex items-center justify-between px-4 md:px-6 border-b border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] shrink-0">
      <h1 className="text-[var(--shelfy-text)] font-semibold text-base">{title}</h1>
      {user && (
        <div className="flex items-center gap-3">
          <div className="hidden sm:block text-right">
            <p className="text-xs font-medium text-[var(--shelfy-text)]">{user.usuario}</p>
            <p className="text-[10px] text-[var(--shelfy-muted)]">{user.nombre_empresa}</p>
          </div>
          <div className="w-8 h-8 rounded-full bg-[var(--shelfy-primary)] flex items-center justify-center text-white text-xs font-bold shrink-0">
            {user.usuario.charAt(0).toUpperCase()}
          </div>
        </div>
      )}
    </header>
  );
}
