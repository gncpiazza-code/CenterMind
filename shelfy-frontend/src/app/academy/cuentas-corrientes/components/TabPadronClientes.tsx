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
import { fetchClientesStats, fetchClientesTemporal, fetchClientesDesglose, fetchClientesListado, type ClienteMaestro } from "@/lib/api";
import { 
    Map as CustomMap, 
    MapMarker, 
    MarkerContent, 
    MarkerPopup, 
    MapControls,
    type MapRef
} from "@/components/ui/map";
import { useRef, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY || "G6B85Hh6h0w6WXZlE8S8";
const MAP_STYLE = `https://api.maptiler.com/maps/voyager/style.json?key=${MAPTILER_KEY}`;

// Fallback cn simple
const cn = (...inputs: any[]) => inputs.filter(Boolean).join(" ");

const COLORS = ['#7c3aed', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#6366f1'];

export default function TabPadronClientes({ distId }: { distId: number }) {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<any>(null);
    const [temporal, setTemporal] = useState<any[]>([]);
    const [desgloseVendedores, setDesgloseVendedores] = useState<any[]>([]);
    const [desgloseLocalidades, setDesgloseLocalidades] = useState<any[]>([]);
    const [clientesList, setClientesList] = useState<ClienteMaestro[]>([]);
    const [search, setSearch] = useState("");
    const [view, setView] = useState<"general" | "vendedores" | "geografia" | "listado" | "inactivos">("general");
    const [loadingList, setLoadingList] = useState(false);

    // Jerarquía y Filtros
    const [hierarchy, setHierarchy] = useState<any>(null);
    const [selectedSucursal, setSelectedSucursal] = useState("");
    const [selectedVendedor, setSelectedVendedor] = useState("");
    const [branchColors, setBranchColors] = useState<Record<string, string>>({});

    const mapRef = useRef<MapRef>(null);
    const [popupClient, setPopupClient] = useState<ClienteMaestro | null>(null);

    const sellerColorMap = useMemo(() => {
        const colors: Record<string, string> = {};
        const SELLER_COLORS = [
            '#7c3aed', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', 
            '#6366f1', '#ef4444', '#f97316', '#84cc16', '#06b6d4',
            '#0891b2', '#4d7c0f', '#be185d', '#4338ca', '#b45309'
        ];
        
        const uniqueSellers = Array.from(new Set(clientesList.map(c => c.vendedor_nombre))).sort();
        uniqueSellers.forEach((name, idx) => {
            colors[name] = SELLER_COLORS[idx % SELLER_COLORS.length];
        });
        return colors;
    }, [clientesList]);

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
            const limit = view === "geografia" ? 2000 : 500;
            const data = await fetchClientesListado(distId, search, limit, selectedSucursal, selectedVendedor);
            setClientesList(data);
        } catch (e) {
            console.error("Error al cargar listado de clientes:", e);
        } finally {
            setLoadingList(false);
        }
    };

    const fetchHierarchy = async () => {
        try {
            const res = await fetch(`/api/admin/hierarchy-config/${distId}`).then(r => r.json());
            setHierarchy(res);
            
            // Generar colores para sucursales
            const colors: Record<string, string> = {};
            (res.erp_hierarchy || []).forEach((s: any, idx: number) => {
                colors[s.sucursal_erp] = COLORS[idx % COLORS.length];
            });
            setBranchColors(colors);
        } catch (e) {
            console.error("Error fetching hierarchy:", e);
        }
    };

    useEffect(() => {
        fetchHierarchy();
    }, [distId]);

    useEffect(() => {
        loadData();
    }, [distId]);

    useEffect(() => {
        if (view === "listado" || view === "inactivos" || view === "geografia") {
            const timer = setTimeout(() => {
                loadListado();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [view, search, distId, selectedSucursal, selectedVendedor]);

    // Estados para los filtros en cascada de Inactivos
    const [selSucursal, setSelSucursal] = useState<string>("");
    const [selVendedor, setSelVendedor] = useState<string>("");

    // Derived state para inactivos
    const sucursal_field = "sucursal_nombre";
    const vendedor_field = "vendedor_nombre";

    const inactivosList = clientesList.filter(c => c.estado === "inactivo" || c.estado === "INACTIVO" || (c.estado && c.estado.toLowerCase().includes("inactivo")));
    const sucursalesInactivas = Array.from(new Set(inactivosList.map(c => (c as any)[sucursal_field] || "SIN SUCURSAL"))).sort();
    const vendedoresInactivos = Array.from(new Set(inactivosList.filter(c => ((c as any)[sucursal_field] || "SIN SUCURSAL") === selSucursal).map(c => (c as any)[vendedor_field] || "SIN VENDEDOR"))).sort();
    const clientesFiltrados = inactivosList.filter(c =>
        ((c as any)[sucursal_field] || "SIN SUCURSAL") === selSucursal &&
        ((c as any)[vendedor_field] || "SIN VENDEDOR") === selVendedor
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
                        Mapa
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
                    subtitle={`${stats?.sucursales || 0} Sucursales`}
                />
                <KPICard
                    title="Clientes Activos"
                    value={stats?.activos || 0}
                    icon={<UserCheck className="text-green-500" />}
                    subtitle={`${stats?.vendedores || 0} Vendedores`}
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

            {view === "geografia" && (
                <Card className="min-h-[600px] p-0 overflow-hidden relative border-none shadow-xl">
                    <div className="absolute top-4 left-4 z-[1000] bg-white/90 backdrop-blur-md p-3 rounded-2xl border border-slate-200 shadow-xl flex flex-col gap-1 max-w-[200px]">
                        <h3 className="text-xs font-black text-slate-900 flex items-center gap-2">
                            <Globe size={14} className="text-violet-600" />
                            Mapa de Padrón
                        </h3>
                        {loadingList ? (
                            <p className="text-[9px] font-bold text-slate-500 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse"></span>
                                Cargando...
                            </p>
                        ) : (
                            <p className="text-[9px] font-bold text-slate-500">Visualizando {clientesList.filter(c => c.lat && c.lon).length} PDVs</p>
                        )}
                        
                        {/* Legend */}
                        <div className="mt-2 pt-2 border-t border-slate-100 max-h-[150px] overflow-y-auto custom-scrollbar pr-2">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Vendedores</p>
                            <div className="space-y-1">
                                {Object.entries(sellerColorMap).map(([name, color]) => (
                                    <div key={name} className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                        <span className="text-[9px] font-bold text-slate-600 truncate">{name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="h-[600px] w-full bg-slate-100 relative">
                        <CustomMap
                            ref={mapRef}
                            center={[-58.3816, -34.6037]}
                            zoom={10}
                            theme="light"
                            className="h-full w-full"
                            attributionControl={false}
                        >
                            <MapControls position="top-right" showZoom showCompass />
                            
                            {clientesList.filter(c => c.lat && c.lon).map((client, idx) => {
                                const sellerColor = sellerColorMap[client.vendedor_nombre] || '#7c3aed';
                                const isActive = client.estado?.toLowerCase() === 'activo';
                                
                                return (
                                    <MapMarker
                                        key={`${client.id_cliente_erp_local}-${idx}`}
                                        longitude={client.lon}
                                        latitude={client.lat}
                                        onClick={() => setPopupClient(client)}
                                    >
                                        <MarkerContent>
                                            <div 
                                                className={cn(
                                                    "w-3.5 h-3.5 rounded-full border-2 border-white shadow-md transition-all hover:scale-[1.7] hover:z-50 cursor-pointer",
                                                    !isActive && "opacity-40 grayscale-[0.6] scale-90 border-slate-300"
                                                )}
                                                style={{ backgroundColor: sellerColor }}
                                            />
                                        </MarkerContent>
                                        
                                        {popupClient?.id_cliente_erp_local === client.id_cliente_erp_local && (
                                            <MarkerPopup 
                                                closeButton 
                                                onClose={() => setPopupClient(null)} 
                                                className="min-w-[220px] max-w-[280px]"
                                            >
                                                <div className="space-y-2">
                                                    <div>
                                                        <h4 className="font-black text-slate-900 text-xs leading-tight">{client.nombre_cliente}</h4>
                                                        <p className="text-[9px] text-slate-400 font-mono mt-0.5">#{client.id_cliente_erp_local}</p>
                                                    </div>
                                                    
                                                    <div className="flex flex-col gap-0.5">
                                                        <div className="flex items-center gap-1.5">
                                                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sellerColor }} />
                                                            <span className="text-[10px] font-bold text-slate-700">{client.vendedor_nombre}</span>
                                                        </div>
                                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight ml-3">{client.sucursal_nombre}</span>
                                                    </div>

                                                    <div className="h-px bg-slate-100" />
                                                    
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div className="flex flex-col">
                                                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Estado</span>
                                                            <span className={cn(
                                                                "text-[9px] font-black px-1.5 py-0.5 rounded-full w-fit uppercase",
                                                                isActive ? "bg-green-100 text-green-700 border border-green-200" : "bg-red-100 text-red-700 border border-red-200"
                                                            )}>
                                                                {client.estado || 'activo'}
                                                            </span>
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Ubicación</span>
                                                            <span className="text-[9px] font-mono text-slate-500 truncate">{client.localidad}</span>
                                                        </div>
                                                    </div>

                                                    {client.fecha_ultima_compra && (
                                                        <div className="pt-1">
                                                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Última Compra</span>
                                                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                                                {new Date(client.fecha_ultima_compra).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </MarkerPopup>
                                        )}
                                    </MapMarker>
                                );
                            })}
                        </CustomMap>
                    </div>
                </Card>
            )}

            {view === "listado" && (
                <Card>
                    <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
                        <div className="flex flex-col gap-1">
                            <h3 className="text-sm font-bold flex items-center gap-2">
                                <Users size={16} className="text-[var(--shelfy-primary)]" />
                                Padrón Maestro de Clientes
                            </h3>
                            <p className="text-[10px] text-[var(--shelfy-muted)] font-bold uppercase">Distribución Hierárquica ERP</p>
                        </div>
                        
                        {/* Filtros de Jerarquía */}
                        <div className="flex items-center gap-3 flex-wrap">
                            <select 
                                className="text-xs p-2 bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-xl outline-none focus:border-[var(--shelfy-primary)]"
                                value={selectedSucursal}
                                onChange={(e) => {
                                    setSelectedSucursal(e.target.value);
                                    setSelectedVendedor("");
                                }}
                            >
                                <option value="">Todas las Sucursales</option>
                                {hierarchy?.erp_hierarchy?.map((s: any) => (
                                    <option key={s.sucursal_erp} value={s.id_sucursal_erp}>{s.sucursal_erp}</option>
                                ))}
                            </select>

                            <select 
                                className="text-xs p-2 bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-xl outline-none focus:border-[var(--shelfy-primary)]"
                                value={selectedVendedor}
                                onChange={(e) => setSelectedVendedor(e.target.value)}
                                disabled={!selectedSucursal}
                            >
                                <option value="">Todos los Vendedores</option>
                                {hierarchy?.erp_hierarchy?.find((s: any) => s.id_sucursal_erp === selectedSucursal)?.vendedores?.map((v: any) => (
                                    <option key={v.id_vendedor_erp} value={v.id_vendedor_erp}>{v.vendedor_nombre}</option>
                                ))}
                            </select>

                            <div className="relative w-full md:w-64">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--shelfy-muted)]" />
                                <input
                                    type="text"
                                    placeholder="Buscar..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-xl text-sm focus:outline-none focus:border-[var(--shelfy-primary)] transition-all"
                                />
                            </div>
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
                                        <th className="pb-3 pr-4 font-semibold">Cód. ERP</th>
                                        <th className="pb-3 pr-4 font-semibold">Sucursal</th>
                                        <th className="pb-3 pr-4 font-semibold">Vendedor</th>
                                        <th className="pb-3 pr-4 font-semibold">Cliente / Razón Social</th>
                                        <th className="pb-3 pr-4 font-semibold">Localidad / Provincia</th>
                                        <th className="pb-3 pr-4 font-semibold text-center">Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {clientesList.map((client, idx) => (
                                        <tr key={`${client.id_cliente_erp_local}-${idx}`} className="border-b border-[var(--shelfy-border)] last:border-0 hover:bg-[var(--shelfy-bg)] transition-colors group">
                                            <td className="py-3 pr-4 font-mono text-xs text-[var(--shelfy-muted)]">{client.id_cliente_erp_local}</td>
                                            <td className="py-3 pr-4 font-bold text-[10px] text-slate-500">{client.sucursal_nombre}</td>
                                            <td className="py-3 pr-4">
                                                <div className="text-[11px] font-bold text-slate-800">{client.vendedor_nombre}</div>
                                                <div className="text-[9px] text-slate-400 font-mono">{client.vendedor_id}</div>
                                            </td>
                                            <td className="py-3 pr-4">
                                                <div className="font-bold text-[var(--shelfy-text)] text-sm">{client.nombre_cliente}</div>
                                                <div className="text-[10px] text-[var(--shelfy-muted)] font-medium line-clamp-1">{client.razon_social && client.razon_social !== "nan" ? client.razon_social : (client.nombre_fantasia || "-")}</div>
                                            </td>
                                            <td className="py-3 pr-4">
                                                <div className="text-xs font-bold text-slate-700">{client.localidad}</div>
                                                <div className="text-[10px] text-slate-400 font-medium uppercase">{client.provincia}</div>
                                            </td>
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
