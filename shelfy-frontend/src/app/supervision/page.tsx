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
  mesEnLetras,
} from "@/lib/cuentasCorrientes";
import { CcDeudaResumenPanel } from "@/components/supervision/CcDeudaResumenPanel";
import { AltasCompradoresPanel } from "@/components/supervision/AltasCompradoresPanel";
import { useSupervisionPanelStore } from "@/store/useSupervisionPanelStore";
import { useSupervisionPanelData } from "@/hooks/useSupervisionPanelData";
import { AnimatedKpiCard } from "@/components/supervision/AnimatedKpiCard";
import { SyncStatusBadges } from "@/components/supervision/SyncStatusBadges";
import {
  SupervisionPageLoadingShell,
} from "@/components/supervision/SupervisionPanelSkeleton";
import { SupervisionReveal, SupervisionRevealItem } from "@/components/supervision/SupervisionReveal";
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
  CreditCard, Users, Map as MapIcon, Printer,
  Hash, TrendingUp, ShoppingCart,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  SUPERVISION_PANEL_SCROLL_MIN_H,
  SUPERVISION_SPLIT_PANEL_MIN_H,
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

  // ── Zustand store (persisted filters) ───────────────────────────────────────
  const {
    selectedSucursal,
    selectedVendedorNombre,
    altasMes,
    ccSort,
    ccSortDir,
    setSelectedSucursal,
    setSelectedVendedorNombre,
    toggleCCSort,
    ccResumenExpanded,
    toggleCcResumen,
  } = useSupervisionPanelStore();

  const isAllowed = !!user && ALLOWED_ROLES.includes(user.rol);

  useEffect(() => {
    if (user && !isAllowed) router.replace("/dashboard");
  }, [user, isAllowed, router]);

  const sucursalParam = selectedSucursal === "__all__" ? undefined : selectedSucursal;

  const {
    vendedores,
    vendedoresLoading,
    vendedoresFetching,
    vendedoresStatsPending,
    selectedVendedorObj,
    selectedVendedorId,
    cuentasData,
    loadingCuentas,
    fetchingCuentas,
    syncStatus,
    altasData,
    loadingAltas,
    fetchingAltas,
  } = useSupervisionPanelData(distId, selectedSucursal, selectedVendedorNombre, altasMes);

  const totalAltas = altasData?.total_altas ?? 0;
  const totalCompradores = altasData?.total_compradores ?? 0;
  const isRefreshing = vendedoresFetching || fetchingCuentas || fetchingAltas;

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

  const deudaFromClientes = useMemo(
    () => clientesOrdenados.reduce((s, c) => s + (c.deuda_total ?? 0), 0),
    [clientesOrdenados],
  );
  const deudaTotalDisplay =
    clientesOrdenados.length > 0 ? deudaFromClientes : (cuentasData?.metadatos?.total_deuda ?? 0);
  const clientesDeudoresDisplay =
    clientesOrdenados.length > 0
      ? clientesOrdenados.length
      : (cuentasData?.metadatos?.clientes_deudores ?? 0);

  const deudaPorAntiguedad = useMemo(
    () => computeDeudaPorAntiguedad(clientesOrdenados),
    [clientesOrdenados],
  );
  const showCcResumen =
    !!selectedVendedorNombre &&
    !loadingCuentas &&
    clientesOrdenados.length > 0 &&
    deudaPorAntiguedad.some((r) => r.monto > 0);

  const padronLastUpdated = syncStatus?.padron?.last_updated ?? null;
  const ccLastUpdated = syncStatus?.cuentas_corrientes?.last_updated ?? null;
  const altasMesLabel = mesEnLetras(altasMes);

  // Deep link href para "Ver Mapa"
  const mapHref = selectedVendedorId
    ? `/modo-mapa?vendedorId=${selectedVendedorId}${selectedSucursal !== "__all__" ? `&sucursal=${encodeURIComponent(selectedSucursal)}` : ""}`
    : "/modo-mapa";

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!isAllowed) return null;

  return (
    <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <BottomNav />

      <div className="flex flex-col flex-1 min-w-0">
        <Topbar title="Supervisión" />

        <main className="flex-1 overflow-auto pb-24 md:pb-8">
          <div className="max-w-[1400px] mx-auto flex flex-col gap-0">

            {/* ── NIVEL 1: Sticky subheader ─────────────────────────────────── */}
            <div className="sticky top-0 z-20 bg-[var(--shelfy-bg)]/90 backdrop-blur-md border-b border-[var(--shelfy-border)] px-4 md:px-6 py-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <h2 className="text-sm font-black text-[var(--shelfy-text)] tracking-tight flex items-center gap-2">
                    Panel Analítico
                    {isRefreshing && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--shelfy-muted)]" />
                    )}
                  </h2>
                  {syncStatus && (
                    <SyncStatusBadges
                      padronLastUpdated={padronLastUpdated}
                      ccLastUpdated={ccLastUpdated}
                    />
                  )}
                </div>

                {/* ── NIVEL 2: Filtros compactos ─────────────────────────── */}
                <div className="flex items-center gap-2 flex-wrap">
                  {sucursales.length > 0 && (
                    <Select value={selectedSucursal} onValueChange={setSelectedSucursal}>
                      <SelectTrigger className="h-8 text-xs w-40">
                        <SelectValue placeholder="Sucursal" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Todas las sucursales</SelectItem>
                        {sucursales.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  <Select
                    value={selectedVendedorNombre ?? "__all__"}
                    onValueChange={(v) => setSelectedVendedorNombre(v === "__all__" ? null : v)}
                  >
                    <SelectTrigger className="h-8 text-xs w-44">
                      <SelectValue placeholder="Vendedor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos los vendedores</SelectItem>
                      {vendedorOptions.map((nombre) => (
                        <SelectItem key={nombre} value={nombre}>{nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" asChild>
                    <Link href={mapHref}>
                      <MapIcon size={13} />
                      Ver Mapa
                    </Link>
                  </Button>
                </div>
              </div>
            </div>

            <div className="p-4 md:p-6 flex flex-col gap-5">

              {vendedoresLoading ? (
                <SupervisionPageLoadingShell />
              ) : (
              <SupervisionReveal animate={!fetchingCuentas || !!cuentasData}>
              {/* ── NIVEL 3: KPIs globales (4 cards animadas) ─────────────── */}
              <SupervisionRevealItem
                className={cn(
                  showCcResumen && ccResumenExpanded && "mb-5 lg:mb-7",
                )}
              >
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="flex flex-col min-w-0">
                  <AnimatedKpiCard
                    label="Deuda Total"
                    value={deudaTotalDisplay}
                    formatter={fmt$$}
                    icon={CreditCard}
                    color="rose"
                    loading={loadingCuentas && !!selectedVendedorNombre}
                    delay={0}
                    expandable={showCcResumen}
                    expanded={ccResumenExpanded}
                    onToggle={toggleCcResumen}
                    expandHint="Ver desglose por antigüedad"
                  />
                  {showCcResumen && (
                    <CcDeudaResumenPanel
                      headerless
                      variant="rose"
                      antiguedad={deudaPorAntiguedad}
                      className="mt-1"
                    />
                  )}
                </div>
                <AnimatedKpiCard
                  label="Clientes Deudores"
                  value={clientesDeudoresDisplay}
                  icon={Users}
                  color="amber"
                  loading={loadingCuentas && !!selectedVendedorNombre}
                  delay={0.06}
                />
                <AnimatedKpiCard
                  label={`Altas en ${altasMesLabel}`}
                  value={totalAltas}
                  icon={TrendingUp}
                  color="emerald"
                  loading={loadingAltas && !!selectedVendedorId}
                  delay={0.12}
                />
                <AnimatedKpiCard
                  label={`Compradores en ${altasMesLabel}`}
                  value={totalCompradores}
                  icon={ShoppingCart}
                  color="blue"
                  loading={loadingAltas && !!selectedVendedorId}
                  delay={0.18}
                />
              </div>
              </SupervisionRevealItem>

              {/* ── NIVEL 4: Paneles 50/50 ───────────────────────────────── */}
              <SupervisionRevealItem>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">

                {/* ── Izquierda: Cuentas Corrientes ──────────────────────── */}
                <div className={cn("flex flex-col h-full", SUPERVISION_SPLIT_PANEL_MIN_H)}>
                  <Card className="flex flex-col flex-1 min-h-0 h-full rounded-2xl shadow-sm border">
                    <CardHeader className="pb-3 pt-4 px-5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <CreditCard size={15} className="text-rose-500" />
                          Cuentas Corrientes
                        </CardTitle>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[10px] px-2 gap-1"
                            disabled={
                              !selectedVendedorNombre ||
                              loadingCuentas ||
                              !cuentasData?.vendedores?.length
                            }
                            title="Abre una hoja A4 con el detalle de deudores para imprimir y entregar al vendedor"
                            onClick={() => cuentasData && openCuentasCorrientesPrintWindow(cuentasData)}
                          >
                            <Printer size={10} />
                            Hoja vendedor
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <Separator />
                    <CardContent className="p-0 flex flex-col flex-1 min-h-0">
                      {!selectedVendedorNombre ? (
                        <div className="flex flex-1 flex-col items-center justify-center py-14 gap-3 text-center px-6 min-h-[420px]">
                          <div className="size-12 rounded-2xl bg-rose-500/8 flex items-center justify-center">
                            <CreditCard size={22} className="text-rose-500" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground">Seleccioná un vendedor</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Seleccioná un vendedor para ver su cartera y movimiento comercial
                            </p>
                          </div>
                        </div>
                      ) : loadingCuentas ? (
                        <div className={cn("p-4 flex flex-col gap-2 flex-1", SUPERVISION_PANEL_SCROLL_MIN_H)}>
                          {Array.from({ length: 6 }).map((_, i) => (
                            <Skeleton key={i} className="h-9 w-full rounded" />
                          ))}
                        </div>
                      ) : clientesOrdenados.length === 0 ? (
                        <p className={cn("text-center text-xs text-muted-foreground py-8 flex-1 flex items-center justify-center", SUPERVISION_PANEL_SCROLL_MIN_H)}>
                          Sin datos de CC disponibles
                        </p>
                      ) : (
                        <div className={cn("flex-1 min-h-0 overflow-auto", SUPERVISION_PANEL_SCROLL_MIN_H)}>
                          <Table>
                            <TableHeader>
                              <TableRow className="text-[10px]">
                                <TableHead className="pl-5 w-[36%]">Cliente</TableHead>
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
                                  Antig. <CCSortIndicator active={ccSort === "antiguedad"} dir={ccSortDir} />
                                </TableHead>
                                <TableHead
                                  className="text-right cursor-pointer select-none hover:text-foreground"
                                  onClick={() => toggleCCSort("comprobantes")}
                                >
                                  <span className="inline-flex items-center justify-end gap-0.5">
                                    <Hash size={9} />
                                    Cbtés. <CCSortIndicator active={ccSort === "comprobantes"} dir={ccSortDir} />
                                  </span>
                                </TableHead>
                                <TableHead
                                  className="text-right cursor-pointer select-none hover:text-foreground pr-5"
                                  onClick={() => toggleCCSort("ultima_compra")}
                                >
                                  Últ. Compra <CCSortIndicator active={ccSort === "ultima_compra"} dir={ccSortDir} />
                                </TableHead>
                                <TableHead className="text-right pr-5 min-w-[4.25rem] w-[4.25rem]">Rango</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {clientesOrdenados.map((c, idx) => (
                                <TableRow key={`${c.cliente ?? "x"}-${idx}`} className="text-xs">
                                  <TableCell className="pl-5 font-medium truncate max-w-[130px]">
                                    {c.cliente ?? "—"}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-[11px] text-rose-600 font-semibold">
                                    {fmt$$(c.deuda_total)}
                                  </TableCell>
                                  <TableCell className="text-right text-muted-foreground">
                                    {c.antiguedad != null ? `${c.antiguedad}d` : "—"}
                                  </TableCell>
                                  <TableCell className="text-right text-muted-foreground font-mono text-[11px]">
                                    {c.cantidad_comprobantes ?? "—"}
                                  </TableCell>
                                  <TableCell className="text-right text-muted-foreground text-[10px] whitespace-nowrap">
                                    {c.fecha_ultima_compra
                                      ? new Date(c.fecha_ultima_compra + "T12:00:00Z").toLocaleDateString("es-AR")
                                      : "—"}
                                  </TableCell>
                                  <TableCell className="text-right pr-5 align-middle">
                                    {c.rango_antiguedad ? (
                                      <span
                                        title={c.rango_antiguedad}
                                        className={`inline-flex shrink-0 whitespace-nowrap items-center justify-center text-[10px] leading-none px-1.5 py-1 rounded border font-semibold tabular-nums ${rangoBadgeClass(c.rango_antiguedad)}`}
                                      >
                                        {formatRangoBadgeLabel(c.rango_antiguedad)}
                                      </span>
                                    ) : "—"}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <AltasCompradoresPanel
                  distId={distId}
                  vendedorId={selectedVendedorId}
                  layout="tabs"
                  className={cn("h-full", SUPERVISION_SPLIT_PANEL_MIN_H)}
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
  );
}
