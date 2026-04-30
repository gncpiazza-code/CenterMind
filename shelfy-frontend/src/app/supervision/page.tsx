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
  TrendingUp, CreditCard, Users, Receipt, BarChart3,
  Clock, AlertTriangle, CheckCircle2, Map,
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
  const { user } = useAuth();
  const router = useRouter();

  const [ventasDias, setVentasDias] = useState<7 | 30 | 90>(30);
  const [selectedSucursal, setSelectedSucursal] = useState<string>("__all__");

  useEffect(() => {
    if (user && !ALLOWED_ROLES.includes(user.rol)) {
      router.replace("/dashboard");
    }
  }, [user, router]);

  if (!user || !ALLOWED_ROLES.includes(user.rol)) return null;

  const distId = user.id_distribuidor || 0;

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: vendedores = [] } = useQuery({
    queryKey: ['supervision-vendedores-panel', distId],
    queryFn: () => fetchVendedoresSupervision(distId),
    enabled: !!distId,
    staleTime: 10 * 60_000,
  });

  const sucursales = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const v of vendedores as any[]) {
      const s = (v as any).sucursal_nombre || (v as any).nombre_sucursal;
      if (s && !seen.has(s)) { seen.add(s); list.push(s); }
    }
    return list.sort();
  }, [vendedores]);

  const sucursalParam = selectedSucursal === "__all__" ? undefined : selectedSucursal;

  const { data: ventasData, isLoading: loadingVentas } = useQuery({
    queryKey: supervisionPanelKeys.ventas(distId, ventasDias),
    queryFn: () => fetchVentasSupervision(distId, ventasDias),
    enabled: !!distId,
    staleTime: 5 * 60_000,
  });

  const { data: cuentasData, isLoading: loadingCuentas } = useQuery({
    queryKey: supervisionPanelKeys.cuentas(distId, sucursalParam),
    queryFn: () => fetchCuentasSupervision(distId, sucursalParam),
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

  const ventasFiltradas = useMemo((): VendedorVentas[] => {
    const rows = ventasData?.vendedores ?? [];
    if (!sucursalParam) return rows;
    // Backend returns nombre_vendedor (= ERP name). Match against VendedorVentas.vendedor (also ERP name).
    const vidsEnSucursal = new Set(
      (vendedores as any[])
        .filter((v: any) => v.sucursal_nombre === sucursalParam)
        .map((v: any) => v.nombre_vendedor as string),
    );
    return rows.filter((r) => vidsEnSucursal.has(r.vendedor));
  }, [ventasData, vendedores, sucursalParam]);

  // Ventas KPIs from filtered rows so they react to sucursal selection
  const kpiFacturado   = ventasFiltradas.reduce((acc, v) => acc + v.monto_total, 0);
  const kpiRecaudado   = ventasFiltradas.reduce((acc, v) => acc + v.monto_recaudado, 0);
  const kpiFacturas    = ventasFiltradas.reduce((acc, v) => acc + v.total_facturas, 0);

  const cuentasFiltradas = useMemo((): VendedorCuentas[] => {
    // CC filtering is server-side (sucursal param passed to endpoint). metadatos also reflects filtered totals.
    return cuentasData?.vendedores ?? [];
  }, [cuentasData]);

  // ── Render ─────────────────────────────────────────────────────────────────
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

                {/* Days filter */}
                <div className="flex rounded-lg border border-[var(--shelfy-border)] overflow-hidden text-xs">
                  {([7, 30, 90] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => setVentasDias(d)}
                      className={`px-3 py-1.5 font-semibold transition-colors ${
                        ventasDias === d
                          ? "bg-[var(--shelfy-primary)] text-white"
                          : "bg-white text-[var(--shelfy-muted)] hover:bg-violet-50"
                      }`}
                    >
                      {d}d
                    </button>
                  ))}
                </div>

                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" asChild>
                  <Link href="/modo-mapa">
                    <Map size={13} />
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
                subtext={`últimos ${ventasDias} días`}
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
                      Ranking Ventas
                    </CardTitle>
                    <Badge variant="secondary" className="text-[10px]">
                      {ventasDias}d · {ventasFiltradas.length} vendedores
                    </Badge>
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
                    <div className="overflow-auto max-h-[340px]">
                      <Table>
                        <TableHeader>
                          <TableRow className="text-[10px]">
                            <TableHead className="pl-5 w-[40%]">Vendedor</TableHead>
                            <TableHead className="text-right">Facturado</TableHead>
                            <TableHead className="text-right pr-5">Facturas</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {ventasFiltradas.map((v) => (
                            <TableRow key={v.vendedor} className="text-xs">
                              <TableCell className="pl-5 font-medium truncate max-w-[140px]">{v.vendedor}</TableCell>
                              <TableCell className="text-right font-mono text-[11px]">
                                {fmt$$(v.monto_total)}
                              </TableCell>
                              <TableCell className="text-right pr-5 text-muted-foreground">{v.total_facturas}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
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
                    <div className="overflow-auto max-h-[340px]">
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
                            .slice()
                            .sort((a, b) => b.deuda_total - a.deuda_total)
                            .map((v) => (
                              <TableRow key={v.vendedor} className="text-xs">
                                <TableCell className="pl-5 font-medium truncate max-w-[140px]">{v.vendedor}</TableCell>
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
