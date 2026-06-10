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

function buildNeonOpacity(steps: number): number[] {
  return Array.from({ length: steps }, (_, i) => {
    const t = i / steps;
    const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 2.05);
    const pulse2 = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 2.05 + 1.35);
    return 0.28 + 0.52 * pulse + 0.18 * pulse2;
  });
}

const NEON_OPACITY = buildNeonOpacity(NEON_STEPS);
const NEON_TIMES = Array.from({ length: NEON_STEPS }, (_, i) => i / (NEON_STEPS - 1));

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

function measureGeometry(header: HTMLElement, tab: HTMLElement): Geometry | null {
  const hr = header.getBoundingClientRect();
  const er = tab.getBoundingClientRect();
  const homeX = 16;
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/SHELFY_WORDMARK.svg"
          alt=""
          draggable={false}
          aria-hidden
          className={WORDMARK_IMG}
          style={{ width: travel, height: wordmarkH }}
        />
        {neonActive && (
          <motion.img
            src="/SHELFY_WORDMARK-glow.svg"
            alt=""
            draggable={false}
            aria-hidden
            className={`absolute inset-0 ${WORDMARK_IMG}`}
            style={{ width: travel, height: wordmarkH }}
            initial={false}
            animate={{ opacity: NEON_OPACITY }}
            transition={{
              duration: 2.1,
              repeat: Infinity,
              ease: "linear",
              times: NEON_TIMES,
            }}
          />
        )}
      </div>
    </div>
  );
}

function AnimatedSweep({
  geometry,
  phase,
  cycle,
  onSweepComplete,
  onBounceComplete,
}: {
  geometry: Geometry;
  phase: Exclude<Phase, "rest">;
  cycle: number;
  onSweepComplete: () => void;
  onBounceComplete: () => void;
}) {
  const { homeX, travel, wordmarkH } = geometry;
  const isOut = phase === "sweepOut";
  const isHold = phase === "holdAtEnd";
  const isBack = phase === "bounceBack";
  const [iconX, setIconX] = useState(isOut ? 0 : travel);

  useEffect(() => {
    if (isHold) setIconX(travel);
  }, [isHold, travel]);

  return (
    <>
      <WordTrail
        homeX={homeX}
        travel={travel}
        wordmarkH={wordmarkH}
        phase={phase}
        iconX={iconX}
        neonActive={isHold}
      />

      {isHold ? (
        <div
          className="absolute top-1/2 -translate-y-1/2"
          style={{ left: homeX + travel, zIndex: 10 }}
        >
          <BrandIcon />
        </div>
      ) : (
        <motion.div
          key={`${cycle}-${phase}-icon`}
          className="absolute top-1/2 -translate-y-1/2 will-change-transform"
          style={{ left: homeX, zIndex: 10 }}
          initial={{ x: isOut ? 0 : travel }}
          animate={{ x: isOut ? travel : 0 }}
          transition={SWEEP_TRANSITION}
          onUpdate={(latest) => {
            const x = typeof latest.x === "number" ? latest.x : 0;
            setIconX(x);
          }}
          onAnimationComplete={() => {
            if (isOut) onSweepComplete();
            if (isBack) onBounceComplete();
          }}
        >
          <BrandIcon eraser={isBack} />
        </motion.div>
      )}
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
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [phase, setPhase] = useState<Phase>("rest");
  const [cycle, setCycle] = useState(0);

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
    if (!header || !tab) return;
    const geo = measureGeometry(header, tab);
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
    setCycle((c) => c + 1);
    syncPhase("sweepOut");
  }, [clearTimers, remeasure, syncPhase]);

  const playAnimation = useCallback(() => {
    clearTimers();
    animatingRef.current = false;
    syncPhase("rest");
    window.requestAnimationFrame(() => {
      remeasure();
      setCycle((c) => c + 1);
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
      if (!header || !tab) {
        if (attempts++ < 48) requestAnimationFrame(tryMeasure);
        return;
      }
      const geo = measureGeometry(header, tab);
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

  if (staticOnly || !geometry) return restIcon;

  return (
    <>
      <div
        className="hidden md:flex shrink-0 items-center justify-center overflow-hidden"
        style={{ width: ICON_PX, height: ICON_PX, borderRadius: ICON_RADIUS }}
      >
        {phase === "rest" && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src="/WEBICON.svg"
            alt="Shelfy"
            draggable={false}
            className="block select-none"
            style={{ width: ICON_PX, height: ICON_PX, transform: "scale(1.06)" }}
          />
        )}
      </div>

      {phase !== "rest" && (
        <div className="hidden md:block absolute inset-0 pointer-events-none z-[45] overflow-visible" aria-hidden>
          <AnimatedSweep
            geometry={geometry}
            phase={phase}
            cycle={cycle}
            onSweepComplete={handleSweepComplete}
            onBounceComplete={handleBounceComplete}
          />
        </div>
      )}

      <DevPlayButton onPlay={playAnimation} />
    </>
  );
}
