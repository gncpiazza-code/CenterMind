"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle, XCircle, Star, Clock,
  BarChart2, Users, TrendingUp, Store,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid,
  type DotProps,
} from "recharts";
import {
  KpiCard,
  KpiCardSlotWrapper,
  KpiSlidePanel,
  useSlotPhase,
  COLOR_MAP,
  KPI_SLOT_TRANSITION_MS,
  type KpiColorName,
} from "./KpiCard";
import { Skeleton } from "@/components/ui/skeleton";
import type { KPIs, EvolucionTiempo } from "@/lib/api";
import { cn } from "@/lib/utils";

interface DashboardKpiCarouselProps {
  kpis: KPIs | undefined;
  evolucion: EvolucionTiempo[];
  loading?: boolean;
  isDark?: boolean;
  /** Altura fija de la banda (px); si no se pasa, usa clases responsive */
  bandHeightPx?: number;
  /** Año/mes del período del gráfico (para día de la semana en picos) */
  chartYear?: number;
  chartMonth?: number;
  /** Vista mobile del dashboard: sin tragaperras (labels legibles en grid 2×2). */
  mobileOptimized?: boolean;
}

type SlideKey = 0 | 1 | 2;
const SLIDE_LABELS = ["Estados", "Evolución", "Rendimiento"];
const SLIDE_ROTATE_MS = 8000;
const SLIDE_HEIGHT_CLASS = "h-[160px] sm:h-[148px] md:h-[136px]";

function kpiBandSizing(bandHeightPx?: number) {
  if (bandHeightPx != null) {
    return {
      className: "shrink-0",
      style: { height: bandHeightPx, maxHeight: bandHeightPx, minHeight: bandHeightPx },
    };
  }
  return { className: SLIDE_HEIGHT_CLASS, style: undefined as React.CSSProperties | undefined };
}

function useCompactViewport() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setCompact(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return compact;
}

type PeakPoint = { rank: number; fecha: string; total: number };

/** Eje Y ceñido a los datos (+ padding mínimo para medallas arriba) */
function computeChartYDomain(data: EvolucionTiempo[]): [number, number] {
  if (data.length === 0) return [0, 10];
  let lo = Infinity;
  let hi = -Infinity;
  for (const row of data) {
    lo = Math.min(lo, row.aprobadas, row.total);
    hi = Math.max(hi, row.aprobadas, row.total);
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 10];
  const span = Math.max(hi - lo, 1);
  const padHi = Math.max(Math.round(span * 0.1), 18);
  return [0, Math.ceil(hi + padHi)];
}

/** Parsea día del mes desde fecha DD/MM (es-AR) */
function parseFechaDay(fecha: string): number | null {
  const parts = fecha.trim().split("/");
  if (parts.length < 2) return null;
  const day = Number.parseInt(parts[0], 10);
  return Number.isFinite(day) ? day : null;
}

/** Máximo día del mes presente en los datos del gráfico */
function maxDayInDataset(data: EvolucionTiempo[]): number {
  let max = 0;
  for (const row of data) {
    const day = parseFechaDay(row.fecha);
    if (day != null && day > max) max = day;
  }
  return max;
}

/**
 * Cuántos picos mostrar según avance del mes en los datos:
 * 1–5 → 1, 6–10 → 2, 11–15 → 3, 16–20 → 4, 21+ → 5
 */
function peakLimitForMonthProgress(maxDay: number): number {
  if (maxDay <= 0) return 0;
  if (maxDay <= 5) return 1;
  if (maxDay <= 10) return 2;
  if (maxDay <= 15) return 3;
  if (maxDay <= 20) return 4;
  return 5;
}

/** Top picos con separación mínima en el eje X para evitar solapamiento de etiquetas */
function computeTopPeaks(data: EvolucionTiempo[]): PeakPoint[] {
  if (data.length === 0) return [];

  const limit = peakLimitForMonthProgress(maxDayInDataset(data));
  if (limit === 0) return [];

  const indexed = data.map((row, index) => ({ ...row, index }));
  const minIndexGap = Math.max(3, Math.floor(data.length / Math.max(limit * 2, 1)));

  const sorted = [...indexed].sort((a, b) => b.total - a.total);
  const picked: { index: number; fecha: string; total: number }[] = [];

  for (const row of sorted) {
    if (picked.length >= limit) break;
    if (picked.every((p) => Math.abs(p.index - row.index) >= minIndexGap)) {
      picked.push({ index: row.index, fecha: row.fecha, total: row.total });
    }
  }

  return picked
    .sort((a, b) => b.total - a.total)
    .map((p, i) => ({ rank: i + 1, fecha: p.fecha, total: p.total }));
}

