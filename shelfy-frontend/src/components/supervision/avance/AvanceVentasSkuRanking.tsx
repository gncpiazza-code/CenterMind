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
import { deltaDir, deltaRefLabel, fmtBultos, fmtDelta, fmtUnidades } from "@/lib/avance-ventas-format";
import { cn } from "@/lib/utils";
import { AvanceVentasExportButton } from "./AvanceVentasExportButton";

type SortKey = "bultos" | "unidades" | "clientes" | "intensidad" | "penetracion";

interface AvanceVentasSkuRankingProps {
  ranking: AvanceSkuRankingRow[] | undefined;
  modo: AvanceVentasModo;
  periodoLabel: string;
  onSelectSku: (row: AvanceSkuRankingRow) => void;
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
        dir === "up" ? "text-emerald-600" : dir === "down" ? "text-rose-600" : "text-slate-500",
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
  className,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  className?: string;
}) {
  return (
    <TableHead
      className={cn("text-right cursor-pointer select-none hover:text-foreground whitespace-nowrap", className)}
      onClick={onClick}
    >
      {label}{" "}
      {active ? (
        <span className="text-foreground">{dir === "desc" ? "↓" : "↑"}</span>
      ) : (
        <span className="opacity-30">↕</span>
      )}
    </TableHead>
  );
}

/** Tabla ranking SKUs sortable; tap/click en fila → drill de clientes. */
export function AvanceVentasSkuRanking({
  ranking,
  modo,
  periodoLabel,
  onSelectSku,
  className,
}: AvanceVentasSkuRankingProps) {
  const [sortKey, setSortKey] = useState<SortKey>("bultos");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const rows = useMemo(() => {
    const list = [...(ranking ?? [])];
    const get = (r: AvanceSkuRankingRow): number =>
      sortKey === "penetracion" ? (r.penetracion_pct ?? -1) : r[sortKey];
    list.sort((a, b) => (sortDir === "desc" ? get(b) - get(a) : get(a) - get(b)));
    return list;
  }, [ranking, sortKey, sortDir]);

  const hasWow = rows.some((r) => r.wow_bultos);
  const hasMom = rows.some((r) => r.mom_bultos);
  const hasPenetracion = rows.some((r) => r.penetracion_pct != null);

  return (
    <Card className={cn("flex flex-col min-h-0 overflow-hidden", className)}>
      <CardHeader className="pb-3 pt-4 px-5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <ListOrdered size={15} className="text-emerald-500" />
            Ranking SKUs
            <span className="text-[10px] font-medium text-muted-foreground">
              {rows.length} artículos
            </span>
          </CardTitle>
          <AvanceVentasExportButton ranking={rows} periodoLabel={periodoLabel} />
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
                <TableHead className="pl-5 min-w-[160px]">Artículo</TableHead>
                <SortHeader label="Bultos" active={sortKey === "bultos"} dir={sortDir} onClick={() => toggleSort("bultos")} />
                <SortHeader label="Unid." active={sortKey === "unidades"} dir={sortDir} onClick={() => toggleSort("unidades")} className="hidden sm:table-cell" />
                <SortHeader label="Clientes" active={sortKey === "clientes"} dir={sortDir} onClick={() => toggleSort("clientes")} />
                <SortHeader label="Intens." active={sortKey === "intensidad"} dir={sortDir} onClick={() => toggleSort("intensidad")} className="hidden md:table-cell" />
                {hasPenetracion && (
                  <SortHeader label="Penetr." active={sortKey === "penetracion"} dir={sortDir} onClick={() => toggleSort("penetracion")} className="hidden md:table-cell" />
                )}
                {hasWow && (
                  <TableHead className="text-right hidden lg:table-cell whitespace-nowrap">
                    Δ {deltaRefLabel(modo, "wow")}
                  </TableHead>
                )}
                {hasMom && (
                  <TableHead className="text-right hidden lg:table-cell pr-4 whitespace-nowrap">
                    Δ {deltaRefLabel(modo, "mom")}
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.cod_articulo}
                  className="text-xs cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => onSelectSku(r)}
                >
                  <TableCell className="pl-5 py-2 max-w-[220px]">
                    <p className="font-medium truncate" title={r.articulo}>{r.articulo}</p>
                    {r.agrupacion && (
                      <p className="text-[9px] text-muted-foreground truncate">{r.agrupacion}</p>
                    )}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-mono text-[11px] font-semibold tabular-nums",
                      r.bultos < 0 && "text-rose-600",
                    )}
                  >
                    {fmtBultos(r.bultos)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[11px] tabular-nums text-muted-foreground hidden sm:table-cell">
                    {fmtUnidades(r.unidades)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {r.clientes}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[11px] tabular-nums text-muted-foreground hidden md:table-cell">
                    {fmtBultos(r.intensidad)}
                  </TableCell>
                  {hasPenetracion && (
                    <TableCell className="text-right tabular-nums text-muted-foreground hidden md:table-cell">
                      {r.penetracion_pct != null ? `${r.penetracion_pct.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%` : "—"}
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
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
