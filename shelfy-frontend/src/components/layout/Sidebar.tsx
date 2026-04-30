"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useState, useEffect, useMemo } from "react";
import {
  Gift, LogOut, ChevronDown, Activity, MapPin, Globe,
  Briefcase, ShieldCheck, Users,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { fetchDistribuidores } from "@/lib/api";
import { useUI } from "@/contexts/UIContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/Button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles?: string[];
  permisoKey?: string;
}

// Only items NOT covered by TopModeTabs — shown in superadmin sidebar
const SIDEBAR_EXTRAS: NavItem[] = [
  { href: "/bonos",              label: "Bonos",        icon: Gift,       roles: ["superadmin", "admin", "directorio"], permisoKey: "menu_bonos" },
  { href: "/admin",              label: "Administrar",  icon: Users,      roles: ["superadmin", "admin"], permisoKey: "menu_admin" },
  { href: "/admin/permissions",  label: "Permisos",     icon: ShieldCheck,roles: ["superadmin", "admin"], permisoKey: "menu_admin" },
  { href: "/admin/match-center", label: "Match Center", icon: Briefcase,  roles: ["superadmin"] },
  { href: "/admin/dashboard",    label: "Corridas RPA", icon: Activity,   roles: ["superadmin"] },
  { href: "/admin/mapa",         label: "Mapa en Vivo", icon: MapPin,     roles: ["superadmin"] },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout, switchDistributor, hasPermiso } = useAuth();
  const [dists, setDists] = useState<{ id_distribuidor: number; nombre_dist: string }[]>([]);
  const { isSidebarCollapsed: isCollapsed } = useUI();

  const rol = user?.rol ?? "";

  // All hooks must be called unconditionally
  const navItems = useMemo(
    () =>
      SIDEBAR_EXTRAS.filter((i) => {
        const roleAllowed = (i.roles as string[]).includes(rol);
        const permisoAllowed = i.permisoKey ? hasPermiso(i.permisoKey) : false;
        if (!roleAllowed && !permisoAllowed) return false;
        if (i.permisoKey && !permisoAllowed) return false;
        return true;
      }),
    [rol, hasPermiso],
  );

  useEffect(() => {
    if (!user?.is_superadmin) return;
    let cancelled = false;
    fetchDistribuidores()
      .then((data: any) => { if (!cancelled) setDists(data); })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [user?.is_superadmin]);

  // Sidebar only renders for superadmin
  if (!user || !user.is_superadmin) return null;

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col h-screen overflow-hidden border-r px-3 py-8 gap-2 shrink-0 shadow-sm sticky top-0 transition-all duration-300 ease-in-out",
        isCollapsed ? "w-20" : "w-56",
      )}
      style={{
        background: "var(--shelfy-panel)",
        backdropFilter: "blur(12px)",
        borderColor: "var(--shelfy-border)",
        color: "var(--shelfy-text)",
      }}
    >
      {/* Section label */}
      {!isCollapsed && (
        <p
          className="px-3 text-[9px] font-black uppercase tracking-[0.2em] mb-2 animate-in fade-in duration-500"
          style={{ color: "var(--shelfy-muted)" }}
        >
          Admin
        </p>
      )}

      <ScrollArea className="flex-1 pr-1">
        <nav className="flex flex-col gap-1.5 pb-4">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all duration-200",
                  active
                    ? "bg-[var(--shelfy-primary)] text-white shadow-md shadow-[var(--shelfy-glow)] translate-x-1"
                    : "hover:bg-violet-50 hover:text-[var(--shelfy-primary)]",
                )}
                style={{ color: active ? undefined : "var(--shelfy-muted)" }}
              >
                <Icon size={17} strokeWidth={active ? 2.5 : 2} className="shrink-0" />
                {!isCollapsed && <span className="truncate">{label}</span>}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      <div className="mt-auto space-y-4 shrink-0 pb-2">
        <Separator style={{ backgroundColor: "var(--shelfy-border)" }} />

        {/* User info */}
        <div className="flex flex-col gap-2 mb-2">
          <div
            className={cn(
              "flex items-center gap-3 px-3 py-3 rounded-2xl border transition-all",
              isCollapsed && "justify-center",
            )}
            style={{ background: "rgba(168,85,247,0.06)", borderColor: "rgba(168,85,247,0.12)" }}
          >
            <Avatar className="size-9 shrink-0 rounded-xl">
              <AvatarFallback className="rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 text-white text-xs font-black shadow-inner">
                {user.usuario.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {!isCollapsed && (
              <div className="min-w-0 flex-1 animate-in fade-in slide-in-from-left-2 duration-300">
                <p className="text-sm font-bold truncate" style={{ color: "var(--shelfy-text)" }}>
                  {user.usuario}
                </p>
                <p className="text-[10px] font-medium truncate uppercase tracking-tighter" style={{ color: "var(--shelfy-primary)" }}>
                  Super Admin
                </p>
              </div>
            )}
          </div>

          {/* Distributor switcher */}
          {!isCollapsed && (
            <div className="px-1 animate-in fade-in duration-500">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="w-full h-9 flex items-center justify-between px-3 py-1 rounded-xl text-white text-[11px] font-black border border-violet-400/20 transition-all uppercase tracking-tight"
                    style={{ background: "var(--shelfy-primary-2)" }}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <Globe size={13} className="shrink-0 text-violet-200" />
                      <span className="truncate">{user.nombre_empresa || "Global"}</span>
                    </div>
                    <ChevronDown size={13} className="shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-44">
                  <DropdownMenuLabel>Contexto Operativo</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {dists.map((d) => (
                    <DropdownMenuItem
                      key={d.id_distribuidor}
                      onSelect={() => switchDistributor(d.id_distribuidor, d.nombre_dist)}
                      className={cn(
                        "text-xs font-bold cursor-pointer",
                        user.id_distribuidor === d.id_distribuidor && "text-violet-600 bg-violet-50",
                      )}
                    >
                      <span className="flex-1">{d.nombre_dist}</span>
                      {user.id_distribuidor === d.id_distribuidor && (
                        <div className="size-1.5 rounded-full bg-violet-500 ml-2" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          onClick={logout}
          className={cn(
            "flex items-center gap-3 px-4 py-3 w-full text-sm font-bold rounded-2xl hover:bg-red-50 hover:text-red-500 justify-start",
            isCollapsed && "justify-center",
          )}
          style={{ color: "var(--shelfy-muted)" }}
        >
          <LogOut size={16} className="shrink-0" />
          {!isCollapsed && <span>Cerrar sesión</span>}
        </Button>
      </div>
    </aside>
  );
}
