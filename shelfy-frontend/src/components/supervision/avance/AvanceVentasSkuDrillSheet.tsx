"use client";

import { useMemo, useState } from "react";
import { ClipboardCheck, Loader2, Package, Users } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import type {
  AvanceClienteVolumen,
  AvanceSkuRankingRow,
  AvanceVentasModo,
  AvanceVentasResponse,
} from "@/lib/api";
import { useAvanceVentasSkuClientes } from "@/hooks/useAvanceVentasQuery";
import { fmtBultos, fmtEntero, fmtVolumenCell } from "@/lib/avance-ventas-format";
import { useVolumenModo } from "@/hooks/useVolumenModo";
import { cn } from "@/lib/utils";

interface AvanceVentasSkuDrillSheetProps {
  distId: number;
  sku: AvanceSkuRankingRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Drill precalculado del payload principal (top 20 SKUs). */
  precomputed: AvanceVentasResponse["drill_clientes_por_sku"] | undefined;
  modo: AvanceVentasModo;
  fecha: string;
  sucursal?: string | null;
  vendedor?: string | null;
  periodoLabel?: string;
}

function ClientesList({
  title,
  rows,
  empty,
  volumenKind,
  volumenModo,
}: {
  title: string;
  rows: AvanceClienteVolumen[];
  empty: string;
  volumenKind?: string | null;
  volumenModo: "bultos" | "desglose";
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">{empty}</p>
      ) : (
        <div className="flex flex-col divide-y divide-border/50">
          {rows.map((c, idx) => {
            const maxB = Math.max(...rows.map((r) => Math.abs(r.bultos)), 0.01);
            const pct = Math.min(100, (Math.abs(c.bultos) / maxB) * 100);
            return (
              <div key={`${c.id_cliente_erp ?? c.cliente}-${idx}`} className="py-1.5 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-medium min-w-0 whitespace-normal break-words leading-snug">
                    {c.id_cliente_erp ? (
                      <span className="text-muted-foreground font-normal">#{c.id_cliente_erp} </span>
                    ) : null}
                    {c.cliente}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-[11px] font-semibold tabular-nums shrink-0",
                      c.bultos < 0 ? "text-rose-600" : "text-foreground",
                    )}
                  >
                    {(() => {
                      const vol = fmtVolumenCell(
                        { bultos: c.bultos, unidades: c.unidades, volumen_kind: volumenKind },
                        volumenModo,
                      );
                      return (
                        <>
                          {vol.primary}
                          {vol.secondary ? (
                            <span className="text-muted-foreground font-normal"> {vol.secondary}</span>
                          ) : null}
                        </>
                      );
                    })()}
                  </span>
                </div>
                <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn("h-full rounded-full", c.bultos < 0 ? "bg-rose-400" : "bg-emerald-400")}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Sheet de drill por SKU: top/bottom inmediato + auditoría completa lazy con
 * la lista total de clientes paginada (R8 — la suma cierra contra el ranking).
 */
export function AvanceVentasSkuDrillSheet({
  distId,
  sku,
  open,
  onOpenChange,
  precomputed,
  modo,
  fecha,
  sucursal,
  vendedor,
  periodoLabel,
}: AvanceVentasSkuDrillSheetProps) {
  const [volumenModo] = useVolumenModo();
  const [auditoriaAbierta, setAuditoriaAbierta] = useState(false);
  const [offset, setOffset] = useState(0);
  const [acumulados, setAcumulados] = useState<AvanceClienteVolumen[]>([]);

  // Reset al cambiar de SKU o cerrar — patrón "adjust state during render"
  // (https://react.dev/learn/you-might-not-need-an-effect).
  const drillKey = `${sku?.cod_articulo ?? ""}|${open ? 1 : 0}`;
  const [prevDrillKey, setPrevDrillKey] = useState(drillKey);
  if (drillKey !== prevDrillKey) {
    setPrevDrillKey(drillKey);
    setAuditoriaAbierta(false);
    setOffset(0);
    setAcumulados([]);
  }

  const pre = sku ? precomputed?.[sku.cod_articulo] : undefined;
  const needsLazy = open && !!sku && (!pre || auditoriaAbierta);

  const lazyQuery = useAvanceVentasSkuClientes(
    distId,
    needsLazy ? (sku?.cod_articulo ?? null) : null,
    modo,
    fecha,
    sucursal,
    vendedor,
    needsLazy,
    offset,
  );

  // Acumular páginas de la lista completa (mismo patrón render-adjust).
  const page = lazyQuery.data?.clientes;
  const [seenPage, setSeenPage] = useState<AvanceClienteVolumen[] | undefined>(undefined);
  if (page && page !== seenPage) {
    setSeenPage(page);
    setAcumulados((prev) => {
      const seen = new Set(prev.map((c) => c.id_cliente_erp ?? c.cliente));
      return [...prev, ...page.filter((c) => !seen.has(c.id_cliente_erp ?? c.cliente))];
    });
  }

  const drill = useMemo(
    () =>
      pre ??
      (lazyQuery.data ? { top: lazyQuery.data.top, bottom: lazyQuery.data.bottom } : null),
    [pre, lazyQuery.data],
  );

  const total = lazyQuery.data?.total ?? null;
  const totalBultos = lazyQuery.data?.total_bultos ?? null;
  const hayMas = total != null && acumulados.length < total;

  const exportRows = useMemo(() => {
    if (!sku) return [];
    if (acumulados.length > 0) return acumulados;
    if (!drill) return [];
    const seen = new Set<string>();
    return [...drill.top, ...drill.bottom].filter((c) => {
      const key = c.id_cliente_erp ?? c.cliente;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [drill, sku, acumulados]);

  const handleExportCsv = () => {
    if (!sku || exportRows.length === 0) return;
    const header = "cliente;id_cliente_erp;bultos;unidades";
    const lines = exportRows.map((c) =>
      [
        `"${(c.cliente ?? "").replaceAll('"', '""')}"`,
        c.id_cliente_erp ?? "",
        String(c.bultos).replace(".", ","),
        String(c.unidades).replace(".", ","),
      ].join(";"),
    );
    const blob = new Blob(["﻿" + [header, ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `avance-sku-${sku.cod_articulo}-${fecha}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-start gap-2 text-base">
            <Package size={16} className="text-emerald-500 shrink-0 mt-0.5" />
            {/* R6: título completo, sin truncar */}
            <span className="min-w-0 whitespace-normal break-words leading-snug">
              {sku?.articulo ?? "SKU"}
            </span>
          </SheetTitle>
          <SheetDescription className="text-xs">
            {periodoLabel ? `${periodoLabel} · ` : ""}
            {sku ? `${fmtBultos(sku.bultos)} bultos · ${sku.clientes} clientes` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex flex-col gap-4">
          {sku && (
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border bg-muted/40 px-2.5 py-2 text-center">
                <p className="text-[9px] font-bold uppercase text-muted-foreground">Bultos</p>
                <p className="text-sm font-black tabular-nums">{fmtBultos(sku.bultos)}</p>
              </div>
              <div className="rounded-lg border bg-muted/40 px-2.5 py-2 text-center">
                <p className="text-[9px] font-bold uppercase text-muted-foreground">Clientes</p>
                <p className="text-sm font-black tabular-nums">{sku.clientes}</p>
              </div>
              <div className="rounded-lg border bg-muted/40 px-2.5 py-2 text-center">
                <p className="text-[9px] font-bold uppercase text-muted-foreground">Intensidad</p>
                <p className="text-sm font-black tabular-nums">{fmtBultos(sku.intensidad)}</p>
              </div>
            </div>
          )}

          {needsLazy && lazyQuery.isLoading && acumulados.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground text-xs">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando clientes…
            </div>
          ) : drill ? (
            <>
              {!auditoriaAbierta && (
                <>
                  <ClientesList
                    title={`Top ${drill.top.length} clientes`}
                    rows={drill.top}
                    empty="Sin clientes con compra en el período."
                    volumenKind={sku?.volumen_kind}
                    volumenModo={volumenModo}
                  />
                  {drill.bottom.length > 0 && (
                    <>
                      <Separator />
                      <ClientesList
                        title={`Bottom ${drill.bottom.length} clientes`}
                        rows={drill.bottom}
                        empty=""
                        volumenKind={sku?.volumen_kind}
                        volumenModo={volumenModo}
                      />
                    </>
                  )}
                </>
              )}

              {/* Auditoría 100%: lista completa paginada */}
              {auditoriaAbierta ? (
                <>
                  <ClientesList
                    title={
                      total != null
                        ? `Todos los clientes (${fmtEntero(acumulados.length)} de ${fmtEntero(total)})`
                        : "Todos los clientes"
                    }
                    rows={acumulados}
                    empty="Sin clientes con compra en el período."
                    volumenKind={sku?.volumen_kind}
                    volumenModo={volumenModo}
                  />
                  {totalBultos != null && (
                    <p className="text-[10px] text-muted-foreground tabular-nums -mt-2">
                      Suma de la lista: {fmtBultos(totalBultos)} bultos
                      {sku ? ` · ranking: ${fmtBultos(sku.bultos)} bultos` : ""}
                    </p>
                  )}
                  {hayMas && (
                    <button
                      type="button"
                      disabled={lazyQuery.isFetching}
                      onClick={() => setOffset(acumulados.length)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      {lazyQuery.isFetching ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : null}
                      Cargar más clientes
                    </button>
                  )}
                </>
              ) : (
                (sku?.clientes ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => setAuditoriaAbierta(true)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50/60 dark:bg-violet-950/30 dark:border-violet-900 px-3 py-2 text-xs font-semibold text-violet-700 dark:text-violet-300 hover:bg-violet-100/70 dark:hover:bg-violet-950/50 transition-colors"
                  >
                    <ClipboardCheck size={13} />
                    Auditoría completa ({fmtEntero(sku?.clientes ?? 0)} clientes)
                  </button>
                )
              )}

              {exportRows.length > 0 && (
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-muted transition-colors"
                >
                  <Users size={13} />
                  Exportar clientes CSV
                </button>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground py-6 text-center">
              Sin detalle de clientes disponible.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
