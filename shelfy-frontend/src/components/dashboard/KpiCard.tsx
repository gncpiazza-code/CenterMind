"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { motion, useIsPresent } from "framer-motion";
import { Card, CardContent } from "@/components/ui/Card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Mejora #14: mapa semántico de color → CSS variable / tailwind class
export type KpiColorName = "amber" | "emerald" | "violet" | "red" | "blue" | "slate";

export const COLOR_MAP: Record<KpiColorName, { hex: string; bg: string; badge: string; ring: string }> = {
  amber:   { hex: "#f59e0b", bg: "bg-amber-500",   badge: "bg-amber-50 text-amber-700 border-amber-200/60",    ring: "ring-amber-200" },
  emerald: { hex: "#10b981", bg: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 border-emerald-200/60", ring: "ring-emerald-200" },
  violet:  { hex: "#8b5cf6", bg: "bg-violet-500",  badge: "bg-violet-50/70 text-violet-700 border-violet-200/60",  ring: "ring-violet-200" },
  red:     { hex: "#ef4444", bg: "bg-red-500",     badge: "bg-red-50 text-red-600 border-red-200/60",           ring: "ring-red-200" },
  blue:    { hex: "#3b82f6", bg: "bg-blue-500",    badge: "bg-blue-50 text-blue-600 border-blue-200/60",        ring: "ring-blue-200" },
  slate:   { hex: "#64748b", bg: "bg-slate-500",   badge: "bg-slate-50 text-slate-600 border-slate-200/60",     ring: "ring-slate-200" },
};

interface KpiCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  /** Nombre semántico del color. Fallback a `color` hex si se omite. */
  colorName?: KpiColorName;
  /** @deprecated Usar colorName. Se mantiene por compatibilidad. */
  color?: string;
  bgColor?: string;
  delta?: number;
  /** Cuando se provee, la barra de progreso es real (valor/total). Sin total, no se muestra barra. Mejora #9 */
  total?: number;
  /** Subtítulo debajo del label — ej. porcentaje de tasa */
  subtitle?: string;
  /** Layout variant. 'compact' renders a slim horizontal row (~56–64px tall). Default: 'default'. */
  variant?: 'default' | 'compact';
  /** Texto del tooltip para la definición del KPI */
  tooltip?: string;
  /** Sufijo después del valor (ej. "%") */
  suffix?: string;
  /** Si true, formatea el valor con 1 decimal (para promedios) */
  isDecimal?: boolean;
  /** Si true, estilo plano alto contraste para proyección TV */
  immersive?: boolean;
  /** Cambia al rotar el carrusel — activa animación tragaperras del número */
  slotSpinKey?: number;
  /** Retraso escalonado por card (ms) */
  slotDelayMs?: number;
  /** Mobile dashboard: icono/label más compactos, label en 2 líneas */
  mobileTight?: boolean;
}

// Mejora #1: Contador animado easeOut
function useAnimatedCounter(target: number, duration = 800) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const diff = target - from;
    if (diff === 0) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    startRef.current = null;

    function step(ts: number) {
      if (!startRef.current) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + diff * eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
      }
    }

    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return display;
}

function formatKpiDisplay(value: number, isDecimal?: boolean) {
  if (isDecimal) return value.toFixed(1).replace(".", ",");
  return new Intl.NumberFormat("es-AR").format(Math.round(value));
}

function randomSpinValue(target: number, isDecimal?: boolean) {
  if (isDecimal) {
    return (Math.random() * Math.max(target * 1.4, 10)).toFixed(1).replace(".", ",");
  }
  return new Intl.NumberFormat("es-AR").format(
    Math.floor(Math.random() * Math.max(target * 1.25, 12)),
  );
}

const SLOT_LABEL_MASK_STYLE: React.CSSProperties = {
  WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 6%, black 94%, transparent 100%)",
  maskImage: "linear-gradient(to bottom, transparent 0%, black 6%, black 94%, transparent 100%)",
};

const SLOT_EASE = [0.06, 0.88, 0.14, 1.04] as const;

/** Duración compartida: nro y label giran hasta que la card aterriza */
export const KPI_SLOT_CARD_SETTLE_MS = 780;
/** Ventana total salida (carrete + stagger) — alinear con AnimatePresence */
export const KPI_SLOT_TRANSITION_MS = KPI_SLOT_CARD_SETTLE_MS + 140;

export type SlotPhase = "enter" | "exit";

