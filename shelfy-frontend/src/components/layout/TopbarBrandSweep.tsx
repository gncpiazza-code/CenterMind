"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Play } from "lucide-react";

const ICON_PX = 48;
const ICON_RADIUS = 12;
const WORDMARK_ASPECT = 1575 / 510;
const SWEEP_DURATION = 1.6;
const HOLD_MS = 2_400;
const REPEAT_MS = 30_000;
const BOOT_DELAY_MS = 2_000;
const SWEEP_EASE = [0.25, 0.1, 0.25, 1] as const;
const SWEEP_TRANSITION = { duration: SWEEP_DURATION, ease: SWEEP_EASE };
const IS_DEV = process.env.NODE_ENV === "development";

const NEON_STEPS = 48;
const NEON_CYCLE = 2.05;

function buildPulse(steps: number, phase = 0): number[] {
  return Array.from({ length: steps }, (_, i) => {
    const t = i / steps + phase;
    const wave = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * NEON_CYCLE);
    const flicker = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * NEON_CYCLE * 3.7 + 0.9);
    return Math.max(0, Math.min(1, wave * 0.78 + flicker * 0.22));
  });
}

const NEON_PULSE = buildPulse(NEON_STEPS);
const NEON_PULSE_B = buildPulse(NEON_STEPS, 0.31);
const NEON_TIMES = Array.from({ length: NEON_STEPS }, (_, i) => i / (NEON_STEPS - 1));

/** Relleno base más oscuro cuando el tubo “prende” — contraste cartel neón. */
const NEON_BASE_FILTER = NEON_PULSE.map((p, i) => {
  const brightness = 0.94 - 0.28 * p;
  const saturate = 1.18 + 0.62 * NEON_PULSE_B[i];
  return `brightness(${brightness.toFixed(3)}) saturate(${saturate.toFixed(3)}) contrast(1.08)`;
});

/** Luz interior del tubo (violeta claro). */
const NEON_FILL_OPACITY = NEON_PULSE.map((p) => 0.06 + 0.58 * p ** 1.15);

/** Halo exterior. */
const NEON_HALO_OPACITY = NEON_PULSE.map((p, i) => 0.12 + 0.68 * p * (0.85 + 0.15 * NEON_PULSE_B[i]));

const NEON_TRANSITION = {
  duration: 2.1,
  repeat: Infinity,
  ease: "linear" as const,
  times: NEON_TIMES,
};

const WORDMARK_IMG = "block max-w-none select-none pointer-events-none";

type Phase = "rest" | "sweepOut" | "holdAtEnd" | "bounceBack";

type Geometry = {
  homeX: number;
  travel: number;
  wordmarkH: number;
};

type Props = {
  headerRef: React.RefObject<HTMLElement | null>;
  evaluarRef: React.RefObject<HTMLElement | null>;
};

function measureGeometry(
  header: HTMLElement,
  tab: HTMLElement,
  logoSlot: HTMLElement,
): Geometry | null {
  const hr = header.getBoundingClientRect();
  const er = tab.getBoundingClientRect();
  const lr = logoSlot.getBoundingClientRect();
  const homeX = lr.left - hr.left;
  const targetX = er.left - hr.left - ICON_PX - 12;
  const travel = targetX - homeX;
  if (travel < 64) return null;
  const wordmarkH = Math.min(28, Math.max(22, Math.round(travel / WORDMARK_ASPECT)));
  return { homeX, travel, wordmarkH };
}

/** Ancho revelado del wordmark (px) según fase e icono. */
function revealedWidth(phase: Phase, iconX: number, travel: number): number {
  if (travel <= 0) return 0;
  if (phase === "holdAtEnd") return travel;
  if (iconX >= travel - 0.5) return travel;
  if (phase === "sweepOut") return Math.min(travel, iconX + ICON_PX * 0.38);
  if (phase === "bounceBack") return Math.min(travel, iconX + ICON_PX * 0.55);
  return 0;
}

