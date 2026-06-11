import type {
  AvanceCoberturaPdvs,
  AvanceConvivenciaSkus,
  AvanceSkuRankingRow,
  AvanceVentasResponse,
} from "@/lib/api";

/** Convivencia SKU desde API o ranking (fallback cliente). */
export function deriveConvivenciaSkus(
  ranking: AvanceSkuRankingRow[] | undefined,
  fromApi: AvanceConvivenciaSkus | undefined,
  /** @deprecated API legacy `cobertura_skus` */
  legacyApi?: { disponible?: boolean; catalogo?: number; con_venta?: number; sin_venta?: number; pct_con_venta?: number | null },
): AvanceConvivenciaSkus | undefined {
  if (fromApi?.disponible) return fromApi;
  if (legacyApi?.disponible) {
    return {
      disponible: true,
      catalogo: legacyApi.catalogo ?? 0,
      con_venta: legacyApi.con_venta ?? 0,
      sin_venta: legacyApi.sin_venta ?? 0,
      pct_convivencia: legacyApi.pct_con_venta ?? null,
    };
  }
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
    pct_convivencia: catalogo > 0 ? Math.round((conVenta / catalogo) * 1000) / 10 : null,
  };
}

/** Cobertura PDV: clientes con compra / cartera visible. */
export function deriveCoberturaPdvs(
  data: Pick<AvanceVentasResponse, "cartera_scope" | "metadatos"> | undefined,
  fromApi: AvanceCoberturaPdvs | undefined,
): AvanceCoberturaPdvs | undefined {
  if (fromApi?.disponible) return fromApi;
  const cartera = data?.cartera_scope;
  if (!cartera || cartera <= 0) return undefined;
  const conCompra = data?.metadatos?.clientes_compra ?? 0;
  const sinCompra = Math.max(0, cartera - conCompra);
  return {
    disponible: true,
    cartera,
    con_compra: conCompra,
    sin_compra: sinCompra,
    pct_cobertura: Math.round((conCompra / cartera) * 1000) / 10,
  };
}
