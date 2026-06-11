import type { AvanceCoberturaSkus, AvanceSkuRankingRow } from "@/lib/api";

/** Deriva cobertura SKU en cliente si el BE aún no envía `series.cobertura_skus`. */
export function deriveCoberturaSkus(
  ranking: AvanceSkuRankingRow[] | undefined,
  fromApi: AvanceCoberturaSkus | undefined,
): AvanceCoberturaSkus | undefined {
  if (fromApi?.disponible) return fromApi;
  const rows = ranking ?? [];
  if (rows.length === 0) return undefined;

  const catalogo = rows.length;
  const conVenta = rows.filter((r) => !r.sin_venta && Math.abs(r.bultos) > 0.005).length;
  const sinVenta = Math.max(0, catalogo - conVenta);

  return {
    disponible: true,
    catalogo,
    con_venta: conVenta,
    sin_venta: sinVenta,
    pct_con_venta: catalogo > 0 ? Math.round((conVenta / catalogo) * 1000) / 10 : null,
  };
}
