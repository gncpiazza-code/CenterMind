export type LensStrategy = "canvas" | "webgl" | "none";

function hasBackdropFilter(): boolean {
  if (typeof CSS === "undefined" || typeof CSS.supports !== "function") return false;
  return (
    CSS.supports("backdrop-filter", "blur(1px)") ||
    CSS.supports("-webkit-backdrop-filter", "blur(1px)")
  );
}

function isSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Safari/i.test(ua) && !/Chrom(e|ium)|CriOS|FxiOS|Edg|OPR/i.test(ua);
}

/**
 * Pick the best lens strategy for the current browser.
 *
 * - canvas: Chromium, Firefox, Edge — canvas 2D + SVG filter en capa aparte (H1/H6 fix).
 * - none:   Safari / sin backdrop-filter — solo blur + vibrancy.
 *
 * WebGL deshabilitado: WebKit expone WebGL2 con shaders ES 1.0 y rompe shaderSource.
 */
export function pickLensStrategy(): LensStrategy {
  if (typeof window === "undefined") return "none";
  if (!hasBackdropFilter()) return "none";
  if (isSafari()) return "none";
  return "canvas";
}
