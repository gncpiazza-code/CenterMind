"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  UltimaCompraArticulo,
  UltimaCompraComprobanteBlock,
  UltimoComprobanteResumen,
} from "@/lib/api";
import { FileText, ShoppingCart } from "lucide-react";

export function fmtUltimaCompraImporte(n?: number | null): string | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);
}

type RecenciaCompra = "reciente" | "media" | "antigua";
export type RemitoDensity = "compact" | "comfortable";
export type RemitoLayout = "inline" | "panel-fill";

type RemitoTokens = {
  headerPad: string;
  bodyPad: string;
  label: string;
  fechaBadge: string;
  multiHint: string;
  sectionTitle: string;
  numero: string;
  footerPad: string;
  footerLabel: string;
  footerValue: string;
  itemTitle: string;
  itemMeta: string;
  index: string;
  badge: string;
  tipoBadge: string;
  itemRow: string;
  blockGap: string;
};

/** Tokens legibles para sidebar del visor (compact = default panel) */
const REMITO_DENSITY: Record<RemitoDensity, RemitoTokens> = {
  compact: {
    headerPad: "px-3 py-2",
    bodyPad: "px-3 py-2",
    label: "text-[10px]",
    fechaBadge: "h-5 px-2 text-[10px]",
    multiHint: "text-[10px] leading-snug mt-1",
    sectionTitle: "text-[9px] mb-1",
    numero: "text-[11px]",
    footerPad: "px-3 py-2",
    footerLabel: "text-[10px]",
    footerValue: "text-sm",
    itemTitle: "text-[11px] leading-snug font-semibold",
    itemMeta: "text-[10px] leading-snug",
    index: "text-[10px]",
    badge: "h-5 px-1.5 text-[9px]",
    tipoBadge: "h-5 px-2 text-[9px]",
    itemRow: "py-2",
    blockGap: "pt-2 mt-2",
  },
  comfortable: {
    headerPad: "px-3.5 py-2.5",
    bodyPad: "px-3.5 py-2.5",
    label: "text-[11px]",
    fechaBadge: "h-5 px-2 text-[10px]",
    multiHint: "text-[11px] leading-snug mt-1",
    sectionTitle: "text-[10px] mb-1",
    numero: "text-[12px]",
    footerPad: "px-3.5 py-2.5",
    footerLabel: "text-[11px]",
    footerValue: "text-base",
    itemTitle: "text-[12px] leading-snug font-semibold",
    itemMeta: "text-[11px] leading-snug",
    index: "text-[11px]",
    badge: "h-5 px-2 text-[10px]",
    tipoBadge: "h-5 px-2 text-[10px]",
    itemRow: "py-2.5",
    blockGap: "pt-3 mt-3",
  },
};

const RECENCIA_STYLES: Record<
  RecenciaCompra,
  { border: string; chip: string; label: string }
> = {
  reciente: {
    border: "border-l-emerald-500",
    chip: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
    label: "Última compra",
  },
  media: {
    border: "border-l-amber-500",
    chip: "bg-amber-500/12 text-amber-800 dark:text-amber-400 border-amber-500/25",
    label: "Última compra",
  },
  antigua: {
    border: "border-l-slate-400",
    chip: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
    label: "Última compra",
  },
};

function recenciaFromDias(dias: number | null | undefined): RecenciaCompra {
  if (dias == null) return "reciente";
  if (dias <= 30) return "reciente";
  if (dias <= 60) return "media";
  return "antigua";
}

function recenciaFromFecha(fecha: string): RecenciaCompra {
  const t = new Date(fecha).getTime();
  if (!Number.isFinite(t)) return "reciente";
  const dias = Math.floor((Date.now() - t) / 86_400_000);
  return recenciaFromDias(dias);
}

function fmtFechaRemito(fecha: string): string {
  try {
    return new Date(fecha).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return String(fecha).slice(0, 10);
  }
}

function tipoBadgeClass(tipo: string): string {
  const t = tipo.toUpperCase();
  if (t.includes("NC") || t.startsWith("N")) {
    return "bg-rose-600/90 text-white border-transparent";
  }
  if (t.includes("REM")) {
    return "bg-amber-600/90 text-white border-transparent";
  }
  if (t.includes("FC") || t.includes("FAC") || t.includes("VTA")) {
    return "bg-sky-700/90 text-white border-transparent";
  }
  return "bg-slate-600/90 text-white border-transparent";
}

interface ComprobanteParsed {
  tipo: string;
  serie: string;
  numero: string;
}

