"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Eye, LayoutDashboard, BarChart2, Map, Target, Images, Radio, FileBarChart2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface MobileNavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles: string[];
  permisoKey?: string;
}

const ALL_NAV: MobileNavItem[] = [
  { href: "/visor",                label: "Evaluar",      icon: Eye,             roles: ["superadmin", "admin", "supervisor", "evaluador", "directorio"], permisoKey: "action_evaluar_exhibiciones" },
  { href: "/dashboard",            label: "Dashboard",    icon: LayoutDashboard, roles: ["superadmin", "admin", "supervisor", "directorio"],               permisoKey: "menu_dashboard" },
  { href: "/supervision",          label: "Supervisión",  icon: BarChart2,        roles: ["superadmin", "admin", "supervisor", "directorio"],               permisoKey: "menu_supervision" },
  { href: "/modo-mapa",            label: "Mapa",         icon: Map,              roles: ["superadmin", "admin", "supervisor", "directorio"],               permisoKey: "menu_supervision" },
  { href: "/objetivos",            label: "Objetivos",    icon: Target,           roles: ["superadmin", "admin", "supervisor", "directorio"],               permisoKey: "menu_objetivos" },
  { href: "/galeria-exhibiciones", label: "Galería",      icon: Images,           roles: ["superadmin", "admin", "supervisor", "directorio", "evaluador"],  permisoKey: "menu_galeria_exhibiciones" },
  { href: "/difusion",             label: "Difusión",     icon: Radio,            roles: ["superadmin", "admin", "supervisor", "directorio", "evaluador"] },
  { href: "/reporteria",           label: "Reportería",   icon: FileBarChart2,    roles: ["superadmin"] },
];

export function BottomNav() {
  const pathname = usePathname();
  const { user, hasPermiso } = useAuth();
  const rol = user?.rol ?? "";
  const isSuperadmin = !!user?.is_superadmin;

  const navItems = ALL_NAV.filter((i) => {
    if (i.href === "/reporteria" && !isSuperadmin) return false;
    const roleAllowed = i.roles.includes(rol);
    const permisoAllowed = i.permisoKey ? hasPermiso(i.permisoKey) : false;
    if (!roleAllowed && !permisoAllowed) return false;
    if (i.permisoKey && !permisoAllowed) return false;
    return true;
  });

  if (!user) return null;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[var(--shelfy-panel)] border-t border-[var(--shelfy-border)] flex shadow-lg overflow-x-auto">
      {navItems.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
        return (
          <Link
            key={href}
            href={href}
            className={`flex-1 min-w-[56px] flex flex-col items-center gap-0.5 py-2.5 text-[9px] font-semibold transition-colors
              ${active ? "text-[var(--shelfy-primary)]" : "text-[var(--shelfy-muted)]"}`}
          >
            <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
