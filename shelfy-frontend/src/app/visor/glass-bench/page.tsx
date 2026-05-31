"use client";

/**
 * Liquid Glass Bench — dev playground.
 * Access: /visor/glass-bench
 *
 * HUD shows: luma, glyph-mode, lens strategy, opacity delta.
 * AC-199-1: Light background → dark icons.
 * AC-199-2: Dark background → light icons.
 * AC-199-3: Chromium lens delta < 0.12.
 */

import { useState, useCallback, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";
import { BENCH_MOCKS } from "@/lib/visor-mock-images";
import { VisorGlassMaterial } from "@/components/visor/VisorGlassMaterial";
import {
  WATER_GLASS_BTN_BASE,
  WATER_GLASS_ICON_BTN,
  WATER_GLASS_DIVIDER,
  WATER_GLASS_COUNTER,
  waterGlassDotClass,
} from "@/components/visor/VisorWaterGlass";
import { GlassIcon } from "@/components/visor/VisorGlassVibrancy";
import { useVisorGlassGlyphMode } from "@/components/visor/useVisorGlassGlyphMode";
import { pickLensStrategy } from "@/components/visor/visor-glass-lens-strategy";
import { cn } from "@/lib/utils";

type Variant = "clear" | "regular";

export default function GlassBenchPage() {
  const [variant, setVariant] = useState<Variant>("clear");
  const [compact, setCompact] = useState(false);
  const [lensOn, setLensOn] = useState(true);
  const [totalFotos] = useState(3);
  const [fotoIdx, setFotoIdx] = useState(0);
  const [vibrancyOn, setVibrancyOn] = useState(true);

  const prev = useCallback(
    () => setFotoIdx((i) => Math.max(0, i - 1)),
    [],
  );
  const next = useCallback(
    () => setFotoIdx((i) => Math.min(totalFotos - 1, i + 1)),
    [totalFotos],
  );

  const lensStrategy =
    typeof window !== "undefined" ? pickLensStrategy() : "none";

  return (
    <div
      className="min-h-screen bg-[#0f172a] p-6"
      style={{ fontFamily: "system-ui, sans-serif" }}
    >
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-white/90 text-xl font-black tracking-tight mb-1">
          Liquid Glass — Bench
        </h1>
        <p className="text-white/45 text-xs font-medium">
          Dev playground · /visor/glass-bench · AC-199 validation matrix
        </p>
        <p className="text-emerald-400/70 text-[10px] font-mono mt-1">
          lens strategy: <span className="text-emerald-300 font-bold">{lensStrategy}</span>
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-8">
        <div className="flex gap-1 bg-white/5 border border-white/10 rounded-xl p-1">
          {(["clear", "regular"] as Variant[]).map((v) => (
            <button
              key={v}
              onClick={() => setVariant(v)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                variant === v
                  ? "bg-violet-500 text-white shadow"
                  : "text-white/50 hover:text-white/80",
              )}
            >
              {v}
            </button>
          ))}
        </div>

        <button
          onClick={() => setCompact((c) => !c)}
          className={cn(
            "px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
            compact
              ? "bg-sky-500 text-white border-sky-400"
              : "text-white/50 border-white/10 hover:text-white/80",
          )}
        >
          compact
        </button>

        <button
          onClick={() => setLensOn((l) => !l)}
          className={cn(
            "px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
            lensOn
              ? "bg-emerald-500 text-white border-emerald-400"
              : "text-white/50 border-white/10 hover:text-white/80",
          )}
        >
          lens {lensOn ? "on" : "off"}
        </button>

        <button
          onClick={() => setVibrancyOn((v) => !v)}
          className={cn(
            "px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
            vibrancyOn
              ? "bg-amber-500 text-white border-amber-400"
              : "text-white/50 border-white/10 hover:text-white/80",
          )}
        >
          vibrancy {vibrancyOn ? "on" : "off"}
        </button>
      </div>

      {/* 6-background grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {BENCH_MOCKS.map(({ label, src }) => (
          <BenchCard
            key={label}
            label={label}
            src={src}
            variant={variant}
            compact={compact}
            enableLens={lensOn}
            vibrancyOn={vibrancyOn}
            totalFotos={totalFotos}
            fotoIdx={fotoIdx}
            onPrev={prev}
            onNext={next}
            onSelect={setFotoIdx}
          />
        ))}
      </div>

      {/* Token snapshot */}
      <div className="mt-10 border-t border-white/10 pt-6">
        <h2 className="text-white/60 text-xs font-bold uppercase tracking-widest mb-3">
          Token snapshot — variant: {variant}
        </h2>
        <TokenTable variant={variant} />
      </div>
    </div>
  );
}

// ── BenchCard ─────────────────────────────────────────────────────────────────

