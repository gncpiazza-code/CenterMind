"use client";

import { useEffect, useRef, useCallback } from "react";
import { LENS_FILTER_ID, injectLensSvgDefs } from "./visor-glass-lens.svg";
import { pickLensStrategy, type LensStrategy } from "./visor-glass-lens-strategy";
import { updateCanvasLens } from "./visor-glass-canvas-lens";
import { useVisorGlassTune } from "./visor-glass-tune";

/** Cambia si el bundle cargó esta versión (sin WebGL). Ver consola en dev. */
export const VISOR_GLASS_LENS_REV = "canvas-only-2026-05-31";

type Props = {
  pillRef: React.RefObject<HTMLDivElement | null>;
  getImg: (() => HTMLImageElement | null) | undefined;
  lensScale: number;
};

/**
 * Capa C del material — renderiza el efecto de lente sobre una capa SEPARADA
 * del backdrop-filter, eliminando la "niebla blanca" (H1/H6 fix).
 *
 * Chromium / Firefox / Edge: canvas 2D + SVG displacement filter en el canvas.
 * Safari: sin lens — Clear backdrop + vibrancy compensan.
 */
export function VisorGlassLensLayer({ pillRef, getImg, lensScale }: Props) {
  const tune = useVisorGlassTune();
  const lensOpacity = tune?.enabled ? tune.lensOpacity : 0.5;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strategyRef = useRef<LensStrategy>("none");
  const rafRef = useRef<number | null>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    const s = pickLensStrategy();
    strategyRef.current = s;

    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.debug("[VisorGlassLens]", VISOR_GLASS_LENS_REV, "strategy:", s);
    }

    if (s === "canvas") {
      injectLensSvgDefs(lensScale);
    }
  }, [lensScale]);

  const renderFrame = useCallback(() => {
    frameRef.current++;
    // ~30fps throttle
    if (frameRef.current % 2 === 0) {
      const img = getImg?.();
      const pill = pillRef.current;
      const canvas = canvasRef.current;
      const strategy = strategyRef.current;

      if (img && pill && canvas) {
        const pillRect = pill.getBoundingClientRect();
        const imgRect = img.getBoundingClientRect();

        if (strategy === "canvas") {
          updateCanvasLens(canvas, img, pillRect, imgRect);
        }
      }
    }

    rafRef.current = requestAnimationFrame(renderFrame);
  }, [getImg, pillRef]);

  useEffect(() => {
    if (!getImg) return;
    const s = pickLensStrategy();
    if (s === "none") return;

    rafRef.current = requestAnimationFrame(renderFrame);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [getImg, renderFrame]);

  const strategy =
    typeof window !== "undefined" ? pickLensStrategy() : "none";

  if (strategy === "none" || !getImg) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: "none",
        filter: `url(#${LENS_FILTER_ID})`,
        mixBlendMode: "soft-light",
        opacity: lensOpacity,
        borderRadius: "inherit",
      }}
    />
  );
}
