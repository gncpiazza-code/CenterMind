"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  canAccessModule,
  ORCHESTRATOR_IDLE_STAGGER_MS,
  resolveModuleFromPath,
  BACKGROUND_MODULE_ORDER,
  ROUTE_PREFETCH_ORDER,
  type PortalModuleId,
} from "@/lib/portal-cache-config";
import {
  moduleBundleQueryOptions,
  prefetchPortalModule,
  warmPortalBundlesOnce,
} from "@/lib/portal-cache-queries";
import { scheduleWhenIdle, shouldThrottlePrefetch } from "@/lib/portal-idle-scheduler";
import { prefetchPortalRouteChunk } from "@/lib/portal-route-prefetch";

/**
 * Orquestador T0/T1/T2/T3:
 * - T0: bundle del módulo activo — inmediato, skip si fresco (en cada navegación)
 * - T1: route-chunk prefetch vía router.prefetch en idle (dedup por Set en closure)
 * - T2: bundles API de módulos restantes en idle con stagger 400ms
 * - T3: warm backend tras T2, idle (1x por sesión/dist)
 * Guard red: si shouldThrottlePrefetch() → solo T0; skip T1/T2/T3
 */
export function usePortalCacheOrchestrator(): {
  prefetchModule: (mod: PortalModuleId) => void;
  prefetchRoute: (href: string) => void;
} {
  const { user, effectiveDistribuidorId, hasPermiso } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const backgroundDoneRef = useRef<string>("");
  const inflightRef = useRef<Set<string>>(new Set());

  const distId = effectiveDistribuidorId ?? 0;
  const rol = user?.rol ?? "";

  const allowedModules = useMemo(
    () =>
      (BACKGROUND_MODULE_ORDER as unknown as PortalModuleId[]).filter((m) =>
        canAccessModule(m, rol, hasPermiso),
      ),
    [rol, hasPermiso],
  );
  const allowedKey = allowedModules.join(",");

  const prefetchModule = useCallback(
    (mod: PortalModuleId) => {
      if (!distId || !allowedModules.includes(mod)) return;
      const opts = moduleBundleQueryOptions(mod, distId);
      if (!opts) return;
      const dedupeKey = (opts.queryKey as unknown[]).join("|");
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

  // T0 — bundle del módulo activo, inmediato, en cada cambio de ruta
  useEffect(() => {
    if (!user || distId <= 0) return;
    const mod = resolveModuleFromPath(pathname);
    if (!mod || !allowedModules.includes(mod)) return;
    void prefetchPortalModule(queryClient, mod, distId);
  }, [pathname, user, distId, allowedKey, queryClient, allowedModules]);

  // T1/T2/T3 — background once per dist+user
  useEffect(() => {
    if (!user || distId <= 0) return;
    const sessionKey = `${distId}:${user.usuario}:${allowedKey}`;
    if (backgroundDoneRef.current === sessionKey) return;
    backgroundDoneRef.current = sessionKey;

    const throttle = shouldThrottlePrefetch();

    // T1 — prefetch route chunks vía router.prefetch (siempre, incluso en red lenta)
    scheduleWhenIdle(() => {
      for (const href of ROUTE_PREFETCH_ORDER) {
        const mod = resolveModuleFromPath(href) as PortalModuleId | null;
        if (!mod || !allowedModules.includes(mod)) continue;
        prefetchPortalRouteChunk(router, href);
      }
    });

    // T2/T3 se saltan en redes lentas o saveData
    if (throttle) return;

    const currentMod = resolveModuleFromPath(pathname);
    const backgroundMods = allowedModules.filter((m) => m !== currentMod);
    const cleanups: Array<() => void> = [];

    // T2 — bundles API con stagger idle
    backgroundMods.forEach((mod, i) => {
      const delay = ORCHESTRATOR_IDLE_STAGGER_MS * (i + 1);
      const id = window.setTimeout(() => {
        scheduleWhenIdle(() => {
          void prefetchPortalModule(queryClient, mod, distId);
        });
      }, delay);
      cleanups.push(() => window.clearTimeout(id));
    });

    // T3 — warm backend tras T2 completo
    const t3Delay = ORCHESTRATOR_IDLE_STAGGER_MS * (backgroundMods.length + 2);
    const t3Id = window.setTimeout(() => {
      scheduleWhenIdle(() => {
        warmPortalBundlesOnce(distId);
      });
    }, t3Delay);
    cleanups.push(() => window.clearTimeout(t3Id));

    return () => {
      cleanups.forEach((c) => c());
    };
  }, [user, distId, allowedKey, pathname, allowedModules, queryClient, router]);

  return { prefetchModule, prefetchRoute };
}
