/** Tiers FIFA UT — cartas Estadísticas (diseño final aprobado). */

export type VendorCardTier = "bronze" | "silver" | "gold";

/** Bronce 0–65 · Plata 66–74 · Oro 75–100 */
export function scoreToTier(score: number): VendorCardTier {
  if (score >= 75) return "gold";
  if (score >= 66) return "silver";
  return "bronze";
}

export interface VendorCardTierTheme {
  label: string;
  /** Gradiente diagonal de la cara */
  faceGradient: string;
  radarPanel: string;
  statPill: string;
  statValue: string;
  statLabel: string;
  text: string;
  distBadgeBg: string;
  distBadgeText: string;
  nameBar: string;
  glow: string;
  shadow: string;
}

/** Panel oliva del diseño Figma (radar + stats + badge) */
export const VENDOR_CARD_PANEL_OLIVE = "#5D5426";

export const VENDOR_CARD_TIER_THEME: Record<VendorCardTier, VendorCardTierTheme> = {
  gold: {
    label: "Oro",
    faceGradient:
      "linear-gradient(145deg, #ffeb3b 0%, #f5d020 32%, #d4a017 58%, #c6a600 100%)",
    radarPanel: VENDOR_CARD_PANEL_OLIVE,
    statPill: VENDOR_CARD_PANEL_OLIVE,
    statValue: "#ffffff",
    statLabel: "#ffffff",
    text: "#1a1208",
    distBadgeBg: VENDOR_CARD_PANEL_OLIVE,
    distBadgeText: "#ffffff",
    nameBar: "linear-gradient(180deg, #fffef8 0%, #f8e8b0 100%)",
    glow: "rgba(255,235,59,0.5)",
    shadow: "0 16px 40px rgba(154,123,10,0.42), 0 4px 12px rgba(0,0,0,0.15)",
  },
  silver: {
    label: "Plata",
    faceGradient:
      "linear-gradient(145deg, #f8fafc 0%, #cbd5e1 32%, #94a3b8 62%, #475569 100%)",
    radarPanel: "#4a5568",
    statPill: "#4a5568",
    statValue: "#ffffff",
    statLabel: "rgba(255,255,255,0.92)",
    text: "#0f172a",
    distBadgeBg: "#4a5568",
    distBadgeText: "#f8fafc",
    nameBar: "linear-gradient(180deg, #ffffff 0%, #e2e8f0 100%)",
    glow: "rgba(203,213,225,0.55)",
    shadow: "0 16px 40px rgba(71,85,105,0.38), 0 4px 12px rgba(0,0,0,0.14)",
  },
  bronze: {
    label: "Bronce",
    faceGradient:
      "linear-gradient(145deg, #e8b87a 0%, #c67d3a 35%, #8b5a2b 65%, #5c3818 100%)",
    radarPanel: "#5c3818",
    statPill: "#5c3818",
    statValue: "#ffffff",
    statLabel: "rgba(255,255,255,0.92)",
    text: "#1a0f08",
    distBadgeBg: "#5c3818",
    distBadgeText: "#fde8c8",
    nameBar: "linear-gradient(180deg, #fff8f0 0%, #e8c9a0 100%)",
    glow: "rgba(205,127,50,0.45)",
    shadow: "0 16px 40px rgba(92,53,24,0.4), 0 4px 12px rgba(0,0,0,0.15)",
  },
};

/** Altura carta + botón externo (Figma) */
export const VENDOR_CARD_TOTAL_H = 448;
export const VENDOR_CARD_FACE_H = 400;
export const VENDOR_CARD_W = 260;
export const VENDOR_CARD_RADAR_H = 162;
