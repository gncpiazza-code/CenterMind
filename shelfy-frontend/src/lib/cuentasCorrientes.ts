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

/** "2026-05" → "Mayo" (es-AR). */
export function mesEnLetras(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  if (!y || !m) return yyyyMm;
  const label = new Date(y, m - 1, 1).toLocaleDateString("es-AR", { month: "long" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}
