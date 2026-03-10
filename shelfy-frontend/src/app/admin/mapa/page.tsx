"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { PageSpinner, Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/hooks/useAuth";
import { MapPin, Zap, Clock, Users, Building2, BarChart2, ChevronRight, ChevronLeft, Target, Info, X, Map as MapIcon } from "lucide-react";
import { fetchLiveMapEvents, fetchSucursalesCruce, type LiveMapEvent, type BranchCruce } from "@/lib/api";
import { useRef, useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { type MapRef } from "@/components/ui/map";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";

const getTodayStr = () => {
    const d = new Date();
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - (offset * 60 * 1000));
    return local.toISOString().split('T')[0];
};

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
    const [selectedDate, setSelectedDate] = useState<string>(getTodayStr());
    const [showStatsPanel, setShowStatsPanel] = useState(false);

    // Para detectar nuevos eventos y hacer "fly-to"
    const [lastNewestId, setLastNewestId] = useState<number | null>(null);
    const mapRef = useRef<MapRef>(null);

    const loadEvents = async (date?: string) => {
        try {
            // Si hay fecha, ignoramos los minutos y traemos todo el día (1440 min = 24h)
            const res = await fetchLiveMapEvents(date ? undefined : 1440, date);
            // Filtrar eventos sin ubicación válida o datos inconsistentes
            const validEvents = res.filter(e => e.lat && e.lon && e.lat !== 0 && e.lon !== 0);

            // Detectar si hay un evento nuevo para hacer fly-to
            if (validEvents.length > 0 && !date) {
                const newest = validEvents[0];
                if (lastNewestId && newest.id_ex > lastNewestId) {
                    setSelectedEventId(newest.id_ex);
                    // Si hay un evento nuevo, hacemos flyTo
                    mapRef.current?.flyTo({
                        center: [newest.lon, newest.lat],
                        zoom: 17,
                        duration: 3000
                    });
                }
                setLastNewestId(newest.id_ex);
            }

            setEvents(validEvents);

            // AUTO-FIT: Si es la primera carga y hay eventos, centrar el mapa
            if (validEvents.length > 0 && mapRef.current && !selectedEventId) {
                const lats = validEvents.map(e => e.lat);
                const lons = validEvents.map(e => e.lon);
                const minLat = Math.min(...lats);
                const maxLat = Math.max(...lats);
                const minLon = Math.min(...lons);
                const maxLon = Math.max(...lons);

                mapRef.current.fitBounds(
                    [[minLon, minLat], [maxLon, maxLat]],
                    { padding: 100, duration: 1000 }
                );
            }
        } catch (e) {
            console.error("Error loading map events", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Only load if user exists
        if (!user) return;
        const today = getTodayStr();
        loadEvents(selectedDate === today ? undefined : selectedDate);

        let interval: any;
        if (selectedDate === today) {
            interval = setInterval(() => loadEvents(), 30000);
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [user, selectedDate]);

    const { statsByDist, distColorMap, sellerColorMap } = useMemo(() => {
        const groups: Record<string, {
            id: number;
            count: number;
            lastActivity: string;
            color: string;
            vendedores: Record<string, { count: number; lastActivity: string }>
        }> = {};

        const DIST_COLORS = ["#8b5cf6", "#ec4899", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#84cc16", "#6366f1", "#d946ef"];
        const dColorMap: Record<string, string> = {};
        const sColorMap: Record<string, string> = {};

        events.forEach((ev: LiveMapEvent) => {
            if (!groups[ev.nombre_dist]) {
                const colorIdx = Object.keys(groups).length % DIST_COLORS.length;
                const dColor = DIST_COLORS[colorIdx];
                groups[ev.nombre_dist] = {
                    id: ev.id_dist,
                    count: 0,
                    lastActivity: ev.timestamp_evento,
                    color: dColor,
                    vendedores: {}
                };
                dColorMap[ev.nombre_dist] = dColor;
            }

            const distGroup = groups[ev.nombre_dist];
            distGroup.count++;
            if (new Date(ev.timestamp_evento) > new Date(distGroup.lastActivity)) {
                distGroup.lastActivity = ev.timestamp_evento;
            }

            const sKey = ev.vendedor_nombre;
            if (!distGroup.vendedores[sKey]) {
                distGroup.vendedores[sKey] = {
                    count: 0,
                    lastActivity: ev.timestamp_evento,
                };
                const hash = sKey.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                const rotate = (hash % 40) - 20;
                sColorMap[`${ev.nombre_dist}-${sKey}`] = `hsl(from ${distGroup.color} calc(h + ${rotate}) s l)`;
            }

            const sGroup = distGroup.vendedores[sKey];
            sGroup.count++;
            if (new Date(ev.timestamp_evento) > new Date(sGroup.lastActivity)) {
                sGroup.lastActivity = ev.timestamp_evento;
            }
        });

        const sortedStats = Object.entries(groups)
            .sort((a, b) => b[1].count - a[1].count)
            .map(([name, data]) => ({
                name,
                ...data,
                vendedoresList: Object.entries(data.vendedores)
                    .sort((a, b) => b[1].count - a[1].count)
                    .map(([vName, vData]) => ({ name: vName, ...vData }))
            }));

        return { statsByDist: sortedStats, distColorMap: dColorMap, sellerColorMap: sColorMap };
    }, [events]);

    const statsGlobal = useMemo(() => {
        if (events.length === 0) return { perMin: 0, totalDay: 0, topSellers: [] };
        const now = new Date();
        const lastHourEvents = events.filter(e => (now.getTime() - new Date(e.timestamp_evento).getTime()) / 60000 < 60);
        const sellerCounts: Record<string, number> = {};
        events.forEach(e => { sellerCounts[e.vendedor_nombre] = (sellerCounts[e.vendedor_nombre] || 0) + 1; });
        const topSellers = Object.entries(sellerCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
        return { perMin: (lastHourEvents.length / 60).toFixed(1), totalDay: events.length, topSellers };
    }, [events]);

    const handleToggleDist = async (dist: any) => {
        if (expandedDist === dist.name) { setExpandedDist(null); return; }
        setExpandedDist(dist.name);
        if (!branchStats[dist.name]) {
            setLoadingBranches(dist.name);
            try {
                const firstEv = events.find((e: LiveMapEvent) => e.nombre_dist === dist.name);
                if (firstEv?.id_dist) {
                    const res = await fetchSucursalesCruce(firstEv.id_dist, "mes");
                    setBranchStats(prev => ({ ...prev, [dist.name]: res }));
                }
            } catch (err) { console.error(err); } finally { setLoadingBranches(null); }
        }
    };

    if (!user) return null;

    return (
        <div className="flex h-screen bg-[#0f172a] overflow-hidden">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0 h-full relative">

                {/* Header Flotante */}
                <div className="absolute top-4 left-4 right-4 z-30 flex justify-between pointer-events-none">
                    <div className="flex gap-2 pointer-events-auto">
                        <Card className="px-4 py-2 bg-white/10 backdrop-blur-xl border-white/10 flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                <span className="text-[10px] font-black text-white uppercase tracking-widest">Live Map</span>
                            </div>
                            <div className="w-px h-4 bg-white/10" />
                            <div className="flex items-center gap-2">
                                <Users size={14} className="text-slate-400" />
                                <span className="text-xs font-bold text-white">{events.length}</span>
                                <span className="text-[10px] text-slate-500 font-bold uppercase">Exhibiciones</span>
                            </div>
                        </Card>

                        <Card className="px-3 py-1.5 bg-white/10 backdrop-blur-xl border-white/10 flex items-center gap-2">
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="bg-transparent border-none text-xs font-bold text-white focus:ring-0 cursor-pointer p-0"
                            />
                        </Card>
                    </div>

                    <div className="flex gap-2 pointer-events-auto">
                        <button
                            onClick={() => setShowRoutes(!showRoutes)}
                            className={`p-2 rounded-xl border transition-all flex items-center gap-2 ${showRoutes ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-white/10 border-white/10 text-slate-400'}`}
                            title="Alternar Recorridos"
                        >
                            <MapIcon size={18} />
                            <span className="text-[10px] font-bold uppercase pr-1">Rutas</span>
                        </button>
                        <button
                            onClick={() => setShowStatsPanel(!showStatsPanel)}
                            className={`px-4 py-2 rounded-xl border transition-all flex items-center gap-2 font-bold text-xs ${showStatsPanel ? 'bg-rose-600 border-rose-400 text-white' : 'bg-white/10 border-white/10 text-slate-400'}`}
                        >
                            <Zap size={14} />
                            Stats
                        </button>
                    </div>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    {/* Live Feed Lateral (Vendedores agrupados) */}
                    <div className="w-80 bg-slate-900/50 backdrop-blur-3xl border-r border-white/5 z-20 flex flex-col shadow-2xl shrink-0 transition-all duration-500 overflow-hidden">
                        <div className="p-5 border-b border-white/5">
                            <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.3em]">Timeline Actividad</p>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                            {loading ? (
                                <div className="p-8 text-center"><Spinner /></div>
                            ) : (
                                statsByDist.map(dist => (
                                    <div key={dist.name} className="space-y-1">
                                        <Card
                                            className={`p-3 bg-white/5 border-white/5 hover:bg-white/10 transition-all cursor-pointer ${expandedDist === dist.name ? 'ring-1 ring-primary/30' : ''}`}
                                            onClick={() => handleToggleDist(dist)}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-1.5 h-6 rounded-full" style={{ backgroundColor: dist.color }} />
                                                    <span className="text-[11px] font-black text-slate-200 uppercase truncate max-w-[140px]">{dist.name}</span>
                                                </div>
                                                <span className="text-[10px] font-bold text-slate-500 px-2 py-0.5 bg-white/5 rounded-full">{dist.count}</span>
                                            </div>
                                        </Card>
                                        {expandedDist === dist.name && (
                                            <div className="ml-4 space-y-1.5 animate-in slide-in-from-top-2 duration-300">
                                                {dist.vendedoresList.map(v => (
                                                    <div key={v.name} className="p-2 bg-white/5 border border-white/5 rounded-xl flex items-center justify-between group hover:bg-white/10 transition-colors">
                                                        <span className="text-[10px] font-bold text-slate-400 group-hover:text-slate-200 transition-colors">{v.name}</span>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] text-slate-600">{v.count}</span>
                                                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sellerColorMap[`${dist.name}-${v.name}`] }} />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Mapa Central */}
                    <div className="flex-1 h-full relative bg-[#0b0f19]">
                        <MapaExhibiciones
                            ref={mapRef}
                            events={events}
                            selectedEventId={selectedEventId}
                            showRoutes={showRoutes}
                            distColorMap={distColorMap}
                            sellerColorMap={sellerColorMap}
                            height="100%"
                        />

                        {/* Stats Panel Overlay */}
                        <div className={`absolute top-24 right-4 bottom-4 w-72 z-40 transition-all duration-700 ${showStatsPanel ? "translate-x-0 opacity-100" : "translate-x-[120%] opacity-0"}`}>
                            <Card className="h-full bg-slate-900/90 backdrop-blur-2xl border-white/5 shadow-2xl flex flex-col p-6 space-y-6 overflow-y-auto custom-scrollbar">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-xs font-black text-white uppercase tracking-widest">Global KPIs</h3>
                                    <button onClick={() => setShowStatsPanel(false)}><X size={16} className="text-slate-500" /></button>
                                </div>
                                <div className="space-y-4">
                                    <p className="text-[9px] font-black text-slate-500 uppercase">Ritmo de Carga</p>
                                    <p className="text-3xl font-black text-white tracking-tighter">{statsGlobal.perMin} <span className="text-xs text-slate-500">EXH/M</span></p>
                                </div>
                                <div className="space-y-4">
                                    <p className="text-[9px] font-black text-slate-500 uppercase">Top Sellers</p>
                                    <div className="space-y-3">
                                        {statsGlobal.topSellers.map(([name, count], i) => (
                                            <div key={name} className="flex items-center gap-3">
                                                <span className="text-[10px] font-black text-slate-700">0{i + 1}</span>
                                                <div className="flex-1">
                                                    <div className="flex justify-between text-[11px] font-bold text-slate-300 mb-1">
                                                        <span>{name}</span>
                                                        <span className="text-white">{count}</span>
                                                    </div>
                                                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                                        <div className="h-full bg-rose-500 rounded-full" style={{ width: `${(Number(count) / Number(statsGlobal.topSellers[0][1])) * 100}%` }} />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <p className="text-[9px] font-black text-slate-500 uppercase">Por Distribuidora</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {statsByDist.map(d => (
                                            <div key={d.name} className="p-2 bg-white/5 rounded-xl border border-white/5">
                                                <div className="w-1 h-3 rounded-full mb-1" style={{ backgroundColor: d.color }} />
                                                <p className="text-[8px] font-black text-slate-400 uppercase truncate">{d.name}</p>
                                                <p className="text-md font-black text-white">{d.count}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </Card>
                        </div>
                    </div>
                </div>
            </div>
            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
            `}</style>
        </div>
    );
}
