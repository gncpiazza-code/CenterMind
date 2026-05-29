"use client";

import { useEffect, useRef } from "react";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface DeudorMapaEstaticoProps {
  latitud: number | null | undefined;
  longitud: number | null | undefined;
  domicilio?: string | null;
  className?: string;
}

export function DeudorMapaEstatico({
  latitud,
  longitud,
  domicilio,
  className,
}: DeudorMapaEstaticoProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<import("maplibre-gl").Map | null>(null);
  const hasCoords = latitud != null && longitud != null;

  useEffect(() => {
    if (!hasCoords || !mapRef.current) return;

    let cancelled = false;

    import("maplibre-gl").then((mod) => {
      if (cancelled || !mapRef.current) return;
      const MapLibreGL = mod.default;

      const map = new MapLibreGL.Map({
        container: mapRef.current,
        style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
        center: [longitud!, latitud!],
        zoom: 15,
        attributionControl: false,
        interactive: false,
        doubleClickZoom: false,
        scrollZoom: false,
        boxZoom: false,
        dragRotate: false,
        dragPan: false,
        keyboard: false,
        touchZoomRotate: false,
      });

      mapInstanceRef.current = map;

      map.on("load", () => {
        if (cancelled) return;
        new MapLibreGL.Marker({ color: "#e11d48" })
          .setLngLat([longitud!, latitud!])
          .addTo(map);
        map.resize();
      });
    });

    const el = mapRef.current;
    const ro = new ResizeObserver(() => {
      mapInstanceRef.current?.resize();
    });
    ro.observe(el);

    return () => {
      cancelled = true;
      ro.disconnect();
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitud, longitud]);

  return (
    <div className={cn("rounded-lg border overflow-hidden bg-muted/20", className)}>
      {hasCoords ? (
        <div className="relative">
          <div ref={mapRef} className="w-full h-28" />
          {domicilio && (
            <div className="px-2.5 py-1.5 border-t border-border/40 bg-background/90">
              <div className="flex items-center gap-1.5">
                <MapPin size={11} className="text-rose-500 shrink-0" />
                <p className="text-[11px] text-foreground truncate font-medium">{domicilio}</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2.5 px-3 py-2.5 min-h-[2.75rem]">
          <MapPin size={13} className="text-muted-foreground shrink-0" />
          <p className="text-[11px] text-muted-foreground truncate">
            {domicilio || "Sin coordenadas disponibles"}
          </p>
        </div>
      )}
    </div>
  );
}
