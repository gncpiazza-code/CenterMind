"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import {
  Eye, LayoutDashboard, BarChart2, Map, Target, Monitor, Images, Radio,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface TabItem {
  href: string;
  label: string;
  icon: React.ElementType;
  permisoKey?: string;
  roles: string[];
}

// Tabs shown top-center for ALL users (filtered by role + permiso)
const TABS: TabItem[] = [
  {
    href: "/visor",
    label: "Evaluar",
    icon: Eye,
    permisoKey: "action_evaluar_exhibiciones",
    roles: ["superadmin", "admin", "supervisor", "evaluador", "directorio"],
  },
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    permisoKey: "menu_dashboard",
    roles: ["superadmin", "admin", "supervisor", "directorio"],
  },
  {
    href: "/supervision",
    label: "Supervisión",
    icon: BarChart2,
    permisoKey: "menu_supervision",
    roles: ["superadmin", "admin", "supervisor", "directorio"],
  },
  {
    href: "/modo-mapa",
    label: "Mapa",
    icon: Map,
    permisoKey: "menu_supervision",
    roles: ["superadmin", "admin", "supervisor", "directorio"],
  },
  {
    href: "/objetivos",
    label: "Objetivos",
    icon: Target,
    permisoKey: "menu_objetivos",
    roles: ["superadmin", "admin", "supervisor", "directorio"],
  },
  {
    href: "/modo-oficina",
    label: "Oficina",
    icon: Monitor,
    permisoKey: "menu_modo_oficina",
    roles: ["superadmin", "admin", "supervisor", "directorio", "evaluador"],
  },
  {
    href: "/galeria-exhibiciones",
    label: "Galería",
    icon: Images,
    permisoKey: "menu_galeria_exhibiciones",
    roles: ["superadmin", "admin", "supervisor", "directorio", "evaluador"],
  },
  {
    href: "/difusion",
    label: "Difusión",
    icon: Radio,
    roles: ["superadmin", "admin", "supervisor", "directorio", "evaluador"],
  },
];

export function TopModeTabs() {
  const pathname = usePathname();
  const { user, hasPermiso } = useAuth();
  const rol = user?.rol ?? "";

  const visibleTabs = useMemo(
    () =>
      TABS.filter((tab) => {
        const roleOk = tab.roles.includes(rol);
        if (!tab.permisoKey) return roleOk;
        const permisoOk = hasPermiso(tab.permisoKey);
        if (!roleOk && !permisoOk) return false;
        if (!permisoOk) return false;
        return true;
      }),
    [rol, hasPermiso],
  );

  if (!user) return null;

  return (
    <nav
      className="hidden md:flex items-center gap-2 overflow-x-auto px-1"
      style={{ scrollbarWidth: "none" }}
    >
      {visibleTabs.map(({ href, label, icon: Icon }) => {
        const active =
          pathname === href ||
          (href !== "/" && pathname.startsWith(href + "/"));
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-col items-center gap-1 px-3.5 py-2 rounded-xl transition-all duration-200 min-w-[64px] shrink-0 group",
              active
                ? "bg-[var(--shelfy-primary)]/10 text-[var(--shelfy-primary)]"
                : "text-[var(--shelfy-muted)] hover:bg-[var(--shelfy-primary)]/6 hover:text-[var(--shelfy-primary)]",
            )}
          >
            <Icon
              size={16}
              strokeWidth={active ? 2.5 : 1.8}
              className="transition-transform duration-200 group-hover:scale-110"
            />
            <span
              className={cn(
                "text-[9px] font-semibold tracking-tight whitespace-nowrap leading-none",
                active ? "text-[var(--shelfy-primary)]" : "text-[var(--shelfy-muted)]",
              )}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
