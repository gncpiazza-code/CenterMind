"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchCuentasSupervision,
  fetchSyncStatus,
  fetchVendedoresSupervision,
  fetchPdvsMovimiento,
  type VendedorSupervision,
  type VendedorCuentas,
  type PdvsMovimientoResponse,
} from "@/lib/api";
import { openCuentasCorrientesPrintWindow } from "@/lib/printCuentasCorrientes";
import { supervisionPanelKeys } from "@/lib/query-keys";
import { useSupervisionPanelStore } from "@/store/useSupervisionPanelStore";
import { AnimatedKpiCard } from "@/components/supervision/AnimatedKpiCard";
import { SyncStatusBadges } from "@/components/supervision/SyncStatusBadges";
import { PdvMovimientoCard } from "@/components/supervision/PdvMovimientoCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
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
  CreditCard, Users, Clock, Map as MapIcon, Printer,
  ArrowUpDown, Hash, Target, TrendingUp, ShoppingCart,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

const ALLOWED_ROLES = ["superadmin", "admin", "supervisor", "directorio"];

function fmt$$(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);
}

// Genera los últimos N meses como opciones YYYY-MM
function buildMesOptions(count = 12): { value: string; label: string }[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const value = d.toISOString().slice(0, 7);
    const label = d.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
    return { value, label: label.charAt(0).toUpperCase() + label.slice(1) };
  });
}

