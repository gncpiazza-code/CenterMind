import type { RadarKPI, VendorRawKpis } from "@/lib/api";

function pickIdealPct(
  dist?: RadarKPI,
  compania?: RadarKPI,
  key: keyof RadarKPI = "pdvs_exhibidos",
): number {
  const d = Number(dist?.[key] ?? 0);
  if (d > 0) return d;
  const c = Number(compania?.[key] ?? 0);
  if (c > 0) return c;
  return 100;
}

/** Conteo de PDVs con exhibición; si el backend trae % pero 0 en conteo, se infiere. */
export function resolvePdvsExhibidosCount(
  raw: VendorRawKpis,
  override?: number,
): number {
  if (override != null && override > 0) return Math.round(override);
  const direct = Number(raw.pdvs_exhibidos ?? 0);
  if (direct > 0) return Math.round(direct);
  const pdvs = Number(raw.pdvs ?? 0);
  const pct = Number(raw.cobertura_pct ?? 0);
  if (pdvs > 0 && pct > 0) return Math.round((pdvs * pct) / 100);
  return 0;
}

export function exhibitionCoveragePct(raw: VendorRawKpis): number {
  const pdvs = Number(raw.pdvs ?? 0);
  const exhibited = resolvePdvsExhibidosCount(raw);
  if (pdvs > 0 && exhibited > 0) {
    return Math.min(100, (exhibited / pdvs) * 100);
  }
  const direct = Number(raw.cobertura_pct ?? 0);
  return direct > 0 ? Math.min(100, direct) : 0;
}

export function purchaseCoveragePct(raw: VendorRawKpis): number {
  const direct = Number(raw.cobertura_compra_pct ?? 0);
  if (direct > 0) return Math.min(100, direct);
  const pdvs = Number(raw.pdvs ?? 0);
  if (pdvs <= 0) return 0;
  return Math.min(100, (Number(raw.compradores ?? 0) / pdvs) * 100);
}

/** Cumplimiento 0–100 vs meta % del ideal (eje radar CEX / COB). */
export function complianceVsIdealPct(realPct: number, idealPct: number): number {
  const ideal = idealPct > 0 ? idealPct : 100;
  return Math.min(100, Math.max(0, Math.round((realPct / ideal) * 100)));
}

/**
 * Enriquece raw_kpis cuando la carta trae pdvs_exhibidos/cobertura en 0 pero el detalle sí tiene datos.
 */
export function effectiveRawKpisForRadar(
  raw: VendorRawKpis,
  options?: { pdvsExhibidos?: number },
): VendorRawKpis {
  const pdvs = Number(raw.pdvs ?? 0);
  const pdvsExhibidos = resolvePdvsExhibidosCount(raw, options?.pdvsExhibidos);

  let coberturaPct = Number(raw.cobertura_pct ?? 0);
  if (pdvs > 0 && pdvsExhibidos > 0) {
    const fromCount = Math.min(100, (pdvsExhibidos / pdvs) * 100);
    if (coberturaPct <= 0) coberturaPct = fromCount;
  }

  return {
    ...raw,
    pdvs_exhibidos: pdvsExhibidos,
    cobertura_pct: coberturaPct,
  };
}

/**
 * Valor del eje CEX en el radar: % de cartera con exhibición (PDVs exhibidos ÷ PDVs).
 */
export function cexRadarValue(
  raw: VendorRawKpis,
  radar: RadarKPI,
  options?: { pdvsExhibidos?: number },
): number {
  const effective = effectiveRawKpisForRadar(raw, options);
  const pct = exhibitionCoveragePct(effective);
  if (pct > 0) return Math.round(pct);
  const legacy = Number(radar.pdvs_exhibidos ?? 0);
  if (legacy > 0 && legacy <= 100) return Math.round(legacy);
  return 0;
}

/**
 * Alinea CEX/COB del radar con raw_kpis (snapshots legacy pueden traer 0 en el polígono).
 */
export function mergeFusionRadarFromRaw(
  radar: RadarKPI,
  raw: VendorRawKpis,
  idealMetaDist?: RadarKPI,
  idealMetaCompania?: RadarKPI,
  options?: { pdvsExhibidos?: number },
): RadarKPI {
  const effective = effectiveRawKpisForRadar(raw, options);
  const idealCob = pickIdealPct(idealMetaDist, idealMetaCompania, "cobertura");
  const compPct = purchaseCoveragePct(effective);
  const cex = cexRadarValue(raw, radar, options);
  const cob =
    compPct > 0 || Number(effective.compradores ?? 0) > 0
      ? complianceVsIdealPct(compPct, idealCob)
      : Number(radar.cobertura ?? 0);

  return {
    ...radar,
    pdvs_exhibidos: cex,
    cobertura: cob,
  };
}
