"use client";

import { cn } from "@/lib/utils";
import { VisorGlassMaterial } from "./VisorGlassMaterial";

/** Kept for reference / bench tooling. */
export const APPLE_GLASS = {
  blur: "10px",
  radius: 40,
  radiusCompact: 32,
} as const;

/**
 * Vibrancy tokens — light icons on dark backdrop (shelf photos are dark).
 * Pass mode="light" to GlassIcon/GlassLabel for light-background regions.
 */
export const GLASS_TEXT_PRIMARY = "text-[rgba(255,255,255,0.90)]";
export const GLASS_TEXT_SECONDARY = "text-[rgba(255,255,255,0.55)]";

export const WATER_GLASS_ICON_BTN = cn(
  "size-9 shrink-0 flex items-center justify-center",
  "text-[rgba(255,255,255,0.90)]",
  "[filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.75))_drop-shadow(0_0_4px_rgba(0,0,0,0.3))]",
  "bg-transparent border-0 shadow-none font-medium",
  "transition-[transform,opacity] duration-200 ease-out",
  "hover:opacity-65 active:scale-[0.94]",
  "disabled:opacity-[0.35] disabled:pointer-events-none disabled:active:scale-100",
);

export const WATER_GLASS_DIVIDER =
  "w-px h-6 shrink-0 bg-[rgba(255,255,255,0.22)]";

export const WATER_GLASS_COUNTER = cn(
  "text-[10px] font-mono font-semibold tabular-nums tracking-tight",
  "text-[rgba(255,255,255,0.90)]",
  "[text-shadow:0_1px_2px_rgba(0,0,0,0.8),0_0_6px_rgba(0,0,0,0.3)]",
);

export const waterGlassDotClass = (active: boolean) =>
  cn(
    "rounded-full transition-all duration-200",
    active
      ? "w-5 h-2 bg-[rgba(255,255,255,0.85)] shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
      : "size-2 bg-[rgba(255,255,255,0.35)] hover:bg-[rgba(255,255,255,0.55)]",
  );

type ShellProps = {
  children: React.ReactNode;
  className?: string;
  compact?: boolean;
};

/**
 * Liquid Glass Clear pill — delegates to VisorGlassMaterial.
 * Kept as a thin wrapper so all existing imports continue to work.
 */
export function VisorWaterGlass({ children, className, compact }: ShellProps) {
  return (
    <VisorGlassMaterial variant="clear" compact={compact} className={className}>
      {children}
    </VisorGlassMaterial>
  );
}
