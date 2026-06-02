import type { DeudorComprobante, DeudorDetalle, DeudorPerfil } from "@/lib/api";
import { formatBultosCantidad } from "@/lib/bultos-display";

export interface CompraArticuloMes {
  codigo: string;
  articulo: string;
  bultos: number;
  importe: number;
  displayPrimary: string;
  displaySecondary?: string;
}

export interface CompraRemitoMes {
  numero: string;
  label: string;
  fecha: string;
  importe: number;
  bultos: number;
  articulos: CompraArticuloMes[];
  /** true = viene del matcheo de deuda CC (ventas enriched) */
  esAdeudo?: boolean;
}

/** Normaliza fechas ISO, DD/MM/YYYY o timestamp a YYYY-MM-DD. */
export function parseFechaComprobanteAR(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const slash = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slash) {
    const [, d, m, y] = slash;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  try {
    const parsed = new Date(t);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  } catch {
    /* ignore */
  }
  return "";
}

function fechaEnRango(fecha: string, desde: string, hasta: string): boolean {
  if (!fecha || !desde || !hasta) return false;
  return fecha >= desde && fecha <= hasta;
}

function mapArticulosFromDeudor(comp: DeudorComprobante): CompraArticuloMes[] {
  return (comp.articulos ?? []).map((art) => {
    const bultos = Number(art.bultos_total) || 0;
    const fmt = formatBultosCantidad(bultos);
    return {
      codigo: art.cod_articulo || "",
      articulo: art.descripcion || "Sin descripción",
      bultos,
      importe: Number(art.importe_final) || 0,
      displayPrimary: fmt.primary,
      displaySecondary: fmt.secondary,
    };
  });
}

function remitoFromComprobante(comp: DeudorComprobante, esAdeudo = false): CompraRemitoMes {
  const fecha = parseFechaComprobanteAR(comp.fecha);
  const articulos = mapArticulosFromDeudor(comp);
  const bultos = articulos.reduce((s, a) => s + a.bultos, 0);
  const importe = Number(comp.importe_total) || articulos.reduce((s, a) => s + a.importe, 0);
  const label =
    comp.label?.trim() ||
    [comp.tipo_documento, comp.numero].filter(Boolean).join(" ").trim() ||
    comp.numero ||
    "Comprobante";

  return {
    numero: comp.numero || label,
    label,
    fecha,
    importe,
    bultos,
    articulos,
    esAdeudo,
  };
}

/** Última compra del padrón/enriched cuando cae en el mes filtrado. */
function remitosFromUltimaCompra(perfil: DeudorPerfil, desde: string, hasta: string): CompraRemitoMes[] {
  const fecha = parseFechaComprobanteAR(perfil.fecha_ultima_compra);
  if (!fechaEnRango(fecha, desde, hasta)) return [];

  const articulosRaw = perfil.ultima_compra_articulos ?? [];
  if (articulosRaw.length === 0) return [];

  const articulos: CompraArticuloMes[] = articulosRaw.map((art) => {
    const bultos = Number(art.bultos_total) || 0;
    const fmt = formatBultosCantidad(bultos);
    return {
      codigo: "",
      articulo: art.descripcion || "Sin descripción",
      bultos,
      importe: Number(art.importe_final) || 0,
      displayPrimary: fmt.primary,
      displaySecondary: fmt.secondary,
    };
  });

  const bultos = articulos.reduce((s, a) => s + a.bultos, 0);
  const importe = articulos.reduce((s, a) => s + a.importe, 0);
  const uc = perfil.ultimo_comprobante;
  const label =
    uc?.label?.trim() ||
    [uc?.tipo_documento, uc?.numero_documento].filter(Boolean).join(" ").trim() ||
    "Última compra";

  return [
    {
      numero: uc?.numero_documento || `uc-${fecha}`,
      label,
      fecha,
      importe,
      bultos,
      articulos,
      esAdeudo: false,
    },
  ];
}

/**
 * Compras visibles en galería: comprobantes del mes (incl. adeudados matcheados)
 * + fallback última compra del perfil si el matcheo CC no devolvió filas.
 */
