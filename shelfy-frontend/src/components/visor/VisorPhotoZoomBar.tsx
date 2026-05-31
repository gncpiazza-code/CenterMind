"use client";

import { Minus, Plus, RotateCcw } from "lucide-react";
import { FIT_ZOOM, type FotoViewerHandle } from "@/components/visor/FotoViewer";
import { WATER_GLASS_BTN_BASE, WATER_GLASS_ICON_BTN, WATER_GLASS_DIVIDER } from "@/components/visor/VisorWaterGlass";
import { GlassIcon } from "@/components/visor/VisorGlassVibrancy";
import type { GlyphMode } from "@/components/visor/visor-glass-luminance";
import { cn } from "@/lib/utils";

const GLASS = {
  light: {
    panel:
      "rounded-full border border-black/[0.06] bg-white/70 shadow-[0_4px_24px_rgba(15,23,42,0.1),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-xl backdrop-saturate-150",
    btn: "text-slate-700 hover:bg-black/[0.05] active:bg-black/[0.08]",
    divider: "bg-black/10",
  },
  dark: {
    panel:
      "rounded-full border border-white/20 bg-white/[0.12] shadow-[0_8px_32px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.28)] backdrop-blur-2xl backdrop-saturate-[1.8]",
    btn: "text-white/95 hover:bg-white/14 active:bg-white/10",
    divider: "bg-white/15",
  },
  overlay: {
    panel: "",
    btn: "",
    divider: "",
  },
} as const;

const GLASS_BTN_BASE =
  "flex items-center justify-center transition-all duration-200 ease-out active:scale-[0.94] disabled:opacity-35 disabled:pointer-events-none disabled:active:scale-100";

export type VisorPhotoZoomActions = {
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
};

type Props = {
  viewerRef?: React.RefObject<FotoViewerHandle | null>;
  zoomActions?: VisorPhotoZoomActions;
  userZoom: number;
  /** Zoom de presentación inicial (ej. 1.48 vertical); no es el mínimo. */
  presentationZoom: number;
  surface?: keyof typeof GLASS;
  /** Sin cápsula propia — vive dentro de VisorWaterGlass. */
  embedded?: boolean;
  /** Adaptive glyph mode from useVisorGlassGlyphMode */
  glyphMode?: GlyphMode;
  className?: string;
};

function stopControlPointer(e: React.SyntheticEvent) {
  e.stopPropagation();
}

function GlassZoomButton({
  onClick,
  onPointerDown,
  disabled,
  ariaLabel,
  title,
  children,
  className,
}: {
  onClick: () => void;
  onPointerDown?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  ariaLabel: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={onPointerDown}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      className={cn(GLASS_BTN_BASE, className)}
    >
      {children}
    </button>
  );
}

export function VisorPhotoZoomBar({
  viewerRef,
  zoomActions,
  userZoom,
  presentationZoom,
  surface = "light",
  embedded = false,
  glyphMode = "dark",
  className,
}: Props) {
  const atPresentation = Math.abs(userZoom - presentationZoom) <= 0.05;
  const tone = GLASS[surface];
  const useOverlay = surface === "overlay" || embedded;

  const zoomOut = () => zoomActions?.zoomOut() ?? viewerRef?.current?.zoomOut();
  const zoomIn = () => zoomActions?.zoomIn() ?? viewerRef?.current?.zoomIn();
  const resetZoom = () => {
    zoomActions?.resetZoom();
    viewerRef?.current?.resetZoom();
  };

  const btnClass = useOverlay ? WATER_GLASS_BTN_BASE : cn("size-9 rounded-full", tone.btn);

  const buttons = (
    <>
      <GlassZoomButton
        onClick={zoomOut}
        onPointerDown={stopControlPointer}
        disabled={userZoom <= FIT_ZOOM + 0.05}
        ariaLabel="Alejar"
        title={userZoom <= FIT_ZOOM + 0.05 ? "Ya estás en imagen completa" : "Alejar"}
        className={useOverlay ? btnClass : cn("size-9 rounded-full", tone.btn)}
      >
        {useOverlay ? (
          <GlassIcon mode={glyphMode}>
            <Minus size={17} strokeWidth={2.25} />
          </GlassIcon>
        ) : (
          <Minus size={17} strokeWidth={2.25} />
        )}
      </GlassZoomButton>

      <div
        className={cn(
          "shrink-0",
          useOverlay ? WATER_GLASS_DIVIDER : cn("w-px h-6", tone.divider),
        )}
        aria-hidden
      />

      <GlassZoomButton
        onClick={resetZoom}
        onPointerDown={stopControlPointer}
        disabled={atPresentation}
        ariaLabel="Restablecer zoom"
        title={
          atPresentation
            ? "Ya estás en el zoom recomendado"
            : "Restablecer zoom recomendado"
        }
        className={useOverlay ? btnClass : cn("size-9 rounded-full", tone.btn)}
      >
        {useOverlay ? (
          <GlassIcon mode={glyphMode}>
            <RotateCcw size={15} strokeWidth={2.25} />
          </GlassIcon>
        ) : (
          <RotateCcw size={15} strokeWidth={2.25} />
        )}
      </GlassZoomButton>

      <div
        className={cn(
          "shrink-0",
          useOverlay ? WATER_GLASS_DIVIDER : cn("w-px h-6", tone.divider),
        )}
        aria-hidden
      />

      <GlassZoomButton
        onClick={zoomIn}
        onPointerDown={stopControlPointer}
        disabled={userZoom >= 5}
        ariaLabel="Acercar"
        title="Acercar"
        className={useOverlay ? btnClass : cn("size-9 rounded-full", tone.btn)}
      >
        {useOverlay ? (
          <GlassIcon mode={glyphMode}>
            <Plus size={17} strokeWidth={2.25} />
          </GlassIcon>
        ) : (
          <Plus size={17} strokeWidth={2.25} />
        )}
      </GlassZoomButton>
    </>
  );

  if (embedded) {
    return (
      <div
        className={cn("flex items-center gap-0.5", className)}
        role="toolbar"
        aria-label="Zoom de la foto"
      >
        {buttons}
      </div>
    );
  }

  return (
    <div
      className={cn("flex items-center gap-2", className)}
      role="toolbar"
      aria-label="Zoom de la foto"
    >
      <div className={cn(tone.panel, "flex items-center p-1 gap-0.5")}>
        {buttons}
      </div>
    </div>
  );
}
