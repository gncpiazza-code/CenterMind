"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import {
    Map,
    MapMarker,
    MarkerContent,
    MarkerPopup,
    MapControls,
    MapRoute,
    type MapRef
} from "@/components/ui/map";
import { LiveMapEvent, resolveImageUrl } from "@/lib/api";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { MapPin, User, Building2, ExternalLink, Image as ImageIcon, Clock } from "lucide-react";
import { Card } from "@/components/ui/Card";

interface MapaExhibicionesProps {
    events: LiveMapEvent[];
    height?: string | number;
    theme?: "dark" | "light";
    selectedEventId?: number | null;
    showRoutes?: boolean;
    distColorMap?: Record<string, string>;
    sellerColorMap?: Record<string, string>;
}

export default function MapaExhibiciones({
    events,
    height = "600px",
    theme = "dark",
    selectedEventId,
    showRoutes = true,
    distColorMap = {},
    sellerColorMap = {}
}: MapaExhibicionesProps) {
    const mapRef = useRef<MapRef>(null);
    const [popupInfo, setPopupInfo] = useState<LiveMapEvent | null>(null);

    // Update popup and fly when selectedEventId changes from parent
    useEffect(() => {
        if (selectedEventId) {
            const ev = events.find(e => e.id_ex === selectedEventId);
            if (ev && mapRef.current) {
                setPopupInfo(ev);
                mapRef.current.flyTo({
                    center: [ev.lon, ev.lat],
                    zoom: 17,
                    pitch: 60,
                    bearing: (Math.random() * 90) - 45,
                    duration: 2500,
                    essential: true
                });
            }
        }
    }, [selectedEventId, events]);

    // Group coordinates by salesperson for routes and calculate stop numbers
    const { routesBySeller, stopNumbers } = useMemo(() => {
        const routes: Record<string, [number, number][]> = {};
        const stopNums: Record<number, number> = {};

        // Group first
        const grouped: Record<string, LiveMapEvent[]> = {};
        events.forEach(ev => {
            const key = `${ev.vendedor_nombre}-${ev.id_dist}`;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(ev);
        });

        Object.entries(grouped).forEach(([key, evs]) => {
            // Sort chronologically (Oldest first for 1, 2, 3...)
            const sorted = evs.sort((a, b) =>
                new Date(a.timestamp_evento).getTime() - new Date(b.timestamp_evento).getTime()
            );

            routes[key] = sorted.map(ev => [ev.lon, ev.lat] as [number, number]);

            // Assign stop numbers
            sorted.forEach((ev, idx) => {
                stopNums[ev.id_ex] = idx + 1;
            });
        });

        return { routesBySeller: Object.entries(routes), stopNumbers: stopNums };
    }, [events]);

    return (
        <div className="w-full relative overflow-hidden flex-1" style={{ height }}>
            <Map
                ref={mapRef}
                center={[-58.3816, -34.6037]}
                zoom={12}
                theme={theme}
                className="w-full h-full"
                attributionControl={false}
                antialias={true}
                maxPitch={85}
                show3DBuildings={true}
            >
                <MapControls position="bottom-right" showZoom showCompass showLocate />

                {/* Render Routes */}
                {showRoutes && routesBySeller.map(([sellerKey, coordinates]) => {
                    const [vName, distIdStr] = sellerKey.split('-');
                    const firstEv = events.find(e => e.vendedor_nombre === vName && String(e.id_dist) === distIdStr);
                    const color = firstEv ? (distColorMap[firstEv.nombre_dist] || "#3b82f6") : "#3b82f6";

                    return (
                        <MapRoute
                            key={`route-${sellerKey}`}
                            id={`route-${sellerKey}`}
                            coordinates={coordinates}
                            color={color}
                            width={3}
                            opacity={0.3}
                            interactive={false}
                        />
                    );
                })}

                {events.map((event) => {
                    const eventDate = new Date(event.timestamp_evento);
                    const now = new Date();
                    const ageMinutes = (now.getTime() - eventDate.getTime()) / (1000 * 60);

                    // Colors
                    const distColor = distColorMap[event.nombre_dist] || "#64748b";
                    const sKey = `${event.nombre_dist}-${event.vendedor_nombre}`;
                    const sellerColor = sellerColorMap[sKey] || distColor;

                    // Aging Logic
                    let scale = 1;
                    let opacity = 0.8;
                    let pulse = false;
                    let coreColor = sellerColor;
                    let borderColor = "white";

                    if (ageMinutes < 30) {
                        scale = 1.4;
                        opacity = 1;
                        pulse = true;
                        borderColor = "white";
                    } else if (ageMinutes < 120) {
                        scale = 1.15;
                        opacity = 0.9;
                        pulse = true;
                    } else if (ageMinutes < 300) {
                        scale = 1;
                        opacity = 0.7;
                    } else {
                        scale = 0.85;
                        opacity = 0.45;
                        coreColor = "#475569";
                        borderColor = distColor;
                    }

                    const isSelected = selectedEventId === event.id_ex;

                    return (
                        <MapMarker
                            key={event.id_ex}
                            longitude={event.lon}
                            latitude={event.lat}
                            onClick={() => setPopupInfo(event)}
                        >
                            <MarkerContent>
                                <div
                                    className={`relative flex items-center justify-center transition-all duration-500 group ${isSelected ? 'scale-150 z-50' : 'hover:scale-125'}`}
                                    style={{ transform: `scale(${scale * (isSelected ? 1.4 : 1)})` }}
                                >
                                    <span
                                        className={`absolute inline-flex h-7 w-7 rounded-full opacity-40 ${pulse || isSelected ? 'animate-ping' : 'hidden group-hover:inline-flex'}`}
                                        style={{ backgroundColor: distColor }}
                                    ></span>

                                    <div
                                        className="relative inline-flex rounded-full h-4 w-4 shadow-[0_0_15px_rgba(255,255,255,0.2)] border-2 transition-colors duration-1000"
                                        style={{ backgroundColor: distColor, borderColor: borderColor, opacity }}
                                    >
                                        <div
                                            className="absolute inset-[10%] rounded-full shadow-inner transition-colors duration-1000 flex items-center justify-center"
                                            style={{ backgroundColor: coreColor }}
                                        >
                                            {showRoutes && stopNumbers[event.id_ex] && (
                                                <span className="text-[8px] font-black text-white leading-none scale-90">
                                                    {stopNumbers[event.id_ex]}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[100]">
                                        <div className="bg-slate-900/90 backdrop-blur-md text-white px-2 py-1 rounded text-[10px] font-bold whitespace-nowrap border border-white/10 shadow-xl">
                                            {event.vendedor_nombre} • {formatDistanceToNow(eventDate, { addSuffix: true, locale: es })}
                                        </div>
                                    </div>
                                </div>
                            </MarkerContent>

                            {popupInfo?.id_ex === event.id_ex && (
                                <MarkerPopup
                                    className="p-0 border-none bg-transparent shadow-2xl min-w-[280px]"
                                    closeButton={true}
                                >
                                    <Card className="overflow-hidden border-none bg-slate-900 shadow-2xl">
                                        {/* Image Section */}
                                        <div className="relative aspect-video bg-slate-800 flex items-center justify-center overflow-hidden">
                                            {event.drive_link ? (
                                                <>
                                                    <img
                                                        src={resolveImageUrl((event.drive_link || '') as string)}
                                                        alt="Exhibición"
                                                        className="w-full h-full object-cover transition-transform duration-700 hover:scale-110"
                                                        onError={(e) => {
                                                            (e.target as any).src = "";
                                                            (e.target as any).classList.add('hidden');
                                                        }}
                                                    />
                                                    <div className="absolute top-2 right-2">
                                                        <a
                                                            href={event.drive_link}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="p-1.5 bg-black/50 backdrop-blur-md rounded-lg text-white/70 hover:text-white transition-colors"
                                                        >
                                                            <ExternalLink size={14} />
                                                        </a>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="flex flex-col items-center gap-2 text-slate-500">
                                                    <ImageIcon size={32} strokeWidth={1.5} />
                                                    <span className="text-[10px] font-bold uppercase tracking-widest">Sin imagen</span>
                                                </div>
                                            )}

                                            {/* Badge Overlays */}
                                            <div className="absolute bottom-2 left-2 flex gap-1.5">
                                                <div className="px-2 py-1 bg-black/40 backdrop-blur-md rounded-md border border-white/10 flex items-center gap-1.5">
                                                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: distColor }} />
                                                    <span className="text-[9px] font-black text-white uppercase tracking-wider">{event.nombre_dist}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Info Section */}
                                        <div className="p-4 space-y-3">
                                            <div>
                                                <div className="flex items-center gap-2 text-rose-400 mb-1">
                                                    <User size={14} />
                                                    <h3 className="text-sm font-black text-white">{event.vendedor_nombre}</h3>
                                                </div>
                                                <div className="flex items-center gap-2 text-slate-500">
                                                    <Clock size={12} />
                                                    <span className="text-[10px] font-bold uppercase tracking-tight">
                                                        {format(new Date(event.timestamp_evento), "d MMM, HH:mm", { locale: es })}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="h-px bg-white/5" />

                                            <div className="space-y-2">
                                                <div className="flex items-start gap-3">
                                                    <div className="mt-0.5 p-1.5 bg-slate-800 rounded-lg text-slate-400">
                                                        <Building2 size={14} />
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider leading-none mb-1">Cliente</p>
                                                        <p className="text-xs font-bold text-slate-200 leading-tight">{event.cliente_nombre}</p>
                                                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">#{event.nro_cliente}</p>
                                                    </div>
                                                </div>

                                                <div className="flex items-start gap-3">
                                                    <div className="mt-0.5 p-1.5 bg-slate-800 rounded-lg text-slate-400">
                                                        <MapPin size={14} />
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider leading-none mb-1">Ubicación</p>
                                                        <p className="text-[10px] font-mono text-slate-400">{event.lat.toFixed(6)}, {event.lon.toFixed(6)}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </Card>
                                </MarkerPopup>
                            )}
                        </MapMarker>
                    );
                })}
            </Map>
        </div>
    );
}

