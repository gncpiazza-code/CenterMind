"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  BarChart, Bar, ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  User, Calendar, CheckCircle2, XCircle, AlertCircle,
  TrendingUp, Clock, Package,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ReporteriaSource, SigoVendorDia, ReporteriaClienteRow } from "@/lib/api";
import { cn } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function fmtARS(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}k`;
  return `$${Math.round(v)}`;
}

function fmtDate(s: string) {
  return s.slice(5).replace("-", "/");
}

// ── KPI chip ──────────────────────────────────────────────────────────────────

interface KpiChipProps {
  label: string;
  value: string | number;
  color: string;
  bg: string;
  icon?: React.ElementType;
}

function KpiChip({ label, value, color, bg, icon: Icon }: KpiChipProps) {
  return (
    <div className={cn("rounded-xl border px-3 py-2.5 flex flex-col gap-0.5", bg)}>
      <div className="flex items-center gap-1 mb-0.5">
        {Icon && <Icon size={10} className={color} />}
        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">{label}</span>
      </div>
      <span className={cn("text-xl font-black tabular-nums leading-none", color)}>{value}</span>
    </div>
  );
}

// ── SIGO vendor detail ────────────────────────────────────────────────────────

function SigoDetail({
  vendorName,
  rows,
  dateFrom,
  dateTo,
}: {
  vendorName: string;
  rows: SigoVendorDia[];
  dateFrom: string;
  dateTo: string;
}) {
  const totals = useMemo(() => {
    if (!rows.length) return null;
    const t = {
      planeadas: 0, ejecutadas: 0, con_venta: 0,
      sin_visita: 0, motivo_no_venta: 0, sin_info: 0,
    };
    for (const r of rows) {
      t.planeadas += r.planeadas;
      t.ejecutadas += r.ejecutadas;
      t.con_venta += r.con_venta;
      t.sin_visita += r.sin_visita;
      t.motivo_no_venta += r.motivo_no_venta;
      t.sin_info += r.sin_info;
    }
    return t;
  }, [rows]);

  if (!totals) {
    return (
      <div className="flex items-center justify-center h-40 text-[var(--shelfy-muted)] text-sm">
        Sin datos para este vendedor en el período
      </div>
    );
  }

  const cobertura = totals.planeadas > 0
    ? ((totals.ejecutadas / totals.planeadas) * 100).toFixed(1)
    : "0.0";
  const efectividad = totals.ejecutadas > 0
    ? ((totals.con_venta / totals.ejecutadas) * 100).toFixed(1)
    : "0.0";

  const chartData = rows.map((r) => ({
    fecha: fmtDate(r.fecha),
    ejecutadas: r.ejecutadas,
    con_venta: r.con_venta,
    motivo: r.motivo_no_venta,
    sin_info: r.sin_info,
    planeadas: r.planeadas,
  }));

  return (
    <div className="space-y-4">
      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <KpiChip label="Cobertura" value={`${cobertura}%`} color="text-violet-700" bg="bg-violet-50 border-violet-100" icon={TrendingUp} />
        <KpiChip label="Efectividad" value={`${efectividad}%`} color="text-blue-700" bg="bg-blue-50 border-blue-100" icon={CheckCircle2} />
        <KpiChip label="Con Venta" value={totals.con_venta} color="text-emerald-700" bg="bg-emerald-50 border-emerald-100" icon={CheckCircle2} />
        <KpiChip label="Sin Visita" value={totals.sin_visita} color="text-rose-700" bg="bg-rose-50 border-rose-100" icon={XCircle} />
        <KpiChip label="Mot. N/Venta" value={totals.motivo_no_venta} color="text-amber-700" bg="bg-amber-50 border-amber-100" icon={AlertCircle} />
        <KpiChip label="Sin Info" value={totals.sin_info} color="text-slate-600" bg="bg-slate-50 border-slate-100" icon={AlertCircle} />
      </div>

      {/* Bar/Line chart */}
      <div className="bg-white rounded-xl border border-[var(--shelfy-border)] p-4">
        <p className="text-[11px] font-black uppercase tracking-widest text-[var(--shelfy-muted)] mb-3">
          Visitas vs Ventas — diario ({dateFrom} → {dateTo})
        </p>
        <ResponsiveContainer width="100%" height={170}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
            <defs>
              <linearGradient id="execGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a855f7" stopOpacity={0.7} />
                <stop offset="100%" stopColor="#a855f7" stopOpacity={0.15} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
            <XAxis
              dataKey="fecha"
              tick={{ fontSize: 9, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 9, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              width={24}
            />
            <Tooltip
              contentStyle={{
                borderRadius: "10px",
                border: "1px solid rgba(0,0,0,0.08)",
                fontSize: 11,
                boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
              }}
              formatter={(val, name) => {
                const labels: Record<string, string> = {
                  ejecutadas: "Ejecutadas",
                  con_venta: "Con Venta",
                };
                return [val, labels[name as string] ?? name];
              }}
              labelFormatter={(l) => `Fecha: ${l}`}
            />
            <Bar dataKey="ejecutadas" fill="url(#execGrad)" radius={[3, 3, 0, 0]} animationDuration={900} />
            <Line
              type="monotone"
              dataKey="con_venta"
              stroke="#10b981"
              strokeWidth={2.5}
              dot={{ fill: "#10b981", r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5, strokeWidth: 0, fill: "#10b981" }}
              animationDuration={1100}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-4 mt-2">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-violet-300 shrink-0" />
            <span className="text-[9px] font-semibold text-[var(--shelfy-muted)]">Ejecutadas</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-emerald-400 shrink-0" />
            <span className="text-[9px] font-semibold text-[var(--shelfy-muted)]">Con Venta</span>
          </div>
        </div>
      </div>

      {/* Day-by-day table */}
      <div className="bg-white rounded-xl border border-[var(--shelfy-border)] overflow-hidden">
        <div className="bg-[var(--shelfy-bg)] px-4 py-2.5 flex items-center gap-2">
          <Calendar size={12} className="text-[var(--shelfy-muted)]" />
          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--shelfy-muted)]">
            Detalle por día ({rows.length} días)
          </span>
        </div>
        <ScrollArea className="max-h-[280px]">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white border-b border-[var(--shelfy-border)] z-10">
                <tr>
                  {["Fecha", "Plan.", "Ejec.", "Venta", "Mot.", "S.Info", "H.Vis", "H.Ven", "Prom.m"].map((h) => (
                    <th key={h} className="px-3 py-2 text-[9px] font-black uppercase tracking-wider text-[var(--shelfy-muted)] text-right first:text-left whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const efe = r.ejecutadas > 0 ? r.con_venta / r.ejecutadas : 0;
                  const rowBg =
                    r.ejecutadas === 0
                      ? "bg-slate-50/70"
                      : r.con_venta > 0 && efe >= 0.6
                      ? "bg-emerald-50/50"
                      : r.sin_info > 2
                      ? "bg-amber-50/40"
                      : "";
                  return (
                    <tr
                      key={`${r.fecha}-${i}`}
                      className={cn(
                        "border-t border-[var(--shelfy-border)]/50 hover:bg-[var(--shelfy-primary)]/5 transition-colors",
                        rowBg
                      )}
                    >
                      <td className="px-3 py-2 font-semibold text-[var(--shelfy-text)] whitespace-nowrap">
                        {fmtDate(r.fecha)}
                      </td>
                      <td className="px-3 py-2 text-right text-[var(--shelfy-muted)]">{r.planeadas}</td>
                      <td className="px-3 py-2 text-right font-semibold text-[var(--shelfy-text)]">{r.ejecutadas}</td>
                      <td className="px-3 py-2 text-right font-bold text-emerald-600">{r.con_venta}</td>
                      <td className="px-3 py-2 text-right text-amber-500">{r.motivo_no_venta}</td>
                      <td className="px-3 py-2 text-right text-rose-400">{r.sin_info}</td>
                      <td className="px-3 py-2 text-right text-[var(--shelfy-muted)]">{r.hora_primera_visita ?? "—"}</td>
                      <td className="px-3 py-2 text-right text-[var(--shelfy-muted)]">{r.hora_primera_venta ?? "—"}</td>
                      <td className="px-3 py-2 text-right text-[var(--shelfy-muted)]">
                        {r.tiempo_promedio_venta_min != null ? `${r.tiempo_promedio_venta_min}m` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

// ── Comprobantes vendor detail ─────────────────────────────────────────────────

function ComprobantesDetail({
  vendorName,
  rows,
}: {
  vendorName: string;
  rows: ReporteriaClienteRow[];
}) {
  const vRows = rows.filter((r) => r.vendedor_nombre === vendorName);

  const totals = useMemo(() => {
    const importe = vRows.reduce((s, r) => s + r.importe_total, 0);
    const facturas = vRows.reduce((s, r) => s + r.cantidad_facturas, 0);
    const ticket = facturas > 0 ? importe / facturas : 0;
    return { importe, facturas, clientes: vRows.length, ticket };
  }, [vRows]);

  const sorted = [...vRows].sort((a, b) => b.importe_total - a.importe_total);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KpiChip label="Importe total" value={fmtARS(totals.importe)} color="text-violet-700" bg="bg-violet-50 border-violet-100" icon={TrendingUp} />
        <KpiChip label="Clientes" value={totals.clientes} color="text-blue-700" bg="bg-blue-50 border-blue-100" icon={User} />
        <KpiChip label="Facturas" value={totals.facturas} color="text-emerald-700" bg="bg-emerald-50 border-emerald-100" icon={CheckCircle2} />
        <KpiChip label="Ticket prom." value={fmtARS(totals.ticket)} color="text-amber-700" bg="bg-amber-50 border-amber-100" icon={Package} />
      </div>

      <div className="bg-white rounded-xl border border-[var(--shelfy-border)] overflow-hidden">
        <div className="bg-[var(--shelfy-bg)] px-4 py-2.5 flex items-center gap-2">
          <User size={12} className="text-[var(--shelfy-muted)]" />
          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--shelfy-muted)]">
            Top clientes ({vRows.length})
          </span>
        </div>
        <ScrollArea className="max-h-[320px]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white border-b border-[var(--shelfy-border)] z-10">
              <tr>
                {["Cliente", "Facturas", "Importe", "Último"].map((h) => (
                  <th key={h} className="px-4 py-2 text-[9px] font-black uppercase tracking-wider text-[var(--shelfy-muted)] text-right first:text-left whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={`${r.nombre_cliente}-${i}`} className="border-t border-[var(--shelfy-border)]/50 hover:bg-[var(--shelfy-primary)]/4 transition-colors">
                  <td className="px-4 py-2.5 font-semibold text-[var(--shelfy-text)] max-w-[200px] truncate">{r.nombre_cliente}</td>
                  <td className="px-4 py-2.5 text-right text-[var(--shelfy-muted)]">{r.cantidad_facturas}</td>
                  <td className="px-4 py-2.5 text-right font-black text-[var(--shelfy-primary)]">{fmtARS(r.importe_total)}</td>
                  <td className="px-4 py-2.5 text-right text-[var(--shelfy-muted)]">{r.ultimo_comprobante ?? "—"}</td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-[var(--shelfy-muted)]">Sin clientes para este vendedor</td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollArea>
      </div>
    </div>
  );
}

// ── Bultos vendor detail ──────────────────────────────────────────────────────

function BultosDetail({
  vendorName,
  rows,
}: {
  vendorName: string;
  rows: ReporteriaClienteRow[];
}) {
  const vRows = rows.filter((r) => r.vendedor_nombre === vendorName);
  const totals = useMemo(() => {
    const bultos = vRows.reduce((s, r) => s + r.cantidad_facturas, 0);
    const promSem = vRows.reduce((s, r) => s + r.importe_total, 0) / Math.max(vRows.length, 1);
    return { bultos, pdvs: vRows.length, promSem };
  }, [vRows]);
  const sorted = [...vRows].sort((a, b) => b.cantidad_facturas - a.cantidad_facturas);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <KpiChip label="Total bultos" value={totals.bultos} color="text-emerald-700" bg="bg-emerald-50 border-emerald-100" icon={Package} />
        <KpiChip label="PDVs" value={totals.pdvs} color="text-blue-700" bg="bg-blue-50 border-blue-100" icon={User} />
        <KpiChip label="Prom/sem" value={`${totals.promSem.toFixed(1)}`} color="text-amber-700" bg="bg-amber-50 border-amber-100" icon={TrendingUp} />
      </div>
      <div className="bg-white rounded-xl border border-[var(--shelfy-border)] overflow-hidden">
        <div className="bg-[var(--shelfy-bg)] px-4 py-2.5 flex items-center gap-2">
          <Package size={12} className="text-[var(--shelfy-muted)]" />
          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--shelfy-muted)]">PDVs ({vRows.length})</span>
        </div>
        <ScrollArea className="max-h-[320px]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white border-b border-[var(--shelfy-border)] z-10">
              <tr>
                {["PDV / Cliente", "Bultos", "Prom/sem"].map((h) => (
                  <th key={h} className="px-4 py-2 text-[9px] font-black uppercase tracking-wider text-[var(--shelfy-muted)] text-right first:text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={`${r.nombre_cliente}-${i}`} className="border-t border-[var(--shelfy-border)]/50 hover:bg-[var(--shelfy-primary)]/4 transition-colors">
                  <td className="px-4 py-2.5 font-semibold text-[var(--shelfy-text)] max-w-[200px] truncate">{r.nombre_cliente}</td>
                  <td className="px-4 py-2.5 text-right font-black text-[var(--shelfy-primary)]">{r.cantidad_facturas}</td>
                  <td className="px-4 py-2.5 text-right text-[var(--shelfy-muted)]">{r.importe_total.toFixed(1)}</td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-[var(--shelfy-muted)]">Sin PDVs para este vendedor</td></tr>
              )}
            </tbody>
          </table>
        </ScrollArea>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface Props {
  vendorName: string;
  source: ReporteriaSource;
  sigoRows: SigoVendorDia[];
  clienteRows: ReporteriaClienteRow[];
  dateFrom: string;
  dateTo: string;
}

export function ReporteriaVendorDetail({
  vendorName,
  source,
  sigoRows,
  clienteRows,
  dateFrom,
  dateTo,
}: Props) {
  const filteredSigo = useMemo(
    () => sigoRows.filter((r) => r.vendedor === vendorName),
    [sigoRows, vendorName]
  );

  return (
    <motion.div
      key={vendorName}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      className="space-y-4"
    >
      {/* Vendor header card */}
      <div className="relative bg-white border border-[var(--shelfy-border)] rounded-2xl p-4 shadow-sm overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[var(--shelfy-primary)] via-[var(--shelfy-primary)]/40 to-transparent rounded-t-2xl" />
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center justify-center size-10 rounded-xl bg-[var(--shelfy-primary)] text-white font-black text-sm shrink-0">
            {initials(vendorName)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-black text-[var(--shelfy-text)] truncate">{vendorName}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] font-bold text-[var(--shelfy-muted)] uppercase tracking-wider">
                {source === "sigo" ? "SIGO" : source === "comprobantes" ? "Comprobantes" : "Bultos"}
              </span>
              <span className="text-[var(--shelfy-muted)] text-[10px]">·</span>
              <span className="flex items-center gap-1 text-[10px] text-[var(--shelfy-muted)]">
                <Calendar size={10} />
                {dateFrom} → {dateTo}
              </span>
              {source === "sigo" && filteredSigo.length > 0 && (
                <>
                  <span className="text-[var(--shelfy-muted)] text-[10px]">·</span>
                  <span className="flex items-center gap-1 text-[10px] text-[var(--shelfy-muted)]">
                    <Clock size={10} />
                    {filteredSigo.length} días
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Source-specific content */}
      {source === "sigo" && (
        <SigoDetail
          vendorName={vendorName}
          rows={filteredSigo}
          dateFrom={dateFrom}
          dateTo={dateTo}
        />
      )}
      {source === "comprobantes" && (
        <ComprobantesDetail vendorName={vendorName} rows={clienteRows} />
      )}
      {source === "bultos" && (
        <BultosDetail vendorName={vendorName} rows={clienteRows} />
      )}
    </motion.div>
  );
}
