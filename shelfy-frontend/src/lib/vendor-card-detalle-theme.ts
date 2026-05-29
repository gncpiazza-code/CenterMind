import {
  scoreToTier,
  VENDOR_CARD_PANEL_OLIVE,
  VENDOR_CARD_TIER_THEME,
  type VendorCardTierTheme,
} from '@/lib/vendor-card-tier';

/** Acentos FIFA para modal de detalle (sin morado Shelfy) */
export const ESTADISTICAS_FIFA = {
  accent: '#c6a600',
  accentBright: '#f5d020',
  accentDark: '#9a7b0a',
  panel: VENDOR_CARD_PANEL_OLIVE,
  panelBg: 'rgba(93,84,38,0.06)',
  panelBgHover: 'rgba(93,84,38,0.1)',
  panelBorder: 'rgba(93,84,38,0.2)',
  panelBorderLight: 'rgba(93,84,38,0.12)',
  footerBg: 'linear-gradient(180deg, #fffef8 0%, #f8e8b0 100%)',
  idealBannerBg: 'rgba(255,235,59,0.12)',
  idealBannerBorder: 'rgba(198,166,0,0.28)',
  backdrop: 'rgba(26,18,8,0.58)',
  shadow: '0 24px 64px rgba(154,123,10,0.28), 0 4px 16px rgba(0,0,0,0.12)',
  textOnLight: '#1a1208',
  overlayDist: VENDOR_CARD_PANEL_OLIVE,
  overlayAmbos: '#c6a600',
} as const;

export function detalleThemeForScore(score: number): VendorCardTierTheme {
  return VENDOR_CARD_TIER_THEME[scoreToTier(score)];
}