function parseComprobante(cb?: UltimoComprobanteResumen | null): ComprobanteParsed | null {
  if (!cb) return null;
  const tipo = (cb.tipo_documento || "").trim();
  const serie = (cb.serie || "").trim();
  const numeroRaw = (cb.numero_documento || "").trim();
  if (tipo || numeroRaw || serie) {
    const numero = numeroRaw ? `#${numeroRaw.replace(/^#/, "")}` : "";
    return { tipo: tipo || "COMP", serie, numero };
  }
  const label = (cb.label || "").trim();
  if (!label) return null;
  const parts = label.split(/\s+/);
  if (parts.length === 0) return null;
  const tipoFromLabel = parts[0] || "COMP";
  let serieFromLabel = "";
  let numeroFromLabel = "";
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    if (p.startsWith("#")) {
      numeroFromLabel = p;
      break;
    }
    if (!numeroFromLabel && /^\d+$/.test(p) && i === parts.length - 1) {
      numeroFromLabel = `#${p}`;
    } else if (!numeroFromLabel) {
      serieFromLabel = serieFromLabel ? `${serieFromLabel} ${p}` : p;
    }
  }
  if (!numeroFromLabel && parts.length > 1) {
    const last = parts[parts.length - 1];
    numeroFromLabel = last.startsWith("#") ? last : `#${last}`;
    if (parts.length > 2) serieFromLabel = parts.slice(1, -1).join(" ");
  }
  return { tipo: tipoFromLabel, serie: serieFromLabel, numero: numeroFromLabel };
}

function fmtPrecioUnitario(a: UltimaCompraArticulo): string | null {
  const imp = Number(a.importe_final);
  const u = Number(a.unidades_total);
  if (!Number.isFinite(imp) || imp <= 0 || !Number.isFinite(u) || u <= 0) return null;
  return fmtUltimaCompraImporte(imp / u);
}

function fmtUnidadesArticulo(a: UltimaCompraArticulo): string {
  const u = Number(a.unidades_total);
  if (Number.isFinite(u) && u > 0) {
    return Number.isInteger(u) || Math.abs(u - Math.round(u)) < 0.01
      ? `${Math.round(u)} u.`
      : `${u.toFixed(1)} u.`;
  }
  return "0 u.";
}

function articulosFromResumen(resumen: string): { descripcion: string; unidades: string }[] {
  return resumen.split(/\s*·\s*/).filter(Boolean).map((line) => {
    const m = line.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (m) return { descripcion: m[1].trim(), unidades: m[2].trim() };
    return { descripcion: line.trim(), unidades: "" };
  });
}

function resolveComprobanteBlocks(
  comprobantes?: UltimaCompraComprobanteBlock[] | null,
  comprobante?: UltimoComprobanteResumen | null,
  articulos?: UltimaCompraArticulo[] | null,
  resumen?: string | null,
): UltimaCompraComprobanteBlock[] {
  if (comprobantes?.length) return comprobantes;
  if (comprobante || articulos?.length) {
    return [{ comprobante, articulos: articulos ?? [] }];
  }
  if (resumen) {
    return [
      {
        comprobante: null,
        articulos: articulosFromResumen(resumen).map((a) => ({
          descripcion: a.descripcion,
          bultos_total: 0,
          unidades_total: 0,
          importe_final: 0,
        })),
      },
    ];
  }
  return [];
}

function countArticulos(blocks: UltimaCompraComprobanteBlock[]): number {
  return blocks.reduce((s, b) => s + (b.articulos?.length ?? 0), 0);
}

export function computeRemitoStats(
  comprobantes?: UltimaCompraComprobanteBlock[] | null,
  comprobante?: UltimoComprobanteResumen | null,
  articulos?: UltimaCompraArticulo[] | null,
  resumen?: string | null,
) {
  const blocks = resolveComprobanteBlocks(comprobantes, comprobante, articulos, resumen);
  const articuloCount = countArticulos(blocks);
  return {
    blocks,
    comprobanteCount: blocks.length,
    articuloCount,
    likelyNeedsExpand: blocks.length >= 2 || articuloCount >= 4,
  };
}

/** Tipografía según cantidad: más ítems → un poco más compacto; sin estirar alto. */
function adaptiveRemitoTokens(base: RemitoTokens, articuloCount: number): RemitoTokens {
  if (articuloCount <= 0) return base;
  if (articuloCount <= 2) {
    return {
      ...base,
      itemTitle: "text-[12px] leading-snug font-semibold",
      itemMeta: "text-[11px]",
      itemRow: "py-2.5",
    };
  }
  if (articuloCount <= 5) return base;
  return {
    ...base,
    itemTitle: "text-[10px] leading-tight font-semibold",
    itemMeta: "text-[9px] leading-tight",
    itemRow: "py-1.5",
    footerPad: "px-3 py-1.5",
  };
}

