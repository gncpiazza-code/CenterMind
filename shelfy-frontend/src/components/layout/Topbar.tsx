"use client";

import { useAuth } from "@/hooks/useAuth";
import { LogOut, ChevronDown, Globe, Menu, PanelLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchDistribuidores } from "@/lib/api";
import { useUI } from "@/contexts/UIContext";

interface TopbarProps {
  title: string;
}

export function Topbar({ title }: TopbarProps) {
  const { user, logout } = useAuth();
  const { toggleSidebar } = useUI();

  return (
    <header className="h-14 flex items-center justify-between px-4 md:px-6 border-b border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] shrink-0 z-50">
      <div className="flex items-center gap-4">
        {/* Toggle Sidebar Icon Only */}
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-xl text-[var(--shelfy-muted)] hover:text-[var(--shelfy-primary)] hover:bg-[var(--shelfy-primary)]/5 transition-all active:scale-95"
          title="Toggle Sidebar"
        >
          <Menu size={20} strokeWidth={2.5} />
        </button>
        <h1 className="text-[var(--shelfy-text)] font-semibold text-base">{title}</h1>
      </div>

      {user && (
        <div className="flex items-center gap-2">
          <div className="hidden sm:block text-right">
            <p className="text-xs font-medium text-[var(--shelfy-text)]">{user.usuario}</p>
            <p className="text-[10px] text-[var(--shelfy-muted)]">{user.nombre_empresa}</p>
          </div>
          <div className="w-8 h-8 rounded-full bg-[var(--shelfy-primary)] flex items-center justify-center text-white text-xs font-bold shrink-0">
            {user.usuario.charAt(0).toUpperCase()}
          </div>
          {/* Logout — visible en mobile (en desktop también está en el Sidebar) */}
          <button
            onClick={logout}
            title="Cerrar sesión"
            className="md:hidden p-2 rounded-xl text-[var(--shelfy-muted)] hover:text-[var(--shelfy-error)] hover:bg-red-50 transition-colors"
          >
            <LogOut size={18} />
          </button>
        </div>
      )}
    </header>
  );
}
