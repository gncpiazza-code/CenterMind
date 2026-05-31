/**
 * WebGL lens — fallback for browsers where SVG backdrop lens is unavailable.
 * Currently provides feature detection only; full shader not yet implemented.
 * Used by VisorGlassMaterial to choose lens strategy.
 */

export type LensStrategy = "svg" | "webgl" | "none";

export function detectWebGLSupport(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return !!(
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      (canvas.getContext as (ctx: string) => RenderingContext | null)(
        "experimental-webgl",
      )
    );
  } catch {
    return false;
  }
}

/**
 * Decide which lens strategy to use in the current browser.
 * - "svg"   → Chromium: filter+backdrop-filter on same element works
 * - "webgl" → Firefox with WebGL (shader-based displacement — future impl)
 * - "none"  → Safari / no-WebGL Firefox (Clear without lens; same legibility)
 */
export function canUseLensStrategy(): LensStrategy {
  if (typeof window === "undefined") return "none";

  const hasBackdropFilter =
    typeof CSS !== "undefined" &&
    (CSS.supports("backdrop-filter", "blur(1px)") ||
      CSS.supports("-webkit-backdrop-filter", "blur(1px)"));

  if (!hasBackdropFilter) return "none";

  // Chromium: SVG lens coexists reliably with backdrop-filter
  if ("chrome" in window || /\bChrome\/\d/.test(navigator.userAgent)) {
    return "svg";
  }

  // Firefox: prefer WebGL when available (SVG filter+backdrop-filter combo is buggy)
  if (detectWebGLSupport()) return "webgl";

  return "none";
}
