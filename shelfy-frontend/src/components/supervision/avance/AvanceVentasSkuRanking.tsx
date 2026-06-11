"use client";

import { useMemo, useState } from "react";
import { ListOrdered, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AvanceDeltaKpi, AvanceSkuRankingRow, AvanceVentasModo } from "@/lib/api";
import {
  deltaDir,
  deltaRefLabel,
  fmtBultos,
  fmtDelta,
  fmtEntero,
  fmtUnidades,
  fmtVolumenCell,
} from "@/lib/avance-ventas-format";
import { skuRowTieneVenta } from "@/lib/avance-ventas-alcance";
import { AVANCE_KPI_HELP, deltaHelpText } from "@/lib/avance-ventas-kpi-help";
import { useVolumenModo } from "@/hooks/useVolumenModo";
import { KpiHelpTip } from "@/components/estadisticas/KpiHelpTip";
import { cn } from "@/lib/utils";
import { AvanceVentasExportButton } from "./AvanceVentasExportButton";

type SortKey = "default" | "bultos" | "unidades" | "clientes" | "intensidad" | "penetracion";

interface AvanceVentasSkuRankingProps {
  ranking: AvanceSkuRankingRow[] | undefined;
  modo: AvanceVentasModo;
  periodoLabel: string;
  onSelectSku: (row: AvanceSkuRankingRow) => void;
  soloConVenta?: boolean;
  className?: string;
}

function DeltaMini({ delta }: { delta: AvanceDeltaKpi | undefined }) {
  if (!delta) return null;
  if (!delta.disponible) {
    return <span className="text-[9px] text-muted-foreground">Sin dato</span>;
  }
  const dir = deltaDir(delta);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums",
        dir === "up"
          ? "text-emerald-600 dark:text-emerald-400"
          : dir === "down"
            ? "text-rose-600 dark:text-rose-400"
            : "text-slate-500 dark:text-slate-400",
      )}
    >
      {dir === "up" ? (
        <TrendingUp size={10} strokeWidth={2.5} />
      ) : dir === "down" ? (
        <TrendingDown size={10} strokeWidth={2.5} />
      ) : (
        <Minus size={10} strokeWidth={2.5} />
      )}
      {fmtDelta(delta)}
    </span>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
  helpText,
  className,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  /** Tooltip (?) — el click en el ícono no dispara el sort (R7). */
  helpText?: string;
  className?: string;
}) {
  return (
    <TableHead
      className={cn("text-right whitespace-nowrap", className)}
      aria-sort={active ? (dir === "desc" ? "descending" : "ascending") : "none"}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex min-h-8 items-center gap-1 justify-end cursor-pointer select-none rounded-md",
          "transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          active && "text-foreground",
        )}
      >
        {label}
        {helpText ? <KpiHelpTip text={helpText} size={11} side="top" /> : null}
        {active ? (
          <span className="text-foreground" aria-hidden>{dir === "desc" ? "↓" : "↑"}</span>
        ) : (
          <span className="opacity-30" aria-hidden>↕</span>
        )}
      </button>
    </TableHead>
  );
}

/**
 * Tabla ranking SKUs: catálogo 12m completo (sin venta atenuado), nombres sin
 * truncar (R6), tooltips (?) en KPIs (R7), switch bultos/desglose (R2) y
 * toggle "Solo con venta" (R1). Tap/click en fila → drill de clientes.
 */
