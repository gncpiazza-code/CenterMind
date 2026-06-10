"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "shelfy-topbar-brand-dev";

/** Tamaños finales topbar desktop (ajustados en dev Brand panel). */
export const TOPBAR_BRAND_DEFAULTS = {
  iconPx: 42,
  wordmarkPx: 29,
  gapPx: 17,
} as const;

export type TopbarBrandSizes = typeof TOPBAR_BRAND_DEFAULTS;

function readStored(): TopbarBrandSizes {
  if (typeof window === "undefined") return { ...TOPBAR_BRAND_DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...TOPBAR_BRAND_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<TopbarBrandSizes>;
    return {
      iconPx: clamp(parsed.iconPx ?? TOPBAR_BRAND_DEFAULTS.iconPx, 20, 64),
      wordmarkPx: clamp(parsed.wordmarkPx ?? TOPBAR_BRAND_DEFAULTS.wordmarkPx, 12, 48),
      gapPx: clamp(parsed.gapPx ?? TOPBAR_BRAND_DEFAULTS.gapPx, 0, 32),
    };
  } catch {
    return { ...TOPBAR_BRAND_DEFAULTS };
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function useTopbarBrandSizes() {
  const [sizes, setSizes] = useState<TopbarBrandSizes>(TOPBAR_BRAND_DEFAULTS);

  useEffect(() => {
    setSizes(readStored());
  }, []);

  const persist = useCallback((next: TopbarBrandSizes) => {
    setSizes(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const update = useCallback(
    (patch: Partial<TopbarBrandSizes>) => {
      persist({
        iconPx: clamp(patch.iconPx ?? sizes.iconPx, 20, 64),
        wordmarkPx: clamp(patch.wordmarkPx ?? sizes.wordmarkPx, 12, 48),
        gapPx: clamp(patch.gapPx ?? sizes.gapPx, 0, 32),
      });
    },
    [persist, sizes],
  );

  const reset = useCallback(() => {
    persist({ ...TOPBAR_BRAND_DEFAULTS });
  }, [persist]);

  return { sizes, update, reset };
}
