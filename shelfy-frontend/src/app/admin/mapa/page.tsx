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
    const [showRoutes, setShowRoutes] = useState(true);
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [showStatsPanel, setShowStatsPanel] = useState(false);

    // Para detectar nuevos eventos y hacer "fly-to"
    const [lastNewestId, setLastNewestId] = useState<number | null>(null);

    const loadEvents = async (date?: string) => {
        try {
            // Si hay fecha, ignoramos los minutos y traemos todo el día
            const res = await fetchLiveMapEvents(date ? undefined : 120, date);

            // Detectar si hay un evento nuevo para hacer fly-to
            if (res.length > 0 && !date) { // Fly-to solo si estamos en "Live" (sin fecha específica histórica seleccionada o si es hoy)
                const newest = res[0];
                if (lastNewestId && newest.id_ex > lastNewestId) {
                    setSelectedEventId(newest.id_ex); // Esto disparará el flyTo en MapaExhibiciones
                }
                setLastNewestId(newest.id_ex);
            }

            setEvents(res);
        } catch (e) {
            console.error("Error loading map events", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user?.rol !== "superadmin") return;
        loadEvents(selectedDate === new Date().toISOString().split('T')[0] ? undefined : selectedDate);

        // Intervalo solo si es el día de hoy
        let interval: any;
        if (selectedDate === new Date().toISOString().split('T')[0]) {
            interval = setInterval(() => loadEvents(), 30000);
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [user, selectedDate]);

    // Estadísticas agrupadas por distribuidora (Consolidado)
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

    const statsGlobal = useMemo(() => {
        if (events.length === 0) return { perMin: 0, activeZones: 0, topSellers: [] };

        // Cálculo de exhibiciones por minuto (última hora)
        const now = new Date();
        const lastHourEvents = events.filter(e => {
            const age = (now.getTime() - new Date(e.timestamp_evento).getTime()) / (1000 * 60);
            return age < 60;
        });

        // Vendedores más activos
        const sellerCounts: Record<string, number> = {};
        events.forEach(e => {
            sellerCounts[e.vendedor_nombre] = (sellerCounts[e.vendedor_nombre] || 0) + 1;
        });
        const topSellers = Object.entries(sellerCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        return {
            perMin: (lastHourEvents.length / 60).toFixed(1),
            totalDay: events.length,
            topSellers
        };
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
        <div className="flex h-screen bg-[#0f172a] overflow-hidden">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0 h-full relative">

                {/* Header Flotante Minimalista */}
                <div className="absolute top-4 left-4 right-4 z-30 flex justify-between pointer-events-none">
                    <div className="flex flex-col gap-2 pointer-events-auto">
                        <div className="bg-slate-900/80 backdrop-blur-xl ring-1 ring-white/10 px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-3">
                            <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                            <h1 className="text-[11px] font-black text-white uppercase tracking-[0.2em]">
                                Monitor <span className="text-rose-400">En Vivo</span>
                            </h1>
                            <div className="w-[1px] h-4 bg-white/10" />
                            <span className="text-[10px] font-bold text-slate-400 uppercase">
                                {events.length} Capturas totales
                            </span>
                        </div>

                        {/* Selector de Fecha Estilizado */}
                        <div className="bg-slate-900/80 backdrop-blur-xl ring-1 ring-white/10 p-1.5 rounded-2xl shadow-2xl flex items-center gap-1">
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="bg-transparent text-white text-[10px] font-black uppercase px-2 py-1 outline-none border-none cursor-pointer"
                            />
                            <div className="px-2 py-1 bg-white/5 rounded-xl">
                                <Clock size={12} className="text-slate-400" />
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-2 pointer-events-auto items-start">
                        {/* Toggle Recorridos */}
                        <button
                            onClick={() => setShowRoutes(!showRoutes)}
                            className={`px-4 py-2.5 ring-1 ring-white/10 shadow-2xl backdrop-blur-xl rounded-2xl transition-all flex items-center gap-2 font-black text-[10px] uppercase tracking-wider
                                ${showRoutes ? "bg-indigo-600/90 text-white" : "bg-slate-900/80 text-slate-400"}`}
                        >
                            <Target size={14} className={showRoutes ? "animate-spin-slow" : ""} />
                            Rutas: {showRoutes ? "ON" : "OFF"}
                        </button>

                        {/* Botón Estadísticas */}
                        <button
                            onClick={() => setShowStatsPanel(!showStatsPanel)}
                            className={`px-4 py-2.5 ring-1 ring-white/10 shadow-2xl backdrop-blur-xl rounded-2xl transition-all flex items-center gap-2 font-black text-[10px] uppercase tracking-wider
                                ${showStatsPanel ? "bg-rose-600/90 text-white" : "bg-slate-900/80 text-slate-400"}`}
                        >
                            <BarChart2 size={14} />
                            Estadísticas
                        </button>
                    </div>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    {/* Feed Lateral (Live Stream) - Ahora más premium y delgado */}
                    <div className="w-64 bg-slate-900/50 backdrop-blur-3xl border-r border-white/5 z-20 flex flex-col shadow-2xl shrink-0">
                        <div className="p-5 border-b border-white/5">
                            <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.3em]">Timeline Actividad</p>
                        </div>

                        <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-none">
                            {loading ? (
                                <div className="p-8 text-center flex flex-col items-center gap-3">
                                    <Spinner className="text-rose-500" />
                                    <span className="text-[10px] text-slate-500 font-bold uppercase">Sincronizando...</span>
                                </div>
                            ) : (
                                events.map((ev) => {
                                    const eventDate = new Date(ev.timestamp_evento);
                                    const ageMin = (new Date().getTime() - eventDate.getTime()) / 60000;
                                    const isHot = ageMin < 30;

                                    return (
                                        <div
                                            key={ev.id_ex}
                                            onClick={() => setSelectedEventId(ev.id_ex)}
                                            className={`p-3.5 rounded-2xl border transition-all cursor-pointer group relative overflow-hidden
                                                ${selectedEventId === ev.id_ex
                                                    ? "bg-white/10 border-white/20 ring-1 ring-white/30"
                                                    : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10"}`}
                                        >
                                            {isHot && (
                                                <div className="absolute top-0 right-0 p-1">
                                                    <div className="size-1.5 rounded-full bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
                                                </div>
                                            )}
                                            <div className="flex flex-col gap-2">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{ev.nombre_dist}</span>
                                                    <span className="text-[8px] text-slate-400 font-bold">
                                                        {formatDistanceToNow(new Date(ev.timestamp_evento), { addSuffix: true, locale: es }).replace("alrededor de", "")}
                                                    </span>
                                                </div>
                                                <p className="text-xs font-black text-slate-100 group-hover:text-rose-400 transition-colors leading-tight">
                                                    {ev.vendedor_nombre}
                                                </p>
                                                <div className="flex items-center gap-2">
                                                    <Building2 size={10} className="text-slate-600" />
                                                    <span className="text-[9px] text-slate-500 font-bold truncate">
                                                        {ev.cliente_nombre}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Mapa Central */}
                    <div className="flex-1 h-full relative bg-[#0d0d0d]">
                        <MapaExhibiciones
                            events={events}
                            height="100%"
                            theme="dark"
                            selectedEventId={selectedEventId}
                            showRoutes={showRoutes}
                        />

                        {/* Panel de Estadísticas Flotante (Overlay) */}
                        <div className={`absolute top-24 right-4 bottom-4 w-80 z-40 transition-all duration-700 transform
                            ${showStatsPanel ? "translate-x-0 opacity-100" : "translate-x-[120%] opacity-0 pointer-events-none"}`}
                        >
                            <div className="h-full bg-slate-900/90 backdrop-blur-2xl ring-1 ring-white/10 rounded-[2.5rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden border border-white/5">
                                <div className="p-6 border-b border-white/5">
                                    <div className="flex items-center justify-between mb-1">
                                        <h3 className="text-xs font-black text-white uppercase tracking-[0.2em]">Analítica Global</h3>
                                        <button onClick={() => setShowStatsPanel(false)} className="text-slate-500 hover:text-white transition-colors">
                                            <X size={16} />
                                        </button>
                                    </div>
                                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Resumen consolidado del día</p>
                                </div>

                                <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-none">
                                    {/* Actividad / Min */}
                                    <div className="space-y-4">
                                        <div className="flex items-end justify-between">
                                            <div>
                                                <p className="text-[9px] font-black text-slate-500 uppercase mb-1">Ritmo de Carga</p>
                                                <p className="text-3xl font-black text-white tracking-tighter">{statsGlobal.perMin} <span className="text-xs text-slate-500">EXH / MIN</span></p>
                                            </div>
                                            <div className="w-16 h-8 flex items-end gap-1">
                                                {[30, 70, 45, 90, 60, 80].map((h, i) => (
                                                    <div key={i} className="flex-1 bg-rose-500/30 rounded-t-sm" style={{ height: `${h}%` }} />
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Ranking Vendedores */}
                                    <div className="space-y-4">
                                        <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                            <Zap size={10} className="text-amber-500" />
                                            Top Ejecutores
                                        </h4>
                                        <div className="space-y-3">
                                            {statsGlobal.topSellers.map(([name, count], i) => (
                                                <div key={name} className="flex items-center gap-3">
                                                    <span className="text-[10px] font-black text-slate-700 w-4">0{i + 1}</span>
                                                    <div className="flex-1">
                                                        <div className="flex justify-between text-[11px] font-bold text-slate-300 mb-1">
                                                            <span>{name}</span>
                                                            <span className="text-white">{count}</span>
                                                        </div>
                                                        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                                            <div
                                                                className="h-full bg-indigo-500 rounded-full"
                                                                style={{ width: `${(Number(count) / Number(statsGlobal.topSellers[0][1])) * 100}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Distribuidoras Grid */}
                                    <div className="space-y-4">
                                        <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Actividad por Distribuidora</h4>
                                        <div className="grid grid-cols-2 gap-3">
                                            {statsByDist.map(dist => (
                                                <div key={dist.name} className="p-3 bg-white/5 rounded-2xl border border-white/5">
                                                    <div className="size-2 rounded-full mb-2" style={{ backgroundColor: dist.color }} />
                                                    <p className="text-[9px] font-black text-slate-300 uppercase truncate mb-1">{dist.name}</p>
                                                    <p className="text-lg font-black text-white">{dist.count}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="p-6 bg-indigo-600/20 border-t border-white/5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Status Sistema</span>
                                        <span className="flex items-center gap-1.5 text-[9px] font-bold text-white px-2 py-1 bg-green-500/20 text-green-400 rounded-full border border-green-500/20">
                                            <div className="size-1 rounded-full bg-green-400 animate-pulse" />
                                            Óptimo
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <style jsx global>{`
                .scrollbar-none::-webkit-scrollbar { display: none; }
                .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
                @keyframes spin-slow {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .animate-spin-slow {
                    animation: spin-slow 8s linear infinite;
                }
            `}</style>
        </div>
    );
}

function X({ size }: { size: number }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
        </svg>
    );
}