export function AvanceVentasSkuRanking({
  ranking,
  modo,
  periodoLabel,
  onSelectSku,
  soloConVenta = false,
  className,
}: AvanceVentasSkuRankingProps) {
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [volumenModo] = useVolumenModo();

  const toggleSort = (key: Exclude<SortKey, "default">) => {
    if (key === sortKey) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const totalSinVenta = useMemo(
    () => (ranking ?? []).filter((r) => !skuRowTieneVenta(r)).length,
    [ranking],
  );

  const rows = useMemo(() => {
    let list = [...(ranking ?? [])];
    if (soloConVenta) list = list.filter((r) => skuRowTieneVenta(r));
    if (sortKey === "default") return list; // orden BE: con venta desc, sin venta al final
    const get = (r: AvanceSkuRankingRow): number =>
      sortKey === "penetracion" ? (r.penetracion_pct ?? -1) : r[sortKey];
    list.sort((a, b) => (sortDir === "desc" ? get(b) - get(a) : get(a) - get(b)));
    return list;
  }, [ranking, sortKey, sortDir, soloConVenta]);

  const hasWow = rows.some((r) => r.wow_bultos);
  const hasMom = rows.some((r) => r.mom_bultos);
  const hasPenetracion = rows.some((r) => r.penetracion_pct != null);
  const conVenta = rows.filter((r) => skuRowTieneVenta(r)).length;

  return (
    <Card className={cn("flex flex-col min-h-0 overflow-hidden", className)}>
      <CardHeader className="pb-3 pt-4 px-5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <ListOrdered size={15} className="text-emerald-500" />
            Ranking SKUs
            <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
              {rows.length} artículos
              {!soloConVenta && totalSinVenta > 0 ? ` (${totalSinVenta} sin venta)` : ""}
            </span>
          </CardTitle>
          <AvanceVentasExportButton
            ranking={rows}
            periodoLabel={periodoLabel}
            volumenModo={volumenModo}
          />
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="p-0 flex-1 min-h-0 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-10">
            Sin ventas en el período seleccionado.
          </p>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow className="text-[10px]">
                <TableHead className="pl-5 min-w-[240px]">Artículo</TableHead>
                <SortHeader
                  label={volumenModo === "desglose" ? "Volumen" : "Bultos"}
                  helpText={volumenModo === "desglose" ? AVANCE_KPI_HELP.volumenDesglose : AVANCE_KPI_HELP.bultos}
                  active={sortKey === "bultos"}
                  dir={sortDir}
                  onClick={() => toggleSort("bultos")}
                />
                {volumenModo === "bultos" && (
                  <SortHeader label="Unid." helpText={AVANCE_KPI_HELP.unidades} active={sortKey === "unidades"} dir={sortDir} onClick={() => toggleSort("unidades")} className="hidden sm:table-cell" />
                )}
                <SortHeader label="Clientes" active={sortKey === "clientes"} dir={sortDir} onClick={() => toggleSort("clientes")} />
                <SortHeader label="Intens." helpText={AVANCE_KPI_HELP.intensidad} active={sortKey === "intensidad"} dir={sortDir} onClick={() => toggleSort("intensidad")} className="hidden md:table-cell" />
                {hasPenetracion && (
                  <SortHeader label="Penetr." helpText={AVANCE_KPI_HELP.penetracion} active={sortKey === "penetracion"} dir={sortDir} onClick={() => toggleSort("penetracion")} className="hidden md:table-cell" />
                )}
                {hasWow && (
                  <TableHead className="text-right hidden lg:table-cell whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      Δ {deltaRefLabel(modo, "wow")}
                      <KpiHelpTip text={deltaHelpText(modo)} size={11} side="top" />
                    </span>
                  </TableHead>
                )}
                {hasMom && (
                  <TableHead className="text-right hidden lg:table-cell pr-4 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      Δ {deltaRefLabel(modo, "mom")}
                      {!hasWow ? <KpiHelpTip text={deltaHelpText(modo)} size={11} side="top" /> : null}
                    </span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const vol = fmtVolumenCell(r, volumenModo);
                const sinVenta = !skuRowTieneVenta(r);
                return (
                  <TableRow
                    key={r.cod_articulo}
                    tabIndex={0}
                    className={cn(
                      "text-xs cursor-pointer transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                      sinVenta
                        ? "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                        : "hover:bg-muted/40",
                    )}
                    onClick={() => onSelectSku(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectSku(r);
                      }
                    }}
                  >
                    <TableCell className="pl-5 py-2 min-w-[240px] align-top">
                      {/* R6: nombre completo siempre, sin truncate */}
                      <p
                        className={cn(
                          "font-medium whitespace-normal break-words leading-snug",
                          sinVenta && "font-normal",
                        )}
                      >
                        {r.articulo}
                        {sinVenta && (
                          <span className="ml-1.5 inline-block align-middle rounded-full border border-border/70 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Sin venta
                          </span>
                        )}
                      </p>
                      {r.agrupacion && (
                        <p className="text-[9px] text-muted-foreground whitespace-normal break-words">
                          {r.agrupacion}
                        </p>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono text-[11px] font-semibold tabular-nums whitespace-nowrap",
                        r.bultos < 0 && "text-rose-600",
                      )}
                    >
                      {vol.primary}
                      {vol.secondary && (
                        <span className="text-muted-foreground font-normal text-[10px]">
                          {" "}
                          {vol.secondary}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-[11px] tabular-nums text-muted-foreground hidden sm:table-cell">
                      {fmtUnidades(r.unidades)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {fmtEntero(r.clientes)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-[11px] tabular-nums text-muted-foreground hidden md:table-cell">
                      {fmtBultos(r.intensidad)}
                    </TableCell>
                    {hasPenetracion && (
                      <TableCell className="text-right tabular-nums text-muted-foreground hidden md:table-cell">
                        {r.penetracion_pct != null
                          ? `${r.penetracion_pct.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`
                          : "—"}
                      </TableCell>
                    )}
                    {hasWow && (
                      <TableCell className="text-right hidden lg:table-cell">
                        <DeltaMini delta={r.wow_bultos} />
                      </TableCell>
                    )}
                    {hasMom && (
                      <TableCell className="text-right hidden lg:table-cell pr-4">
                        <DeltaMini delta={r.mom_bultos} />
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {conVenta > 0 && totalSinVenta > 0 && !soloConVenta && (
        <>
          <Separator />
          <p className="px-5 py-2 text-[10px] leading-snug text-muted-foreground">
            Catálogo de los últimos 12 meses · {conVenta} con venta + {totalSinVenta} sin venta en{" "}
            {periodoLabel}.
          </p>
        </>
      )}
    </Card>
  );
}
