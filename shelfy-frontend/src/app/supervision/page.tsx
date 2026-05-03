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
  Clock, AlertTriangle, CheckCircle2, Map as MapIcon, Printer, ArrowUpDown,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { DatePicker } from "@/components/ui/date-picker";

const ALLOWED_ROLES = ["superadmin", "admin", "supervisor", "directorio"];

/** Ventana fija para el panel (sin selector de rango): N días que terminan en la fecha elegida por calendario. */
const PANEL_VENTAS_DIAS = 1;

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
  const [openComprobante, setOpenComprobante] = useState<string | null>(null);
  const [fechaCorte, setFechaCorte] = useState<string>(new Date().toISOString().slice(0, 10));
  const [ccSort, setCCSort] = useState<"deuda" | "antiguedad">("deuda");
  const [ccSortDir, setCCSortDir] = useState<"desc" | "asc">("desc");
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
    queryKey: [...supervisionPanelKeys.ventas(distId, PANEL_VENTAS_DIAS), fechaCorte || "", sucursalParam ?? "__all__", selectedVendedor ?? "__none__"] as const,
    queryFn: () =>
      fetchVentasSupervision(distId, PANEL_VENTAS_DIAS, fechaCorte || undefined, sucursalParam, selectedVendedor ?? undefined),
    enabled: !!distId && !!selectedVendedor,
    staleTime: 5 * 60_000,
  });

  const { data: cuentasData, isLoading: loadingCuentas } = useQuery({
    queryKey: [...supervisionPanelKeys.cuentas(distId, sucursalParam), fechaCorte, selectedVendedor ?? "__none__"] as const,
    queryFn: () => fetchCuentasSupervision(distId, sucursalParam, fechaCorte || undefined, selectedVendedor ?? undefined),
    enabled: !!distId && !!selectedVendedor,
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
    return vendedores
      .filter((v) => !sucursalParam || v.sucursal_nombre === sucursalParam)
      .map((v) => v.nombre_vendedor)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "es"));
  }, [vendedores, sucursalParam]);

  const ventasByCliente = useMemo(() => {
    if (!selectedVendedor) return [];
    const vendedor = ventasFiltradas.find((v) => v.vendedor === selectedVendedor);
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
  }, [ventasFiltradas, selectedVendedor]);

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

  // cc_detalle.vendedor_nombre viene de CHESS con formato "CODE CODE2 - NOMBRE".
  // selectedVendedor viene de vendedores_v2.nombre_erp (solo el nombre sin prefijo).
  const clientesOrdenados = useMemo(() => {
    const extractCCName = (nombre: string) => {
      const idx = nombre.indexOf(" - ");
      return idx >= 0 ? nombre.slice(idx + 3).trim().toUpperCase() : nombre.trim().toUpperCase();
    };
    const vendedorUpper = (selectedVendedor || "").trim().toUpperCase();
    const vendor =
      cuentasFiltradas.find((v) => extractCCName(v.vendedor) === vendedorUpper) ??
      cuentasFiltradas[0];
    const clientes = vendor?.clientes ?? [];
    return [...clientes].sort((a, b) => {
      const dir = ccSortDir === "desc" ? -1 : 1;
      if (ccSort === "deuda") return dir * (b.deuda_total - a.deuda_total);
      return dir * ((b.antiguedad ?? 0) - (a.antiguedad ?? 0));
    });
  }, [cuentasFiltradas, selectedVendedor, ccSort, ccSortDir]);

  const padronLastUpdated = syncStatus?.padron?.last_updated ?? null;
  const ccLastUpdated = syncStatus?.cuentas_corrientes?.last_updated ?? null;
  const ventasLastUpdated = syncStatus?.ventas?.last_updated ?? null;

  const ventasVentanaLabel = useMemo(() => {
    const d = new Date(`${fechaCorte}T12:00:00`);
    const fechaStr = d.toLocaleDateString("es-AR");
    return `Últimos ${PANEL_VENTAS_DIAS} d hasta ${fechaStr}`;
  }, [fechaCorte]);

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
                        className={`text-[10px] gap-1 ${isStale(padronLastUpdated) ? "border-amber-300 text-amber-600 bg-amber-50" : "border-emerald-300 text-emerald-700 bg-emerald-50"}`}
                      >
                        {isStale(padronLastUpdated)
                          ? <AlertTriangle size={10} />
                          : <CheckCircle2 size={10} />}
                        Padrón: {fmtShort(padronLastUpdated)}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-[10px] gap-1 ${isStale(ccLastUpdated) ? "border-amber-300 text-amber-600 bg-amber-50" : "border-emerald-300 text-emerald-700 bg-emerald-50"}`}
                      >
                        {isStale(ccLastUpdated)
                          ? <AlertTriangle size={10} />
                          : <CheckCircle2 size={10} />}
                        CC: {fmtShort(ccLastUpdated)}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-[10px] gap-1 ${isStale(ventasLastUpdated) ? "border-amber-300 text-amber-600 bg-amber-50" : "border-emerald-300 text-emerald-700 bg-emerald-50"}`}
                      >
                        {isStale(ventasLastUpdated)
                          ? <AlertTriangle size={10} />
                          : <CheckCircle2 size={10} />}
                        Ventas: {fmtShort(ventasLastUpdated)}
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
              <Card>
                <CardHeader className="pb-3 pt-4 px-5">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <BarChart3 size={15} className="text-[var(--shelfy-primary)]" />
                      {selectedVendedor ? `Ventas — ${selectedVendedor}` : "Ventas"}
                    </CardTitle>
                    <Badge variant="secondary" className="text-[10px]">
                      {ventasFiltradas.length} vendedores
                    </Badge>
                  </div>
                </CardHeader>
                <Separator />
                <CardContent className="p-0">
                  {!selectedVendedor ? (
                    <div className="flex flex-col items-center justify-center py-14 gap-3 text-center px-6">
                      <div className="size-12 rounded-2xl bg-violet-500/8 flex items-center justify-center">
                        <Users size={22} className="text-violet-500" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Seleccioná un vendedor</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Elegí vendedor para ver sus ventas y cuentas</p>
                      </div>
                    </div>
                  ) : loadingVentas ? (
                    <div className="p-4 flex flex-col gap-2">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-9 w-full rounded" />
                      ))}
                    </div>
                  ) : ventasByCliente.length === 0 ? (
                    <p className="text-center text-xs text-muted-foreground py-8">Sin datos de ventas para el período</p>
                  ) : (
                    <div className="max-h-[460px] overflow-auto">
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
                                      {c.transacciones.map((t, idx) => {
                                        const compKey = `${c.cliente}-${t.comprobante ?? "na"}-${t.numero ?? "na"}-${idx}`;
                                        const isCompOpen = openComprobante === compKey;
                                        const isRecibo = `${t.tipo_operacion ?? ""} ${t.comprobante ?? ""}`.toLowerCase().includes("recib");
                                        return (
                                          <>
                                            <TableRow
                                              key={compKey}
                                              className={`text-[11px] cursor-pointer hover:bg-muted/30 transition-colors ${isCompOpen ? "bg-muted/20" : ""}`}
                                              onClick={() => setOpenComprobante(isCompOpen ? null : compKey)}
                                            >
                                              <TableCell>
                                                <span className="flex items-center gap-1">
                                                  <ChevronDown size={9} className={`shrink-0 transition-transform ${isCompOpen ? "rotate-180" : ""} text-muted-foreground`} />
                                                  <span className={isRecibo ? "text-orange-600 font-medium" : ""}>{t.comprobante ?? "—"} {t.numero ?? ""}</span>
                                                </span>
                                              </TableCell>
                                              <TableCell className={isRecibo ? "text-orange-600" : ""}>{t.tipo_operacion ?? "—"}</TableCell>
                                              <TableCell className="text-right font-mono">{fmt$$(t.monto_total || 0)}</TableCell>
                                            </TableRow>
                                            {isCompOpen && (
                                              <TableRow key={`${compKey}-detail`}>
                                                <TableCell colSpan={3} className="p-0 border-b border-[var(--shelfy-border)]/30">
                                                  <div className="px-5 py-2.5 bg-violet-50/40">
                                                    {(t.articulos && t.articulos.length > 0) ? (
                                                      <>
                                                        <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">Artículos de este comprobante:</p>
                                                        <div className="flex flex-wrap gap-1.5">
                                                          {t.articulos.map((a, ai) => (
                                                            <Badge key={`${a.codigo ?? a.articulo}-${ai}`} variant="outline" className="text-[10px] bg-white">
                                                              {a.articulo} · <span className="font-mono font-bold">{a.bultos.toLocaleString("es-AR", { maximumFractionDigits: 2 })} b</span>
                                                            </Badge>
                                                          ))}
                                                        </div>
                                                      </>
                                                    ) : (
                                                      <p className="text-[10px] text-muted-foreground">Sin detalle de artículos disponible</p>
                                                    )}
                                                  </div>
                                                </TableCell>
                                              </TableRow>
                                            )}
                                          </>
                                        );
                                      })}
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
                        onClick={() => {
                          const nextDir = ccSort === "deuda" && ccSortDir === "desc" ? "asc" : "desc";
                          setCCSort("deuda");
                          setCCSortDir(ccSort === "deuda" ? nextDir : "desc");
                        }}
                      >
                        <ArrowUpDown size={10} />
                        Deuda
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[10px] px-2 gap-1"
                        onClick={() => {
                          const nextDir = ccSort === "antiguedad" && ccSortDir === "desc" ? "asc" : "desc";
                          setCCSort("antiguedad");
                          setCCSortDir(ccSort === "antiguedad" ? nextDir : "desc");
                        }}
                      >
                        <ArrowUpDown size={10} />
                        Antigüedad
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[10px] px-2 gap-1"
                        onClick={() => window.print()}
                      >
                        <Printer size={10} />
                        Imprimir
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <Separator />
                <CardContent className="p-0">
                  {!selectedVendedor ? (
                    <div className="flex flex-col items-center justify-center py-14 gap-3 text-center px-6">
                      <div className="size-12 rounded-2xl bg-rose-500/8 flex items-center justify-center">
                        <CreditCard size={22} className="text-rose-500" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Seleccioná un vendedor</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Elegí vendedor para ver sus ventas y cuentas</p>
                      </div>
                    </div>
                  ) : loadingCuentas ? (
                    <div className="p-4 flex flex-col gap-2">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-9 w-full rounded" />
                      ))}
                    </div>
                  ) : clientesOrdenados.length === 0 ? (
                    <p className="text-center text-xs text-muted-foreground py-8">Sin datos de CC disponibles</p>
                  ) : (
                    <div className="overflow-auto max-h-[460px]">
                      <Table>
                        <TableHeader>
                          <TableRow className="text-[10px]">
                            <TableHead className="pl-5 w-[40%]">Cliente</TableHead>
                            <TableHead className="text-right">Deuda</TableHead>
                            <TableHead className="text-right">Antig.</TableHead>
                            <TableHead className="text-right pr-5">Rango</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {clientesOrdenados.map((c, idx) => (
                            <TableRow key={`${c.cliente ?? "x"}-${idx}`} className="text-xs">
                              <TableCell className="pl-5 font-medium truncate max-w-[140px]">
                                {c.cliente ?? "—"}
                              </TableCell>
                              <TableCell className="text-right font-mono text-[11px] text-rose-600 font-semibold">
                                {fmt$$(c.deuda_total)}
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {c.antiguedad != null ? `${c.antiguedad}d` : "—"}
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

          </div>
        </main>
      </div>
    </div>
  );
}
