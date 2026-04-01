"use client";

import React, { useMemo, useState, useEffect, useRef, forwardRef } from "react";
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
    highlightedEvent?: LiveMapEvent | null;
}

const MapaExhibiciones = forwardRef<MapRef, MapaExhibicionesProps>(({
    events,
    height = "600px",
    theme = "dark",
    selectedEventId,
    showRoutes = true,
    distColorMap = {},
    sellerColorMap = {},
    highlightedEvent = null,
}, ref) => {
    const [popupInfo, setPopupInfo] = useState<LiveMapEvent | null>(null);

    // Update popup and fly when selectedEventId changes from parent
    useEffect(() => {
        if (selectedEventId) {
            const ev = events.find(e => e.id_ex === selectedEventId);
            // Seguridad: No volar si las coordenadas son 0,0 o inválidas (previene el error de NaN)
            const hasValidCoords = ev && typeof ev.lng === 'number' && typeof ev.lat === 'number' && (ev.lng !== 0 || ev.lat !== 0);

            if (ev && hasValidCoords && ref && 'current' in ref && ref.current) {
                setPopupInfo(ev);
                (ref.current as any).flyTo({
                    center: [ev.lng, ev.lat],
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

            routes[key] = sorted.map(ev => [ev.lng, ev.lat] as [number, number]);

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
                ref={ref}
                center={[-58.3816, -34.6037]}
                zoom={12}
                theme={theme}
                className="w-full h-full"
                attributionControl={false}
                antialias={true}
                maxPitch={85}
                show3DBuildings={false}
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

                {/* ── Photo Card Marker (modo-oficina highlighted event) ── */}
                {highlightedEvent && highlightedEvent.lat !== 0 && highlightedEvent.lng !== 0 && (
                    <MapMarker
                        key={`highlight-${highlightedEvent.id_ex}`}
                        longitude={highlightedEvent.lng}
                        latitude={highlightedEvent.lat}
                        anchor="bottom"
                        offset={[0, -4]}
                    >
                        <MarkerContent>
                            <style>{`
                                @keyframes photoCardIn {
                                    0%  { opacity: 0; transform: translateY(20px) scale(0.88); }
                                    100%{ opacity: 1; transform: translateY(0)     scale(1);    }
                                }
                                .photo-card-pin::after {
                                    content: "";
                                    position: absolute;
                                    bottom: -10px;
                                    left: 50%;
                                    transform: translateX(-50%);
                                    border-left: 10px solid transparent;
                                    border-right: 10px solid transparent;
                                    border-top: 10px solid rgba(124,58,237,0.7);
                                }
                            `}</style>
                            <div
                                className="photo-card-pin"
                                style={{
                                    width: 210,
                                    background: "rgba(6,13,26,0.92)",
                                    backdropFilter: "blur(18px)",
                                    WebkitBackdropFilter: "blur(18px)",
                                    border: "1.5px solid rgba(124,58,237,0.7)",
                                    borderRadius: 16,
                                    overflow: "hidden",
                                    boxShadow: "0 12px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(124,58,237,0.2)",
                                    animation: "photoCardIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) both",
                                    position: "relative",
                                    cursor: "default",
                                }}
                            >
                                {/* Photo */}
                                <div style={{ height: 130, overflow: "hidden", background: "#0f172a", position: "relative" }}>
                                    {highlightedEvent.drive_link ? (
                                        <img
                                            src={resolveImageUrl(highlightedEvent.drive_link)}
                                            alt="Exhibición"
                                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                        />
                                    ) : (
                                        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#334155" }}>
                                            <ImageIcon size={28} strokeWidth={1.5} />
                                        </div>
                                    )}
                                    {/* Live badge */}
                                    <div style={{
                                        position: "absolute", top: 8, left: 8,
                                        display: "flex", alignItems: "center", gap: 5,
                                        background: "rgba(6,13,26,0.75)", backdropFilter: "blur(8px)",
                                        border: "1px solid rgba(16,185,129,0.4)", borderRadius: 999,
                                        padding: "3px 8px",
                                    }}>
                                        <span style={{ width: 6, height: 6, borderRadius: 999, background: "#10b981", display: "inline-block", animation: "pulse 2s infinite" }} />
                                        <span style={{ fontSize: 9, fontWeight: 900, color: "#10b981", textTransform: "uppercase", letterSpacing: "0.15em" }}>Live</span>
                                    </div>
                                </div>

                                {/* Info */}
                                <div style={{ padding: "10px 12px 14px" }}>
                                    <div style={{ fontSize: 13, fontWeight: 900, color: "#f1f5f9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                        {highlightedEvent.cliente_nombre}
                                    </div>
                                    <div style={{ fontSize: 10, color: "#7c3aed", fontWeight: 700, marginTop: 1 }}>
                                        {highlightedEvent.vendedor_nombre}
                                    </div>
                                    {(highlightedEvent.domicilio || highlightedEvent.localidad) && (
                                        <div style={{ fontSize: 10, color: "#64748b", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                            {[highlightedEvent.domicilio, highlightedEvent.localidad].filter(Boolean).join(", ")}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </MarkerContent>
                    </MapMarker>
                )}

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
                            longitude={event.lng}
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
                                                        src={resolveImageUrl((event.drive_link || '') as string) || undefined}
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

                                            <div className="space-y-3">
                                                <div className="flex items-start gap-3">
                                                    <div className="mt-0.5 p-1.5 bg-slate-800 rounded-lg text-slate-400">
                                                        <Building2 size={14} />
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider leading-none mb-1">Cliente</p>
                                                        <p className="text-sm font-bold text-rose-300 leading-tight">{event.cliente_nombre}</p>
                                                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">#{event.nro_cliente}</p>
                                                    </div>
                                                </div>

                                                <div className="flex items-start gap-3">
                                                    <div className="mt-0.5 p-1.5 bg-slate-800 rounded-lg text-slate-400">
                                                        <MapPin size={14} />
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider leading-none mb-1">Ubicación</p>
                                                        <p className="text-xs text-slate-200 mt-0.5">{event.domicilio}</p>
                                                        <p className="text-[10px] text-slate-400">{event.localidad}</p>
                                                        <p className="text-[10px] font-mono text-slate-500 mt-1">{event.lat.toFixed(6)}, {event.lng.toFixed(6)}</p>
                                                    </div>
                                                </div>

                                                {(event.telefono || event.fecha_alta) && (
                                                    <div className="grid grid-cols-2 gap-4 pt-1">
                                                        {event.telefono && (
                                                            <div>
                                                                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">Teléfono</p>
                                                                <p className="text-xs font-bold text-emerald-400">{event.telefono}</p>
                                                            </div>
                                                        )}
                                                        {event.fecha_alta && (
                                                            <div>
                                                                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">Alta</p>
                                                                <p className="text-xs font-bold text-slate-300">{format(new Date(event.fecha_alta), "dd/MM/yyyy")}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
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
});

export default MapaExhibiciones;

