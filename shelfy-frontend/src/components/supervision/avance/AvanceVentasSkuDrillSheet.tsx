"use client";

import { useMemo } from "react";
import { Loader2, Package, Users } from "lucide-react";
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
import { fmtBultos, fmtUnidades } from "@/lib/avance-ventas-format";
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

function ClientesList({ title, rows, empty }: { title: string; rows: AvanceClienteVolumen[]; empty: string }) {
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
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium truncate min-w-0">{c.cliente}</span>
                  <span
                    className={cn(
                      "font-mono text-[11px] font-semibold tabular-nums shrink-0",
                      c.bultos < 0 ? "text-rose-600" : "text-foreground",
                    )}
                  >
                    {fmtBultos(c.bultos)} b
                    {c.unidades ? (
                      <span className="text-muted-foreground font-normal"> · {fmtUnidades(c.unidades)} u</span>
                    ) : null}
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

/** Sheet con top/bottom 10 clientes del SKU; lazy-fetch fuera del top 20 precalculado. */
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
  const pre = sku ? precomputed?.[sku.cod_articulo] : undefined;
  const needsLazy = open && !!sku && !pre;

  const lazyQuery = useAvanceVentasSkuClientes(
    distId,
    needsLazy ? (sku?.cod_articulo ?? null) : null,
    modo,
    fecha,
    sucursal,
    vendedor,
    needsLazy,
  );

  const drill = useMemo(
    () =>
      pre ??
      (lazyQuery.data ? { top: lazyQuery.data.top, bottom: lazyQuery.data.bottom } : null),
    [pre, lazyQuery.data],
  );
  const exportRows = useMemo(() => {
    if (!drill || !sku) return [];
    const seen = new Set<string>();
    return [...drill.top, ...drill.bottom].filter((c) => {
      const key = c.id_cliente_erp ?? c.cliente;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [drill, sku]);

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
          <SheetTitle className="flex items-center gap-2 text-base">
            <Package size={16} className="text-emerald-500 shrink-0" />
            <span className="min-w-0 truncate">{sku?.articulo ?? "SKU"}</span>
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

          {needsLazy && lazyQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground text-xs">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando clientes…
            </div>
          ) : drill ? (
            <>
              <ClientesList
                title={`Top ${drill.top.length} clientes`}
                rows={drill.top}
                empty="Sin clientes con compra en el período."
              />
              {drill.bottom.length > 0 && (
                <>
                  <Separator />
                  <ClientesList
                    title={`Bottom ${drill.bottom.length} clientes`}
                    rows={drill.bottom}
                    empty=""
                  />
                </>
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
