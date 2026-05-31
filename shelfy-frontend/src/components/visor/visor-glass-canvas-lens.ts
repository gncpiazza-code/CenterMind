/**
 * 2D canvas lens for Chromium.
 * Samples the image region behind the pill and draws it to a canvas.
 * The CSS filter url(#shelfy-glass-lens) is applied on the CANVAS element
 * (not on the backdrop-filter layer), fixing H1/H6: no niebla blanca.
 */
export function updateCanvasLens(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  pillRect: DOMRect,
  imgDisplayRect: DOMRect,
): void {
  if (!img.complete || img.naturalWidth === 0) return;

  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.ceil(pillRect.width * dpr));
  const h = Math.max(1, Math.ceil(pillRect.height * dpr));

  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${pillRect.width}px`;
    canvas.style.height = `${pillRect.height}px`;
  }

  try {
    const scaleX = img.naturalWidth / Math.max(1, imgDisplayRect.width);
    const scaleY = img.naturalHeight / Math.max(1, imgDisplayRect.height);
    const sx = Math.max(0, (pillRect.left - imgDisplayRect.left) * scaleX);
    const sy = Math.max(0, (pillRect.top - imgDisplayRect.top) * scaleY);
    const sw = Math.max(1, pillRect.width * scaleX);
    const sh = Math.max(1, pillRect.height * scaleY);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  } catch {
    // CORS tainted — silently fall back to empty canvas (no lens)
  }
}
