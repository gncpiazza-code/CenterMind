"use client";

import React, { useMemo, useState } from "react";
import Map, { Marker, Popup, NavigationControl } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { LiveMapEvent, getImageUrl } from "@/lib/api";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface MapaExhibicionesProps {
    events: LiveMapEvent[];
    height?: string;
    theme?: "dark" | "light";
}

// Read from environment, fallback to temporary development key
const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY || "G6B85Hh6h0w6WXZlE8S8";

// MapTiler style URLs
const STYLES = {
    dark: `https://api.maptiler.com/maps/darkmatter/style.json?key=${MAPTILER_KEY}`,
    light: `https://api.maptiler.com/maps/voyager/style.json?key=${MAPTILER_KEY}`
};

export default function MapaExhibiciones({ events, height = "600px", theme = "dark" }: MapaExhibicionesProps) {
    const [popupInfo, setPopupInfo] = useState<LiveMapEvent | null>(null);

    // Calcula el centro y el zoom inicial basados en los eventos (o Córdoba por defecto si no hay eventos)
    const initialViewState = useMemo(() => {
        if (events.length === 0) {
            return {
                longitude: -64.1833, // Córdoba centro
                latitude: -31.4167,
                zoom: 4,
            };
        }

        // Calcula el centroide simple de todos los puntos
        const lons = events.map(e => e.lon);
        const lats = events.map(e => e.lat);
        const minLon = Math.min(...lons);
        const maxLon = Math.max(...lons);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);

        return {
            longitude: (minLon + maxLon) / 2,
            latitude: (minLat + maxLat) / 2,
            zoom: events.length === 1 ? 12 : 5, // Más zoom si es un solo punto
        };
    }, [events]);

    return (
        <div style={{ height, width: "100%", borderRadius: "12px", overflow: "hidden", position: "relative", border: "1px solid #333" }}>
            <Map
                initialViewState={initialViewState}
                mapStyle={theme === "dark" ? STYLES.dark : STYLES.light}
                attributionControl={false}
            >
                <NavigationControl position="top-right" />

                {events.map((event) => (
                    <Marker
                        key={event.id_ex}
                        longitude={event.lon}
                        latitude={event.lat}
                        onClick={(e: any) => {
                            e.originalEvent.stopPropagation();
                            setPopupInfo(event);
                        }}
                    >
                        <div className="cursor-pointer relative flex items-center justify-center w-6 h-6 hover:scale-125 transition-transform duration-200">
                            <span className="absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-60 animate-ping"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]"></span>
                        </div>
                    </Marker>
                ))}

                {popupInfo && (
                    <Popup
                        longitude={popupInfo.lon}
                        latitude={popupInfo.lat}
                        anchor="bottom"
                        onClose={() => setPopupInfo(null)}
                        closeButton={true}
                        closeOnClick={false}
                        className="rounded-lg shadow-xl overflow-hidden min-w-[200px]"
                        maxWidth="300px"
                    >
                        <div className="p-1 flex flex-col gap-2 text-black">
                            {/* Intentar renderizar la imagen si estuviera disponible.
                  Nota: LiveMapEvent actual no expone link de foto, requeriremos ajustar el endpoint si queremos foto.
              */}
                            <div className="font-bold text-base text-gray-800 border-b pb-1">
                                Cliente: {popupInfo.nro_cliente}
                            </div>
                            <div className="text-sm">
                                <p><span className="font-semibold text-gray-600">Vendedor:</span> {popupInfo.vendedor_nombre}</p>
                                <p><span className="font-semibold text-gray-600">Distribuidora:</span> {popupInfo.nombre_dist}</p>
                                <p className="text-xs text-gray-500 mt-2">
                                    {format(new Date(popupInfo.timestamp_evento), "dd MMM yyyy HH:mm", { locale: es })}
                                </p>
                            </div>
                        </div>
                    </Popup>
                )}
            </Map>
        </div>
    );
}
