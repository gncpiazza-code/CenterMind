"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { GLASS_TOKENS, type GlassVariant } from "./visor-glass-tokens";
import {
  injectLensSvgDefs,
  LENS_FILTER_ID,
  isChromiumEngine,
  supportsBackdropFilter,
} from "./visor-glass-lens.svg";
import { type GlyphMode } from "./visor-glass-luminance";

type Props = {
  children: ReactNode;
  variant?: GlassVariant;
  compact?: boolean;
  /** Override lens on/off (defaults to token setting for variant) */
  enableLens?: boolean;
  className?: string;
  /** Called when glyph mode changes (light/dark backdrop) */
  onGlyphMode?: (mode: GlyphMode) => void;
};

/**
 * Liquid Glass Clear material — Apple WWDC 2025 reference.
 *
 * Architecture (5 layers, innermost first):
 *   1. refract   — backdrop-filter only; zero fill; optional SVG lens
 *   2. illuminate — near-zero tint (0–9% white depending on variant)
 *   3. rim        — hairline top-highlight + outer ring; no inset flood
 *   4. specular   — pointer-driven radial highlight (prefers-reduced-motion off)
 *   5. content    — z-10, children
 *
 * Invariant: no `filter` on ancestors of this component (breaks backdrop sampling).
 */
export function VisorGlassMaterial({
  children,
  variant = "clear",
  compact = false,
  enableLens,
  className,
  onGlyphMode,
}: Props) {
  const tokens = GLASS_TOKENS[variant];
  const radius = compact ? tokens.radiusCompact : tokens.radius;
  const shouldLens = enableLens ?? tokens.enableLens;

  const [lensReady, setLensReady] = useState(false);
  const [specular, setSpecular] = useState({ x: 50, y: -20 });
  const prefersReduced = useRef(false);
  const pillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    prefersReduced.current = mq.matches;
    const handler = (e: MediaQueryListEvent) => {
      prefersReduced.current = e.matches;
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (!shouldLens || !supportsBackdropFilter() || !isChromiumEngine()) return;
    injectLensSvgDefs(tokens.lensScale);
    setLensReady(true);
  }, [shouldLens, tokens.lensScale]);

  // Default to "dark" backdrop (shelf photos are predominantly dark)
  useEffect(() => {
    onGlyphMode?.("dark");
  }, [onGlyphMode]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (prefersReduced.current || !pillRef.current) return;
      const rect = pillRef.current.getBoundingClientRect();
      setSpecular({
        x: ((e.clientX - rect.left) / rect.width) * 100,
        y: ((e.clientY - rect.top) / rect.height) * 100,
      });
    },
    [],
  );

  const handlePointerLeave = useCallback(() => {
    setSpecular({ x: 50, y: -20 });
  }, []);

  const backdropFilterValue = [
    `blur(${tokens.blur})`,
    `saturate(${tokens.saturate})`,
    `brightness(${tokens.brightness})`,
  ].join(" ");

  const rimStyle: React.CSSProperties = {
    borderRadius: radius,
    boxShadow: [
      `inset 0 0.5px 0 rgba(255,255,255,${tokens.rimTopOpacity})`,
      `inset 0 -0.5px 0 rgba(0,0,0,0.03)`,
      `0 0 0 0.75px rgba(255,255,255,${tokens.rimOpacity})`,
    ].join(", "),
  };

  return (
    <div
      ref={pillRef}
      className={cn(
        "relative pointer-events-auto inline-flex items-center",
        compact
          ? "gap-0.5 px-2.5 py-2"
          : "gap-1 px-3 py-2.5 sm:gap-1.5 sm:px-4 sm:py-3",
        className,
      )}
      style={{
        borderRadius: radius,
        boxShadow: tokens.shadow,
      }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      {/* ── Layer 1: Refract — pure backdrop blur, zero fill ── */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          borderRadius: radius,
          WebkitBackdropFilter: backdropFilterValue,
          backdropFilter: backdropFilterValue,
          ...(lensReady
            ? { filter: `url(#${LENS_FILTER_ID})` }
            : {}),
        }}
      />

      {/* ── Layer 2: Illumination — tint ≤ 1.5% clear / ≤ 9% regular ── */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          borderRadius: radius,
          background: tokens.tint,
        }}
      />

      {/* ── Layer 3: Rim — hairline highlight + outer ring; no inset flood ── */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={rimStyle}
      />

      {/* ── Layer 4: Specular — pointer radial, prefers-reduced-motion aware ── */}
      {!prefersReduced.current && (
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            borderRadius: radius,
            background: `radial-gradient(ellipse 70% 55% at ${specular.x}% ${specular.y}%, rgba(255,255,255,0.16) 0%, transparent 72%)`,
          }}
        />
      )}

      {/* ── Layer 5: Content ── */}
      <div
        className={cn(
          "relative z-[1] flex items-center",
          compact ? "gap-0.5" : "gap-1 sm:gap-1.5",
        )}
      >
        {children}
      </div>
    </div>
  );
}
