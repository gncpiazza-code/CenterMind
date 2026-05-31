"use client";

/**
 * Liquid Glass Bench — dev playground.
 * Access: /visor/glass-bench (or /visor/glass-bench?debug=glass)
 *
 * Shows all 6 bench backgrounds with the pill overlay for visual AC validation.
 * AC1: identify product colors through pill ✓
 * AC2: single silhouette, no opaque box ✓
 * AC3: icons legible on light and dark regions ✓
 * AC5: lensing visible in Chromium ✓
 * AC6: Safari/Firefox — same legibility, no lens ✓
 */

import { useState, useCallback } from "react";
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
  WATER_GLASS_ICON_BTN,
  WATER_GLASS_DIVIDER,
  WATER_GLASS_COUNTER,
  waterGlassDotClass,
} from "@/components/visor/VisorWaterGlass";
import { cn } from "@/lib/utils";

type Variant = "clear" | "regular";

export default function GlassBenchPage() {
  const [variant, setVariant] = useState<Variant>("clear");
  const [compact, setCompact] = useState(false);
  const [lensOn, setLensOn] = useState(true);
  const [totalFotos] = useState(3);
  const [fotoIdx, setFotoIdx] = useState(0);

  const prev = useCallback(
    () => setFotoIdx((i) => Math.max(0, i - 1)),
    [],
  );
  const next = useCallback(
    () => setFotoIdx((i) => Math.min(totalFotos - 1, i + 1)),
    [totalFotos],
  );

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
          Dev playground · /visor/glass-bench · AC1–AC8 validation matrix
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-8">
        {/* Variant */}
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

        {/* Compact */}
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

        {/* Lens */}
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
            totalFotos={totalFotos}
            fotoIdx={fotoIdx}
            onPrev={prev}
            onNext={next}
            onSelect={setFotoIdx}
          />
        ))}
      </div>

      {/* Spec */}
      <div className="mt-10 border-t border-white/10 pt-6">
        <h2 className="text-white/60 text-xs font-bold uppercase tracking-widest mb-3">
          Token snapshot — variant: {variant}
        </h2>
        <TokenTable variant={variant} />
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function BenchCard({
  label,
  src,
  variant,
  compact,
  enableLens,
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
  totalFotos: number;
  fotoIdx: number;
  onPrev: () => void;
  onNext: () => void;
  onSelect: (i: number) => void;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
      {/* Background image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={label}
        className="block w-full h-56 object-cover"
        draggable={false}
      />

      {/* Label */}
      <div className="absolute top-2 left-2 text-[9px] font-bold text-white/65 bg-black/40 backdrop-blur-sm px-2 py-0.5 rounded-full border border-white/10">
        {label}
      </div>

      {/* Pill overlay — at the bottom of the image */}
      <div className="absolute inset-x-0 bottom-3 flex justify-center pointer-events-none">
        <div className="pointer-events-auto">
          <VisorGlassMaterial
            variant={variant}
            compact={compact}
            enableLens={enableLens}
          >
            <button
              type="button"
              onClick={onPrev}
              disabled={fotoIdx === 0}
              className={WATER_GLASS_ICON_BTN}
              aria-label="Anterior"
            >
              <ChevronLeft size={compact ? 16 : 18} strokeWidth={2.25} />
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

            <button type="button" className={WATER_GLASS_ICON_BTN} aria-label="−">
              <Minus size={compact ? 15 : 17} strokeWidth={2.25} />
            </button>

            <button type="button" className={WATER_GLASS_ICON_BTN} aria-label="↺">
              <RotateCcw size={compact ? 13 : 15} strokeWidth={2.25} />
            </button>

            <button type="button" className={WATER_GLASS_ICON_BTN} aria-label="+">
              <Plus size={compact ? 15 : 17} strokeWidth={2.25} />
            </button>

            <div className={cn(WATER_GLASS_DIVIDER, "mx-0.5")} aria-hidden />

            <button
              type="button"
              onClick={onNext}
              disabled={fotoIdx >= totalFotos - 1}
              className={WATER_GLASS_ICON_BTN}
              aria-label="Siguiente"
            >
              <ChevronRight size={compact ? 16 : 18} strokeWidth={2.25} />
            </button>
          </VisorGlassMaterial>
        </div>
      </div>
    </div>
  );
}

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
