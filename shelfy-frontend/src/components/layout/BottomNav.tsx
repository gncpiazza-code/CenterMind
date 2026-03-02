"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Eye, Users, BarChart2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const ALL_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["superadmin", "admin", "supervisor"] },
  { href: "/visor",     label: "Evaluar",   icon: Eye,             roles: ["superadmin", "admin", "supervisor"] },
  { href: "/reportes",  label: "Reportes",  icon: BarChart2,       roles: ["superadmin", "admin", "supervisor"] },
  { href: "/admin",     label: "Admin",     icon: Users,           roles: ["superadmin", "admin"] },
];

export function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const rol = user?.rol ?? "";
  const navItems = ALL_NAV.filter(i => (i.roles as string[]).includes(rol));

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
