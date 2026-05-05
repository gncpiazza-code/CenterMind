"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, User, Calendar, TrendingUp, CheckCircle2, XCircle,
  Clock, BarChart2, ShoppingBag, Target,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type {
  ReporteriaSource,
  ReporteriaClienteRow,
  SigoVendorDia,
} from "@/lib/api";
import { cn } from "@/lib/utils";

function fmt(v: number, unit?: string) {
  const u = unit ?? "";
  if (u === "%") return `${v.toFixed(1)}%`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (v >= 1_000 && u !== "") return `$${Math.round(v / 1_000)}k`;
  return Number.isInteger(v) ? v.toLocaleString("es-AR") : v.toFixed(1);
}

// ── SIGO drill-down ───────────────────────────────────────────────────────────

function SigoDrilldown({
  vendedor,
  rows,
}: {
  vendedor: string;
  rows: SigoVendorDia[];
}) {
  const filtered = rows.filter((r) => r.vendedor === vendedor);
  const totals = useMemo(() => ({
    planeadas:       filtered.reduce((s, r) => s + r.planeadas, 0),
    ejecutadas:      filtered.reduce((s, r) => s + r.ejecutadas, 0),
    con_venta:       filtered.reduce((s, r) => s + r.con_venta, 0),
    motivo_no_venta: filtered.reduce((s, r) => s + r.motivo_no_venta, 0),
    sin_info:        filtered.reduce((s, r) => s + r.sin_info, 0),
  }), [filtered]);

  const cobertura = totals.planeadas > 0
    ? ((totals.ejecutadas / totals.planeadas) * 100).toFixed(1)
    : "0.0";
  const efectividad = totals.ejecutadas > 0
    ? ((totals.con_venta / totals.ejecutadas) * 100).toFixed(1)
    : "0.0";

  return (
    <div className="space-y-4">
      {/* Summary chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "Cobertura",   value: `${cobertura}%`,        color: "text-violet-600", bg: "bg-violet-50 border-violet-100" },
          { label: "Efectividad", value: `${efectividad}%`,      color: "text-blue-600",   bg: "bg-blue-50 border-blue-100" },
          { label: "Con venta",   value: totals.con_venta,       color: "text-emerald-600",bg: "bg-emerald-50 border-emerald-100" },
          { label: "Sin info",    value: totals.sin_info,        color: "text-amber-600",  bg: "bg-amber-50 border-amber-100" },
        ].map((c) => (
          <div key={c.label} className={cn("rounded-xl border px-3 py-2 flex flex-col gap-0.5", c.bg)}>
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">{c.label}</span>
            <span className={cn("text-lg font-black tabular-nums", c.color)}>{c.value}</span>
          </div>
        ))}
      </div>

      {/* Days table */}
      <div className="rounded-xl border border-slate-100 overflow-hidden">
        <div className="bg-slate-50 px-3 py-2 flex items-center gap-1.5">
          <Calendar size={12} className="text-slate-400" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            Detalle por día ({filtered.length} días)
          </span>
        </div>
        <div className="overflow-x-auto max-h-64 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white border-b border-slate-100">
              <tr>
                {["Fecha", "Plan.", "Ejec.", "Venta", "Mot.", "Sin Info", "H.Vis", "H.Ven", "Prom.Min"].map((h) => (
                  <th key={h} className="px-3 py-2 text-[9px] font-black uppercase tracking-wider text-slate-400 text-right first:text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr
                  key={`${r.fecha}-${i}`}
                  className="border-t border-slate-50 hover:bg-violet-50/40 transition-colors"
                >
                  <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">
                    {r.fecha.slice(5).replace("-", "/")}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-500">{r.planeadas}</td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-700">{r.ejecutadas}</td>
                  <td className="px-3 py-2 text-right font-bold text-emerald-600">{r.con_venta}</td>
                  <td className="px-3 py-2 text-right text-amber-500">{r.motivo_no_venta}</td>
                  <td className="px-3 py-2 text-right text-rose-400">{r.sin_info}</td>
                  <td className="px-3 py-2 text-right text-slate-400">{r.hora_primera_visita ?? "—"}</td>
                  <td className="px-3 py-2 text-right text-slate-400">{r.hora_primera_venta ?? "—"}</td>
                  <td className="px-3 py-2 text-right text-slate-400">
                    {r.tiempo_promedio_venta_min != null ? `${r.tiempo_promedio_venta_min}m` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Comprobantes drill-down ───────────────────────────────────────────────────

function ComprobantesDrilldown({ row }: { row: ReporteriaClienteRow }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Importe total",  value: `$${row.importe_total.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`, color: "text-violet-600", bg: "bg-violet-50 border-violet-100" },
          { label: "Facturas",       value: row.cantidad_facturas, color: "text-blue-600",   bg: "bg-blue-50 border-blue-100" },
          { label: "Vendedor",       value: row.vendedor_nombre,   color: "text-slate-700",  bg: "bg-slate-50 border-slate-100" },
          { label: "Sucursal",       value: row.sucursal_nombre,   color: "text-slate-700",  bg: "bg-slate-50 border-slate-100" },
        ].map((c) => (
          <div key={c.label} className={cn("rounded-xl border px-3 py-2.5 flex flex-col gap-0.5", c.bg)}>
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{c.label}</span>
            <span className={cn("text-sm font-black truncate", c.color)}>{c.value}</span>
          </div>
        ))}
      </div>
      {row.ultimo_comprobante && (
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
          <Calendar size={11} className="shrink-0" />
          Último comprobante: <span className="font-semibold text-slate-700">{row.ultimo_comprobante}</span>
        </div>
      )}
    </div>
  );
}

// ── Bultos drill-down ─────────────────────────────────────────────────────────

function BultosDrilldown({ row }: { row: ReporteriaClienteRow }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Bultos totales",  value: row.cantidad_facturas, color: "text-violet-600", bg: "bg-violet-50 border-violet-100" },
          { label: "Prom. semanal",   value: `${row.importe_total.toFixed(1)} blts/sem`, color: "text-blue-600", bg: "bg-blue-50 border-blue-100" },
          { label: "Vendedor",        value: row.vendedor_nombre,  color: "text-slate-700",  bg: "bg-slate-50 border-slate-100" },
          { label: "Sucursal",        value: row.sucursal_nombre,  color: "text-slate-700",  bg: "bg-slate-50 border-slate-100" },
        ].map((c) => (
          <div key={c.label} className={cn("rounded-xl border px-3 py-2.5 flex flex-col gap-0.5", c.bg)}>
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{c.label}</span>
            <span className={cn("text-sm font-black truncate", c.color)}>{c.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Modal wrapper ─────────────────────────────────────────────────────────────

interface ReporteriaDrilldownModalProps {
  open: boolean;
  onClose: () => void;
  source: ReporteriaSource;
  row: ReporteriaClienteRow | null;
  sigoRows?: SigoVendorDia[];
}

export function ReporteriaDrilldownModal({
  open,
  onClose,
  source,
  row,
  sigoRows = [],
}: ReporteriaDrilldownModalProps) {
  if (!row) return null;

  const titleIcon =
    source === "sigo" ? <BarChart2 size={15} className="text-violet-500" /> :
    source === "comprobantes" ? <ShoppingBag size={15} className="text-blue-500" /> :
    <Target size={15} className="text-emerald-500" />;

  const sourceLabel =
    source === "sigo" ? "SIGO" :
    source === "comprobantes" ? "Comprobantes" : "Bultos";

  const headerBg =
    source === "sigo"         ? "bg-violet-50" :
    source === "comprobantes" ? "bg-blue-50"   :
                                "bg-emerald-50";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl sm:max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl sm:rounded-2xl">
        <DialogHeader className={cn("pb-3 border-b border-slate-100 -mx-6 px-6 -mt-2 pt-4 rounded-t-2xl", headerBg)}>
          <DialogTitle className="flex items-center gap-2 text-base font-black text-slate-800">
            {titleIcon}
            <span className="text-[var(--shelfy-primary)]">{sourceLabel}</span>
            <span className="text-slate-400 font-normal">·</span>
            <span className="truncate">{row.nombre_cliente}</span>
          </DialogTitle>
        </DialogHeader>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 35 }}
          className="pt-3"
        >
          {source === "sigo" ? (
            <SigoDrilldown vendedor={row.nombre_cliente} rows={sigoRows} />
          ) : source === "comprobantes" ? (
            <ComprobantesDrilldown row={row} />
          ) : (
            <BultosDrilldown row={row} />
          )}
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
