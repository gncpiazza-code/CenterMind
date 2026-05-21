/** Estilos de badge por rango de antigüedad (CC supervisión). */
export const RANGO_COLORS: Record<string, string> = {
  "1-7 Días": "bg-emerald-100 text-emerald-800 border-emerald-200",
  "8-15 Días": "bg-amber-100 text-amber-800 border-amber-200",
  "16-21 Días": "bg-orange-100 text-orange-800 border-orange-200",
  "22-30 Días": "bg-red-100 text-red-800 border-red-200",
  "+30 Días": "bg-rose-100 text-rose-900 border-rose-200",
};

export function rangoBadgeClass(rango: string | null | undefined): string {
  if (!rango) return "";
  return (
    RANGO_COLORS[rango] ??
    "bg-muted text-muted-foreground border-border"
  );
}

/** Etiqueta compacta para la columna Rango (evita cortes en tablas angostas). */
export function formatRangoBadgeLabel(rango: string): string {
  const t = rango.trim();
  const m = t.match(/^(\+?\d+(?:-\d+)?)\s+D[ií]as$/i);
  if (m) return `${m[1]}d`;
  return t;
}

/** Nombre legible desde cc_detalle.vendedor_nombre ("CODE - NOMBRE"). */
export function extractCCVendedorName(vendedor: string): string {
  const idx = vendedor.indexOf(" - ");
  return idx >= 0 ? vendedor.slice(idx + 3).trim() : vendedor.trim();
}

/** Tokens numéricos del prefijo CHESS en vendedor_nombre de CC. */
export function ccVendorCodeTokens(vendedorNombre: string): string[] {
  const head = (vendedorNombre || "").split(" - ")[0]?.trim() ?? "";
  const out: string[] = [];
  for (const m of head.matchAll(/\d+/g)) {
    const raw = m[0];
    const norm = raw.replace(/^0+/, "") || "0";
    for (const tok of [raw, norm]) {
      if (tok && !out.includes(tok)) out.push(tok);
    }
  }
  return out;
}

/** True si la fila CC corresponde al vendedor del padrón (nombre o código ERP). */
export function ccRowMatchesVendedor(
  ccVendedor: string,
  ccIdVendedor: number | null | undefined,
  nombreErp: string,
  idVendedor?: number | null,
  idVendedorErp?: string | null,
): boolean {
  const vn = (ccVendedor || "").trim();
  if (!vn || !nombreErp) return false;
  if (
    idVendedor != null &&
    ccIdVendedor != null &&
    Number(ccIdVendedor) === Number(idVendedor)
  ) {
    return true;
  }
  if (normVendorName(extractCCVendedorName(vn)) === normVendorName(nombreErp)) {
    return true;
  }
  if (!idVendedorErp) return false;
  const erp = String(idVendedorErp).trim();
  const erpNorm = erp.replace(/^0+/, "") || "0";
  return ccVendorCodeTokens(vn).some(
    (tok) => tok === erp || tok === erpNorm || erp.endsWith(tok) || erpNorm.endsWith(tok),
  );
}

/** Normaliza nombres para matching (sin acentos, puntuación). */
export function normVendorName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type CCSortCol = "deuda" | "antiguedad" | "comprobantes" | "ultima_compra";
export type CCSortDir = "asc" | "desc";

function ccSortValue(
  row: {
    deuda_total?: number;
    antiguedad?: number | null;
    cantidad_comprobantes?: number | null;
    fecha_ultima_compra?: string | null;
  },
  sort: CCSortCol,
): number | string {
  switch (sort) {
    case "deuda":
      return Number(row.deuda_total ?? 0);
    case "antiguedad":
      return Number(row.antiguedad ?? 0);
    case "comprobantes":
      return Number(row.cantidad_comprobantes ?? 0);
    case "ultima_compra":
      return row.fecha_ultima_compra ?? "";
    default:
      return 0;
  }
}

export function sortClientesCC<
  T extends {
    deuda_total?: number;
    antiguedad?: number | null;
    cantidad_comprobantes?: number | null;
    fecha_ultima_compra?: string | null;
  },
>(clientes: T[], sort: CCSortCol, dir: CCSortDir): T[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...clientes].sort((a, b) => {
    const av = ccSortValue(a, sort);
    const bv = ccSortValue(b, sort);
    if (typeof av === "string" || typeof bv === "string") {
      return mul * String(av).localeCompare(String(bv));
    }
    return mul * (av - bv);
  });
}

/** Rangos de antigüedad (mismo criterio que PDF / cuentas_parser). */
export const CC_ANTIGUEDAD_LABELS = [
  "1-7 Días",
  "8-15 Días",
  "16-21 Días",
  "22-30 Días",
  "+30 Días",
] as const;

export function antiguedadRangoLabel(dias: number | null | undefined): string {
  const d = Number(dias ?? 0);
  if (d <= 7) return "1-7 Días";
  if (d <= 15) return "8-15 Días";
  if (d <= 21) return "16-21 Días";
  if (d <= 30) return "22-30 Días";
  return "+30 Días";
}

function normalizeAntiguedadLabel(raw: string | null | undefined): string {
  const t = (raw || "").trim();
  if (!t) return "";
  for (const lab of CC_ANTIGUEDAD_LABELS) {
    if (t.toLowerCase() === lab.toLowerCase()) return lab;
  }
  return t;
}

