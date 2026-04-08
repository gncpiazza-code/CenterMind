"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useState, useEffect, useMemo } from "react";
import {
  LayoutDashboard, Eye, Users, BarChart2, Gift, LogOut,
  ChevronDown, ChevronRight, Activity, MapPin, Globe,
  PanelLeftClose, PanelLeft, Briefcase, Route, Monitor, Target, ShieldCheck
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
  subItems?: NavItem[];
}

const ALL_NAV: NavItem[] = [
  { href: "/visor",       label: "Evaluar",              icon: Eye,            roles: ["superadmin", "admin", "supervisor", "evaluador", "directorio"], permisoKey: "action_evaluar_exhibiciones" },
  { href: "/dashboard",   label: "Dashboard",            icon: LayoutDashboard,roles: ["superadmin", "admin", "supervisor", "directorio"], permisoKey: "menu_dashboard" },
  { href: "/supervision", label: "Panel de Supervisión", icon: Route,          roles: ["superadmin", "admin", "supervisor"], permisoKey: "menu_supervision" },
  { href: "/objetivos",   label: "Objetivos",            icon: Target,         roles: ["superadmin", "admin", "supervisor"], permisoKey: "menu_objetivos" },
  { href: "/bonos",       label: "Bonos",                icon: Gift,           roles: ["superadmin", "admin", "directorio"], permisoKey: "menu_bonos" },
  { href: "/admin",       label: "Administrar",          icon: Users,          roles: ["superadmin", "admin"], permisoKey: "menu_admin" },
  { href: "/admin/permissions", label: "Permisos",       icon: ShieldCheck,    roles: ["superadmin", "admin"], permisoKey: "menu_admin" },
  { href: "/admin/dashboard",   label: "Panel Global",  icon: Activity,       roles: ["superadmin"] },
  { href: "/admin/mapa",        label: "Mapa en Vivo",  icon: MapPin,         roles: ["superadmin"] },
  { href: "/modo-oficina",      label: "Modo Oficina",  icon: Monitor,        roles: ["superadmin", "admin", "supervisor"] },
];

