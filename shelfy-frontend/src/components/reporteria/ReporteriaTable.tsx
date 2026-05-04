"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import type { ReporteriaClienteRow, ReporteriaSource } from "@/lib/api";
import { cn } from "@/lib/utils";

function formatARS(v: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(v);
}

type SortKey = keyof ReporteriaClienteRow;
type SortDir = "asc" | "desc";

interface Props {
  rows: ReporteriaClienteRow[];
  source?: ReporteriaSource;
}

export function ReporteriaTable({ rows, source = "comprobantes" }: Props) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("importe_total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);

  const PAGE_SIZE = 12;

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    return (
      r.nombre_cliente.toLowerCase().includes(q) ||
      r.vendedor_nombre.toLowerCase().includes(q) ||
      r.sucursal_nombre.toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === "number" && typeof bv === "number") {
      return sortDir === "asc" ? av - bv : bv - av;
    }
    return sortDir === "asc"
      ? String(av ?? "").localeCompare(String(bv ?? ""))
      : String(bv ?? "").localeCompare(String(av ?? ""));
  });

  const pages = Math.ceil(sorted.length / PAGE_SIZE);
  const visible = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(0);
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ArrowUpDown size={11} className="opacity-30" />;
    return sortDir === "asc"
      ? <ArrowUp size={11} className="text-[var(--shelfy-primary)]" />
      : <ArrowDown size={11} className="text-[var(--shelfy-primary)]" />;
  }

  const COLS: { key: SortKey; label: string; align?: "right" }[] =
    source === "sigo"
      ? [
          { key: "nombre_cliente",    label: "Vendedor" },
          { key: "vendedor_nombre",   label: "Visitados / Total" },
          { key: "sucursal_nombre",   label: "Efectividad" },
          { key: "cantidad_facturas", label: "Ventas conc.", align: "right" },
          { key: "importe_total",     label: "Cobertura %",  align: "right" },
        ]
      : source === "bultos"
        ? [
            { key: "nombre_cliente",    label: "PDV / Cliente" },
            { key: "vendedor_nombre",   label: "Vendedor" },
            { key: "sucursal_nombre",   label: "Sucursal" },
            { key: "cantidad_facturas", label: "Total bultos", align: "right" },
            { key: "importe_total",     label: "Prom/sem",     align: "right" },
          ]
        : [
            { key: "nombre_cliente",    label: "Cliente" },
            { key: "vendedor_nombre",   label: "Vendedor" },
            { key: "sucursal_nombre",   label: "Sucursal" },
            { key: "cantidad_facturas", label: "Fact.", align: "right" },
            { key: "importe_total",     label: "Importe", align: "right" },
          ];

  return (
    <div className="bg-white border border-[var(--shelfy-border)] rounded-2xl overflow-hidden shadow-sm">
      {/* Search */}
      <div className="flex items-center gap-3 p-4 border-b border-[var(--shelfy-border)]">
        <div className="relative flex-1 max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--shelfy-muted)]" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Buscar cliente, vendedor, sucursal…"
            className="w-full text-sm pl-9 pr-4 py-2 bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-xl focus:outline-none focus:border-[var(--shelfy-primary)] transition-colors"
          />
        </div>
        <span className="text-[11px] text-[var(--shelfy-muted)] font-medium whitespace-nowrap">
          {filtered.length.toLocaleString("es-AR")} filas
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--shelfy-bg)]">
              {COLS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className={cn(
                    "px-4 py-3 text-[10px] font-black uppercase tracking-wider text-[var(--shelfy-muted)] cursor-pointer select-none hover:text-[var(--shelfy-primary)] transition-colors",
                    col.align === "right" ? "text-right" : "text-left"
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    <SortIcon k={col.key} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-[var(--shelfy-muted)] text-sm">
                  Sin resultados
                </td>
              </tr>
            ) : (
              visible.map((row, i) => (
                <motion.tr
                  key={`${row.nombre_cliente}-${i}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.02 }}
                  className="border-t border-[var(--shelfy-border)] hover:bg-[var(--shelfy-primary)]/[0.03] transition-colors"
                >
                  <td className="px-4 py-3 font-semibold text-[var(--shelfy-text)] max-w-[180px] truncate">
                    {row.nombre_cliente}
                  </td>
                  <td className="px-4 py-3 text-[var(--shelfy-text-soft)] text-xs">{row.vendedor_nombre}</td>
                  <td className="px-4 py-3 text-[var(--shelfy-muted)] text-xs">{row.sucursal_nombre}</td>
                  <td className="px-4 py-3 text-right font-medium text-[var(--shelfy-text)]">
                    {row.cantidad_facturas}
                  </td>
                  <td className="px-4 py-3 text-right font-black text-[var(--shelfy-primary)] tabular-nums">
                    {source === "comprobantes"
                      ? formatARS(row.importe_total)
                      : source === "sigo"
                        ? `${row.importe_total.toFixed(1)}%`
                        : row.importe_total.toFixed(1)}
                  </td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--shelfy-border)]">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="text-xs font-semibold text-[var(--shelfy-primary)] disabled:opacity-30 hover:underline transition"
          >
            ← Anterior
          </button>
          <span className="text-[11px] text-[var(--shelfy-muted)]">
            Pág. {page + 1} de {pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            disabled={page === pages - 1}
            className="text-xs font-semibold text-[var(--shelfy-primary)] disabled:opacity-30 hover:underline transition"
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}
