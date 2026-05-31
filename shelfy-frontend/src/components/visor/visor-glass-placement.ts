export type GlassAnchor = {
  bottomPx: number;
  reason: "default" | "raised-below-image" | "raised-dark-band";
};

const PILL_HEIGHT_ESTIMATE = 56;
const DEFAULT_BOTTOM = 16;

/**
 * Resolve the optimal bottom offset for the glass controls pill.
 *
 * Raises the pill when it would land below the displayed image boundary
 * or over a zone with too little luminance content to show the lens.
 * Respects safe-area-inset-bottom (applied via CSS on the pill wrapper).
 */
export function resolveGlassAnchor(
  imgDisplayRect: DOMRect | null,
  shellRect: DOMRect | null,
): GlassAnchor {
  if (!imgDisplayRect || !shellRect) {
    return { bottomPx: DEFAULT_BOTTOM, reason: "default" };
  }

  const pillBottom = shellRect.bottom - DEFAULT_BOTTOM;
  const pillTop = pillBottom - PILL_HEIGHT_ESTIMATE;
  const imageBtm = imgDisplayRect.bottom;

  // Pill entirely below the image
  if (pillTop > imageBtm) {
    const raisedBottom = Math.max(
      DEFAULT_BOTTOM,
      shellRect.height - (imageBtm - shellRect.top) + DEFAULT_BOTTOM,
    );
    return { bottomPx: raisedBottom, reason: "raised-below-image" };
  }

  // More than 40% of the pill falls below the image bottom
  const belowImagePx = Math.max(0, pillBottom - imageBtm);
  const overlapRatio = belowImagePx / PILL_HEIGHT_ESTIMATE;

  if (overlapRatio > 0.4) {
    const raisedBottom =
      shellRect.height - (imageBtm - shellRect.top) + DEFAULT_BOTTOM;
    return {
      bottomPx: Math.max(DEFAULT_BOTTOM, raisedBottom),
      reason: "raised-dark-band",
    };
  }

  return { bottomPx: DEFAULT_BOTTOM, reason: "default" };
}