const ROL_LABEL: Record<string, string> = {
  superadmin: "Super Admin",
  admin: "Admin",
  supervisor: "Vendedor",
};

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout, switchDistributor, hasPermiso } = useAuth();
  const [dists, setDists] = useState<{ id_distribuidor: number; nombre_dist: string }[]>([]);
  const { isSidebarCollapsed: isCollapsed } = useUI();

  const rol = user?.rol ?? "";
  const navItems = useMemo(
    () => ALL_NAV.filter(i => {
      const roleAllowed = (i.roles as string[]).includes(rol);
      // Narrow exception: only allow role override for visor evaluation access.
      const allowRoleOverride = i.permisoKey === "action_evaluar_exhibiciones" && hasPermiso("action_evaluar_exhibiciones");
      if (!roleAllowed && !allowRoleOverride) return false;
      if (i.permisoKey && !hasPermiso(i.permisoKey)) return false;
      return true;
    }),
    [rol, hasPermiso]
  );

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const toggleSection = (href: string) => {
    setOpenSections(prev => ({ ...prev, [href]: !prev[href] }));
  };

  useEffect(() => {
    const canSwitch = user?.rol === "superadmin" || hasPermiso("action_switch_tenant");
    if (!canSwitch) return;
    let cancelled = false;
    fetchDistribuidores()
      .then((data: any) => { if (!cancelled) setDists(data); })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [user?.rol, hasPermiso]);

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col h-screen overflow-hidden border-r px-3 py-8 gap-2 shrink-0 shadow-sm sticky top-0 transition-all duration-300 ease-in-out",
        isCollapsed ? "w-20" : "w-64"
      )}
      style={{
        background: "var(--shelfy-panel)",
        backdropFilter: "blur(12px)",
        borderColor: "var(--shelfy-border)",
        color: "var(--shelfy-text)",
      }}
    >
      {/* Logo */}
      <div className={cn("flex items-center mb-10 transition-all duration-300", isCollapsed ? "justify-center px-0" : "px-2")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={isCollapsed ? "/WEBICON.svg" : "/LOGO_NUEVO.svg"}
          alt="Shelfy"
          className="h-10 w-auto transition-all duration-300"
        />
      </div>

      {/* Nav section label */}
      {!isCollapsed && (
        <p
          className="px-3 text-[10px] font-semibold uppercase tracking-wider mb-1 animate-in fade-in duration-500"
          style={{ color: "var(--shelfy-muted)" }}
        >
          Menú principal
        </p>
      )}

      {/* Nav items — wrapped in ScrollArea */}
      <ScrollArea className="flex-1 pr-1">
        <nav className="flex flex-col gap-1.5 pb-4">
          {navItems.map((item) => {
            const { href, label, icon: Icon, subItems } = item;
            const isExactActive = pathname === href;
            const isChildActive = subItems?.some(sub => pathname.startsWith(sub.href)) || false;
            const active = isExactActive || isChildActive;
            const isOpen = openSections[href] || isChildActive;

            if (subItems) {
              const allowedSubItems = subItems.filter(sub => sub.roles ? sub.roles.includes(rol) : true);
              if (allowedSubItems.length === 0) return null;

              return (
                <div key={href} className="flex flex-col gap-1">
                  <button
                    onClick={() => toggleSection(href)}
                    className={cn(
                      "flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-200",
                      active
                        ? "bg-[var(--shelfy-primary)] text-white font-bold shadow-md shadow-[var(--shelfy-glow)]"
                        : "hover:bg-violet-50 hover:text-[var(--shelfy-primary)]"
                    )}
                    style={{ color: active ? undefined : "var(--shelfy-muted)" }}
                  >
                    <div className={cn("flex items-center gap-3", isCollapsed && "justify-center w-full")}>
                      <Icon size={18} strokeWidth={active ? 2.5 : 2} className="shrink-0" />
                      {!isCollapsed && <span className="truncate">{label}</span>}
                    </div>
                    {!isCollapsed && (isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
                  </button>
                  {isOpen && (
                    <div
                      className="flex flex-col gap-1 pl-4 mt-1 ml-6 border-l-2"
                      style={{ borderColor: "var(--shelfy-border)" }}
                    >
                      {allowedSubItems.map(sub => {
                        const subActive = pathname.startsWith(sub.href);
                        return (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            className={cn(
                              "flex items-center gap-3 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-200",
                              subActive
                                ? "bg-violet-100 text-violet-700 translate-x-1"
                                : "hover:text-[var(--shelfy-primary)] hover:bg-violet-50"
                            )}
                            style={{ color: subActive ? undefined : "var(--shelfy-muted)" }}
                          >
                            <sub.icon size={15} strokeWidth={subActive ? 2.5 : 2} className="shrink-0" />
                            {!isCollapsed && <span className="truncate">{sub.label}</span>}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-200",
                  active
                    ? "bg-[var(--shelfy-primary)] text-white shadow-md shadow-[var(--shelfy-glow)] translate-x-1"
                    : "hover:bg-violet-50 hover:text-[var(--shelfy-primary)]"
                )}
                style={{ color: active ? undefined : "var(--shelfy-muted)" }}
              >
                <Icon size={18} strokeWidth={active ? 2.5 : 2} className="shrink-0" />
                {!isCollapsed && <span className="truncate">{label}</span>}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      {/* System section */}
      <div className="mt-auto space-y-4 shrink-0 pb-2">
        <Separator style={{ backgroundColor: "var(--shelfy-border)" }} />

        {!isCollapsed && (
          <p
            className="px-4 text-[10px] font-bold uppercase tracking-[0.15em] mb-3 animate-in fade-in duration-500"
            style={{ color: "var(--shelfy-muted)" }}
          >
            Sistema
          </p>
        )}

        {/* User info */}
        {user && (
          <div className="flex flex-col gap-2 mb-2">
            <div
              className={cn(
                "flex items-center gap-3 px-3 py-3 rounded-2xl border transition-all",
                isCollapsed && "justify-center"
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
                    {ROL_LABEL[user.rol] ?? user.rol}
                  </p>
                </div>
              )}
            </div>

            {/* Distributor Switcher — SuperAdmin or authorized users */}
            {(user.rol === "superadmin" || hasPermiso("action_switch_tenant")) && !isCollapsed && (
              <div className="px-1 animate-in fade-in duration-500">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="w-full h-10 flex items-center justify-between px-3 py-1 rounded-xl text-white text-[11px] font-black border border-violet-400/20 transition-all uppercase tracking-tight"
                      style={{ background: "var(--shelfy-primary-2)" }}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <Globe size={14} className="shrink-0 text-violet-200" />
                        <span className="truncate">{user.nombre_empresa || "Global"}</span>
                      </div>
                      <ChevronDown size={14} className="shrink-0 transition-transform group-data-[state=open]:rotate-180" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side="top"
                    align="start"
                    className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-48"
                  >
                    <DropdownMenuLabel>Contexto Operativo</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {dists.map(d => (
                      <DropdownMenuItem
                        key={d.id_distribuidor}
                        onSelect={() => switchDistributor(d.id_distribuidor, d.nombre_dist)}
                        className={cn(
                          "text-xs font-bold cursor-pointer",
                          user.id_distribuidor === d.id_distribuidor && "text-violet-600 bg-violet-50"
                        )}
                      >
                        <span className="flex-1">{d.nombre_dist}</span>
                        {user.id_distribuidor === d.id_distribuidor && (
                          <div className="w-1.5 h-1.5 rounded-full bg-violet-500 ml-2" />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        )}

        {/* Logout */}
        <Button
          variant="ghost"
          onClick={logout}
          className={cn(
            "flex items-center gap-3 px-4 py-3 w-full text-sm font-bold rounded-2xl hover:bg-red-50 hover:text-red-500 justify-start",
            isCollapsed && "justify-center"
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
