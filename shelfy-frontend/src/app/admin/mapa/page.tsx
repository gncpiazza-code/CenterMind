"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { PageSpinner } from "@/components/ui/Spinner";
import { useAuth } from "@/hooks/useAuth";
import { fetchLiveMapEvents, type LiveMapEvent } from "@/lib/api";
import { useEffect, useState, useMemo } from "react";
import { MapPin, Zap, Clock, Users, Building2 } from "lucide-react";
import dynamic from "next/dynamic";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

// Import new MapLibre component dynamically (CSR only)
const MapaExhibiciones = dynamic(() => import("../components/MapaExhibiciones"), { ssr: false });

export default function LiveMapPage() {
    const { user } = useAuth();
    const [events, setEvents] = useState<LiveMapEvent[]>([]);
    const [loading, setLoading] = useState(true);

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
        const interval = setInterval(loadEvents, 45000); // 45s refresh
        return () => clearInterval(interval);
    }, [user]);



    if (user?.rol !== "superadmin") return null;

    return (
        <div className="flex h-screen bg-[var(--shelfy-bg)] overflow-hidden">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0 h-full">
                <Topbar title="Mapa de Actividad en Vivo" />

                <div className="flex-1 flex flex-col lg:flex-row relative">

                    {/* Feed Lateral (Live Stream) */}
                    <div className="w-full lg:w-80 bg-white border-r border-slate-200 z-20 flex flex-col shadow-2xl">
                        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                <Zap size={14} className="text-amber-500 fill-amber-500" />
                                Live Stream
                            </h3>
                            <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Últimas interacciones detectadas</p>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 space-y-2">
                            {loading ? <div className="p-8 text-center"><PageSpinner /></div> : (
                                events.map((ev, i) => (
                                    <div
                                        key={ev.id_ex}
                                        className="p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-violet-200 hover:bg-violet-50/30 transition-all cursor-pointer group"
                                        style={{ animation: `slideUp 0.3s ease-out ${i * 0.05}s forwards`, opacity: 0 }}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-[10px] font-black text-violet-600 bg-violet-100 px-1.5 py-0.5 rounded uppercase">
                                                {ev.nombre_dist}
                                            </span>
                                            <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                                                <Clock size={10} />
                                                {formatDistanceToNow(new Date(ev.timestamp_evento), { addSuffix: true, locale: es })}
                                            </span>
                                        </div>
                                        <p className="text-sm font-bold text-slate-900 group-hover:text-violet-700 truncate">
                                            {ev.vendedor_nombre}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <MapPin size={10} className="text-slate-400" />
                                            <span className="text-[10px] text-slate-500 font-medium truncate">Cliente {ev.nro_cliente}</span>
                                        </div>
                                    </div>
                                ))
                            )}
                            {!loading && events.length === 0 && (
                                <div className="p-8 text-center text-slate-400 italic text-sm">
                                    Esperando actividad...
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Mapa Full Screen (MapLibre) */}
                    <div className="flex-1 h-full relative z-10 bg-[#1e1e1e]">
                        <MapaExhibiciones events={events} height="100%" theme="dark" />

                        {/* Overlay Info */}
                        <div className="absolute top-4 right-4 z-20 flex flex-col gap-2 pointer-events-none">
                            <Card className="p-3 glass-card border-none ring-1 ring-white/20 shadow-2xl bg-white/80 backdrop-blur-md">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-violet-500 rounded-full animate-pulse" />
                                    <span className="text-[10px] font-black text-slate-900 uppercase tracking-tighter">
                                        {events.length} Eventos detectados (2h)
                                    </span>
                                </div>
                            </Card>
                        </div>
                    </div>

                </div>
            </div>


        </div>
    );
}
