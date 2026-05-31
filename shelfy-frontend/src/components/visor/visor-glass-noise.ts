/** Subtle noise texture — used only in highlight layer at ≤0.8% opacity. */
export const VISOR_GLASS_NOISE_BG = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180">
    <filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="4" stitchTiles="stitch"/></filter>
    <rect width="100%" height="100%" filter="url(#n)" opacity="0.008"/>
  </svg>`,
)}")`;
