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
import "leaflet/dist/leaflet.css";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

// Import Leaflet components dynamically to avoid SSR issues
const MapContainer = dynamic(() => import("react-leaflet").then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import("react-leaflet").then(m => m.Marker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then(m => m.Popup), { ssr: false });

export default function LiveMapPage() {
    const { user } = useAuth();
    const [events, setEvents] = useState<LiveMapEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [L, setL] = useState<any>(null);

    // Load Leaflet on client side
    useEffect(() => {
        import("leaflet").then(leaflet => {
            setL(leaflet);
        });
    }, []);

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

    // Icono personalizado para los puntitos (PULSING)
    const pulsingIcon = useMemo(() => {
        if (!L) return null;
        return L.divIcon({
            className: "custom-div-icon",
            html: `
        <div class="relative flex items-center justify-center">
          <div class="absolute w-6 h-6 bg-violet-500 rounded-full animate-ping opacity-75"></div>
          <div class="relative w-3 h-3 bg-violet-600 rounded-full border-2 border-white shadow-sm"></div>
        </div>
      `,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });
    }, [L]);

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

                    {/* Mapa Full Screen */}
                    <div className="flex-1 h-full relative z-10">
                        {typeof window !== "undefined" && L && (
                            <MapContainer
                                center={[-34.6037, -58.3816]} // Buenos Aires aprox
                                zoom={5}
                                style={{ height: "100%", width: "100%" }}
                                className="z-0"
                            >
                                <TileLayer
                                    url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                                />

                                {events.map((ev) => (
                                    <Marker
                                        key={ev.id_ex}
                                        position={[Number(ev.lat), Number(ev.lon)]}
                                        icon={pulsingIcon ?? undefined}
                                    >
                                        <Popup className="custom-popup">
                                            <div className="p-1">
                                                <h4 className="font-black text-slate-900 leading-tight mb-1">{ev.vendedor_nombre}</h4>
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                                                        <Building2 size={12} className="text-violet-500" />
                                                        {ev.nombre_dist}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                                                        <Users size={12} className="text-emerald-500" />
                                                        Cliente #{ev.nro_cliente}
                                                    </div>
                                                    <div className="mt-2 text-[9px] text-slate-400 italic border-t pt-1">
                                                        {new Date(ev.timestamp_evento).toLocaleString('es-AR')}
                                                    </div>
                                                </div>
                                            </div>
                                        </Popup>
                                    </Marker>
                                ))}
                            </MapContainer>
                        )}

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

            <style jsx global>{`
        .custom-popup .leaflet-popup-content-wrapper {
          border-radius: 12px;
          padding: 0;
          overflow: hidden;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
          border: 1px solid rgba(0,0,0,0.05);
        }
        .leaflet-div-icon {
          background: transparent;
          border: none;
        }
      `}</style>
        </div>
    );
}
