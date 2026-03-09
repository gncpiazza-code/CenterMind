"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { PageSpinner, Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/hooks/useAuth";
import { MapPin, Zap, Clock, Users, Building2, BarChart2, ChevronRight, ChevronLeft, Target, Info } from "lucide-react";
import { fetchLiveMapEvents, fetchSucursalesCruce, type LiveMapEvent, type BranchCruce } from "@/lib/api";
import { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

// Import new MapLibre component dynamically (CSR only)
const MapaExhibiciones = dynamic(() => import("../components/MapaExhibiciones"), { ssr: false });

export default function LiveMapPage() {
    const { user } = useAuth();
    const [events, setEvents] = useState<LiveMapEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
    const [branchStats, setBranchStats] = useState<Record<string, BranchCruce[]>>({});
    const [loadingBranches, setLoadingBranches] = useState<string | null>(null);
    const [expandedDist, setExpandedDist] = useState<string | null>(null);
    const [showDistSidebar, setShowDistSidebar] = useState(true);
    const [showRoutes, setShowRoutes] = useState(true);

    const loadEvents = async () => {
        try {
            // Pedimos los últimos 120 minutos para tener data inicial
            const res = await fetchLiveMapEvents(120);
            setEvents(res);
        } catch (e) {
            console.error("Error loading map events", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user?.rol !== "superadmin") return;
        loadEvents();
        const interval = setInterval(loadEvents, 30000); // 30s refresh (más agresivo)
        return () => clearInterval(interval);
    }, [user]);

    // Estadísticas agrupadas por distribuidora
    const statsByDist = useMemo(() => {
        const groups: Record<string, { id: number; count: number; lastActivity: string; color: string }> = {};
        const DIST_COLORS = ["#8b5cf6", "#ec4899", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#84cc16", "#6366f1", "#d946ef"];

        events.forEach((ev: LiveMapEvent) => {
            if (!groups[ev.nombre_dist]) {
                const colorIdx = Object.keys(groups).length % DIST_COLORS.length;
                groups[ev.nombre_dist] = { id: ev.id_dist, count: 0, lastActivity: ev.timestamp_evento, color: DIST_COLORS[colorIdx] };
            }
            groups[ev.nombre_dist].count++;
            if (new Date(ev.timestamp_evento) > new Date(groups[ev.nombre_dist].lastActivity)) {
                groups[ev.nombre_dist].lastActivity = ev.timestamp_evento;
            }
        });

        return Object.entries(groups)
            .sort((a, b) => b[1].count - a[1].count)
            .map(([name, data]) => ({ name, ...data }));
    }, [events]);

    const handleToggleDist = async (dist: any) => {
        if (expandedDist === dist.name) {
            setExpandedDist(null);
            return;
        }

        setExpandedDist(dist.name);
        if (!branchStats[dist.name]) {
            setLoadingBranches(dist.name);
            try {
                // Buscamos el ID del distribuidor en los eventos
                const firstEv = events.find((e: LiveMapEvent) => e.nombre_dist === dist.name);
                if (firstEv) {
                    const distId = firstEv.id_dist;
                    if (distId) {
                        const res = await fetchSucursalesCruce(distId, "mes");
                        setBranchStats(prev => ({ ...prev, [dist.name]: res }));
                    }
                }
            } catch (err) {
                console.error("Error fetching branch stats", err);
            } finally {
                setLoadingBranches(null);
            }
        }
    };

    if (user?.rol !== "superadmin") return null;

    return (
        <div className="flex h-screen bg-[var(--shelfy-bg)] overflow-hidden">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0 h-full">
                <Topbar title="Monitoreo de Actividad Global" />

                <div className="flex-1 flex flex-col lg:flex-row relative">

                    {/* Feed Lateral Izquierdo (Live Stream) - Ocultable en móvil eventualmente */}
                    <div className="w-full lg:w-72 bg-white border-r border-slate-200 z-20 flex flex-col shadow-xl shrink-0">
                        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                            <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-2">
                                <Zap size={14} className="text-amber-500 fill-amber-500" />
                                Actividad Reciente
                            </h3>
                            <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">Sincronizado cada 30s</p>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin">
                            {loading ? <div className="p-8 text-center"><PageSpinner /></div> : (
                                events.map((ev, i) => {
                                    const distColor = statsByDist.find(s => s.name === ev.nombre_dist)?.color || "#6366f1";
                                    return (
                                        <div
                                            key={ev.id_ex}
                                            onClick={() => setSelectedEventId(ev.id_ex)}
                                            className={`p-3 rounded-2xl border transition-all cursor-pointer group hover:shadow-md
                                                ${selectedEventId === ev.id_ex
                                                    ? "bg-violet-50 border-violet-200 ring-2 ring-violet-500/20 translate-x-1"
                                                    : "bg-white border-slate-100 hover:border-violet-100 hover:bg-slate-50/50"}`}
                                        >
                                            <div className="flex items-center justify-between mb-1.5">
                                                <span
                                                    className="text-[9px] font-black px-1.5 py-0.5 rounded shadow-sm border border-black/5 text-white uppercase"
                                                    style={{ backgroundColor: distColor }}
                                                >
                                                    {ev.nombre_dist}
                                                </span>
                                                <span className="text-[9px] text-slate-400 font-bold flex items-center gap-1">
                                                    <Clock size={10} />
                                                    {formatDistanceToNow(new Date(ev.timestamp_evento), { addSuffix: true, locale: es }).replace("alrededor de", "~")}
                                                </span>
                                            </div>
                                            <p className="text-[13px] font-bold text-slate-900 group-hover:text-violet-700 truncate">
                                                {ev.vendedor_nombre}
                                            </p>
                                            <div className="flex items-center gap-2 mt-1 opacity-70">
                                                <MapPin size={10} className="text-slate-400" />
                                                <span className="text-[10px] text-slate-500 font-semibold truncate leading-none">
                                                    {ev.cliente_nombre || `Cliente ${ev.nro_cliente}`}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                            {!loading && events.length === 0 && (
                                <div className="p-8 text-center text-slate-400 italic text-sm">
                                    Esperando actividad...
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Mapa Central (MapLibre) */}
                    <div className="flex-1 h-full relative z-10 bg-[#1e1e1e] flex flex-col">
                        <MapaExhibiciones
                            events={events}
                            height="100%"
                            theme="dark"
                            selectedEventId={selectedEventId}
                            showRoutes={showRoutes}
                        />

                        {/* Breadcrumb Map Overlay */}
                        <div className="absolute top-4 left-4 z-20 pointer-events-none">
                            <Card className="px-4 py-2 border-none ring-1 ring-white/10 shadow-2xl bg-slate-900/80 backdrop-blur-xl rounded-2xl">
                                <div className="flex items-center gap-3">
                                    <div className="flex -space-x-1.5 overflow-hidden">
                                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                    </div>
                                    <span className="text-[11px] font-black text-white uppercase tracking-wider">
                                        Live Feed <span className="text-violet-400 ml-1">{events.length}</span> interacciones
                                    </span>
                                </div>
                            </Card>
                        </div>

                        {/* Route Toggle Overlay */}
                        <div className="absolute top-4 right-4 z-20 flex flex-col gap-2">
                            <button
                                onClick={() => setShowRoutes(!showRoutes)}
                                className={`px-4 py-2 border-none ring-1 ring-white/10 shadow-2xl backdrop-blur-xl rounded-2xl transition-all flex items-center gap-2 group
                                    ${showRoutes ? "bg-violet-600/90 text-white" : "bg-slate-900/80 text-slate-400 hover:bg-slate-800/90"}`}
                            >
                                <div className={`w-2 h-2 rounded-full transition-colors ${showRoutes ? "bg-white animate-pulse" : "bg-slate-600"}`} />
                                <span className="text-[10px] font-black uppercase tracking-widest">
                                    Recorridos: {showRoutes ? "ON" : "OFF"}
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* Panel Estadístico Derecho (Distribuidores) */}
                    <div className={`transition-all duration-500 ease-in-out bg-slate-50 border-l border-slate-200 z-20 flex flex-col shadow-2xl shrink-0 overflow-hidden relative
                        ${showDistSidebar ? "w-full lg:w-80" : "w-0 lg:w-0 border-none"}`}
                    >
                        {/* Toggle Button Inside Sidebar - More visible with label */}
                        <button
                            onClick={() => setShowDistSidebar(false)}
                            className="absolute top-1/2 -left-8 z-30 bg-white border border-slate-200 rounded-l-2xl py-8 px-2 shadow-[-5px_0_15px_rgba(0,0,0,0.1)] hover:bg-slate-50 transition-all group hidden lg:flex flex-col items-center gap-2 group"
                            title="Ocultar Panel"
                        >
                            <ChevronRight size={20} className="text-slate-400 group-hover:text-violet-600 transition-colors" />
                            <span className="text-[9px] font-black text-slate-400 rotate-180 [writing-mode:vertical-lr] uppercase tracking-widest group-hover:text-violet-600">Ocultar</span>
                        </button>

                        <div className="p-5 border-b border-slate-200 bg-white">
                            <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-2">
                                <Building2 size={14} className="text-violet-500" />
                                Por Distribuidora
                            </h3>
                            <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">Resumen de performance (2h)</p>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
                            {loading && <div className="p-8 text-center"><PageSpinner /></div>}
                            {!loading && statsByDist.map((dist, i) => {
                                const isExpanded = expandedDist === dist.name;
                                const branches = branchStats[dist.name] || [];

                                return (
                                    <div
                                        key={dist.name}
                                        className={`bg-white rounded-3xl border transition-all group overflow-hidden relative
                                            ${isExpanded ? "ring-2 ring-violet-500/20 shadow-lg" : "border-slate-100 shadow-sm hover:shadow-md"}`}
                                    >
                                        {/* Decorator line */}
                                        <div
                                            className="absolute left-0 top-0 bottom-0 w-1.5"
                                            style={{ backgroundColor: dist.color }}
                                        />

                                        <div
                                            className="p-4 cursor-pointer"
                                            onClick={() => handleToggleDist(dist)}
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="min-w-0 flex-1 pr-2">
                                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-tight mb-0.5 truncate">
                                                        {dist.name}
                                                    </p>
                                                    <p className="text-xl font-black text-slate-900 leading-none">
                                                        {dist.count} <span className="text-[10px] text-slate-400 font-bold">EVENTOS</span>
                                                    </p>
                                                </div>
                                                <div className={`p-2.5 rounded-2xl transition-colors ${isExpanded ? 'bg-violet-600 text-white' : 'bg-slate-50 text-slate-400 group-hover:bg-violet-50 group-hover:text-violet-600'}`}>
                                                    <BarChart2 size={16} />
                                                </div>
                                            </div>

                                            <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between">
                                                <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-500 uppercase">
                                                    <Clock size={10} />
                                                    Últ: {formatDistanceToNow(new Date(dist.lastActivity), { addSuffix: false, locale: es })}
                                                </div>
                                                <div className="text-[9px] font-black text-violet-600 uppercase tracking-widest flex items-center gap-1">
                                                    {isExpanded ? "Cerrar" : "Detalle"} <ChevronRight size={10} className={`transition-all ${isExpanded ? 'rotate-90' : ''}`} />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Detalle de Sucursales (Cruce ERP) */}
                                        {isExpanded && (
                                            <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                                <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 space-y-3">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-[10px] font-black text-slate-500 uppercase">Sucursal / Cobertura</span>
                                                        <Target size={12} className="text-slate-400" />
                                                    </div>

                                                    {loadingBranches === dist.name ? (
                                                        <div className="py-4 flex justify-center"><Spinner size="sm" /></div>
                                                    ) : branches.length === 0 ? (
                                                        <div className="py-2 text-center text-[10px] font-bold text-slate-400 italic">No hay datos ERP</div>
                                                    ) : (
                                                        <div className="space-y-3">
                                                            {branches.map(b => (
                                                                <div key={b.location_id} className="space-y-1">
                                                                    <div className="flex items-center justify-between text-[11px] font-bold">
                                                                        <span className="text-slate-700 truncate max-w-[140px]">{b.sucursal_name}</span>
                                                                        <span className="text-violet-600">{b.cobertura_pct}%</span>
                                                                    </div>
                                                                    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                                                        <div
                                                                            className={`h-full rounded-full transition-all duration-1000 ${b.cobertura_pct > 70 ? 'bg-green-500' : b.cobertura_pct > 30 ? 'bg-violet-500' : 'bg-amber-500'}`}
                                                                            style={{ width: `${b.cobertura_pct}%` }}
                                                                        />
                                                                    </div>
                                                                    <div className="flex items-center justify-between text-[9px] text-slate-400 font-bold uppercase tracking-tighter">
                                                                        <span>Vis: {b.clientes_visitados} / {b.total_clientes_erp}</span>
                                                                        <span>Ex: {b.total_exhibiciones}</span>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {!loading && statsByDist.length === 0 && (
                                <div className="p-8 text-center text-slate-400 italic text-sm">
                                    No hay data acumulada.
                                </div>
                            )}
                        </div>

                        {/* Global Stat Footer */}
                        <div className="p-5 bg-violet-600 shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white/20 rounded-xl">
                                    <Users size={18} className="text-white" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-violet-200 uppercase tracking-widest leading-none mb-1">Total Actividad</p>
                                    <p className="text-xl font-black text-white leading-none">{events.length} Capturas</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Toggle Button for Sidebar (when hidden) */}
                    {!showDistSidebar && (
                        <button
                            onClick={() => setShowDistSidebar(true)}
                            className="absolute right-4 top-24 z-30 bg-white border border-slate-200 rounded-2xl p-3 shadow-2xl hover:bg-slate-50 transition-all animate-in slide-in-from-right-4 duration-300 hidden lg:flex items-center gap-2"
                        >
                            <Building2 size={16} className="text-violet-500" />
                            <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Estadísticas</span>
                            <ChevronLeft size={16} className="text-slate-400" />
                        </button>
                    )}

                </div>
            </div>

            <style jsx global>{`
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes slideLeft {
                    from { opacity: 0; transform: translateX(10px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                .scrollbar-thin::-webkit-scrollbar { width: 4px; }
                .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
                .scrollbar-thin::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
            `}</style>
        </div>
    );
}
