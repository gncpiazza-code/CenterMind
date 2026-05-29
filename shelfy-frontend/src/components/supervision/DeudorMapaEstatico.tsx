"use client";

import { useEffect, useRef } from "react";
import { MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
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
        zoom: 14,
        attributionControl: false,
        // panning y zoom habilitados; solo desactivamos doble-click zoom para comportamiento más controlado
        doubleClickZoom: false,
      });

      mapInstanceRef.current = map;

      map.on("load", () => {
        if (cancelled) return;
        // Marker rojo estándar
        new MapLibreGL.Marker({ color: "#e11d48" })
          .setLngLat([longitud!, latitud!])
          .addTo(map);
      });
    });

    return () => {
      cancelled = true;
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitud, longitud]);

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-0">
        {hasCoords ? (
          <div className="relative">
            <div ref={mapRef} className="w-full h-44" />
            {domicilio && (
              <div className="absolute bottom-0 left-0 right-0 bg-background/88 backdrop-blur-sm px-3 py-1.5 border-t border-border/40">
                <div className="flex items-center gap-1.5">
                  <MapPin size={11} className="text-rose-500 shrink-0" />
                  <p className="text-[11px] text-foreground truncate font-medium">{domicilio}</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2.5 p-3 min-h-[3rem]">
            <div className="size-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <MapPin size={14} className="text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {domicilio || "Sin coordenadas disponibles"}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
