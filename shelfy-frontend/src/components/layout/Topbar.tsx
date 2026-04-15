"use client";

import { useAuth } from "@/hooks/useAuth";
import { LogOut, Menu, Monitor } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useUI } from "@/contexts/UIContext";
import { cn } from "@/lib/utils";

interface TopbarProps {
  title: string;
  /** Mejora #4: muestra badge "LIVE" pulsante junto al título */
  live?: boolean;
}

export function Topbar({ title, live = false }: TopbarProps) {
  const { user, logout, hasPermiso } = useAuth();
  const { toggleSidebar } = useUI();

  return (
    <TooltipProvider delayDuration={300}>
      <header className="h-14 flex items-center justify-between px-4 md:px-6 border-b border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] shrink-0 z-50">
        <div className="flex items-center gap-3">
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

          {/* Mejora #4: título con badge LIVE opcional */}
          <div className="flex items-center gap-2.5">
            <h1 className="text-[var(--shelfy-text)] font-semibold text-base">{title}</h1>
            {live && (
              <span className="relative flex size-1.5" title="Datos en tiempo real">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
              </span>
            )}
          </div>
        </div>

        {user && (
          <div className="flex items-center gap-2 md:gap-3">
            {/* Mejora #21: Modo Oficina visible en mobile también (solo ícono) */}
            {hasPermiso("menu_modo_oficina") && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      window.location.href = "/modo-oficina";
                      document.documentElement.requestFullscreen?.().catch(() => {});
                    }}
                    className={cn(
                      "flex items-center gap-2 text-[var(--shelfy-muted)] hover:text-[var(--shelfy-primary)] hover:bg-[var(--shelfy-primary)]/5 border border-transparent hover:border-[var(--shelfy-primary)]/20 transition-all"
                    )}
                  >
                    <Monitor size={17} />
                    {/* texto solo visible en md+ */}
                    <span className="hidden md:inline text-xs font-bold uppercase tracking-wider">Modo Oficina</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Abrir Modo Oficina (Pantalla Completa)</TooltipContent>
              </Tooltip>
            )}

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

            {/* Logout — mobile only */}
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
