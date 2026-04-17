"use client";

import React, { useMemo, useState, useEffect, forwardRef } from "react";
import {
    Map,
    MapMarker,
    MarkerContent,
    MapPopup,
    MapControls,
    MapRoute,
    type MapRef,
} from "@/components/ui/map";
import { LiveMapEvent, resolveImageUrl } from "@/lib/api";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { MapPin, User, Building2, ExternalLink, Image as ImageIcon, Clock } from "lucide-react";

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

// ── CSS keyframe for box-shadow pulse (WebGL-safe, no transform) ──────────────
const AURA_STYLE = `
@keyframes shelfy-aura {
  0%   { box-shadow: 0 0 0 2px var(--aura-color, rgba(139,92,246,0.6)); }
  70%  { box-shadow: 0 0 0 10px transparent; }
  100% { box-shadow: 0 0 0 10px transparent; }
}
.shelfy-pin-aura { animation: shelfy-aura 1.8s ease-out infinite; }
`;

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
    const [popupEvent, setPopupEvent] = useState<LiveMapEvent | null>(null);

    // Fly to selected event (clean animation — no pitch, no random bearing)
    useEffect(() => {
        if (!selectedEventId) return;
        const ev = events.find(e => e.id_ex === selectedEventId);
        if (!ev) return;
        const hasCoords = typeof ev.lng === "number" && typeof ev.lat === "number"
            && !(ev.lng === 0 && ev.lat === 0);
        if (!hasCoords) return;

        setPopupEvent(ev);
        if (ref && "current" in ref && ref.current) {
            (ref.current as any).flyTo({
                center: [ev.lng, ev.lat],
                zoom: 16,
                pitch: 0,
                bearing: 0,
                duration: 1500,
                essential: true,
            });
        }
    }, [selectedEventId, events]);

    // Build routes — store color with the route to avoid fragile key re-parsing
    const { routesList, stopNumbers } = useMemo(() => {
        // Use a safe separator that won't appear in vendor names
        const SEP = "\u001F";
        const grouped: Record<string, LiveMapEvent[]> = {};

        events.forEach(ev => {
            const key = `${ev.vendedor_nombre}${SEP}${ev.id_dist}`;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(ev);
        });

        const routes: { key: string; coordinates: [number, number][]; color: string }[] = [];
        const stopNums: Record<number, number> = {};

        Object.entries(grouped).forEach(([key, evs]) => {
            const sorted = [...evs].sort(
                (a, b) => new Date(a.timestamp_evento).getTime() - new Date(b.timestamp_evento).getTime()
            );
            sorted.forEach((ev, idx) => { stopNums[ev.id_ex] = idx + 1; });

            // Resolve color directly — no key re-parsing
            const firstEv = evs[0];
            const color = distColorMap[firstEv.nombre_dist] ?? "#3b82f6";

            routes.push({
                key,
                coordinates: sorted.map(ev => [ev.lng, ev.lat]),
                color,
            });
        });

        return { routesList: routes, stopNumbers: stopNums };
    }, [events, distColorMap]);

    return (
        <>
            <style>{AURA_STYLE}</style>
            {/* dark wrapper forces dark-themed map controls */}
            <div className="w-full relative overflow-hidden flex-1 dark" style={{ height }}>
                <Map
                    ref={ref}
                    center={[-58.3816, -34.6037]}
                    zoom={12}
                    theme={theme}
                    className="w-full h-full"
                    attributionControl={false}
                    antialias={true}
                    maxPitch={60}
                    show3DBuildings={false}
                >
                    <MapControls position="bottom-right" showZoom showCompass showLocate />

                    {/* Routes — dashed, translucent, never interactive */}
                    {showRoutes && routesList.map(route => (
                        <MapRoute
                            key={`route-${route.key}`}
                            id={`route-${route.key}`}
                            coordinates={route.coordinates}
                            color={route.color}
                            width={2}
                            opacity={0.35}
                            dashArray={[4, 4]}
                            interactive={false}
                        />
                    ))}

                    {/* Markers */}
                    {events.map(event => {
                        if (highlightedEvent && event.id_ex === highlightedEvent.id_ex) return null;

                        const eventDate = new Date(event.timestamp_evento);
                        const ageMinutes = (Date.now() - eventDate.getTime()) / 60_000;

                        const distColor = distColorMap[event.nombre_dist] ?? "#64748b";
                        const sKey = `${event.nombre_dist}-${event.vendedor_nombre}`;
                        const sellerColor = sellerColorMap[sKey] ?? distColor;

                        // Age-based scale only — no extra multiplier for hover/selection
                        let scale = 1;
                        let opacity = 0.85;
                        let pulse = false;
                        let dotColor = sellerColor;
                        let borderColor = "white";

                        if (ageMinutes < 30) {
                            scale = 1.25; opacity = 1; pulse = true;
                        } else if (ageMinutes < 120) {
                            scale = 1.1; opacity = 0.9; pulse = true;
                        } else if (ageMinutes < 300) {
                            scale = 1; opacity = 0.75;
                        } else {
                            scale = 0.85; opacity = 0.45;
                            dotColor = "#475569"; borderColor = distColor;
                        }

                        const isSelected = selectedEventId === event.id_ex;
                        const isPopupOpen = popupEvent?.id_ex === event.id_ex;

                        // Selected ring: box-shadow, not transform
                        const dotShadow = isSelected || isPopupOpen
                            ? `0 0 0 3px ${distColor}80, 0 0 12px ${distColor}60`
                            : `0 0 6px rgba(0,0,0,0.4)`;

                        return (
                            <MapMarker
                                key={event.id_ex}
                                longitude={event.lng}
                                latitude={event.lat}
                                onClick={() => setPopupEvent(
                                    popupEvent?.id_ex === event.id_ex ? null : event
                                )}
                            >
                                <MarkerContent>
                                    {/* Single scale wrapper — no hover:scale, prevents WebGL drift */}
                                    <div
                                        className="relative flex items-center justify-center group"
                                        style={{
                                            transform: `scale(${scale})`,
                                            transition: "transform 0.4s ease",
                                        }}
                                    >
                                        {/* Aura ring — box-shadow animation, no transform */}
                                        {(pulse || isSelected) && (
                                            <div
                                                className="shelfy-pin-aura absolute rounded-full pointer-events-none"
                                                style={{
                                                    width: 28,
                                                    height: 28,
                                                    ["--aura-color" as any]: `${distColor}55`,
                                                }}
                                            />
                                        )}

                                        {/* Core dot */}
                                        <div
                                            className="relative rounded-full border-2 flex items-center justify-center"
                                            style={{
                                                width: 16,
                                                height: 16,
                                                backgroundColor: dotColor,
                                                borderColor: isSelected ? "white" : borderColor,
                                                opacity,
                                                boxShadow: dotShadow,
                                                transition: "box-shadow 0.3s ease, border-color 0.3s ease",
                                            }}
                                        >
                                            {showRoutes && stopNumbers[event.id_ex] && (
                                                <span
                                                    className="text-white font-black leading-none"
                                                    style={{ fontSize: 7 }}
                                                >
                                                    {stopNumbers[event.id_ex]}
                                                </span>
                                            )}
                                        </div>

                                        {/* Tooltip on hover — pointer-events-none so it doesn't steal clicks */}
                                        <div className="absolute bottom-full mb-2.5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-[100]">
                                            <div className="bg-slate-900/95 backdrop-blur-md text-white px-2.5 py-1.5 rounded-lg text-[10px] font-bold whitespace-nowrap border border-white/10 shadow-xl">
                                                {event.vendedor_nombre}
                                                <span className="text-slate-400 font-normal ml-1.5">
                                                    {formatDistanceToNow(eventDate, { addSuffix: true, locale: es })}
                                                </span>
                                            </div>
                                            <div className="w-0 h-0 mx-auto border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-slate-900/95" />
                                        </div>
                                    </div>
                                </MarkerContent>
                            </MapMarker>
                        );
                    })}

                    {/* Standalone popup — opens immediately on click (no double-click needed) */}
                    {popupEvent && (
                        <MapPopup
                            longitude={popupEvent.lng}
                            latitude={popupEvent.lat}
                            onClose={() => setPopupEvent(null)}
                            closeButton={false}
                            anchor="bottom"
                            offset={20}
                            className="p-0 border-none bg-transparent shadow-none rounded-none max-w-none"
                        >
                            <ExhibicionPopupCard
                                event={popupEvent}
                                distColor={distColorMap[popupEvent.nombre_dist] ?? "#64748b"}
                                onClose={() => setPopupEvent(null)}
                            />
                        </MapPopup>
                    )}
                </Map>

                {/* Centered photo card when highlightedEvent is passed externally */}
                {highlightedEvent && highlightedEvent.lat !== 0 && highlightedEvent.lng !== 0 && (
                    <CenteredPhotoCard event={highlightedEvent} />
                )}
            </div>
        </>
    );
});

