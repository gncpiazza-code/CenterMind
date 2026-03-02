"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Eye, Users, BarChart2, Gift, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const ALL_NAV = [
  { href: "/dashboard", label: "Dashboard",   icon: LayoutDashboard, roles: ["superadmin", "admin", "supervisor"] },
  { href: "/visor",     label: "Evaluación",  icon: Eye,             roles: ["superadmin", "admin", "supervisor"] },
  { href: "/reportes",  label: "Reportes",    icon: BarChart2,       roles: ["superadmin", "admin", "supervisor"] },
  { href: "/bonos",     label: "Bonos",       icon: Gift,            roles: ["superadmin", "admin"] },
  { href: "/admin",     label: "Administrar", icon: Users,           roles: ["superadmin", "admin"] },
];

const ROL_LABEL: Record<string, string> = {
  superadmin: "Super Admin",
  admin: "Admin",
  supervisor: "Supervisor",
};

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const rol = user?.rol ?? "";
  const navItems = ALL_NAV.filter(i => (i.roles as string[]).includes(rol));

  return (
    <aside className="hidden md:flex flex-col w-60 min-h-screen bg-[var(--shelfy-panel)] border-r border-[var(--shelfy-border)] px-3 py-6 gap-2 shrink-0">
      {/* Logo */}
      <div className="flex items-center px-3 mb-8">
        <img src="/shelfy_logo_clean.svg" alt="Shelfy" className="h-9 w-auto" />
      </div>

      {/* Nav section label */}
      <p className="px-3 text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider mb-1">
        Menú principal
      </p>

      {/* Nav items */}
      <nav className="flex flex-col gap-0.5 flex-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
                ${active
                  ? "bg-[var(--shelfy-primary)] text-white shadow-sm"
                  : "text-[var(--shelfy-muted)] hover:bg-[var(--shelfy-bg)] hover:text-[var(--shelfy-text)]"
                }`}
            >
              <Icon size={17} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* System section */}
      <div className="mt-auto">
        <p className="px-3 text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider mb-2">
          Sistema
        </p>

        {/* User info */}
        {user && (
          <div className="flex items-center gap-3 px-3 py-2.5 mb-1 rounded-xl bg-[var(--shelfy-bg)]">
            <div className="w-8 h-8 rounded-full bg-[var(--shelfy-primary)] flex items-center justify-center text-white text-xs font-bold shrink-0">
              {user.usuario.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm text-[var(--shelfy-text)] font-semibold truncate">{user.usuario}</p>
              <p className="text-[10px] text-[var(--shelfy-muted)] truncate">
                {ROL_LABEL[user.rol] ?? user.rol} · {user.nombre_empresa}
              </p>
            </div>
          </div>
        )}

        {/* Logout */}
        <button
          onClick={logout}
          className="flex items-center gap-2 px-3 py-2 w-full text-sm text-[var(--shelfy-muted)] hover:text-[var(--shelfy-error)] hover:bg-red-50 rounded-xl transition-colors"
        >
          <LogOut size={15} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
