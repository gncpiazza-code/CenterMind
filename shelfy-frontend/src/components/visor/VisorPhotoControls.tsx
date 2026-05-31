"use client";

import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { FotoViewerHandle } from "@/components/visor/FotoViewer";
import { VisorPhotoZoomBar, type VisorPhotoZoomActions } from "@/components/visor/VisorPhotoZoomBar";
import {
  VisorWaterGlass,
  WATER_GLASS_ICON_BTN,
  WATER_GLASS_COUNTER,
  WATER_GLASS_DIVIDER,
  waterGlassDotClass,
} from "@/components/visor/VisorWaterGlass";
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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className={cn(
        "absolute inset-x-0 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none",
        "bottom-4 max-md:bottom-[5.75rem]",
        className,
      )}
    >
      <VisorWaterGlass compact={!multiPhoto}>
        {multiPhoto ? (
          <>
            <button
              type="button"
              onClick={onPrevFoto}
              disabled={currentFotoIdx === 0}
              className={WATER_GLASS_ICON_BTN}
              aria-label="Foto anterior"
              title="Foto anterior"
            >
              <ChevronLeft size={18} strokeWidth={2.25} />
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
        />

        {multiPhoto ? (
          <>
            <div className={cn(WATER_GLASS_DIVIDER, "mx-0.5")} aria-hidden />
            <button
              type="button"
              onClick={onNextFoto}
              disabled={currentFotoIdx >= totalFotos - 1}
              className={WATER_GLASS_ICON_BTN}
              aria-label="Foto siguiente"
              title="Foto siguiente"
            >
              <ChevronRight size={18} strokeWidth={2.25} />
            </button>
          </>
        ) : null}
      </VisorWaterGlass>
    </motion.div>
  );
}
