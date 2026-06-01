"use client";

import { usePortalCacheOrchestrator } from "@/hooks/usePortalCacheOrchestrator";
import { PortalCacheContext } from "@/contexts/PortalCacheContext";

/** Activa orquestador global de bundles portal post-auth. */
export function PortalCacheProvider({ children }: { children: React.ReactNode }) {
  const { prefetchModule, prefetchRoute } = usePortalCacheOrchestrator();

  return (
    <PortalCacheContext.Provider value={{ prefetchModule, prefetchRoute }}>
      {children}
    </PortalCacheContext.Provider>
  );
}
