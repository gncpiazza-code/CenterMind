"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import type { ClienteCuenta } from "@/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { SUPERVISION_PANEL_BODY_SCROLL_CLASS } from "@/components/supervision/supervisionLayout";

const ROW_HEIGHT_PX = 40;
/** Por debajo de este umbral se renderiza la tabla completa (comportamiento legacy). */
const VIRTUALIZE_THRESHOLD = 48;
const OVERSCAN_ROWS = 6;

function fmt$$(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);
}

function CCSortIndicator({
  active,
  dir,
}: {
  active: boolean;
  dir: "asc" | "desc";
}) {
  if (!active) return <span className="opacity-30">↕</span>;
  return <span className="text-foreground">{dir === "desc" ? "↓" : "↑"}</span>;
}

export interface SupervisionCcClientesTableProps {
  rows: ClienteCuenta[];
  rowKeyPrefix: string;
  ccSort: "deuda" | "antiguedad" | "comprobantes";
  ccSortDir: "asc" | "desc";
  selectedClienteErp: string | null;
  onToggleSort: (col: "deuda" | "antiguedad" | "comprobantes") => void;
  onSelectCliente: (erp: string | null) => void;
  onPrefetchDeudor: (erp: string) => void;
  columnHelp: ComponentType<{ text: string }>;
}

function CcClienteRow({
  c,
  idx,
  rowKeyPrefix,
  isSelected,
  onSelectCliente,
  onPrefetchDeudor,
}: {
  c: ClienteCuenta;
  idx: number;
  rowKeyPrefix: string;
  isSelected: boolean;
  onSelectCliente: (erp: string | null) => void;
  onPrefetchDeudor: (erp: string) => void;
}) {
  const erp = c.id_cliente_erp ?? null;

  return (
    <TableRow
      className={cn(
        "text-xs cursor-pointer transition-colors",
        isSelected
          ? "bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-50"
          : "hover:bg-muted/40",
      )}
      onClick={() => onSelectCliente(erp)}
      onMouseEnter={() => {
        if (erp) void onPrefetchDeudor(erp);
      }}
    >
      <TableCell className="pl-5 font-medium truncate max-w-[130px]">
        <div className="flex items-center gap-1">
          {isSelected && (
            <span className="inline-block size-1.5 rounded-full bg-blue-500 shrink-0" />
          )}
          {c.cliente ?? "—"}
        </div>
      </TableCell>
      <TableCell className="text-right font-mono text-[11px] text-rose-600 font-semibold">
        {fmt$$(c.deuda_total)}
      </TableCell>
      <TableCell className="text-right text-muted-foreground tabular-nums">
        {c.antiguedad != null ? (
          <span className={c.antiguedad_desde_padron ? "text-amber-700 font-medium" : ""}>
            {c.antiguedad}d
          </span>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="text-right text-muted-foreground font-mono text-[11px] pr-4 tabular-nums">
        {c.cantidad_comprobantes ?? "—"}
      </TableCell>
    </TableRow>
  );
}

/**
 * Tabla CC con virtualización ligera (windowing manual) para listas largas.
 * Listas cortas mantienen el markup original sin windowing.
 */
export function SupervisionCcClientesTable({
  rows,
  rowKeyPrefix,
  ccSort,
  ccSortDir,
  selectedClienteErp,
  onToggleSort,
  onSelectCliente,
  onPrefetchDeudor,
  columnHelp: ColumnHelp,
}: SupervisionCcClientesTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualize = rows.length >= VIRTUALIZE_THRESHOLD;
  const [windowRange, setWindowRange] = useState({ start: 0, end: Math.min(rows.length, 40) });

  const recomputeWindow = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !virtualize) return;
    const start = Math.max(0, Math.floor(el.scrollTop / ROW_HEIGHT_PX) - OVERSCAN_ROWS);
    const visible = Math.ceil(el.clientHeight / ROW_HEIGHT_PX) + OVERSCAN_ROWS * 2;
    setWindowRange({
      start,
      end: Math.min(rows.length, start + visible),
    });
  }, [rows.length, virtualize]);

  useEffect(() => {
    if (!virtualize) return;
    recomputeWindow();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", recomputeWindow, { passive: true });
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(recomputeWindow);
      ro.observe(el);
    }
    return () => {
      el.removeEventListener("scroll", recomputeWindow);
      ro?.disconnect();
    };
  }, [virtualize, recomputeWindow, rowKeyPrefix]);

  const handleSelect = (erp: string | null) => {
    onSelectCliente(erp !== selectedClienteErp ? erp : null);
  };

  const visibleRows = virtualize ? rows.slice(windowRange.start, windowRange.end) : rows;
  const topPad = virtualize ? windowRange.start * ROW_HEIGHT_PX : 0;
  const bottomPad = virtualize ? (rows.length - windowRange.end) * ROW_HEIGHT_PX : 0;

  return (
    <div
      ref={scrollRef}
      key={rowKeyPrefix}
      className={SUPERVISION_PANEL_BODY_SCROLL_CLASS}
    >
      <Table>
        <TableHeader className={cn(virtualize && "sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]")}>
          <TableRow className="text-[10px]">
            <TableHead className="pl-5 w-[38%]">Cliente</TableHead>
            <TableHead
              className="text-right cursor-pointer select-none hover:text-foreground"
              onClick={() => onToggleSort("deuda")}
            >
              Deuda <CCSortIndicator active={ccSort === "deuda"} dir={ccSortDir} />
            </TableHead>
            <TableHead
              className="text-right cursor-pointer select-none hover:text-foreground"
              onClick={() => onToggleSort("antiguedad")}
            >
              <span className="inline-flex items-center gap-0.5">
                Antig.
                <ColumnHelp text="Antigüedad de la deuda en días, según el reporte de cuentas corrientes (CHESS). Indica hace cuánto está impago el saldo del cliente." />
                <CCSortIndicator active={ccSort === "antiguedad"} dir={ccSortDir} />
              </span>
            </TableHead>
            <TableHead
              className="text-right cursor-pointer select-none hover:text-foreground pr-4"
              onClick={() => onToggleSort("comprobantes")}
            >
              <span className="inline-flex items-center justify-end gap-0.5">
                Comprobantes
                <ColumnHelp text="Cantidad de comprobantes con saldo impago, según el reporte de cuentas corrientes (CHESS)." />
                <CCSortIndicator active={ccSort === "comprobantes"} dir={ccSortDir} />
              </span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {topPad > 0 && (
            <TableRow aria-hidden className="pointer-events-none border-0 hover:bg-transparent">
              <TableCell colSpan={4} className="p-0 border-0" style={{ height: topPad }} />
            </TableRow>
          )}
          {visibleRows.map((c, idx) => {
            const erp = c.id_cliente_erp ?? null;
            const isSelected = !!erp && erp === selectedClienteErp;
            const absoluteIdx = virtualize ? windowRange.start + idx : idx;
            return (
              <CcClienteRow
                key={`${rowKeyPrefix}-${c.id_cliente_erp ?? c.cliente ?? absoluteIdx}`}
                c={c}
                idx={absoluteIdx}
                rowKeyPrefix={rowKeyPrefix}
                isSelected={isSelected}
                onSelectCliente={handleSelect}
                onPrefetchDeudor={onPrefetchDeudor}
              />
            );
          })}
          {bottomPad > 0 && (
            <TableRow aria-hidden className="pointer-events-none border-0 hover:bg-transparent">
              <TableCell colSpan={4} className="p-0 border-0" style={{ height: bottomPad }} />
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
