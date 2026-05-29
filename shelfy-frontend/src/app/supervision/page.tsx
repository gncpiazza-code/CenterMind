"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { useAuth } from "@/hooks/useAuth";
import type { VendedorCuentas } from "@/lib/api";
import { openCuentasCorrientesPrintWindow } from "@/lib/printCuentasCorrientes";
import {
  ccRowMatchesVendedor,
  computeDeudaPorAntiguedad,
  formatRangoBadgeLabel,
  rangoBadgeClass,
  sortClientesCC,
} from "@/lib/cuentasCorrientes";
import { useSupervisionPanelStore } from "@/store/useSupervisionPanelStore";
import { useSupervisionPanelData } from "@/hooks/useSupervisionPanelData";
import { AnimatedKpiCard } from "@/components/supervision/AnimatedKpiCard";
import {
  SupervisionPageLoadingShell,
} from "@/components/supervision/SupervisionPanelSkeleton";
import { SupervisionReveal, SupervisionRevealItem } from "@/components/supervision/SupervisionReveal";
import { DeudorProfilePanel } from "@/components/supervision/DeudorProfilePanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CreditCard, Store, AlertTriangle, CalendarClock, Printer, Hash, HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  SUPERVISION_PANEL_BODY_SCROLL_CLASS,
  SUPERVISION_PANEL_COLUMN_CLASS,
  SUPERVISION_PANELS_ROW_CLASS,
  SUPERVISION_PANELS_VIEWPORT_CLASS,
} from "@/components/supervision/supervisionLayout";

