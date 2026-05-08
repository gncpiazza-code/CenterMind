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
  DollarSign, Package, UserPlus, Search, Calendar, MapPin, Users, Receipt, Printer, AlertTriangle, ShoppingCart, TrendingUp
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { fetchSupervisionV2Dashboard } from "@/lib/api";
import { Button } from "@/components/ui/Button";

const formatCurrency = (val: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val);

import { useRouter } from "next/navigation";

export default function SupervisionV2Page() {
  const { user } = useAuth();
  const router = useRouter();
  
  React.useEffect(() => {
    if (user && !user.is_superadmin) {
      router.push("/supervision");
    }
  }, [user, router]);

  const distId = user?.id_distribuidor || 2; // Fallback to 2 for mockup if not logged in

  const { 
    dateRange, setDateRange, 
    searchQuery, setSearchQuery,
    activeTab, setActiveTab,
    selectedSucursal, setSelectedSucursal,
    selectedVendedor, setSelectedVendedor,
    drawerOpen, drawerType, drawerId, openDrawer, closeDrawer
  } = useSupervisionV2Store();

  const { data, isLoading } = useQuery({
    queryKey: ['supervision-v2-dashboard', distId, dateRange, selectedSucursal, selectedVendedor],
    queryFn: () => fetchSupervisionV2Dashboard(distId, { 
      dias: dateRange === 'hoy' ? 1 : dateRange === 'semana' ? 7 : 30, // Simplification
      sucursal: selectedSucursal || undefined, 
      vendedor: selectedVendedor ? selectedVendedor.toString() : undefined 
    }),
    enabled: !!distId,
  });

  return (
    <div className="flex h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar title="Supervisión de Ventas" />
        
        <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {/* 1. GLOBAL FILTERS */}
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-[var(--shelfy-panel)] p-4 rounded-xl border border-[var(--shelfy-border)] shadow-sm">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[var(--shelfy-muted)]" />
                <Input 
                  placeholder="Buscar PDV, Vendedor, ERP..." 
                  className="pl-9 bg-[var(--shelfy-bg)] border-[var(--shelfy-border)]"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={dateRange} onValueChange={(v: any) => setDateRange(v)}>
                <SelectTrigger className="w-[140px] bg-[var(--shelfy-bg)]">
                  <Calendar className="w-4 h-4 mr-2 text-[var(--shelfy-muted)]" />
                  <SelectValue placeholder="Fecha" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hoy">Hoy</SelectItem>
                  <SelectItem value="semana">Esta Semana</SelectItem>
                  <SelectItem value="mes">Este Mes</SelectItem>
                  <SelectItem value="personalizado">Personalizado...</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center gap-2 w-full md:w-auto">
              <Select value={selectedSucursal || "todas"} onValueChange={(v: any) => setSelectedSucursal(v === "todas" ? null : v)}>
                <SelectTrigger className="w-[140px] bg-[var(--shelfy-bg)]">
                  <MapPin className="w-4 h-4 mr-2 text-[var(--shelfy-muted)]" />
                  <SelectValue placeholder="Sucursal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas las Sucursales</SelectItem>
                  <SelectItem value="norte">Sucursal Norte</SelectItem>
                  <SelectItem value="sur">Sucursal Sur</SelectItem>
                </SelectContent>
              </Select>
              <Select value={selectedVendedor ? String(selectedVendedor) : "todos"} onValueChange={(v: any) => setSelectedVendedor(v === "todos" ? null : Number(v))}>
                <SelectTrigger className="w-[140px] bg-[var(--shelfy-bg)]">
                  <Users className="w-4 h-4 mr-2 text-[var(--shelfy-muted)]" />
                  <SelectValue placeholder="Vendedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los Vendedores</SelectItem>
                  <SelectItem value="1">Juan Perez</SelectItem>
                  <SelectItem value="2">Maria Gomez</SelectItem>
                  <SelectItem value="3">Carlos Ruiz</SelectItem>
                  <SelectItem value="4">Ana Lopez</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 2. KPIs (Orientados a VENTA) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-[var(--shelfy-panel)] border-[var(--shelfy-border)] shadow-sm">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <DollarSign className="w-6 h-6 text-emerald-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--shelfy-muted)]">Ventas Totales</p>
                  <h3 className="text-2xl font-bold text-[var(--shelfy-text)]">
                    {isLoading ? "..." : formatCurrency(data?.kpis.ventas || 0)}
                  </h3>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-[var(--shelfy-panel)] border-[var(--shelfy-border)] shadow-sm">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                  <Package className="w-6 h-6 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--shelfy-muted)]">Volumen (Bultos)</p>
                  <h3 className="text-2xl font-bold text-[var(--shelfy-text)]">
                    {isLoading ? "..." : (data?.kpis.bultos || 0).toLocaleString()}
                  </h3>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-[var(--shelfy-panel)] border-[var(--shelfy-border)] shadow-sm">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-violet-500/10 flex items-center justify-center shrink-0">
                  <ShoppingCart className="w-6 h-6 text-violet-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--shelfy-muted)]">Ticket Promedio</p>
                  <h3 className="text-2xl font-bold text-[var(--shelfy-text)]">
                    {isLoading ? "..." : formatCurrency(data?.kpis.ticketPromedio || 0)}
                  </h3>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-[var(--shelfy-panel)] border-[var(--shelfy-border)] shadow-sm">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
                  <UserPlus className="w-6 h-6 text-orange-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--shelfy-muted)]">Clientes con Venta</p>
                  <h3 className="text-2xl font-bold text-[var(--shelfy-text)]">
                    {isLoading ? "..." : data?.kpis.clientesConVenta}
                  </h3>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 3. CHARTS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-[var(--shelfy-panel)] border-[var(--shelfy-border)] shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-[var(--shelfy-muted)] uppercase tracking-wider">Ventas y Bultos por Vendedor</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                {isLoading ? (
                  <div className="w-full h-full flex items-center justify-center text-[var(--shelfy-muted)]">Cargando gráfico...</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data?.chartVendedores} margin={{ top: 10, right: 10, left: 20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--shelfy-border)" vertical={false} />
                      <XAxis dataKey="name" stroke="var(--shelfy-muted)" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis yAxisId="left" stroke="var(--shelfy-muted)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val: any) => `$${val/1000000}M`} />
                      <YAxis yAxisId="right" orientation="right" stroke="var(--shelfy-muted)" fontSize={12} tickLine={false} axisLine={false} />
                      <RechartsTooltip 
                        cursor={{fill: 'var(--shelfy-bg)'}}
                        contentStyle={{ backgroundColor: 'var(--shelfy-panel)', borderColor: 'var(--shelfy-border)', borderRadius: '8px', color: 'var(--shelfy-text)' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                      <Bar yAxisId="left" dataKey="ventas" name="Ventas ($)" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
                      <Bar yAxisId="right" dataKey="bultos" name="Bultos" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="bg-[var(--shelfy-panel)] border-[var(--shelfy-border)] shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-[var(--shelfy-muted)] uppercase tracking-wider">Tendencia de Ventas (Este Mes)</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                {isLoading ? (
                  <div className="w-full h-full flex items-center justify-center text-[var(--shelfy-muted)]">Cargando gráfico...</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data?.chartTendencia} margin={{ top: 10, right: 10, left: 20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--shelfy-border)" vertical={false} />
                      <XAxis dataKey="date" stroke="var(--shelfy-muted)" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis yAxisId="left" stroke="var(--shelfy-muted)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val: any) => `$${val/1000000}M`} />
                      <YAxis yAxisId="right" orientation="right" stroke="var(--shelfy-muted)" fontSize={12} tickLine={false} axisLine={false} />
                      <RechartsTooltip 
                        contentStyle={{ backgroundColor: 'var(--shelfy-panel)', borderColor: 'var(--shelfy-border)', borderRadius: '8px', color: 'var(--shelfy-text)' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                      <Line yAxisId="left" type="monotone" dataKey="ventas" name="Ventas ($)" stroke="#10b981" strokeWidth={3} dot={{r: 4, fill: '#10b981'}} activeDot={{r: 6}} />
                      <Line yAxisId="right" type="monotone" dataKey="bultos" name="Bultos" stroke="#3b82f6" strokeWidth={3} dot={{r: 4, fill: '#3b82f6'}} activeDot={{r: 6}} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 4. DATA TABLES (DRILL-DOWN) */}
          <Card className="bg-[var(--shelfy-panel)] border-[var(--shelfy-border)] shadow-sm flex flex-col">
            <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full">
              <div className="px-6 pt-4 border-b border-[var(--shelfy-border)] overflow-x-auto">
                <TabsList className="bg-transparent h-auto p-0 gap-6 min-w-max">
                  <TabsTrigger 
                    value="ranking" 
                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[var(--shelfy-accent)] rounded-none px-0 pb-3 font-medium text-[var(--shelfy-muted)] data-[state=active]:text-[var(--shelfy-text)]"
                  >
                    Ranking Vendedores
                  </TabsTrigger>
                  <TabsTrigger 
                    value="ventas" 
                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[var(--shelfy-accent)] rounded-none px-0 pb-3 font-medium text-[var(--shelfy-muted)] data-[state=active]:text-[var(--shelfy-text)]"
                  >
                    Transacciones (Comprobantes)
                  </TabsTrigger>
                  <TabsTrigger 
                    value="articulos" 
                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[var(--shelfy-accent)] rounded-none px-0 pb-3 font-medium text-[var(--shelfy-muted)] data-[state=active]:text-[var(--shelfy-text)]"
                  >
                    Ranking Artículos
                  </TabsTrigger>
                  <TabsTrigger 
                    value="cc" 
                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[var(--shelfy-accent)] rounded-none px-0 pb-3 font-medium text-[var(--shelfy-muted)] data-[state=active]:text-[var(--shelfy-text)]"
                  >
                    Cuentas Corrientes (Saldos y Mora)
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="p-0">
                {/* TAB 1: RANKING VENDEDORES */}
                <TabsContent value="ranking" className="m-0 border-none outline-none">
                  <Table>
                    <TableHeader className="bg-black/[0.02]">
                      <TableRow className="border-[var(--shelfy-border)] hover:bg-transparent">
                        <TableHead className="text-[var(--shelfy-muted)] font-semibold">Vendedor</TableHead>
                        <TableHead className="text-[var(--shelfy-muted)] font-semibold text-right">Ventas ($)</TableHead>
                        <TableHead className="text-[var(--shelfy-muted)] font-semibold text-right">Bultos</TableHead>
                        <TableHead className="text-[var(--shelfy-muted)] font-semibold text-center">Altas</TableHead>
                        <TableHead className="text-[var(--shelfy-muted)] font-semibold text-right">Ticket Promedio</TableHead>
                        <TableHead className="text-right"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-[var(--shelfy-muted)]">Cargando...</TableCell></TableRow>
                      ) : (
                        data?.rankingVendedores?.map((v) => (
                          <TableRow key={v.id} className="border-[var(--shelfy-border)] hover:bg-black/[0.02] cursor-pointer" onClick={() => openDrawer('vendedor', v.id)}>
                            <TableCell className="font-medium text-[var(--shelfy-text)]">{v.nombre}</TableCell>
                            <TableCell className="text-right text-emerald-600 font-medium">{formatCurrency(v.ventas)}</TableCell>
                            <TableCell className="text-right text-[var(--shelfy-text)]">{v.bultos}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className="bg-violet-500/10 text-violet-600 border-violet-500/20">{v.altas}</Badge>
                            </TableCell>
                            <TableCell className="text-right text-[var(--shelfy-text)]">{formatCurrency(v.ticketPromedio)}</TableCell>
                            <TableCell className="text-right">
                              <span className="text-xs text-[var(--shelfy-accent)] hover:underline">Ver detalle</span>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TabsContent>

                {/* TAB 2: TRANSACCIONES (VENTAS) */}
                <TabsContent value="ventas" className="m-0 border-none outline-none">
                  <Table>
                    <TableHeader className="bg-black/[0.02]">
                      <TableRow className="border-[var(--shelfy-border)] hover:bg-transparent">
                        <TableHead className="text-[var(--shelfy-muted)] font-semibold">Comprobante</TableHead>
                        <TableHead className="text-[var(--shelfy-muted)] font-semibold">Fecha</TableHead>
                        <TableHead className="text-[var(--shelfy-muted)] font-semibold">Cliente (PDV)</TableHead>
                        <TableHead className="text-[var(--shelfy-muted)] font-semibold">Vendedor</TableHead>
                        <TableHead className="text-[var(--shelfy-muted)] font-semibold text-center">Condición</TableHead>
                        <TableHead className="text-[var(--shelfy-muted)] font-semibold text-right">Bultos</TableHead>
                        <TableHead className="text-[var(--shelfy-muted)] font-semibold text-right">Total ($)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-8 text-[var(--shelfy-muted)]">Cargando...</TableCell></TableRow>
                      ) : (
                        data?.ventas?.map((v) => (
                          <TableRow key={v.id} className="border-[var(--shelfy-border)] hover:bg-black/[0.02] cursor-pointer" onClick={() => openDrawer('venta', v.id)}>
                            <TableCell className="font-mono text-xs text-[var(--shelfy-text)] flex items-center gap-2">
                              <Receipt className="w-3 h-3 text-[var(--shelfy-muted)]" />
                              {v.comprobante}
                            </TableCell>
                            <TableCell className="text-[var(--shelfy-text)] text-sm">{new Date(v.fecha).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</TableCell>
                            <TableCell className="text-[var(--shelfy-text)] text-sm">{v.pdv}</TableCell>
                            <TableCell className="text-[var(--shelfy-text)] text-sm">{v.vendedor}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className={v.condicion === 'Contado' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-orange-500/10 text-orange-600 border-orange-500/20'}>
                                {v.condicion}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-[var(--shelfy-text)]">{v.bultos}</TableCell>
                            <TableCell className="text-right font-medium text-emerald-600">{formatCurrency(v.total)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                  <div className="p-4 border-t border-[var(--shelfy-border)] flex justify-between items-center text-sm text-[var(--shelfy-muted)] bg-black/[0.01]">
                    <span>Mostrando 4 de 1.245 transacciones</span>
                    <div className="flex gap-2">
                      <button className="px-3 py-1 rounded border border-[var(--shelfy-border)] hover:bg-[var(--shelfy-border)]/50 disabled:opacity-50" disabled>Anterior</button>
                      <button className="px-3 py-1 rounded border border-[var(--shelfy-border)] hover:bg-[var(--shelfy-border)]/50">Siguiente</button>
                    </div>
                  </div>
                </TabsContent>

                {/* TAB 3: ARTICULOS */}
                <TabsContent value="articulos" className="m-0 border-none outline-none">
                  <Table>
                    <TableHeader className="bg-black/[0.02]">
                      <TableRow className="border-[var(--shelfy-border)] hover:bg-transparent">
                        <TableHead className="text-[var(--shelfy-muted)] font-semibold">Código</TableHead>
                        <TableHead className="text-[var(--shelfy-muted)] font-semibold">Descripción del Artículo</TableHead>
                        <TableHead className="text-[var(--shelfy-muted)] font-semibold text-right">Bultos Vendidos</TableHead>
                        <TableHead className="text-[var(--shelfy-muted)] font-semibold text-right">Monto Total ($)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        <TableRow><TableCell colSpan={4} className="text-center py-8 text-[var(--shelfy-muted)]">Cargando...</TableCell></TableRow>
                      ) : (
                        data?.articulos?.map((a) => (
                          <TableRow key={a.id} className="border-[var(--shelfy-border)] hover:bg-black/[0.02]">
                            <TableCell className="font-mono text-xs text-[var(--shelfy-muted)]">{a.codigo}</TableCell>
                            <TableCell className="font-medium text-[var(--shelfy-text)]">{a.descripcion}</TableCell>
                            <TableCell className="text-right text-[var(--shelfy-text)] font-medium">{a.bultos}</TableCell>
                            <TableCell className="text-right text-emerald-600 font-medium">{formatCurrency(a.total)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TabsContent>

                {/* TAB 4: CUENTAS CORRIENTES */}
                <TabsContent value="cc" className="m-0 border-none outline-none">
                  <div className="p-4 border-b border-[var(--shelfy-border)] flex justify-end bg-black/[0.01]">
                    <Button variant="outline" size="sm" className="gap-2 text-[var(--shelfy-text)]">
                      <Printer className="w-4 h-4" /> Imprimir Reporte CC
                    </Button>
                  </div>
                  <Table>
                    <TableHeader className="bg-black/[0.02]">
                      <TableRow className="border-[var(--shelfy-border)] hover:bg-transparent">
                        <TableHead className="text-[var(--shelfy-muted)] font-semibold">Cliente (PDV)</TableHead>
                        <TableHead className="text-[var(--shelfy-muted)] font-semibold text-right">Deuda Total</TableHead>
                        <TableHead className="text-[var(--shelfy-muted)] font-semibold text-center">Antigüedad (Días)</TableHead>
                        <TableHead className="text-[var(--shelfy-muted)] font-semibold text-center">Comp. Adeudados</TableHead>
                        <TableHead className="text-[var(--shelfy-muted)] font-semibold">Tramos de Mora</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        <TableRow><TableCell colSpan={5} className="text-center py-8 text-[var(--shelfy-muted)]">Cargando...</TableCell></TableRow>
                      ) : (
                        data?.cc?.map((c) => (
                          <TableRow key={c.id} className="border-[var(--shelfy-border)] hover:bg-black/[0.02] cursor-pointer" onClick={() => openDrawer('pdv', c.id)}>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-medium text-[var(--shelfy-text)]">{c.fantasia}</span>
                                <span className="text-[10px] text-[var(--shelfy-muted)] font-mono">ERP #{c.erp}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-rose-500 font-medium">{formatCurrency(c.deuda)}</TableCell>
                            <TableCell className="text-center">
                              <span className={`font-medium ${c.antiguedad > 30 ? 'text-rose-500' : 'text-orange-500'}`}>
                                {c.antiguedad}
                              </span>
                            </TableCell>
                            <TableCell className="text-center text-[var(--shelfy-text)]">{c.comprobantes}</TableCell>
                            <TableCell className="text-[var(--shelfy-muted)] text-xs">{c.mora}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TabsContent>
              </div>
            </Tabs>
          </Card>
        </main>
      </div>

      {/* 5. DRAWER (SHEET) FOR DRILL-DOWN DETAILS */}
      <Sheet open={drawerOpen} onOpenChange={(open) => !open && closeDrawer()}>
        <SheetContent className="w-full sm:max-w-md md:max-w-lg overflow-y-auto bg-[var(--shelfy-panel)] border-l-[var(--shelfy-border)]">
          <SheetHeader className="mb-6">
            <SheetTitle className="text-xl text-[var(--shelfy-text)]">
              {drawerType === 'vendedor' && 'Perfil del Vendedor'}
              {drawerType === 'pdv' && 'Ficha del Cliente (PDV)'}
              {drawerType === 'venta' && 'Detalle del Comprobante'}
            </SheetTitle>
            <SheetDescription className="text-[var(--shelfy-muted)]">
              ID de referencia: {drawerId}
            </SheetDescription>
          </SheetHeader>

          {drawerType === 'venta' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 bg-black/[0.02] p-4 rounded-lg border border-[var(--shelfy-border)]">
                <div>
                  <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wider mb-1">Comprobante</p>
                  <p className="font-mono text-sm font-medium text-[var(--shelfy-text)]">FC-A-0001-00001234</p>
                </div>
                <div>
                  <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wider mb-1">Fecha</p>
                  <p className="text-sm font-medium text-[var(--shelfy-text)]">07/05/2026 10:30</p>
                </div>
                <div>
                  <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wider mb-1">Cliente</p>
                  <p className="text-sm font-medium text-[var(--shelfy-text)]">Kiosco El Sol</p>
                </div>
                <div>
                  <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wider mb-1">Condición</p>
                  <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20">Cta. Cte.</Badge>
                </div>
              </div>

              <div>
                <h4 className="font-medium text-[var(--shelfy-text)] mb-3 flex items-center gap-2">
                  <Package className="w-4 h-4 text-[var(--shelfy-muted)]" />
                  Artículos (Líneas)
                </h4>
                <div className="border border-[var(--shelfy-border)] rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader className="bg-black/[0.02]">
                      <TableRow className="border-[var(--shelfy-border)]">
                        <TableHead className="text-xs">Artículo</TableHead>
                        <TableHead className="text-xs text-right">Cant.</TableHead>
                        <TableHead className="text-xs text-right">P. Unit</TableHead>
                        <TableHead className="text-xs text-right">Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow className="border-[var(--shelfy-border)]">
                        <TableCell className="text-xs">LIVERPOOL SPECIAL RED BOX</TableCell>
                        <TableCell className="text-xs text-right">10</TableCell>
                        <TableCell className="text-xs text-right">$2.500</TableCell>
                        <TableCell className="text-xs text-right font-medium">$25.000</TableCell>
                      </TableRow>
                      <TableRow className="border-[var(--shelfy-border)]">
                        <TableCell className="text-xs">LIVERPOOL SPECIAL GREEN BOX</TableCell>
                        <TableCell className="text-xs text-right">5</TableCell>
                        <TableCell className="text-xs text-right">$2.500</TableCell>
                        <TableCell className="text-xs text-right font-medium">$12.500</TableCell>
                      </TableRow>
                      <TableRow className="border-[var(--shelfy-border)]">
                        <TableCell className="text-xs">LIVERPOOL BLUE POP BOX</TableCell>
                        <TableCell className="text-xs text-right">3</TableCell>
                        <TableCell className="text-xs text-right">$2.500</TableCell>
                        <TableCell className="text-xs text-right font-medium">$7.500</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                  <div className="p-3 bg-black/[0.03] flex justify-between items-center border-t border-[var(--shelfy-border)]">
                    <span className="font-medium text-sm text-[var(--shelfy-text)]">Total</span>
                    <span className="font-bold text-lg text-emerald-600">$45.000</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {drawerType !== 'venta' && (
            <div className="flex flex-col items-center justify-center h-64 text-[var(--shelfy-muted)] text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-[var(--shelfy-border)]/50 flex items-center justify-center">
                {drawerType === 'vendedor' ? <Users className="w-8 h-8" /> : <MapPin className="w-8 h-8" />}
              </div>
              <p>Aquí se cargará el perfil detallado del {drawerType === 'vendedor' ? 'vendedor' : 'PDV'}.</p>
              <p className="text-xs max-w-[250px]">Incluirá gráficos individuales, historial de visitas y métricas específicas.</p>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
