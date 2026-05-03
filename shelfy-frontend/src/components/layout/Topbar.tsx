"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Crown, LogOut, Building2, UserCog } from "lucide-react";
import { fetchDistribuidoras } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { TopModeTabs } from "./TopModeTabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";

interface TopbarProps {
  title?: string;
  live?: boolean;
}

export function Topbar({ title, live = false }: TopbarProps) {
  const {
    user,
    logout,
    effectiveDistribuidorId,
    switchDistributor,
    canSwitchDistribuidor,
  } = useAuth();
  const isSuperadmin = user?.is_superadmin;

  const { data: distribuidoras = [] } = useQuery({
    queryKey: ["tenant-distribuidoras"],
    queryFn: () => fetchDistribuidoras(true),
    staleTime: 5 * 60_000,
    enabled: !!user && canSwitchDistribuidor,
  });

  useEffect(() => {
    if (!canSwitchDistribuidor || !distribuidoras.length) return;
    if (effectiveDistribuidorId != null) return;
    const d = distribuidoras[0];
    switchDistributor(d.id, d.nombre);
  }, [canSwitchDistribuidor, distribuidoras, effectiveDistribuidorId, switchDistributor]);

  return (
    <TooltipProvider delayDuration={300}>
      <header className="h-14 flex items-center px-3 md:px-5 border-b border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] shrink-0 z-50 gap-2">

        {/* Left: logo */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Logo icon — desktop only */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/WEBICON.svg"
            alt="Shelfy"
            className="hidden md:block h-7 w-auto"
          />
        </div>

        {/* Center: TopModeTabs (desktop) / title (mobile) */}
        <div className="flex-1 flex items-center justify-center overflow-hidden">
          {/* Desktop: navigation tabs */}
          <TopModeTabs />

          {/* Mobile: page title */}
          {title && (
            <div className="flex md:hidden items-center gap-2">
              <h1 className="text-[var(--shelfy-text)] font-semibold text-base truncate">{title}</h1>
              {live && (
                <span className="relative flex size-1.5 shrink-0" title="Datos en tiempo real">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right: user info + logout */}
        {user && (
          <div className="flex items-center gap-3 shrink-0">
            {canSwitchDistribuidor && distribuidoras.length > 0 && (
              <Select
                value={effectiveDistribuidorId != null ? String(effectiveDistribuidorId) : String(distribuidoras[0].id)}
                onValueChange={(v) => {
                  const id = Number(v);
                  const d = distribuidoras.find((x) => x.id === id);
                  if (d) switchDistributor(d.id, d.nombre);
                }}
              >
                <SelectTrigger className="h-8 gap-2 text-xs shrink-0 w-[min(220px,44vw)] sm:w-[220px]" aria-label="Cambiar distribuidora">
                  <Building2 className="size-3.5 text-amber-500 shrink-0" />
                  <SelectValue placeholder="Empresa" />
                </SelectTrigger>
                <SelectContent align="end" className="max-h-[min(320px,50vh)]">
                  {distribuidoras.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      <span className="truncate">{d.nombre}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {isSuperadmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-[var(--shelfy-muted)] hover:text-violet-600 hover:bg-violet-50"
                    title="Herramientas superadmin"
                  >
                    <Crown size={17} />
                    <span className="sr-only">Herramientas superadmin</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Superadmin</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/fuerza-ventas" className="flex items-center gap-2">
                      <UserCog size={14} className="shrink-0" />
                      Fuerza de Ventas
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/admin/dashboard">Corridas RPA</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/admin/match-center">Match Center</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/admin/permissions">Permisos</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/admin">Administrar</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/admin/mapa">Mapa en Vivo</Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <div className="hidden sm:block text-right">
              <p className="text-xs font-medium text-[var(--shelfy-text)]">{user.usuario}</p>
              <p className="text-[10px] text-[var(--shelfy-muted)]">{user.nombre_empresa}</p>
            </div>

            <Avatar className="size-8 shrink-0">
              <AvatarFallback
                className={cn(
                  "text-white text-xs font-bold",
                  isSuperadmin
                    ? "bg-gradient-to-br from-violet-500 to-indigo-600"
                    : "bg-[var(--shelfy-primary)]",
                )}
              >
                {user.usuario.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={logout}
                  className="text-[var(--shelfy-muted)] hover:text-destructive hover:bg-red-50"
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
