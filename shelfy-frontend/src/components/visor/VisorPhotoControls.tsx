"use client";

import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FotoViewerHandle } from "@/components/visor/FotoViewer";
import { VisorPhotoZoomBar, type VisorPhotoZoomActions } from "@/components/visor/VisorPhotoZoomBar";
import {
  VisorWaterGlass,
  WATER_GLASS_BTN_BASE,
  WATER_GLASS_COUNTER,
  WATER_GLASS_DIVIDER,
  waterGlassDotClass,
} from "@/components/visor/VisorWaterGlass";
import { GlassIcon } from "@/components/visor/VisorGlassVibrancy";
import { useVisorGlassGlyphMode } from "@/components/visor/useVisorGlassGlyphMode";
import { resolveGlassAnchor } from "@/components/visor/visor-glass-placement";
import { cn } from "@/lib/utils";

type Props = {
  viewerRef?: React.RefObject<FotoViewerHandle | null>;
  zoomActions?: VisorPhotoZoomActions;
  userZoom: number;
  presentationZoom: number;
  totalFotos: number;
  currentFotoIdx: number;
  onPrevFoto: () => void;
  onNextFoto: () => void;
  onSelectFoto: (index: number) => void;
  className?: string;
};

/**
 * Floating controls inside FotoViewer's overlay shell.
 *
 * ⚠️ Only animate opacity here — never animate transform/x/y on this wrapper.
 *    Any CSS transform on an ancestor breaks backdrop-filter photo sampling.
 */
export function VisorPhotoControls({
  viewerRef,
  zoomActions,
  userZoom,
  presentationZoom,
  totalFotos,
  currentFotoIdx,
  onPrevFoto,
  onNextFoto,
  onSelectFoto,
  className,
}: Props) {
  const multiPhoto = totalFotos > 1;
  const glassRef = useRef<HTMLDivElement>(null);
  const [bottomPx, setBottomPx] = useState<number>(16);

  // Stable getter for the image element (re-reads viewerRef.current each call)
  const getImg = useCallback(
    () => viewerRef?.current?.getImgElement() ?? null,
    [viewerRef],
  );

  // Adaptive glyph mode from real luminance sampling
  const { glyphMode } = useVisorGlassGlyphMode(
    viewerRef ? getImg : undefined,
    glassRef,
  );

  // Intelligent placement: raise pill when it falls below image boundary (H7)
  useEffect(() => {
    const img = viewerRef?.current?.getImgElement();
    if (!img) return;
    const imgRect = img.getBoundingClientRect();
    const shellEl = img.closest("[data-foto-shell]") as HTMLElement | null;
    const shellRect = shellEl?.getBoundingClientRect() ?? null;
    const anchor = resolveGlassAnchor(imgRect, shellRect);
    setBottomPx(anchor.bottomPx);
  }, [viewerRef, userZoom]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className={cn(
        "absolute inset-x-0 flex justify-center px-3 pointer-events-none",
        "max-md:pb-[max(5.75rem,env(safe-area-inset-bottom))]",
        className,
      )}
      style={{
        bottom: bottomPx,
        paddingBottom: "max(0px, env(safe-area-inset-bottom))",
      }}
    >
      <VisorWaterGlass
        ref={glassRef}
        compact={!multiPhoto}
        glyphMode={glyphMode}
        getImg={viewerRef ? getImg : undefined}
      >
        {multiPhoto ? (
          <>
            <button
              type="button"
              onClick={onPrevFoto}
              disabled={currentFotoIdx === 0}
              className={WATER_GLASS_BTN_BASE}
              aria-label="Foto anterior"
              title="Foto anterior"
            >
              <GlassIcon mode={glyphMode}>
                <ChevronLeft size={18} strokeWidth={2.25} />
              </GlassIcon>
            </button>

            <div className={cn(WATER_GLASS_DIVIDER, "mx-0.5")} aria-hidden />

            <div className="flex items-center gap-2 px-1 sm:px-1.5 min-w-0">
              <div className="flex items-center gap-1.5">
                {Array.from({ length: totalFotos }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onSelectFoto(i)}
                    className={waterGlassDotClass(i === currentFotoIdx)}
                    aria-label={`Foto ${i + 1}`}
                  />
                ))}
              </div>
              <span className={cn(WATER_GLASS_COUNTER, "shrink-0")}>
                {currentFotoIdx + 1}/{totalFotos}
              </span>
            </div>

            <div className={cn(WATER_GLASS_DIVIDER, "mx-0.5")} aria-hidden />
          </>
        ) : null}

        <VisorPhotoZoomBar
          viewerRef={viewerRef}
          zoomActions={zoomActions}
          userZoom={userZoom}
          presentationZoom={presentationZoom}
          surface="overlay"
          embedded
          glyphMode={glyphMode}
        />

        {multiPhoto ? (
          <>
            <div className={cn(WATER_GLASS_DIVIDER, "mx-0.5")} aria-hidden />
            <button
              type="button"
              onClick={onNextFoto}
              disabled={currentFotoIdx >= totalFotos - 1}
              className={WATER_GLASS_BTN_BASE}
              aria-label="Foto siguiente"
              title="Foto siguiente"
            >
              <GlassIcon mode={glyphMode}>
                <ChevronRight size={18} strokeWidth={2.25} />
              </GlassIcon>
            </button>
          </>
        ) : null}
      </VisorWaterGlass>
    </motion.div>
  );
}
