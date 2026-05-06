"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Package, Users, BarChart as BarChartIcon, Calendar } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { ReporteriaExploreResponse } from "@/lib/api";
import { ReporteriaCharts } from "@/components/reporteria/ReporteriaCharts";
import { ReporteriaOrigen } from "@/components/reporteria/ReporteriaOrigen";
import { ReporteriaPivotTable } from "./ReporteriaPivotTable";
import { ReporteriaFilterBar } from "./ReporteriaFilterBar";

type Tab = "resumen" | "pdvs" | "semanas" | "articulos";

const TABS = [
  { id: "resumen",   label: "Resumen",   icon: Package },
  { id: "pdvs",      label: "PDVs",      icon: Users },
  { id: "semanas",   label: "Semanas",   icon: Calendar },
  { id: "articulos", label: "Artículos", icon: BarChartIcon },
] as const;

const PAGE_SIZE = 15;

function EmptyState({ msg = "Sin datos disponibles." }: { msg?: string }) {
  return <div className="text-center py-10 text-sm text-[var(--shelfy-muted)]">{msg}</div>;
}

interface Props {
  data: ReporteriaExploreResponse;
}

export function BultosPanel({ data }: Props) {
  const [tab, setTab]               = useState<Tab>("resumen");
  const [filterVendedor, setFilterVendedor] = useState("");
  const [page, setPage]             = useState(0);

  // Vendedor options
  const vendedorOptions = useMemo(() => {
    const set = new Set<string>();
    (data.por_vendedor_bultos ?? []).forEach(r => r.vendedor && set.add(r.vendedor));
    (data.top_clientes ?? []).forEach(r => r.vendedor_nombre && set.add(r.vendedor_nombre));
    return Array.from(set).sort();
  }, [data]);

  // ── Tab: PDVs ────────────────────────────────────────────────────────────────
  const pdvsFiltered = useMemo(() => {
    const rows = data.top_clientes ?? [];
    return filterVendedor
      ? rows.filter(r => r.vendedor_nombre === filterVendedor)
      : rows;
  }, [data.top_clientes, filterVendedor]);

  const pdvPages = Math.ceil(pdvsFiltered.length / PAGE_SIZE);
  const pdvSlice = pdvsFiltered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // ── Tab: Semanas (pivot) ─────────────────────────────────────────────────────
  const { pivotRows, pivotCols } = useMemo(() => {
    const pivot = data.clientes_semana_pivot ?? [];
    const filtered = filterVendedor
      ? pivot.filter(r => r.vendedor === filterVendedor)
      : pivot;
    const top50 = filtered.slice(0, 50);
    const colSet = new Set<string>();
    top50.forEach(r => Object.keys(r.semanas ?? {}).forEach(s => colSet.add(s)));
    return {
      pivotRows: top50.map(r => r.cliente),
      pivotCols: Array.from(colSet).sort(),
      pivotData: top50,
    };
  }, [data.clientes_semana_pivot, filterVendedor]);

  // Build semana pivot lookup
  const pivotLookup = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    (data.clientes_semana_pivot ?? []).forEach(r => {
      const inner = new Map<string, number>();
      Object.entries(r.semanas ?? {}).forEach(([sem, val]) => inner.set(sem, val));
      m.set(r.cliente, inner);
    });
    return m;
  }, [data.clientes_semana_pivot]);

  const getValue = (row: string, col: string) => pivotLookup.get(row)?.get(col) ?? null;

  // ── Tab: Artículos ───────────────────────────────────────────────────────────
  const articulosRows = useMemo(() => {
    if (data.articulos_por_vendedor && data.articulos_por_vendedor.length > 0) {
      const rows = filterVendedor
        ? data.articulos_por_vendedor.filter(r => r.vendedor === filterVendedor)
        : data.articulos_por_vendedor;
      return rows.slice(0, 100);
    }
    return (data.top_vendedores ?? []).map(r => ({
      vendedor: "",
      articulo: r.nombre,
      bultos: r.valor,
      prom_sem: 0,
    }));
  }, [data.articulos_por_vendedor, data.top_vendedores, filterVendedor]);

  // ── Serie semanal para resumen ────────────────────────────────────────────────
  const serieSemanal = useMemo(() => {
    return (data.semana_serie_bultos ?? []).map(r => ({
      semana: r.semana.replace(/^\d{4}-/, ""), // "W14"
      bultos: r.bultos,
    }));
  }, [data.semana_serie_bultos]);

  // Tab change resets page
  function handleTabChange(t: Tab) {
    setTab(t);
    setPage(0);
  }

  const filters = [
    {
      key: "vendedor",
      label: "Vendedor",
      options: vendedorOptions,
      value: filterVendedor,
      onChange: (v: string) => { setFilterVendedor(v); setPage(0); },
    },
  ];

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 bg-white border border-[var(--shelfy-border)] rounded-xl p-1 w-fit overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => handleTabChange(id)}
            className={cn(
              "relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 whitespace-nowrap",
              tab === id
                ? "text-[var(--shelfy-primary)]"
                : "text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"
            )}
          >
            {tab === id && (
              <motion.div
                layoutId="bultos-tab"
                className="absolute inset-0 bg-[var(--shelfy-primary)]/10 rounded-lg"
                transition={{ type: "spring", stiffness: 400, damping: 35 }}
              />
            )}
            <Icon size={12} className="relative z-10 shrink-0" />
            <span className="relative z-10">{label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, x: 6 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -6 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="space-y-4"
        >
          {/* ── Resumen ─────────────────────────────────────────────────────── */}
          {tab === "resumen" && (
            <>
              {serieSemanal.length > 0 ? (
                <div className="bg-white rounded-2xl border border-[var(--shelfy-border)] p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-[var(--shelfy-muted)] uppercase tracking-wider">
                      Bultos por semana
                    </p>
                    <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                      Umbral: 2.5/PDV/sem
                    </span>
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={serieSemanal} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="semana" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={40} />
                      <Tooltip
                        contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb" }}
                        formatter={(v: number | undefined) => [typeof v === "number" ? v.toLocaleString("es-AR") : "–", "Bultos"]}
                      />
                      <Bar dataKey="bultos" fill="#10B981" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <ReporteriaCharts data={data} viewMode="resumen" onVendorClick={() => {}} />
              )}
              <ReporteriaOrigen data={data} />
            </>
          )}

          {/* ── PDVs ────────────────────────────────────────────────────────── */}
          {tab === "pdvs" && (
            <>
              <ReporteriaFilterBar
                filters={filters}
                onClear={() => { setFilterVendedor(""); setPage(0); }}
              />
              {pdvSlice.length === 0 ? (
                <EmptyState msg="Sin PDVs para mostrar." />
              ) : (
                <>
                  <div className="overflow-x-auto rounded-xl border border-[var(--shelfy-border)]">
                    <table className="w-full text-xs">
                      <thead className="bg-[var(--shelfy-bg)] border-b border-[var(--shelfy-border)]">
                        <tr>
                          <th className="px-3 py-2.5 text-left font-bold text-[var(--shelfy-muted)]">PDV</th>
                          <th className="px-3 py-2.5 text-left font-bold text-[var(--shelfy-muted)]">Vendedor</th>
                          <th className="px-3 py-2.5 text-right font-bold text-[var(--shelfy-muted)]">Prom/sem</th>
                          <th className="px-3 py-2.5 text-right font-bold text-[var(--shelfy-muted)]">Total bultos</th>
                          <th className="px-3 py-2.5 text-center font-bold text-[var(--shelfy-muted)]">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pdvSlice.map((r, i) => {
                          const promSem = r.importe_total; // mapped to prom_sem in bultos parser
                          const sobreUmbral = promSem > 2.5;
                          return (
                            <tr
                              key={i}
                              className={cn(
                                "border-b border-[var(--shelfy-border)]/50",
                                i % 2 === 0 ? "bg-white" : "bg-[var(--shelfy-bg)]/30"
                              )}
                            >
                              <td className="px-3 py-2 text-[var(--shelfy-text)] font-medium max-w-[200px] truncate" title={r.nombre_cliente}>
                                {r.nombre_cliente}
                              </td>
                              <td className="px-3 py-2 text-[var(--shelfy-muted)]">{r.vendedor_nombre}</td>
                              <td className="px-3 py-2 text-right tabular-nums font-bold text-[var(--shelfy-text)]">
                                {promSem.toFixed(1)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-[var(--shelfy-muted)]">
                                {r.cantidad_facturas.toLocaleString("es-AR")}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {sobreUmbral ? (
                                  <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] font-bold">
                                    ✓ Sobre umbral
                                  </Badge>
                                ) : (
                                  <span className="text-[10px] text-[var(--shelfy-muted)]">Bajo umbral</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {pdvPages > 1 && (
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-[var(--shelfy-muted)]">
                        {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, pdvsFiltered.length)} de {pdvsFiltered.length}
                      </span>
                      <div className="flex gap-1">
                        <button
                          disabled={page === 0}
                          onClick={() => setPage(p => p - 1)}
                          className="px-2 py-1 text-xs rounded-lg border border-[var(--shelfy-border)] disabled:opacity-40"
                        >←</button>
                        <button
                          disabled={page >= pdvPages - 1}
                          onClick={() => setPage(p => p + 1)}
                          className="px-2 py-1 text-xs rounded-lg border border-[var(--shelfy-border)] disabled:opacity-40"
                        >→</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ── Semanas (heat-map pivot) ─────────────────────────────────────── */}
          {tab === "semanas" && (
            <>
              <ReporteriaFilterBar
                filters={filters}
                onClear={() => setFilterVendedor("")}
              />
              {pivotRows.length === 0 || pivotCols.length === 0 ? (
                <EmptyState msg="Sin datos de semanas disponibles. Asegurate de que el archivo incluya fechas." />
              ) : (
                <>
                  <p className="text-xs text-[var(--shelfy-muted)]">
                    Mostrando {pivotRows.length} PDVs × {pivotCols.length} semanas · valores en bultos/semana
                  </p>
                  <ReporteriaPivotTable
                    rows={pivotRows}
                    columns={pivotCols.map(s => s.replace(/^\d{4}-/, ""))}
                    getValue={(row, col) => {
                      const fullCol = pivotCols.find(c => c.replace(/^\d{4}-/, "") === col) ?? col;
                      return getValue(row, fullCol);
                    }}
                    formatCell={v => v.toFixed(1)}
                    rowLabel="PDV / Cliente"
                  />
                </>
              )}
            </>
          )}

          {/* ── Artículos ────────────────────────────────────────────────────── */}
          {tab === "articulos" && (
            <>
              {data.articulos_por_vendedor && data.articulos_por_vendedor.length > 0 && (
                <ReporteriaFilterBar
                  filters={filters}
                  onClear={() => setFilterVendedor("")}
                />
              )}
              {articulosRows.length === 0 ? (
                <EmptyState msg="Sin datos de artículos." />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-[var(--shelfy-border)]">
                  <table className="w-full text-xs">
                    <thead className="bg-[var(--shelfy-bg)] border-b border-[var(--shelfy-border)]">
                      <tr>
                        {data.articulos_por_vendedor && !filterVendedor && (
                          <th className="px-3 py-2.5 text-left font-bold text-[var(--shelfy-muted)]">Vendedor</th>
                        )}
                        <th className="px-3 py-2.5 text-left font-bold text-[var(--shelfy-muted)]">Artículo</th>
                        <th className="px-3 py-2.5 text-right font-bold text-[var(--shelfy-muted)]">Bultos</th>
                        {data.articulos_por_vendedor && (
                          <th className="px-3 py-2.5 text-right font-bold text-[var(--shelfy-muted)]">Prom/sem</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {articulosRows.map((r, i) => (
                        <tr
                          key={i}
                          className={cn(
                            "border-b border-[var(--shelfy-border)]/50",
                            i % 2 === 0 ? "bg-white" : "bg-[var(--shelfy-bg)]/30"
                          )}
                        >
                          {data.articulos_por_vendedor && !filterVendedor && (
                            <td className="px-3 py-2 text-[var(--shelfy-muted)]">{r.vendedor}</td>
                          )}
                          <td className="px-3 py-2 text-[var(--shelfy-text)] font-medium max-w-[220px] truncate" title={r.articulo}>
                            {r.articulo}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-bold text-[var(--shelfy-text)]">
                            {r.bultos.toLocaleString("es-AR")}
                          </td>
                          {data.articulos_por_vendedor && (
                            <td className="px-3 py-2 text-right tabular-nums text-[var(--shelfy-muted)]">
                              {r.prom_sem.toFixed(1)}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
