"use client";

import type { CcResumenRow, CcSaldoBucketRow } from "@/lib/cuentasCorrientes";
import { formatRangoBadgeLabel, rangoBadgeClass } from "@/lib/cuentasCorrientes";

function fmtPct(n: number): string {
  return `${n.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);
}

type Variant = "amber" | "rose";

const VARIANT_STYLES: Record<
  Variant,
  { accent: string; headerBg: string; money: string }
> = {
  amber: {
    accent: "text-amber-400",
    headerBg: "bg-amber-500/5",
    money: "text-amber-400",
  },
  rose: {
    accent: "text-rose-600",
    headerBg: "bg-rose-500/5",
    money: "text-rose-600",
  },
};

type Props = {
  antiguedad: CcResumenRow[];
  saldo: CcSaldoBucketRow[];
  variant?: Variant;
  /** Dentro del panel CC del mapa (sin card exterior). */
  embedded?: boolean;
  /** Override badges de antigüedad (p. ej. tema oscuro del mapa). */
  rangoBadgeClassFn?: (label: string) => string;
  className?: string;
};

function ResumenTable({
  title,
  subtitle,
  headers,
  rows,
  variant,
  embedded,
  renderLabel,
}: {
  title: string;
  subtitle: string;
  headers: [string, string, string, string?];
  rows: Array<{ label: string; monto: number; pct: number; clientes?: number }>;
  variant: Variant;
  embedded: boolean;
  renderLabel?: (label: string) => React.ReactNode;
}) {
  const v = VARIANT_STYLES[variant];
  const hasData = rows.some((r) => r.monto > 0);
  if (!hasData) return null;

  const px = embedded ? "px-5" : "px-4";

  return (
    <div className={embedded ? "border-b border-[var(--shelfy-border)]/30 last:border-b-0" : ""}>
      <div className={`${px} py-2.5 border-b border-[var(--shelfy-border)]/40 ${v.headerBg}`}>
        <p className={`text-[10px] font-bold uppercase tracking-wide ${v.accent}`}>{title}</p>
        <p className="text-[10px] text-[var(--shelfy-muted)] mt-0.5">{subtitle}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-[var(--shelfy-bg)]/80 text-[var(--shelfy-muted)] uppercase text-[9px] tracking-wide">
              <th className={`text-left font-semibold ${px} py-2`}>{headers[0]}</th>
              {headers[3] != null && (
                <th className="text-center font-semibold px-3 py-2">{headers[3]}</th>
              )}
              <th className="text-right font-semibold px-3 py-2">{headers[1]}</th>
              <th className={`text-right font-semibold ${px} py-2 w-[4.5rem]`}>{headers[2]}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--shelfy-border)]/25">
            {rows.map((r) => (
              <tr key={r.label} className="hover:bg-white/[0.03]">
                <td className={`${px} py-2 font-medium text-[var(--shelfy-text)]`}>
                  {renderLabel ? renderLabel(r.label) : r.label}
                </td>
                {headers[3] != null && (
                  <td className="px-3 py-2 text-center tabular-nums text-[var(--shelfy-muted)]">
                    {r.clientes != null && r.clientes > 0 ? r.clientes : "—"}
                  </td>
                )}
                <td className={`px-3 py-2 text-right font-mono tabular-nums font-semibold ${v.money}`}>
                  {r.monto > 0 ? fmtMoney(r.monto) : "—"}
                </td>
                <td className={`${px} py-2 text-right tabular-nums text-[var(--shelfy-muted)]`}>
                  {r.monto > 0 ? fmtPct(r.pct) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Resumen CC: antigüedad + tramos de vencimiento (como PDF difusión). */
export function CcDeudaResumenPanel({
  antiguedad,
  saldo,
  variant = "amber",
  embedded = false,
  rangoBadgeClassFn,
  className = "",
}: Props) {
  const badgeClass = rangoBadgeClassFn ?? rangoBadgeClass;
  const showAntig = antiguedad.some((r) => r.monto > 0);
  const showSaldo = saldo.some((r) => r.monto > 0);
  if (!showAntig && !showSaldo) return null;

  const inner = (
    <>
      <ResumenTable
        title="Distribución por antigüedad"
        subtitle="Deuda total agrupada por días de atraso del cliente"
        headers={["Rango", "Deuda", "%", "Clientes"]}
        rows={antiguedad}
        variant={variant}
        embedded={embedded}
        renderLabel={(label) => (
          <span
            className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border font-semibold ${badgeClass(label)}`}
          >
            {formatRangoBadgeLabel(label)}
          </span>
        )}
      />
      <ResumenTable
        title="Deuda por vencimiento"
        subtitle="Saldo en cada tramo (7 / 15 / 30 / 60 / +60 días)"
        headers={["Tramo", "Deuda", "%"]}
        rows={saldo}
        variant={variant}
        embedded={embedded}
      />
    </>
  );

  if (embedded) {
    return <div className={className}>{inner}</div>;
  }

  return (
    <div
      className={`rounded-xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] shadow-sm overflow-hidden ${className}`}
    >
      {inner}
    </div>
  );
}
