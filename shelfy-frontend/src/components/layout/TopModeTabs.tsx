"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, type Ref } from "react";
import {
  Eye, LayoutDashboard, BarChart2, Map, Target, Images, Radio, FileBarChart2, UserCog, TrendingUp,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePortalCache } from "@/contexts/PortalCacheContext";
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
    roles: ["superadmin", "admin", "supervisor", "evaluador", "compania", "espectador"],
  },
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    permisoKey: "menu_dashboard",
    roles: ["superadmin", "admin", "supervisor", "compania", "espectador"],
  },
  {
    href: "/supervision",
    label: "Supervisión",
    icon: BarChart2,
    permisoKey: "menu_supervision",
    roles: ["superadmin", "admin", "supervisor", "compania", "espectador"],
  },
  {
    href: "/estadisticas",
    label: "Estadísticas",
    icon: TrendingUp,
    roles: ["superadmin", "admin", "supervisor", "compania", "evaluador", "espectador"],
  },
  {
    href: "/modo-mapa",
    label: "Mapa",
    icon: Map,
    permisoKey: "menu_supervision",
    roles: ["superadmin", "admin", "supervisor", "compania", "espectador"],
  },
  {
    href: "/objetivos",
    label: "Objetivos",
    icon: Target,
    permisoKey: "menu_objetivos",
    roles: ["superadmin", "admin", "supervisor", "compania", "espectador"],
  },
  {
    href: "/galeria-exhibiciones",
    label: "Galería",
    icon: Images,
    permisoKey: "menu_galeria_exhibiciones",
    roles: ["superadmin", "admin", "supervisor", "compania", "evaluador", "espectador"],
  },
  {
    href: "/difusion",
    label: "Difusión",
    icon: Radio,
    roles: ["superadmin", "admin", "supervisor", "compania", "evaluador", "espectador"],
  },
  {
    href: "/reporteria",
    label: "Reportería",
    icon: FileBarChart2,
    roles: ["superadmin"],
  },
  {
    href: "/fuerza-ventas",
    label: "FV",
    icon: UserCog,
    roles: ["superadmin", "admin", "espectador"],
  },
];

export function TopModeTabs({
  firstTabRef,
}: {
  firstTabRef?: Ref<HTMLAnchorElement>;
}) {
  const pathname = usePathname();
  const { user, hasPermiso, effectiveDistribuidorId } = useAuth();
  const { prefetchRoute } = usePortalCache();
  const rol = user?.rol ?? "";
  const isSuperadmin = !!user?.is_superadmin;

  const visibleTabs = useMemo(
    () =>
      TABS.filter((tab) => {
        if (tab.href === "/reporteria" && !isSuperadmin) return false;
        if (tab.href === "/fuerza-ventas") {
          // Visible para Superadmin (en cualquier tenant) o para ALOMA (dist_id = 4)
          const distId = effectiveDistribuidorId ?? user?.id_distribuidor;
          if (!isSuperadmin && distId !== 4) return false;
        }
        const roleOk = tab.roles.includes(rol);
        if (!tab.permisoKey) return roleOk;
        const permisoOk = hasPermiso(tab.permisoKey);
        if (!roleOk && !permisoOk) return false;
        if (!permisoOk) return false;
        return true;
      }),
    [rol, hasPermiso, isSuperadmin],
  );

  if (!user) return null;

  return (
    <nav
      className="hidden md:flex items-center gap-2 overflow-x-auto px-1"
      style={{ scrollbarWidth: "none" }}
    >
      {visibleTabs.map(({ href, label, icon: Icon }, index) => {
        const active =
          pathname === href ||
          (href !== "/" && pathname.startsWith(href + "/"));
        return (
          <Link
            key={href}
            ref={index === 0 ? firstTabRef : undefined}
            href={href}
            onMouseEnter={() => prefetchRoute(href)}
            onFocus={() => prefetchRoute(href)}
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