function BrandIcon({ eraser = false }: { eraser?: boolean }) {
  return (
    <div
      className="relative shrink-0 overflow-hidden"
      style={{ width: ICON_PX, height: ICON_PX, borderRadius: ICON_RADIUS }}
    >
      {eraser && (
        <div
          className="absolute inset-0"
          style={{ background: "var(--shelfy-panel)", borderRadius: ICON_RADIUS }}
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/WEBICON.svg"
        alt=""
        draggable={false}
        className="relative block select-none"
        style={{
          width: ICON_PX,
          height: ICON_PX,
          transform: "scale(1.06)",
          transformOrigin: "center center",
        }}
      />
    </div>
  );
}

function WordTrail({
  homeX,
  travel,
  wordmarkH,
  phase,
  iconX,
  neonActive,
}: {
  homeX: number;
  travel: number;
  wordmarkH: number;
  phase: Phase;
  iconX: number;
  neonActive: boolean;
}) {
  const reveal = revealedWidth(phase, iconX, travel);
  if (reveal <= 0) return null;

  const clipRight = Math.max(0, 100 - (reveal / travel) * 100);

  return (
    <div
      className="absolute top-1/2 -translate-y-1/2 pointer-events-none overflow-hidden"
      style={{
        left: homeX,
        width: travel,
        height: wordmarkH,
        zIndex: 0,
        clipPath: `inset(0 ${clipRight}% 0 0)`,
        WebkitClipPath: `inset(0 ${clipRight}% 0 0)`,
      }}
    >
      <div className="relative" style={{ width: travel, height: wordmarkH }}>
        <motion.img
          src="/SHELFY_WORDMARK.svg"
          alt=""
          draggable={false}
          aria-hidden
          className={WORDMARK_IMG}
          style={{ width: travel, height: wordmarkH }}
          initial={false}
          animate={{ filter: neonActive ? NEON_BASE_FILTER : "none" }}
          transition={neonActive ? NEON_TRANSITION : { duration: 0 }}
        />
        <motion.img
          src="/SHELFY_WORDMARK-neon-fill.svg"
          alt=""
          draggable={false}
          aria-hidden
          className={`absolute inset-0 ${WORDMARK_IMG}`}
          style={{ width: travel, height: wordmarkH, mixBlendMode: "screen" }}
          initial={false}
          animate={{ opacity: neonActive ? NEON_FILL_OPACITY : 0 }}
          transition={neonActive ? NEON_TRANSITION : { duration: 0.2, ease: "easeOut" }}
        />
        <motion.img
          src="/SHELFY_WORDMARK-glow.svg"
          alt=""
          draggable={false}
          aria-hidden
          className={`absolute inset-0 ${WORDMARK_IMG}`}
          style={{ width: travel, height: wordmarkH, mixBlendMode: "screen" }}
          initial={false}
          animate={{ opacity: neonActive ? NEON_HALO_OPACITY : 0 }}
          transition={neonActive ? NEON_TRANSITION : { duration: 0.2, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

function AnimatedSweep({
  geometry,
  phase,
  onSweepComplete,
  onBounceComplete,
}: {
  geometry: Geometry;
  phase: Phase;
  onSweepComplete: () => void;
  onBounceComplete: () => void;
}) {
  const { homeX, travel, wordmarkH } = geometry;
  const isRest = phase === "rest";
  const isOut = phase === "sweepOut";
  const isHold = phase === "holdAtEnd";
  const isBack = phase === "bounceBack";
  const [iconX, setIconX] = useState(0);

  useEffect(() => {
    if (isHold) setIconX(travel);
    if (isRest) setIconX(0);
  }, [isHold, isRest, travel]);

  const iconTargetX = isHold || isOut ? travel : 0;
  const showEraser = isBack && iconX > 6;

  return (
    <>
      {!isRest && (
        <WordTrail
          homeX={homeX}
          travel={travel}
          wordmarkH={wordmarkH}
          phase={phase}
          iconX={iconX}
          neonActive={isHold}
        />
      )}

      <motion.div
        className="absolute top-1/2 -translate-y-1/2 will-change-transform"
        style={{ left: homeX, zIndex: 10 }}
        initial={false}
        animate={{ x: iconTargetX }}
        transition={
          isHold || isRest ? { duration: 0 } : SWEEP_TRANSITION
        }
        onUpdate={(latest) => {
          if (isHold || isRest) return;
          const x = typeof latest.x === "number" ? latest.x : 0;
          setIconX(x);
        }}
        onAnimationComplete={() => {
          if (isOut) onSweepComplete();
          if (isBack) onBounceComplete();
        }}
      >
        <BrandIcon eraser={showEraser} />
      </motion.div>
    </>
  );
}

function DevPlayButton({ onPlay }: { onPlay: () => void }) {
  if (!IS_DEV) return null;

  return (
    <button
      type="button"
      onClick={onPlay}
      title="Play brand sweep (dev)"
      className="fixed top-16 left-3 z-[100] hidden md:flex items-center gap-1 rounded-md border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] px-2 py-1 text-[10px] font-semibold text-[var(--shelfy-primary)] shadow-md hover:bg-[var(--shelfy-primary)]/10 pointer-events-auto"
    >
      <Play size={11} fill="currentColor" />
      Brand sweep
    </button>
  );
}

export function TopbarBrandSweep({ headerRef, evaluarRef }: Props) {
  const reduceMotion = useReducedMotion();
  const logoSlotRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [phase, setPhase] = useState<Phase>("rest");

  const phaseRef = useRef<Phase>("rest");
  const animatingRef = useRef(false);
  const intervalRef = useRef<number | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const bootTimerRef = useRef<number | null>(null);

  const staticOnly =
    reduceMotion ||
    (typeof window !== "undefined" && window.innerWidth < 768);

  const syncPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
    animatingRef.current = next !== "rest";
  }, []);

  const remeasure = useCallback(() => {
    const header = headerRef.current;
    const tab = evaluarRef.current;
    const logoSlot = logoSlotRef.current;
    if (!header || !tab || !logoSlot) return;
    const geo = measureGeometry(header, tab, logoSlot);
    if (geo) setGeometry(geo);
  }, [headerRef, evaluarRef]);

  const clearTimers = useCallback(() => {
    if (holdTimerRef.current != null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (bootTimerRef.current != null) {
      window.clearTimeout(bootTimerRef.current);
      bootTimerRef.current = null;
    }
  }, []);

  const beginCycle = useCallback(() => {
    if (animatingRef.current || phaseRef.current !== "rest") return;
    clearTimers();
    remeasure();
    syncPhase("sweepOut");
  }, [clearTimers, remeasure, syncPhase]);

  const playAnimation = useCallback(() => {
    clearTimers();
    animatingRef.current = false;
    syncPhase("rest");
    window.requestAnimationFrame(() => {
      remeasure();
      syncPhase("sweepOut");
      animatingRef.current = true;
    });
  }, [clearTimers, remeasure, syncPhase]);

  useLayoutEffect(() => {
    if (staticOnly) return;

    let cancelled = false;
    let attempts = 0;

    const tryMeasure = () => {
      if (cancelled) return;
      const header = headerRef.current;
      const tab = evaluarRef.current;
      const logoSlot = logoSlotRef.current;
      if (!header || !tab || !logoSlot) {
        if (attempts++ < 48) requestAnimationFrame(tryMeasure);
        return;
      }
      const geo = measureGeometry(header, tab, logoSlot);
      if (geo) setGeometry(geo);
    };

    tryMeasure();
    window.addEventListener("resize", remeasure);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", remeasure);
    };
  }, [headerRef, evaluarRef, staticOnly, remeasure]);

  useEffect(() => {
    if (staticOnly || !geometry) return;
    if (IS_DEV) return;

    bootTimerRef.current = window.setTimeout(beginCycle, BOOT_DELAY_MS);
    intervalRef.current = window.setInterval(() => {
      if (phaseRef.current === "rest" && !animatingRef.current) {
        beginCycle();
      }
    }, REPEAT_MS);

    return () => {
      if (bootTimerRef.current != null) window.clearTimeout(bootTimerRef.current);
      if (intervalRef.current != null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [geometry, staticOnly, beginCycle]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const handleSweepComplete = useCallback(() => {
    if (phaseRef.current !== "sweepOut") return;
    syncPhase("holdAtEnd");
    if (holdTimerRef.current != null) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = window.setTimeout(() => {
      if (phaseRef.current === "holdAtEnd") syncPhase("bounceBack");
    }, HOLD_MS);
  }, [syncPhase]);

  const handleBounceComplete = useCallback(() => {
    if (phaseRef.current !== "bounceBack") return;
    syncPhase("rest");
  }, [syncPhase]);

  const restIcon = (
    <div className="hidden md:flex shrink-0 items-center justify-center" style={{ width: ICON_PX, height: ICON_PX }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/WEBICON.svg"
        alt="Shelfy"
        draggable={false}
        className="block select-none"
        style={{
          width: ICON_PX,
          height: ICON_PX,
          borderRadius: ICON_RADIUS,
          transform: "scale(1.06)",
        }}
      />
    </div>
  );

  if (staticOnly) return restIcon;

  return (
    <>
      {/* Spacer reserva el hueco; el ícono vive siempre en el overlay (sin swap al volver a rest). */}
      <div
        ref={logoSlotRef}
        className="hidden md:block shrink-0"
        style={{ width: ICON_PX, height: ICON_PX }}
        aria-hidden
      />

      {geometry && (
        <div className="hidden md:block absolute inset-0 pointer-events-none z-[45] overflow-visible" aria-hidden>
          <AnimatedSweep
            geometry={geometry}
            phase={phase}
            onSweepComplete={handleSweepComplete}
            onBounceComplete={handleBounceComplete}
          />
        </div>
      )}

      <DevPlayButton onPlay={playAnimation} />
    </>
  );
}