MapaExhibiciones.displayName = "MapaExhibiciones";
export default MapaExhibiciones;

// ── Popup Card ────────────────────────────────────────────────────────────────
function ExhibicionPopupCard({
    event,
    distColor,
    onClose,
}: {
    event: LiveMapEvent;
    distColor: string;
    onClose: () => void;
}) {
    const eventDate = new Date(event.timestamp_evento);

    return (
        <div
            style={{
                width: 272,
                background: "rgba(9, 14, 25, 0.97)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 14,
                overflow: "hidden",
                boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
            }}
        >
            {/* Image */}
            <div style={{ position: "relative", height: 140, background: "#0f172a", overflow: "hidden" }}>
                {event.drive_link ? (
                    <>
                        <img
                            src={resolveImageUrl(event.drive_link) ?? undefined}
                            alt="Exhibición"
                            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                            onError={e => {
                                const el = e.target as HTMLImageElement;
                                el.style.display = "none";
                            }}
                        />
                        <a
                            href={event.drive_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                position: "absolute",
                                top: 8,
                                right: 8,
                                padding: "6px",
                                background: "rgba(0,0,0,0.55)",
                                backdropFilter: "blur(6px)",
                                borderRadius: 8,
                                color: "rgba(255,255,255,0.7)",
                                display: "flex",
                                alignItems: "center",
                                textDecoration: "none",
                            }}
                        >
                            <ExternalLink size={13} />
                        </a>
                    </>
                ) : (
                    <div style={{
                        width: "100%", height: "100%",
                        display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center",
                        gap: 8, color: "#334155",
                    }}>
                        <ImageIcon size={28} strokeWidth={1.5} />
                        <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em" }}>Sin imagen</span>
                    </div>
                )}

                {/* Dist badge */}
                <div style={{
                    position: "absolute",
                    bottom: 8,
                    left: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    background: "rgba(0,0,0,0.55)",
                    backdropFilter: "blur(8px)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 999,
                    padding: "3px 8px",
                }}>
                    <div style={{ width: 6, height: 6, borderRadius: 999, background: distColor, flexShrink: 0 }} />
                    <span style={{ fontSize: 9, fontWeight: 800, color: "white", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        {event.nombre_dist}
                    </span>
                </div>

                {/* Close button */}
                <button
                    onClick={onClose}
                    style={{
                        position: "absolute",
                        top: 8,
                        left: 8,
                        width: 26,
                        height: 26,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "rgba(0,0,0,0.55)",
                        backdropFilter: "blur(6px)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 999,
                        color: "rgba(255,255,255,0.7)",
                        cursor: "pointer",
                        padding: 0,
                    }}
                >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                </button>
            </div>

            {/* Info */}
            <div style={{ padding: "12px 14px 14px" }}>
                {/* Vendor + time */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ padding: 5, background: "rgba(139,92,246,0.12)", borderRadius: 8, display: "flex" }}>
                            <User size={12} color="#a78bfa" />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 800, color: "#f1f5f9" }}>
                            {event.vendedor_nombre}
                        </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, color: "#64748b" }}>
                        <Clock size={11} />
                        <span style={{ fontSize: 10, fontWeight: 600 }}>
                            {format(eventDate, "HH:mm", { locale: es })}
                        </span>
                    </div>
                </div>

                <div style={{ height: 1, background: "rgba(255,255,255,0.05)", marginBottom: 10 }} />

                {/* PDV */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                    <div style={{ padding: 5, background: "rgba(255,255,255,0.04)", borderRadius: 8, display: "flex", marginTop: 1 }}>
                        <Building2 size={12} color="#94a3b8" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>
                            PDV
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#f87171", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {event.cliente_nombre}
                        </div>
                        {event.nro_cliente && (
                            <div style={{ fontSize: 10, color: "#475569", fontFamily: "monospace", marginTop: 1 }}>
                                #{event.nro_cliente}
                            </div>
                        )}
                    </div>
                </div>

                {/* Location */}
                {(event.domicilio || event.localidad) && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ padding: 5, background: "rgba(255,255,255,0.04)", borderRadius: 8, display: "flex", marginTop: 1 }}>
                            <MapPin size={12} color="#94a3b8" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            {event.domicilio && (
                                <div style={{ fontSize: 11, color: "#cbd5e1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {event.domicilio}
                                </div>
                            )}
                            {event.localidad && (
                                <div style={{ fontSize: 10, color: "#64748b", marginTop: 1 }}>
                                    {event.localidad}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Centered Photo Card (for external highlightedEvent use) ───────────────────
function CenteredPhotoCard({ event }: { event: LiveMapEvent }) {
    const ts = event.timestamp_evento || (event as any).timestamp;
    return (
        <div
            style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translateX(-50%) translateY(calc(-100% - 16px))",
                zIndex: 9999,
                width: 210,
                pointerEvents: "none",
            }}
        >
            <style>{`
                @keyframes photoCardIn {
                    0%  { opacity: 0; transform: translateY(10px) scale(0.94); }
                    100%{ opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>
            <div style={{
                background: "rgba(6,13,26,0.94)",
                backdropFilter: "blur(18px)",
                WebkitBackdropFilter: "blur(18px)",
                border: "1.5px solid rgba(124,58,237,0.6)",
                borderRadius: 14,
                overflow: "hidden",
                boxShadow: "0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(124,58,237,0.12)",
                animation: "photoCardIn 0.5s cubic-bezier(0.16,1,0.3,1) both",
            }}>
                <div style={{ height: 128, background: "#0f172a", position: "relative", overflow: "hidden" }}>
                    {event.drive_link ? (
                        <img
                            src={resolveImageUrl(event.drive_link) ?? undefined}
                            alt="Exhibición"
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                    ) : (
                        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#334155" }}>
                            <ImageIcon size={28} strokeWidth={1.5} />
                        </div>
                    )}
                    {ts && (
                        <div style={{
                            position: "absolute", top: 8, left: 8,
                            display: "flex", alignItems: "center", gap: 5,
                            background: "rgba(6,13,26,0.75)", backdropFilter: "blur(8px)",
                            border: "1px solid rgba(16,185,129,0.35)", borderRadius: 999,
                            padding: "3px 8px",
                        }}>
                            <span style={{ width: 6, height: 6, borderRadius: 999, background: "#10b981", flexShrink: 0 }} />
                            <span style={{ fontSize: 9, fontWeight: 900, color: "#10b981", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                                {format(new Date(ts), "HH:mm", { locale: es })} · {formatDistanceToNow(new Date(ts), { addSuffix: true, locale: es })}
                            </span>
                        </div>
                    )}
                </div>
                <div style={{ padding: "10px 12px 12px" }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 2 }}>PDV</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#f1f5f9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {event.cliente_nombre || event.nro_cliente || "—"}
                    </div>
                    <div style={{ fontSize: 9, fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.12em", marginTop: 6, marginBottom: 2 }}>Vendedor</div>
                    <div style={{ fontSize: 11, color: "#a78bfa", fontWeight: 700 }}>{event.vendedor_nombre}</div>
                    {(event.domicilio || event.localidad) && (
                        <div style={{ fontSize: 10, color: "#64748b", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {[event.domicilio, event.localidad].filter(Boolean).join(", ")}
                        </div>
                    )}
                </div>
            </div>
            <div style={{
                width: 0, height: 0,
                borderLeft: "10px solid transparent",
                borderRight: "10px solid transparent",
                borderTop: "11px solid rgba(124,58,237,0.6)",
                margin: "0 auto",
            }} />
        </div>
    );
}
