import type { VendorCartaResumen, VendorRawKpis } from "@/lib/api";
import type { RadarKPI } from "@/lib/api";

/** KPIs de la grilla 2×3 donde puede mostrarse corona de liderazgo */
export type VendorStatLeaderKey =
  | "exhibiciones"
  | "compradores"
  | "bultos"
  | "pdvs"
  | "cobertura_pct"
  | "altas";

export interface FusionRadarAxisMeta {
  key: keyof RadarKPI;
  /** Etiqueta corta en el hexágono */
  tick: string;
  /** Nombre del KPI (stats / referencia general) */
  fullLabel: string;
  /** Texto en tooltip de ideal compañía/distribuidora (si difiere del KPI crudo) */
  idealLabel?: string;
  isPercent: boolean;
}

export const FUSION_RADAR_AXES: FusionRadarAxisMeta[] = [
  { key: "pdvs", tick: "PDV", fullLabel: "PDVs en padrón", isPercent: false },
  {
    key: "altas",
    tick: "ALT",
    fullLabel: "Altas",
    idealLabel: "Altas por día",
    isPercent: false,
  },
  { key: "exhibiciones", tick: "EXH", fullLabel: "Exhibiciones", isPercent: false },
  { key: "compradores", tick: "CMP", fullLabel: "Compradores", isPercent: false },
  { key: "bultos", tick: "BLT", fullLabel: "Bultos", isPercent: false },
  { key: "cobertura", tick: "COB", fullLabel: "Cobertura", isPercent: true },
];

const STAT_LEADER_GETTERS: {
  key: VendorStatLeaderKey;
  get: (k: VendorRawKpis) => number;
  label: string;
}[] = [
  { key: "exhibiciones", get: (k) => k.exhibiciones, label: "Exhibiciones" },
  { key: "compradores", get: (k) => k.compradores, label: "Compradores" },
  { key: "bultos", get: (k) => k.bultos, label: "Bultos" },
  { key: "pdvs", get: (k) => k.pdvs, label: "PDVs" },
  { key: "cobertura_pct", get: (k) => k.cobertura_pct, label: "Cobertura" },
  { key: "altas", get: (k) => k.altas, label: "Altas" },
];

export function fusionAxisMeta(axisKey: keyof RadarKPI): FusionRadarAxisMeta {
  return (
    FUSION_RADAR_AXES.find((a) => a.key === axisKey) ?? {
      key: axisKey,
      tick: String(axisKey),
      fullLabel: String(axisKey),
      isPercent: false,
    }
  );
}

export function formatFusionIdealValue(
  meta: FusionRadarAxisMeta,
  value: number | undefined,
): string {
  if (value == null || Number.isNaN(value)) return "—";
  const n = Math.round(value);
  return meta.isPercent ? `${n}%` : String(n);
}

export function computeStatLeadersByVendor(
  vendors: VendorCartaResumen[],
): Map<string, VendorStatLeaderKey[]> {
  const result = new Map<string, VendorStatLeaderKey[]>();

  for (const { key, get } of STAT_LEADER_GETTERS) {
    let best = -Infinity;
    const leaders: string[] = [];

    for (const v of vendors) {
      const val = get(v.raw_kpis);
      if (val > best) {
        best = val;
        leaders.length = 0;
        leaders.push(v.id_vendedor);
      } else if (val === best && val > 0) {
        leaders.push(v.id_vendedor);
      }
    }

    if (leaders.length === 0 || best <= 0) continue;

    for (const id of leaders) {
      const prev = result.get(id) ?? [];
      result.set(id, [...prev, key]);
    }
  }

  return result;
}

export function statLeaderTooltip(
  leaderKey: VendorStatLeaderKey,
): string {
  const item = STAT_LEADER_GETTERS.find((s) => s.key === leaderKey);
  const label = item?.label ?? leaderKey;
  return `Lidera en ${label} entre los vendedores visibles en este listado.`;
}

export function fusionIdealAxisLabel(meta: FusionRadarAxisMeta): string {
  return meta.idealLabel ?? meta.fullLabel;
}

export const FUSION_ALTAS_IDEAL_HINT =
  "Meta diaria de altas del ideal para alcanzar el total de PDVs objetivo del perfil.";
