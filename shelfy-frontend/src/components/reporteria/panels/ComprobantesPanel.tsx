"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart2,
  Building2,
  GitBranch,
  Users,
  UserCheck,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import type {
  ReporteriaExploreResponse,
  CanalRow,
} from "@/lib/api";
import { ReporteriaCharts } from "@/components/reporteria/ReporteriaCharts";
import { ReporteriaOrigen } from "@/components/reporteria/ReporteriaOrigen";
import { ReporteriaFilterBar } from "./ReporteriaFilterBar";

const PAGE_SIZE = 15;

const fmt = (n: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);

type TabId = "resumen" | "sucursales" | "canales" | "clientes" | "vendedores";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "resumen", label: "Resumen", icon: BarChart2 },
  { id: "sucursales", label: "Sucursales", icon: Building2 },
  { id: "canales", label: "Canales", icon: GitBranch },
  { id: "clientes", label: "Clientes", icon: Users },
  { id: "vendedores", label: "Vendedores", icon: UserCheck },
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

export function ComprobantesPanel({ data }: Props) {
  const [tab, setTab] = useState<TabId>("resumen");

  // Canales sort
  const [sortField, setSortField] = useState<keyof CanalRow>("importe");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Clientes filters
  const [searchCliente, setSearchCliente] = useState("");
  const [filterSucursalCliente, setFilterSucursalCliente] = useState("");
  const [filterVendedorCliente, setFilterVendedorCliente] = useState("");
  const [pageCliente, setPageCliente] = useState(0);

  const sucursalesComp = data.por_sucursal_comp ?? [];
  const canales = data.por_canal ?? [];
  const clientesFull = data.clientes_full ?? [];
  const vendedoresFull = data.por_vendedor_full ?? [];

  // ── Canales sorted ─────────────────────────────────────────────────────────
  const sortedCanales = useMemo(() => {
    return [...canales].sort((a, b) => {
      const va = a[sortField] as number;
      const vb = b[sortField] as number;
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [canales, sortField, sortDir]);

  function handleCanalSort(field: keyof CanalRow) {
    if (field === sortField) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  const sortIcon = (field: keyof CanalRow) =>
    sortField === field ? (sortDir === "desc" ? " ↓" : " ↑") : "";

  // ── Clientes filtered ──────────────────────────────────────────────────────
  const sucursalOptionsCliente = useMemo(
    () => Array.from(new Set(clientesFull.map((c) => c.sucursal))).sort(),
    [clientesFull]
  );
  const vendedorOptionsCliente = useMemo(
    () => Array.from(new Set(clientesFull.map((c) => c.vendedor))).sort(),
    [clientesFull]
  );

  const filteredClientes = useMemo(() => {
    return clientesFull.filter((c) => {
      if (filterSucursalCliente && c.sucursal !== filterSucursalCliente)
        return false;
      if (filterVendedorCliente && c.vendedor !== filterVendedorCliente)
        return false;
      if (
        searchCliente &&
        !c.nombre_cliente.toLowerCase().includes(searchCliente.toLowerCase())
      )
        return false;
      return true;
    });
  }, [clientesFull, filterSucursalCliente, filterVendedorCliente, searchCliente]);

  const totalClientes = filteredClientes.length;
  const totalPagesClientes = Math.ceil(totalClientes / PAGE_SIZE);
  const startIdxCliente = pageCliente * PAGE_SIZE;
  const endIdxCliente = startIdxCliente + PAGE_SIZE;
  const pageClienteRows = filteredClientes.slice(startIdxCliente, endIdxCliente);

  const clearClienteFilters = () => {
    setSearchCliente("");
    setFilterSucursalCliente("");
    setFilterVendedorCliente("");
    setPageCliente(0);
  };

  // ── Vendedores sorted ──────────────────────────────────────────────────────
  const sortedVendedores = useMemo(() => {
    return [...vendedoresFull].sort((a, b) => b.importe - a.importe);
  }, [vendedoresFull]);

  // ── Weekly series chart data ───────────────────────────────────────────────
  const semanaSerie = data.semana_serie ?? [];
  const semanaChartData = semanaSerie.map((s) => ({
    semana: s.semana.length > 10 ? s.semana.slice(0, 10) : s.semana,
    importe: s.importe,
  }));

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
                layoutId="comp-tab-bg"
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
            {semanaChartData.length > 0 && (
              <div>
                <p className="text-xs font-bold text-[var(--shelfy-muted)] mb-2">
                  Evolución semanal
                </p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={semanaChartData} barSize={24}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--shelfy-border)"
                    />
                    <XAxis
                      dataKey="semana"
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      formatter={(v: number | undefined) => [typeof v === "number" ? fmt(v) : "–", "Importe"]}
                      contentStyle={{
                        fontSize: 11,
                        borderRadius: 8,
                        border: "1px solid var(--shelfy-border)",
                      }}
                    />
                    <Bar
                      dataKey="importe"
                      fill="var(--shelfy-primary)"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <ReporteriaOrigen data={data} />
          </motion.div>
        )}

        {tab === "sucursales" && (
          <motion.div
            key="sucursales"
            initial={{ opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
          >
            {sucursalesComp.length === 0 ? (
              <EmptyState msg="Sin datos de sucursales." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sucursalesComp.map((s) => {
                  const ccPct =
                    s.importe > 0
                      ? Math.round((s.cc / s.importe) * 100)
                      : 0;
                  const contadoPct =
                    s.importe > 0
                      ? Math.round((s.contado / s.importe) * 100)
                      : 0;
                  return (
                    <div
                      key={s.sucursal}
                      className="bg-white border border-[var(--shelfy-border)] rounded-xl p-4 flex flex-col gap-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-bold text-[var(--shelfy-text)] leading-tight">
                          {s.sucursal}
                        </p>
                        <Badge className="bg-[var(--shelfy-bg)] text-[var(--shelfy-muted)] border border-[var(--shelfy-border)] text-[10px] shrink-0">
                          {s.n_ops} ops
                        </Badge>
                      </div>
                      <p className="text-lg font-bold text-[var(--shelfy-primary)] tabular-nums">
                        {fmt(s.importe)}
                      </p>
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-[var(--shelfy-muted)]">
                            Cta. Cte.
                          </span>
                          <span className="font-semibold tabular-nums">
                            {ccPct}%
                          </span>
                        </div>
                        <Progress value={ccPct} className="h-1.5" />
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-[var(--shelfy-muted)]">
                            Contado
                          </span>
                          <span className="font-semibold tabular-nums">
                            {contadoPct}%
                          </span>
                        </div>
                        <div className="flex gap-2 text-[11px] mt-1">
                          <span className="text-[var(--shelfy-muted)]">
                            Recibo:{" "}
                            <span className="font-semibold text-[var(--shelfy-text)]">
                              {fmt(s.recibo)}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {tab === "canales" && (
          <motion.div
            key="canales"
            initial={{ opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
          >
            {sortedCanales.length === 0 ? (
              <EmptyState msg="Sin datos de canales." />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[var(--shelfy-border)]">
                <table className="w-full text-xs">
                  <thead className="bg-[var(--shelfy-bg)] border-b border-[var(--shelfy-border)]">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-bold text-[var(--shelfy-muted)]">
                        Canal
                      </th>
                      <th className="px-3 py-2.5 text-left font-bold text-[var(--shelfy-muted)]">
                        Subcanal
                      </th>
                      {(
                        [
                          ["importe", "Importe"],
                          ["contado", "Contado"],
                          ["cc", "Cta. Cte."],
                          ["n_ops", "Operaciones"],
                        ] as [keyof CanalRow, string][]
                      ).map(([field, label]) => (
                        <th
                          key={field}
                          className="px-3 py-2.5 text-right font-bold text-[var(--shelfy-muted)] cursor-pointer hover:text-[var(--shelfy-text)] select-none"
                          onClick={() => handleCanalSort(field)}
                        >
                          {label}
                          {sortIcon(field)}
                        </th>
                      ))}
                      <th className="px-3 py-2.5 text-right font-bold text-[var(--shelfy-muted)]">
                        Ticket Prom.
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCanales.map((c, i) => (
                      <tr
                        key={`${c.canal}-${c.subcanal}`}
                        className={cn(
                          "border-b border-[var(--shelfy-border)]/50",
                          i % 2 === 0 ? "bg-white" : "bg-[var(--shelfy-bg)]/30"
                        )}
                      >
                        <td className="px-3 py-2 text-[var(--shelfy-text)] font-medium">
                          {c.canal}
                        </td>
                        <td className="px-3 py-2 text-[var(--shelfy-muted)]">
                          {c.subcanal}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--shelfy-primary)]">
                          {fmt(c.importe)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmt(c.contado)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmt(c.cc)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {c.n_ops.toLocaleString("es-AR")}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-[var(--shelfy-muted)]">
                          {c.n_ops > 0 ? fmt(c.importe / c.n_ops) : "–"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
              <Input
                value={searchCliente}
                onChange={(e) => {
                  setSearchCliente(e.target.value);
                  setPageCliente(0);
                }}
                placeholder="Buscar cliente..."
                className="h-7 text-xs rounded-lg border-[var(--shelfy-border)] min-w-[180px]"
              />
              <ReporteriaFilterBar
                filters={[
                  {
                    key: "sucursal",
                    label: "Sucursal",
                    options: sucursalOptionsCliente,
                    value: filterSucursalCliente,
                    onChange: (v) => {
                      setFilterSucursalCliente(v);
                      setPageCliente(0);
                    },
                  },
                  {
                    key: "vendedor",
                    label: "Vendedor",
                    options: vendedorOptionsCliente,
                    value: filterVendedorCliente,
                    onChange: (v) => {
                      setFilterVendedorCliente(v);
                      setPageCliente(0);
                    },
                  },
                ]}
                onClear={clearClienteFilters}
              />
            </div>

            {pageClienteRows.length === 0 ? (
              <EmptyState msg="Sin clientes para los filtros seleccionados." />
            ) : (
              <>
                <div className="overflow-x-auto rounded-xl border border-[var(--shelfy-border)]">
                  <table className="w-full text-xs">
                    <thead className="bg-[var(--shelfy-bg)] border-b border-[var(--shelfy-border)]">
                      <tr>
                        <th className="px-3 py-2.5 text-left font-bold text-[var(--shelfy-muted)]">
                          Cliente
                        </th>
                        <th className="px-3 py-2.5 text-left font-bold text-[var(--shelfy-muted)]">
                          Vendedor
                        </th>
                        <th className="px-3 py-2.5 text-left font-bold text-[var(--shelfy-muted)]">
                          Sucursal
                        </th>
                        <th className="px-3 py-2.5 text-left font-bold text-[var(--shelfy-muted)]">
                          Canal
                        </th>
                        <th className="px-3 py-2.5 text-right font-bold text-[var(--shelfy-muted)]">
                          Importe
                        </th>
                        <th className="px-3 py-2.5 text-right font-bold text-[var(--shelfy-muted)]">
                          CC%
                        </th>
                        <th className="px-3 py-2.5 text-right font-bold text-[var(--shelfy-muted)]">
                          Ops
                        </th>
                        <th className="px-3 py-2.5 text-right font-bold text-[var(--shelfy-muted)]">
                          Último
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageClienteRows.map((c, i) => {
                        const ccPct =
                          c.importe > 0
                            ? Math.round((c.cc / c.importe) * 100)
                            : 0;
                        return (
                          <tr
                            key={`${c.nombre_cliente}-${i}`}
                            className={cn(
                              "border-b border-[var(--shelfy-border)]/50",
                              i % 2 === 0
                                ? "bg-white"
                                : "bg-[var(--shelfy-bg)]/30"
                            )}
                          >
                            <td
                              className="px-3 py-2 text-[var(--shelfy-text)] font-medium truncate max-w-[160px]"
                              title={c.nombre_cliente}
                            >
                              {c.nombre_cliente}
                            </td>
                            <td className="px-3 py-2 text-[var(--shelfy-muted)] truncate max-w-[120px]">
                              {c.vendedor}
                            </td>
                            <td className="px-3 py-2 text-[var(--shelfy-muted)]">
                              {c.sucursal}
                            </td>
                            <td className="px-3 py-2 text-[var(--shelfy-muted)]">
                              {c.canal}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--shelfy-primary)]">
                              {fmt(c.importe)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Progress
                                  value={ccPct}
                                  className="h-1.5 w-14"
                                />
                                <span className="tabular-nums text-[10px] text-[var(--shelfy-muted)] w-8 text-right">
                                  {ccPct}%
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {c.n_ops}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-[var(--shelfy-muted)]">
                              {c.ultimo_comprobante ?? "–"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {totalPagesClientes > 1 && (
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-[var(--shelfy-muted)]">
                      {startIdxCliente + 1}–
                      {Math.min(endIdxCliente, totalClientes)} de{" "}
                      {totalClientes}
                    </span>
                    <div className="flex gap-1">
                      <button
                        disabled={pageCliente === 0}
                        onClick={() => setPageCliente((p) => p - 1)}
                        className="px-2 py-1 text-xs rounded-lg border border-[var(--shelfy-border)] disabled:opacity-40"
                      >
                        ←
                      </button>
                      <button
                        disabled={pageCliente >= totalPagesClientes - 1}
                        onClick={() => setPageCliente((p) => p + 1)}
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

        {tab === "vendedores" && (
          <motion.div
            key="vendedores"
            initial={{ opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
          >
            {sortedVendedores.length === 0 ? (
              <EmptyState msg="Sin datos de vendedores." />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[var(--shelfy-border)]">
                <table className="w-full text-xs">
                  <thead className="bg-[var(--shelfy-bg)] border-b border-[var(--shelfy-border)]">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-bold text-[var(--shelfy-muted)]">
                        Vendedor
                      </th>
                      <th className="px-3 py-2.5 text-left font-bold text-[var(--shelfy-muted)]">
                        Sucursal
                      </th>
                      <th className="px-3 py-2.5 text-right font-bold text-[var(--shelfy-muted)]">
                        Importe
                      </th>
                      <th className="px-3 py-2.5 text-right font-bold text-[var(--shelfy-muted)]">
                        CC vs Contado
                      </th>
                      <th className="px-3 py-2.5 text-right font-bold text-[var(--shelfy-muted)]">
                        Recibo
                      </th>
                      <th className="px-3 py-2.5 text-right font-bold text-[var(--shelfy-muted)]">
                        Clientes
                      </th>
                      <th className="px-3 py-2.5 text-right font-bold text-[var(--shelfy-muted)]">
                        Ops
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedVendedores.map((v, i) => {
                      const ccPct =
                        v.importe > 0
                          ? Math.round((v.cc / v.importe) * 100)
                          : 0;
                      return (
                        <tr
                          key={v.vendedor}
                          className={cn(
                            "border-b border-[var(--shelfy-border)]/50",
                            i % 2 === 0
                              ? "bg-white"
                              : "bg-[var(--shelfy-bg)]/30"
                          )}
                        >
                          <td className="px-3 py-2 text-[var(--shelfy-text)] font-medium truncate max-w-[160px]">
                            {v.vendedor}
                          </td>
                          <td className="px-3 py-2 text-[var(--shelfy-muted)]">
                            {v.sucursal}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-bold text-[var(--shelfy-primary)]">
                            {fmt(v.importe)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Progress
                                value={ccPct}
                                className="h-1.5 w-16 [&>div]:bg-blue-500"
                              />
                              <span className="tabular-nums text-[10px] text-blue-600 font-semibold w-8 text-right">
                                {ccPct}%
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-[var(--shelfy-muted)]">
                            {fmt(v.recibo)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {v.n_clientes}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {v.n_ops}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