const SlotAnimationContext = createContext<SlotPhase>("enter");

export function useSlotPhase(): SlotPhase {
  return useContext(SlotAnimationContext);
}

/** Detecta salida del slide (AnimatePresence) para tragaperras inversa */
export function KpiSlidePanel({ children }: { children: React.ReactNode }) {
  const isPresent = useIsPresent();
  const phase: SlotPhase = isPresent ? "enter" : "exit";
  return (
    <SlotAnimationContext.Provider value={phase}>
      {children}
    </SlotAnimationContext.Provider>
  );
}

function slotTransition(delayMs: number, durationMs?: number, extraDuration = 0) {
  const duration = durationMs != null
    ? durationMs / 1000 + extraDuration
    : 0.95 + delayMs / 1200 + extraDuration;
  return {
    delay: delayMs / 1000,
    duration,
    ease: SLOT_EASE,
  };
}

/** Alineado a shelfy-kpi-card-reference.svg (valor 42px, label 11px) */
const VALUE_ROW_CSS = "clamp(1.5rem, 5vw, 2.625rem)";
const LABEL_ROW_CSS = "clamp(1.05rem, 2.4vw, 1.3rem)";

const COMPACT_BORDER: Record<KpiColorName, string> = {
  amber: "border-amber-200/90",
  emerald: "border-emerald-200/90",
  violet: "border-violet-200/90",
  red: "border-red-200/90",
  blue: "border-blue-200/90",
  slate: "border-slate-200/90",
};

const COMPACT_SHADOW: Record<KpiColorName, string> = {
  amber: "shadow-amber-500/10",
  emerald: "shadow-emerald-500/12",
  violet: "shadow-violet-500/12",
  red: "shadow-red-500/10",
  blue: "shadow-blue-500/10",
  slate: "shadow-slate-500/8",
};

type SlotDirection = "rise" | "fall";

