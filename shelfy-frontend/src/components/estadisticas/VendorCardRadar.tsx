"use client";

import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts";
import type { RadarKPI } from "@/lib/api";

interface VendorCardRadarProps {
  radar: RadarKPI;
  radarCompania?: RadarKPI;
  radarDist?: RadarKPI;
  size?: "sm" | "md" | "lg";
  showOverlayCompania?: boolean;
  showOverlayDist?: boolean;
}

const AXES: { key: keyof RadarKPI; label: string }[] = [
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
  md: { height: 168, outerRadius: "64%", fontSize: 9, dotR: 3.5, stroke: 1.8 },
  lg: { height: 210, outerRadius: "66%", fontSize: 10, dotR: 4.5, stroke: 2 },
};

type ChartRow = {
  axis: string;
  vendedor: number;
  compania?: number;
  dist?: number;
};

function buildData(
  radar: RadarKPI,
  radarCompania?: RadarKPI,
  radarDist?: RadarKPI,
): ChartRow[] {
  return AXES.map(({ key, label }) => ({
    axis: label,
    vendedor: Math.min(100, Math.max(0, radar[key] ?? 0)),
    compania: radarCompania
      ? Math.min(100, Math.max(0, radarCompania[key] ?? 0))
      : undefined,
    dist: radarDist ? Math.min(100, Math.max(0, radarDist[key] ?? 0)) : undefined,
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomAxisTick(props: any) {
  const { x, y, payload, fontSize } = props as {
    x: number;
    y: number;
    payload: { value: string };
    fontSize: number;
  };
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      fill="#94a3b8"
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
  showOverlayCompania = false,
  showOverlayDist = false,
}: VendorCardRadarProps) {
  const { height, outerRadius, fontSize, dotR, stroke } = SIZE_MAP[size];
  const data = buildData(radar, radarCompania, radarDist);
  const hasVendorShape = data.some((d) => d.vendedor > 0);

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
          margin={{ top: 14, right: 22, bottom: 14, left: 22 }}
        >
          <PolarGrid stroke="rgba(148,163,184,0.35)" strokeWidth={1} gridType="polygon" />
          <PolarAngleAxis
            dataKey="axis"
            tick={(props) => <CustomAxisTick {...props} fontSize={fontSize} />}
            tickLine={false}
            axisLine={false}
          />

          {showOverlayCompania && radarCompania && (
            <Radar
              name="Ideal Compañía"
              dataKey="compania"
              stroke="#F59E0B"
              strokeWidth={stroke}
              strokeDasharray="6 4"
              fill="#F59E0B"
              fillOpacity={0.12}
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
              strokeDasharray="3 4"
              fill="#7C3AED"
              fillOpacity={0.1}
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
            fillOpacity={0.45}
            dot={{ r: dotR, fill: "#e0f2fe", stroke: "#0891b2", strokeWidth: 1 }}
            isAnimationActive={false}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
