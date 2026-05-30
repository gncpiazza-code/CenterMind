"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { ImageOff, MapPin, ChevronLeft, ChevronRight, Activity } from "lucide-react";
import { resolveImageUrl, type UltimaEvaluada } from "@/lib/api";
import { isUltimaCoherenteConVendedor } from "@/lib/dashboard-ultimas";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface HeroCarouselProps {
  items: UltimaEvaluada[];
  compact?: boolean;
  isDark?: boolean;
  className?: string;
}

const AUTOPLAY_MS = 8000;
const SLIDE_MS = 220;
const CUBE_MS = 420;
/** Distancia del “ojo” al cubo; 1000px ≈ IG (menos = más distorsión) */
const STORY_PERSPECTIVE_PX = 1000;
const CUBE_Z = 120;
const TZ_AR = "America/Argentina/Buenos_Aires";

const STORY_TEXT =
  "text-white [text-shadow:0_0_1px_rgb(0_0_0/1),0_1px_4px_rgb(0_0_0/0.9),0_2px_10px_rgb(0_0_0/0.75)]";

type StoryTransition = "slide" | "cube";

function vendorKey(item: UltimaEvaluada): string {
  if (item.id_vendedor != null) return `id:${item.id_vendedor}`;
  return (item.vendedor_erp || item.vendedor || "").trim().toLowerCase();
}

function resolveTransition(from: UltimaEvaluada, to: UltimaEvaluada): StoryTransition {
  return vendorKey(from) === vendorKey(to) ? "slide" : "cube";
}

/**
 * Mismo vendedor (IG): la nueva entra con translateX; la anterior se va al toque.
 * Sin rotateY, sin Z, sin perspective en el padre.
 */
function horizontalSlideVariants(d: number): Variants {
  const forward = d > 0;
  return {
    enter: {
      x: forward ? "100%" : "-100%",
      opacity: 1,
      zIndex: 2,
    },
    center: {
      x: 0,
      opacity: 1,
      zIndex: 1,
    },
    exit: {
      opacity: 0,
      zIndex: 0,
      transition: { duration: 0.1, ease: "linear" },
    },
  };
}

/**
 * Cubo entre vendedores: bisagra derecha al salir, izquierda al entrar (avance).
 * Requiere perspective en el contenedor padre.
 */
function cubeVariants(d: number): Variants {
  const forward = d > 0;
  return {
    enter: {
      rotateY: forward ? 90 : -90,
      z: -CUBE_Z,
      opacity: 1,
      zIndex: 0,
      transformOrigin: forward ? "left center" : "right center",
    },
    center: {
      rotateY: 0,
      z: 0,
      opacity: 1,
      zIndex: 1,
      transformOrigin: "center center",
    },
    exit: {
      rotateY: forward ? -90 : 90,
      z: -CUBE_Z,
      opacity: 1,
      zIndex: 2,
      transformOrigin: forward ? "right center" : "left center",
    },
  };
}

function pdvLines(item: UltimaEvaluada): { titulo: string; subtitulo: string | null } {
  const fantasia = (item.nombre_fantasia || "").trim();
  const razon = (item.razon_social || "").trim();
  const same =
    fantasia && razon && fantasia.localeCompare(razon, "es", { sensitivity: "accent" }) === 0;
  if (fantasia && razon && !same) {
    return { titulo: fantasia, subtitulo: razon };
  }
  const unico = fantasia || razon;
  return { titulo: unico || "Sin nombre PDV", subtitulo: null };
}

function formatTimeText(dateInput?: string): string {
  if (!dateInput) return "Reciente";
  const date = new Date(dateInput);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "hace un momento";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

function vendedorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  }
  if (parts.length === 1) {
    const p = parts[0];
    return (p.length >= 2 ? p.slice(0, 2) : p).toUpperCase();
  }
  return "?";
}

function estadoBadgeStyle(estado: string): string {
  const e = estado.toLowerCase();
  if (e.includes("destacad")) return "bg-violet-500/95 text-white";
  if (e.includes("aprobad")) return "bg-emerald-500/95 text-white";
  if (e.includes("rechaz")) return "bg-red-500/95 text-white";
  return "bg-amber-500/95 text-white";
}

function estadoLabel(estado: string): string {
  const e = estado.toLowerCase();
  if (e.includes("destacad")) return "Destacado";
  if (e.includes("aprobad")) return "Aprobado";
  if (e.includes("rechaz")) return "Rechazado";
  return "Pendiente";
}

function useArgentinaClock() {
  const [clock, setClock] = useState("");
  useEffect(() => {
    const tick = () => {
      setClock(
        new Intl.DateTimeFormat("es-AR", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: TZ_AR,
        }).format(new Date()),
      );
    };
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);
  return clock;
}

