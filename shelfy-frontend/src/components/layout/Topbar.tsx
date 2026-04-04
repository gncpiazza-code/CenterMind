"use client";

import { useAuth } from "@/hooks/useAuth";
import { LogOut, Menu, Monitor } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useUI } from "@/contexts/UIContext";

interface TopbarProps {
  title: string;
}

export function Topbar({ title }: TopbarProps) {
  const { user, logout } = useAuth();
  const { toggleSidebar } = useUI();

  return (
    <TooltipProvider delayDuration={300}>
      <header className="h-14 flex items-center justify-between px-4 md:px-6 border-b border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] shrink-0 z-50">
        <div className="flex items-center gap-4">
          {/* Toggle sidebar */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleSidebar}
                className="text-[var(--shelfy-muted)] hover:text-[var(--shelfy-primary)] hover:bg-[var(--shelfy-primary)]/5"
              >
                <Menu size={20} strokeWidth={2.5} />
                <span className="sr-only">Toggle Sidebar</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Toggle Sidebar</TooltipContent>
          </Tooltip>

          <h1 className="text-[var(--shelfy-text)] font-semibold text-base">{title}</h1>
        </div>

        {user && (
          <div className="flex items-center gap-2 md:gap-4">
            {/* Modo Oficina */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    window.location.href = "/modo-oficina";
                    document.documentElement.requestFullscreen?.().catch(() => {});
                  }}
                  className="hidden md:flex items-center gap-2 text-[var(--shelfy-muted)] hover:text-[var(--shelfy-primary)] hover:bg-[var(--shelfy-primary)]/5 border border-transparent hover:border-[var(--shelfy-primary)]/20"
                >
                  <Monitor size={18} />
                  <span className="text-xs font-bold uppercase tracking-wider">Modo Oficina</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Abrir Modo Oficina (Pantalla Completa)</TooltipContent>
            </Tooltip>

            {/* User info */}
            <div className="hidden sm:block text-right">
              <p className="text-xs font-medium text-[var(--shelfy-text)]">{user.usuario}</p>
              <p className="text-[10px] text-[var(--shelfy-muted)]">{user.nombre_empresa}</p>
            </div>

            {/* Avatar */}
            <Avatar className="size-8 shrink-0">
              <AvatarFallback className="bg-[var(--shelfy-primary)] text-white text-xs font-bold">
                {user.usuario.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            {/* Logout — mobile only (desktop has it in Sidebar) */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={logout}
                  className="md:hidden text-[var(--shelfy-muted)] hover:text-destructive hover:bg-red-50"
                >
                  <LogOut size={18} />
                  <span className="sr-only">Cerrar sesión</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Cerrar sesión</TooltipContent>
            </Tooltip>
          </div>
        )}
      </header>
    </TooltipProvider>
  );
}
