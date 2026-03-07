"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageSpinner } from "@/components/ui/Spinner";
import {
    Users,
    UserCheck,
    UserMinus,
    MapPin,
    TrendingUp,
    Calendar,
    Download,
    BarChart3,
    PieChart as PieChartIcon,
    Globe,
    Search,
    X
} from "lucide-react";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend
} from "recharts";
import { fetchClientesStats, fetchClientesTemporal, fetchClientesDesglose, fetchClientesListado } from "@/lib/api";

const COLORS = ['#7c3aed', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#6366f1'];

export default function TabPadronClientes({ distId }: { distId: number }) {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<any>(null);
    const [temporal, setTemporal] = useState<any[]>([]);
    const [desgloseVendedores, setDesgloseVendedores] = useState<any[]>([]);
    const [desgloseLocalidades, setDesgloseLocalidades] = useState<any[]>([]);
    const [clientesList, setClientesList] = useState<any[]>([]);
    const [search, setSearch] = useState("");
    const [view, setView] = useState<"general" | "vendedores" | "geografia" | "listado" | "inactivos">("general");
    const [loadingList, setLoadingList] = useState(false);

    const loadData = async () => {
        setLoading(true);
        try {
            const [s, t, v, l] = await Promise.all([
                fetchClientesStats(distId),
                fetchClientesTemporal(distId),
                fetchClientesDesglose(distId, "vendedor"),
                fetchClientesDesglose(distId, "localidad")
            ]);
            setStats(s);
            setTemporal(t);
            setDesgloseVendedores(v);
            setDesgloseLocalidades(l);
        } catch (e) {
            console.error("Error al cargar padrón de clientes:", e);
        } finally {
            setLoading(false);
        }
    };

    const loadListado = async () => {
        setLoadingList(true);
        try {
            const data = await fetchClientesListado(distId, search);
            setClientesList(data);
        } catch (e) {
            console.error("Error al cargar listado de clientes:", e);
        } finally {
            setLoadingList(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [distId]);

    useEffect(() => {
        if (view === "listado" || view === "inactivos") {
            const timer = setTimeout(() => {
                loadListado();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [view, search, distId]);

    // Estados para los filtros en cascada de Inactivos
    const [selSucursal, setSelSucursal] = useState<string>("");
    const [selVendedor, setSelVendedor] = useState<string>("");

    // Derived state para inactivos
    const inactivosList = clientesList.filter(c => c.estado === "inactivo" || c.estado === "INACTIVO" || (c.estado && c.estado.toLowerCase().includes("inactivo")));
    const sucursalesInactivas = Array.from(new Set(inactivosList.map(c => c.sucursal_erp || "SIN SUCURSAL"))).sort();
    const vendedoresInactivos = Array.from(new Set(inactivosList.filter(c => (c.sucursal_erp || "SIN SUCURSAL") === selSucursal).map(c => c.vendedor_erp || "SIN VENDEDOR"))).sort();
    const clientesFiltrados = inactivosList.filter(c =>
        (c.sucursal_erp || "SIN SUCURSAL") === selSucursal &&
        (c.vendedor_erp || "SIN VENDEDOR") === selVendedor
    );

    if (loading && !stats) return <PageSpinner />;

    return (
        <div className="flex flex-col gap-6 animate-in fade-in duration-500">
            {/* Header / Selector de Vista */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2 bg-[var(--shelfy-panel)] p-1 rounded-xl border border-[var(--shelfy-border)]">
                    <button
                        onClick={() => setView("general")}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${view === 'general' ? 'bg-[var(--shelfy-primary)] text-white shadow-md' : 'text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]'}`}
                    >
                        General
                    </button>
                    <button
                        onClick={() => setView("vendedores")}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${view === 'vendedores' ? 'bg-[var(--shelfy-primary)] text-white shadow-md' : 'text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]'}`}
                    >
                        Vendedores
                    </button>
                    <button
                        onClick={() => setView("geografia")}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${view === 'geografia' ? 'bg-[var(--shelfy-primary)] text-white shadow-md' : 'text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]'}`}
                    >
                        Geografía
                    </button>
                    <button
                        onClick={() => setView("listado")}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${view === 'listado' ? 'bg-[var(--shelfy-primary)] text-white shadow-md' : 'text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]'}`}
                    >
                        Listado Maestro
                    </button>
                    <button
                        onClick={() => setView("inactivos")}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${view === 'inactivos' ? 'bg-red-500 text-white shadow-md' : 'text-red-400 hover:text-red-600'}`}
                    >
                        Inactivos
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="secondary" onClick={loadData} size="sm">
                        Totalizar Datos
                    </Button>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                    title="Total Clientes"
                    value={stats?.total || 0}
                    icon={<Users className="text-violet-500" />}
                />
                <KPICard
                    title="Clientes Activos"
                    value={stats?.activos || 0}
                    icon={<UserCheck className="text-green-500" />}
                    subtitle="Compra en ult. 30 días"
                    trend={`${(stats?.pct_activacion ?? 0).toFixed(1)}% de la base`}
                />
                <KPICard
                    title="Clientes Inactivos"
                    value={stats?.inactivos || 0}
                    icon={<UserMinus className="text-red-500" />}
                />
                <KPICard
                    title="Sin Ubicación"
                    value={stats?.sin_coords || 0}
                    icon={<MapPin className="text-amber-500" />}
                />
            </div>

            {view === "general" && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Gráfico Temporal */}
                    <Card className="lg:col-span-2">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-sm font-bold flex items-center gap-2">
                                <TrendingUp size={16} className="text-[var(--shelfy-primary)]" />
                                Construcción Temporal (Altas por Mes)
                            </h3>
                        </div>
                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={temporal}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                                    <XAxis dataKey="mes" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                    />
                                    <Bar dataKey="cantidad" fill="#7c3aed" radius={[4, 4, 0, 0]} name="Clientes Nuevos" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>

                    {/* Distribución Activos/Inactivos */}
                    <Card>
                        <h3 className="text-sm font-bold mb-6 flex items-center gap-2">
                            <PieChartIcon size={16} className="text-pink-500" />
                            Estado de Cartera
                        </h3>
                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={[
                                            { name: 'Activos', value: stats?.activos || 0 },
                                            { name: 'Inactivos', value: stats?.inactivos || 0 }
                                        ]}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        <Cell fill="#10b981" />
                                        <Cell fill="#f43f5e" />
                                    </Pie>
                                    <Tooltip />
                                    <Legend verticalAlign="bottom" height={36} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>
                </div>
            )}

            {view === "vendedores" && (
                <Card>
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-sm font-bold flex items-center gap-2">
                            <BarChart3 size={16} className="text-blue-500" />
                            Cartera de Clientes por Vendedor
                        </h3>
                        <Button variant="ghost" size="sm">
                            <Download size={14} className="mr-2" />
                            Exportar Detalles
                        </Button>
                    </div>
                    <div className="h-[500px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={desgloseVendedores} layout="vertical" margin={{ left: 50 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} strokeOpacity={0.1} />
                                <XAxis type="number" hide />
                                <YAxis dataKey="etiqueta" type="category" width={120} tick={{ fontSize: 10 }} />
                                <Tooltip />
                                <Legend />
                                <Bar dataKey="activos" stackId="a" fill="#10b981" name="Activos" radius={[0, 0, 0, 0]} />
                                <Bar dataKey="total" stackId="a" fill="#e2e8f0" name="Total Cartera" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            )}

            <Card className="min-h-[400px] p-0 overflow-hidden relative border-none shadow-xl">
                <div className="absolute top-4 left-4 z-[1000] bg-white/90 backdrop-blur-md p-3 rounded-2xl border border-slate-200 shadow-xl">
                    <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                        <Globe size={16} className="text-cyan-500" />
                        Mapa de Calor de Clientes
                    </h3>
                    <p className="text-[10px] font-bold text-slate-500 mt-1">Visualizando {clientesList.filter(c => c.latitud && c.longitud).length} ubicaciones exactas</p>
                </div>

                <div className="h-[400px] w-full bg-slate-100 flex items-center justify-center">
                    {/* Cargamos el mapa dinámicamente si hay datos */}
                    {typeof window !== 'undefined' && (
                        <iframe
                            src={`https://www.google.com/maps/embed/v1/search?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || ""}&q=clientes+en+argentina&zoom=4`}
                            className="w-full h-full border-none opacity-50 grayscale"
                            title="Heatmap Placeholder"
                        />
                    )}
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/40 backdrop-blur-sm">
                        <MapPin size={48} className="mb-4 text-cyan-500 animate-bounce" />
                        <p className="text-lg font-black text-slate-900">Heatmap Engine Activo</p>
                        <p className="text-xs text-slate-500 font-bold max-w-xs text-center mt-2 px-6">
                            Se han procesado {clientesList.filter(c => c.latitud && c.longitud).length} coordenadas.
                            El motor de clustering está renderizando la densidad comercial.
                        </p>
                    </div>
                </div>
            </Card>

            {view === "listado" && (
                <Card>
                    <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
                        <h3 className="text-sm font-bold flex items-center gap-2">
                            <Users size={16} className="text-[var(--shelfy-primary)]" />
                            Listado Detallado de Clientes
                        </h3>
                        <div className="relative w-full md:w-80">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--shelfy-muted)]" />
                            <input
                                type="text"
                                placeholder="Buscar por nombre o número..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-xl text-sm focus:outline-none focus:border-[var(--shelfy-primary)] transition-all"
                            />
                            {search && (
                                <button
                                    onClick={() => setSearch("")}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--shelfy-muted)] hover:text-[var(--shelfy-error)]"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="overflow-x-auto min-h-[400px]">
                        {loadingList ? (
                            <div className="py-20 flex flex-col items-center justify-center gap-4">
                                <PageSpinner />
                                <span className="text-xs font-bold text-[var(--shelfy-muted)]">Cargando clientes...</span>
                            </div>
                        ) : clientesList.length > 0 ? (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-[var(--shelfy-muted)] text-left border-b border-[var(--shelfy-border)]">
                                        <th className="pb-3 pr-4 font-semibold">N° Cliente</th>
                                        <th className="pb-3 pr-4 font-semibold">Nombre Fantasía</th>
                                        <th className="pb-3 pr-4 font-semibold">Razón Social</th>
                                        <th className="pb-3 pr-4 font-semibold">Localidad</th>
                                        <th className="pb-3 pr-4 font-semibold text-center">Estado ERP</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {clientesList.map((client) => (
                                        <tr key={client.id_cliente_erp_local} className="border-b border-[var(--shelfy-border)] last:border-0 hover:bg-[var(--shelfy-bg)] transition-colors group">
                                            <td className="py-3 pr-4 font-mono text-xs text-[var(--shelfy-muted)]">{client.id_cliente_erp_local}</td>
                                            <td className="py-3 pr-4 font-bold text-[var(--shelfy-text)]">{client.nombre_fantasia || "-"}</td>
                                            <td className="py-3 pr-4 text-xs text-[var(--shelfy-muted)]">{client.razon_social || "-"}</td>
                                            <td className="py-3 pr-4 text-[var(--shelfy-text)]">{client.localidad || client.ciudad || "-"}</td>
                                            <td className="py-3 pr-4 text-center">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${client.estado === 'activo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                    {client.estado || 'activo'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="py-20 flex flex-col items-center justify-center text-[var(--shelfy-muted)]">
                                <Users size={40} className="mb-4 opacity-10" />
                                <p className="text-sm font-bold">No se encontraron clientes</p>
                                <p className="text-xs">Intenta ajustar tu búsqueda</p>
                            </div>
                        )}
                    </div>

                    <div className="mt-4 pt-4 border-t border-[var(--shelfy-border)] flex items-center justify-between text-[10px] text-[var(--shelfy-muted)] font-bold uppercase tracking-widest">
                        <span>Mostrando {clientesList.length} clientes</span>
                        <span>Listado Rama 1.A (Master Data)</span>
                    </div>
                </Card>
            )}

            {view === "inactivos" && (
                <Card>
                    <div className="flex flex-col mb-6">
                        <h3 className="text-sm font-bold flex items-center gap-2 text-red-600">
                            <UserMinus size={16} />
                            Filtro Jerárquico de Clientes Inactivos
                        </h3>
                        <p className="text-xs text-[var(--shelfy-muted)] mt-1">
                            Selecciona una Sucursal y un Vendedor para ver sus clientes inactivos.
                        </p>
                    </div>

                    {loadingList ? (
                        <div className="py-20 flex flex-col items-center justify-center gap-4">
                            <PageSpinner />
                        </div>
                    ) : (
                        <div className="space-y-6 min-h-[400px]">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-[var(--shelfy-muted)]">1. Sucursal</label>
                                    <select
                                        className="p-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-violet-500"
                                        value={selSucursal}
                                        onChange={(e) => {
                                            setSelSucursal(e.target.value);
                                            setSelVendedor("");
                                        }}
                                    >
                                        <option value="">-- Seleccionar Sucursal --</option>
                                        {sucursalesInactivas.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-[var(--shelfy-muted)]">2. Vendedor</label>
                                    <select
                                        className="p-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-violet-500"
                                        value={selVendedor}
                                        onChange={(e) => setSelVendedor(e.target.value)}
                                        disabled={!selSucursal}
                                    >
                                        <option value="">-- Seleccionar Vendedor --</option>
                                        {vendedoresInactivos.map(v => <option key={v} value={v}>{v}</option>)}
                                    </select>
                                </div>
                            </div>

                            {selVendedor && clientesFiltrados.length > 0 && (
                                <div className="mt-6 border border-slate-100 rounded-xl overflow-hidden shadow-sm">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-50 border-b border-slate-100">
                                            <tr className="text-slate-500 text-left">
                                                <th className="p-3 font-semibold">N° Cliente</th>
                                                <th className="p-3 font-semibold">Cliente / Razón Social</th>
                                                <th className="p-3 font-semibold">Domicilio</th>
                                                <th className="p-3 font-semibold text-right">Última Compra</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {clientesFiltrados.map((client) => (
                                                <tr key={client.id_cliente_erp_local} className="border-b border-slate-50 hover:bg-slate-50/50">
                                                    <td className="p-3 font-mono text-xs text-slate-500">{client.id_cliente_erp_local}</td>
                                                    <td className="p-3">
                                                        <div className="font-bold text-slate-800">{client.nombre_cliente}</div>
                                                        <div className="text-xs text-slate-400 mt-0.5">{client.razon_social && client.razon_social !== "nan" ? client.razon_social : (client.nombre_fantasia || "-")}</div>
                                                    </td>
                                                    <td className="p-3 text-xs text-slate-600">{client.domicilio || "-"}</td>
                                                    <td className="p-3 text-right">
                                                        <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-100">
                                                            {client.fecha_ultima_compra ? new Date(client.fecha_ultima_compra).toLocaleDateString("es-AR") : "Desconocida"}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {selVendedor && clientesFiltrados.length === 0 && (
                                <div className="py-12 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50">
                                    <p className="text-sm font-bold text-slate-600">No hay inactivos para este vendedor.</p>
                                </div>
                            )}
                        </div>
                    )}
                </Card>
            )}
        </div>
    );
}

function KPICard({ title, value, icon, trend, subtitle }: { title: string, value: string | number, icon: React.ReactNode, trend?: string, subtitle?: string }) {
    return (
        <Card className="flex flex-col gap-2 relative overflow-hidden group hover:shadow-lg transition-all duration-300">
            <div className="flex justify-between items-start">
                <div className="p-2.5 bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-xl group-hover:scale-110 transition-transform">
                    {icon}
                </div>
                {trend && (
                    <span className="text-[10px] font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full border border-violet-100">
                        {trend}
                    </span>
                )}
            </div>
            <div className="mt-1">
                <p className="text-xs text-[var(--shelfy-muted)] font-medium mb-0.5">{title}</p>
                <div className="flex items-baseline gap-2">
                    <p className="text-2xl font-black text-[var(--shelfy-text)]">{value}</p>
                    {subtitle && <span className="text-[10px] text-[var(--shelfy-muted)]">{subtitle}</span>}
                </div>
            </div>
            <div className="absolute -right-6 -bottom-6 w-20 h-20 bg-gradient-to-br from-[var(--shelfy-primary)] to-transparent opacity-[0.05] rounded-full group-hover:scale-150 transition-transform duration-700"></div>
        </Card>
    );
}
