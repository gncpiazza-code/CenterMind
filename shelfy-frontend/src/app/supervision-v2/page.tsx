"use client";

import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSupervisionV2Store } from "@/store/useSupervisionV2Store";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  LineChart, Line, Legend
} from "recharts";
import {
  DollarSign, Package, UserPlus, Search, Calendar, MapPin, Users, Receipt, AlertTriangle,
  ShoppingCart, TrendingUp, ArrowUpRight, ChevronRight, BarChart2
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { fetchSupervisionV2Dashboard, fetchSupervisionV2VendedorDetalle, fetchSupervisionV2VentaDetalle } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { useRouter } from "next/navigation";

const formatCurrency = (val: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(val);

const formatCompact = (val: number) => {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return formatCurrency(val);
};

// --- Skeleton primitives ---
function SkeletonLine({ w = "100%", h = "1rem" }: { w?: string; h?: string }) {
  return (
    <div
      className="rounded animate-pulse bg-gradient-to-r from-black/[0.04] via-black/[0.08] to-black/[0.04] bg-[length:200%_100%]"
      style={{ width: w, height: h }}
    />
  );
}

function KpiSkeleton() {
  return (
    <Card className="bg-[var(--shelfy-panel)] border-[var(--shelfy-border)] shadow-sm">
      <CardContent className="p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-black/[0.04] animate-pulse shrink-0" />
        <div className="flex-1 space-y-2">
          <SkeletonLine w="60%" h="0.75rem" />
          <SkeletonLine w="80%" h="1.75rem" />
        </div>
      </CardContent>
    </Card>
  );
}

function TableRowSkeleton({ cols }: { cols: number }) {
  return (
    <TableRow className="border-[var(--shelfy-border)] hover:bg-transparent">
      {Array.from({ length: cols }).map((_, i) => (
        <TableCell key={i}>
          <SkeletonLine w={i === 0 ? "70%" : "50%"} />
        </TableCell>
      ))}
    </TableRow>
  );
}

// --- Empty state ---
function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-[var(--shelfy-muted)]">
      <div className="w-14 h-14 rounded-2xl bg-[var(--shelfy-border)]/60 flex items-center justify-center">
        <BarChart2 className="w-7 h-7 opacity-40" />
      </div>
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}

// --- Ranking progress bar ---
function ProgressBar({ value, max, color = "#7C3AED" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="w-20 h-1.5 rounded-full bg-black/[0.06] overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

export default function SupervisionV2Page() {
  const { user, effectiveDistribuidorId } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (user && !user.is_superadmin) router.push("/supervision");
  }, [user, router]);

  const distId = effectiveDistribuidorId || 2;

  const {
    dateRange, setDateRange,
    searchQuery, setSearchQuery,
    activeTab, setActiveTab,
    selectedSucursal, setSelectedSucursal,
    selectedVendedor, setSelectedVendedor,
    drawerOpen, drawerType, drawerId, openDrawer, closeDrawer,
  } = useSupervisionV2Store();

  const diasMap: Record<string, number> = { hoy: 1, semana: 7, mes: 30, personalizado: 30 };

  const { data, isLoading } = useQuery({
    queryKey: ["supervision-v2-dashboard", distId, dateRange, selectedSucursal, selectedVendedor],
    queryFn: () =>
      fetchSupervisionV2Dashboard(distId, {
        dias: diasMap[dateRange] ?? 30,
        sucursal: selectedSucursal || undefined,
        vendedor: selectedVendedor || undefined,
      }),
    enabled: !!distId,
  });

  const { data: drawerData, isLoading: drawerLoading } = useQuery({
    queryKey: ["supervision-v2-drawer", distId, drawerType, drawerId],
    queryFn: () => {
      if (drawerType === "vendedor") return fetchSupervisionV2VendedorDetalle(distId, drawerId as string);
      if (drawerType === "venta") return fetchSupervisionV2VentaDetalle(distId, drawerId as string);
      return Promise.resolve(null);
    },
    enabled: !!distId && drawerOpen && (drawerType === "vendedor" || drawerType === "venta") && !!drawerId,
  });

  // Filtered ventas by search
  const filteredVentas = useMemo(() => {
    if (!data?.ventas) return [];
    if (!searchQuery.trim()) return data.ventas;
    const q = searchQuery.toLowerCase();
    return data.ventas.filter(
      (v: { comprobante: string; pdv: string; vendedor: string }) =>
        v.comprobante?.toLowerCase().includes(q) ||
        v.pdv?.toLowerCase().includes(q) ||
        v.vendedor?.toLowerCase().includes(q)
    );
  }, [data?.ventas, searchQuery]);

  const maxVentas = useMemo(
    () => Math.max(...(data?.rankingVendedores?.map((v: { ventas: number }) => v.ventas) || [0])),
    [data?.rankingVendedores]
  );

  const dateLabel: Record<string, string> = { hoy: "Hoy", semana: "Esta semana", mes: "Este mes", personalizado: "Personalizado" };

  return (
    <div className="flex h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar title="Supervisión de Ventas" />

        <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">

          {/* ── FILTROS GLOBALES ── */}
          <div className="flex flex-col md:flex-row gap-3 items-center justify-between bg-[var(--shelfy-panel)] p-3.5 rounded-xl border border-[var(--shelfy-border)] shadow-sm">
            <div className="flex items-center gap-2.5 w-full md:w-auto">
              <div className="relative flex-1 md:w-60">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[var(--shelfy-muted)]" />
                <Input
                  placeholder="Buscar PDV, Vendedor, comprobante…"
                  className="pl-9 h-9 bg-[var(--shelfy-bg)] border-[var(--shelfy-border)] text-sm"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={dateRange} onValueChange={(v: string) => setDateRange(v as "hoy" | "semana" | "mes" | "personalizado")}>
                <SelectTrigger className="w-[148px] h-9 bg-[var(--shelfy-bg)] text-sm gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[var(--shelfy-muted)]" />
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hoy">Hoy</SelectItem>
                  <SelectItem value="semana">Esta Semana</SelectItem>
                  <SelectItem value="mes">Este Mes</SelectItem>
                  <SelectItem value="personalizado">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <Select value={selectedSucursal || "todas"} onValueChange={(v: string) => setSelectedSucursal(v === "todas" ? null : v)}>
                <SelectTrigger className="w-[148px] h-9 bg-[var(--shelfy-bg)] text-sm gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[var(--shelfy-muted)]" />
                  <SelectValue placeholder="Sucursal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas las Sucursales</SelectItem>
                  {data?.filtrosDisponibles?.sucursales?.map((s: string) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedVendedor || "todos"} onValueChange={(v: string) => setSelectedVendedor(v === "todos" ? null : v)}>
                <SelectTrigger className="w-[148px] h-9 bg-[var(--shelfy-bg)] text-sm gap-1.5">
                  <Users className="w-3.5 h-3.5 text-[var(--shelfy-muted)]" />
                  <SelectValue placeholder="Vendedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los Vendedores</SelectItem>
                  {data?.filtrosDisponibles?.vendedores?.map((v: string) => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── KPIS ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <KpiSkeleton key={i} />)
            ) : (
              <>
                <KpiCard
                  icon={<DollarSign className="w-5 h-5 text-emerald-500" />}
                  iconBg="bg-emerald-500/10"
                  label="Ventas Totales"
                  value={formatCompact(data?.kpis.ventas || 0)}
                  sub={formatCurrency(data?.kpis.ventas || 0)}
                  period={dateLabel[dateRange]}
                />
                <KpiCard
                  icon={<Package className="w-5 h-5 text-blue-500" />}
                  iconBg="bg-blue-500/10"
                  label="Volumen"
                  value={(data?.kpis.bultos || 0).toLocaleString("es-AR")}
                  sub="bultos"
                  period={dateLabel[dateRange]}
                />
                <KpiCard
                  icon={<ShoppingCart className="w-5 h-5 text-violet-500" />}
                  iconBg="bg-violet-500/10"
                  label="Ticket Promedio"
                  value={formatCompact(data?.kpis.ticketPromedio || 0)}
                  sub="por comprobante"
                  period={dateLabel[dateRange]}
                />
                <KpiCard
                  icon={<UserPlus className="w-5 h-5 text-orange-500" />}
                  iconBg="bg-orange-500/10"
                  label="Clientes Activos"
                  value={(data?.kpis.clientesConVenta || 0).toLocaleString("es-AR")}
                  sub="con al menos 1 venta"
                  period={dateLabel[dateRange]}
                />
              </>
            )}
          </div>

          {/* ── GRÁFICOS ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-[var(--shelfy-panel)] border-[var(--shelfy-border)] shadow-sm">
              <CardHeader className="pb-1 pt-4 px-5">
                <CardTitle className="text-xs font-semibold text-[var(--shelfy-muted)] uppercase tracking-widest">
                  Ventas y Bultos por Vendedor
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[260px] px-2 pb-3">
                {isLoading ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="flex gap-1.5 items-end h-28">
                      {[0.4, 0.7, 0.55, 0.85, 0.6, 0.9].map((h, i) => (
                        <div key={i} className="w-8 rounded-t animate-pulse bg-black/[0.06]" style={{ height: `${h * 100}%` }} />
                      ))}
                    </div>
                  </div>
                ) : !data?.chartVendedores?.length ? (
                  <EmptyState message="Sin datos para el período" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.chartVendedores} margin={{ top: 8, right: 8, left: 10, bottom: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--shelfy-border)" vertical={false} />
                      <XAxis dataKey="name" stroke="var(--shelfy-muted)" fontSize={11} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" />
                      <YAxis yAxisId="left" stroke="var(--shelfy-muted)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatCompact(v)} width={52} />
                      <YAxis yAxisId="right" orientation="right" stroke="var(--shelfy-muted)" fontSize={11} tickLine={false} axisLine={false} width={36} />
                      <RechartsTooltip
                        cursor={{ fill: "var(--shelfy-bg)" }}
                        contentStyle={{ backgroundColor: "var(--shelfy-panel)", borderColor: "var(--shelfy-border)", borderRadius: "10px", color: "var(--shelfy-text)", fontSize: "12px" }}
                      />
                      <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "6px" }} />
                      <Bar yAxisId="left" dataKey="ventas" name="Ventas ($)" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={36} />
                      <Bar yAxisId="right" dataKey="bultos" name="Bultos" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="bg-[var(--shelfy-panel)] border-[var(--shelfy-border)] shadow-sm">
              <CardHeader className="pb-1 pt-4 px-5">
                <CardTitle className="text-xs font-semibold text-[var(--shelfy-muted)] uppercase tracking-widest">
                  Tendencia — {dateLabel[dateRange]}
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[260px] px-2 pb-3">
                {isLoading ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <TrendingUp className="w-10 h-10 text-black/[0.06] animate-pulse" />
                  </div>
                ) : !data?.chartTendencia?.length ? (
                  <EmptyState message="Sin datos de tendencia" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.chartTendencia} margin={{ top: 8, right: 8, left: 10, bottom: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--shelfy-border)" vertical={false} />
                      <XAxis dataKey="date" stroke="var(--shelfy-muted)" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis yAxisId="left" stroke="var(--shelfy-muted)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatCompact(v)} width={52} />
                      <YAxis yAxisId="right" orientation="right" stroke="var(--shelfy-muted)" fontSize={11} tickLine={false} axisLine={false} width={36} />
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: "var(--shelfy-panel)", borderColor: "var(--shelfy-border)", borderRadius: "10px", color: "var(--shelfy-text)", fontSize: "12px" }}
                      />
                      <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "6px" }} />
                      <Line yAxisId="left" type="monotone" dataKey="ventas" name="Ventas ($)" stroke="#10b981" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: "#10b981", strokeWidth: 0 }} />
                      <Line yAxisId="right" type="monotone" dataKey="bultos" name="Bultos" stroke="#8b5cf6" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: "#8b5cf6", strokeWidth: 0 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── TABLAS ── */}
          <Card className="bg-[var(--shelfy-panel)] border-[var(--shelfy-border)] shadow-sm">
            <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v as "ranking" | "ventas" | "articulos")} className="w-full">
              <div className="px-5 pt-3 border-b border-[var(--shelfy-border)]">
                <TabsList className="bg-transparent h-auto p-0 gap-5">
                  {(["ranking", "ventas", "articulos"] as const).map((tab) => (
                    <TabsTrigger
                      key={tab}
                      value={tab}
                      className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[var(--shelfy-accent)] rounded-none px-0 pb-3 text-sm font-medium text-[var(--shelfy-muted)] data-[state=active]:text-[var(--shelfy-text)] transition-colors"
                    >
                      {tab === "ranking" ? "Ranking Vendedores" : tab === "ventas" ? "Comprobantes" : "Ranking Artículos"}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              {/* TAB: RANKING */}
              <TabsContent value="ranking" className="m-0 border-none outline-none">
                <Table>
                  <TableHeader>
                    <TableRow className="border-[var(--shelfy-border)] hover:bg-transparent bg-black/[0.015]">
                      <TableHead className="text-[var(--shelfy-muted)] font-semibold text-xs uppercase tracking-wide w-8 text-center">#</TableHead>
                      <TableHead className="text-[var(--shelfy-muted)] font-semibold text-xs uppercase tracking-wide">Vendedor</TableHead>
                      <TableHead className="text-[var(--shelfy-muted)] font-semibold text-xs uppercase tracking-wide text-right">Ventas</TableHead>
                      <TableHead className="text-[var(--shelfy-muted)] font-semibold text-xs uppercase tracking-wide text-right hidden md:table-cell">Bultos</TableHead>
                      <TableHead className="text-[var(--shelfy-muted)] font-semibold text-xs uppercase tracking-wide text-center">Altas</TableHead>
                      <TableHead className="text-[var(--shelfy-muted)] font-semibold text-xs uppercase tracking-wide text-right hidden lg:table-cell">Ticket Prom.</TableHead>
                      <TableHead className="w-4" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} cols={7} />)
                    ) : !data?.rankingVendedores?.length ? (
                      <TableRow><TableCell colSpan={7}><EmptyState message="Sin vendedores para el período seleccionado" /></TableCell></TableRow>
                    ) : (
                      data.rankingVendedores.map((v: { id: string; nombre: string; ventas: number; bultos: number; altas: number; ticketPromedio: number }, idx: number) => (
                        <TableRow
                          key={v.id}
                          className="border-[var(--shelfy-border)] hover:bg-[var(--shelfy-accent)]/[0.03] cursor-pointer transition-colors group"
                          onClick={() => openDrawer("vendedor", v.id)}
                        >
                          <TableCell className="text-center text-sm font-semibold text-[var(--shelfy-muted)]">{idx + 1}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <span className="font-medium text-[var(--shelfy-text)] text-sm">{v.nombre}</span>
                              <ProgressBar value={v.ventas} max={maxVentas} color="#7C3AED" />
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-semibold text-emerald-600 text-sm tabular-nums">{formatCompact(v.ventas)}</TableCell>
                          <TableCell className="text-right text-[var(--shelfy-text)] text-sm tabular-nums hidden md:table-cell">{v.bultos.toLocaleString()}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="bg-violet-500/10 text-violet-600 border-violet-500/20 tabular-nums font-medium text-xs">
                              +{v.altas}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-[var(--shelfy-muted)] text-sm tabular-nums hidden lg:table-cell">{formatCompact(v.ticketPromedio)}</TableCell>
                          <TableCell>
                            <ChevronRight className="w-4 h-4 text-[var(--shelfy-border)] group-hover:text-[var(--shelfy-accent)] transition-colors" />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TabsContent>

              {/* TAB: COMPROBANTES */}
              <TabsContent value="ventas" className="m-0 border-none outline-none">
                <Table>
                  <TableHeader>
                    <TableRow className="border-[var(--shelfy-border)] hover:bg-transparent bg-black/[0.015]">
                      <TableHead className="text-[var(--shelfy-muted)] font-semibold text-xs uppercase tracking-wide">Comprobante</TableHead>
                      <TableHead className="text-[var(--shelfy-muted)] font-semibold text-xs uppercase tracking-wide">Fecha</TableHead>
                      <TableHead className="text-[var(--shelfy-muted)] font-semibold text-xs uppercase tracking-wide">PDV</TableHead>
                      <TableHead className="text-[var(--shelfy-muted)] font-semibold text-xs uppercase tracking-wide hidden md:table-cell">Vendedor</TableHead>
                      <TableHead className="text-[var(--shelfy-muted)] font-semibold text-xs uppercase tracking-wide text-right hidden lg:table-cell">Bultos</TableHead>
                      <TableHead className="text-[var(--shelfy-muted)] font-semibold text-xs uppercase tracking-wide text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 8 }).map((_, i) => <TableRowSkeleton key={i} cols={6} />)
                    ) : !filteredVentas.length ? (
                      <TableRow>
                        <TableCell colSpan={6}>
                          <EmptyState message={searchQuery ? `Sin resultados para "${searchQuery}"` : "Sin comprobantes para el período"} />
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredVentas.map((v: { id: string; comprobante: string; fecha: string; pdv: string; vendedor: string; bultos: number; total: number }) => (
                        <TableRow
                          key={v.id}
                          className="border-[var(--shelfy-border)] hover:bg-[var(--shelfy-accent)]/[0.03] cursor-pointer transition-colors group"
                          onClick={() => openDrawer("venta", v.id)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-[var(--shelfy-accent)]/10 flex items-center justify-center shrink-0">
                                <Receipt className="w-3.5 h-3.5 text-[var(--shelfy-accent)]" />
                              </div>
                              <span className="font-mono text-xs text-[var(--shelfy-text)]">{v.comprobante}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-[var(--shelfy-muted)] text-xs tabular-nums">
                            {new Date(v.fecha).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                          </TableCell>
                          <TableCell className="text-[var(--shelfy-text)] text-sm max-w-[160px] truncate">{v.pdv}</TableCell>
                          <TableCell className="text-[var(--shelfy-muted)] text-xs hidden md:table-cell">{v.vendedor}</TableCell>
                          <TableCell className="text-right text-[var(--shelfy-text)] text-sm tabular-nums hidden lg:table-cell">{v.bultos}</TableCell>
                          <TableCell className="text-right font-semibold text-emerald-600 text-sm tabular-nums">{formatCompact(v.total)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                <div className="px-5 py-3 border-t border-[var(--shelfy-border)] flex justify-between items-center text-xs text-[var(--shelfy-muted)]">
                  <span>
                    {filteredVentas.length} comprobante{filteredVentas.length !== 1 ? "s" : ""}
                    {searchQuery ? ` · filtrado de ${data?.ventas?.length || 0}` : ""}
                  </span>
                </div>
              </TabsContent>

              {/* TAB: ARTÍCULOS */}
              <TabsContent value="articulos" className="m-0 border-none outline-none">
                <Table>
                  <TableHeader>
                    <TableRow className="border-[var(--shelfy-border)] hover:bg-transparent bg-black/[0.015]">
                      <TableHead className="text-[var(--shelfy-muted)] font-semibold text-xs uppercase tracking-wide w-8 text-center">#</TableHead>
                      <TableHead className="text-[var(--shelfy-muted)] font-semibold text-xs uppercase tracking-wide">Artículo</TableHead>
                      <TableHead className="text-[var(--shelfy-muted)] font-semibold text-xs uppercase tracking-wide text-right">Bultos</TableHead>
                      <TableHead className="text-[var(--shelfy-muted)] font-semibold text-xs uppercase tracking-wide text-right">Monto Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 6 }).map((_, i) => <TableRowSkeleton key={i} cols={4} />)
                    ) : !data?.articulos?.length ? (
                      <TableRow><TableCell colSpan={4}><EmptyState message="Sin artículos para el período" /></TableCell></TableRow>
                    ) : (
                      data.articulos.map((a: { id: string; codigo: string; descripcion: string; bultos: number; total: number }, idx: number) => (
                        <TableRow key={a.id} className="border-[var(--shelfy-border)] hover:bg-black/[0.02] transition-colors">
                          <TableCell className="text-center text-xs font-semibold text-[var(--shelfy-muted)]">{idx + 1}</TableCell>
                          <TableCell>
                            <p className="font-medium text-[var(--shelfy-text)] text-sm leading-tight">{a.descripcion}</p>
                            <p className="text-[10px] font-mono text-[var(--shelfy-muted)] mt-0.5">{a.codigo}</p>
                          </TableCell>
                          <TableCell className="text-right text-[var(--shelfy-text)] font-medium tabular-nums text-sm">{a.bultos.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-semibold text-emerald-600 tabular-nums text-sm">{formatCompact(a.total)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TabsContent>
            </Tabs>
          </Card>
        </main>
      </div>

      {/* ── DRAWER ── */}
      <Sheet open={drawerOpen} onOpenChange={(open) => !open && closeDrawer()}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto bg-[var(--shelfy-panel)] border-l border-[var(--shelfy-border)]">
          <SheetHeader className="mb-5">
            <SheetTitle className="text-lg font-semibold text-[var(--shelfy-text)]">
              {drawerType === "vendedor" ? "Perfil del Vendedor" : "Detalle del Comprobante"}
            </SheetTitle>
            <SheetDescription className="text-xs text-[var(--shelfy-muted)] font-mono">{drawerId}</SheetDescription>
          </SheetHeader>

          {drawerLoading ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 pb-4 border-b border-[var(--shelfy-border)]">
                <div className="w-11 h-11 rounded-full bg-black/[0.06] animate-pulse" />
                <SkeletonLine w="40%" h="1.25rem" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="bg-black/[0.02] rounded-xl p-4 border border-[var(--shelfy-border)] space-y-2">
                    <SkeletonLine w="60%" h="0.65rem" />
                    <SkeletonLine w="80%" h="1.5rem" />
                  </div>
                ))}
              </div>
            </div>
          ) : drawerData ? (
            <div className="space-y-5">
              {drawerType === "vendedor" && (
                <>
                  <div className="flex items-center gap-3 pb-4 border-b border-[var(--shelfy-border)]">
                    <div className="w-11 h-11 rounded-full bg-[var(--shelfy-accent)]/10 flex items-center justify-center shrink-0">
                      <Users className="w-5 h-5 text-[var(--shelfy-accent)]" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-[var(--shelfy-text)]">{drawerData.nombre}</h3>
                      <p className="text-xs text-[var(--shelfy-muted)]">Últimos 30 días</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <DrawerStat label="Ventas" value={formatCompact(drawerData.ventas_30d)} sub={formatCurrency(drawerData.ventas_30d)} color="text-emerald-600" />
                    <DrawerStat label="Bultos" value={drawerData.bultos_30d?.toLocaleString() ?? "—"} color="text-[var(--shelfy-text)]" />
                    <DrawerStat label="PDVs Activos" value={drawerData.clientes_activos} color="text-blue-600" />
                    <DrawerStat label="Comprobantes" value={drawerData.cantidad_comprobantes} color="text-[var(--shelfy-text)]" />
                  </div>
                  <div className="text-center pt-1">
                    <button
                      onClick={() => { closeDrawer(); setSelectedVendedor(drawerData.nombre); setActiveTab("ventas"); }}
                      className="text-xs text-[var(--shelfy-accent)] hover:underline inline-flex items-center gap-1"
                    >
                      Ver comprobantes de este vendedor <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </div>
                </>
              )}

              {drawerType === "venta" && (
                <>
                  <div className="flex items-center justify-between pb-4 border-b border-[var(--shelfy-border)]">
                    <div>
                      <p className="text-xs text-[var(--shelfy-muted)] mb-0.5">Comprobante</p>
                      <h3 className="font-mono font-semibold text-[var(--shelfy-text)]">{drawerData.comprobante}</h3>
                      <p className="text-xs text-[var(--shelfy-muted)] mt-1">
                        {new Date(drawerData.fecha).toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-[var(--shelfy-muted)] mb-0.5">Total</p>
                      <p className="text-xl font-bold text-emerald-600 tabular-nums">{formatCurrency(drawerData.total)}</p>
                      <p className="text-xs text-[var(--shelfy-muted)]">{drawerData.bultos} bultos</p>
                    </div>
                  </div>

                  <div className="bg-black/[0.025] rounded-xl p-3.5 border border-[var(--shelfy-border)] space-y-2">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-[var(--shelfy-muted)] shrink-0" />
                      <span className="text-sm font-medium text-[var(--shelfy-text)]">{drawerData.cliente}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="w-3.5 h-3.5 text-[var(--shelfy-muted)] shrink-0" />
                      <span className="text-sm text-[var(--shelfy-text)]">{drawerData.vendedor}</span>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider mb-2">
                      Artículos · {drawerData.bultos} bultos
                    </p>
                    <div className="border border-[var(--shelfy-border)] rounded-xl overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-[var(--shelfy-border)] hover:bg-transparent bg-black/[0.02]">
                            <TableHead className="text-xs text-[var(--shelfy-muted)] font-semibold py-2">Cant.</TableHead>
                            <TableHead className="text-xs text-[var(--shelfy-muted)] font-semibold py-2">Artículo</TableHead>
                            <TableHead className="text-xs text-[var(--shelfy-muted)] font-semibold text-right py-2">$</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {drawerData.items.map((item: { cantidad: number; descripcion: string; codigo: string; importe: number }, i: number) => (
                            <TableRow key={i} className="border-[var(--shelfy-border)] hover:bg-transparent">
                              <TableCell className="text-xs text-[var(--shelfy-muted)] py-2 tabular-nums w-12">{item.cantidad}</TableCell>
                              <TableCell className="py-2">
                                <p className="text-xs font-medium text-[var(--shelfy-text)] truncate max-w-[180px]" title={item.descripcion}>{item.descripcion}</p>
                                <p className="text-[10px] text-[var(--shelfy-muted)] font-mono">{item.codigo}</p>
                              </TableCell>
                              <TableCell className="text-xs text-right font-semibold text-[var(--shelfy-text)] py-2 tabular-nums">{formatCurrency(item.importe)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-52 gap-3 text-[var(--shelfy-muted)]">
              <div className="w-14 h-14 rounded-2xl bg-[var(--shelfy-border)]/50 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 opacity-40" />
              </div>
              <p className="text-sm">No se encontró información.</p>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// --- Sub-components ---

function KpiCard({
  icon, iconBg, label, value, sub, period
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string | number;
  sub?: string;
  period?: string;
}) {
  return (
    <Card className="bg-[var(--shelfy-panel)] border-[var(--shelfy-border)] shadow-sm">
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0 mt-0.5`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-[var(--shelfy-muted)] truncate">{label}</p>
          <p className="text-xl font-bold text-[var(--shelfy-text)] tabular-nums leading-tight mt-0.5">{value}</p>
          {sub && <p className="text-[10px] text-[var(--shelfy-muted)] mt-0.5 truncate">{sub}</p>}
          {period && (
            <div className="flex items-center gap-0.5 mt-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-[10px] text-[var(--shelfy-muted)]">{period}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DrawerStat({
  label, value, sub, color = "text-[var(--shelfy-text)]"
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-black/[0.02] rounded-xl p-4 border border-[var(--shelfy-border)]">
      <p className="text-xs text-[var(--shelfy-muted)] mb-1">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-[var(--shelfy-muted)] mt-0.5">{sub}</p>}
    </div>
  );
}
