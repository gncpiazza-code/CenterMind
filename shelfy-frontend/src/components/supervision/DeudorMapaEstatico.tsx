"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  hasGoogleMapsApiKey,
  loadGoogleMapsLibrary,
} from "@/lib/googleMapsLoader";

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
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  const hasCoords = latitud != null && longitud != null;
  const lat = Number(latitud);
  const lng = Number(longitud);

  useEffect(() => {
    if (!hasCoords || !containerRef.current) return;
    if (!hasGoogleMapsApiKey()) {
      setMapError("Sin API key de Google Maps");
      return;
    }

    let cancelled = false;
    setMapError(null);

    loadGoogleMapsLibrary("maps")
      .then(() => {
        if (cancelled || !containerRef.current) return;

        const center = { lat, lng };

        if (!mapRef.current) {
          mapRef.current = new google.maps.Map(containerRef.current, {
            center,
            zoom: 15,
            disableDefaultUI: true,
            zoomControl: true,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            gestureHandling: "cooperative",
            clickableIcons: false,
          });
        } else {
          mapRef.current.setCenter(center);
          mapRef.current.setZoom(15);
        }

        markerRef.current?.setMap(null);
        markerRef.current = new google.maps.Marker({
          position: center,
          map: mapRef.current,
        });

        // Asegura render correcto dentro del panel con scroll
        google.maps.event.trigger(mapRef.current, "resize");
        mapRef.current.setCenter(center);
      })
      .catch(() => {
        if (!cancelled) setMapError("No se pudo cargar Google Maps");
      });

    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      if (mapRef.current) {
        google.maps.event.trigger(mapRef.current, "resize");
        mapRef.current.setCenter({ lat, lng });
      }
    });
    ro.observe(el);

    return () => {
      cancelled = true;
      ro.disconnect();
      markerRef.current?.setMap(null);
      markerRef.current = null;
    };
  }, [hasCoords, lat, lng]);

  if (!hasCoords) {
    return (
      <div
        className={cn(
          "rounded-lg border bg-muted/20 flex items-center gap-2.5 px-3 py-2.5 min-h-[2.75rem]",
          className,
        )}
      >
        <MapPin size={13} className="text-muted-foreground shrink-0" />
        <p className="text-[11px] text-muted-foreground truncate">
          {domicilio || "Sin coordenadas disponibles"}
        </p>
      </div>
    );
  }

  if (mapError) {
    return (
      <div
        className={cn(
          "rounded-lg border bg-muted/20 px-3 py-2.5 text-[11px] text-muted-foreground",
          className,
        )}
      >
        {domicilio ? (
          <div className="flex items-center gap-1.5">
            <MapPin size={11} className="text-rose-500 shrink-0" />
            <span className="truncate">{domicilio}</span>
          </div>
        ) : (
          mapError
        )}
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border overflow-hidden bg-muted/20", className)}>
      <div ref={containerRef} className="w-full h-28" />
      {domicilio && (
        <div className="px-2.5 py-1.5 border-t border-border/40 bg-background/90">
          <div className="flex items-center gap-1.5">
            <MapPin size={11} className="text-rose-500 shrink-0" />
            <p className="text-[11px] text-foreground truncate font-medium">{domicilio}</p>
          </div>
        </div>
      )}
    </div>
  );
}
