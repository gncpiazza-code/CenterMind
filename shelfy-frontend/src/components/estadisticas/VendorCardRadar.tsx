"use client";

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
  size?: "sm" | "fusion" | "md" | "lg";
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
  fusion: { height: 162, outerRadius: "78%", fontSize: 8, dotR: 3.5, stroke: 1.8 },
  md: { height: 168, outerRadius: "64%", fontSize: 9, dotR: 3.5, stroke: 1.8 },
  lg: { height: 210, outerRadius: "66%", fontSize: 10, dotR: 4.5, stroke: 2 },
};

type ChartRow = {
  axis: string;
  axisKey: keyof RadarKPI;
  vendedor: number;
  compania?: number;
  dist?: number;
};

function buildData(
  axes: { key: keyof RadarKPI; label: string }[],
  radar: RadarKPI,
  radarCompania?: RadarKPI,
  radarDist?: RadarKPI,
): ChartRow[] {
  return axes.map(({ key, label }) => ({
    axis: label,
    axisKey: key,
    vendedor: Math.min(100, Math.max(0, radar[key] ?? 0)),
    compania: radarCompania
      ? Math.min(100, Math.max(0, radarCompania[key] ?? 0))
      : undefined,
    dist: radarDist ? Math.min(100, Math.max(0, radarDist[key] ?? 0)) : undefined,
  }));
}

function FusionRadarTooltipContent({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: ChartRow }[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const meta = fusionAxisMeta(row.axisKey);
  const idealName = fusionIdealAxisLabel(meta);

  return (
    <div
      style={{
        background: "#0f172a",
        border: "1px solid rgba(148,163,184,0.35)",
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: 10,
        fontWeight: 600,
        lineHeight: 1.45,
        maxWidth: 240,
        boxShadow: "0 6px 16px rgba(0,0,0,0.35)",
        pointerEvents: "none",
      }}
    >
      <div style={{ color: "#f59e0b" }}>
        {idealName} ideal Compañía: {formatFusionIdealValue(meta, row.compania)}
      </div>
      <div style={{ color: "#a855f7", marginTop: 4 }}>
        {idealName} ideal Distribuidora: {formatFusionIdealValue(meta, row.dist)}
      </div>
      {meta.key === "altas" && (
        <div
          style={{
            color: "#94a3b8",
            marginTop: 6,
            fontSize: 9,
            fontWeight: 500,
            lineHeight: 1.35,
          }}
        >
          {FUSION_ALTAS_IDEAL_HINT}
        </div>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomAxisTick(props: any) {
  const { x, y, payload, fontSize, tickFill = "#94a3b8" } = props as {
    x: number;
    y: number;
    payload: { value: string };
    fontSize: number;
    tickFill?: string;
  };
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
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
  size = "md",
  onDarkPanel = false,
  axesMode = "full",
  showOverlayCompania = false,
  showOverlayDist = false,
}: VendorCardRadarProps) {
  const { height, outerRadius, fontSize, dotR, stroke } = SIZE_MAP[size];
  const axes =
    axesMode === "fusion"
      ? FUSION_RADAR_AXES.map((a) => ({ key: a.key, label: a.tick }))
      : AXES_FULL;
  const data = buildData(axes, radar, radarCompania, radarDist);
  const hasVendorShape = data.some((d) => d.vendedor > 0);
  const tickFill = onDarkPanel ? "#f8fafc" : "#94a3b8";
  const gridStroke = onDarkPanel
    ? "rgba(251,146,60,0.45)"
    : "rgba(148,163,184,0.35)";

  return (
    <div
      style={{
        width: "100%",
        height,
        minHeight: height,
        flexShrink: 0,
        position: "relative",
      }}
    >
      <ResponsiveContainer width="100%" height={height}>
        <RadarChart
          data={data}
          cx="50%"
          cy="50%"
          outerRadius={outerRadius}
          margin={
            size === "fusion"
              ? { top: 4, right: 8, bottom: 4, left: 8 }
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
              content={<FusionRadarTooltipContent />}
              cursor={false}
              shared={false}
              allowEscapeViewBox={{ x: false, y: false }}
              wrapperStyle={{ zIndex: 30, outline: "none" }}
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
