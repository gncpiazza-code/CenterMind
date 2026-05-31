"use client";

import {
  forwardRef,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { GLASS_TOKENS, type GlassVariant } from "./visor-glass-tokens";
import { type GlyphMode } from "./visor-glass-luminance";
import { VisorGlassLensLayer } from "./VisorGlassLensLayer";

type Props = {
  children: ReactNode;
  variant?: GlassVariant;
  compact?: boolean;
  /** Override lens on/off (defaults to token setting for variant) */
  enableLens?: boolean;
  className?: string;
  /** Current glyph mode — sets data-glyph-mode attribute for testing and CSS hooks */
  glyphMode?: GlyphMode;
  /** Returns the <img> element for luminance + lens sampling */
  getImg?: () => HTMLImageElement | null;
};

/**
 * Liquid Glass Clear material — Apple WWDC 2025 reference.
 *
 * Architecture (6 layers, innermost first):
 *   A. refract   — backdrop-filter ONLY (no filter); zero fill
 *   B. illuminate — near-zero tint (0–9% white depending on variant)
 *   C. lens       — VisorGlassLensLayer canvas/webgl (Chromium/Firefox only)
 *   D. rim        — hairline top-highlight + outer ring; no inset flood
 *   E. specular   — pointer-driven radial highlight (prefers-reduced-motion off)
 *   F. content    — z-[1], children
 *
 * Invariant: NO `filter` on the refract layer (H1/H6 fix: eliminates niebla blanca).
 * Invariant: no `filter` on ancestors of this component (breaks backdrop sampling).
 */
export const VisorGlassMaterial = forwardRef<HTMLDivElement, Props>(
  function VisorGlassMaterial(
    {
      children,
      variant = "clear",
      compact = false,
      enableLens,
      className,
      glyphMode,
      getImg,
    },
    forwardedRef,
  ) {
    const tokens = GLASS_TOKENS[variant];
    const radius = compact ? tokens.radiusCompact : tokens.radius;
    const shouldLens = enableLens ?? tokens.enableLens;

    const [specular, setSpecular] = useState({ x: 50, y: -20 });
    const prefersReduced = useRef(false);
    const internalRef = useRef<HTMLDivElement | null>(null);

    // Merge forwarded ref with internal ref
    const assignRef = useCallback(
      (node: HTMLDivElement | null) => {
        internalRef.current = node;
        if (typeof forwardedRef === "function") {
          forwardedRef(node);
        } else if (forwardedRef) {
          (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current =
            node;
        }
      },
      [forwardedRef],
    );

    useEffect(() => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      prefersReduced.current = mq.matches;
      const handler = (e: MediaQueryListEvent) => {
        prefersReduced.current = e.matches;
      };
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }, []);

    const handlePointerMove = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (prefersReduced.current || !internalRef.current) return;
        const rect = internalRef.current.getBoundingClientRect();
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
        ref={assignRef}
        data-glyph-mode={glyphMode ?? "dark"}
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
        {/* ── Layer A: Refract — pure backdrop blur, ZERO filter (H1/H6 fix) ── */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            borderRadius: radius,
            WebkitBackdropFilter: backdropFilterValue,
            backdropFilter: backdropFilterValue,
          }}
        />

        {/* ── Layer B: Illumination — tint ≤ 1.5% clear / ≤ 9% regular ── */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            borderRadius: radius,
            background: tokens.tint,
          }}
        />

        {/* ── Layer C: Lens — separate canvas, no filter on backdrop node ── */}
        {shouldLens && (
          <VisorGlassLensLayer
            pillRef={internalRef}
            getImg={getImg}
            lensScale={tokens.lensScale}
          />
        )}

        {/* ── Layer D: Rim — hairline highlight + outer ring; no inset flood ── */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={rimStyle}
        />

        {/* ── Layer E: Specular — pointer radial, prefers-reduced-motion aware ── */}
        {!prefersReduced.current && (
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              borderRadius: radius,
              background: `radial-gradient(ellipse 70% 55% at ${specular.x}% ${specular.y}%, rgba(255,255,255,0.09) 0%, transparent 72%)`,
            }}
          />
        )}

        {/* ── Layer F: Content ── */}
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
  },
);