const MES_OPTIONS = buildMesOptions(12);

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
    setAltasMes,
    toggleCCSort,
  } = useSupervisionPanelStore();

  const isAllowed = !!user && ALLOWED_ROLES.includes(user.rol);

  useEffect(() => {
    if (user && !isAllowed) router.replace("/dashboard");
  }, [user, isAllowed, router]);

  // ── TanStack Query ───────────────────────────────────────────────────────────
  const { data: vendedores = [] } = useQuery<VendedorSupervision[]>({
    queryKey: supervisionPanelKeys.vendedores(distId),
    queryFn: () => fetchVendedoresSupervision(distId),
    enabled: !!distId,
    staleTime: 10 * 60_000,
  });

  const sucursalParam = selectedSucursal === "__all__" ? undefined : selectedSucursal;

  const selectedVendedorObj = useMemo(
    () => vendedores.find((v) => v.nombre_vendedor === selectedVendedorNombre) ?? null,
    [vendedores, selectedVendedorNombre],
  );
  const selectedVendedorId = selectedVendedorObj?.id_vendedor ?? null;

  const { data: cuentasData, isLoading: loadingCuentas } = useQuery({
    queryKey: [
      ...supervisionPanelKeys.cuentas(distId, sucursalParam),
      selectedVendedorNombre ?? "__none__",
    ] as const,
    queryFn: () =>
      fetchCuentasSupervision(distId, sucursalParam, undefined, selectedVendedorNombre ?? undefined),
    enabled: !!distId && !!selectedVendedorNombre,
    staleTime: 5 * 60_000,
  });

  const { data: syncStatus } = useQuery({
    queryKey: supervisionPanelKeys.syncStatus(distId),
    queryFn: () => fetchSyncStatus(distId),
    enabled: !!distId,
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  const { data: altasData, isLoading: loadingAltas } = useQuery<PdvsMovimientoResponse>({
    queryKey: supervisionPanelKeys.altas(distId, selectedVendedorId, altasMes),
    queryFn: () => fetchPdvsMovimiento(distId!, selectedVendedorId!, altasMes),
    enabled: !!distId && !!selectedVendedorId,
    staleTime: 5 * 60_000,
  });

  // ── Derived ─────────────────────────────────────────────────────────────────
  const deudaTotal       = cuentasData?.metadatos?.total_deuda ?? 0;
  const clientesDeudores = cuentasData?.metadatos?.clientes_deudores ?? 0;
  const totalAltas       = altasData?.total_altas ?? 0;
  const totalActivaciones = altasData?.total_activaciones ?? 0;

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
    const extractCCName = (nombre: string) => {
      const idx = nombre.indexOf(" - ");
      return idx >= 0 ? nombre.slice(idx + 3).trim().toUpperCase() : nombre.trim().toUpperCase();
    };
    const vendedorUpper = (selectedVendedorNombre || "").trim().toUpperCase();
    const vendor =
      cuentasFiltradas.find((v) => extractCCName(v.vendedor) === vendedorUpper) ??
      cuentasFiltradas[0];
    const clientes = vendor?.clientes ?? [];
    return [...clientes].sort((a, b) => {
      const dir = ccSortDir === "desc" ? -1 : 1;
      if (ccSort === "deuda") return dir * (b.deuda_total - a.deuda_total);
      return dir * ((b.antiguedad ?? 0) - (a.antiguedad ?? 0));
    });
  }, [cuentasFiltradas, selectedVendedorNombre, ccSort, ccSortDir]);

  const padronLastUpdated = syncStatus?.padron?.last_updated ?? null;
  const ccLastUpdated = syncStatus?.cuentas_corrientes?.last_updated ?? null;

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
                  <h2 className="text-sm font-black text-[var(--shelfy-text)] tracking-tight">
                    Panel Analítico
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

              {/* ── NIVEL 3: KPIs globales (4 cards animadas) ─────────────── */}
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                <AnimatedKpiCard
                  label="Deuda Total"
                  value={deudaTotal}
                  formatter={fmt$$}
                  icon={CreditCard}
                  color="rose"
                  loading={loadingCuentas && !!selectedVendedorNombre}
                  delay={0}
                />
                <AnimatedKpiCard
                  label="Clientes Deudores"
                  value={clientesDeudores}
                  icon={Users}
                  color="amber"
                  loading={loadingCuentas && !!selectedVendedorNombre}
                  delay={0.06}
                />
                <AnimatedKpiCard
                  label={`Altas en ${altasMes}`}
                  value={totalAltas}
                  icon={TrendingUp}
                  color="emerald"
                  loading={loadingAltas && !!selectedVendedorId}
                  delay={0.12}
                />
                <AnimatedKpiCard
                  label={`Activaciones en ${altasMes}`}
                  value={totalActivaciones}
                  icon={ShoppingCart}
                  color="blue"
                  loading={loadingAltas && !!selectedVendedorId}
                  delay={0.18}
                />
              </div>

              {/* ── NIVEL 4: Paneles 50/50 ───────────────────────────────── */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

                {/* ── Izquierda: Cuentas Corrientes ──────────────────────── */}
                <div className="flex flex-col gap-4">
                  <Card>
                    <CardHeader className="pb-3 pt-4 px-5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <CreditCard size={15} className="text-rose-500" />
                          Cuentas Corrientes
                        </CardTitle>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {cuentasData?.fecha && (
                            <Badge variant="outline" className="text-[10px] gap-1 border-[var(--shelfy-border)]">
                              <Clock size={9} />
                              {new Date(cuentasData.fecha).toLocaleDateString("es-AR")}
                            </Badge>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[10px] px-2 gap-1"
                            onClick={() => toggleCCSort("deuda")}
                          >
                            <ArrowUpDown size={10} />
                            Deuda
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[10px] px-2 gap-1"
                            onClick={() => toggleCCSort("antiguedad")}
                          >
                            <ArrowUpDown size={10} />
                            Antigüedad
                          </Button>
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
                    <CardContent className="p-0">
                      {!selectedVendedorNombre ? (
                        <div className="flex flex-col items-center justify-center py-14 gap-3 text-center px-6">
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
                        <div className="p-4 flex flex-col gap-2">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} className="h-9 w-full rounded" />
                          ))}
                        </div>
                      ) : clientesOrdenados.length === 0 ? (
                        <p className="text-center text-xs text-muted-foreground py-8">
                          Sin datos de CC disponibles
                        </p>
                      ) : (
                        <div className="overflow-auto max-h-[480px]">
                          <Table>
                            <TableHeader>
                              <TableRow className="text-[10px]">
                                <TableHead className="pl-5 w-[36%]">Cliente</TableHead>
                                <TableHead className="text-right">Deuda</TableHead>
                                <TableHead className="text-right">Antig.</TableHead>
                                <TableHead className="text-right">
                                  <span className="flex items-center justify-end gap-0.5">
                                    <Hash size={9} />Cbtés.
                                  </span>
                                </TableHead>
                                <TableHead className="text-right">Últ. Compra</TableHead>
                                <TableHead className="text-right pr-5">Rango</TableHead>
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
                                  <TableCell className="text-right pr-5">
                                    {c.rango_antiguedad ? (
                                      <Badge variant="outline" className="text-[10px]">
                                        {c.rango_antiguedad}
                                      </Badge>
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

                {/* ── Derecha: Altas y Compradores ───────────────────────── */}
                <div className="rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] overflow-hidden shadow-sm flex flex-col min-h-[400px]">

                  {/* Panel header */}
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--shelfy-border)]/50">
                    <div className="flex items-center gap-2">
                      <Target size={14} className="text-violet-500" />
                      <span className="text-sm font-bold text-[var(--shelfy-text)]">Altas y Compradores</span>
                    </div>
                    <Select value={altasMes} onValueChange={setAltasMes}>
                      <SelectTrigger className="h-7 text-xs w-44 border-[var(--shelfy-border)]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MES_OPTIONS.map(({ value, label }) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Panel body con crossfade al cambiar mes/vendedor */}
                  <AnimatePresence mode="wait">
                    {!selectedVendedorId ? (
                      <motion.div
                        key="empty-vendor"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex-1 flex flex-col items-center justify-center py-14 gap-3 text-center px-6"
                      >
                        <div className="size-12 rounded-2xl bg-violet-500/8 flex items-center justify-center">
                          <Target size={22} className="text-violet-500" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[var(--shelfy-text)]">Seleccioná un vendedor</p>
                          <p className="text-xs text-[var(--shelfy-muted)] mt-0.5">
                            Elegí un vendedor para ver sus altas y compradores
                          </p>
                        </div>
                      </motion.div>
                    ) : loadingAltas ? (
                      <motion.div
                        key="loading-altas"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="p-4 flex flex-col gap-2"
                      >
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Skeleton key={i} className="h-12 w-full rounded-lg" />
                        ))}
                      </motion.div>
                    ) : !altasData?.items?.length ? (
                      <motion.div
                        key={`empty-${altasMes}-${selectedVendedorId}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex-1 flex items-center justify-center py-10 text-sm text-[var(--shelfy-muted)]"
                      >
                        Sin altas ni compradores en {altasMes}
                      </motion.div>
                    ) : (
                      <motion.div
                        key={`data-${altasMes}-${selectedVendedorId}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex-1 overflow-y-auto"
                      >
                        {/* Summary counts */}
                        <div className="grid grid-cols-2 divide-x divide-[var(--shelfy-border)]/40 border-b border-[var(--shelfy-border)]/30">
                          <div className="px-4 py-2.5">
                            <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide mb-0.5">Altas</p>
                            <p className="text-base font-bold text-emerald-500 tabular-nums">{altasData.total_altas}</p>
                          </div>
                          <div className="px-4 py-2.5">
                            <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide mb-0.5">Compradores</p>
                            <p className="text-base font-bold text-blue-500 tabular-nums">{altasData.total_activaciones}</p>
                          </div>
                        </div>

                        {/* Lista con stagger via PdvMovimientoCard */}
                        <div className="divide-y divide-[var(--shelfy-border)]/30">
                          {altasData.items.map((item, i) => (
                            <PdvMovimientoCard key={`${item.id_cliente_erp ?? i}-${i}`} item={item} index={i} />
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
