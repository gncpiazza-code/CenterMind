"use client";

import { useBundlePrefetch } from "@/hooks/useBundlePrefetch";

/** Activa prefetch/warm global de bundles portal post-auth. */
export function BundlePrefetchProvider({ children }: { children: React.ReactNode }) {
  useBundlePrefetch();
  return <>{children}</>;
}
