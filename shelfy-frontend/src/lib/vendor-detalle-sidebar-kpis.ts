/** KPIs del sidebar expandido (arriba/abajo del radar) — 6 métricas, 2 filas × 3. */

import type { VendorRawKpis } from "@/lib/api";

export type VendorDetalleSidebarKpiKey =
  | "pdvs"
  | "exhibiciones"
  | "pdvs_exhibidos"
  | "compradores"
  | "cobertura_compra"
  | "bultos";

export interface VendorDetalleSidebarKpiItem {
  key: VendorDetalleSidebarKpiKey;
  label: string;
  description: string;
}

export const VENDOR_DETALLE_SIDEBAR_KPIS: VendorDetalleSidebarKpiItem[] = [
  {
    key: "pdvs",
    label: "PDVs",
    description: "Cantidad de PDVs en padrón asignados a las rutas del vendedor.",
  },
  {
    key: "exhibiciones",
    label: "Exhibiciones",
    description:
      "Exhibiciones lógicas enviadas: máx. 1 por cliente y día. Varias fotos el mismo día cuentan una sola (mejor estado).",
  },
  {
    key: "pdvs_exhibidos",
    label: "PDVs Exhibidos",
    description: "Cantidad de PDVs distintos con al menos una exhibición lógica en el período.",
  },
  {
    key: "compradores",
    label: "Compradores",
    description: "PDVs de la cartera con al menos una compra válida en el período.",
  },
  {
    key: "cobertura_compra",
    label: "Cobertura",
    description: "Porcentaje de PDVs compradores sobre el total de la cartera (compradores ÷ PDVs).",
  },
  {
    key: "bultos",
    label: "Bultos",
    description: "Venta total en bultos del período (sin anulados ni devoluciones).",
  },
];

export function formatVendorDetalleSidebarKpiValue(
  key: VendorDetalleSidebarKpiKey,
  raw: VendorRawKpis,
): string {
  switch (key) {
    case "cobertura_compra": {
      const pct =
        raw.cobertura_compra_pct ??
        (raw.pdvs > 0 ? (raw.compradores / raw.pdvs) * 100 : 0);
      return `${pct.toFixed(1)}%`;
    }
    case "pdvs_exhibidos":
      return String(raw.pdvs_exhibidos ?? 0);
    default:
      return String(raw[key as keyof VendorRawKpis] ?? 0);
  }
}