export interface CcResumenRow {
  label: string;
  monto: number;
  pct: number;
  clientes: number;
}

/** Deuda efectiva: saldo_total o suma de tramos CHESS si el total viene en 0. */
export function ccDeudaCliente(c: {
  deuda_total?: number | null;
  deuda_7_dias?: number | null;
  deuda_15_dias?: number | null;
  deuda_30_dias?: number | null;
  deuda_60_dias?: number | null;
  deuda_mas_60_dias?: number | null;
}): number {
  const total = Number(c.deuda_total ?? 0);
  if (total > 0) return total;
  return (
    Number(c.deuda_7_dias ?? 0) +
    Number(c.deuda_15_dias ?? 0) +
    Number(c.deuda_30_dias ?? 0) +
    Number(c.deuda_60_dias ?? 0) +
    Number(c.deuda_mas_60_dias ?? 0)
  );
}

/** Distribución por antigüedad del cliente (como PDF «Distribución de deuda por antigüedad»). */
export function computeDeudaPorAntiguedad(
  clientes: Array<{
    antiguedad?: number | null;
    antiguedad_cc?: number | null;
    antiguedad_desde_padron?: boolean;
    deuda_total?: number | null;
    rango_antiguedad?: string | null;
    deuda_7_dias?: number | null;
    deuda_15_dias?: number | null;
    deuda_30_dias?: number | null;
    deuda_60_dias?: number | null;
    deuda_mas_60_dias?: number | null;
  }>,
): CcResumenRow[] {
  const buckets: Record<string, { monto: number; clientes: number }> = {};
  for (const lab of CC_ANTIGUEDAD_LABELS) {
    buckets[lab] = { monto: 0, clientes: 0 };
  }
  for (const c of clientes) {
    const amt = ccDeudaCliente(c);
    if (amt <= 0) continue;
    const dias = Number(c.antiguedad ?? 0);
    const lab =
      normalizeAntiguedadLabel(c.rango_antiguedad) ||
      antiguedadRangoLabel(dias);
    const key = buckets[lab] !== undefined ? lab : antiguedadRangoLabel(dias);
    buckets[key].monto += amt;
    buckets[key].clientes += 1;
  }
  const total = Object.values(buckets).reduce((a, b) => a + b.monto, 0) || 1;
  return CC_ANTIGUEDAD_LABELS.map((label) => ({
    label,
    monto: buckets[label].monto,
    pct: (100 * buckets[label].monto) / total,
    clientes: buckets[label].clientes,
  }));
}

/** Buckets de saldo CHESS (misma nomenclatura que PDF / cc_detalle). */
export const CC_SALDO_BUCKET_KEYS = [
  { key: "deuda_7_dias", label: "7 días" },
  { key: "deuda_15_dias", label: "15 días" },
  { key: "deuda_30_dias", label: "30 días" },
  { key: "deuda_60_dias", label: "60 días" },
  { key: "deuda_mas_60_dias", label: "+60 días" },
] as const;

export type CcSaldoBucketKey = (typeof CC_SALDO_BUCKET_KEYS)[number]["key"];

export interface CcSaldoBucketRow {
  label: string;
  monto: number;
  pct: number;
}

export function computeDeudaPorSaldoBuckets(
  clientes: Array<Partial<Record<CcSaldoBucketKey, number | null | undefined>>>,
): CcSaldoBucketRow[] {
  const sums: Record<CcSaldoBucketKey, number> = {
    deuda_7_dias: 0,
    deuda_15_dias: 0,
    deuda_30_dias: 0,
    deuda_60_dias: 0,
    deuda_mas_60_dias: 0,
  };
  for (const c of clientes) {
    for (const { key } of CC_SALDO_BUCKET_KEYS) {
      sums[key] += Number(c[key] ?? 0);
    }
  }
  const totalBuckets = Object.values(sums).reduce((a, b) => a + b, 0);
  const denom = totalBuckets > 0 ? totalBuckets : 1;
  return CC_SALDO_BUCKET_KEYS.map(({ key, label }) => ({
    label,
    monto: sums[key],
    pct: (100 * sums[key]) / denom,
  }));
}

/** Texto auxiliar para última compra + coherencia con mora CC. */
export function formatUltimaCompraCC(
  fecha: string | null | undefined,
  diasDesde: number | null | undefined,
  padronAlerta?: boolean,
): string {
  if (padronAlerta) {
    const dias = diasDesde != null ? ` (padrón hace ${diasDesde}d)` : "";
    return `Revisar ERP${dias}`;
  }
  if (!fecha) return "—";
  const f = formatFechaPadron(fecha);
  if (diasDesde != null && diasDesde >= 0) {
    return `${f} · hace ${diasDesde}d`;
  }
  return f;
}

/** Formatea fecha del padrón (ISO YYYY-MM-DD). Evita parse ambiguo de strings no ISO. */
export function formatFechaPadron(fecha: string | null | undefined): string {
  if (!fecha) return "—";
  const raw = String(fecha).trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("es-AR");
    }
  }
  const parsed = new Date(raw.includes("T") ? raw : `${raw}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString("es-AR");
}

/** "2026-05" → "Mayo" (es-AR). */
export function mesEnLetras(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  if (!y || !m) return yyyyMm;
  const label = new Date(y, m - 1, 1).toLocaleDateString("es-AR", { month: "long" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}
