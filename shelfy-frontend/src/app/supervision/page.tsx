"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
  ccRowMatchesVendedor,
  rangoBadgeClass,
  sortClientesCC,
  mesEnLetras,
} from "@/lib/cuentasCorrientes";
import { supervisionPanelKeys } from "@/lib/query-keys";
import { useSupervisionPanelStore } from "@/store/useSupervisionPanelStore";
import { AnimatedKpiCard } from "@/components/supervision/AnimatedKpiCard";
import { SyncStatusBadges } from "@/components/supervision/SyncStatusBadges";
import { PdvMovimientoCard } from "@/components/supervision/PdvMovimientoCard";
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
  Hash, Target, TrendingUp, ShoppingCart,
  LayoutList, Store, ArrowUpFromLine,
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
      selectedVendedorId ?? "__none__",
    ] as const,
    queryFn: async () => {
      const scoped = await fetchCuentasSupervision(
        distId,
        sucursalParam,
        undefined,
        selectedVendedorNombre ?? undefined,
        selectedVendedorId,
      );
      const hasClientes = (scoped.vendedores ?? []).some((v) => (v.clientes?.length ?? 0) > 0);
      if (hasClientes || !selectedVendedorId) return scoped;
      // API legacy filtraba solo por nombre (AID ≠ GONZALEZ en CHESS): traer sucursal completa
      return fetchCuentasSupervision(distId, sucursalParam);
    },
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
    queryFn: () => fetchPdvsMovimiento(distId!, selectedVendedorId!, altasMes, "alta,comprador"),
    enabled: !!distId && !!selectedVendedorId,
    staleTime: 5 * 60_000,
  });

  // ── Derived ─────────────────────────────────────────────────────────────────
  const totalAltas       = altasData?.total_altas ?? 0;
  const totalCompradores = altasData?.total_compradores ?? 0;

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

  const padronLastUpdated = syncStatus?.padron?.last_updated ?? null;
  const ccLastUpdated = syncStatus?.cuentas_corrientes?.last_updated ?? null;
  const altasMesLabel = mesEnLetras(altasMes);

  // Tab de filtro para el panel derecho
  type AltasTab = "todos" | "alta" | "comprador";
  const [altasTab, setAltasTab] = useState<AltasTab>("todos");

  const itemsFiltrados = useMemo(() => {
    const items = altasData?.items ?? [];
    if (altasTab === "alta") return items.filter((i) => i.categoria === "alta");
    if (altasTab === "comprador") return items.filter((i) => i.categoria === "comprador");
    return items;
  }, [altasData, altasTab]);

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
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <AnimatedKpiCard
                  label="Deuda Total"
                  value={deudaTotalDisplay}
                  formatter={fmt$$}
                  icon={CreditCard}
                  color="rose"
                  loading={loadingCuentas && !!selectedVendedorNombre}
                  delay={0}
                />
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

              {/* ── NIVEL 4: Paneles 50/50 ───────────────────────────────── */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

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
                                <TableHead className="text-right pr-5 w-[72px]">Rango</TableHead>
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
                                      <span
                                        className={`inline-flex text-[10px] px-1.5 py-0.5 rounded border font-medium ${rangoBadgeClass(c.rango_antiguedad)}`}
                                      >
                                        {c.rango_antiguedad}
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

                {/* ── Derecha: Altas y Compradores ───────────────────────── */}
                <div className="rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] overflow-hidden shadow-sm flex flex-col">

                  {/* Panel header */}
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--shelfy-border)]/50">
                    <div className="flex items-center gap-2">
                      <Target size={14} className="text-violet-500" />
                      <span className="text-sm font-bold text-[var(--shelfy-text)]">Altas y Compradores</span>
                    </div>
                    <Select value={altasMes} onValueChange={(v) => { setAltasMes(v); setAltasTab("todos"); }}>
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
                        className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6"
                      >
                        <div className="size-12 rounded-2xl bg-violet-500/8 flex items-center justify-center">
                          <Target size={22} className="text-violet-500" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[var(--shelfy-text)]">Seleccioná un vendedor</p>
                          <p className="text-xs text-[var(--shelfy-muted)] mt-0.5">
                            Elegí un vendedor para ver sus altas y compradores del mes
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
                        {Array.from({ length: 6 }).map((_, i) => (
                          <Skeleton key={i} className="h-14 w-full rounded-lg" />
                        ))}
                      </motion.div>
                    ) : !altasData?.items?.length ? (
                      <motion.div
                        key={`empty-${altasMes}-${selectedVendedorId}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex items-center justify-center py-12 text-sm text-[var(--shelfy-muted)]"
                      >
                        Sin altas ni compradores en {altasMesLabel}
                      </motion.div>
                    ) : (
                      <motion.div
                        key={`data-${altasMes}-${selectedVendedorId}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex flex-col"
                      >
                        {/* KPI counts + tabs */}
                        <div className="border-b border-[var(--shelfy-border)]/40">
                          {/* Conteos */}
                          <div className="grid grid-cols-2 divide-x divide-[var(--shelfy-border)]/30">
                            <div className="px-5 py-3">
                              <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide mb-0.5 flex items-center gap-1">
                                <ArrowUpFromLine size={9} className="text-emerald-500" />
                                Altas en {altasMesLabel}
                              </p>
                              <p className="text-xl font-black text-emerald-500 tabular-nums leading-none">{altasData.total_altas}</p>
                            </div>
                            <div className="px-5 py-3">
                              <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide mb-0.5 flex items-center gap-1">
                                <Store size={9} className="text-violet-500" />
                                Compradores en {altasMesLabel}
                              </p>
                              <p className="text-xl font-black text-violet-500 tabular-nums leading-none">{altasData.total_compradores}</p>
                            </div>
                          </div>

                          {/* Tabs filtro */}
                          <div className="flex gap-1 px-4 pb-2.5 pt-1">
                            {([
                              { key: "todos", label: "Todos", icon: LayoutList, count: altasData.items.length },
                              { key: "alta", label: "Altas", icon: ArrowUpFromLine, count: altasData.total_altas },
                              { key: "comprador", label: "Compradores", icon: Store, count: altasData.total_compradores },
                            ] as const).map(({ key, label, icon: Icon, count }) => (
                              <button
                                key={key}
                                onClick={() => setAltasTab(key)}
                                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold transition-all ${
                                  altasTab === key
                                    ? key === "alta"
                                      ? "bg-emerald-500 text-white"
                                      : key === "comprador"
                                      ? "bg-violet-500 text-white"
                                      : "bg-[var(--shelfy-text)] text-white"
                                    : "bg-black/5 text-muted-foreground hover:bg-black/8"
                                }`}
                              >
                                <Icon size={10} />
                                {label}
                                <span className={`text-[10px] font-mono ${altasTab === key ? "opacity-80" : "opacity-60"}`}>
                                  {count}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Lista con stagger */}
                        <div className="overflow-y-auto max-h-[500px]">
                          <AnimatePresence mode="wait">
                            {itemsFiltrados.length === 0 ? (
                              <motion.p
                                key="empty-tab"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="text-center text-xs text-muted-foreground py-8"
                              >
                                Sin registros en esta categoría
                              </motion.p>
                            ) : (
                              <motion.div
                                key={altasTab}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.15 }}
                              >
                                {itemsFiltrados.map((item, i) => (
                                  <PdvMovimientoCard
                                    key={`${item.id_cliente_erp ?? i}-${altasTab}-${i}`}
                                    item={item}
                                    index={i}
                                  />
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>
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
