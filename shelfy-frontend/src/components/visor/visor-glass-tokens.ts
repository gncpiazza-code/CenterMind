export type GlassVariant = "clear" | "regular";

export interface GlassTokenSet {
  blur: string;
  saturate: number;
  brightness: number;
  /** Near-zero for Clear; slight white for Regular */
  tint: string;
  /** Opacity of the outer rim ring (0–1) */
  rimOpacity: number;
  /** Opacity of the top-edge hairline highlight (0–1) */
  rimTopOpacity: number;
  /** Exterior drop-shadow as box-shadow value string */
  shadow: string;
  /** SVG feDisplacementMap scale in px (0 = lens disabled) */
  lensScale: number;
  /** Lens enabled by default for this variant */
  enableLens: boolean;
  radius: number;
  radiusCompact: number;
}

export const GLASS_TOKENS = {
  clear: {
    blur: "10px",
    saturate: 1.2,
    brightness: 1.08,
    tint: "rgba(255,255,255,0.015)",
    rimOpacity: 0.26,
    rimTopOpacity: 0.44,
    shadow: "0 6px 20px rgba(15,23,42,0.09), 0 2px 6px rgba(15,23,42,0.06)",
    lensScale: 5,
    enableLens: true,
    radius: 40,
    radiusCompact: 32,
  },
  regular: {
    blur: "18px",
    saturate: 1.35,
    brightness: 1.02,
    tint: "rgba(255,255,255,0.09)",
    rimOpacity: 0.20,
    rimTopOpacity: 0.32,
    shadow: "0 8px 32px rgba(15,23,42,0.14), 0 2px 8px rgba(15,23,42,0.08)",
    lensScale: 0,
    enableLens: false,
    radius: 40,
    radiusCompact: 28,
  },
} as const satisfies Record<GlassVariant, GlassTokenSet>;