function RemitoComprobanteBloque({
  block,
  indice,
  total,
  maxArticulos,
  tokens,
}: {
  block: UltimaCompraComprobanteBlock;
  indice: number;
  total: number;
  maxArticulos: number;
  tokens: RemitoTokens;
}) {
  const d = tokens;
  const parsed = parseComprobante(block.comprobante);
  const articulosList = block.articulos ?? [];
  const lineas = (maxArticulos > 0 ? articulosList.slice(0, maxArticulos) : articulosList).map((a) => ({
    descripcion: a.descripcion,
    unidades: fmtUnidadesArticulo(a),
    importe: a.importe_final > 0 ? fmtUltimaCompraImporte(a.importe_final) : null,
    precioUnit: fmtPrecioUnitario(a),
  }));

  return (
    <div
      className={cn(
        total > 1 &&
          indice > 0 &&
          cn(d.blockGap, "border-t border-dashed border-slate-300/70 dark:border-slate-600/50"),
      )}
    >
      {total > 1 ? (
        <p
          className={cn(
            "font-bold uppercase tracking-wider text-sky-800/90 dark:text-sky-300/90",
            d.sectionTitle,
          )}
        >
          Comprobante {indice + 1} de {total}
        </p>
      ) : null}

      {parsed ? (
        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
          <Badge
            className={cn(
              "font-bold uppercase tracking-wide rounded-sm",
              d.tipoBadge,
              tipoBadgeClass(parsed.tipo),
            )}
          >
            {parsed.tipo}
          </Badge>
          {parsed.numero ? (
            <span className={cn("font-mono font-bold text-slate-800 dark:text-slate-100 tracking-tight", d.numero)}>
              Nº {parsed.numero}
            </span>
          ) : null}
        </div>
      ) : block.comprobante?.label ? (
        <p className={cn("font-mono font-semibold text-slate-800 dark:text-slate-100 mb-1.5", d.numero)}>
          {block.comprobante.label}
        </p>
      ) : null}

      {lineas.length > 0 ? (
        <ul className="flex flex-col list-none rounded-md border border-slate-200/80 dark:border-slate-700/60 bg-white/70 dark:bg-slate-950/30 overflow-hidden divide-y divide-slate-200/70 dark:divide-slate-700/50">
          {lineas.map((line, idx) => (
            <li key={`${line.descripcion}-${idx}`} className={cn("px-2.5", d.itemRow)}>
              <div className="flex gap-2 items-start w-full">
                <span className={cn("font-mono tabular-nums text-slate-400 pt-0.5 shrink-0 w-[1.1rem]", d.index)}>
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-slate-800 dark:text-slate-100 break-words", d.itemTitle)}>
                    {line.descripcion}
                  </p>
                  {line.precioUnit ? (
                    <p className={cn("mt-0.5 tabular-nums text-sky-800 dark:text-sky-300 font-medium", d.itemMeta)}>
                      {line.precioUnit}
                      <span className="text-slate-500 dark:text-slate-400 font-normal"> /u</span>
                    </p>
                  ) : null}
                </div>
                <div
                  className={cn(
                    "shrink-0 flex flex-col items-end justify-start gap-0.5 tabular-nums text-right min-w-[4.25rem]",
                    d.itemMeta,
                  )}
                >
                  <span className="font-semibold text-slate-600 dark:text-slate-400">{line.unidades}</span>
                  {line.importe ? (
                    <span className="font-bold text-slate-900 dark:text-slate-100">{line.importe}</span>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

interface UltimaCompraRemitoCardProps {
  fecha: string;
  comprobantes?: UltimaCompraComprobanteBlock[] | null;
  comprobante?: UltimoComprobanteResumen | null;
  articulos?: UltimaCompraArticulo[] | null;
  resumen?: string | null;
  diasDesde?: number | null;
  maxArticulos?: number;
  density?: RemitoDensity;
  adaptive?: boolean;
  layout?: RemitoLayout;
  /** En panel visor: ancho completo, alto máximo del slot, scroll si hay muchos ítems */
  fillHeight?: boolean;
  /** Modo foco: ocupa el panel, cuerpo con scroll y sin recorte externo */
  focusMode?: boolean;
  className?: string;
}

export function UltimaCompraRemitoCard({
  fecha,
  comprobantes,
  comprobante,
  articulos,
  resumen,
  diasDesde,
  maxArticulos = 0,
  density = "compact",
  adaptive = false,
  layout = "inline",
  fillHeight = false,
  focusMode = false,
  className,
}: UltimaCompraRemitoCardProps) {
  const recencia = diasDesde != null ? recenciaFromDias(diasDesde) : recenciaFromFecha(fecha);
  const styles = RECENCIA_STYLES[recencia];
  const blocks = resolveComprobanteBlocks(comprobantes, comprobante, articulos, resumen);
  const articuloCount = countArticulos(blocks);
  const baseTokens = REMITO_DENSITY[density];
  const fillPanel = layout === "panel-fill";
  const panelSlot = fillPanel && (fillHeight || focusMode);
  const d = adaptive ? adaptiveRemitoTokens(baseTokens, articuloCount) : baseTokens;
  const multi = blocks.length > 1;
  /** Scroll interno solo con mucho contenido; no estirar cuerpo con pocos ítems */
  const scrollBody = focusMode || articuloCount > 5 || blocks.length >= 2;
  const panelScroll = panelSlot && scrollBody;
  const totalCompraNum = blocks.reduce(
    (sum, b) => sum + Number(b.comprobante?.importe_final ?? 0),
    0,
  );
  const totalCompraFmt = fmtUltimaCompraImporte(totalCompraNum);

  if (!blocks.length) {
    return (
      <p className="px-3 py-2 text-[11px] text-slate-500 italic flex items-center gap-1">
        <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
        Sin detalle de artículos
      </p>
    );
  }

  return (
    <div
      className={cn(
        fillPanel
          ? "w-full rounded-lg border border-slate-200/90 dark:border-slate-700/80 border-l-[4px] shadow-sm"
          : "w-full rounded-lg border border-slate-200/90 dark:border-slate-700/80 shadow-md",
        panelSlot
          ? cn(
              "flex flex-col w-full",
              panelScroll ? "flex-1 min-h-0 max-h-full" : "shrink-0 max-h-[min(70vh,100%)]",
            )
          : "",
        "bg-gradient-to-b from-amber-50/90 to-white dark:from-slate-900/50 dark:to-slate-950/40",
        "overflow-hidden",
        styles.border,
        className,
      )}
    >
      <div className={cn("shrink-0 border-b border-slate-200/70 dark:border-slate-700/50 bg-white/50 dark:bg-slate-900/30", d.headerPad)}>
        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1.5 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 shrink-0">
            <FileText className="w-3.5 h-3.5 shrink-0 text-slate-500" aria-hidden />
            <span className={cn("font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 whitespace-nowrap", d.label)}>
              {styles.label}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end min-w-0 ml-auto">
            {multi ? (
              <Badge className={cn("font-bold bg-sky-600/90 text-white border-transparent", d.fechaBadge)}>
                {blocks.length} comprobantes
              </Badge>
            ) : null}
            <Badge variant="outline" className={cn("font-semibold tabular-nums border", d.fechaBadge, styles.chip)}>
              {fmtFechaRemito(fecha)}
              {diasDesde != null ? (
                <span className="opacity-70 font-normal ml-1">· {diasDesde}d</span>
              ) : null}
            </Badge>
          </div>
        </div>
        {multi ? (
          <p className={cn("text-slate-600 dark:text-slate-400", d.multiHint)}>
            {blocks.length} comprobantes el mismo día
          </p>
        ) : null}
      </div>

      <div
        className={cn(
          panelScroll ? "flex-1 min-h-0 overflow-y-auto overscroll-contain" : "shrink-0",
          d.bodyPad,
        )}
      >
        {blocks.map((block, i) => (
          <RemitoComprobanteBloque
            key={`cbte-${i}-${block.comprobante?.label ?? block.comprobante?.numero_documento ?? i}`}
            block={block}
            indice={i}
            total={blocks.length}
            maxArticulos={maxArticulos}
            tokens={d}
          />
        ))}

        {totalCompraFmt ? (
          <div
            className={cn(
              "mt-2 rounded-md border-t border-slate-700/80 flex items-center justify-between gap-3 bg-slate-800",
              d.footerPad,
            )}
          >
            <span className={cn("font-bold uppercase tracking-wider text-slate-300", d.footerLabel)}>
              Total compra
            </span>
            <span className={cn("font-bold tabular-nums text-emerald-400 leading-none", d.footerValue)}>
              {totalCompraFmt}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
