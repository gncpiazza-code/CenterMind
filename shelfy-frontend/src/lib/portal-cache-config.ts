/** Módulos portal con bundle snapshot — P0 performance. */
export type PortalModuleId = "dashboard" | "supervision" | "estadisticas" | "visor";

export const PORTAL_BUNDLE_PREFIX = "bundle" as const;

export const PERSIST_MAX_AGE_MS = 30 * 60 * 1000; // alineado BUNDLE_GC_MS
export const PERSIST_STORAGE_KEY = "shelfy-portal-rq-v1";

export const ORCHESTRATOR_IDLE_STAGGER_MS = 400;
export const ORCHESTRATOR_WARM_ONCE_KEY = "shelfy-portal-warm-session";

/** Rutas → módulo bundle (BottomNav + TopModeTabs P0). */
export const ROUTE_TO_MODULE: Record<string, PortalModuleId> = {
  "/dashboard": "dashboard",
  "/supervision": "supervision",
  "/estadisticas": "estadisticas",
  "/visor": "visor",
};

export const MODULE_ROUTES: Record<PortalModuleId, string> = {
  dashboard: "/dashboard",
  supervision: "/supervision",
  estadisticas: "/estadisticas",
  visor: "/visor",
};

/** Permiso / rol gate (mirrors BottomNav). */
export const MODULE_ACCESS: Record<
  PortalModuleId,
  { roles: string[]; permisoKey?: string }
> = {
  dashboard: { roles: ["superadmin", "admin", "supervisor", "directorio"], permisoKey: "menu_dashboard" },
  supervision: { roles: ["superadmin", "admin", "supervisor", "directorio"], permisoKey: "menu_supervision" },
  estadisticas: { roles: ["superadmin", "admin", "supervisor", "directorio", "evaluador"] },
  visor: {
    roles: ["superadmin", "admin", "supervisor", "evaluador", "directorio"],
    permisoKey: "action_evaluar_exhibiciones",
  },
};

export function resolveModuleFromPath(pathname: string): PortalModuleId | null {
  for (const [route, mod] of Object.entries(ROUTE_TO_MODULE)) {
    if (pathname === route || pathname.startsWith(`${route}/`)) return mod;
  }
  return null;
}

export function canAccessModule(
  mod: PortalModuleId,
  rol: string,
  hasPermiso: (key: string) => boolean,
): boolean {
  const cfg = MODULE_ACCESS[mod];
  const roleOk = cfg.roles.includes(rol);
  if (!cfg.permisoKey) return roleOk;
  const permOk = hasPermiso(cfg.permisoKey);
  if (!roleOk && !permOk) return false;
  return permOk;
}
