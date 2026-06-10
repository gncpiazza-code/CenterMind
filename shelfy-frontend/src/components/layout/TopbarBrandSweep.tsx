"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

const ICON_PX = 40;
const WORDMARK_H = 15;
const WORDMARK_ASPECT = 1575 / 510;
const TRAIL_GAP = 4;
const SWEEP_DURATION = 1.2;
const REPEAT_MS = 30_000;
const SWEEP_EASE = [0.16, 1, 0.3, 1] as const;
const BOUNCE_SPRING = { type: "spring" as const, stiffness: 400, damping: 26, mass: 0.8 };

type Phase = "rest" | "sweepOut" | "bounceBack";

type Props = {
  headerRef: React.RefObject<HTMLElement | null>;
  evaluarRef: React.RefObject<HTMLElement | null>;
};

type Geometry = {
  homeX: number;
  travel: number;
  wordmarkW: number;
};

function BrandRestIcon() {
  return (
    <div
      className="hidden md:flex items-center justify-center shrink-0"
      style={{ width: ICON_PX, height: ICON_PX }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/WEBICON.svg"
        alt="Shelfy"
        className="object-contain"
        style={{ width: ICON_PX, height: ICON_PX }}
      />
    </div>
  );
}

function measureGeometry(header: HTMLElement, tab: HTMLElement): Geometry | null {
  const hr = header.getBoundingClientRect();
  const er = tab.getBoundingClientRect();
  const wordmarkW = Math.round(WORDMARK_H * WORDMARK_ASPECT);
  const homeX = 16;
  const targetX = er.left - hr.left - ICON_PX - 10;
  const travel = targetX - homeX;
  if (travel < 48) return null;
  return { homeX, travel, wordmarkW };
}

function SweepLayers({
  geometry,
  phase,
  cycle,
  onSweepComplete,
  onBounceComplete,
}: {
  geometry: Geometry;
  phase: "sweepOut" | "bounceBack";
  cycle: number;
  onSweepComplete: () => void;
  onBounceComplete: () => void;
}) {
  const { homeX, travel, wordmarkW } = geometry;
  const sweepTransition = { duration: SWEEP_DURATION, ease: SWEEP_EASE };
  const isOut = phase === "sweepOut";

  return (
    <div
      className="hidden md:block absolute inset-0 pointer-events-none z-[45]"
      aria-hidden
    >
      <motion.div
        key={`${cycle}-${phase}`}
        className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center will-change-transform"
        style={{
          left: homeX,
          width: ICON_PX,
        }}
        initial={{ x: isOut ? 0 : travel }}
        animate={{ x: isOut ? travel : 0 }}
        transition={isOut ? sweepTransition : BOUNCE_SPRING}
        onAnimationComplete={() => {
          if (isOut) onSweepComplete();
          else onBounceComplete();
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/WEBICON.svg"
          alt=""
          className="relative z-10 object-contain"
          style={{ width: ICON_PX, height: ICON_PX }}
        />

        <motion.div
          className="relative z-0 overflow-hidden"
          style={{
            marginTop: TRAIL_GAP,
            height: WORDMARK_H,
            width: wordmarkW,
          }}
          initial={{
            clipPath: isOut ? "inset(0 100% 0 0)" : "inset(0 0% 0 0)",
          }}
          animate={{
            clipPath: isOut ? "inset(0 0% 0 0)" : "inset(0 100% 0 0)",
          }}
          transition={isOut ? sweepTransition : BOUNCE_SPRING}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/SHELFY_WORDMARK.svg"
            alt=""
            className="block object-contain object-left"
            style={{ height: WORDMARK_H, width: wordmarkW }}
          />
        </motion.div>
      </motion.div>
    </div>
  );
}

export function TopbarBrandSweep({ headerRef, evaluarRef }: Props) {
  const reduceMotion = useReducedMotion();
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [phase, setPhase] = useState<Phase>("rest");
  const [cycle, setCycle] = useState(0);
  const repeatTimerRef = useRef<number | null>(null);

  const staticOnly =
    reduceMotion ||
    (typeof window !== "undefined" && window.innerWidth < 768);

  const remeasure = useCallback(() => {
    const header = headerRef.current;
    const tab = evaluarRef.current;
    if (!header || !tab) return;
    const geo = measureGeometry(header, tab);
    if (geo) setGeometry(geo);
  }, [headerRef, evaluarRef]);

  const startCycle = useCallback(() => {
    remeasure();
    setCycle((c) => c + 1);
    setPhase("sweepOut");
  }, [remeasure]);

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

    let cancelled = false;

    const schedule = () => {
      if (cancelled) return;
      repeatTimerRef.current = window.setTimeout(() => {
        if (cancelled) return;
        startCycle();
        schedule();
      }, REPEAT_MS);
    };

    const boot = window.setTimeout(() => {
      if (cancelled) return;
      startCycle();
      schedule();
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(boot);
      if (repeatTimerRef.current != null) {
        window.clearTimeout(repeatTimerRef.current);
      }
    };
  }, [geometry, staticOnly, startCycle]);

  const handleSweepComplete = useCallback(() => {
    setPhase("bounceBack");
  }, []);

  const handleBounceComplete = useCallback(() => {
    setPhase("rest");
  }, []);

  if (staticOnly) return <BrandRestIcon />;

  if (!geometry) return <BrandRestIcon />;

  return (
    <>
      {phase === "rest" ? (
        <BrandRestIcon />
      ) : (
        <div
          className="hidden md:block shrink-0"
          style={{ width: ICON_PX, height: ICON_PX }}
          aria-hidden
        />
      )}
      {phase !== "rest" && (
        <SweepLayers
          geometry={geometry}
          phase={phase}
          cycle={cycle}
          onSweepComplete={handleSweepComplete}
          onBounceComplete={handleBounceComplete}
        />
      )}
    </>
  );
}
