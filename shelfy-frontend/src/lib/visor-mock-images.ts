/** Data-URLs embebidas — escenas con detalle para probar glass y zoom (sin fondo plano). */

export const VISOR_MOCK_INTRINSIC = {
  portrait: { w: 900, h: 1600 },
  landscape: { w: 1920, h: 1080 },
  square: { w: 1200, h: 1200 },
  panorama: { w: 2400, h: 800 },
} as const;

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`;
}

/**
 * Estantería / góndola simulada con productos de colores variados.
 * - lightFloor: usa piso más claro (CBD5E1) para probar vibrancy en fondo claro
 * - safeBand: gradiente blanco al fondo donde vive la píldora, para probar ambos modos
 */
function shelfScene(
  width: number,
  height: number,
  label: string,
  opts: { lightFloor?: boolean; safeBand?: boolean } = {},
): string {
  const { lightFloor = false, safeBand = true } = opts;
  const shelves = 5;
  const shelfH = Math.floor(height / (shelves + 1.2));
  const floorColor0 = lightFloor ? "#cbd5e1" : "#475569";
  const floorColor1 = lightFloor ? "#94a3b8" : "#334155";

  let products = "";
  for (let row = 0; row < shelves; row++) {
    const y = 80 + row * shelfH;
    products += `<rect x="24" y="${y + shelfH - 12}" width="${width - 48}" height="10" fill="#64748b" opacity="0.55"/>`;
    for (let col = 0; col < 14; col++) {
      const px = 36 + col * ((width - 72) / 14);
      const pw = 28 + (col % 3) * 6;
      const ph = 48 + (row % 3) * 22;
      const hue = (col * 47 + row * 83) % 360;
      products += `<rect x="${px}" y="${y + shelfH - ph - 14}" width="${pw}" height="${ph}" rx="4" fill="hsl(${hue} 62% 48%)"/>`;
      products += `<rect x="${px + 4}" y="${y + shelfH - ph - 8}" width="${pw - 8}" height="8" fill="white" opacity="0.35"/>`;
    }
  }

  const safeBandEl = safeBand
    ? `<rect y="${height - 200}" width="${width}" height="200" fill="url(#safeband)"/>`
    : "";

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f8fafc"/>
      <stop offset="45%" stop-color="#e2e8f0"/>
      <stop offset="100%" stop-color="#cbd5e1"/>
    </linearGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${floorColor0}"/>
      <stop offset="100%" stop-color="${floorColor1}"/>
    </linearGradient>
    <radialGradient id="spot" cx="50%" cy="12%" r="65%">
      <stop offset="0%" stop-color="#fff" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="safeband" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(255,255,255,0)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0.32)"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#wall)"/>
  <rect y="${height - 120}" width="${width}" height="120" fill="url(#floor)"/>
  <rect width="${width}" height="${height}" fill="url(#spot)"/>
  ${products}
  ${safeBandEl}
  <rect x="18" y="28" width="${width - 36}" height="56" rx="8" fill="rgba(15,23,42,0.72)"/>
  <text x="${width / 2}" y="64" text-anchor="middle" fill="#f8fafc" font-family="system-ui,sans-serif" font-size="${Math.min(36, width / 22)}" font-weight="700">${label}</text>
</svg>`;
}

// ── Standard mocks ────────────────────────────────────────────────────────────

export const VISOR_MOCK_PORTRAIT = svgDataUrl(
  shelfScene(900, 1600, "Exhibición vertical"),
);

export const VISOR_MOCK_LANDSCAPE = svgDataUrl(
  shelfScene(1920, 1080, "Exhibición horizontal"),
);

export const VISOR_MOCK_SQUARE = svgDataUrl(
  shelfScene(1200, 1200, "Exhibición cuadrada"),
);

export const VISOR_MOCK_PANORAMA = svgDataUrl(
  shelfScene(2400, 800, "Exhibición panorámica"),
);

export const VISOR_MOCK_DRIVE_LINKS = [
  VISOR_MOCK_PORTRAIT,
  VISOR_MOCK_LANDSCAPE,
  VISOR_MOCK_SQUARE,
  VISOR_MOCK_PANORAMA,
] as const;

// ── Bench-specific mocks (6 backgrounds for glass testing) ────────────────────

/** Dark shelf — pill should use light icons (default mode) */
export const BENCH_MOCK_DARK = svgDataUrl(
  shelfScene(1200, 800, "Dark — iconos claros", { lightFloor: false, safeBand: false }),
);

/** Light shelf — pill should switch to dark icons via luminance */
export const BENCH_MOCK_LIGHT = svgDataUrl(
  shelfScene(1200, 800, "Light — iconos oscuros", { lightFloor: true, safeBand: false }),
);

/** Standard shelf with safe band at bottom */
export const BENCH_MOCK_SHELF = svgDataUrl(
  shelfScene(1200, 800, "Estantería con safe-band", { lightFloor: false, safeBand: true }),
);

function benchGradient(
  id: string,
  colors: string[],
  label: string,
  w = 1200,
  h = 800,
): string {
  const stops = colors
    .map(
      (c, i) =>
        `<stop offset="${Math.round((i / (colors.length - 1)) * 100)}%" stop-color="${c}"/>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#${id})"/>
    <text x="${w / 2}" y="${h / 2}" text-anchor="middle" dominant-baseline="middle"
      fill="rgba(255,255,255,0.15)" font-family="system-ui" font-size="60" font-weight="900"
      letter-spacing="4">${label}</text>
  </svg>`;
}

/** Dark→mid gradient */
export const BENCH_MOCK_GRADIENT_DARK = svgDataUrl(
  benchGradient("gd", ["#0f172a", "#1e293b", "#334155"], "DARK"),
);

/** Light→white gradient */
export const BENCH_MOCK_GRADIENT_LIGHT = svgDataUrl(
  benchGradient("gl", ["#f8fafc", "#e2e8f0", "#cbd5e1"], "LIGHT"),
);

/** Checker — hardest backdrop for any material */
function checkerSvg(w = 1200, h = 800, tile = 40): string {
  const cols = Math.ceil(w / tile);
  const rows = Math.ceil(h / tile);
  let rects = "";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if ((r + c) % 2 === 0) {
        rects += `<rect x="${c * tile}" y="${r * tile}" width="${tile}" height="${tile}" fill="#e2e8f0"/>`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="#334155"/>
    ${rects}
  </svg>`;
}

export const BENCH_MOCK_CHECKER = svgDataUrl(checkerSvg());

export const BENCH_MOCKS = [
  { label: "Estantería estándar", src: BENCH_MOCK_SHELF },
  { label: "Fondo oscuro", src: BENCH_MOCK_DARK },
  { label: "Fondo claro", src: BENCH_MOCK_LIGHT },
  { label: "Gradiente oscuro", src: BENCH_MOCK_GRADIENT_DARK },
  { label: "Gradiente claro", src: BENCH_MOCK_GRADIENT_LIGHT },
  { label: "Tablero ajedrez", src: BENCH_MOCK_CHECKER },
] as const;
