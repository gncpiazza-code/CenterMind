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
  const hasCoords = latitud != null && longitud != null;

  useEffect(() => {
    if (!hasCoords || !mapRef.current) return;

    let map: import("maplibre-gl").Map | null = null;

    import("maplibre-gl").then(({ default: MapLibreGL }) => {
      if (!mapRef.current) return;

      map = new MapLibreGL.Map({
        container: mapRef.current,
        style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
        center: [longitud!, latitud!],
        zoom: 14,
        interactive: false,
        attributionControl: false,
      });

      map.on("load", () => {
        if (!map) return;
        const el = document.createElement("div");
        el.className = "deudor-map-pin";
        el.style.cssText =
          "width:20px;height:20px;border-radius:50%;background:#e11d48;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35)";
        new MapLibreGL.Marker({ element: el })
          .setLngLat([longitud!, latitud!])
          .addTo(map);
      });
    });

    return () => {
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitud, longitud]);

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-0">
        {hasCoords ? (
          <div className="relative">
            <div ref={mapRef} className="w-full h-36" />
            {domicilio && (
              <div className="absolute bottom-0 left-0 right-0 bg-background/85 backdrop-blur-sm px-3 py-1.5 border-t">
                <p className="text-[11px] text-muted-foreground truncate">{domicilio}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2.5 p-3">
            <div className="size-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <MapPin size={14} className="text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {domicilio || "Sin dirección disponible"}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
