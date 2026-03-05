"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, Eye, Users, BarChart2, Gift, LogOut, ChevronDown, ChevronRight, GraduationCap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const ALL_NAV = [
  { href: "/visor", label: "Evaluar", icon: Eye, roles: ["superadmin", "admin", "supervisor"] },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["superadmin", "admin", "supervisor"] },
  { href: "/bonos", label: "Bonos", icon: Gift, roles: ["superadmin", "admin"] },
  {
    href: "/academy-hub",
    label: "Real Academy",
    icon: GraduationCap,
    roles: ["superadmin", "admin", "supervisor"],
    subItems: [
      { href: "/reportes", label: "Herramientas de Reporte", icon: BarChart2, roles: ["superadmin", "admin", "supervisor"] },
      { href: "/academy/aula-virtual", label: "Aula Virtual", icon: GraduationCap, roles: ["superadmin", "admin"] }
    ]
  },
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

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ "/academy-hub": true });

  const toggleSection = (href: string) => {
    setOpenSections(prev => ({ ...prev, [href]: !prev[href] }));
  };

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
        {navItems.map((item) => {
          const { href, label, icon: Icon, subItems } = item;
          const isExactActive = pathname === href;
          const isChildActive = subItems?.some(sub => pathname.startsWith(sub.href)) || false;
          const active = isExactActive || isChildActive;
          const isOpen = openSections[href] || isChildActive;

          if (subItems) {
            // Render Nested Menu structure
            const allowedSubItems = subItems.filter(sub => sub.roles.includes(rol));
            if (allowedSubItems.length === 0) return null;

            return (
              <div key={href} className="flex flex-col gap-1">
                <button
                  onClick={() => toggleSection(href)}
                  className={`flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-200
                        ${active
                      ? "bg-violet-50 text-violet-700 font-bold"
                      : "text-slate-500 hover:bg-violet-50 hover:text-violet-700"}`}
                >
                  <div className="flex items-center gap-3">
                    <Icon size={18} strokeWidth={active ? 2.5 : 2} />
                    {label}
                  </div>
                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                {isOpen && (
                  <div className="flex flex-col gap-1 pl-4 mt-1 border-l-2 border-violet-100 ml-6">
                    {allowedSubItems.map(sub => {
                      const subActive = pathname.startsWith(sub.href);
                      return (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-200
                                 ${subActive
                              ? "bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-200 translate-x-1"
                              : "text-slate-500 hover:text-violet-700 hover:bg-violet-50/50"
                            }`}
                        >
                          <sub.icon size={15} strokeWidth={subActive ? 2.5 : 2} />
                          {sub.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          // Render Normal Item
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