const ALLOWED_ROLES = ["superadmin", "admin", "supervisor", "directorio"];

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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SupervisionPage() {
  const { user, effectiveDistribuidorId } = useAuth();
  const router = useRouter();
  const distId = effectiveDistribuidorId ?? 0;

  // ── Zustand store ────────────────────────────────────────────────────────────
  const {
    selectedSucursal,
    selectedVendedorNombre,
    ccSort,
    ccSortDir,
    setSelectedSucursal,
    setSelectedVendedorNombre,
    toggleCCSort,
    ccResumenExpanded,
    toggleCcResumen,
    selectedClienteErp,
    setSelectedClienteErp,
  } = useSupervisionPanelStore();

  const isAllowed = !!user && ALLOWED_ROLES.includes(user.rol);

  useEffect(() => {
    if (user && !isAllowed) router.replace("/dashboard");
  }, [user, isAllowed, router]);

  // Reset selected client when vendedor changes
  useEffect(() => {
    setSelectedClienteErp(null);
  }, [selectedVendedorNombre, setSelectedClienteErp]);

  const sucursalParam = selectedSucursal === "__all__" ? undefined : selectedSucursal;

  const {
    vendedores,
    vendedoresLoading,
    vendedoresFetching,
    selectedVendedorObj,
    selectedVendedorId,
    cuentasData,
    loadingCuentas,
    fetchingCuentas,
    ccKpisData,
  } = useSupervisionPanelData(
    distId,
    selectedSucursal,
    selectedVendedorNombre,
    // altasMes — ya no se usa para KPIs; se pasa igual para mantener la firma
    new Date().toISOString().slice(0, 7),
  );

  const isRefreshing = vendedoresFetching || fetchingCuentas;

  const sucursales = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const v of vendedores) {
      const s = v.sucursal_nombre;
      if (s && !seen.has(s)) { seen.add(s); list.push(s); }
    }
    return list.sort();
  }, [vendedores]);

  const vendedorOptions = useMemo(() => {
    return vendedores
      .filter((v) => !sucursalParam || v.sucursal_nombre === sucursalParam)
      .map((v) => v.nombre_vendedor)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "es"));
  }, [vendedores, sucursalParam]);

  const cuentasFiltradas = useMemo((): VendedorCuentas[] => {
    return cuentasData?.vendedores ?? [];
  }, [cuentasData]);

  const clientesOrdenados = useMemo(() => {
    const nombre = selectedVendedorNombre || "";
    const idV = selectedVendedorObj?.id_vendedor;
    const erp = selectedVendedorObj?.id_vendedor_erp;
    const clientes = cuentasFiltradas.flatMap((v) =>
      ccRowMatchesVendedor(v.vendedor, v.id_vendedor, nombre, idV, erp)
        ? (v.clientes ?? [])
        : [],
    );
    return sortClientesCC(clientes, ccSort, ccSortDir);
  }, [cuentasFiltradas, selectedVendedorNombre, selectedVendedorObj, ccSort, ccSortDir]);

  // ── KPIs CC ──────────────────────────────────────────────────────────────────
  const kpis = ccKpisData?.kpis;
  const deltas = ccKpisData?.deltas;

  const deudaFromClientes = useMemo(
    () => clientesOrdenados.reduce((s, c) => s + (c.deuda_total ?? 0), 0),
    [clientesOrdenados],
  );
  const deudaTotalDisplay =
    clientesOrdenados.length > 0 ? deudaFromClientes : (kpis?.total_deuda ?? cuentasData?.metadatos?.total_deuda ?? 0);
  const clientesDeudoresDisplay =
    clientesOrdenados.length > 0
      ? clientesOrdenados.length
      : (kpis?.clientes_deudores ?? cuentasData?.metadatos?.clientes_deudores ?? 0);
  const pdvsAtraso15 = kpis?.pdvs_atraso_15 ?? (clientesOrdenados.filter((c) => (c.antiguedad ?? 0) > 15).length);
  const diasPromedio = kpis?.dias_promedio_atraso ?? (cuentasData?.metadatos?.promedio_dias_retraso ?? 0);

  const deudaPorAntiguedad = useMemo(
    () => computeDeudaPorAntiguedad(clientesOrdenados),
    [clientesOrdenados],
  );
  const showCcResumen =
    !!selectedVendedorNombre &&
    !loadingCuentas &&
    clientesOrdenados.length > 0 &&
    deudaPorAntiguedad.some((r) => r.monto > 0);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!isAllowed) return null;

  return (
    <TooltipProvider>
      <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
        <Sidebar />
        <BottomNav />

        <div className="flex flex-col flex-1 min-w-0">
          <Topbar title="Supervisión" />

          <main className="flex-1 flex flex-col min-h-0 overflow-hidden pb-24 md:pb-8">
            <div className="max-w-[1400px] mx-auto flex flex-col flex-1 min-h-0 w-full gap-0">

              {/* ── NIVEL 1: Sticky subheader — solo filtros, sin badges ni título ── */}
              <div className="sticky top-0 z-20 bg-[var(--shelfy-bg)]/90 backdrop-blur-md border-b border-[var(--shelfy-border)] px-4 md:px-6 py-3">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CreditCard size={15} className="text-rose-500" />
                    <span className="text-sm font-black text-[var(--shelfy-text)] tracking-tight">
                      Cuentas Corrientes
                    </span>
                    {isRefreshing && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--shelfy-muted)]" />
                    )}
                  </div>

                  {/* ── Filtros jerarquizados ─────────────────────────────── */}
                  <div className="flex items-end gap-3 flex-wrap">
                    {sucursales.length > 0 && (
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide pl-0.5">
                          Sucursal
                        </label>
                        <Select value={selectedSucursal} onValueChange={setSelectedSucursal}>
                          <SelectTrigger className="h-9 text-sm w-44">
                            <SelectValue placeholder="Todas" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__all__">Todas las sucursales</SelectItem>
                            {sucursales.map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide pl-0.5">
                        Vendedor
                      </label>
                      <Select
                        value={selectedVendedorNombre ?? "__all__"}
                        onValueChange={(v) => setSelectedVendedorNombre(v === "__all__" ? null : v)}
                      >
                        <SelectTrigger className="h-9 text-sm w-52">
                          <SelectValue placeholder="Todos" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">Todos los vendedores</SelectItem>
                          {vendedorOptions.map((nombre) => (
                            <SelectItem key={nombre} value={nombre}>{nombre}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 md:p-6 flex flex-col flex-1 min-h-0 gap-5 overflow-hidden">

                {vendedoresLoading ? (
                  <SupervisionPageLoadingShell />
                ) : (
                <SupervisionReveal
                  className="flex flex-col flex-1 min-h-0 gap-5 overflow-hidden"
                  animate={!fetchingCuentas || !!cuentasData}
                >
                {/* ── NIVEL 3: 4 KPI cards CC — Card 1 expande lateral ── */}
                <SupervisionRevealItem className="shrink-0">
                <div className="flex flex-row gap-3 items-stretch">

                  {/* Card 1: Deuda Total — expande lateralmente empujando las demás */}
                  <div
                    className="flex flex-col min-w-0 overflow-hidden transition-[flex-grow] duration-300 ease-out"
                    style={{ flexGrow: ccResumenExpanded && showCcResumen ? 2 : 1 }}
                  >
                    {/* Card con desglose lateral inline */}
                    <div
                      className={cn(
                        "flex flex-row h-full border bg-card rounded-xl overflow-hidden transition-shadow",
                        "border-rose-200/60",
                        showCcResumen
                          ? ccResumenExpanded
                            ? "shadow-md"
                            : "hover:shadow-md cursor-pointer"
                          : "",
                      )}
                    >
                      {/* Parte izquierda: valor KPI */}
                      <button
                        type="button"
                        className={cn(
                          "flex-1 min-w-0 p-4 text-left focus:outline-none",
                          showCcResumen ? "cursor-pointer" : "cursor-default",
                        )}
                        onClick={showCcResumen ? toggleCcResumen : undefined}
                        aria-expanded={ccResumenExpanded}
                        disabled={!showCcResumen}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide truncate">
                              Deuda Total
                            </p>
                            {loadingCuentas && !!selectedVendedorNombre ? (
                              <div className="mt-1 h-7 w-24 rounded bg-muted animate-pulse" />
                            ) : (
                              <div className="flex items-baseline gap-2">
                                <p className="mt-1 text-2xl font-black text-foreground tracking-tight leading-none tabular-nums">
                                  {fmt$$(deudaTotalDisplay)}
                                </p>
                                {deltas?.total_deuda && deltas.total_deuda.dir !== "neutral" && (
                                  <span className={cn("text-[10px] font-semibold", deltas.total_deuda.dir === "up" ? "text-rose-600" : "text-emerald-600")}>
                                    {deltas.total_deuda.dir === "up" ? "↑" : "↓"}
                                    {deltas.total_deuda.pct != null ? ` ${Math.abs(deltas.total_deuda.pct)}%` : ""}
                                  </span>
                                )}
                              </div>
                            )}
                            {showCcResumen && (
                              <p className="mt-1 text-[10px] text-muted-foreground">
                                {ccResumenExpanded ? "Ocultar desglose" : "Ver desglose por antigüedad"}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {showCcResumen && (
                              <Hash
                                size={14}
                                className={cn("text-rose-500 transition-transform duration-300", ccResumenExpanded ? "rotate-90" : "")}
                              />
                            )}
                            <div className="size-9 rounded-xl bg-rose-500/8 flex items-center justify-center">
                              <CreditCard size={17} className="text-rose-600" strokeWidth={2} />
                            </div>
                          </div>
                        </div>
                      </button>

                      {/* Parte derecha: desglose por antigüedad (animado lateral) */}
                      <div
                        className={cn(
                          "overflow-hidden border-l border-rose-200/40",
                          ccResumenExpanded && showCcResumen ? "opacity-100" : "opacity-0 pointer-events-none",
                        )}
                        style={{
                          width: ccResumenExpanded && showCcResumen ? "270px" : "0px",
                          minWidth: ccResumenExpanded && showCcResumen ? "270px" : "0px",
                          transition: "width 300ms ease-out, min-width 300ms ease-out, opacity 200ms ease-out",
                        }}
                      >
                        <div className="w-[270px] p-3 h-full flex flex-col justify-center">
                          <p className="text-[9px] font-bold uppercase tracking-wide text-rose-600 mb-2 whitespace-nowrap">
                            Distribución por antigüedad
                          </p>
                          <div className="flex flex-col divide-y divide-rose-100/50">
                            {deudaPorAntiguedad.filter((r) => r.monto > 0).map((r) => (
                              <div key={r.label} className="flex items-center justify-between gap-3 py-1.5">
                                <span className={`inline-flex shrink-0 text-[9px] px-1.5 py-0.5 rounded border font-semibold ${rangoBadgeClass(r.label)}`}>
                                  {formatRangoBadgeLabel(r.label)}
                                </span>
                                <span className="font-mono text-[11px] font-semibold text-rose-600 tabular-nums whitespace-nowrap">
                                  {fmt$$(r.monto)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: PDVs deudores */}
                  <div className="flex-1 min-w-0">
                    <AnimatedKpiCard
                      label="PDVs deudores"
                      value={clientesDeudoresDisplay}
                      icon={Store}
                      color="amber"
                      loading={loadingCuentas && !!selectedVendedorNombre}
                      delay={0.06}
                      trend={deltas?.clientes_deudores}
                    />
                  </div>

                  {/* Card 3: PDVs con atraso >15d */}
                  <div className="flex-1 min-w-0">
                    <AnimatedKpiCard
                      label="Atraso +15 días"
                      value={pdvsAtraso15}
                      icon={AlertTriangle}
                      color="rose"
                      loading={loadingCuentas && !!selectedVendedorNombre}
                      delay={0.12}
                      trend={deltas?.pdvs_atraso_15}
                    />
                  </div>

                  {/* Card 4: Días promedio — sin flecha */}
                  <div className="flex-1 min-w-0">
                    <AnimatedKpiCard
                      label="Prom. días atraso"
                      value={Math.round(diasPromedio)}
                      icon={CalendarClock}
                      color="blue"
                      loading={loadingCuentas && !!selectedVendedorNombre}
                      delay={0.18}
                      subtext="promedio de mora"
                    />
                  </div>

                </div>
                </SupervisionRevealItem>

                {/* ── NIVEL 4: Paneles 40/60 ─────────────────────────────── */}
                <SupervisionRevealItem className={SUPERVISION_PANELS_VIEWPORT_CLASS}>
                <div className={SUPERVISION_PANELS_ROW_CLASS}>

                  {/* ── Izquierda 40%: Tabla CC ──────────────────────────── */}
                  <div className={SUPERVISION_PANEL_COLUMN_CLASS}>
                    <Card className="flex flex-col flex-1 min-h-0 h-full rounded-2xl shadow-sm border overflow-hidden">
                      <CardHeader className="pb-3 pt-4 px-5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <CardTitle className="text-sm font-bold flex items-center gap-2">
                            <CreditCard size={15} className="text-rose-500" />
                            Cartera de deudores
                          </CardTitle>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[10px] px-2 gap-1"
                            disabled={
                              !selectedVendedorNombre ||
                              loadingCuentas ||
                              !cuentasData?.vendedores?.length
                            }
                            title="Abre hoja A4 para imprimir y entregar al vendedor"
                            onClick={() => cuentasData && openCuentasCorrientesPrintWindow(cuentasData)}
                          >
                            <Printer size={10} />
                            Hoja vendedor
                          </Button>
                        </div>
                      </CardHeader>
                      <Separator />
                      <CardContent className="p-0 flex flex-col flex-1 min-h-0">
                        {!selectedVendedorNombre ? (
                          <div className="flex flex-1 flex-col items-center justify-center py-14 gap-3 text-center px-6 min-h-0">
                            <div className="size-12 rounded-2xl bg-rose-500/8 flex items-center justify-center">
                              <CreditCard size={22} className="text-rose-500" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-foreground">Seleccioná un vendedor</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                La cartera y el perfil del deudor se cargan al seleccionar un vendedor
                              </p>
                            </div>
                          </div>
                        ) : loadingCuentas ? (
                          <div className="p-4 flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto">
                            {Array.from({ length: 6 }).map((_, i) => (
                              <Skeleton key={i} className="h-9 w-full rounded" />
                            ))}
                          </div>
                        ) : clientesOrdenados.length === 0 ? (
                          <p className="text-center text-xs text-muted-foreground py-8 flex-1 flex items-center justify-center min-h-0">
                            Sin datos de CC disponibles
                          </p>
                        ) : (
                          <div className={SUPERVISION_PANEL_BODY_SCROLL_CLASS}>
                            <Table>
                              <TableHeader>
                                <TableRow className="text-[10px]">
                                  <TableHead className="pl-5 w-[38%]">Cliente</TableHead>
                                  <TableHead
                                    className="text-right cursor-pointer select-none hover:text-foreground"
                                    onClick={() => toggleCCSort("deuda")}
                                  >
                                    Deuda <CCSortIndicator active={ccSort === "deuda"} dir={ccSortDir} />
                                  </TableHead>
                                  <TableHead
                                    className="text-right cursor-pointer select-none hover:text-foreground"
                                    onClick={() => toggleCCSort("antiguedad")}
                                  >
                                    <span className="inline-flex items-center gap-0.5">
                                      Antig.
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <HelpCircle size={9} className="text-muted-foreground/60" />
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="max-w-[200px] text-[11px]">
                                          Días desde la última compra (padrón) o mora CHESS si no hay fecha
                                        </TooltipContent>
                                      </Tooltip>
                                      {" "}<CCSortIndicator active={ccSort === "antiguedad"} dir={ccSortDir} />
                                    </span>
                                  </TableHead>
                                  <TableHead
                                    className="text-right cursor-pointer select-none hover:text-foreground pr-4"
                                    onClick={() => toggleCCSort("comprobantes")}
                                  >
                                    <span className="inline-flex items-center justify-end gap-0.5">
                                      <Hash size={9} />
                                      Cbtés.
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <HelpCircle size={9} className="text-muted-foreground/60" />
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="max-w-[200px] text-[11px]">
                                          Cantidad de comprobantes impagos según CHESS
                                        </TooltipContent>
                                      </Tooltip>
                                      {" "}<CCSortIndicator active={ccSort === "comprobantes"} dir={ccSortDir} />
                                    </span>
                                  </TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {clientesOrdenados.map((c, idx) => {
                                  const erp = c.id_cliente_erp ?? null;
                                  const isSelected = !!erp && erp === selectedClienteErp;
                                  return (
                                    <TableRow
                                      key={`${c.cliente ?? "x"}-${idx}`}
                                      className={cn(
                                        "text-xs cursor-pointer transition-colors",
                                        isSelected
                                          ? "bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-50"
                                          : "hover:bg-muted/40",
                                      )}
                                      onClick={() => setSelectedClienteErp(erp !== selectedClienteErp ? erp : null)}
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
                                      <TableCell
                                        className="text-right text-muted-foreground tabular-nums"
                                      >
                                        {c.antiguedad != null ? (
                                          <span className={c.antiguedad_desde_padron ? "text-amber-700 font-medium" : ""}>
                                            {c.antiguedad}d
                                          </span>
                                        ) : "—"}
                                      </TableCell>
                                      <TableCell className="text-right text-muted-foreground font-mono text-[11px] pr-4">
                                        <span className="inline-flex items-center justify-end gap-1">
                                          {c.cantidad_comprobantes ?? "—"}
                                          {c.rango_antiguedad && (
                                            <span
                                              className={`inline-flex shrink-0 items-center justify-center text-[9px] leading-none px-1 py-0.5 rounded border font-semibold ${rangoBadgeClass(c.rango_antiguedad)}`}
                                            >
                                              {formatRangoBadgeLabel(c.rango_antiguedad)}
                                            </span>
                                          )}
                                        </span>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* ── Derecha 60%: Panel de seguimiento del deudor ───────── */}
                  <DeudorProfilePanel
                    distId={distId}
                    idClienteErp={selectedClienteErp}
                    className={SUPERVISION_PANEL_COLUMN_CLASS}
                  />

                </div>
                </SupervisionRevealItem>
                </SupervisionReveal>
                )}

              </div>
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
