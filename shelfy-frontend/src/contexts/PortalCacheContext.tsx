"use client";

import { createContext, useContext } from "react";
import type { PortalModuleId } from "@/lib/portal-cache-config";

type PortalCacheContextValue = {
  prefetchModule: (mod: PortalModuleId) => void;
  prefetchRoute: (href: string) => void;
};

const noop = () => {};

const defaultValue: PortalCacheContextValue = {
  prefetchModule: noop,
  prefetchRoute: noop,
};

export const PortalCacheContext = createContext<PortalCacheContextValue>(defaultValue);

export function usePortalCache(): PortalCacheContextValue {
  return useContext(PortalCacheContext);
}
