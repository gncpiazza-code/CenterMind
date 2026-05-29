"use client";

import { useState } from "react";
import { ChevronDown, Package, AlertCircle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { DeudorDetalle } from "@/lib/api";
import { formatRangoBadgeLabel, rangoBadgeClass } from "@/lib/cuentasCorrientes";

function fmt$$(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtFecha(s: string): string {
  if (!s) return "—";
  return s.slice(0, 10).split("-").reverse().join("/");
}

interface Props {
  deuda: DeudorDetalle["deuda"];
  estado: DeudorDetalle["estado"];
  confianza: DeudorDetalle["confianza"];
  comprobantes: DeudorDetalle["comprobantes"];
}

export function DeudorComprobantesList({ deuda, estado, confianza, comprobantes }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (num: string) =>
    setExpanded((prev) => ({ ...prev, [num]: !prev[num] }));

  if (estado === "sin_comprobantes") {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 py-2">
          <AlertCircle size={14} className="text-amber-500 shrink-0" />
          <p className="text-xs text-muted-foreground">
            Sin comprobantes identificados. Mostrando desglose por antigüedad.
          </p>
        </div>
        <div className="rounded-lg border overflow-hidden">
          {deuda.desglose_antiguedad
            .filter((r) => r.monto > 0)
            .map((r) => (
              <div
                key={r.rango}
                className="flex items-center justify-between px-3 py-2 border-b last:border-b-0 text-xs"
              >
                <span
                  className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border font-semibold ${rangoBadgeClass(r.rango)}`}
                >
                  {formatRangoBadgeLabel(r.rango)}
                </span>
                <span className="font-mono font-semibold text-rose-600">{fmt$$(r.monto)}</span>
              </div>
            ))}
          <div className="flex items-center justify-between px-3 py-2 bg-muted/40 text-xs font-semibold">
            <span className="text-muted-foreground uppercase tracking-wide text-[10px]">Total</span>
            <span className="font-mono text-rose-600">{fmt$$(deuda.total_deuda)}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {confianza === "baja" && (
        <div className="flex items-center gap-1.5 rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5">
          <AlertCircle size={12} className="text-amber-500 shrink-0" />
          <p className="text-[10px] text-amber-700">
            Coincidencia estimada — los comprobantes pueden variar
          </p>
        </div>
      )}
      {confianza === "alta" && (
        <div className="flex items-center gap-1.5 rounded-md bg-emerald-50 border border-emerald-200 px-2.5 py-1.5">
          <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
          <p className="text-[10px] text-emerald-700">Comprobantes identificados con alta confianza</p>
        </div>
      )}

      <div className="rounded-lg border overflow-hidden divide-y">
        {comprobantes.map((cbte) => {
          const isOpen = expanded[cbte.numero] ?? false;
          return (
            <div key={cbte.numero}>
              <button
                type="button"
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
                onClick={() => toggle(cbte.numero)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Package size={12} className="text-muted-foreground shrink-0" />
                  <span className="text-xs font-mono font-medium truncate">{cbte.numero}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{fmtFecha(cbte.fecha)}</span>
                  {cbte.match_status === "estimado" && (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-amber-300 text-amber-600 shrink-0">
                      est.
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs font-mono font-semibold text-rose-600">
                    {fmt$$(cbte.importe_total)}
                  </span>
                  <ChevronDown
                    size={13}
                    className={cn(
                      "text-muted-foreground transition-transform duration-200",
                      isOpen && "rotate-180",
                    )}
                  />
                </div>
              </button>
              {isOpen && cbte.articulos.length > 0 && (
                <div className="bg-muted/25 px-3 pb-2 pt-1">
                  {cbte.articulos.map((art, i) => (
                    <div
                      key={`${art.cod_articulo}-${i}`}
                      className="flex items-start justify-between gap-2 py-1.5 border-b border-muted/60 last:border-b-0 text-[11px]"
                    >
                      <div className="min-w-0">
                        <p className="text-muted-foreground font-mono text-[10px]">{art.cod_articulo}</p>
                        <p className="text-foreground truncate">{art.descripcion || "—"}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-muted-foreground text-[10px]">{art.bultos_total} bts.</p>
                        <p className="font-mono font-semibold">{fmt$$(art.importe_final)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Separator className="my-1" />
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Deuda total (autoritativo)</span>
        <span className="text-sm font-black font-mono text-rose-600">{fmt$$(deuda.total_deuda)}</span>
      </div>
    </div>
  );
}
