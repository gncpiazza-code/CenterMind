"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  canAccessModule,
  ORCHESTRATOR_IDLE_STAGGER_MS,
  resolveModuleFromPath,
  type PortalModuleId,
} from "@/lib/portal-cache-config";
import {
  moduleBundleQueryOptions,
  prefetchPortalModule,
  prefetchPortalModuleIdle,
  warmPortalBundlesOnce,
} from "@/lib/portal-cache-queries";

const ALL_MODULES: PortalModuleId[] = [
  "dashboard",
  "supervision",
  "estadisticas",
  "visor",
];

function scheduleIdle(fn: () => void, delayMs: number): () => void {
  if (typeof window === "undefined") return () => {};
  const id = window.setTimeout(fn, delayMs);
  return () => window.clearTimeout(id);
}

/**
 * Orquestador T0/T1/T2:
 * - T1: módulo de la ruta actual (cada navegación)
 * - T2: resto de módulos P0 una vez por sesión/dist (idle stagger)
 * - warm backend una vez por sesión/dist
 */
export function usePortalCacheOrchestrator(): {
  prefetchModule: (mod: PortalModuleId) => void;
  prefetchRoute: (href: string) => void;
} {
  const { user, effectiveDistribuidorId, hasPermiso } = useAuth();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const backgroundDoneRef = useRef<string>("");
  const inflightRef = useRef<Set<string>>(new Set());

  const distId = effectiveDistribuidorId ?? 0;
  const rol = user?.rol ?? "";

  const allowedModules = useMemo(
    () => ALL_MODULES.filter((m) => canAccessModule(m, rol, hasPermiso)),
    [rol, hasPermiso],
  );
  const allowedKey = allowedModules.join(",");

  const prefetchModule = useCallback(
    (mod: PortalModuleId) => {
      if (!distId || !allowedModules.includes(mod)) return;
      const opts = moduleBundleQueryOptions(mod, distId);
      if (!opts) return;
      const dedupeKey = opts.queryKey.join("|");
      if (inflightRef.current.has(dedupeKey)) return;
      inflightRef.current.add(dedupeKey);
      void prefetchPortalModule(queryClient, mod, distId).finally(() => {
        inflightRef.current.delete(dedupeKey);
      });
    },
    [allowedModules, distId, queryClient],
  );

  const prefetchRoute = useCallback(
    (href: string) => {
      const mod = resolveModuleFromPath(href.split("?")[0]);
      if (mod) prefetchModule(mod);
    },
    [prefetchModule],
  );

  // T1 — módulo activo en cada cambio de ruta
  useEffect(() => {
    if (!user || distId <= 0) return;
    const mod = resolveModuleFromPath(pathname);
    if (mod && allowedModules.includes(mod)) {
      void prefetchPortalModule(queryClient, mod, distId);
    }
  }, [pathname, user, distId, allowedKey, queryClient, allowedModules]);

  // T2 — background once per dist+user
  useEffect(() => {
    if (!user || distId <= 0) return;
    const sessionKey = `${distId}:${user.usuario}:${allowedKey}`;
    if (backgroundDoneRef.current === sessionKey) return;
    backgroundDoneRef.current = sessionKey;

    warmPortalBundlesOnce(distId);

    const currentMod = resolveModuleFromPath(pathname);
    const background = allowedModules.filter((m) => m !== currentMod);
    const cleanups: Array<() => void> = [];

    background.forEach((mod, i) => {
      const cancel = scheduleIdle(() => {
        prefetchPortalModuleIdle(queryClient, mod, distId);
      }, ORCHESTRATOR_IDLE_STAGGER_MS * (i + 1));
      cleanups.push(cancel);
    });

    return () => {
      cleanups.forEach((c) => c());
    };
  }, [user, distId, allowedKey, pathname, allowedModules, queryClient]);

  return { prefetchModule, prefetchRoute };
}
