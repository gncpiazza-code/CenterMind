"use client";

import { Loader2, Store } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { AvanceClienteMixRow, AvanceVentasModo } from "@/lib/api";
import { useAvanceVentasClienteSkus } from "@/hooks/useAvanceVentasQuery";
import { useVolumenModo } from "@/hooks/useVolumenModo";
import { fmtBultos, fmtUnidades, fmtVolumenCell } from "@/lib/avance-ventas-format";
import { cn } from "@/lib/utils";

interface AvanceVentasClienteDrillSheetProps {
  distId: number;
  cliente: AvanceClienteMixRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modo: AvanceVentasModo;
  fecha: string;
  sucursal?: string | null;
  vendedor?: string | null;
  periodoLabel?: string;
}

/**
 * Drill inverso de auditoría (R8): SKUs que compró un cliente en el período.
 * La suma de bultos acá cierra contra el ranking — corroboración al 100%.
 */
export function AvanceVentasClienteDrillSheet({
  distId,
  cliente,
  open,
  onOpenChange,
  modo,
  fecha,
  sucursal,
  vendedor,
  periodoLabel,
}: AvanceVentasClienteDrillSheetProps) {
  const [volumenModo] = useVolumenModo();
  const query = useAvanceVentasClienteSkus(
    distId,
    open ? (cliente?.id_cliente_erp ?? null) : null,
    modo,
    fecha,
    sucursal,
    vendedor,
    open,
  );

  const skus = query.data?.skus ?? [];
  const maxB = Math.max(...skus.map((s) => Math.abs(s.bultos)), 0.01);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-start gap-2 text-base">
            <Store size={16} className="text-violet-500 shrink-0 mt-0.5" />
            {/* PDV en UI: #id + nombre, sin truncar */}
            <span className="min-w-0 whitespace-normal break-words leading-snug">
              {cliente?.id_cliente_erp ? `#${cliente.id_cliente_erp} ` : ""}
              {cliente?.cliente ?? "Cliente"}
            </span>
          </SheetTitle>
          {cliente?.razon_social &&
          cliente.razon_social.trim().toUpperCase() !== (cliente.cliente ?? "").trim().toUpperCase() ? (
            <p className="text-[11px] text-muted-foreground whitespace-normal break-words leading-snug -mt-1">
              {cliente.razon_social}
            </p>
          ) : null}
          <SheetDescription className="text-xs">
            {periodoLabel ? `${periodoLabel} · ` : ""}
            {cliente
              ? `${fmtBultos(cliente.bultos)} bultos · ${cliente.skus_distintos} SKU${cliente.skus_distintos === 1 ? "" : "s"}`
              : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex flex-col gap-3">
          {cliente && (
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border bg-muted/40 px-2.5 py-2 text-center">
                <p className="text-[9px] font-bold uppercase text-muted-foreground">Bultos</p>
                <p className="text-sm font-black tabular-nums">{fmtBultos(cliente.bultos)}</p>
              </div>
              <div className="rounded-lg border bg-muted/40 px-2.5 py-2 text-center">
                <p className="text-[9px] font-bold uppercase text-muted-foreground">SKUs</p>
                <p className="text-sm font-black tabular-nums">{cliente.skus_distintos}</p>
              </div>
              <div className="rounded-lg border bg-muted/40 px-2.5 py-2 text-center">
                <p className="text-[9px] font-bold uppercase text-muted-foreground">Concentr.</p>
                <p className="text-sm font-black tabular-nums">
                  {cliente.pct_concentracion != null
                    ? `${cliente.pct_concentracion.toLocaleString("es-AR", { maximumFractionDigits: 0 })}%`
                    : "—"}
                </p>
              </div>
            </div>
          )}

          {query.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground text-xs">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando SKUs…
            </div>
          ) : query.isError ? (
            <p className="text-xs text-muted-foreground py-6 text-center">
              No se pudo cargar el detalle del cliente.
            </p>
          ) : skus.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">
              Sin compras en el período para el filtro activo.
            </p>
          ) : (
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">
                SKUs comprados ({skus.length})
              </p>
              <div className="flex flex-col divide-y divide-border/50">
                {skus.map((s) => {
                  const vol = fmtVolumenCell(s, volumenModo);
                  const pct = Math.min(100, (Math.abs(s.bultos) / maxB) * 100);
                  return (
                    <div key={s.cod_articulo} className="py-1.5 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-medium min-w-0 whitespace-normal break-words leading-snug">
                          {s.articulo}
                        </span>
                        <span
                          className={cn(
                            "font-mono text-[11px] font-semibold tabular-nums shrink-0",
                            s.bultos < 0 ? "text-rose-600" : "text-foreground",
                          )}
                        >
                          {vol.primary} b
                          {vol.secondary ? (
                            <span className="text-muted-foreground font-normal"> {vol.secondary}</span>
                          ) : s.unidades ? (
                            <span className="text-muted-foreground font-normal">
                              {" "}
                              · {fmtUnidades(s.unidades)} u
                            </span>
                          ) : null}
                        </span>
                      </div>
                      <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            s.bultos < 0 ? "bg-rose-400" : "bg-violet-400",
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {query.data && (
                <p className="mt-3 text-[10px] text-muted-foreground tabular-nums">
                  Total período: {fmtBultos(query.data.total_bultos)} bultos
                  {query.data.total_unidades
                    ? ` · ${fmtUnidades(query.data.total_unidades)} unidades`
                    : ""}
                </p>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
