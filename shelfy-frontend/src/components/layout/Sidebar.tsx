"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { LayoutDashboard, Eye, Users, BarChart2, Gift, LogOut, ChevronDown, ChevronRight, GraduationCap, Activity, MapPin, Globe, PanelLeftClose, PanelLeft, Briefcase } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { fetchDistribuidores } from "@/lib/api";
import { useUI } from "@/contexts/UIContext";

interface NavItem {
  href: string;
  label: string;
  icon: any;
  roles?: string[];
  subItems?: NavItem[];
}

const ALL_NAV: NavItem[] = [
  { href: "/visor", label: "Evaluar", icon: Eye, roles: ["superadmin", "admin", "supervisor"] },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["superadmin", "admin", "supervisor"] },
  { href: "/bonos", label: "Bonos", icon: Gift, roles: ["superadmin", "admin"] },
  {
    href: "/academy-hub",
    label: "Real Academy",
    icon: GraduationCap,
    roles: ["superadmin", "admin", "supervisor"],
    subItems: [
      {
        href: "/reportes",
        label: "Central de Reportes",
        icon: BarChart2,
        roles: ["superadmin", "admin", "supervisor"],
        subItems: [
          { href: "/visor", label: "Exhibiciones", icon: Eye, roles: ["superadmin", "admin", "supervisor"] },
          { href: "/reportes?tab=cuentas_corrientes", label: "Cuentas corrientes", icon: Briefcase, roles: ["superadmin", "admin"] },
          { href: "/reportes?tab=padron", label: "Padrón de Clientes", icon: Users, roles: ["superadmin", "admin"] },
        ]
      },
      { href: "/academy/aula-virtual", label: "Aula Virtual", icon: GraduationCap, roles: ["superadmin", "admin"] }
    ]
  },
  { href: "/admin", label: "Administrar", icon: Users, roles: ["superadmin", "admin"] },
  {
    href: "/admin/dashboard",
    label: "Panel Global",
    icon: Activity,
    roles: ["superadmin"]
  },
  {
    href: "/admin/mapa",
    label: "Mapa en Vivo",
    icon: MapPin,
    roles: ["superadmin"]
  },
];

