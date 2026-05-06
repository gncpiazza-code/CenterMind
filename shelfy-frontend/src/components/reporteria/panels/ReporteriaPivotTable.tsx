"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface Props {
  rows: string[];
  columns: string[];
  getValue: (row: string, col: string) => number | null;
  formatCell?: (v: number) => string;
  rowLabel?: string;
  emptySymbol?: string;
}

export function ReporteriaPivotTable({
  rows,
  columns,
  getValue,
  formatCell,
  rowLabel = "",
  emptySymbol = "–",
}: Props) {
  const maxVal = useMemo(() => {
    let m = 0;
    for (const r of rows) {
      for (const c of columns) {
        const v = getValue(r, c);
        if (v !== null && v > m) m = v;
      }
    }
    return m;
  }, [rows, columns, getValue]);

  function cellClass(v: number | null): string {
    if (v === null || maxVal === 0) return "";
    const pct = v / maxVal;
    if (pct >= 0.75) return "bg-emerald-100 text-emerald-800 font-semibold";
    if (pct >= 0.5) return "bg-blue-50 text-blue-700 font-medium";
    if (pct >= 0.25) return "bg-amber-50 text-amber-700";
    return "bg-red-50 text-red-600 text-[10px]";
  }

  if (!rows.length || !columns.length) {
    return (
      <p className="text-sm text-[var(--shelfy-muted)] text-center py-8">
        Sin datos para mostrar.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--shelfy-border)]">
      <table className="text-xs min-w-full">
        <thead>
          <tr className="bg-[var(--shelfy-bg)] border-b border-[var(--shelfy-border)]">
            <th className="sticky left-0 z-10 bg-[var(--shelfy-bg)] text-left px-3 py-2.5 font-bold text-[var(--shelfy-muted)] border-r border-[var(--shelfy-border)] min-w-[140px]">
              {rowLabel}
            </th>
            {columns.map((col) => (
              <th
                key={col}
                className="px-2 py-2.5 font-semibold text-[var(--shelfy-muted)] whitespace-nowrap text-center min-w-[70px]"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={row}
              className={ri % 2 === 0 ? "bg-white" : "bg-[var(--shelfy-bg)]/40"}
            >
              <td
                className="sticky left-0 z-10 bg-inherit px-3 py-1.5 font-semibold text-[var(--shelfy-text)] border-r border-[var(--shelfy-border)] truncate max-w-[160px]"
                title={row}
              >
                {row}
              </td>
              {columns.map((col) => {
                const v = getValue(row, col);
                return (
                  <td
                    key={col}
                    className={cn(
                      "px-2 py-1.5 text-center tabular-nums rounded",
                      cellClass(v)
                    )}
                  >
                    {v !== null ? (
                      formatCell ? (
                        formatCell(v)
                      ) : (
                        v.toLocaleString("es-AR")
                      )
                    ) : (
                      <span className="text-[var(--shelfy-muted)] opacity-30">
                        {emptySymbol}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
