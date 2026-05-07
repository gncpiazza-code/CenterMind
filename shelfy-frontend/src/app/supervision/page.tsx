"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
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
  CreditCard, Users,
  Clock, AlertTriangle, CheckCircle2, Map as MapIcon, Printer, ArrowUpDown, Hash, Target,
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
  const { user, effectiveDistribuidorId } = useAuth();
  const router = useRouter();

  const currentMes = new Date().toISOString().slice(0, 7);
  const [selectedSucursal, setSelectedSucursal] = useState<string>("__all__");
  const [selectedVendedor, setSelectedVendedor] = useState<string | null>(null);
  const [ccSort, setCCSort] = useState<"deuda" | "antiguedad">("antiguedad");
  const [ccSortDir, setCCSortDir] = useState<"desc" | "asc">("desc");
  const [altasMes, setAltasMes] = useState(currentMes);
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

  const { data: cuentasData, isLoading: loadingCuentas } = useQuery({
    queryKey: [...supervisionPanelKeys.cuentas(distId, sucursalParam), selectedVendedor ?? "__none__"] as const,
    queryFn: () => fetchCuentasSupervision(distId, sucursalParam, undefined, selectedVendedor ?? undefined),
    enabled: !!distId && !!selectedVendedor,
    staleTime: 5 * 60_000,
  });

  const { data: syncStatus } = useQuery({
    queryKey: ['supervision-sync-status', distId],
    queryFn: () => fetchSyncStatus(distId),
    enabled: !!distId,
    staleTime: 2 * 60_000,
  });

  const selectedVendedorObj = vendedores.find(v => v.nombre_vendedor === selectedVendedor);
  const selectedVendedorId = selectedVendedorObj?.id_vendedor ?? null;

  const { data: altasData, isLoading: loadingAltas } = useQuery<PdvsMovimientoResponse>({
    queryKey: ['supervision-altas', distId, selectedVendedorId, altasMes],
    queryFn: () => fetchPdvsMovimiento(distId!, selectedVendedorId!, altasMes),
    enabled: !!distId && !!selectedVendedorId,
    staleTime: 5 * 60_000,
  });

  // ── Derived metrics ────────────────────────────────────────────────────────
  const deudaTotal       = cuentasData?.metadatos?.total_deuda ?? 0;
  const clientesDeudores = cuentasData?.metadatos?.clientes_deudores ?? 0;

  const vendedorOptions = useMemo(() => {
    return vendedores
      .filter((v) => !sucursalParam || v.sucursal_nombre === sucursalParam)
      .map((v) => v.nombre_vendedor)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "es"));
  }, [vendedores, sucursalParam]);

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

                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" asChild>
                  <Link href="/modo-mapa">
                    <MapIcon size={13} />
                    Ver Mapa
                  </Link>
                </Button>
              </div>
            </div>

            {/* ── 50/50 grid: CC (left) + Altas (right) ─────────────── */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

              {/* ── Left col: KPI cards + Cuentas Corrientes ─────────── */}
              <div className="flex flex-col gap-4">

                {/* KPI cards */}
                <div className="grid grid-cols-2 gap-3">
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

                {/* Cuentas Corrientes */}
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
                          disabled={
                            !selectedVendedor ||
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
                              <TableHead className="pl-5 w-[36%]">Cliente</TableHead>
                              <TableHead className="text-right">Deuda</TableHead>
                              <TableHead className="text-right">Antig.</TableHead>
                              <TableHead className="text-right">
                                <span className="flex items-center justify-end gap-0.5">
                                  <Hash size={9} />Cbtés.
                                </span>
                              </TableHead>
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

              {/* ── Right col: Altas y Activaciones ──────────────────── */}
              <div className="rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] overflow-hidden shadow-sm flex flex-col min-h-[400px]">

                {/* Panel header */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--shelfy-border)]/50">
                  <div className="flex items-center gap-2">
                    <Target size={14} className="text-violet-500" />
                    <span className="text-sm font-bold text-[var(--shelfy-text)]">Altas y Activaciones</span>
                  </div>
                  <select
                    value={altasMes}
                    onChange={e => setAltasMes(e.target.value)}
                    className="text-xs bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-2 py-1 text-[var(--shelfy-text)]"
                  >
                    {Array.from({ length: 3 }, (_, i) => {
                      const d = new Date();
                      d.setMonth(d.getMonth() - i);
                      const v = d.toISOString().slice(0, 7);
                      return <option key={v} value={v}>{v}</option>;
                    })}
                  </select>
                </div>

                {/* Panel body */}
                {!selectedVendedorId ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-14 gap-3 text-center px-6">
                    <div className="size-12 rounded-2xl bg-violet-500/8 flex items-center justify-center">
                      <Target size={22} className="text-violet-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--shelfy-text)]">Seleccioná un vendedor</p>
                      <p className="text-xs text-[var(--shelfy-muted)] mt-0.5">Elegí un vendedor para ver sus altas y activaciones</p>
                    </div>
                  </div>
                ) : loadingAltas ? (
                  <div className="p-4 flex flex-col gap-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-9 w-full rounded" />
                    ))}
                  </div>
                ) : !altasData?.items?.length ? (
                  <div className="flex-1 flex items-center justify-center py-10 text-sm text-[var(--shelfy-muted)]">
                    Sin altas ni activaciones en {altasMes}
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto">
                    {/* Summary counts */}
                    <div className="grid grid-cols-2 divide-x divide-[var(--shelfy-border)]/40 border-b border-[var(--shelfy-border)]/30">
                      <div className="px-4 py-2.5">
                        <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide mb-0.5">Altas</p>
                        <p className="text-base font-bold text-emerald-500">{altasData.total_altas}</p>
                      </div>
                      <div className="px-4 py-2.5">
                        <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide mb-0.5">Activaciones</p>
                        <p className="text-base font-bold text-blue-500">{altasData.total_activaciones}</p>
                      </div>
                    </div>
                    {/* Item list */}
                    <div className="divide-y divide-[var(--shelfy-border)]/30">
                      {altasData.items.map((item, i) => (
                        <div key={i} className="px-4 py-2.5 flex items-start gap-3 hover:bg-white/5">
                          <span className={`mt-0.5 shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            item.categoria === "alta"
                              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-600"
                              : "bg-blue-500/15 border-blue-500/30 text-blue-600"
                          }`}>
                            {item.categoria === "alta" ? "Alta" : "Activ."}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-[var(--shelfy-text)] truncate">{item.nombre || "—"}</p>
                            <p className="text-[10px] text-[var(--shelfy-muted)] truncate">
                              {item.id_cliente_erp ?? "Sin código"} · {item.localidad || item.direccion || "—"}
                            </p>
                          </div>
                          {item.exhibido && (
                            <span className="text-[10px] text-violet-500 font-bold shrink-0">★</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