const ROL_LABEL: Record<string, string> = {
  superadmin: "Super Admin",
  admin: "Admin",
  supervisor: "Vendedor",
};

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout, switchDistributor } = useAuth();
  const [dists, setDists] = useState<{ id_distribuidor: number; nombre_dist: string }[]>([]);
  const [showSwitch, setShowSwitch] = useState(false);
  const { isSidebarCollapsed: isCollapsed } = useUI();

  const rol = user?.rol ?? "";
  const navItems: NavItem[] = rol === "superadmin" || user?.usuario === "NachoPiazza"
    ? ALL_NAV.filter(i => (i.roles as string[]).includes(rol))
    : [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      {
        href: "/reportes",
        label: "Central de Reportes",
        icon: BarChart2,
        subItems: [
          { href: "/visor", label: "Exhibiciones", icon: Eye },
          { href: "/reportes?tab=cuentas_corrientes", label: "Cuentas corrientes", icon: Briefcase },
          { href: "/reportes?tab=padron", label: "Padrón de Clientes", icon: Users },
        ]
      },
    ];

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ "/academy-hub": true });

  const toggleSection = (href: string) => {
    setOpenSections(prev => ({ ...prev, [href]: !prev[href] }));
  };

  useEffect(() => {
    if (user?.rol === "superadmin") {
      fetchDistribuidores().then(setDists).catch(console.error);
    }
  }, [user?.rol]);

  return (
    <aside className={`hidden md:flex flex-col h-screen overflow-hidden bg-[var(--shelfy-panel)] backdrop-blur-3xl border-r border-[var(--shelfy-border)] px-3 py-8 gap-2 shrink-0 shadow-xl sticky top-0 text-[var(--shelfy-text)] transition-all duration-300 ease-in-out ${isCollapsed ? "w-20" : "w-64"}`}>
      {/* Logo */}
      <div className={`flex items-center mb-10 transition-all duration-300 ${isCollapsed ? "justify-center px-0" : "px-2"}`}>
        <img
          src={isCollapsed ? "/WEBICON.svg" : "/LOGO_NUEVO.svg"}
          alt="Shelfy"
          className="h-10 w-auto transition-all duration-300"
          style={{ filter: "drop-shadow(0 4px 12px rgba(124,58,237,0.15))" }}
        />
      </div>

      {/* Nav section label */}
      {!isCollapsed && (
        <p className="px-3 text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider mb-1 animate-in fade-in duration-500">
          Menú principal
        </p>
      )}

      {/* Nav items */}
      <nav className="flex flex-col gap-1.5 flex-1 overflow-y-auto pr-1 pb-4 scrollbar-thin">
        {navItems.map((item) => {
          const { href, label, icon: Icon, subItems } = item;
          const isExactActive = pathname === href;
          const isChildActive = subItems?.some(sub => pathname.startsWith(sub.href)) || false;
          const active = isExactActive || isChildActive;
          const isOpen = openSections[href] || isChildActive;

          if (subItems) {
            // Render Nested Menu structure
            const allowedSubItems = subItems.filter(sub => sub.roles ? sub.roles.includes(rol) : true);
            if (allowedSubItems.length === 0) return null;

            return (
              <div key={href} className="flex flex-col gap-1">
                <button
                  onClick={() => toggleSection(href)}
                  className={`flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-200
                      ${active
                      ? "bg-[var(--shelfy-primary)] text-white font-bold shadow-lg shadow-[var(--shelfy-glow)]"
                      : "text-[var(--shelfy-muted)] hover:bg-white/5 hover:text-[var(--shelfy-primary)]"}`}
                >
                  <div className={`flex items-center gap-3 ${isCollapsed ? "justify-center w-full" : ""}`}>
                    <Icon size={18} strokeWidth={active ? 2.5 : 2} className="shrink-0" />
                    {!isCollapsed && <span className="truncate">{label}</span>}
                  </div>
                  {!isCollapsed && (isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
                </button>
                {isOpen && (
                  <div className="flex flex-col gap-1 pl-4 mt-1 border-l-2 border-white/10 ml-6">
                    {allowedSubItems.map(sub => {
                      const subActive = pathname.startsWith(sub.href);
                      return (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-200
                                 ${subActive
                              ? "bg-[var(--shelfy-primary-2)] text-white shadow-md shadow-[var(--shelfy-glow)] translate-x-1"
                              : "text-[var(--shelfy-muted)] hover:text-[var(--shelfy-primary)] hover:bg-white/5"
                            }`}
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

          // Render Normal Item
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-200
                ${active
                  ? "bg-[var(--shelfy-primary)] text-white shadow-lg shadow-[var(--shelfy-glow)] translate-x-1"
                  : "text-[var(--shelfy-muted)] hover:bg-white/5 hover:text-[var(--shelfy-primary)]"
                }`}
            >
              <Icon size={18} strokeWidth={active ? 2.5 : 2} className="shrink-0" />
              {!isCollapsed && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* System section */}
      <div className="mt-auto space-y-4 shrink-0 pb-2">
        <div className="pt-4 border-t border-[var(--shelfy-border)]">
          {!isCollapsed && (
            <p className="px-4 text-[10px] font-bold text-[var(--shelfy-muted)] uppercase tracking-[0.15em] mb-3 animate-in fade-in duration-500">
              Sistema
            </p>
          )}

          {/* User info */}
          {user && (
            <div className="flex flex-col gap-2 mb-2">
              <div className={`flex items-center gap-3 px-3 py-3 rounded-2xl bg-white/5 border border-white/10 transition-all ${isCollapsed ? "justify-center" : ""}`}>
                <div className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white text-xs font-black shadow-inner">
                  {user.usuario.charAt(0).toUpperCase()}
                </div>
                {!isCollapsed && (
                  <div className="min-w-0 flex-1 animate-in fade-in slide-in-from-left-2 duration-300">
                    <p className="text-sm font-bold truncate text-white">{user.usuario}</p>
                    <p className="text-[10px] text-[var(--shelfy-primary)] font-medium truncate uppercase tracking-tighter">
                      {ROL_LABEL[user.rol] ?? user.rol}
                    </p>
                  </div>
                )}
              </div>

              {/* Switcher para SuperAdmin (Debajo del user) */}
              {user.rol === "superadmin" && !isCollapsed && (
                <div className="relative px-1 animate-in fade-in duration-500">
                  <button
                    onClick={() => setShowSwitch(!showSwitch)}
                    className="w-full h-10 flex items-center justify-between px-3 py-1 rounded-xl bg-[var(--shelfy-primary-2)] hover:bg-[var(--shelfy-primary)] text-white text-[11px] font-black border border-white/10 transition-all uppercase tracking-tight group"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <Globe size={14} className="shrink-0 text-violet-200" />
                      <span className="truncate">{user.nombre_empresa || "Global"}</span>
                    </div>
                    <ChevronDown size={14} className={`shrink-0 transition-transform ${showSwitch ? 'rotate-180' : ''}`} />
                  </button>

                  {showSwitch && (
                    <div className="absolute bottom-full left-0 mb-2 w-full bg-white border border-slate-100 shadow-2xl rounded-2xl overflow-hidden z-[100] animate-in fade-in slide-in-from-bottom-2">
                      <div className="p-3 bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Contexto Operativo
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        {dists.map(d => (
                          <button
                            key={d.id_distribuidor}
                            onClick={() => {
                              switchDistributor(d.id_distribuidor, d.nombre_dist);
                              setShowSwitch(false);
                            }}
                            className={`w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-violet-50 transition-colors flex items-center justify-between ${user.id_distribuidor === d.id_distribuidor ? 'text-violet-600 bg-violet-50/50' : 'text-slate-600'}`}
                          >
                            {d.nombre_dist}
                            {user.id_distribuidor === d.id_distribuidor && <div className="w-1.5 h-1.5 rounded-full bg-violet-500" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Logout */}
          <button
            onClick={logout}
            className={`flex items-center gap-3 px-4 py-3 w-full text-sm font-bold text-[var(--shelfy-muted)] hover:text-red-400 hover:bg-red-400/10 rounded-2xl transition-all duration-200 active:scale-95 ${isCollapsed ? "justify-center" : ""}`}
          >
            <LogOut size={16} className="shrink-0" />
            {!isCollapsed && <span>Cerrar sesión</span>}
          </button>
        </div>
      </div>
    </aside>
  );
}
