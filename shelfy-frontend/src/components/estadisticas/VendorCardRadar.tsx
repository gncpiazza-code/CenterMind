"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";
import type { RadarKPI } from "@/lib/api";
import {
  FUSION_RADAR_AXES,
  FUSION_ALTAS_IDEAL_HINT,
  formatFusionIdealValue,
  fusionAxisMeta,
  fusionIdealAxisLabel,
} from "@/lib/vendor-card-fusion-kpi";

interface VendorCardRadarProps {
  radar: RadarKPI;
  radarCompania?: RadarKPI;
  radarDist?: RadarKPI;
  /** Valores meta del ideal (absolutos), para tooltips fusion. */
  idealMetaCompania?: RadarKPI;
  idealMetaDist?: RadarKPI;
  size?: "sm" | "fusion" | "md" | "lg" | "detalle";
  /** Alto explícito (px) — p.ej. modal expandido. */
  chartHeight?: number;
  onDarkPanel?: boolean;
  axesMode?: "full" | "fusion";
  showOverlayCompania?: boolean;
  showOverlayDist?: boolean;
}

const AXES_FULL: { key: keyof RadarKPI; label: string }[] = [
  { key: "pdvs", label: "PDV" },
  { key: "altas", label: "Alta" },
  { key: "exhibiciones", label: "Exhib" },
  { key: "compradores", label: "Comp" },
  { key: "bultos", label: "Bultos" },
  { key: "cobertura", label: "Cob%" },
  { key: "objetivos", label: "Obj%" },
];

const SIZE_MAP = {
  sm: { height: 148, outerRadius: "62%", fontSize: 8, dotR: 3, stroke: 1.8 },
  fusion: { height: 162, outerRadius: "76%", fontSize: 8, dotR: 3.5, stroke: 1.8 },
  md: { height: 168, outerRadius: "64%", fontSize: 9, dotR: 3.5, stroke: 1.8 },
  lg: { height: 210, outerRadius: "66%", fontSize: 10, dotR: 4.5, stroke: 2 },
  detalle: { height: 320, outerRadius: "88%", fontSize: 11, dotR: 4.5, stroke: 2.2 },
};

const FUSION_CHART_MARGIN = { top: 10, right: 16, bottom: 12, left: 16 };

type ChartRow = {
  axis: string;
  axisKey: keyof RadarKPI;
  vendedor: number;
  compania?: number;
  dist?: number;
  idealCompania?: number;
  idealDist?: number;
};

function buildData(
  axes: { key: keyof RadarKPI; label: string }[],
  radar: RadarKPI,
  radarCompania?: RadarKPI,
  radarDist?: RadarKPI,
  idealMetaCompania?: RadarKPI,
  idealMetaDist?: RadarKPI,
): ChartRow[] {
  return axes.map(({ key, label }) => ({
    axis: label,
    axisKey: key,
    vendedor: Math.min(100, Math.max(0, Number(radar[key] ?? 0))),
    compania: radarCompania
      ? Math.min(100, Math.max(0, Number(radarCompania[key] ?? 0)))
      : undefined,
    dist: radarDist ? Math.min(100, Math.max(0, Number(radarDist[key] ?? 0))) : undefined,
    idealCompania: idealMetaCompania?.[key],
    idealDist: idealMetaDist?.[key],
  }));
}

const FUSION_RADAR_TOOLTIP_MIN_W = 268;

type FusionRadarTooltipProps = {
  active?: boolean;
  payload?: { payload?: ChartRow }[];
  coordinate?: { x?: number; y?: number };
  chartAnchorRef: RefObject<HTMLDivElement | null>;
};