/** Barra superior iPad: hora AR + señal + batería alta */
function IpadStatusBar() {
  const clock = useArgentinaClock();
  return (
    <div className="flex items-center justify-between px-4 pt-2 pb-0.5 shrink-0 z-50 text-white">
      <span className="text-[13px] font-semibold tabular-nums tracking-tight min-w-[2.5rem]">
        {clock || "—:—"}
      </span>
      <div className="flex items-center gap-[5px]" aria-label="Batería alta">
        <span className="flex items-end gap-[2px] h-2.5" aria-hidden>
          {[3, 4, 5, 6].map((h, i) => (
            <span
              key={i}
              className="w-[3px] rounded-[1px] bg-white"
              style={{ height: h }}
            />
          ))}
        </span>
        <svg width="18" height="10" viewBox="0 0 18 10" className="text-white" aria-hidden>
          <rect x="0.5" y="0.5" width="14" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1" />
          <rect x="15" y="3" width="2" height="4" rx="0.5" fill="currentColor" opacity="0.5" />
          <rect x="1.5" y="1.5" width="11" height="7" rx="1.5" fill="currentColor" />
        </svg>
        <span className="text-[10px] font-semibold tabular-nums text-white/90">100%</span>
      </div>
    </div>
  );
}

function StoriesProgressBar({
  total,
  activeIndex,
  progressKey,
}: {
  total: number;
  activeIndex: number;
  progressKey: number;
}) {
  if (total <= 0) return null;
  return (
    <div className="flex gap-[3px] px-2.5 pt-1 pb-1.5 shrink-0 z-40">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex-1 h-[2.5px] sm:h-[3px] rounded-full bg-white/35 overflow-hidden">
          {i < activeIndex && <div className="h-full w-full bg-white rounded-full" />}
          {i === activeIndex && (
            <div
              key={progressKey}
              className="h-full bg-white rounded-full shelfy-story-progress"
              style={{ ["--shelfy-story-ms" as string]: `${AUTOPLAY_MS}ms` }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/** Slide 2D plano; perspective solo cuando hay cubo entre vendedores */
function StoriesViewport({
  children,
  enableCube,
}: {
  children: React.ReactNode;
  enableCube: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex-1 min-h-0 overflow-hidden bg-black",
        enableCube && "[transform-style:preserve-3d]",
      )}
      style={
        enableCube
          ? {
              perspective: STORY_PERSPECTIVE_PX,
              perspectiveOrigin: "50% 50%",
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}

function StoriesFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative w-full h-full min-h-0 flex flex-col",
        "rounded-3xl overflow-hidden bg-black",
        "ring-1 ring-black/30",
        className,
      )}
    >
      {children}
    </div>
  );
}

function StoryImage({ src, alt, onError }: { src: string; alt: string; onError: () => void }) {
  const [ready, setReady] = useState(false);
  const prevSrc = useRef(src);

  useEffect(() => {
    if (prevSrc.current !== src) {
      prevSrc.current = src;
      setReady(false);
    }
  }, [src]);

  return (
    <div className="absolute inset-0 bg-black">
      {!ready && <div className="absolute inset-0 bg-black animate-pulse" aria-hidden />}
      <img
        src={src}
        alt={alt}
        decoding="async"
        className={cn(
          "absolute inset-0 w-full h-full object-contain transition-opacity duration-150",
          ready ? "opacity-100" : "opacity-0",
        )}
        onLoad={() => setReady(true)}
        onError={onError}
      />
    </div>
  );
}

function StoryPdvFooter({
  item,
  compact,
}: {
  item: UltimaEvaluada;
  compact?: boolean;
}) {
  const { titulo, subtitulo } = pdvLines(item);
  const nroCliente = (item.nro_cliente || "").trim();
  const ciudad = (item.ciudad || "").trim();

  return (
    <div
      className={cn(
        "absolute bottom-0 inset-x-0 z-20 pointer-events-none",
        compact ? "px-3 pb-4" : "px-4 pb-5",
      )}
    >
      <span
        className={cn(
          "inline-block mb-2.5 text-[10px] font-bold uppercase tracking-wide px-2.5 py-0.5 rounded-full",
          estadoBadgeStyle(item.estado),
          STORY_TEXT,
        )}
      >
        {estadoLabel(item.estado)}
      </span>

      <div className="space-y-1 mb-2.5 min-w-0">
        <p
          className={cn("text-[15px] sm:text-base font-bold leading-[1.25] line-clamp-2", STORY_TEXT)}
          title={titulo}
        >
          {titulo}
        </p>
        {subtitulo ? (
          <p
            className={cn("text-[13px] font-medium text-white/88 leading-[1.3] line-clamp-2", STORY_TEXT)}
            title={subtitulo}
          >
            {subtitulo}
          </p>
        ) : null}
      </div>

      {(nroCliente || ciudad) && (
        <p
          className={cn(
            "text-[11px] font-semibold text-white/85 flex flex-wrap items-center gap-x-2 gap-y-0.5",
            STORY_TEXT,
          )}
        >
          {nroCliente ? <span className="tabular-nums">#{nroCliente}</span> : null}
          {nroCliente && ciudad ? <span className="text-white/40">·</span> : null}
          {ciudad ? (
            <span className="inline-flex items-center gap-1 uppercase tracking-wide min-w-0">
              <MapPin size={11} className="shrink-0" />
              <span className="truncate">{ciudad}</span>
            </span>
          ) : null}
        </p>
      )}
    </div>
  );
}

function HeroSlide({
  item,
  compact,
  direction,
  transitionKind,
}: {
  item: UltimaEvaluada;
  compact?: boolean;
  direction: number;
  transitionKind: StoryTransition;
}) {
  const [imgErr, setImgErr] = useState(false);
  const imgSrc = resolveImageUrl(item.drive_link, item.id_exhibicion);
  const vendedorErp = (item.vendedor_erp || item.vendedor || "Sin vendedor").trim();
  const timeLabel = formatTimeText(item.fecha_evaluacion || item.timestamp_subida);
  const variants =
    transitionKind === "cube" ? cubeVariants(direction) : horizontalSlideVariants(direction);
  const durationMs = transitionKind === "cube" ? CUBE_MS : SLIDE_MS;

  useEffect(() => {
    setImgErr(false);
  }, [item.id_exhibicion]);

  return (
    <motion.div
      custom={direction}
      variants={variants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={
        transitionKind === "cube"
          ? { duration: durationMs / 1000, ease: [0.4, 0, 0.2, 1] }
          : { duration: durationMs / 1000, ease: [0.33, 1, 0.68, 1] }
      }
      className={cn(
        "absolute inset-0 bg-black",
        transitionKind === "cube"
          ? "will-change-transform [backface-visibility:hidden] [transform-style:preserve-3d]"
          : "will-change-[transform,opacity]",
      )}
      style={transitionKind === "cube" ? { transformStyle: "preserve-3d" } : undefined}
    >
      {imgSrc && !imgErr ? (
        <StoryImage src={imgSrc} alt="Exhibición" onError={() => setImgErr(true)} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <ImageOff size={36} className="text-neutral-600" />
        </div>
      )}

      <div
        className="absolute top-0 inset-x-0 h-24 z-[12] pointer-events-none bg-gradient-to-b from-black/50 to-transparent"
        aria-hidden
      />
      <div
        className={cn(
          "absolute bottom-0 inset-x-0 z-[12] pointer-events-none bg-gradient-to-t from-black/85 via-black/50 to-transparent",
          compact ? "h-[38%]" : "h-[42%]",
        )}
        aria-hidden
      />

      {/* Header IG — sin caja, solo sombra */}
      <div className="absolute top-0 inset-x-0 z-30 px-3 pt-1.5 flex items-center gap-2.5 pointer-events-none">
        <div className="relative shrink-0">
          <div className="absolute -inset-[2px] rounded-full bg-gradient-to-tr from-[#feda75] via-[#fa7e1e] to-[#d62976]" />
          <div className="relative size-9 rounded-full bg-neutral-900 border-2 border-black flex items-center justify-center text-[11px] font-bold text-white tracking-tight">
            {vendedorInitials(vendedorErp)}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn("text-[13px] font-bold truncate leading-tight", STORY_TEXT)}>{vendedorErp}</p>
          <p className={cn("text-[11px] font-medium text-white/90 truncate", STORY_TEXT)}>{timeLabel}</p>
        </div>
      </div>

      <StoryPdvFooter item={item} compact={compact} />
    </motion.div>
  );
}

function preloadStoryImage(item: UltimaEvaluada) {
  const src = resolveImageUrl(item.drive_link, item.id_exhibicion);
  if (!src) return;
  const img = new Image();
  img.decoding = "async";
  img.src = src;
}

export function HeroCarousel({ items, compact = false, isDark: _isDark = false, className }: HeroCarouselProps) {
  const filtered = items.filter(
    (e) => !/rechaz/i.test(e.estado) && isUltimaCoherenteConVendedor(e),
  );
  const [ci, setCi] = useState(0);
  const [progressKey, setProgressKey] = useState(0);
  const [direction, setDirection] = useState(1);
  const [transitionKind, setTransitionKind] = useState<StoryTransition>("slide");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const safeIdx = filtered.length > 0 ? Math.min(ci, filtered.length - 1) : 0;

  const navigateTo = useCallback(
    (idx: number, dir: number) => {
      if (filtered.length === 0) return;
      const from = filtered[safeIdx];
      const to = filtered[idx];
      setTransitionKind(resolveTransition(from, to));
      setDirection(dir);
      setCi(idx);
      setProgressKey((k) => k + 1);
    },
    [filtered, safeIdx],
  );

  function resetTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (filtered.length <= 1) return;
    timerRef.current = setInterval(() => {
      setCi((curr) => {
        const next = (curr + 1) % filtered.length;
        setTransitionKind(resolveTransition(filtered[curr], filtered[next]));
        setDirection(1);
        setProgressKey((k) => k + 1);
        return next;
      });
    }, AUTOPLAY_MS);
  }

  useEffect(() => {
    resetTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.length]);

  useEffect(() => {
    if (ci >= filtered.length && filtered.length > 0) setCi(0);
  }, [filtered.length, ci]);

  useEffect(() => {
    if (filtered.length === 0) return;
    const neighbors = [
      filtered[(safeIdx + 1) % filtered.length],
      filtered[(safeIdx - 1 + filtered.length) % filtered.length],
    ];
    neighbors.forEach(preloadStoryImage);
    preloadStoryImage(filtered[safeIdx]);
  }, [safeIdx, filtered]);

  const prev = () => {
    const idx = safeIdx === 0 ? filtered.length - 1 : safeIdx - 1;
    navigateTo(idx, -1);
    resetTimer();
  };
  const next = () => {
    const idx = (safeIdx + 1) % filtered.length;
    navigateTo(idx, 1);
    resetTimer();
  };

  if (filtered.length === 0) {
    return (
      <StoriesFrame className={cn("h-full min-h-0", className)}>
        <IpadStatusBar />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center min-h-0">
          <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center">
            <Activity size={28} className="text-violet-400 animate-pulse" />
          </div>
          <p className={cn("font-bold text-sm", STORY_TEXT)}>Sin historias</p>
          <p className={cn("text-xs text-white/75", STORY_TEXT)}>Las exhibiciones evaluadas aparecerán aquí</p>
          <Link
            href="/visor"
            className="px-4 py-2 rounded-full border border-white/20 text-white/90 font-semibold text-[10px] uppercase tracking-wider hover:bg-white/10 transition-all"
          >
            Ir al Visor
          </Link>
        </div>
      </StoriesFrame>
    );
  }

  const item = filtered[safeIdx];
  const slideKey = `ex-${item.id_exhibicion}`;

  return (
    <StoriesFrame className={cn("group/shell h-full min-h-0", className)}>
      <style>{`
        @keyframes shelfy-story-progress {
          from { width: 0%; }
          to { width: 100%; }
        }
        .shelfy-story-progress {
          animation: shelfy-story-progress var(--shelfy-story-ms, 8000ms) linear forwards;
        }
      `}</style>

      <IpadStatusBar />
      <StoriesProgressBar total={filtered.length} activeIndex={safeIdx} progressKey={progressKey} />

      <StoriesViewport enableCube={transitionKind === "cube"}>
        <AnimatePresence initial={false} custom={direction}>
          <HeroSlide
            key={slideKey}
            item={item}
            compact={compact}
            direction={direction}
            transitionKind={transitionKind}
          />
        </AnimatePresence>

        <button
          type="button"
          aria-label="Historia anterior"
          onClick={prev}
          className="absolute left-0 top-0 bottom-0 w-[28%] z-20 cursor-w-resize opacity-0"
        />
        <button
          type="button"
          aria-label="Siguiente historia"
          onClick={next}
          className="absolute right-0 top-0 bottom-0 w-[28%] z-20 cursor-e-resize opacity-0"
        />

        <div className="absolute top-1/2 -translate-y-1/2 w-full px-2 flex justify-between z-30 opacity-0 group-hover/shell:opacity-100 transition-opacity duration-300 pointer-events-none">
          <button
            type="button"
            onClick={prev}
            className="pointer-events-auto w-9 h-9 rounded-full bg-black/50 hover:bg-white/95 hover:text-black backdrop-blur-sm flex items-center justify-center text-white transition-all"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={next}
            className="pointer-events-auto w-9 h-9 rounded-full bg-black/50 hover:bg-white/95 hover:text-black backdrop-blur-sm flex items-center justify-center text-white transition-all"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </StoriesViewport>
    </StoriesFrame>
  );
}
