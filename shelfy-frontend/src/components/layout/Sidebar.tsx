"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Eye, Users, BarChart2, Gift, LogOut, Briefcase, GraduationCap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const ALL_NAV = [
  { href: "/visor", label: "Evaluar", icon: Eye, roles: ["superadmin", "admin", "supervisor"] },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["superadmin", "admin", "supervisor"] },
  { href: "/reportes", label: "Reportes", icon: BarChart2, roles: ["superadmin", "admin", "supervisor"] },
  { href: "/bonos", label: "Bonos", icon: Gift, roles: ["superadmin", "admin"] },
  { href: "/academy", label: "Real Academy", icon: GraduationCap, roles: ["superadmin", "admin"] },
  { href: "/admin", label: "Administrar", icon: Users, roles: ["superadmin", "admin"] },
];

const ROL_LABEL: Record<string, string> = {
  superadmin: "Super Admin",
  admin: "Admin",
  supervisor: "Vendedor",
};

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const rol = user?.rol ?? "";
  const navItems = ALL_NAV.filter(i => (i.roles as string[]).includes(rol));

  return (
    <aside className="hidden md:flex flex-col w-64 min-h-screen bg-white/80 backdrop-blur-xl border-r border-violet-100 px-4 py-8 gap-2 shrink-0 shadow-[4px_0_24px_rgba(124,58,237,0.03)] sticky top-0">
      {/* Logo */}
      <div className="flex items-center px-2 mb-10">
        <img src="/LOGO_NUEVO.svg" alt="Shelfy" className="h-10 w-auto" style={{ filter: "drop-shadow(0 4px 12px rgba(124,58,237,0.15))" }} />
      </div>

      {/* Nav section label */}
      <p className="px-3 text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider mb-1">
        Menú principal
      </p>

      {/* Nav items */}
      <nav className="flex flex-col gap-1.5 flex-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-200
                ${active
                  ? "bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-200 translate-x-1"
                  : "text-slate-500 hover:bg-violet-50 hover:text-violet-700"
                }`}
            >
              <Icon size={18} strokeWidth={active ? 2.5 : 2} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* System section */}
      <div className="mt-auto space-y-4">
        <div className="pt-4 border-t border-violet-50">
          <p className="px-4 text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em] mb-3">
            Sistema
          </p>

          {/* User info */}
          {user && (
            <div className="flex items-center gap-3 px-4 py-3 mb-2 rounded-2xl bg-violet-50/50 border border-violet-100/50">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white text-xs font-black shadow-inner">
                {user.usuario.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm text-slate-900 font-bold truncate">{user.usuario}</p>
                <p className="text-[10px] text-violet-600 font-medium truncate">
                  {ROL_LABEL[user.rol] ?? user.rol}
                </p>
              </div>
            </div>
          )}

          {/* Logout */}
          <button
            onClick={logout}
            className="flex items-center gap-3 px-4 py-3 w-full text-sm font-bold text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-2xl transition-all duration-200 active:scale-95"
          >
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>
      </div>
    </aside>
  );
}
