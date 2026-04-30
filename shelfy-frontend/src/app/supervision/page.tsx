"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchVentasSupervision,
  fetchCuentasSupervision,
  fetchSyncStatus,
  fetchVendedoresSupervision,
  type TransaccionVenta,
  type VendedorSupervision,
  type VendedorVentas,
  type VendedorCuentas,
} from "@/lib/api";
import { supervisionPanelKeys } from "@/lib/query-keys";
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
  TrendingUp, CreditCard, Users, Receipt, BarChart3, ChevronDown,
  Clock, AlertTriangle, CheckCircle2, Map as MapIcon,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { DatePicker } from "@/components/ui/date-picker";

const ALLOWED_ROLES = ["superadmin", "admin", "supervisor", "directorio"];

/** Ventana fija para el panel (sin selector de rango): N días que terminan en la fecha elegida por calendario. */
const PANEL_VENTAS_DIAS = 30;

function fmt$$(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtShort(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diffH = (now.getTime() - d.getTime()) / 3_600_000;
  const time = d.toLocaleTimeString("es-AR", {
    hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires",
  });
  const date = d.toLocaleDateString("es-AR", {
    day: "2-digit", month: "2-digit", timeZone: "America/Argentina/Buenos_Aires",
  });
  const todayDate = now.toLocaleDateString("es-AR", {
    day: "2-digit", month: "2-digit", timeZone: "America/Argentina/Buenos_Aires",
  });
  if (diffH < 24 && date === todayDate) return `hoy ${time}`;
  if (diffH < 48) return `ayer ${time}`;
  return `${date} ${time}`;
}

function isStale(iso: string | null): boolean {
  if (!iso) return true;
  return (Date.now() - new Date(iso).getTime()) > 12 * 3_600_000;
}

// ── KPI card ──────────────────────────────────────────────────────────────────
interface KpiCardProps {
  label: string;
  value: string;
  subtext?: string;
  icon: React.ElementType;
  color: "violet" | "emerald" | "amber" | "rose" | "blue";
  loading?: boolean;
}

const COLOR_MAP = {
  violet: { bg: "bg-violet-500/8", icon: "text-violet-600", border: "border-violet-200/60" },
  emerald: { bg: "bg-emerald-500/8", icon: "text-emerald-600", border: "border-emerald-200/60" },
  amber:  { bg: "bg-amber-500/8",  icon: "text-amber-600",  border: "border-amber-200/60" },
  rose:   { bg: "bg-rose-500/8",   icon: "text-rose-600",   border: "border-rose-200/60" },
  blue:   { bg: "bg-blue-500/8",   icon: "text-blue-600",   border: "border-blue-200/60" },
};

function KpiCard({ label, value, subtext, icon: Icon, color, loading }: KpiCardProps) {
  const c = COLOR_MAP[color];
  return (
    <Card className={`border ${c.border} bg-card`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1 min-w-0">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide truncate">
              {label}
            </p>
            {loading ? (
              <Skeleton className="h-7 w-28 rounded" />
            ) : (
              <p className="text-xl font-black text-foreground tracking-tight leading-none">{value}</p>
            )}
            {subtext && !loading && (
              <p className="text-[10px] text-muted-foreground mt-0.5">{subtext}</p>
            )}
          </div>
          <div className={`size-9 rounded-xl ${c.bg} flex items-center justify-center shrink-0`}>
            <Icon size={17} className={c.icon} strokeWidth={2} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SupervisionPage() {
  const { user, effectiveDistribuidorId } = useAuth();
  const router = useRouter();

  const [selectedSucursal, setSelectedSucursal] = useState<string>("__all__");
  const [selectedVendedor, setSelectedVendedor] = useState<string | null>(null);
  const [openVentasCliente, setOpenVentasCliente] = useState<string | null>(null);
  const [fechaCorte, setFechaCorte] = useState<string>(new Date().toISOString().slice(0, 10));
  const [draggingVendedor, setDraggingVendedor] = useState<string | null>(null);
  const [leftPanelDropActive, setLeftPanelDropActive] = useState(false);
  const isAllowed = !!user && ALLOWED_ROLES.includes(user.rol);
  const distId = effectiveDistribuidorId ?? 0;

  useEffect(() => {
    if (user && !isAllowed) {
      router.replace("/dashboard");
    }
  }, [user, isAllowed, router]);

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: vendedores = [] } = useQuery<VendedorSupervision[]>({
    queryKey: ['supervision-vendedores-panel', distId],
    queryFn: () => fetchVendedoresSupervision(distId),
    enabled: !!distId,
    staleTime: 10 * 60_000,
  });

  const sucursales = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const v of vendedores) {
      const s = v.sucursal_nombre;
      if (s && !seen.has(s)) { seen.add(s); list.push(s); }
    }
    return list.sort();
  }, [vendedores]);

  const sucursalParam = selectedSucursal === "__all__" ? undefined : selectedSucursal;

  const { data: ventasData, isLoading: loadingVentas } = useQuery({
    queryKey: [...supervisionPanelKeys.ventas(distId, PANEL_VENTAS_DIAS), fechaCorte || "", sucursalParam ?? "__all__"] as const,
    queryFn: () =>
      fetchVentasSupervision(distId, PANEL_VENTAS_DIAS, fechaCorte || undefined, sucursalParam),
    enabled: !!distId,
    staleTime: 5 * 60_000,
  });

  const { data: cuentasData, isLoading: loadingCuentas } = useQuery({
    queryKey: supervisionPanelKeys.cuentas(distId, sucursalParam).concat(fechaCorte) as unknown as readonly unknown[],
    queryFn: () => fetchCuentasSupervision(distId, sucursalParam, fechaCorte || undefined),
    enabled: !!distId,
    staleTime: 5 * 60_000,
  });

  const { data: syncStatus } = useQuery({
    queryKey: ['supervision-sync-status', distId],
    queryFn: () => fetchSyncStatus(distId),
    enabled: !!distId,
    staleTime: 2 * 60_000,
  });

  // ── Derived metrics (CC from server-filtered metadatos; ventas computed after client filter) ──
  const deudaTotal       = cuentasData?.metadatos?.total_deuda ?? 0;
  const clientesDeudores = cuentasData?.metadatos?.clientes_deudores ?? 0;

  const ventasFiltradas = useMemo(
    (): VendedorVentas[] => ventasData?.vendedores ?? [],
    [ventasData],
  );

  const vendedorOptions = useMemo(() => {
    const s = new Set<string>();
    for (const v of ventasFiltradas) s.add(v.vendedor);
    for (const c of cuentasData?.vendedores ?? []) s.add(c.vendedor);
    return [...s].sort((a, b) => a.localeCompare(b, "es"));
  }, [ventasFiltradas, cuentasData]);

  const vendedorVistaClientes =
    selectedVendedor ??
    ventasFiltradas[0]?.vendedor ??
    null;

  const ventasByCliente = useMemo(() => {
    const vendedor = ventasFiltradas.find((v) => v.vendedor === vendedorVistaClientes);
    if (!vendedor) return [];
    const bultosByCliente = new globalThis.Map(
      (vendedor.clientes_bultos ?? []).map((c) => [c.cliente.toLowerCase(), c]),
    );
    const grouped = new Map<string, { cliente: string; totalVenta: number; reciboMismoDia: number; transacciones: TransaccionVenta[] }>();
    for (const t of vendedor.transacciones ?? []) {
      const cliente = (t.cliente ?? "Cliente sin nombre").trim() || "Cliente sin nombre";
      const key = cliente.toLowerCase();
      if (!grouped.has(key)) grouped.set(key, { cliente, totalVenta: 0, reciboMismoDia: 0, transacciones: [] });
      const bucket = grouped.get(key)!;
      bucket.transacciones.push(t);
      const marker = `${t.tipo_operacion ?? ""} ${t.comprobante ?? ""}`.toLowerCase();
      if (marker.includes("recib")) {
        bucket.reciboMismoDia += t.monto_recaudado || t.monto_total || 0;
      } else {
        bucket.totalVenta += t.monto_total || 0;
      }
    }
    return [...grouped.values()]
      .map((g) => {
        const extra = bultosByCliente.get(g.cliente.toLowerCase());
        return {
          ...g,
          totalBultos: extra?.total_bultos ?? 0,
          topArticulos: extra?.top_articulos ?? [],
        };
      })
      .sort((a, b) => b.totalVenta - a.totalVenta);
  }, [ventasFiltradas, vendedorVistaClientes]);

  const ventasParaKpi = useMemo(() => {
    if (!selectedVendedor) return ventasFiltradas;
    return ventasFiltradas.filter((v) => v.vendedor === selectedVendedor);
  }, [ventasFiltradas, selectedVendedor]);
  const kpiFacturado   = ventasParaKpi.reduce((acc, v) => acc + v.monto_total, 0);
  const kpiRecaudado   = ventasParaKpi.reduce((acc, v) => acc + v.monto_recaudado, 0);
  const kpiFacturas    = ventasParaKpi.reduce((acc, v) => acc + v.total_facturas, 0);

  const cuentasFiltradas = useMemo((): VendedorCuentas[] => {
    // CC filtering is server-side (sucursal param passed to endpoint). metadatos also reflects filtered totals.
    return cuentasData?.vendedores ?? [];
  }, [cuentasData]);

  const ventasVentanaLabel = useMemo(() => {
    const d = new Date(`${fechaCorte}T12:00:00`);
    const fechaStr = d.toLocaleDateString("es-AR");
    return `Últimos ${PANEL_VENTAS_DIAS} d hasta ${fechaStr}`;
  }, [fechaCorte]);

  const vendedorResaltado = useMemo(() => {
    if (selectedVendedor !== null) return selectedVendedor;
    return ventasFiltradas[0]?.vendedor ?? null;
  }, [selectedVendedor, ventasFiltradas]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!isAllowed) return null;

  return (
    <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <BottomNav />

      <div className="flex flex-col flex-1 min-w-0">
        <Topbar title="Supervisión" />

        <main className="flex-1 p-4 md:p-6 pb-24 md:pb-8 overflow-auto">
          <div className="max-w-[1400px] mx-auto flex flex-col gap-5">

            {/* ── Page header ──────────────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-[var(--shelfy-text)] tracking-tight">
                  Panel Analítico
                </h2>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {syncStatus && (
                    <>
                      <Badge
                        variant="outline"
                        className={`text-[10px] gap-1 ${isStale(syncStatus.padron.last_updated) ? "border-amber-300 text-amber-600 bg-amber-50" : "border-emerald-300 text-emerald-700 bg-emerald-50"}`}
                      >
                        {isStale(syncStatus.padron.last_updated)
                          ? <AlertTriangle size={10} />
                          : <CheckCircle2 size={10} />}
                        Padrón: {fmtShort(syncStatus.padron.last_updated)}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-[10px] gap-1 ${isStale(syncStatus.cuentas_corrientes.last_updated) ? "border-amber-300 text-amber-600 bg-amber-50" : "border-emerald-300 text-emerald-700 bg-emerald-50"}`}
                      >
                        {isStale(syncStatus.cuentas_corrientes.last_updated)
                          ? <AlertTriangle size={10} />
                          : <CheckCircle2 size={10} />}
                        CC: {fmtShort(syncStatus.cuentas_corrientes.last_updated)}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-[10px] gap-1 ${isStale(syncStatus.ventas.last_updated) ? "border-amber-300 text-amber-600 bg-amber-50" : "border-emerald-300 text-emerald-700 bg-emerald-50"}`}
                      >
                        {isStale(syncStatus.ventas.last_updated)
                          ? <AlertTriangle size={10} />
                          : <CheckCircle2 size={10} />}
                        Ventas: {fmtShort(syncStatus.ventas.last_updated)}
                      </Badge>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Sucursal filter */}
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

                {/* Vendedor filter */}
                <Select value={selectedVendedor ?? "__all__"} onValueChange={(v) => setSelectedVendedor(v === "__all__" ? null : v)}>
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

                <DatePicker
                  value={fechaCorte}
                  onChange={(v) => setFechaCorte(v || new Date().toISOString().slice(0, 10))}
                  className="w-[190px]"
                  placeholder="Fecha de corte"
                />

                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" asChild>
                  <Link href="/modo-mapa">
                    <MapIcon size={13} />
                    Ver Mapa
                  </Link>
                </Button>
              </div>
            </div>

            {/* ── KPI cards ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <KpiCard
                label="Facturado"
                value={fmt$$(kpiFacturado)}
                subtext={selectedVendedor ? `${selectedVendedor} · ${ventasVentanaLabel}` : ventasVentanaLabel}
                icon={TrendingUp}
                color="violet"
                loading={loadingVentas}
              />
              <KpiCard
                label="Recaudado"
                value={fmt$$(kpiRecaudado)}
                subtext={`${kpiFacturado > 0 ? Math.round((kpiRecaudado / kpiFacturado) * 100) : 0}% de facturado`}
                icon={CheckCircle2}
                color="emerald"
                loading={loadingVentas}
              />
              <KpiCard
                label="Facturas"
                value={kpiFacturas.toLocaleString("es-AR")}
                icon={Receipt}
                color="blue"
                loading={loadingVentas}
              />
              <KpiCard
                label="Deuda Total"
                value={fmt$$(deudaTotal)}
                icon={CreditCard}
                color="rose"
                loading={loadingCuentas}
              />
              <KpiCard
                label="Clientes Deudores"
                value={clientesDeudores.toLocaleString("es-AR")}
                icon={Users}
                color="amber"
                loading={loadingCuentas}
              />
            </div>

            {/* ── Ventas + Cuentas tables ──────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* Ventas por vendedor */}
              <Card
                onDragOver={(e) => {
                  if (!draggingVendedor) return;
                  e.preventDefault();
                  setLeftPanelDropActive(true);
                }}
                onDragLeave={() => setLeftPanelDropActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  const vend = e.dataTransfer.getData("text/plain") || draggingVendedor;
                  if (vend) {
                    setSelectedVendedor(vend);
                    setOpenVentasCliente(null);
                  }
                  setLeftPanelDropActive(false);
                  setDraggingVendedor(null);
                }}
                className={leftPanelDropActive ? "ring-2 ring-violet-300 bg-violet-50/40 transition-colors" : "transition-colors"}
              >
                <CardHeader className="pb-3 pt-4 px-5">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <BarChart3 size={15} className="text-[var(--shelfy-primary)]" />
                      Ranking Ventas
                    </CardTitle>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="secondary" className="text-[10px]">
                        {ventasFiltradas.length} vendedores
                      </Badge>
                      {leftPanelDropActive && (
                        <Badge variant="outline" className="text-[10px] border-violet-300 text-violet-700 bg-violet-50">
                          Soltá acá para cargar vendedor
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <Separator />
                <CardContent className="p-0">
                  {loadingVentas ? (
                    <div className="p-4 flex flex-col gap-2">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-9 w-full rounded" />
                      ))}
                    </div>
                  ) : ventasFiltradas.length === 0 ? (
                    <p className="text-center text-xs text-muted-foreground py-8">Sin datos de ventas para el período</p>
                  ) : (
                    <div className="max-h-[460px] overflow-auto">
                      <div className="px-4 py-2 border-b border-[var(--shelfy-border)]/40 flex flex-wrap gap-1.5">
                        {ventasFiltradas.map((v) => (
                          <button
                            key={v.vendedor}
                            onClick={() => {
                              setSelectedVendedor(v.vendedor);
                              setOpenVentasCliente(null);
                            }}
                            className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${
                              vendedorResaltado === v.vendedor
                                ? "border-violet-300 bg-violet-50 text-violet-700"
                                : "border-[var(--shelfy-border)] text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {v.vendedor}
                          </button>
                        ))}
                      </div>
                      <div className="divide-y divide-[var(--shelfy-border)]/40">
                        {ventasByCliente.map((c) => {
                          const isOpen = openVentasCliente === c.cliente;
                          return (
                            <div key={c.cliente}>
                              <button
                                onClick={() => setOpenVentasCliente(isOpen ? null : c.cliente)}
                                className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/30 transition-colors"
                              >
                                <ChevronDown size={14} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold truncate">{c.cliente}</p>
                                  <p className="text-[10px] text-muted-foreground">
                                    Venta {fmt$$(c.totalVenta)} · {c.totalBultos.toLocaleString("es-AR", { maximumFractionDigits: 2 })} bultos · {c.transacciones.length} comprobantes
                                  </p>
                                </div>
                                {c.reciboMismoDia > 0 && (
                                  <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-700 bg-orange-50">
                                    RECIBO {fmt$$(c.reciboMismoDia)}
                                  </Badge>
                                )}
                              </button>
                              {isOpen && (
                                <div className="px-4 pb-3">
                                  {c.topArticulos.length > 0 && (
                                    <div className="mb-2 flex flex-wrap gap-1.5">
                                      {c.topArticulos.slice(0, 4).map((a) => (
                                        <Badge key={a.articulo} variant="outline" className="text-[10px]">
                                          {a.articulo} · {a.bultos.toLocaleString("es-AR", { maximumFractionDigits: 2 })} b
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                  <Table>
                                    <TableHeader>
                                      <TableRow className="text-[10px]">
                                        <TableHead>Comprobante</TableHead>
                                        <TableHead>Tipo</TableHead>
                                        <TableHead className="text-right">Monto</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {c.transacciones.map((t, idx) => (
                                        <TableRow key={`${t.numero ?? "na"}-${idx}`} className="text-[11px]">
                                          <TableCell>{t.comprobante ?? "—"} {t.numero ?? ""}</TableCell>
                                          <TableCell>{t.tipo_operacion ?? "—"}</TableCell>
                                          <TableCell className="text-right font-mono">{fmt$$(t.monto_total || 0)}</TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Cuentas corrientes */}
              <Card>
                <CardHeader className="pb-3 pt-4 px-5">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <CreditCard size={15} className="text-rose-500" />
                      Cuentas Corrientes
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {cuentasData?.fecha && (
                        <Badge variant="outline" className="text-[10px] gap-1 border-[var(--shelfy-border)]">
                          <Clock size={9} />
                          {new Date(cuentasData.fecha).toLocaleDateString("es-AR")}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-[10px]">
                        {cuentasFiltradas.length} vendedores
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <Separator />
                <CardContent className="p-0">
                  {loadingCuentas ? (
                    <div className="p-4 flex flex-col gap-2">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-9 w-full rounded" />
                      ))}
                    </div>
                  ) : cuentasFiltradas.length === 0 ? (
                    <p className="text-center text-xs text-muted-foreground py-8">Sin datos de CC disponibles</p>
                  ) : (
                    <div className="overflow-auto max-h-[460px]">
                      <Table>
                        <TableHeader>
                          <TableRow className="text-[10px]">
                            <TableHead className="pl-5 w-[40%]">Vendedor</TableHead>
                            <TableHead className="text-right">Deuda</TableHead>
                            <TableHead className="text-right pr-5">Clientes</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {cuentasFiltradas
                            .filter((v) => selectedVendedor === null || v.vendedor === selectedVendedor)
                            .slice()
                            .sort((a, b) => b.deuda_total - a.deuda_total)
                            .map((v) => (
                              <TableRow key={v.vendedor} className="text-xs">
                                <TableCell className="pl-5 font-medium truncate max-w-[140px]">
                                  <button
                                    type="button"
                                    draggable
                                    onDragStart={(e) => {
                                      e.dataTransfer.setData("text/plain", v.vendedor);
                                      e.dataTransfer.effectAllowed = "copyMove";
                                      setDraggingVendedor(v.vendedor);
                                    }}
                                    onDragEnd={() => {
                                      setDraggingVendedor(null);
                                      setLeftPanelDropActive(false);
                                    }}
                                    onClick={() => {
                                      setSelectedVendedor(v.vendedor);
                                      setOpenVentasCliente(null);
                                    }}
                                    className={`text-left px-1 py-0.5 rounded transition-colors ${
                                      selectedVendedor !== null && selectedVendedor === v.vendedor
                                        ? "bg-violet-50 text-violet-700"
                                        : "hover:bg-muted/40"
                                    }`}
                                    title="Click para aplicar o arrastrá al panel de ventas"
                                  >
                                    {v.vendedor}
                                  </button>
                                </TableCell>
                                <TableCell className="text-right font-mono text-[11px] text-rose-600 font-semibold">
                                  {fmt$$(v.deuda_total)}
                                </TableCell>
                                <TableCell className="text-right pr-5 text-muted-foreground">{v.cantidad_clientes}</TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