/** Carrete vertical: rise = valor sube (abajo→arriba), fall = baja (arriba→abajo) */
function SlotReel({
  spinKey,
  delayMs,
  spinDurationMs = KPI_SLOT_CARD_SETTLE_MS,
  rowHeightRem,
  rowHeightCss,
  rowCount,
  direction = "rise",
  masked = false,
  className,
  children,
}: {
  spinKey: number;
  delayMs: number;
  /** Misma ventana que la card: frenan juntos */
  spinDurationMs?: number;
  rowHeightRem?: number;
  rowHeightCss?: string;
  rowCount: number;
  direction?: SlotDirection;
  /** Máscara de fade solo en labels; números sin difuminar */
  masked?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const phase = useSlotPhase();
  const rowH = rowHeightCss ?? `${rowHeightRem ?? 2.5}rem`;
  const travelY = rowHeightCss
    ? `calc(-1 * (${rowCount - 1}) * (${rowH}))`
    : `-${(rowCount - 1) * (rowHeightRem ?? 2.5)}rem`;
  const enterInitial = direction === "rise" ? 0 : travelY;
  const enterAnimate = direction === "rise" ? travelY : 0;
  const settleY = enterAnimate;
  const exitY = enterInitial;

  return (
    <div
      className={cn("relative overflow-hidden w-full", className)}
      style={{
        height: rowH,
        ...(masked ? SLOT_LABEL_MASK_STYLE : undefined),
      }}
    >
      <motion.div
        key={`${spinKey}-${rowCount}-${delayMs}-${direction}`}
        initial={phase === "enter" ? { y: enterInitial } : false}
        animate={{ y: phase === "enter" ? settleY : exitY }}
        transition={slotTransition(delayMs, spinDurationMs)}
        className="flex flex-col will-change-transform"
      >
        {children}
      </motion.div>
    </div>
  );
}

function SlotValue({
  value,
  isDecimal,
  suffix,
  spinKey = 0,
  delayMs = 0,
  className,
  style,
  suffixClassName,
}: {
  value: number;
  isDecimal?: boolean;
  suffix?: string;
  spinKey?: number;
  delayMs?: number;
  className?: string;
  style?: React.CSSProperties;
  suffixClassName?: string;
}) {
  const strip = useMemo(() => {
    const rows: string[] = [];
    const spins = 18;
    for (let i = 0; i < spins - 1; i++) rows.push(randomSpinValue(value, isDecimal));
    rows.push(formatKpiDisplay(value, isDecimal));
    return rows;
  }, [spinKey, value, isDecimal]);

  return (
    <SlotReel
      spinKey={spinKey}
      delayMs={delayMs}
      spinDurationMs={KPI_SLOT_CARD_SETTLE_MS}
      rowHeightCss={VALUE_ROW_CSS}
      rowCount={strip.length}
      direction="rise"
      masked={false}
    >
      {strip.map((row, i) => {
        const isFinal = i === strip.length - 1;
        return (
          <div
            key={`${spinKey}-v-${i}`}
            className={cn(
              "flex items-center justify-start w-full shrink-0 font-black tracking-tighter tabular-nums leading-[1.05] text-left",
              className,
            )}
            style={{ height: VALUE_ROW_CSS, minHeight: VALUE_ROW_CSS, ...style }}
          >
            {row}
            {suffix && isFinal && (
              <span className={cn("ml-1 font-black", suffixClassName)} style={{ color: style?.color }}>
                {suffix}
              </span>
            )}
          </div>
        );
      })}
    </SlotReel>
  );
}

function SlotLabel({
  label,
  spinKey = 0,
  delayMs = 0,
  className,
}: {
  label: string;
  spinKey?: number;
  delayMs?: number;
  className?: string;
}) {
  const strip = useMemo(() => {
    const fillers = ["····", "––––", "···", "––––", "····", "––––", "···", "––––", "····"];
    return [...fillers.slice(0, 11), label];
  }, [spinKey, label]);

  return (
    <SlotReel
      spinKey={spinKey}
      delayMs={delayMs}
      spinDurationMs={KPI_SLOT_CARD_SETTLE_MS}
      rowHeightCss={LABEL_ROW_CSS}
      rowCount={strip.length}
      direction="rise"
      masked={false}
    >
      {strip.map((row, i) => (
        <div
          key={`${spinKey}-l-${i}`}
          className={cn(
            "flex items-center justify-start w-full shrink-0 font-black uppercase tracking-[0.06em] leading-snug whitespace-normal text-left px-0",
            className,
          )}
          style={{ height: LABEL_ROW_CSS }}
        >
          {row}
        </div>
      ))}
    </SlotReel>
  );
}

/** Card real arriba; baja por el carrete (arriba → abajo) */
export function KpiCardSlotWrapper({
  spinKey,
  delayMs,
  accentColor,
  immersive = false,
  children,
}: {
  spinKey: number;
  delayMs: number;
  accentColor: string;
  immersive?: boolean;
  children: React.ReactNode;
}) {
  const phase = useSlotPhase();
  const ghostRows = 3;
  const total = ghostRows + 1;
  const slicePct = 100 / total;
  const startY = `${ghostRows * slicePct}%`;

  return (
    <div className="h-full min-h-0 overflow-hidden rounded-[2rem]" style={SLOT_LABEL_MASK_STYLE}>
      <motion.div
        key={`card-wrap-${spinKey}-${delayMs}`}
        className="flex flex-col w-full"
        style={{ height: `${total * 100}%` }}
        initial={phase === "enter" ? { y: startY } : false}
        animate={{ y: phase === "enter" ? 0 : startY }}
        transition={slotTransition(delayMs, KPI_SLOT_CARD_SETTLE_MS, 0.05)}
      >
        <div className="w-full shrink-0" style={{ height: `${slicePct}%` }}>
          {children}
        </div>
        {Array.from({ length: ghostRows }).map((_, i) => (
          <div key={i} className="w-full shrink-0" style={{ height: `${slicePct}%` }}>
            <div
              className={cn(
                "h-full w-full rounded-[2rem] border-2 border-dashed",
                immersive
                  ? "border-slate-600/80 bg-slate-800/40"
                  : "border-slate-200/90 bg-white/50",
              )}
              style={{ borderLeftWidth: 4, borderLeftColor: accentColor }}
            />
          </div>
        ))}
      </motion.div>
    </div>
  );
}

export function KpiCard({
  label, value, icon, colorName, color, bgColor = "bg-white", delta, total, subtitle,
  variant = "default", tooltip, suffix, isDecimal, immersive = false,
  slotSpinKey, slotDelayMs = 0, mobileTight = false,
}: KpiCardProps) {
  const isCompact = variant === 'compact';
  const animatedValue = useAnimatedCounter(value);

  // Mejora #14: resolver color desde nombre semántico o fallback a hex
  const resolved = colorName ? COLOR_MAP[colorName] : null;
  const hexColor  = resolved?.hex  ?? color ?? "#8b5cf6";
  const bgClass   = resolved?.bg   ?? "bg-violet-500";
  const badgeClass = resolved?.badge ?? "bg-violet-50 text-violet-700 border-violet-200/60";
  const ringClass  = resolved?.ring  ?? "ring-violet-200";

  // Mejora #3: Font size adaptativo
  const valueFontClass = value >= 1000 ? "text-2xl" : value >= 100 ? "text-3xl" : "text-4xl";

  // Mejora #9: barra de progreso solo cuando hay total real (sin fallback engañoso)
  const progressPct = total != null && total > 0 ? Math.min((value / total) * 100, 100) : null;

  // Mejora #25: Flash ring al cambiar value
  const [flashing, setFlashing] = useState(false);
  const prevValueRef = useRef(value);
  useEffect(() => {
    if (prevValueRef.current !== value) {
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), 600);
      prevValueRef.current = value;
      return () => clearTimeout(t);
    }
  }, [value]);

  const useSlot = slotSpinKey !== undefined && isCompact;
  /** Mismo inicio que la card; frenan cuando la card aterriza */
  const valueSpinDelay = slotDelayMs;
  const labelSpinDelay = slotDelayMs;
  const compactValueClass = immersive
    ? mobileTight
      ? "text-[clamp(1.1rem,4.5vw,1.65rem)] tracking-[-0.03em]"
      : "text-[clamp(1.35rem,5vw,2.625rem)] tracking-[-0.04em]"
    : mobileTight
      ? "text-[clamp(1.1rem,4.5vw,1.65rem)] tracking-[-0.03em]"
      : "text-[clamp(1.35rem,5vw,2.625rem)] tracking-[-0.04em]";
  const compactLabelClass = immersive
    ? mobileTight
      ? "text-[9px] text-slate-400 tracking-[0.08em] leading-[1.2] line-clamp-2 normal-case"
      : "text-[11px] text-slate-400 tracking-[0.12em]"
    : mobileTight
      ? "text-[9px] text-slate-600 tracking-[0.08em] leading-[1.2] line-clamp-2 normal-case group-hover:text-slate-800 transition-colors"
      : "text-[11px] text-slate-600 tracking-[0.12em] group-hover:text-slate-800 transition-colors";
  const compactSuffixClass = immersive ? "text-xl" : "text-lg";
  const compactBorder = colorName ? COMPACT_BORDER[colorName] : "border-slate-200/90";
  const compactShadow = colorName ? COMPACT_SHADOW[colorName] : "shadow-slate-500/8";

  return (
    <motion.div
      initial={useSlot ? false : { opacity: 0, y: 10 }}
      animate={useSlot ? undefined : { opacity: 1, y: 0 }}
      whileHover={{ y: -4, transition: { duration: 0.18 } }}
      className="h-full"
    >
      <Card
        className={cn(
          "rounded-[2rem] overflow-hidden relative group h-full transition-shadow duration-300",
          immersive
            ? "bg-slate-900 border border-slate-700 shadow-none"
            : "shadow-sm",
          isCompact
            ? immersive ? "p-0 border border-slate-700" : cn("p-0 border-2 shadow-md", compactBorder, compactShadow)
            : "p-5 border border-slate-200/60",
          !immersive && !isCompact && "border-slate-200/60",
          !immersive && bgColor,
          flashing && !immersive && `ring-2 ${ringClass}`,
        )}
        style={isCompact ? { borderLeftWidth: 4, borderLeftColor: hexColor } : undefined}
      >
        {/* Decorative background circle — hidden in compact */}
        {!isCompact && (
          <div
            className="absolute -right-4 -top-4 w-24 h-24 rounded-full opacity-[0.06] group-hover:scale-150 group-hover:opacity-[0.08] transition-all duration-700"
            style={{ backgroundColor: hexColor }}
          />
        )}

        {isCompact ? (
          /* ── Compact Figma ref: bloque icono+nro+label centrado, acento izq 4px ── */
          <CardContent className={cn(
            "p-0 flex h-full w-full items-center justify-start min-h-0",
            mobileTight ? "pl-2 pr-1.5 py-1.5" : "pl-3 pr-2 py-2 sm:pl-4 sm:pr-3 sm:py-2.5",
          )}>
            <div className={cn(
              "flex min-w-0 max-w-full flex-row items-center",
              mobileTight ? "gap-2" : "gap-2.5 sm:gap-3",
            )}>
            <div
              className={cn(
                "flex shrink-0 items-center justify-center rounded-2xl text-white",
                mobileTight
                  ? "size-10 [&_svg]:size-5"
                  : "size-12 sm:size-14 [&_svg]:size-7 sm:[&_svg]:size-7",
              )}
              style={{
                backgroundColor: hexColor,
                boxShadow: immersive ? undefined : `0 4px 14px ${hexColor}40`,
              }}
            >
              {icon}
            </div>
            <div className="flex min-w-0 flex-col items-start justify-center gap-1">
              {useSlot ? (
                <div className="w-full min-w-0">
                  <SlotValue
                    value={value}
                    isDecimal={isDecimal}
                    suffix={suffix}
                    spinKey={slotSpinKey}
                    delayMs={valueSpinDelay}
                    className={compactValueClass}
                    suffixClassName={compactSuffixClass}
                    style={{ color: hexColor }}
                  />
                </div>
              ) : (
                <div
                  className={cn("font-black tracking-tighter leading-none text-left w-full", compactValueClass)}
                  style={{ color: hexColor }}
                >
                  {isDecimal ? value.toFixed(1).replace(".", ",") : animatedValue}
                  {suffix && <span className={cn(compactSuffixClass, "ml-0.5")}>{suffix}</span>}
                </div>
              )}
              {useSlot ? (
                tooltip ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="cursor-help underline decoration-dashed decoration-slate-300 w-full min-w-0">
                          <SlotLabel
                            label={label}
                            spinKey={slotSpinKey}
                            delayMs={labelSpinDelay}
                            className={compactLabelClass}
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[220px] text-xs font-bold">
                        {tooltip}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <div className="w-full min-w-0">
                    <SlotLabel
                      label={label}
                      spinKey={slotSpinKey}
                      delayMs={labelSpinDelay}
                      className={compactLabelClass}
                    />
                  </div>
                )
              ) : tooltip ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className={cn(
                        "font-black uppercase tracking-[0.06em] leading-snug whitespace-normal text-left w-full cursor-help underline decoration-dashed decoration-slate-300",
                        compactLabelClass,
                      )}>
                        {label}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[220px] text-xs font-bold">
                      {tooltip}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <div className={cn("font-black uppercase tracking-[0.06em] leading-snug whitespace-normal text-left w-full", compactLabelClass)}>
                  {label}
                </div>
              )}
            </div>
            </div>
          </CardContent>
        ) : (
          /* ── Default layout: vertical card ── */
          <CardContent className="p-0 flex flex-col justify-between h-full">
            <div className="flex items-start justify-between relative z-10">
              <div className={cn("p-2.5 rounded-2xl text-white shadow-lg ring-4 ring-white/10 shrink-0", bgClass)}>
                {icon}
              </div>
            </div>

            {/* Valor con contador animado — debajo del icono, siempre visible */}
            <div className="mt-2 relative z-10">
              <div
                className={cn("font-black tracking-tighter leading-none", valueFontClass)}
                style={{ color: hexColor }}
              >
                {animatedValue}
              </div>
            </div>

            <div className="mt-2 relative z-10">
              {/* Mejora #15: jerarquía tipográfica — label más legible */}
              <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500 group-hover:text-slate-700 transition-colors">
                {label}
              </div>

              {/* Subtítulo opcional (ej. tasa de aprobación) */}
              {subtitle && (
                <div className="text-[10px] font-bold text-slate-400 mt-0.5 tracking-wide">{subtitle}</div>
              )}

              {/* Mejora #2: Delta badge */}
              {delta !== undefined && (
                <span className={cn(
                  "inline-block mt-1 text-[9px] font-black px-2 py-0.5 rounded-full border",
                  delta >= 0 ? badgeClass.replace(badgeClass.split(" ")[0], "bg-emerald-50").replace(badgeClass.split(" ")[1], "text-emerald-600").replace(badgeClass.split(" ")[2], "border-emerald-200/60") : "bg-red-50 text-red-500 border-red-200/60"
                )}>
                  {delta >= 0 ? "+" : ""}{delta}%
                </span>
              )}

              {/* Mejora #9: barra de progreso real solo si hay total */}
              {progressPct !== null && (
                <div className="h-1.5 w-full rounded-full bg-slate-100 mt-2.5 overflow-hidden">
                  <motion.div
                    className="h-1.5 rounded-full"
                    style={{ backgroundColor: hexColor }}
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPct}%` }}
                    transition={{ duration: 0.9, ease: "easeOut" }}
                  />
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>
    </motion.div>
  );
}