export function listComprasMesRemitos(
  detalle: DeudorDetalle | undefined,
  desde: string,
  hasta: string,
): {
  remitos: CompraRemitoMes[];
  totalBultos: number;
  totalBultosLabel: string;
  totalBultosSecondary?: string;
  totalImporte: number;
  comprobantesEnMes: number;
} {
  const empty = {
    remitos: [] as CompraRemitoMes[],
    totalBultos: 0,
    totalBultosLabel: "0 bultos",
    totalImporte: 0,
    comprobantesEnMes: 0,
  };
  if (!detalle || !desde || !hasta) return empty;

  const byKey = new Map<string, CompraRemitoMes>();

  const mesFuente =
    detalle.comprobantes_mes?.length
      ? detalle.comprobantes_mes
      : null;

  if (mesFuente) {
    for (const comp of mesFuente) {
      const fecha = parseFechaComprobanteAR(comp.fecha);
      if (!fechaEnRango(fecha, desde, hasta)) continue;
      const rem = remitoFromComprobante(comp, false);
      rem.fecha = fecha || rem.fecha;
      byKey.set(`${rem.numero}|${rem.fecha}`, rem);
    }
  } else {
    for (const comp of detalle.comprobantes ?? []) {
      const fecha = parseFechaComprobanteAR(comp.fecha);
      if (!fechaEnRango(fecha, desde, hasta)) continue;
      const rem = remitoFromComprobante(comp, true);
      rem.fecha = fecha || rem.fecha;
      byKey.set(`${rem.numero}|${rem.fecha}`, rem);
    }
  }

  const perfil = detalle.perfil;
  if (perfil) {
    for (const rem of remitosFromUltimaCompra(perfil, desde, hasta)) {
      const key = `${rem.numero}|${rem.fecha}`;
      if (!byKey.has(key)) byKey.set(key, rem);
    }
  }

  const remitos = [...byKey.values()].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const totalBultos = remitos.reduce((s, r) => s + r.bultos, 0);
  const totalFmt = formatBultosCantidad(totalBultos);
  const totalImporte = remitos.reduce((s, r) => s + r.importe, 0);

  return {
    remitos,
    totalBultos,
    totalBultosLabel: totalFmt.primary,
    totalBultosSecondary: totalFmt.secondary,
    totalImporte,
    comprobantesEnMes: remitos.length,
  };
}

/** Comprobantes asociados a la deuda (sin filtrar por mes de galería). */
export function listComprobantesDeuda(detalle: DeudorDetalle | undefined): CompraRemitoMes[] {
  if (!detalle?.comprobantes?.length) return [];
  return detalle.comprobantes.map((c) => remitoFromComprobante(c, true));
}

/** Agrega artículos de comprobantes dentro del rango [desde, hasta] (YYYY-MM-DD). */
export function aggregateComprasMes(
  detalle: DeudorDetalle | undefined,
  desde: string,
  hasta: string,
) {
  const { remitos, ...rest } = listComprasMesRemitos(detalle, desde, hasta);
  const map = new Map<string, CompraArticuloMes>();
  for (const rem of remitos) {
    for (const art of rem.articulos) {
      const key = `${art.codigo}|${art.articulo}`;
      const prev = map.get(key);
      if (prev) {
        prev.bultos += art.bultos;
        prev.importe += art.importe;
      } else {
        map.set(key, { ...art });
      }
    }
  }
  const articulos = [...map.values()]
    .sort((a, b) => b.bultos - a.bultos)
    .map((a) => {
      const fmt = formatBultosCantidad(a.bultos);
      return { ...a, displayPrimary: fmt.primary, displaySecondary: fmt.secondary };
    });
  return { articulos, ...rest };
}

/** Orden estable para ↑/↓ entre PDVs (norte → sur, oeste → este). */
export function sortMapPinsForNav<T extends { latitud: number; longitud: number; nombre_cliente: string }>(
  pins: T[],
): T[] {
  return [...pins].sort((a, b) => {
    const latDiff = b.latitud - a.latitud;
    if (Math.abs(latDiff) > 0.0001) return latDiff;
    const lngDiff = a.longitud - b.longitud;
    if (Math.abs(lngDiff) > 0.0001) return lngDiff;
    return a.nombre_cliente.localeCompare(b.nombre_cliente, "es");
  });
}