function BenchCard({
  label,
  src,
  variant,
  compact,
  enableLens,
  vibrancyOn,
  totalFotos,
  fotoIdx,
  onPrev,
  onNext,
  onSelect,
}: {
  label: string;
  src: string;
  variant: Variant;
  compact: boolean;
  enableLens: boolean;
  vibrancyOn: boolean;
  totalFotos: number;
  fotoIdx: number;
  onPrev: () => void;
  onNext: () => void;
  onSelect: (i: number) => void;
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const pillRef = useRef<HTMLDivElement | null>(null);

  const getImg = useCallback(() => imgRef.current, []);

  const { glyphMode, luma } = useVisorGlassGlyphMode(
    vibrancyOn ? getImg : undefined,
    pillRef,
  );

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt={label}
        className="block w-full h-56 object-cover"
        draggable={false}
        crossOrigin="anonymous"
      />

      {/* Label */}
      <div className="absolute top-2 left-2 text-[9px] font-bold text-white/65 bg-black/40 backdrop-blur-sm px-2 py-0.5 rounded-full border border-white/10">
        {label}
      </div>

      {/* HUD — luma + mode (AC-199-1/2) */}
      <div className="absolute top-2 right-2 flex flex-col items-end gap-0.5">
        <div className="text-[9px] font-mono text-white/55 bg-black/40 backdrop-blur-sm px-1.5 py-0.5 rounded border border-white/10">
          luma {luma.toFixed(2)} · {glyphMode}
        </div>
      </div>

      {/* Pill overlay */}
      <div className="absolute inset-x-0 bottom-3 flex justify-center pointer-events-none">
        <div className="pointer-events-auto">
          <VisorGlassMaterial
            ref={pillRef}
            variant={variant}
            compact={compact}
            enableLens={enableLens}
            glyphMode={glyphMode}
            getImg={vibrancyOn ? getImg : undefined}
          >
            <button
              type="button"
              onClick={onPrev}
              disabled={fotoIdx === 0}
              className={vibrancyOn ? WATER_GLASS_BTN_BASE : WATER_GLASS_ICON_BTN}
              aria-label="Anterior"
            >
              {vibrancyOn ? (
                <GlassIcon mode={glyphMode}>
                  <ChevronLeft size={compact ? 16 : 18} strokeWidth={2.25} />
                </GlassIcon>
              ) : (
                <ChevronLeft size={compact ? 16 : 18} strokeWidth={2.25} />
              )}
            </button>

            <div className={cn(WATER_GLASS_DIVIDER, "mx-0.5")} aria-hidden />

            <div className="flex items-center gap-1.5 px-1">
              {Array.from({ length: totalFotos }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onSelect(i)}
                  className={waterGlassDotClass(i === fotoIdx)}
                  aria-label={`Foto ${i + 1}`}
                />
              ))}
            </div>

            <span className={cn(WATER_GLASS_COUNTER, "shrink-0 px-1")}>
              {fotoIdx + 1}/{totalFotos}
            </span>

            <div className={cn(WATER_GLASS_DIVIDER, "mx-0.5")} aria-hidden />

            <button
              type="button"
              className={vibrancyOn ? WATER_GLASS_BTN_BASE : WATER_GLASS_ICON_BTN}
              aria-label="−"
            >
              {vibrancyOn ? (
                <GlassIcon mode={glyphMode}><Minus size={compact ? 15 : 17} strokeWidth={2.25} /></GlassIcon>
              ) : (
                <Minus size={compact ? 15 : 17} strokeWidth={2.25} />
              )}
            </button>

            <button
              type="button"
              className={vibrancyOn ? WATER_GLASS_BTN_BASE : WATER_GLASS_ICON_BTN}
              aria-label="↺"
            >
              {vibrancyOn ? (
                <GlassIcon mode={glyphMode}><RotateCcw size={compact ? 13 : 15} strokeWidth={2.25} /></GlassIcon>
              ) : (
                <RotateCcw size={compact ? 13 : 15} strokeWidth={2.25} />
              )}
            </button>

            <button
              type="button"
              className={vibrancyOn ? WATER_GLASS_BTN_BASE : WATER_GLASS_ICON_BTN}
              aria-label="+"
            >
              {vibrancyOn ? (
                <GlassIcon mode={glyphMode}><Plus size={compact ? 15 : 17} strokeWidth={2.25} /></GlassIcon>
              ) : (
                <Plus size={compact ? 15 : 17} strokeWidth={2.25} />
              )}
            </button>

            <div className={cn(WATER_GLASS_DIVIDER, "mx-0.5")} aria-hidden />

            <button
              type="button"
              onClick={onNext}
              disabled={fotoIdx >= totalFotos - 1}
              className={vibrancyOn ? WATER_GLASS_BTN_BASE : WATER_GLASS_ICON_BTN}
              aria-label="Siguiente"
            >
              {vibrancyOn ? (
                <GlassIcon mode={glyphMode}>
                  <ChevronRight size={compact ? 16 : 18} strokeWidth={2.25} />
                </GlassIcon>
              ) : (
                <ChevronRight size={compact ? 16 : 18} strokeWidth={2.25} />
              )}
            </button>
          </VisorGlassMaterial>
        </div>
      </div>
    </div>
  );
}

// ── TokenTable ────────────────────────────────────────────────────────────────

import { GLASS_TOKENS } from "@/components/visor/visor-glass-tokens";

function TokenTable({ variant }: { variant: Variant }) {
  const t = GLASS_TOKENS[variant];
  const rows: [string, string][] = [
    ["blur", t.blur],
    ["saturate", String(t.saturate)],
    ["brightness", String(t.brightness)],
    ["tint", t.tint],
    ["rimOpacity", String(t.rimOpacity)],
    ["rimTopOpacity", String(t.rimTopOpacity)],
    ["lensScale", String(t.lensScale)],
    ["enableLens", String(t.enableLens)],
    ["radius", String(t.radius)],
    ["radiusCompact", String(t.radiusCompact)],
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
      {rows.map(([k, v]) => (
        <div
          key={k}
          className="bg-white/5 border border-white/8 rounded-lg px-2.5 py-2"
        >
          <div className="text-[9px] text-white/40 font-mono uppercase tracking-wider mb-0.5">
            {k}
          </div>
          <div className="text-xs text-white/80 font-mono truncate">{v}</div>
        </div>
      ))}
    </div>
  );
}
