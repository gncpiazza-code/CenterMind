"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ClipboardCheck, Search, ShoppingBag, SplitSquareHorizontal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AvanceAuditoriaClientes, AvanceClienteMixRow } from "@/lib/api";
import { fmtBultos, fmtEntero } from "@/lib/avance-ventas-format";
import { AVANCE_KPI_HELP } from "@/lib/avance-ventas-kpi-help";
import { KpiHelpTip } from "@/components/estadisticas/KpiHelpTip";
import { cn } from "@/lib/utils";

type AuditTab = "monoproducto" | "mix_bajo" | "por_cliente";

interface AvanceVentasClienteAuditoriaPanelProps {
  auditoria: AvanceAuditoriaClientes | undefined;
  onSelectCliente: (row: AvanceClienteMixRow) => void;
  className?: string;
}

const TAB_META: Array<{ key: AuditTab; label: string; icon: React.ElementType; help?: string }> = [
  { key: "monoproducto", label: "Monoproducto", icon: ShoppingBag, help: AVANCE_KPI_HELP.monoproducto },
  { key: "mix_bajo", label: "Mix bajo", icon: SplitSquareHorizontal, help: AVANCE_KPI_HELP.mixBajo },
  { key: "por_cliente", label: "Por cliente", icon: Search },
];

function ConcentracionBar({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-[10px] text-muted-foreground">—</span>;
  const intense = pct >= 85;
  return (
    <div className="flex items-center gap-1.5 min-w-[72px]">
      <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full", intense ? "bg-amber-500" : "bg-violet-400")}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span className="text-[10px] tabular-nums font-semibold shrink-0">
        {pct.toLocaleString("es-AR", { maximumFractionDigits: 0 })}%
      </span>
    </div>
  );
}

/**
 * Auditoría cliente×SKU (R8): bloque fijo bajo el ranking para corroborar
 * los números al 100% sin salir de la pantalla. Colapsable, abierto por defecto.
 */
export function AvanceVentasClienteAuditoriaPanel({
  auditoria,
  onSelectCliente,
  className,
}: AvanceVentasClienteAuditoriaPanelProps) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<AuditTab>("monoproducto");
  const [busqueda, setBusqueda] = useState("");

  const rows = useMemo<AvanceClienteMixRow[]>(() => {
    if (!auditoria) return [];
    if (tab === "monoproducto") return auditoria.monoproducto_fuerte;
    if (tab === "mix_bajo") return auditoria.mix_bajo;
    const q = busqueda.trim().toLowerCase();
    const base = auditoria.por_cliente_resumen;
    if (!q) return base;
    return base.filter(
      (r) =>
        r.cliente.toLowerCase().includes(q) ||
        (r.id_cliente_erp ?? "").toLowerCase().includes(q),
    );
  }, [auditoria, tab, busqueda]);

  if (!auditoria || auditoria.clientes_con_compra === 0) return null;

  const activeMeta = TAB_META.find((t) => t.key === tab);

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-3 pt-4 px-5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-2 text-left cursor-pointer select-none rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <CardTitle className="text-sm font-bold flex items-center gap-2 flex-wrap min-w-0">
            <ClipboardCheck size={15} className="text-violet-500 shrink-0" />
            Auditoría de clientes
            <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
              {fmtEntero(auditoria.clientes_con_compra)} con compra
              {auditoria.cartera_scope
                ? ` · cartera ${fmtEntero(auditoria.cartera_scope)}`
                : ""}
            </span>
          </CardTitle>
          <ChevronDown
            size={16}
            className={cn(
              "text-muted-foreground transition-transform duration-200 shrink-0",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      </CardHeader>

      {open && (
        <>
          <Separator />
          <CardContent className="p-0">
            <div className="flex items-center gap-1.5 flex-wrap px-5 pt-3 pb-2">
              {TAB_META.map(({ key, label, icon: Icon }) => {
                const isActive = tab === key;
                const count =
                  key === "monoproducto"
                    ? auditoria.monoproducto_fuerte.length
                    : key === "mix_bajo"
                      ? auditoria.mix_bajo.length
                      : auditoria.resumen_total;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    aria-pressed={isActive}
                    className={cn(
                      "h-8 px-2.5 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide rounded-lg transition-all duration-200",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                      isActive
                        ? "bg-foreground text-background shadow-sm"
                        : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon size={12} strokeWidth={2.5} />
                    {label}
                    <span
                      className={cn(
                        "tabular-nums rounded-full px-1 text-[9px]",
                        isActive ? "bg-background/20" : "bg-background/80 text-foreground/70",
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
              {activeMeta?.help ? (
                <KpiHelpTip text={activeMeta.help} size={12} side="top" />
              ) : null}
            </div>

            {tab === "por_cliente" && (
              <div className="px-5 pb-2">
                <div className="relative max-w-xs">
                  <Search
                    size={13}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar por nombre o N° ERP…"
                    className="h-8 pl-8 text-xs"
                  />
                </div>
                {auditoria.resumen_truncado && (
                  <p className="mt-1 text-[9px] text-muted-foreground">
                    Mostrando los primeros {fmtEntero(auditoria.por_cliente_resumen.length)} de{" "}
                    {fmtEntero(auditoria.resumen_total)} clientes por volumen.
                  </p>
                )}
              </div>
            )}

            <div className="max-h-[420px] overflow-y-auto">
              {rows.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-8">
                  {tab === "por_cliente" && busqueda
                    ? "Sin clientes que coincidan con la búsqueda."
                    : "Sin clientes en esta categoría para el período."}
                </p>
              ) : (
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-10">
                    <TableRow className="text-[10px]">
                      <TableHead className="pl-5 min-w-[180px]">Cliente</TableHead>
                      <TableHead className="text-right">Bultos</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">SKUs</TableHead>
                      <TableHead className="hidden md:table-cell min-w-[160px]">
                        SKU principal
                      </TableHead>
                      <TableHead className="hidden sm:table-cell pr-4 w-[110px]">
                        <span className="inline-flex items-center gap-1">
                          Concentr.
                          <KpiHelpTip
                            text="Porcentaje del volumen del cliente concentrado en su SKU principal."
                            size={11}
                            side="top"
                          />
                        </span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow
                        key={r.id_cliente_erp ?? r.cliente}
                        tabIndex={0}
                        className="text-xs cursor-pointer hover:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                        onClick={() => onSelectCliente(r)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onSelectCliente(r);
                          }
                        }}
                      >
                        <TableCell className="pl-5 py-2 align-top">
                          <p className="font-medium whitespace-normal break-words leading-snug">
                            {r.id_cliente_erp ? (
                              <span className="text-muted-foreground font-normal">
                                #{r.id_cliente_erp}{" "}
                              </span>
                            ) : null}
                            {r.cliente}
                          </p>
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-mono text-[11px] font-semibold tabular-nums whitespace-nowrap",
                            r.bultos < 0 && "text-rose-600",
                          )}
                        >
                          {fmtBultos(r.bultos)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground hidden sm:table-cell">
                          {r.skus_distintos}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <p className="text-[11px] text-muted-foreground whitespace-normal break-words leading-snug">
                            {r.sku_principal}
                          </p>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell pr-4">
                          <ConcentracionBar pct={r.pct_concentracion} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </CardContent>
        </>
      )}
    </Card>
  );
}