/** Ticks cada ~5 días de calendario (1, 6, 11, 16…) + primero y último del rango */
function buildRegularFechaTicks(data: EvolucionTiempo[]): string[] {
  if (data.length === 0) return [];
  const ticks: string[] = [];
  const seen = new Set<string>();

  data.forEach((row, i) => {
    const day = parseFechaDay(row.fecha);
    const onFiveDayGrid = day != null && (day === 1 || (day - 1) % 5 === 0);
    const isEdge = i === 0 || i === data.length - 1;
    if ((onFiveDayGrid || isEdge) && !seen.has(row.fecha)) {
      seen.add(row.fecha);
      ticks.push(row.fecha);
    }
  });

  return ticks;
}

function mergeXAxisTicks(data: EvolucionTiempo[], peakFechas: string[]): string[] {
  const order = new Map(data.map((r, i) => [r.fecha, i]));
  const merged = new Set([...buildRegularFechaTicks(data), ...peakFechas]);
  return [...merged].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

/** Etiqueta de pico en eje X: "Lun 04/05" (solo picos; fecha sigue siendo DD/MM en datos) */
function formatPeakFechaLabel(
  fecha: string,
  refYear: number,
  refMonth0: number,
): string {
  const parts = fecha.trim().split("/");
  if (parts.length < 2) return fecha;
  const day = Number.parseInt(parts[0], 10);
  const month = Number.parseInt(parts[1], 10) - 1;
  if (!Number.isFinite(day) || !Number.isFinite(month) || month < 0 || month > 11) return fecha;

  let year = refYear;
  if (month > refMonth0 + 1) year -= 1;

  const d = new Date(year, month, day, 12, 0, 0);
  if (Number.isNaN(d.getTime())) return fecha;

  const wd = new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  })
    .format(d)
    .replace(/\./g, "")
    .trim();
  const cap = wd ? wd.charAt(0).toUpperCase() + wd.slice(1) : wd;
  return cap ? `${cap} ${fecha}` : fecha;
}

const CARD_SLOT_SPRING = {
  type: "spring" as const,
  stiffness: 102,
  damping: 14,
  mass: 0.9,
};

type KpiCardConfig = {
  label: string;
  value: number;
  icon: React.ReactNode;
  colorName: KpiColorName;
  bgColor: string;
  suffix?: string;
  isDecimal?: boolean;
  tooltip?: string;
};

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur-md border border-slate-200/60 rounded-2xl p-3 shadow-xl">
      <p className="text-xs font-black text-slate-800 mb-1.5">{label}</p>
      {payload.map((e) => (
        <p key={e.name} className="text-xs font-bold" style={{ color: e.color }}>
          {e.name}: {e.value}
        </p>
      ))}
    </div>
  );
}

function SlideNav({
  slide,
  isDark,
  onSelect,
  bandHeightPx,
}: {
  slide: SlideKey;
  isDark: boolean;
  onSelect: (s: SlideKey) => void;
  bandHeightPx?: number;
}) {
  const band = kpiBandSizing(bandHeightPx);
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 shrink-0 self-stretch py-1",
        band.className,
      )}
      style={band.style}
      role="tablist"
      aria-label="Vistas de métricas"
    >
      {([0, 1, 2] as SlideKey[]).map((s) => (
        <button
          key={s}
          type="button"
          role="tab"
          aria-selected={slide === s}
          onClick={() => onSelect(s)}
          aria-label={SLIDE_LABELS[s]}
          className={cn(
            "rounded-full transition-all duration-300 ease-out shrink-0",
            slide === s
              ? isDark
                ? "h-6 w-1.5 bg-slate-300"
                : "h-6 w-1.5 bg-violet-500 shadow-sm shadow-violet-500/30"
              : isDark
                ? "h-1.5 w-1.5 bg-slate-700 hover:bg-slate-500"
                : "h-1.5 w-1.5 bg-slate-200 hover:bg-slate-300",
          )}
        />
      ))}
    </div>
  );
}

