/**
 * WebGL lens — RETIRADO (2026-05-31).
 * Stub seguro: bundles viejos que aún instancian VisorGlassWebGLLens no deben tocar WebGL.
 * Lente activa: canvas 2D en VisorGlassLensLayer + pickLensStrategy() → "canvas".
 */

export type LensStrategy = "svg" | "webgl" | "none";

export function detectWebGLSupport(): boolean {
  return false;
}

/** @deprecated Use pickLensStrategy() from visor-glass-lens-strategy.ts */
export function canUseLensStrategy(): LensStrategy {
  return "none";
}

/** @deprecated Canvas-only lens; constructor no-op para HMR/bundles antiguos. */
export class VisorGlassWebGLLens {
  readonly canvas: HTMLCanvasElement;
  readonly ready = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  setImg(_img: HTMLImageElement) {}
  setLensScale(_scale: number) {}
  setRects(_imgRect: DOMRect, _pillRect: DOMRect) {}
  render() {}
  destroy() {}
}
