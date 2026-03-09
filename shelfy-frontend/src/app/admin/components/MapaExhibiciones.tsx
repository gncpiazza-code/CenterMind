"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import {
    Map,
    MapMarker,
    MarkerContent,
    MarkerPopup,
    MarkerTooltip,
    MapControls,
    type MapRef
} from "@/components/ui/map";
import { LiveMapEvent, resolveImageUrl } from "@/lib/api";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { MapPin, User, Building2, ExternalLink, Image as ImageIcon } from "lucide-react";

interface MapaExhibicionesProps {
    events: LiveMapEvent[];
    height?: string;
    theme?: "dark" | "light";
    selectedEventId?: number | null;
}

const DIST_COLORS = [
    "#8b5cf6", "#ec4899", "#3b82f6", "#10b981", "#f59e0b",
    "#ef4444", "#06b6d4", "#84cc16", "#6366f1", "#d946ef"
];

export default function MapaExhibiciones({ events, height = "600px", theme = "dark", selectedEventId }: MapaExhibicionesProps) {
    const mapRef = useRef<MapRef>(null);
    const [popupInfo, setPopupInfo] = useState<LiveMapEvent | null>(null);

    // Color cache for distributors
    const distColorMap = useMemo(() => {
        const uniqueDists = Array.from(new Set(events.map(e => e.nombre_dist)));
        const map: Record<string, string> = {};
        uniqueDists.forEach((name, i) => {
            map[name] = DIST_COLORS[i % DIST_COLORS.length];
        });
        return map;
    }, [events]);

    // Update popup and fly when selectedEventId changes from parent
    useEffect(() => {
        if (selectedEventId) {
            const ev = events.find(e => e.id_ex === selectedEventId);
            if (ev && mapRef.current) {
                setPopupInfo(ev);
                mapRef.current.flyTo({
                    center: [ev.lon, ev.lat],
                    zoom: 16,
                    duration: 2000,
                    essential: true
                });
            }
        }
    }, [selectedEventId, events]);

    // Initial View calculation
    const center = useMemo<[number, number]>(() => {
        if (events.length === 0) return [-64.1833, -31.4167];
        const lons = events.map(e => e.lon);
        const lats = events.map(e => e.lat);
        return [(Math.min(...lons) + Math.max(...lons)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2];
    }, [events]);

    const zoom = useMemo(() => {
        if (events.length === 0) return 4.5;
        if (events.length === 1) return 14;
        return 6;
    }, [events.length]);

    return (
        <div className="w-full relative overflow-hidden flex-1" style={{ height }}>
            <Map
                ref={mapRef}
                center={center}
                zoom={zoom}
                theme={theme}
                className="w-full h-full"
                attributionControl={false}
            >
                <MapControls position="bottom-right" showZoom showCompass showLocate />

                {events.map((event) => {
                    const color = distColorMap[event.nombre_dist] || "#3b82f6";
                    const isSelected = selectedEventId === event.id_ex;

                    return (
                        <MapMarker
                            key={event.id_ex}
                            longitude={event.lon}
                            latitude={event.lat}
                            onClick={() => setPopupInfo(event)}
                        >
                            <MarkerContent>
                                <div className={`relative flex items-center justify-center transition-all duration-300 group ${isSelected ? 'scale-150 z-50' : 'hover:scale-125'}`}>
                                    <span
                                        className={`absolute inline-flex h-6 w-6 rounded-full opacity-40 ${isSelected ? 'animate-ping' : 'group-hover:animate-pulse'}`}
                                        style={{ backgroundColor: color }}
                                    ></span>
                                    <div
                                        className="relative inline-flex rounded-full h-3.5 w-3.5 shadow-xl border-2 border-white dark:border-slate-900"
                                        style={{ backgroundColor: color }}
                                    />
                                </div>
                            </MarkerContent>

                            <MarkerTooltip className="bg-slate-900/90 backdrop-blur-md text-white border-none px-3 py-1.5 rounded-full font-bold text-[10px] uppercase tracking-wider">
                                {event.nombre_dist} • {event.vendedor_nombre}
                            </MarkerTooltip>

                            {popupInfo?.id_ex === event.id_ex && (
                                <MarkerPopup
                                    className="p-0 border-none bg-transparent shadow-2xl min-w-[280px]"
                                    closeButton={false}
                                >
                                    <div className="bg-white dark:bg-slate-900 rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl animate-in zoom-in-95 duration-200">
                                        {/* Cabecera con foto preview */}
                                        <div className="relative h-40 bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                                            {event.drive_link ? (
                                                <img
                                                    src={resolveImageUrl(event.drive_link) || ""}
                                                    alt="Exhibición"
                                                    className="w-full h-full object-cover transition-transform hover:scale-110 duration-700"
                                                    onError={(e) => (e.currentTarget.src = "")}
                                                />
                                            ) : (
                                                <div className="flex flex-col items-center gap-2 text-slate-400">
                                                    <ImageIcon size={32} strokeWidth={1.5} />
                                                    <span className="text-[10px] font-bold uppercase">Sin imagen</span>
                                                </div>
                                            )}

                                            <div className="absolute top-3 right-3">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setPopupInfo(null); }}
                                                    className="bg-black/50 hover:bg-black/70 backdrop-blur-md text-white p-1.5 rounded-full transition-colors"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>

                                            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                                                <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">
                                                    {event.nombre_dist}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Información Detallada */}
                                        <div className="p-4 space-y-4">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2 text-violet-600 dark:text-violet-400">
                                                    <Building2 size={14} />
                                                    <h4 className="text-sm font-black tracking-tight leading-none uppercase">
                                                        {event.cliente_nombre || `Cliente ${event.nro_cliente}`}
                                                    </h4>
                                                </div>
                                                <p className="text-[10px] text-slate-400 font-bold ml-5">ID ERP: {event.nro_cliente}</p>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                                                <div className="space-y-1">
                                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Responsable</span>
                                                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                                                        <User size={12} className="text-slate-400" />
                                                        <span className="truncate">{event.vendedor_nombre}</span>
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Momento</span>
                                                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                                                        <Clock size={12} className="text-slate-400" />
                                                        <span>{format(new Date(event.timestamp_evento), "HH:mm", { locale: es })} hs</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between pt-2">
                                                <span className="text-[9px] text-slate-400 font-medium italic">
                                                    {format(new Date(event.timestamp_evento), "dd 'de' MMM", { locale: es })}
                                                </span>
                                                {event.drive_link && (
                                                    <a
                                                        href={event.drive_link}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex items-center gap-1 text-[10px] font-black text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 uppercase tracking-wider"
                                                    >
                                                        Abrir Drive <ExternalLink size={10} />
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </MarkerPopup>
                            )}
                        </MapMarker>
                    );
                })}
            </Map>
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

function Clock({ size, className }: { size: number, className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
    )
}