function KpiCardsGrid({
  cards,
  spinGen,
  isDark,
  mobileOptimized = false,
}: {
  cards: KpiCardConfig[];
  spinGen: number;
  isDark: boolean;
  mobileOptimized?: boolean;
}) {
  const phase = useSlotPhase();
  const lastIndex = Math.max(cards.length - 1, 0);

  return (
    <div className={cn(
      "grid h-full min-h-0 w-full",
      mobileOptimized ? "grid-cols-2 gap-1.5" : "grid-cols-2 md:grid-cols-4 gap-2 md:gap-3",
    )}>
      {cards.map((card, index) => {
        const accent = COLOR_MAP[card.colorName].hex;
        const baseDelay = phase === "exit"
          ? (lastIndex - index) * 45
          : index * 60;
        const cardNode = (
          <KpiCard
            variant="compact"
            immersive={isDark}
            mobileTight={mobileOptimized}
            slotSpinKey={mobileOptimized ? undefined : spinGen}
            slotDelayMs={mobileOptimized ? undefined : baseDelay}
            label={card.label}
            value={card.value}
            icon={card.icon}
            colorName={card.colorName}
            bgColor={card.bgColor}
            suffix={card.suffix}
            isDecimal={card.isDecimal}
            tooltip={card.tooltip}
          />
        );
        return (
          <div key={`${card.label}-${index}`} className="h-full min-h-0">
            {mobileOptimized ? (
              cardNode
            ) : (
              <KpiCardSlotWrapper
                spinKey={spinGen}
                delayMs={baseDelay}
                accentColor={accent}
                immersive={isDark}
              >
                {cardNode}
              </KpiCardSlotWrapper>
            )}
          </div>
        );
      })}
    </div>
  );
}

const LINE_DRAW_MS = 1150;

/** Progreso 0→1 sincronizado con animationDuration de Recharts */
function useLineDrawProgress(active: boolean, resetKey: number, durationMs: number) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!active) {
      setProgress(0);
      return;
    }

    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1);
      // ease-out alineado con animationEasing="ease-out" de Recharts
      const eased = 1 - Math.pow(1 - t, 2.2);
      setProgress(eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, resetKey, durationMs]);

  return progress;
}

/** Progreso 0–1 en el eje X cuando la línea ya pasó por ese día */
function peakRevealProgress(pointIndex: number, dataLength: number) {
  if (dataLength <= 1) return 0;
  return pointIndex / (dataLength - 1);
}

/** # a la izquierda y valor a la derecha; en bordes ambos del lado visible */
function peakLabelPositions(cx: number, pointIndex: number, dataLength: number) {
  const nearStart = pointIndex <= 1;
  const nearEnd = dataLength > 1 && pointIndex >= dataLength - 2;
  if (nearStart) {
    return {
      rankX: cx + 12,
      rankAnchor: "start" as const,
      valueX: cx + 34,
      valueAnchor: "start" as const,
    };
  }
  if (nearEnd) {
    return {
      rankX: cx - 34,
      rankAnchor: "end" as const,
      valueX: cx - 12,
      valueAnchor: "end" as const,
    };
  }
  return {
    rankX: cx - 12,
    rankAnchor: "end" as const,
    valueX: cx + 12,
    valueAnchor: "start" as const,
  };
}

function peakBadgeWidth(text: string, fontSize: number) {
  return Math.max(text.length * (fontSize * 0.62) + 10, 22);
}

