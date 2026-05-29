"use client";

import { useEffect, useState } from "react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts";
import { motion } from "framer-motion";
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
  { key: "pdvs",         label: "PDV" },
  { key: "altas",        label: "Alta" },
  { key: "exhibiciones", label: "Exhib" },
  { key: "compradores",  label: "Comp" },
  { key: "bultos",       label: "Bultos" },
  { key: "cobertura",    label: "Cob%" },
  { key: "objetivos",    label: "Obj%" },
];

const SIZE_MAP = {
  sm: { height: 100, fontSize: 8,  dotR: 3 },
  md: { height: 140, fontSize: 9,  dotR: 4 },
  lg: { height: 200, fontSize: 10, dotR: 5 },
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
    vendedor:  Math.min(100, Math.max(0, radar[key] ?? 0)),
    compania:  radarCompania ? Math.min(100, Math.max(0, radarCompania[key] ?? 0)) : undefined,
    dist:      radarDist     ? Math.min(100, Math.max(0, radarDist[key] ?? 0))     : undefined,
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomAxisTick(props: any) {
  const { x, y, payload, fontSize } = props as {
    x: number; y: number; payload: { value: string }; fontSize: number;
  };
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      fill="#64748B"
      fontSize={fontSize}
      fontWeight={600}
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
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const { height, fontSize, dotR } = SIZE_MAP[size];
  const data = buildData(radar, radarCompania, radarDist);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: mounted ? 1 : 0, scale: mounted ? 1 : 0.7 }}
      transition={{ type: "spring" as const, stiffness: 280, damping: 22, delay: 0.05 }}
      style={{ width: "100%", height }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} margin={{ top: 8, right: 14, bottom: 8, left: 14 }}>
          <PolarGrid stroke="rgba(100,116,139,0.25)" strokeWidth={1} />
          <PolarAngleAxis
            dataKey="axis"
            tick={(props) => <CustomAxisTick {...props} fontSize={fontSize} />}
            tickLine={false}
            axisLine={false}
          />

          {/* Main vendor radar */}
          <Radar
            name="Vendedor"
            dataKey="vendedor"
            stroke="#a855f7"
            strokeWidth={1.8}
            fill="#a855f7"
            fillOpacity={0.38}
            dot={{ r: dotR, fill: "#a855f7", fillOpacity: 0.9, strokeWidth: 0 }}
            isAnimationActive={true}
            animationBegin={60}
            animationDuration={700}
            animationEasing="ease-out"
          />

          {/* Compania overlay */}
          {showOverlayCompania && radarCompania && (
            <Radar
              name="Ideal Compañía"
              dataKey="compania"
              stroke="#F59E0B"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              fill="transparent"
              fillOpacity={0}
              dot={false}
              isAnimationActive={true}
              animationBegin={120}
              animationDuration={600}
            />
          )}

          {/* Distribuidor overlay */}
          {showOverlayDist && radarDist && (
            <Radar
              name="Ideal Distribuidora"
              dataKey="dist"
              stroke="#7C3AED"
              strokeWidth={1.5}
              strokeDasharray="2 3"
              fill="transparent"
              fillOpacity={0}
              dot={false}
              isAnimationActive={true}
              animationBegin={150}
              animationDuration={600}
            />
          )}
        </RadarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
