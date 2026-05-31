"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ImageOff } from "lucide-react";
import { resolveImageUrl } from "@/lib/api";
import { isVisorImageCached, markVisorImageCached } from "@/lib/visor-image-prefetch";
import { parseIntrinsicFromSrc } from "@/components/visor/foto-viewer-intrinsic";
import { cn } from "@/lib/utils";

const PORTRAIT_ASPECT_MAX = 0.88;
/** Zoom inicial vertical — más cerca para leer la exhibición. */
const PORTRAIT_DEFAULT_USER_ZOOM = 1.48;
/** Zoom “fit” — imagen completa en el canvas (reversible desde vertical). */
export const FIT_ZOOM = 1;
const ZOOM_MIN = FIT_ZOOM;
const ZOOM_MAX = 5;
const ZOOM_STEP = 0.35;
/** Paso más agresivo que los botones ± (doble clic ×4). */
const DBL_CLICK_ZOOM_STEP = 0.75;

export type FotoViewerHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  /** Returns the rendered <img> element for luminance sampling */
  getImgElement: () => HTMLImageElement | null;
};

export function resolveVisorImageSrc(
  driveUrl: string | null | undefined,
  idExhibicion?: number,
): string | null {
  const raw = (driveUrl ?? "").trim();
  if (!raw) return null;
  if (raw.startsWith("data:") || raw.startsWith("blob:")) return raw;
  if (raw.startsWith("/")) return raw;
  return resolveImageUrl(raw, idExhibicion);
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

function readNaturalSize(img: HTMLImageElement): { w: number; h: number } | null {
  if (img.naturalWidth > 0 && img.naturalHeight > 0) {
    return { w: img.naturalWidth, h: img.naturalHeight };
  }
  const attrW = Number(img.getAttribute("width"));
  const attrH = Number(img.getAttribute("height"));
  if (attrW > 0 && attrH > 0) return { w: attrW, h: attrH };
  if (img.width > 0 && img.height > 0) return { w: img.width, h: img.height };
  return null;
}

/** Zoom de presentación inicial (vertical entra acercada). */
function presentationZoomForPortrait(isPortrait: boolean): number {
  return isPortrait ? PORTRAIT_DEFAULT_USER_ZOOM : FIT_ZOOM;
}

function isNearZoom(a: number, b: number, eps = 0.05): boolean {
  return Math.abs(a - b) <= eps;
}

type FotoViewerProps = {
  driveUrl: string;
  idExhibicion?: number;
  priority?: boolean;
  /** Segundo valor = zoom de presentación (default vertical), no el mínimo. */
  onZoomChange?: (userZoom: number, presentationZoom: number) => void;
  /** Controles glass — deben vivir en el mismo shell que la foto para backdrop-filter. */
  overlay?: ReactNode;
};

export const FotoViewer = forwardRef<FotoViewerHandle, FotoViewerProps>(function FotoViewer(
  { driveUrl, idExhibicion, priority = false, onZoomChange, overlay },
  ref,
) {
  const src = resolveVisorImageSrc(driveUrl, idExhibicion);
  const srcCached = isVisorImageCached(src);
  const [err, setErr] = useState(false);
  const [imgPainted, setImgPainted] = useState(() => srcCached);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [shellSize, setShellSize] = useState({ w: 0, h: 0 });
  const [userZoom, setUserZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const userZoomRef = useRef(1);
  const presentationZoomRef = useRef(1);
  /** Doble clic: 3 acercamientos; el 4.º vuelve al zoom inicial de la foto. */
  const dblClickZoomCountRef = useRef(0);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  /** Última posición del puntero sobre la foto (rueda / botones ±). */
  const lastPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);

  const isPortrait = useMemo(() => {
    if (!naturalSize) return false;
    return naturalSize.w / naturalSize.h < PORTRAIT_ASPECT_MAX;
  }, [naturalSize]);

  const presentationZoom = useMemo(
    () => presentationZoomForPortrait(isPortrait),
    [isPortrait],
  );

  const shellW = shellSize.w > 0 ? shellSize.w : 640;
  const shellH = shellSize.h > 0 ? shellSize.h : 480;

  const availSize = useMemo(
    () => ({
      w: Math.max(1, shellW),
      h: Math.max(1, shellH),
    }),
    [shellH, shellW],
  );

  const fitScale = useMemo(() => {
    if (!naturalSize || availSize.w < 1 || availSize.h < 1) return 1;
    return Math.min(availSize.w / naturalSize.w, availSize.h / naturalSize.h);
  }, [availSize, naturalSize]);

  const totalScale = fitScale * userZoom;

  useEffect(() => {
    userZoomRef.current = userZoom;
  }, [userZoom]);

  useEffect(() => {
    presentationZoomRef.current = presentationZoom;
  }, [presentationZoom]);

  const notifyZoom = useCallback(
    (zoom: number, baseline: number) => {
      onZoomChange?.(zoom, baseline);
    },
    [onZoomChange],
  );

  const commitNatural = useCallback((size: { w: number; h: number } | null) => {
    setNaturalSize(size);
  }, []);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const measure = () => setShellSize({ w: shell.clientWidth, h: shell.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(shell);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setErr(false);
    setPan({ x: 0, y: 0 });
    setDragging(false);
    dblClickZoomCountRef.current = 0;
    const cached = isVisorImageCached(src);
    setImgPainted(cached);

    const intrinsic = parseIntrinsicFromSrc(src);

    if (intrinsic) {
      setNaturalSize(intrinsic);
      const pres = presentationZoomForPortrait(
        intrinsic.w / intrinsic.h < PORTRAIT_ASPECT_MAX,
      );
      userZoomRef.current = pres;
      setUserZoom(pres);
      notifyZoom(pres, pres);
      return;
    }

    if (!cached) {
      setNaturalSize(null);
      userZoomRef.current = 1;
      setUserZoom(1);
      notifyZoom(1, 1);
    }
  }, [notifyZoom, src]);

  useEffect(() => {
    notifyZoom(userZoom, presentationZoom);
  }, [presentationZoom, notifyZoom, userZoom]);

  useLayoutEffect(() => {
    const img = imgRef.current;
    if (!src || !img) return;
    if (img.complete && img.naturalWidth > 0) {
      markVisorImageCached(src);
      setImgPainted(true);
    }
  }, [src]);

  const showImg = srcCached || imgPainted;

  const clampPan = useCallback(
    (nextX: number, nextY: number, zoom: number) => {
      if (!naturalSize || zoom <= ZOOM_MIN + 0.02) return { x: 0, y: 0 };
      const scale = fitScale * zoom;
      const scaledW = naturalSize.w * scale;
      const scaledH = naturalSize.h * scale;
      const maxX = Math.max(0, (scaledW - availSize.w) / 2);
      const maxY = Math.max(0, (scaledH - availSize.h) / 2);
      return {
        x: Math.max(-maxX, Math.min(maxX, nextX)),
        y: Math.max(-maxY, Math.min(maxY, nextY)),
      };
    },
    [availSize.h, availSize.w, fitScale, naturalSize],
  );

  const applyUserZoom = useCallback(
    (
      nextZoomRaw: number,
      focal?: { clientX: number; clientY: number },
    ) => {
      const nextZoom = Math.max(
        ZOOM_MIN,
        Math.min(ZOOM_MAX, Number(nextZoomRaw.toFixed(2))),
      );
      const prevZoom = userZoomRef.current;
      if (Math.abs(nextZoom - prevZoom) < 0.001) return;

      const factor = nextZoom / prevZoom;
      const content = contentRef.current;
      const shell = shellRef.current;

      if (focal && content && shell) {
        const r = content.getBoundingClientRect();
        const shellRect = shell.getBoundingClientRect();
        const w = Math.max(1, r.width);
        const h = Math.max(1, r.height);
        const u = (focal.clientX - r.left) / w;
        const v = (focal.clientY - r.top) / h;
        const newW = w * factor;
        const newH = h * factor;
        const shellCx = shellRect.left + shellRect.width / 2;
        const shellCy = shellRect.top + shellRect.height / 2;
        setPan(() =>
          clampPan(
            focal.clientX - shellCx + newW * (0.5 - u),
            focal.clientY - shellCy + newH * (0.5 - v),
            nextZoom,
          ),
        );
      } else {
        setPan((prev) => clampPan(prev.x, prev.y, nextZoom));
      }

      userZoomRef.current = nextZoom;
      setUserZoom(nextZoom);
      notifyZoom(nextZoom, presentationZoomRef.current);
    },
    [clampPan, notifyZoom],
  );

  /** Vuelve al zoom de presentación inicial (vertical 1.48 / horizontal 1) y centra. */
  const resetToPresentationZoom = useCallback(() => {
    const pres = presentationZoomRef.current;
    dblClickZoomCountRef.current = 0;
    userZoomRef.current = pres;
    setUserZoom(pres);
    setPan({ x: 0, y: 0 });
    notifyZoom(pres, pres);
  }, [notifyZoom]);

  /** Alterna fit completo ↔ zoom de presentación (atajo teclado). */
  const togglePresentationZoom = useCallback(() => {
    const pres = presentationZoomRef.current;
    const current = userZoomRef.current;
    const target = isNearZoom(current, ZOOM_MIN) ? pres : ZOOM_MIN;
    userZoomRef.current = target;
    setUserZoom(target);
    setPan({ x: 0, y: 0 });
    notifyZoom(target, pres);
  }, [notifyZoom]);

  const zoomIn = useCallback(() => {
    applyUserZoom(userZoomRef.current + ZOOM_STEP, lastPointerRef.current ?? undefined);
  }, [applyUserZoom]);

  const zoomOut = useCallback(() => {
    applyUserZoom(userZoomRef.current - ZOOM_STEP, lastPointerRef.current ?? undefined);
  }, [applyUserZoom]);

  useImperativeHandle(
    ref,
    () => ({
      zoomIn,
      zoomOut,
      resetZoom: resetToPresentationZoom,
      getImgElement: () => imgRef.current,
    }),
    [resetToPresentationZoom, zoomIn, zoomOut],
  );

  const onDoubleClickZoom = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target instanceof Element && e.target.closest("[data-visor-photo-controls]")) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const pres = presentationZoomRef.current;
      if (dblClickZoomCountRef.current >= 3) {
        dblClickZoomCountRef.current = 0;
        userZoomRef.current = pres;
        setUserZoom(pres);
        setPan({ x: 0, y: 0 });
        notifyZoom(pres, pres);
        return;
      }
      dblClickZoomCountRef.current += 1;
      const focal = { clientX: e.clientX, clientY: e.clientY };
      lastPointerRef.current = focal;
      applyUserZoom(userZoomRef.current + DBL_CLICK_ZOOM_STEP, focal);
    },
    [applyUserZoom, notifyZoom],
  );

  const trackPointer = useCallback((clientX: number, clientY: number) => {
    lastPointerRef.current = { clientX, clientY };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const target = e.target;
      if (target instanceof Element && target.closest("[data-visor-photo-controls]")) {
        return;
      }
      trackPointer(e.clientX, e.clientY);
      if (userZoom <= ZOOM_MIN + 0.02) return;
      setDragging(true);
      dragStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [pan.x, pan.y, trackPointer, userZoom],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      trackPointer(e.clientX, e.clientY);
      if (!dragging || userZoom <= ZOOM_MIN + 0.02) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPan(clampPan(dragStartRef.current.panX + dx, dragStartRef.current.panY + dy, userZoom));
    },
    [clampPan, dragging, trackPointer, userZoom],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const onWheel = (e: WheelEvent) => {
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      const focal = { clientX: e.clientX, clientY: e.clientY };
      lastPointerRef.current = focal;
      applyUserZoom(
        userZoomRef.current + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP),
        focal,
      );
    };
    shell.addEventListener("wheel", onWheel, { passive: false });
    return () => shell.removeEventListener("wheel", onWheel);
  }, [applyUserZoom]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomIn();
        return;
      }
      if (e.key === "-") {
        e.preventDefault();
        zoomOut();
        return;
      }
      if (e.key === "0") {
        e.preventDefault();
        togglePresentationZoom();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [togglePresentationZoom, zoomIn, zoomOut]);

  if (!src || err) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full bg-slate-100 text-slate-400 gap-2">
        <ImageOff size={40} className="opacity-40" />
        <span className="text-xs font-medium">Sin imagen disponible</span>
        {driveUrl ? (
          <span className="text-[10px] text-slate-400 font-mono max-w-[90%] truncate">{driveUrl}</span>
        ) : null}
      </div>
    );
  }

  const hasIntrinsic = naturalSize != null;
  const displayW = hasIntrinsic ? naturalSize.w * totalScale : 0;
  const displayH = hasIntrinsic ? naturalSize.h * totalScale : 0;
  const canPan = userZoom > ZOOM_MIN + 0.02;

  return (
    <div
      ref={shellRef}
      data-foto-shell
      className={cn(
        "relative w-full h-full min-h-[200px] overflow-hidden select-none",
        canPan ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in",
      )}
      onDoubleClick={onDoubleClickZoom}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      tabIndex={-1}
      title="Doble clic para acercar (3 veces); el 4.º vuelve al tamaño inicial. Rueda o botones ±."
    >
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
        <div
          ref={contentRef}
          className="shrink-0"
          style={{
            width: hasIntrinsic ? displayW : availSize.w,
            height: hasIntrinsic ? displayH : availSize.h,
            transform: `translate(${pan.x}px, ${pan.y}px)`,
            transition: dragging ? "none" : "transform 90ms ease-out",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={src}
            alt={`Exhibición ${idExhibicion ?? ""}`}
            width={naturalSize?.w ?? undefined}
            height={naturalSize?.h ?? undefined}
            className={cn(
              "block max-w-none w-full h-full",
              showImg ? "opacity-100" : "opacity-0",
              !hasIntrinsic && "object-contain max-w-full max-h-full w-auto h-auto",
            )}
            style={
              !hasIntrinsic
                ? { maxWidth: availSize.w, maxHeight: availSize.h }
                : undefined
            }
            loading={priority || srcCached ? "eager" : "lazy"}
            crossOrigin={src && !src.startsWith("data:") && !src.startsWith("blob:") && !src.startsWith("/") ? "anonymous" : undefined}
            onLoad={(e) => {
              const img = e.currentTarget;
              if (src) markVisorImageCached(src);
              setImgPainted(true);
              const size = readNaturalSize(img) ?? parseIntrinsicFromSrc(src);
              if (size) {
                commitNatural(size);
                const pres = presentationZoomForPortrait(
                  size.w / size.h < PORTRAIT_ASPECT_MAX,
                );
                if (userZoomRef.current <= FIT_ZOOM + 0.02) {
                  userZoomRef.current = pres;
                  setUserZoom(pres);
                  notifyZoom(pres, presentationZoomRef.current);
                }
              }
            }}
            onError={() => setErr(true)}
            draggable={false}
          />
        </div>
      </div>

      {overlay ? (
        <div className="absolute inset-0 z-[30] pointer-events-none">{overlay}</div>
      ) : null}
    </div>
  );
});
