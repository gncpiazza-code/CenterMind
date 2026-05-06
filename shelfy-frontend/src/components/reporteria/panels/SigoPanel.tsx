"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart2,
  Map,
  Users,
  TrendingUp,
  Search,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { ReporteriaExploreResponse } from "@/lib/api";
import { ReporteriaCharts } from "@/components/reporteria/ReporteriaCharts";
import { ReporteriaOrigen } from "@/components/reporteria/ReporteriaOrigen";
import { ReporteriaPivotTable } from "./ReporteriaPivotTable";
import { ReporteriaFilterBar } from "./ReporteriaFilterBar";

const PAGE_SIZE = 15;

type TabId = "resumen" | "cobertura" | "clientes" | "analisis";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "resumen", label: "Resumen", icon: BarChart2 },
  { id: "cobertura", label: "Cobertura", icon: Map },
  { id: "clientes", label: "Clientes", icon: Users },
  { id: "analisis", label: "Análisis", icon: TrendingUp },
];

function EmptyState({ msg = "Sin datos disponibles." }: { msg?: string }) {
  return (
    <div className="text-center py-10 text-sm text-[var(--shelfy-muted)]">
      {msg}
    </div>
  );
}

interface Props {
  data: ReporteriaExploreResponse;
}

export function SigoPanel({ data }: Props) {
  const [tab, setTab] = useState<TabId>("resumen");
  const [search, setSearch] = useState("");
  const [filterVendedor, setFilterVendedor] = useState("");
  const [filterResultado, setFilterResultado] = useState("");
  const [page, setPage] = useState(0);

  // ── Cobertura pivot ────────────────────────────────────────────────────────
  const { pivotRows, pivotCols, pivotGetValue } = useMemo(() => {
    const vm = data.vendor_matrix;
    const fallback = data.por_vendedor_y_dia ?? [];

    if (vm && Object.keys(vm).length > 0) {
      const allFechas = new Set<string>();
      for (const entry of Object.values(vm)) {
        for (const d of entry.dias) allFechas.add(d.fecha);
      }
      const sortedCols = Array.from(allFechas).sort();
      const rows = Object.keys(vm).sort();

      function getValue(vendedor: string, fecha: string): number | null {
        const dias = vm![vendedor]?.dias ?? [];
        const d = dias.find((x) => x.fecha === fecha);
        if (!d || d.planeadas === 0) return null;
        return Math.round((d.ejecutadas / d.planeadas) * 100);
      }

      const shortCols = sortedCols.map((f) => {
        const parts = f.split("-");
        return parts.length === 3 ? `${parts[2]}/${parts[1]}` : f;
      });

      return {
        pivotRows: rows,
        pivotCols: shortCols,
        pivotGetValue: (r: string, shortCol: string) => {
          const idx = shortCols.indexOf(shortCol);
          if (idx < 0) return null;
          return getValue(r, sortedCols[idx]);
        },
      };
    }

    // Fallback: por_vendedor_y_dia
    const allFechas = new Set<string>();
    for (const d of fallback) allFechas.add(d.fecha);
    const sortedCols = Array.from(allFechas).sort();
    const vendedores = Array.from(new Set(fallback.map((d) => d.vendedor))).sort();

    const shortCols = sortedCols.map((f) => {
      const parts = f.split("-");
      return parts.length === 3 ? `${parts[2]}/${parts[1]}` : f;
    });

    return {
      pivotRows: vendedores,
      pivotCols: shortCols,
      pivotGetValue: (vendedor: string, shortCol: string) => {
        const idx = shortCols.indexOf(shortCol);
        if (idx < 0) return null;
        const fecha = sortedCols[idx];
        const d = fallback.find(
          (x) => x.vendedor === vendedor && x.fecha === fecha
        );
        if (!d || d.planeadas === 0) return null;
        return Math.round((d.ejecutadas / d.planeadas) * 100);
      },
    };
  }, [data.vendor_matrix, data.por_vendedor_y_dia]);

  // ── Clientes tab ───────────────────────────────────────────────────────────
  const clientes = data.clientes_detalle ?? [];

  const vendedorOptions = useMemo(
    () => Array.from(new Set(clientes.map((c) => c.vendedor))).sort(),
    [clientes]
  );

  const filteredClientes = useMemo(() => {
    return clientes.filter((c) => {
      if (filterVendedor && c.vendedor !== filterVendedor) return false;
      if (filterResultado === "visitado" && !c.visitado) return false;
      if (filterResultado === "con_venta" && !c.con_venta) return false;
      if (filterResultado === "sin_venta" && c.con_venta) return false;
      if (search && !c.nombre.toLowerCase().includes(search.toLowerCase()))
        return false;
      return true;
    });
  }, [clientes, filterVendedor, filterResultado, search]);

  const totalClientes = filteredClientes.length;
  const totalPages = Math.ceil(totalClientes / PAGE_SIZE);
  const startIdx = page * PAGE_SIZE;
  const endIdx = startIdx + PAGE_SIZE;
  const pageClientes = filteredClientes.slice(startIdx, endIdx);

  const clearClientsFilters = () => {
    setFilterVendedor("");
    setFilterResultado("");
    setSearch("");
    setPage(0);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Tab bar */}
      <div className="flex gap-1 bg-white border border-[var(--shelfy-border)] rounded-xl p-1 w-fit overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 whitespace-nowrap",
              tab === id
                ? "text-[var(--shelfy-primary)]"
                : "text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"
            )}
          >
            {tab === id && (
              <motion.div
                layoutId="sigo-tab-bg"
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
        {tab === "resumen" && (
          <motion.div
            key="resumen"
            initial={{ opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            className="flex flex-col gap-4"
          >
            <ReporteriaCharts
              data={data}
              viewMode="resumen"
              onVendorClick={() => {}}
            />
            <ReporteriaOrigen data={data} />
          </motion.div>
        )}

        {tab === "cobertura" && (
          <motion.div
            key="cobertura"
            initial={{ opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            className="flex flex-col gap-3"
          >
            <div className="flex items-center gap-4 text-xs text-[var(--shelfy-muted)]">
              <span>
                <span className="font-bold text-[var(--shelfy-text)]">
                  {pivotRows.length}
                </span>{" "}
                vendedores
              </span>
              <span>
                <span className="font-bold text-[var(--shelfy-text)]">
                  {pivotCols.length}
                </span>{" "}
                fechas
              </span>
              <span className="opacity-60">Valores: % cobertura (ejecutadas / planeadas)</span>
            </div>
            <ReporteriaPivotTable
              rows={pivotRows}
              columns={pivotCols}
              getValue={pivotGetValue}
              formatCell={(v) => `${v}%`}
              rowLabel="Vendedor"
              emptySymbol="–"
            />
          </motion.div>
        )}

        {tab === "clientes" && (
          <motion.div
            key="clientes"
            initial={{ opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            className="flex flex-col gap-3"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search
                  size={12}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--shelfy-muted)]"
                />
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                  placeholder="Buscar cliente..."
                  className="h-7 text-xs pl-7 rounded-lg border-[var(--shelfy-border)] min-w-[180px]"
                />
              </div>
              <ReporteriaFilterBar
                filters={[
                  {
                    key: "vendedor",
                    label: "Vendedor",
                    options: vendedorOptions,
                    value: filterVendedor,
                    onChange: (v) => { setFilterVendedor(v); setPage(0); },
                  },
                  {
                    key: "resultado",
                    label: "Resultado",
                    options: ["visitado", "con_venta", "sin_venta"],
                    value: filterResultado,
                    onChange: (v) => { setFilterResultado(v); setPage(0); },
                    placeholder: "Todos",
                  },
                ]}
                onClear={clearClientsFilters}
              />
            </div>

            {pageClientes.length === 0 ? (
              <EmptyState msg="Sin clientes para los filtros seleccionados." />
            ) : (
              <>
                <div className="overflow-x-auto rounded-xl border border-[var(--shelfy-border)]">
                  <table className="w-full text-xs">
                    <thead className="bg-[var(--shelfy-bg)] border-b border-[var(--shelfy-border)]">
                      <tr>
                        <th className="px-3 py-2.5 text-left font-bold text-[var(--shelfy-muted)]">
                          Nombre
                        </th>
                        <th className="px-3 py-2.5 text-left font-bold text-[var(--shelfy-muted)]">
                          Vendedor
                        </th>
                        <th className="px-3 py-2.5 text-left font-bold text-[var(--shelfy-muted)]">
                          Hora visita
                        </th>
                        <th className="px-3 py-2.5 text-left font-bold text-[var(--shelfy-muted)]">
                          Hora venta
                        </th>
                        <th className="px-3 py-2.5 text-center font-bold text-[var(--shelfy-muted)]">
                          Visitado
                        </th>
                        <th className="px-3 py-2.5 text-center font-bold text-[var(--shelfy-muted)]">
                          Con venta
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageClientes.map((c, i) => (
                        <tr
                          key={`${c.id_cliente ?? c.nombre}-${i}`}
                          className={cn(
                            "border-b border-[var(--shelfy-border)]/50",
                            i % 2 === 0
                              ? "bg-white"
                              : "bg-[var(--shelfy-bg)]/30"
                          )}
                        >
                          <td
                            className="px-3 py-2 text-[var(--shelfy-text)] font-medium truncate max-w-[180px]"
                            title={c.nombre}
                          >
                            {c.nombre}
                          </td>
                          <td className="px-3 py-2 text-[var(--shelfy-muted)]">
                            {c.vendedor}
                          </td>
                          <td className="px-3 py-2 text-[var(--shelfy-muted)] tabular-nums">
                            {c.hora_visita ?? "–"}
                          </td>
                          <td className="px-3 py-2 text-[var(--shelfy-muted)] tabular-nums">
                            {c.hora_venta ?? "–"}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {c.visitado ? (
                              <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] px-1.5">
                                Sí
                              </Badge>
                            ) : (
                              <Badge className="bg-red-50 text-red-600 border-0 text-[10px] px-1.5">
                                No
                              </Badge>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {c.con_venta ? (
                              <Badge className="bg-blue-100 text-blue-700 border-0 text-[10px] px-1.5">
                                Sí
                              </Badge>
                            ) : (
                              <Badge className="bg-red-50 text-red-600 border-0 text-[10px] px-1.5">
                                No
                              </Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-[var(--shelfy-muted)]">
                      {startIdx + 1}–{Math.min(endIdx, totalClientes)} de{" "}
                      {totalClientes}
                    </span>
                    <div className="flex gap-1">
                      <button
                        disabled={page === 0}
                        onClick={() => setPage((p) => p - 1)}
                        className="px-2 py-1 text-xs rounded-lg border border-[var(--shelfy-border)] disabled:opacity-40"
                      >
                        ←
                      </button>
                      <button
                        disabled={page >= totalPages - 1}
                        onClick={() => setPage((p) => p + 1)}
                        className="px-2 py-1 text-xs rounded-lg border border-[var(--shelfy-border)] disabled:opacity-40"
                      >
                        →
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}

        {tab === "analisis" && (
          <motion.div
            key="analisis"
            initial={{ opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            className="flex flex-col gap-5"
          >
            {/* Hourly chart */}
            {(data.por_hora ?? []).length > 0 ? (
              <div>
                <p className="text-xs font-bold text-[var(--shelfy-muted)] mb-2">
                  Visitas y ventas por hora
                </p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.por_hora} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--shelfy-border)" />
                    <XAxis
                      dataKey="hora"
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        fontSize: 11,
                        borderRadius: 8,
                        border: "1px solid var(--shelfy-border)",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar
                      dataKey="visitas"
                      name="Visitas"
                      fill="var(--shelfy-primary)"
                      radius={[3, 3, 0, 0]}
                    />
                    <Bar
                      dataKey="ventas"
                      name="Ventas"
                      fill="#10B981"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState msg="Sin datos de visitas por hora." />
            )}

            {/* Sucursal breakdown */}
            {(data.por_sucursal ?? []).length > 0 && (
              <div>
                <p className="text-xs font-bold text-[var(--shelfy-muted)] mb-2">
                  Cobertura por sucursal
                </p>
                <div className="overflow-x-auto rounded-xl border border-[var(--shelfy-border)]">
                  <table className="w-full text-xs">
                    <thead className="bg-[var(--shelfy-bg)] border-b border-[var(--shelfy-border)]">
                      <tr>
                        <th className="px-3 py-2.5 text-left font-bold text-[var(--shelfy-muted)]">
                          Sucursal
                        </th>
                        <th className="px-3 py-2.5 text-right font-bold text-[var(--shelfy-muted)]">
                          Total
                        </th>
                        <th className="px-3 py-2.5 text-right font-bold text-[var(--shelfy-muted)]">
                          Visitados
                        </th>
                        <th className="px-3 py-2.5 text-right font-bold text-[var(--shelfy-muted)]">
                          Cobertura%
                        </th>
                        <th className="px-3 py-2.5 text-right font-bold text-[var(--shelfy-muted)]">
                          Efectividad%
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.por_sucursal ?? []).map((s, i) => (
                        <tr
                          key={s.sucursal}
                          className={cn(
                            "border-b border-[var(--shelfy-border)]/50",
                            i % 2 === 0 ? "bg-white" : "bg-[var(--shelfy-bg)]/30"
                          )}
                        >
                          <td className="px-3 py-2 text-[var(--shelfy-text)] font-medium">
                            {s.sucursal}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {s.total}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {s.visitados}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-700">
                            {s.cobertura.toFixed(1)}%
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-blue-700">
                            {s.efectividad.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Top vendedores ranking */}
            {data.top_vendedores.length > 0 && (
              <div>
                <p className="text-xs font-bold text-[var(--shelfy-muted)] mb-2">
                  Top 5 vendedores por cobertura
                </p>
                <div className="overflow-x-auto rounded-xl border border-[var(--shelfy-border)]">
                  <table className="w-full text-xs">
                    <thead className="bg-[var(--shelfy-bg)] border-b border-[var(--shelfy-border)]">
                      <tr>
                        <th className="px-3 py-2.5 text-left font-bold text-[var(--shelfy-muted)]">
                          #
                        </th>
                        <th className="px-3 py-2.5 text-left font-bold text-[var(--shelfy-muted)]">
                          Vendedor
                        </th>
                        <th className="px-3 py-2.5 text-right font-bold text-[var(--shelfy-muted)]">
                          Valor
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.top_vendedores.slice(0, 5).map((v, i) => (
                        <tr
                          key={v.nombre}
                          className={cn(
                            "border-b border-[var(--shelfy-border)]/50",
                            i % 2 === 0 ? "bg-white" : "bg-[var(--shelfy-bg)]/30"
                          )}
                        >
                          <td className="px-3 py-2 text-[var(--shelfy-muted)] font-bold">
                            {i + 1}
                          </td>
                          <td className="px-3 py-2 text-[var(--shelfy-text)] font-medium">
                            {v.nombre}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--shelfy-primary)]">
                            {v.valor.toLocaleString("es-AR")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
