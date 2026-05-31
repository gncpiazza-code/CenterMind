import { detectWebGLSupport } from "./visor-glass-webgl";

export type LensStrategy = "canvas" | "webgl" | "none";

function hasBackdropFilter(): boolean {
  if (typeof CSS === "undefined" || typeof CSS.supports !== "function") return false;
  return (
    CSS.supports("backdrop-filter", "blur(1px)") ||
    CSS.supports("-webkit-backdrop-filter", "blur(1px)")
  );
}

/**
 * Pick the best lens strategy for the current browser.
 *
 * - canvas:  Chromium — 2D canvas on a separate layer, no filter on backdrop node (H1/H6 fix).
 * - webgl:   Firefox with WebGL — fragment shader displacement.
 * - none:    Safari / fallback — Clear backdrop + vibrancy handle legibility.
 */
export function pickLensStrategy(): LensStrategy {
  if (typeof window === "undefined") return "none";
  if (!hasBackdropFilter()) return "none";

  if ("chrome" in window || /\bChrome\/\d/.test(navigator.userAgent)) {
    return "canvas";
  }

  if (detectWebGLSupport()) return "webgl";

  return "none";
}
