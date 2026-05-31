export type GlyphMode = "light" | "dark";

/**
 * Sample the average luminance of the image region behind the pill.
 * @param img      - The <img> element rendered by FotoViewer
 * @param pillRect - Bounding rect of the glass pill (viewport coords)
 * @param imgDisplayRect - Bounding rect of the <img> element in viewport (after zoom/pan CSS)
 * @returns 0–1 (0 = black, 1 = white). Falls back to 0.2 on CORS / missing data.
 */
export function sampleBackdropLuma(
  img: HTMLImageElement | null,
  pillRect: DOMRect,
  imgDisplayRect: DOMRect,
): number {
  if (!img || !img.complete || img.naturalWidth === 0) return 0.2;
  try {
    const scaleX = img.naturalWidth / Math.max(1, imgDisplayRect.width);
    const scaleY = img.naturalHeight / Math.max(1, imgDisplayRect.height);

    const sx = Math.max(0, (pillRect.left - imgDisplayRect.left) * scaleX);
    const sy = Math.max(0, (pillRect.top - imgDisplayRect.top) * scaleY);
    const sw = Math.max(1, pillRect.width * scaleX);
    const sh = Math.max(1, pillRect.height * scaleY);

    const SIDE = 28;
    const canvas = document.createElement("canvas");
    canvas.width = SIDE;
    canvas.height = SIDE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return 0.2;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, SIDE, SIDE);
    const { data } = ctx.getImageData(0, 0, SIDE, SIDE);

    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
    }
    return sum / (SIDE * SIDE);
  } catch {
    return 0.2;
  }
}

/**
 * "light" = light backdrop → dark icons.
 * "dark"  = dark backdrop  → light icons.
 */
export function glyphMode(luma: number): GlyphMode {
  return luma > 0.55 ? "light" : "dark";
}