function FusionRadarTooltipContent({
  active,
  payload,
  coordinate,
  chartAnchorRef,
}: FusionRadarTooltipProps) {
  const [fixedPos, setFixedPos] = useState<{ left: number; top: number } | null>(
    null,
  );

  const row = active && payload?.length ? payload[0]?.payload : undefined;
  const cx = coordinate?.x ?? 0;
  const cy = coordinate?.y ?? 0;

  useLayoutEffect(() => {
    if (!active || !row || !chartAnchorRef.current) {
      setFixedPos(null);
      return;
    }
    const rect = chartAnchorRef.current.getBoundingClientRect();
    const offsetX = 14;
    const offsetY = -36;
    let left = rect.left + cx + offsetX;
    const top = rect.top + cy + offsetY;
    const maxLeft =
      typeof window !== "undefined"
        ? window.innerWidth - FUSION_RADAR_TOOLTIP_MIN_W - 12
        : left;
    if (left > maxLeft) {
      left = Math.max(8, rect.left + cx - FUSION_RADAR_TOOLTIP_MIN_W - 8);
    }
    setFixedPos({ left, top });
  }, [active, row, chartAnchorRef, cx, cy]);

  if (!active || !row || !fixedPos || typeof document === "undefined") {
    return null;
  }

  const meta = fusionAxisMeta(row.axisKey);
  const idealName = fusionIdealAxisLabel(meta);

  return createPortal(
    <div
      role="tooltip"
      style={{
        position: "fixed",
        left: fixedPos.left,
        top: fixedPos.top,
        zIndex: 10000,
        minWidth: FUSION_RADAR_TOOLTIP_MIN_W,
        width: "max-content",
        maxWidth: "min(320px, calc(100vw - 16px))",
        background: "#0f172a",
        border: "1px solid rgba(148,163,184,0.35)",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 10,
        fontWeight: 600,
        lineHeight: 1.4,
        boxShadow: "0 6px 16px rgba(0,0,0,0.35)",
        pointerEvents: "none",
      }}
    >
      <p style={{ margin: 0, color: "#f59e0b", whiteSpace: "nowrap" }}>
        {idealName} ideal Compañía:{" "}
        {formatFusionIdealValue(meta, row.idealCompania)}
      </p>
      <p style={{ margin: "4px 0 0", color: "#a855f7", whiteSpace: "nowrap" }}>
        {idealName} ideal Distribuidora:{" "}
        {formatFusionIdealValue(meta, row.idealDist)}
      </p>
      {meta.key === "pdvs_exhibidos" && (
        <p
          style={{
            margin: "6px 0 0",
            color: "#94a3b8",
            fontSize: 9,
            fontWeight: 500,
            lineHeight: 1.35,
            whiteSpace: "normal",
          }}
        >
          CEX: cumplimiento de cobertura de exhibición (PDVs exhibidos ÷ PDVs de cartera) vs. la meta % del ideal.
        </p>
      )}
      {meta.key === "cobertura" && (
        <p
          style={{
            margin: "6px 0 0",
            color: "#94a3b8",
            fontSize: 9,
            fontWeight: 500,
            lineHeight: 1.35,
            whiteSpace: "normal",
          }}
        >
          % de PDVs compradores sobre el total de la cartera.
        </p>
      )}
      {meta.key === "altas" && (
        <p
          style={{
            margin: "6px 0 0",
            color: "#94a3b8",
            fontSize: 9,
            fontWeight: 500,
            lineHeight: 1.35,
            whiteSpace: "normal",
          }}
        >
          {FUSION_ALTAS_IDEAL_HINT}
        </p>
      )}
    </div>,
    document.body,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomAxisTick(props: any) {
  const {
    x,
    y,
    payload,
    fontSize,
    tickFill = "#94a3b8",
    textAnchor: rechartsAnchor,
    dx = 0,
    dy = 0,
    cx,
    cy,
  } = props as {
    x: number;
    y: number;
    payload: { value: string };
    fontSize: number;
    tickFill?: string;
    textAnchor?: "start" | "middle" | "end" | "inherit";
    dx?: number;
    dy?: number;
    cx?: number;
    cy?: number;
  };

  const label = payload?.value ?? "";
  let textAnchor: "start" | "middle" | "end" = rechartsAnchor ?? "middle";
  let tickDx = Number(dx) || 0;
  let tickDy = Number(dy) || 0;

  // CEX queda en el cuadrante inferior-derecho: anclar hacia adentro para no clippear la carta.
  if (label === "CEX") {
    textAnchor = "end";
    tickDx -= 3;
    tickDy -= 2;
  } else if (!rechartsAnchor && typeof cx === "number" && typeof cy === "number") {
    const horiz = x - cx;
    const vert = y - cy;
    if (horiz > 8) textAnchor = vert > 4 ? "end" : "start";
    else if (horiz < -8) textAnchor = vert > 4 ? "start" : "end";
    else textAnchor = "middle";
  }

  return (
    <text
      x={x}
      y={y}
      dx={tickDx}
      dy={tickDy}
      textAnchor={textAnchor}
      dominantBaseline="central"
      fill={tickFill}
      fontSize={fontSize}
      fontWeight={700}
      fontFamily="inherit"
    >
      {payload?.value}
    </text>
  );
}

export function VendorCardRadar({
  radar,
  radarCompania,
  radarDist,
  idealMetaCompania,
  idealMetaDist,
  size = "md",
  chartHeight,
  onDarkPanel = false,
  axesMode = "full",
  showOverlayCompania = false,
  showOverlayDist = false,
}: VendorCardRadarProps) {
  const chartAnchorRef = useRef<HTMLDivElement>(null);
  const sizeCfg = SIZE_MAP[size as keyof typeof SIZE_MAP] ?? SIZE_MAP.md;
  const height = chartHeight ?? sizeCfg.height;
  const { outerRadius, fontSize, dotR, stroke } = sizeCfg;
  const axes =
    axesMode === "fusion"
      ? FUSION_RADAR_AXES.map((a) => ({ key: a.key, label: a.tick }))
      : AXES_FULL;
  const data = buildData(
    axes,
    radar,
    radarCompania,
    radarDist,
    idealMetaCompania,
    idealMetaDist,
  );
  const hasVendorShape = data.some((d) => d.vendedor > 0);
  const tickFill = onDarkPanel ? "#f8fafc" : "#94a3b8";
  const gridStroke = onDarkPanel
    ? "rgba(251,146,60,0.45)"
    : "rgba(148,163,184,0.35)";

  return (
    <div
      ref={chartAnchorRef}
      style={{
        width: "100%",
        height,
        minHeight: height,
        flexShrink: 0,
        position: "relative",
        overflow: axesMode === "fusion" ? "visible" : "hidden",
      }}
    >
      <ResponsiveContainer width="100%" height={height} style={{ overflow: "visible" }}>
        <RadarChart
          data={data}
          cx="50%"
          cy="50%"
          outerRadius={outerRadius}
          margin={
            size === "fusion"
              ? FUSION_CHART_MARGIN
              : size === "detalle"
                ? { top: 12, right: 20, bottom: 12, left: 20 }
                : { top: 14, right: 22, bottom: 14, left: 22 }
          }
        >
          <PolarGrid stroke={gridStroke} strokeWidth={1} gridType="polygon" />
          <PolarAngleAxis
            dataKey="axis"
            tick={(props) => (
              <CustomAxisTick {...props} fontSize={fontSize} tickFill={tickFill} />
            )}
            tickLine={false}
            axisLine={false}
          />

          {axesMode === "fusion" && (
            <RechartsTooltip
              content={(props) => (
                <FusionRadarTooltipContent
                  {...props}
                  chartAnchorRef={chartAnchorRef}
                />
              )}
              cursor={false}
              shared={false}
              allowEscapeViewBox={{ x: true, y: true }}
              wrapperStyle={{
                visibility: "hidden",
                width: 0,
                height: 0,
                overflow: "visible",
                pointerEvents: "none",
              }}
              isAnimationActive={false}
            />
          )}

          {showOverlayCompania && radarCompania && (
            <Radar
              name="Ideal Compañía"
              dataKey="compania"
              stroke="#F59E0B"
              strokeWidth={stroke}
              strokeDasharray="6 4"
              fill="#F59E0B"
              fillOpacity={0.08}
              dot={false}
              isAnimationActive={false}
            />
          )}

          {showOverlayDist && radarDist && (
            <Radar
              name="Ideal Distribuidora"
              dataKey="dist"
              stroke="#7C3AED"
              strokeWidth={stroke}
              strokeDasharray="4 3"
              fill="#7C3AED"
              fillOpacity={0.06}
              dot={false}
              isAnimationActive={false}
            />
          )}

          <Radar
            name="Vendedor"
            dataKey="vendedor"
            stroke={hasVendorShape ? "#22d3ee" : "#a855f7"}
            strokeWidth={stroke + 0.4}
            fill={hasVendorShape ? "#22d3ee" : "#a855f7"}
            fillOpacity={axesMode === "fusion" ? 0.32 : 0.45}
            dot={
              axesMode === "fusion"
                ? {
                    r: dotR + 1,
                    fill: "#e0f2fe",
                    stroke: "#0891b2",
                    strokeWidth: 1.2,
                    style: { cursor: "pointer" },
                  }
                : { r: dotR, fill: "#e0f2fe", stroke: "#0891b2", strokeWidth: 1 }
            }
            activeDot={
              axesMode === "fusion"
                ? {
                    r: dotR + 3,
                    fill: "#ffffff",
                    stroke: "#22d3ee",
                    strokeWidth: 2,
                    style: { cursor: "pointer" },
                  }
                : undefined
            }
            isAnimationActive={false}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
