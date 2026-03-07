"use client";

import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import Map, { Marker, Popup, NavigationControl, MapRef } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { LiveMapEvent } from "@/lib/api";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface MapaExhibicionesProps {
    events: LiveMapEvent[];
    height?: string;
    theme?: "dark" | "light";
    selectedEventId?: number | null;
}

// Read from environment, fallback to temporary development key
const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY || "G6B85Hh6h0w6WXZlE8S8";

// MapTiler style URLs
const STYLES = {
    dark: `https://api.maptiler.com/maps/darkmatter/style.json?key=${MAPTILER_KEY}`,
    light: `https://api.maptiler.com/maps/voyager/style.json?key=${MAPTILER_KEY}`
};

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
                    zoom: 15,
                    duration: 2000
                });
            }
        }
    }, [selectedEventId, events]);

    // Initial View calculation (only once or when events change significantly)
    const initialViewState = useMemo(() => {
        if (events.length === 0) {
            return {
                longitude: -64.1833, // Córdoba centro
                latitude: -31.4167,
                zoom: 4.5,
            };
        }

        const lons = events.map(e => e.lon);
        const lats = events.map(e => e.lat);
        const minLon = Math.min(...lons);
        const maxLon = Math.max(...lons);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);

        // Calculate a better default zoom
        const lonDiff = Math.abs(maxLon - minLon);
        const latDiff = Math.abs(maxLat - minLat);
        const maxDiff = Math.max(lonDiff, latDiff);

        let zoom = 5;
        if (maxDiff < 0.1) zoom = 12;
        else if (maxDiff < 1) zoom = 9;
        else if (maxDiff < 5) zoom = 6;

        return {
            longitude: (minLon + maxLon) / 2,
            latitude: (minLat + maxLat) / 2,
            zoom: events.length === 1 ? 14 : zoom,
        };
    }, [events.length]); // Only recalc if count changes

    return (
        <div style={{ height, width: "100%", overflow: "hidden", position: "relative" }}>
            <Map
                ref={mapRef}
                initialViewState={initialViewState}
                mapStyle={theme === "dark" ? STYLES.dark : STYLES.light}
                attributionControl={false}
            >
                <NavigationControl position="bottom-right" />

                {events.map((event) => {
                    const color = distColorMap[event.nombre_dist] || "#3b82f6";
                    return (
                        <Marker
                            key={event.id_ex}
                            longitude={event.lon}
                            latitude={event.lat}
                            onClick={(e: any) => {
                                e.originalEvent.stopPropagation();
                                setPopupInfo(event);
                            }}
                        >
                            <div className="cursor-pointer relative flex items-center justify-center w-6 h-6 hover:scale-150 transition-all duration-300 group">
                                <span
                                    className="absolute inline-flex h-full w-full rounded-full opacity-40 animate-ping"
                                    style={{ backgroundColor: color }}
                                ></span>
                                <span
                                    className="relative inline-flex rounded-full h-3 w-3 shadow-lg border-2 border-white/20"
                                    style={{ backgroundColor: color }}
                                ></span>

                                {/* Tooltip simple hover */}
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black/80 backdrop-blur-md rounded text-white text-[9px] font-black opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity uppercase">
                                    {event.nombre_dist}
                                </div>
                            </div>
                        </Marker>
                    );
                })}

                {popupInfo && (
                    <Popup
                        longitude={popupInfo.lon}
                        latitude={popupInfo.lat}
                        anchor="bottom"
                        onClose={() => setPopupInfo(null)}
                        closeButton={true}
                        closeOnClick={false}
                        className="rounded-xl shadow-2xl overflow-hidden min-w-[240px] z-[1000] custom-popup"
                        maxWidth="320px"
                    >
                        <div className="p-3 flex flex-col gap-2 text-slate-800 bg-white rounded-lg">
                            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                                <div
                                    className="w-3 h-3 rounded-full shrink-0"
                                    style={{ backgroundColor: distColorMap[popupInfo.nombre_dist] }}
                                />
                                <span className="font-black text-[10px] uppercase tracking-wider text-slate-400">
                                    {popupInfo.nombre_dist}
                                </span>
                            </div>

                            <div className="space-y-1 mt-1">
                                <p className="text-sm font-black text-slate-900 leading-tight">Cliente: {popupInfo.nro_cliente}</p>
                                <p className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
                                    Vendedor: <span className="text-violet-600 uppercase">{popupInfo.vendedor_nombre}</span>
                                </p>
                            </div>

                            <div className="text-[10px] text-slate-400 font-medium pt-2 border-t border-slate-50">
                                {format(new Date(popupInfo.timestamp_evento), "PPPP p", { locale: es })}
                            </div>
                        </div>
                    </Popup>
                )}
            </Map>

            <style jsx global>{`
                .custom-popup .maplibregl-popup-content {
                    padding: 0;
                    border-radius: 12px;
                    border: none;
                    box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
                }
                .custom-popup .maplibregl-popup-close-button {
                    padding: 8px;
                    color: #94a3b8;
                    font-size: 16px;
                }
            `}</style>
        </div>
    );
}
