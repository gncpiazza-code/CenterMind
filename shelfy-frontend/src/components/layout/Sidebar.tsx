"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Eye, Users, FileBarChart2, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard",  icon: LayoutDashboard },
  { href: "/visor",     label: "Visor",       icon: Eye },
  { href: "/admin",     label: "Administrar", icon: Users },
  { href: "/reportes",  label: "Reportes",    icon: FileBarChart2 },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="hidden md:flex flex-col w-56 min-h-screen bg-[var(--shelfy-panel)] border-r border-[var(--shelfy-border)] px-3 py-6 gap-2">
      {/* Logo */}
      <div className="flex items-center gap-2 px-2 mb-6">
        <img src="/shelfy_logo_clean.svg" alt="Shelfy" className="h-7 w-auto" />
        <span className="text-[var(--shelfy-text)] font-semibold text-lg">Shelfy</span>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1 flex-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${active
                  ? "bg-[var(--shelfy-primary)] text-white"
                  : "text-[var(--shelfy-muted)] hover:bg-[var(--shelfy-bg)] hover:text-[var(--shelfy-text)]"
                }`}
            >
              <Icon size={16} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User + Logout */}
      <div className="border-t border-[var(--shelfy-border)] pt-4 mt-2">
        {user && (
          <div className="px-2 mb-3">
            <p className="text-xs text-[var(--shelfy-muted)]">Sesión</p>
            <p className="text-sm text-[var(--shelfy-text)] font-medium truncate">{user.usuario}</p>
            <p className="text-xs text-[var(--shelfy-muted)] truncate">{user.nombre_empresa}</p>
          </div>
        )}
        <button
          onClick={logout}
          className="flex items-center gap-2 px-3 py-2 w-full text-sm text-[var(--shelfy-muted)] hover:text-[var(--shelfy-error)] hover:bg-[var(--shelfy-bg)] rounded-lg transition-colors"
        >
          <LogOut size={15} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
