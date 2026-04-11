"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Eye, Users, BarChart2, Gift, GraduationCap, Route, Target } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface MobileNavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles: string[];
  permisoKey?: string;
}

const ALL_NAV: MobileNavItem[] = [
  { href: "/visor",       label: "Evaluar",      icon: Eye,             roles: ["superadmin", "admin", "supervisor", "evaluador", "directorio"], permisoKey: "action_evaluar_exhibiciones" },
  { href: "/dashboard",   label: "Dashboard",    icon: LayoutDashboard, roles: ["superadmin", "admin", "supervisor"] },
  { href: "/supervision", label: "Supervisión",  icon: Route,           roles: ["superadmin", "admin", "supervisor", "directorio"], permisoKey: "menu_supervision" },
  { href: "/objetivos",   label: "Objetivos",    icon: Target,          roles: ["superadmin", "admin", "supervisor", "directorio"] },
  { href: "/reportes",    label: "Reportes",     icon: BarChart2,       roles: ["superadmin", "admin", "supervisor"] },
  { href: "/bonos",       label: "Bonos",        icon: Gift,            roles: ["superadmin", "admin"] },
  { href: "/academy",     label: "Academy",      icon: GraduationCap,   roles: ["superadmin", "admin"] },
  { href: "/admin",       label: "Admin",        icon: Users,           roles: ["superadmin", "admin"] },
];

export function BottomNav() {
  const pathname = usePathname();
  const { user, hasPermiso } = useAuth();
  const rol = user?.rol ?? "";
  const navItems = ALL_NAV.filter(i => {
    const roleAllowed = i.roles.includes(rol);
    const allowRoleOverride = i.permisoKey === "action_evaluar_exhibiciones" && hasPermiso("action_evaluar_exhibiciones");
    if (!roleAllowed && !allowRoleOverride) return false;
    if (i.permisoKey && !hasPermiso(i.permisoKey)) return false;
    return true;
  });

  if (!user) return null;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[var(--shelfy-panel)] border-t border-[var(--shelfy-border)] flex shadow-lg">
      {navItems.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center gap-0.5 py-3 text-[10px] font-medium transition-colors
              ${active ? "text-[var(--shelfy-primary)]" : "text-[var(--shelfy-muted)]"}`}
          >
            <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