function PeakTextBadge({
  x,
  y,
  text,
  anchor,
  fill,
  isDark,
  bold = false,
}: {
  x: number;
  y: number;
  text: string;
  anchor: "start" | "end";
  fill: string;
  isDark: boolean;
  bold?: boolean;
}) {
  const fontSize = 8;
  const w = peakBadgeWidth(text, fontSize);
  const h = 14;
  const rectX = anchor === "end" ? x - w : x;
  const textX = anchor === "end" ? x - 5 : x + 5;
  const bg = isDark ? "rgba(15,23,42,0.92)" : "rgba(255,255,255,0.94)";
  const stroke = isDark ? "rgba(51,65,85,0.9)" : "rgba(226,232,240,0.95)";

  return (
    <g>
      <rect
        x={rectX}
        y={y - h / 2}
        width={w}
        height={h}
        rx={4}
        fill={bg}
        stroke={stroke}
        strokeWidth={1}
      />
      <text
        x={textX}
        y={y + 1}
        textAnchor={anchor}
        dominantBaseline="middle"
        fill={fill}
        fontSize={fontSize}
        fontWeight={bold ? 900 : 800}
      >
        {text}
      </text>
    </g>
  );
}

const PEAK_MEDAL_STYLES: Record<
  number,
  { fill: string; stroke: string; rankText: string; valueText: string }
> = {
  1: {
    fill: "#f59e0b",
    stroke: "#fef3c7",
    rankText: "#b45309",
    valueText: "#92400e",
  },
  2: {
    fill: "#94a3b8",
    stroke: "#f1f5f9",
    rankText: "#475569",
    valueText: "#64748b",
  },
  3: {
    fill: "#d97706",
    stroke: "#ffedd5",
    rankText: "#9a3412",
    valueText: "#c2410c",
  },
  4: {
    fill: "#8b5cf6",
    stroke: "#ede9fe",
    rankText: "#6d28d9",
    valueText: "#7c3aed",
  },
  5: {
    fill: "#6366f1",
    stroke: "#e0e7ff",
    rankText: "#4338ca",
    valueText: "#4f46e5",
  },
};

function TotalPeakDot({
  cx,
  cy,
  payload,
  peakByFecha,
  indexByFecha,
  isDark,
  isMobile,
  lineProgress,
  dataLength,
}: DotProps & {
  peakByFecha: Map<string, PeakPoint>;
  indexByFecha: Map<string, number>;
  isDark: boolean;
  isMobile: boolean;
  lineProgress: number;
  dataLength: number;
}) {
  const row = payload as (EvolucionTiempo & { index?: number }) | undefined;
  const peak = peakByFecha.get(String(row?.fecha ?? ""));
  if (!peak || cx == null || cy == null || !row) return null;

  const pointIndex = row.index ?? indexByFecha.get(String(row.fecha)) ?? 0;
  const revealAt = peakRevealProgress(pointIndex, dataLength);
  // Solo cuando el trazo ya cruzó este día en el eje temporal
  if (lineProgress < revealAt - 0.008) return null;

  const fade = Math.min(1, (lineProgress - revealAt) * 28 + 0.35);
  if (fade <= 0) return null;
  const medal = PEAK_MEDAL_STYLES[peak.rank] ?? PEAK_MEDAL_STYLES[1];
  const ringStroke = isDark ? "#0f172a" : "#ffffff";

  const r = isMobile ? 5 : 6;
  const labels = peakLabelPositions(cx, pointIndex, dataLength);
  const textY = cy;

  return (
    <g opacity={fade}>
      <circle cx={cx} cy={cy} r={r} fill={medal.fill} stroke={ringStroke} strokeWidth={isMobile ? 1.5 : 2} />
      {!isMobile && (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={medal.stroke} strokeWidth={1} opacity={0.9} />
      )}
      <PeakTextBadge
        x={labels.rankX}
        y={textY}
        text={`#${peak.rank}`}
        anchor={labels.rankAnchor}
        fill={medal.rankText}
        isDark={isDark}
        bold
      />
      <PeakTextBadge
        x={labels.valueX}
        y={textY}
        text={String(peak.total)}
        anchor={labels.valueAnchor}
        fill={isDark ? "#e2e8f0" : medal.valueText}
        isDark={isDark}
      />
    </g>
  );
}

