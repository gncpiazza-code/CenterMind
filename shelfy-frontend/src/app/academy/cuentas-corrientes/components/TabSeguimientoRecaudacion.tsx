"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageSpinner } from "@/components/ui/Spinner";
import { DatePicker } from "@/components/ui/date-picker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
    BarChart3,
    Map as MapIcon,
    Users,
    TrendingUp,
    TrendingDown,
    Calendar,
    Filter,
    Download,
    AlertCircle
} from "lucide-react";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
    PieChart, Pie, Sector
} from "recharts";
import {
    fetchRecaudacionSummary,
    fetchRecaudacionDetallada,
    fetchClientesMuertos,
    fetchERPVendedores,
} from "@/lib/api";
import { academiaKeys } from "@/lib/query-keys";

export default function TabSeguimientoRecaudacion({ distId }: { distId: number }) {
    const [desde, setDesde] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return d.toISOString().split('T')[0];
    });
    const [hasta, setHasta] = useState(new Date().toISOString().split('T')[0]);
    const [selectedVendedor, setSelectedVendedor] = useState<string>("");
    const [view, setView] = useState<"kpis" | "detallada" | "mapa" | "muertos">("kpis");

    const { data: summary, isLoading: loadingSummary } = useQuery({
        queryKey: academiaKeys.recaudacionSummary(distId, desde, hasta, selectedVendedor),
        queryFn: () => fetchRecaudacionSummary(distId, desde, hasta, selectedVendedor || undefined),
        enabled: !!distId,
        staleTime: 5 * 60 * 1000,
        placeholderData: (prev) => prev,
    });

    const { data: detallada = [] } = useQuery({
        queryKey: academiaKeys.recaudacionDetallada(distId, desde, hasta, selectedVendedor),
        queryFn: () => fetchRecaudacionDetallada(distId, desde, hasta, selectedVendedor || undefined),
        enabled: !!distId,
        staleTime: 5 * 60 * 1000,
        placeholderData: (prev) => prev,
    });

    const { data: muertos = [] } = useQuery({
        queryKey: academiaKeys.clientesMuertos(distId),
        queryFn: () => fetchClientesMuertos(distId, 30),
        enabled: !!distId,
        staleTime: 10 * 60 * 1000,
    });

    const { data: vendedorList = [] } = useQuery({
        queryKey: academiaKeys.erpVendedores(distId),
        queryFn: () => fetchERPVendedores(distId),
        enabled: !!distId,
        staleTime: 10 * 60 * 1000,
    });

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(val);

    if (loadingSummary && !summary) return <PageSpinner />;

    return (
        <div className="flex flex-col gap-6 animate-in fade-in duration-500">
            {/* Header / Filtros */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2 bg-[var(--shelfy-panel)] p-1 rounded-xl border border-[var(--shelfy-border)]">
                    <button onClick={() => setView("kpis")} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${view === 'kpis' ? 'bg-[var(--shelfy-primary)] text-white shadow-md' : 'text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]'}`}>KPIs</button>
                    <button onClick={() => setView("detallada")} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${view === 'detallada' ? 'bg-[var(--shelfy-primary)] text-white shadow-md' : 'text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]'}`}>Detalle</button>
                    <button onClick={() => setView("mapa")} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${view === 'mapa' ? 'bg-[var(--shelfy-primary)] text-white shadow-md' : 'text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]'}`}>Mapa</button>
                    <button onClick={() => setView("muertos")} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${view === 'muertos' ? 'bg-[var(--shelfy-primary)] text-white shadow-md' : 'text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]'}`}>Inactivos</button>
                </div>

                <div className="flex items-center gap-2">
                    <select
                        value={selectedVendedor}
                        onChange={e => setSelectedVendedor(e.target.value)}
                        className="px-3 py-2 bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] rounded-xl text-xs text-[var(--shelfy-text)] outline-none focus:ring-2 focus:ring-[var(--shelfy-primary)]"
                    >
                        <option value="">VISTA GENERAL</option>
                        {vendedorList.map(v => (
                            <option key={v} value={v}>{v}</option>
                        ))}
                    </select>

                    <div className="flex items-center gap-2 px-3 py-2 bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] rounded-xl">
                        <Calendar size={14} className="text-[var(--shelfy-muted)]" />
                        <div className="min-w-[155px] [&>div>button]:h-7 [&>div>button]:text-xs [&>div>button]:border-0 [&>div>button]:bg-transparent [&>div>button]:px-1.5">
                            <DatePicker value={desde} onChange={setDesde} placeholder="Desde" />
                        </div>
                        <span className="text-[var(--shelfy-muted)]">-</span>
                        <div className="min-w-[155px] [&>div>button]:h-7 [&>div>button]:text-xs [&>div>button]:border-0 [&>div>button]:bg-transparent [&>div>button]:px-1.5">
                            <DatePicker value={hasta} onChange={setHasta} placeholder="Hasta" minDate={desde || undefined} />
                        </div>
                    </div>
                </div>
            </div>

            {view === "kpis" && summary && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <KPICard title="Venta Total" value={formatCurrency(summary.venta_total ?? 0)} icon={<TrendingUp className="text-green-500" />} trend="+12%" />
                    <KPICard title="Clientes Activos" value={summary.clientes_activos ?? 0} icon={<Users className="text-blue-500" />} trend="+5%" />
                    <KPICard title="Ticket Promedio" value={formatCurrency(summary.ticket_promedio ?? 0)} icon={<BarChart3 className="text-violet-500" />} />
                    <KPICard title="Artículos Vendidos" value={summary.volumen_articulos ?? 0} icon={<TrendingUp className="text-amber-500" />} />

                    <Card className="lg:col-span-2">
                        <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                            <TrendingUp size={16} className="text-green-500" /> Top 10 Artículos más vendidos
                        </h3>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={summary.top_articulos ?? []} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} strokeOpacity={0.1} />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="articulo" type="category" width={100} tick={{ fontSize: 10 }} />
                                    <Tooltip />
                                    <Bar dataKey="cantidad" fill="#7c3aed" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>

                    <Card className="lg:col-span-2">
                        <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                            <TrendingDown size={16} className="text-red-500" /> Artículos con baja rotación
                        </h3>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={summary.bottom_articulos ?? []} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} strokeOpacity={0.1} />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="articulo" type="category" width={100} tick={{ fontSize: 10 }} />
                                    <Tooltip />
                                    <Bar dataKey="cantidad" fill="#f43f5e" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>
                </div>
            )}

            {view === "detallada" && (
                <Card>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold">Ventas Detalladas</h3>
                        <Button variant="ghost" size="sm"><Download size={14} /> Exportar</Button>
                    </div>
                    <div className="overflow-x-auto">
                        <Table className="w-full text-xs">
                            <TableHeader>
                                <TableRow className="border-b border-[var(--shelfy-border)] text-[var(--shelfy-muted)]">
                                    <TableHead className="py-2 text-left">Cliente</TableHead>
                                    <TableHead className="py-2 text-left">Comprobante</TableHead>
                                    <TableHead className="py-2 text-left">Tipo</TableHead>
                                    <TableHead className="py-2 text-left">Pago</TableHead>
                                    <TableHead className="py-2 text-right">Monto</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {detallada.map((row, i) => (
                                    <TableRow key={i} className="border-b border-[var(--shelfy-border)] last:border-0 hover:bg-[var(--shelfy-bg)]">
                                        <TableCell className="py-2 font-medium">{row.cliente}</TableCell>
                                        <TableCell className="py-2">{row.comprobante}</TableCell>
                                        <TableCell className="py-2">{row.tipo}</TableCell>
                                        <TableCell className="py-2">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] ${row.pago === 'CONTADO' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {row.pago}
                                            </span>
                                        </TableCell>
                                        <TableCell className="py-2 text-right font-bold">{formatCurrency(row.monto)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </Card>
            )}

            {view === "muertos" && (
                <Card>
                    <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                        <AlertCircle size={16} className="text-amber-500" /> Clientes Inactivos (últimos 30 días)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {muertos.map((c, i) => (
                            <div key={i} className="p-3 rounded-xl border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] flex justify-between items-center">
                                <div>
                                    <p className="text-xs font-bold text-[var(--shelfy-text)]">{c.nombre}</p>
                                    <p className="text-[10px] text-[var(--shelfy-muted)]">Última compra: {c.ultima_compra || 'Nunca'}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-bold text-red-500">{c.dias_inactivo} días</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {view === "mapa" && (
                <Card className="h-[500px] flex flex-col items-center justify-center text-[var(--shelfy-muted)]">
                    <MapIcon size={48} className="mb-4 opacity-20" />
                    <p className="text-sm italic">Mapa de calor - Requiere integración con Google Maps o Leaflet</p>
                    <p className="text-xs mt-2 px-10 text-center">Mostrando {summary?.puntos_mapa ?? 0} ubicaciones de clientes detectadas en la base de datos.</p>
                </Card>
            )}
        </div>
    );
}

function KPICard({ title, value, icon, trend }: { title: string, value: string | number, icon: React.ReactNode, trend?: string }) {
    return (
        <Card className="flex flex-col gap-2 relative overflow-hidden">
            <div className="flex justify-between items-start">
                <div className="p-2 bg-slate-50 border border-slate-100 rounded-lg">{icon}</div>
                {trend && <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">{trend}</span>}
            </div>
            <div>
                <p className="text-xs text-[var(--shelfy-muted)] font-medium">{title}</p>
                <p className="text-xl font-black text-[var(--shelfy-text)]">{value}</p>
            </div>
            <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-[var(--shelfy-primary)] opacity-[0.03] rounded-full"></div>
        </Card>
    );
}
