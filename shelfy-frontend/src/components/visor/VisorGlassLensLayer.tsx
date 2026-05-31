"use client";

import { useEffect, useRef, useCallback } from "react";
import { LENS_FILTER_ID, injectLensSvgDefs } from "./visor-glass-lens.svg";
import { pickLensStrategy, type LensStrategy } from "./visor-glass-lens-strategy";
import { updateCanvasLens } from "./visor-glass-canvas-lens";
import { VisorGlassWebGLLens } from "./visor-glass-webgl";

type Props = {
  pillRef: React.RefObject<HTMLDivElement | null>;
  getImg: (() => HTMLImageElement | null) | undefined;
  lensScale: number;
};

/**
 * Capa C del material — renderiza el efecto de lente sobre una capa SEPARADA
 * del backdrop-filter, eliminando la "niebla blanca" (H1/H6 fix).
 *
 * Chromium: canvas 2D + SVG displacement filter aplicado al canvas.
 * Firefox:  WebGL displacement shader.
 * Safari:   nada — Clear backdrop + vibrancy compensan.
 */
export function VisorGlassLensLayer({ pillRef, getImg, lensScale }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const webglRef = useRef<VisorGlassWebGLLens | null>(null);
  const strategyRef = useRef<LensStrategy>("none");
  const rafRef = useRef<number | null>(null);
  const frameRef = useRef(0);

  // Pick strategy and init WebGL once
  useEffect(() => {
    const s = pickLensStrategy();
    strategyRef.current = s;

    if (s === "canvas") {
      injectLensSvgDefs(lensScale);
    }

    if (s === "webgl" && canvasRef.current) {
      webglRef.current = new VisorGlassWebGLLens(canvasRef.current);
      webglRef.current.setLensScale(lensScale);
    }

    return () => {
      webglRef.current?.destroy();
      webglRef.current = null;
    };
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
        } else if (strategy === "webgl" && webglRef.current) {
          webglRef.current.setImg(img);
          webglRef.current.setRects(imgRect, pillRect);
          webglRef.current.render();
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

  if (strategy === "canvas") {
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
          opacity: 0.26,
          borderRadius: "inherit",
        }}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: "none",
        mixBlendMode: "soft-light",
        opacity: 0.28,
        borderRadius: "inherit",
      }}
    />
  );
}