/** Gráfico que se dibuja al aterrizar el slide */
function EvolucionLineChart({
  data,
  isDark,
  drawKey,
  chartYear,
  chartMonth,
}: {
  data: EvolucionTiempo[];
  isDark: boolean;
  drawKey: number;
  chartYear: number;
  chartMonth: number;
}) {
  const isMobile = useCompactViewport();
  const [drawLines, setDrawLines] = useState(false);
  const peaks = useMemo(() => computeTopPeaks(data), [data]);
  const peakByFecha = useMemo(
    () => new Map(peaks.map((p) => [p.fecha, p])),
    [peaks],
  );
  const chartData = useMemo(
    () => data.map((row, index) => ({ ...row, index })),
    [data],
  );
  const yDomain = useMemo(() => computeChartYDomain(data), [data]);
  const xAxisTicks = useMemo(
    () => mergeXAxisTicks(data, peaks.map((p) => p.fecha)),
    [data, peaks],
  );
  const indexByFecha = useMemo(
    () => new Map(chartData.map((r) => [r.fecha, r.index])),
    [chartData],
  );
  const lineProgress = useLineDrawProgress(drawLines, drawKey, LINE_DRAW_MS);

  useEffect(() => {
    setDrawLines(false);
    const t = setTimeout(() => setDrawLines(true), 160);
    return () => clearTimeout(t);
  }, [drawKey]);

  const axisLabelStyle = {
    fill: isDark ? "#94a3b8" : "#64748b",
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: "0.04em",
  };

  const legendMuted = isDark ? "text-slate-400" : "text-slate-500";

  return (
    <motion.div
      key={`chart-panel-${drawKey}`}
      className={cn(
        "h-full w-full rounded-2xl grid grid-rows-[auto_1fr] overflow-hidden",
        isDark
          ? "bg-slate-900 border border-slate-700"
          : "bg-gradient-to-br from-violet-100/50 via-white to-indigo-100/40 border-2 border-violet-200/60 shadow-md shadow-violet-500/10",
      )}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2 h-5 shrink-0 px-2 pt-1",
          legendMuted,
        )}
      >
        <span className="text-[clamp(8px,2vw,10px)] font-black uppercase tracking-[0.08em] opacity-80 leading-none shrink-0">
          Exhibiciones
        </span>
        {drawLines && (
          <div className="flex items-center gap-2 sm:gap-2.5 text-[clamp(7px,1.8vw,9px)] font-black uppercase tracking-[0.05em] leading-none shrink-0">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-0.5 w-3 rounded-full bg-violet-500" />
              Aprobadas
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-0.5 w-3 rounded-full bg-slate-400" />
              Total
            </span>
          </div>
        )}
      </div>
      <div className="min-h-0 h-full w-full px-1 sm:px-1.5 overflow-hidden">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%" debounce={1}>
            <LineChart
              data={chartData}
              margin={
                isMobile
                  ? { top: 12, right: 40, bottom: 20, left: 6 }
                  : { top: 12, right: 36, bottom: 18, left: 6 }
              }
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "#334155" : "#e2e8f0"} />
              <XAxis
                dataKey="fecha"
                xAxisId="fecha"
                orientation="bottom"
                height={isMobile ? 38 : 34}
                ticks={xAxisTicks}
                interval={0}
                padding={isMobile ? { left: 6, right: 10 } : { left: 10, right: 14 }}
                angle={isMobile ? -28 : 0}
                textAnchor={isMobile ? "end" : "middle"}
                tick={(props) => {
                  const { x, y, payload } = props;
                  const value = String(payload?.value ?? "");
                  const isPeak = peakByFecha.has(value);
                  const label = isPeak
                    ? formatPeakFechaLabel(value, chartYear, chartMonth)
                    : value;
                  return (
                    <text
                      x={x}
                      y={y}
                      dy={isMobile ? 12 : 14}
                      textAnchor={isMobile ? "end" : "middle"}
                      fill={isDark ? "#94a3b8" : isPeak ? "#7c3aed" : "#64748b"}
                      fontSize={isPeak && isMobile ? 6.5 : isMobile ? 7 : isPeak ? 7.5 : 8}
                      fontWeight={isPeak ? 900 : 700}
                    >
                      {label}
                    </text>
                  );
                }}
                tickMargin={4}
                tickLine={false}
                axisLine={{ stroke: isDark ? "#475569" : "#cbd5e1", strokeWidth: 1 }}
                label={{
                  value: "Fecha",
                  position: "bottom",
                  offset: 4,
                  style: {
                    ...axisLabelStyle,
                    fontSize: isMobile ? 8 : 9,
                    textAnchor: "middle",
                    fill: isDark ? "#94a3b8" : "#64748b",
                  },
                }}
              />
              <YAxis
                yAxisId="y"
                width={isMobile ? 30 : 36}
                domain={yDomain}
                tickCount={isMobile ? 3 : 4}
                allowDecimals={false}
                tick={{
                  fill: isDark ? "#94a3b8" : "#64748b",
                  fontSize: isMobile ? 7 : 9,
                  fontWeight: 700,
                }}
                tickMargin={2}
                tickLine={false}
                axisLine={{ stroke: isDark ? "#475569" : "#cbd5e1", strokeWidth: 1 }}
              />
              <Tooltip content={<CustomTooltip />} />
              {drawLines && (
                <>
                  <Line
                    yAxisId="y"
                    xAxisId="fecha"
                    type="monotone"
                    dataKey="aprobadas"
                    name="Aprobadas"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={false}
                    activeDot={false}
                    isAnimationActive
                    animationBegin={0}
                    animationDuration={LINE_DRAW_MS}
                    animationEasing="ease-out"
                  />
                  <Line
                    yAxisId="y"
                    xAxisId="fecha"
                    type="monotone"
                    dataKey="total"
                    name="Total"
                    stroke="#94a3b8"
                    strokeWidth={2}
                    dot={(props) => (
                      <TotalPeakDot
                        {...props}
                        peakByFecha={peakByFecha}
                        indexByFecha={indexByFecha}
                        isDark={isDark}
                        isMobile={isMobile}
                        lineProgress={lineProgress}
                        dataLength={chartData.length}
                      />
                    )}
                    activeDot={false}
                    isAnimationActive
                    animationBegin={0}
                    animationDuration={LINE_DRAW_MS}
                    animationEasing="ease-out"
                  />
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Sin datos</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function arCalendarRef(): { year: number; month: number } {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const ar = new Date(utcMs - 3 * 3_600_000);
  return { year: ar.getFullYear(), month: ar.getMonth() };
}

export function DashboardKpiCarousel({
  kpis,
  evolucion,
  loading = false,
  isDark = false,
  bandHeightPx,
  chartYear,
  chartMonth,
  mobileOptimized = false,
}: DashboardKpiCarouselProps) {
  const band = kpiBandSizing(bandHeightPx);
  const cal = arCalendarRef();
  const refYear = chartYear ?? cal.year;
  const refMonth = chartMonth ?? cal.month;

  const [slide, setSlide] = useState<SlideKey>(0);
  const [spinGen, setSpinGen] = useState(0);
  const rotateRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tasaAprobacion = kpis && (kpis.aprobadas + kpis.rechazadas) > 0
    ? Math.round((kpis.aprobadas / (kpis.aprobadas + kpis.rechazadas)) * 100)
    : null;

  const onSlideExitComplete = useCallback(() => {
    setSpinGen((g) => g + 1);
  }, []);

  function startAutoRotate() {
    if (rotateRef.current) clearInterval(rotateRef.current);
    if (!kpis) return;
    rotateRef.current = setInterval(() => {
      setSlide((s) => ((s + 1) % 3) as SlideKey);
    }, SLIDE_ROTATE_MS);
  }

  useEffect(() => {
    startAutoRotate();
    return () => {
      if (rotateRef.current) clearInterval(rotateRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kpis]);

  function handleSlideClick(s: SlideKey) {
    setSlide(s);
    startAutoRotate();
  }

  const slideMotionTransition = {
    duration: KPI_SLOT_TRANSITION_MS / 1000,
    ease: [0.06, 0.88, 0.14, 1.04] as const,
  };

  const estadosCards: KpiCardConfig[] = kpis
    ? [
        { label: "Pendientes", value: kpis.pendientes, icon: <Clock size={28} strokeWidth={2.25} />, colorName: "amber", bgColor: "bg-gradient-to-br from-amber-100/70 via-amber-50/50 to-white" },
        { label: "Aprobadas", value: kpis.aprobadas, icon: <CheckCircle size={28} strokeWidth={2.25} />, colorName: "emerald", bgColor: "bg-gradient-to-br from-emerald-100/70 via-emerald-50/50 to-white" },
        { label: "Destacadas", value: kpis.destacadas, icon: <Star size={28} strokeWidth={2.25} />, colorName: "violet", bgColor: "bg-gradient-to-br from-violet-200/60 via-fuchsia-50/40 to-white" },
        { label: "Rechazadas", value: kpis.rechazadas, icon: <XCircle size={28} strokeWidth={2.25} />, colorName: "red", bgColor: "bg-gradient-to-br from-red-100/60 via-red-50/40 to-white" },
      ]
    : [];

  const rendimientoCards: KpiCardConfig[] = kpis
    ? [
        { label: "PDVs exhibidos", value: kpis.total, icon: <Store size={28} strokeWidth={2.25} />, colorName: "blue", bgColor: "bg-gradient-to-br from-blue-100/70 via-blue-50/50 to-white", tooltip: "Total de puntos de venta con ≥1 exhibición lógica en el período" },
        { label: "Tasa de aprobación", value: tasaAprobacion ?? 0, icon: <TrendingUp size={28} strokeWidth={2.25} />, colorName: "emerald", bgColor: "bg-gradient-to-br from-emerald-100/70 via-emerald-50/50 to-white", suffix: "%", tooltip: "Aprobadas / (Aprobadas + Rechazadas)" },
        { label: "Vendedores activos", value: kpis.vendedores_activos ?? 0, icon: <Users size={28} strokeWidth={2.25} />, colorName: "violet", bgColor: "bg-gradient-to-br from-violet-200/60 via-fuchsia-50/40 to-white", tooltip: "Vendedores ERP con ≥1 exhibición lógica en el período" },
        { label: "Exhibiciones por vendedor", value: kpis.exhibiciones_por_vendedor ?? 0, icon: <BarChart2 size={28} strokeWidth={2.25} />, colorName: "amber", bgColor: "bg-gradient-to-br from-amber-100/70 via-amber-50/50 to-white", isDecimal: true, tooltip: "Promedio de exhibiciones lógicas por vendedor activo" },
      ]
    : [];

  if (loading && !kpis) {
    return (
      <div className="flex items-stretch gap-2 md:gap-3 shrink-0">
        <div
          className={cn("flex flex-col items-center justify-center gap-2 shrink-0", band.className)}
          style={band.style}
        >
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-1.5 w-1.5 rounded-full" />
          ))}
        </div>
        <div
          className={cn("flex-1 min-w-0 grid grid-cols-4 gap-2 md:gap-3", band.className)}
          style={band.style}
        >
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-full w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("flex items-stretch gap-2 md:gap-3 shrink-0 min-w-0", band.className)}
      style={band.style}
    >
      <SlideNav slide={slide} isDark={isDark} onSelect={handleSlideClick} bandHeightPx={bandHeightPx} />

      <div
        className={cn(
          "flex-1 min-w-0 relative rounded-2xl",
          slide === 1 ? "overflow-visible" : "overflow-hidden",
          band.className,
          isDark ? "bg-slate-950/30" : "bg-white/20",
        )}
        style={band.style}
      >
        <AnimatePresence mode="wait" onExitComplete={onSlideExitComplete}>
          {slide === 0 && kpis && (
            <motion.div
              key="slide-estados"
              className="absolute inset-0"
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 1 }}
              transition={slideMotionTransition}
            >
              <KpiSlidePanel>
                <KpiCardsGrid cards={estadosCards} spinGen={spinGen} isDark={isDark} mobileOptimized={mobileOptimized} />
              </KpiSlidePanel>
            </motion.div>
          )}
          {slide === 1 && (
            <motion.div
              key="slide-evolucion"
              className="absolute inset-0"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={slideMotionTransition}
            >
              <KpiSlidePanel>
                <EvolucionLineChart
                  data={evolucion}
                  isDark={isDark}
                  drawKey={spinGen}
                  chartYear={refYear}
                  chartMonth={refMonth}
                />
              </KpiSlidePanel>
            </motion.div>
          )}
          {slide === 2 && kpis && (
            <motion.div
              key="slide-rendimiento"
              className="absolute inset-0"
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 1 }}
              transition={slideMotionTransition}
            >
              <KpiSlidePanel>
                <KpiCardsGrid cards={rendimientoCards} spinGen={spinGen} isDark={isDark} mobileOptimized={mobileOptimized} />
              </KpiSlidePanel>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
