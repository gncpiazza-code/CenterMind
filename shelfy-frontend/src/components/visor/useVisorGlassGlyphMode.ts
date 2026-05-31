"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sampleBackdropLuma, glyphMode, type GlyphMode } from "./visor-glass-luminance";

type Result = {
  glyphMode: GlyphMode;
  luma: number;
};

/**
 * Samples luminance behind the glass pill every ~200ms and returns the
 * adaptive glyph mode (light/dark icons).
 *
 * @param getImg  - Returns the rendered <img> for luminance sampling.
 * @param pillRef - Ref to the pill root div (for bounding rect).
 */
export function useVisorGlassGlyphMode(
  getImg: (() => HTMLImageElement | null) | undefined,
  pillRef: React.RefObject<HTMLElement | null>,
): Result {
  const [luma, setLuma] = useState(0.2);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sample = useCallback(() => {
    const img = getImg?.();
    const pill = pillRef.current;
    if (!img || !pill) return;
    const pillRect = pill.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();
    const measured = sampleBackdropLuma(img, pillRect, imgRect);
    setLuma(measured);
  }, [getImg, pillRef]);

  useEffect(() => {
    if (!getImg) return;

    sample();
    intervalRef.current = setInterval(sample, 200);

    const ro = new ResizeObserver(sample);
    const pill = pillRef.current;
    if (pill) ro.observe(pill);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      ro.disconnect();
    };
  }, [getImg, pillRef, sample]);

  return { glyphMode: glyphMode(luma), luma };
}
