/** Metas del radar expandido (6 ejes — alineado al sidebar). */

import type { KpisMensualesIdeal } from "@/lib/api";

export type IdealRadarMetaKey = keyof KpisMensualesIdeal | "meta_pdvs_total";

export interface IdealRadarMetaField {
  key: IdealRadarMetaKey;
  label: string;
  hint: string;
  /** meta_pdvs_total vive en la raíz del ideal */
  root?: boolean;
  isPercent?: boolean;
  monthly?: boolean;
}

export const IDEAL_RADAR_META_TOP: IdealRadarMetaField[] = [
  {
    key: "meta_pdvs_total",
    label: "PDVs en cartera",
    hint: "Tamaño objetivo de la cartera en padrón.",
    root: true,
  },
  {
    key: "exhibiciones",
    label: "Exhibiciones / mes",
    hint: "Visitas lógicas objetivo por mes (dedup cliente + día).",
    monthly: true,
  },
  {
    key: "cobertura_exhibicion_pct",
    label: "% cartera exhibida",
    hint: "% de PDVs de la cartera con al menos 1 exhibición lógica.",
    isPercent: true,
  },
];

export const IDEAL_RADAR_META_BOTTOM: IdealRadarMetaField[] = [
  {
    key: "pdvs_compradores",
    label: "Compradores / mes",
    hint: "PDVs de cartera con al menos una compra en el mes.",
    monthly: true,
  },
  {
    key: "cobertura_pct",
    label: "Cobertura compra %",
    hint: "% de PDVs compradores sobre el total de la cartera.",
    isPercent: true,
  },
  {
    key: "bultos",
    label: "Bultos / mes",
    hint: "Venta neta en bultos por mes.",
    monthly: true,
  },
];

export const IDEAL_OVR_PESO_LABELS: Record<string, string> = {
  pdvs: "PDVs",
  altas: "Altas",
  exhibiciones: "Exhibiciones",
  compradores: "Compradores",
  bultos: "Bultos",
  cobertura: "Cobertura compra %",
  objetivos: "Objetivos %",
};
