"use client";

import { cn } from "@/lib/utils";
import type { GlyphMode } from "./visor-glass-luminance";

type VibrancyProps = {
  mode?: GlyphMode;
  className?: string;
  children: React.ReactNode;
};

/**
 * Luminance-adaptive icon wrapper.
 * "dark" backdrop (shelf photos) → light icon + dark shadow for definition.
 * "light" backdrop              → dark icon + light shadow.
 *
 * Dual-shadow technique ensures legibility on ANY backdrop without canvas sampling.
 */
export function GlassIcon({ mode = "dark", className, children }: VibrancyProps) {
  return (
    <span
      className={cn("flex items-center justify-center", className)}
      style={
        mode === "dark"
          ? {
              color: "rgba(255,255,255,0.90)",
              filter:
                "drop-shadow(0 1px 2px rgba(0,0,0,0.75)) drop-shadow(0 0 4px rgba(0,0,0,0.35))",
            }
          : {
              color: "rgba(15,23,42,0.88)",
              filter:
                "drop-shadow(0 1px 0 rgba(255,255,255,0.65)) drop-shadow(0 0 4px rgba(255,255,255,0.25))",
            }
      }
    >
      {children}
    </span>
  );
}

/**
 * Luminance-adaptive text label.
 * Uses text-shadow in both modes for definition.
 */
export function GlassLabel({ mode = "dark", className, children }: VibrancyProps) {
  return (
    <span
      className={cn("", className)}
      style={
        mode === "dark"
          ? {
              color: "rgba(255,255,255,0.90)",
              textShadow:
                "0 1px 2px rgba(0,0,0,0.80), 0 0 6px rgba(0,0,0,0.35)",
            }
          : {
              color: "rgba(15,23,42,0.88)",
              textShadow:
                "0 1px 0 rgba(255,255,255,0.70), 0 0 6px rgba(255,255,255,0.25)",
            }
      }
    >
      {children}
    </span>
  );
}
