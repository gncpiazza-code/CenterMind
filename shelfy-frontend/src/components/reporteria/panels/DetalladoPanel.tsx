"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart2,
  Package,
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
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ReporteriaExploreResponse,
  ArticuloRow,
  VendedorArticuloRow,
  ClienteArticuloRow,
} from "@/lib/api";
import { ReporteriaOrigen } from "@/components/reporteria/ReporteriaOrigen";

const PAGE_SIZE = 15;

const fmt = (n: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);

type TabId = "resumen" | "articulos" | "clientes" | "vendedores";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "resumen", label: "Resumen", icon: BarChart2 },
  { id: "articulos", label: "Artículos", icon: Package },
  { id: "clientes", label: "Clientes", icon: Users },
  { id: "vendedores", label: "Vendedores", icon: UserCheck },
];

const CHART_COLORS = [
  "var(--shelfy-primary)",
  "#10B981",
  "#F59E0B",
  "#3B82F6",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#F97316",
  "#6366F1",
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

export function DetalladoPanel({ data }: Props) {
  const [tab, setTab] = useState<TabId>("resumen");
  const [selectedArticulo, setSelectedArticulo] = useState("");

  // Artículos tab state
  const [searchArt, setSearchArt] = useState("");
  const [sortFieldArt, setSortFieldArt] = useState<keyof ArticuloRow>("importe");
  const [sortDirArt, setSortDirArt] = useState<"asc" | "desc">("desc");
  const [pageArt, setPageArt] = useState(0);

  // Clientes tab state
  const [pageCliente, setPageCliente] = useState(0);

  // Vendedores tab state
  const [sortFieldVend, setSortFieldVend] = useState<keyof VendedorArticuloRow>("importe");
  const [sortDirVend, setSortDirVend] = useState<"asc" | "desc">("desc");
  const [pageVend, setPageVend] = useState(0);

  const articulos = data.por_articulo ?? [];
  const clientesXArticulo = data.clientes_x_articulo ?? [];
  const vendedoresArticulo = data.por_vendedor_articulo ?? [];

  // ── KPIs from data.kpis ────────────────────────────────────────────────────
  const kpiNArt = data.kpis.find((k) => k.label.toLowerCase().includes("art"))?.value ?? articulos.length;
  const kpiNClientes = data.kpis.find((k) => k.label.toLowerCase().includes("cliente"))?.value ?? 0;
  const kpiTicket = data.kpis.find((k) => k.label.toLowerCase().includes("ticket") || k.label.toLowerCase().includes("prom"))?.value ?? 0;

  // ── Top 10 artículos for chart ─────────────────────────────────────────────
  const top10Art = useMemo(() => {
    return [...articulos]
      .sort((a, b) => b.importe - a.importe)
      .slice(0, 10)
      .map((a) => ({ name: a.articulo, importe: a.importe }));
  }, [articulos]);

  // ── Artículos table ────────────────────────────────────────────────────────
  const filteredArticulos = useMemo(() => {
    let rows = [...articulos];
    if (searchArt) {
      rows = rows.filter((a) =>
        a.articulo.toLowerCase().includes(searchArt.toLowerCase())
      );
    }
    rows.sort((a, b) => {
      const va = a[sortFieldArt] as number | string;
      const vb = b[sortFieldArt] as number | string;
      if (typeof va === "number" && typeof vb === "number") {
        return sortDirArt === "asc" ? va - vb : vb - va;
      }
      return sortDirArt === "asc"
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });
    return rows;
  }, [articulos, searchArt, sortFieldArt, sortDirArt]);

  const totalArt = filteredArticulos.length;
  const totalPagesArt = Math.ceil(totalArt / PAGE_SIZE);
  const startArt = pageArt * PAGE_SIZE;
  const pageArtRows = filteredArticulos.slice(startArt, startArt + PAGE_SIZE);

  function handleArtSort(field: keyof ArticuloRow) {
    if (field === sortFieldArt) setSortDirArt((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortFieldArt(field); setSortDirArt("desc"); }
  }
  const artSortIcon = (f: keyof ArticuloRow) =>
    sortFieldArt === f ? (sortDirArt === "desc" ? " ↓" : " ↑") : "";

  // ── Clientes table ─────────────────────────────────────────────────────────
  const filteredClientes = useMemo(() => {
    if (!selectedArticulo) return clientesXArticulo;
    return clientesXArticulo.filter((c) => c.articulo === selectedArticulo);
  }, [clientesXArticulo, selectedArticulo]);

  const totalClientes = filteredClientes.length;
  const totalPagesCliente = Math.ceil(totalClientes / PAGE_SIZE);
  const startCliente = pageCliente * PAGE_SIZE;
  const pageClienteRows = filteredClientes.slice(
    startCliente,
    startCliente + PAGE_SIZE
  );

  // ── Vendedores table ───────────────────────────────────────────────────────
  const filteredVendedores = useMemo(() => {
    let rows = selectedArticulo
      ? vendedoresArticulo.filter((v) => v.articulo === selectedArticulo)
      : [...vendedoresArticulo];
    rows.sort((a, b) => {
      const va = a[sortFieldVend] as number | string;
      const vb = b[sortFieldVend] as number | string;
      if (typeof va === "number" && typeof vb === "number") {
        return sortDirVend === "asc" ? va - vb : vb - va;
      }
      return sortDirVend === "asc"
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });
    return rows;
  }, [vendedoresArticulo, selectedArticulo, sortFieldVend, sortDirVend]);

  const totalVend = filteredVendedores.length;
  const totalPagesVend = Math.ceil(totalVend / PAGE_SIZE);
  const startVend = pageVend * PAGE_SIZE;
  const pageVendRows = filteredVendedores.slice(startVend, startVend + PAGE_SIZE);

  function handleVendSort(field: keyof VendedorArticuloRow) {
    if (field === sortFieldVend) setSortDirVend((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortFieldVend(field); setSortDirVend("desc"); }
  }
  const vendSortIcon = (f: keyof VendedorArticuloRow) =>
    sortFieldVend === f ? (sortDirVend === "desc" ? " ↓" : " ↑") : "";

  return (
    <div className="flex flex-col gap-4">
      {/* Global article filter */}
      {articulos.length > 0 && (
        <div className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-100 rounded-xl">
          <span className="text-xs font-bold text-orange-700 shrink-0">
            Filtrar por artículo:
          </span>
          <Select
            value={selectedArticulo || "__all__"}
            onValueChange={(v) => {
              setSelectedArticulo(v === "__all__" ? "" : v);
              setPageCliente(0);
              setPageVend(0);
            }}
          >
            <SelectTrigger className="h-7 text-xs min-w-[200px]">
              <SelectValue placeholder="Todos los artículos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos los artículos</SelectItem>
              {articulos.map((a) => (
                <SelectItem key={a.articulo} value={a.articulo}>
                  {a.articulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedArticulo && (
            <Badge className="bg-orange-100 text-orange-700 border-0 text-[10px]">
              {selectedArticulo}
            </Badge>
          )}
        </div>
      )}

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
                layoutId="det-tab-bg"
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
            {/* KPI cards */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Artículos", value: kpiNArt, unit: "" },
                { label: "Clientes", value: kpiNClientes, unit: "" },
                { label: "Ticket Prom.", value: kpiTicket, unit: "$" },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className="bg-white border border-[var(--shelfy-border)] rounded-xl p-3 text-center"
                >
                  <p className="text-[11px] text-[var(--shelfy-muted)] mb-1">
                    {kpi.label}
                  </p>
                  <p className="text-xl font-bold text-[var(--shelfy-primary)] tabular-nums">
                    {kpi.unit === "$"
                      ? fmt(kpi.value)
                      : kpi.value.toLocaleString("es-AR")}
                  </p>
                </div>
              ))}
            </div>

            {/* Top 10 artículos horizontal bar chart */}
            {top10Art.length > 0 ? (
              <div>
                <p className="text-xs font-bold text-[var(--shelfy-muted)] mb-2">
                  Top 10 artículos por importe
                </p>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={top10Art}
                    layout="vertical"
                    margin={{ left: 8, right: 16, top: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--shelfy-border)"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      width={100}
                    />
                    <Tooltip
                      formatter={(v: number | undefined) => [typeof v === "number" ? fmt(v) : "–", "Importe"]}
                      contentStyle={{
                        fontSize: 11,
                        borderRadius: 8,
                        border: "1px solid var(--shelfy-border)",
                      }}
                    />
                    <Bar dataKey="importe" radius={[0, 4, 4, 0]}>
                      {top10Art.map((_, idx) => (
                        <Cell
                          key={idx}
                          fill={CHART_COLORS[idx % CHART_COLORS.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState msg="Sin datos de artículos." />
            )}

            <ReporteriaOrigen data={data} />
          </motion.div>
        )}

        {tab === "articulos" && (
          <motion.div
            key="articulos"
            initial={{ opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            className="flex flex-col gap-3"
          >
            <Input
              value={searchArt}
              onChange={(e) => {
                setSearchArt(e.target.value);
                setPageArt(0);
              }}
              placeholder="Buscar artículo..."
              className="h-7 text-xs rounded-lg border-[var(--shelfy-border)] max-w-[260px]"
            />
            {pageArtRows.length === 0 ? (
              <EmptyState msg="Sin artículos." />
            ) : (
              <>
                <div className="overflow-x-auto rounded-xl border border-[var(--shelfy-border)]">
                  <table className="w-full text-xs">
                    <thead className="bg-[var(--shelfy-bg)] border-b border-[var(--shelfy-border)]">
                      <tr>
                        <th className="px-3 py-2.5 text-left font-bold text-[var(--shelfy-muted)]">
                          Artículo
                        </th>
                        {(
                          [
                            ["importe", "Importe"],
                            ["n_ops", "Operaciones"],
                            ["n_clientes", "Clientes"],
                            ["prom_sem", "Prom/sem"],
                          ] as [keyof ArticuloRow, string][]
                        ).map(([field, label]) => (
                          <th
                            key={field}
                            className="px-3 py-2.5 text-right font-bold text-[var(--shelfy-muted)] cursor-pointer hover:text-[var(--shelfy-text)] select-none"
                            onClick={() => {
                              handleArtSort(field);
                              setPageArt(0);
                            }}
                          >
                            {label}
                            {artSortIcon(field)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageArtRows.map((a, i) => (
                        <tr
                          key={a.articulo}
                          className={cn(
                            "border-b border-[var(--shelfy-border)]/50 cursor-pointer hover:bg-orange-50/50",
                            i % 2 === 0 ? "bg-white" : "bg-[var(--shelfy-bg)]/30"
                          )}
                          onClick={() => {
                            setSelectedArticulo(
                              selectedArticulo === a.articulo ? "" : a.articulo
                            );
                            setPageCliente(0);
                            setPageVend(0);
                          }}
                        >
                          <td className="px-3 py-2 text-[var(--shelfy-text)] font-medium flex items-center gap-2">
                            {a.articulo}
                            {selectedArticulo === a.articulo && (
                              <Badge className="bg-orange-100 text-orange-700 border-0 text-[10px]">
                                activo
                              </Badge>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--shelfy-primary)]">
                            {fmt(a.importe)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {a.n_ops.toLocaleString("es-AR")}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {a.n_clientes.toLocaleString("es-AR")}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-[var(--shelfy-muted)]">
                            {a.prom_sem.toFixed(1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {totalPagesArt > 1 && (
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-[var(--shelfy-muted)]">
                      {startArt + 1}–{Math.min(startArt + PAGE_SIZE, totalArt)}{" "}
                      de {totalArt}
                    </span>
                    <div className="flex gap-1">
                      <button
                        disabled={pageArt === 0}
                        onClick={() => setPageArt((p) => p - 1)}
                        className="px-2 py-1 text-xs rounded-lg border border-[var(--shelfy-border)] disabled:opacity-40"
                      >
                        ←
                      </button>
                      <button
                        disabled={pageArt >= totalPagesArt - 1}
                        onClick={() => setPageArt((p) => p + 1)}
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

        {tab === "clientes" && (
          <motion.div
            key="clientes"
            initial={{ opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            className="flex flex-col gap-3"
          >
            {pageClienteRows.length === 0 ? (
              <EmptyState
                msg={
                  selectedArticulo
                    ? `Sin clientes para "${selectedArticulo}".`
                    : "Sin datos de clientes."
                }
              />
            ) : (
              <>
                <div className="overflow-x-auto rounded-xl border border-[var(--shelfy-border)]">
                  <table className="w-full text-xs">
                    <thead className="bg-[var(--shelfy-bg)] border-b border-[var(--shelfy-border)]">
                      <tr>
                        <th className="px-3 py-2.5 text-left font-bold text-[var(--shelfy-muted)]">
                          Cliente
                        </th>
                        {!selectedArticulo && (
                          <th className="px-3 py-2.5 text-left font-bold text-[var(--shelfy-muted)]">
                            Artículo
                          </th>
                        )}
                        <th className="px-3 py-2.5 text-right font-bold text-[var(--shelfy-muted)]">
                          Importe
                        </th>
                        <th className="px-3 py-2.5 text-right font-bold text-[var(--shelfy-muted)]">
                          Operaciones
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageClienteRows.map((c: ClienteArticuloRow, i) => (
                        <tr
                          key={`${c.cliente}-${c.articulo}-${i}`}
                          className={cn(
                            "border-b border-[var(--shelfy-border)]/50",
                            i % 2 === 0 ? "bg-white" : "bg-[var(--shelfy-bg)]/30"
                          )}
                        >
                          <td
                            className="px-3 py-2 text-[var(--shelfy-text)] font-medium truncate max-w-[160px]"
                            title={c.cliente}
                          >
                            {c.cliente}
                          </td>
                          {!selectedArticulo && (
                            <td className="px-3 py-2 text-[var(--shelfy-muted)] truncate max-w-[140px]">
                              {c.articulo}
                            </td>
                          )}
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--shelfy-primary)]">
                            {fmt(c.importe)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {c.n_ops}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {totalPagesCliente > 1 && (
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-[var(--shelfy-muted)]">
                      {startCliente + 1}–
                      {Math.min(startCliente + PAGE_SIZE, totalClientes)} de{" "}
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
                        disabled={pageCliente >= totalPagesCliente - 1}
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
            className="flex flex-col gap-3"
          >
            {pageVendRows.length === 0 ? (
              <EmptyState
                msg={
                  selectedArticulo
                    ? `Sin vendedores para "${selectedArticulo}".`
                    : "Sin datos de vendedores."
                }
              />
            ) : (
              <>
                <div className="overflow-x-auto rounded-xl border border-[var(--shelfy-border)]">
                  <table className="w-full text-xs">
                    <thead className="bg-[var(--shelfy-bg)] border-b border-[var(--shelfy-border)]">
                      <tr>
                        <th
                          className="px-3 py-2.5 text-left font-bold text-[var(--shelfy-muted)] cursor-pointer hover:text-[var(--shelfy-text)] select-none"
                          onClick={() => handleVendSort("vendedor")}
                        >
                          Vendedor{vendSortIcon("vendedor")}
                        </th>
                        {!selectedArticulo && (
                          <th
                            className="px-3 py-2.5 text-left font-bold text-[var(--shelfy-muted)] cursor-pointer hover:text-[var(--shelfy-text)] select-none"
                            onClick={() => handleVendSort("articulo")}
                          >
                            Artículo{vendSortIcon("articulo")}
                          </th>
                        )}
                        <th
                          className="px-3 py-2.5 text-right font-bold text-[var(--shelfy-muted)] cursor-pointer hover:text-[var(--shelfy-text)] select-none"
                          onClick={() => handleVendSort("importe")}
                        >
                          Importe{vendSortIcon("importe")}
                        </th>
                        <th
                          className="px-3 py-2.5 text-right font-bold text-[var(--shelfy-muted)] cursor-pointer hover:text-[var(--shelfy-text)] select-none"
                          onClick={() => handleVendSort("n_ops")}
                        >
                          Operaciones{vendSortIcon("n_ops")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageVendRows.map((v: VendedorArticuloRow, i) => (
                        <tr
                          key={`${v.vendedor}-${v.articulo}-${i}`}
                          className={cn(
                            "border-b border-[var(--shelfy-border)]/50",
                            i % 2 === 0 ? "bg-white" : "bg-[var(--shelfy-bg)]/30"
                          )}
                        >
                          <td className="px-3 py-2 text-[var(--shelfy-text)] font-medium truncate max-w-[160px]">
                            {v.vendedor}
                          </td>
                          {!selectedArticulo && (
                            <td className="px-3 py-2 text-[var(--shelfy-muted)] truncate max-w-[140px]">
                              {v.articulo}
                            </td>
                          )}
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--shelfy-primary)]">
                            {fmt(v.importe)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {v.n_ops}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {totalPagesVend > 1 && (
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-[var(--shelfy-muted)]">
                      {startVend + 1}–
                      {Math.min(startVend + PAGE_SIZE, totalVend)} de {totalVend}
                    </span>
                    <div className="flex gap-1">
                      <button
                        disabled={pageVend === 0}
                        onClick={() => setPageVend((p) => p - 1)}
                        className="px-2 py-1 text-xs rounded-lg border border-[var(--shelfy-border)] disabled:opacity-40"
                      >
                        ←
                      </button>
                      <button
                        disabled={pageVend >= totalPagesVend - 1}
                        onClick={() => setPageVend((p) => p + 1)}
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
      </AnimatePresence>
    </div>
  );
}
