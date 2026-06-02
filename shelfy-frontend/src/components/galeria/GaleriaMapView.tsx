"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import {
  Map,
  MapMarker,
  MarkerContent,
  MapClusterLayer,
  MapControls,
  type MapViewport,
  type MapRef,
} from "@/components/ui/map";
import { useGaleriaMapaQuery } from "@/hooks/useGaleriaMapaQuery";
import { useGaleriaMapClustering } from "@/hooks/useGaleriaMapClustering";
import { GaleriaMapPhotoPin } from "./GaleriaMapPhotoPin";
import type { GaleriaMapaPin } from "@/lib/api";

interface GaleriaMapViewProps {
  vendedorId: number;
  distId: number;
  desde?: string;
  hasta?: string;
  estado?: string;
  onPinSelect: (pin: GaleriaMapaPin) => void;
  sinCoordsCount?: number;
  onOpenSinCoords?: () => void;
}

// Default center: Argentina
const DEFAULT_CENTER: [number, number] = [-63.6167, -38.4161];
const DEFAULT_ZOOM = 5;

export function GaleriaMapView({
  vendedorId,
  distId,
  desde,
  hasta,
  estado,
  onPinSelect,
  sinCoordsCount,
  onOpenSinCoords,
}: GaleriaMapViewProps) {
  const mapRef = useRef<MapRef | null>(null);
  const [selectedPinId, setSelectedPinId] = useState<number | null>(null);
  const [currentZoom, setCurrentZoom] = useState(DEFAULT_ZOOM);
  const fitBoundsDoneRef = useRef(false);

  const { pins, sinCoordsCount: querySinCoordsCount, isLoading, onViewportChange, viewport } =
    useGaleriaMapaQuery({
      vendedorId,
      distId,
      desde,
      hasta,
      estado,
    });

  const { showNativeCluster, visiblePins } = useGaleriaMapClustering({
    pins,
    viewport,
    zoom: currentZoom,
  });

  // FitBounds cuando llegan los primeros pins
  useEffect(() => {
    if (fitBoundsDoneRef.current) return;
    if (!mapRef.current || pins.length === 0) return;

    const lats = pins.map((p) => p.latitud);
    const lngs = pins.map((p) => p.longitud);
    const latMin = Math.min(...lats);
    const latMax = Math.max(...lats);
    const lngMin = Math.min(...lngs);
    const lngMax = Math.max(...lngs);

    mapRef.current.fitBounds(
      [
        [lngMin, latMin],
        [lngMax, latMax],
      ],
      { padding: 60, maxZoom: 14, duration: 800 }
    );

    fitBoundsDoneRef.current = true;
  }, [pins]);

  // Reset fitBounds flag when vendedorId changes
  useEffect(() => {
    fitBoundsDoneRef.current = false;
  }, [vendedorId]);

  const handleMove = useCallback(
    (vp: MapViewport) => {
      setCurrentZoom(vp.zoom);
      onViewportChange(vp);
    },
    [onViewportChange]
  );

  const handleLoad = useCallback((event: { target: MapRef }) => {
    mapRef.current = event.target;
  }, []);

  // GeoJSON para MapClusterLayer
  const geojsonData: GeoJSON.FeatureCollection<GeoJSON.Point> = {
    type: "FeatureCollection",
    features: pins.map((pin) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [pin.longitud, pin.latitud] },
      properties: {
        id_cliente: pin.id_cliente,
        nombre_cliente: pin.nombre_cliente,
        total_exhibiciones: pin.total_exhibiciones,
      },
    })),
  };

  const resolvedSinCoordsCount = sinCoordsCount ?? querySinCoordsCount;

  return (
    <div className="relative h-full w-full">
      <Map
        ref={mapRef}
        theme="light"
        className="h-full w-full"
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        onViewportChange={handleMove}
        onLoad={handleLoad}
      >
        {/* Native cluster layer (zoom < 12) */}
        {showNativeCluster && pins.length > 0 && (
          <MapClusterLayer
            data={geojsonData}
            clusterMaxZoom={11}
            clusterRadius={50}
          />
        )}

        {/* Individual markers (zoom >= 12) */}
        {!showNativeCluster &&
          visiblePins.map((pin) => (
            <MapMarker
              key={pin.id_cliente}
              longitude={pin.longitud}
              latitude={pin.latitud}
            >
              <MarkerContent>
                <GaleriaMapPhotoPin
                  pin={pin}
                  selected={selectedPinId === pin.id_cliente}
                  onClick={() => {
                    setSelectedPinId(pin.id_cliente);
                    onPinSelect(pin);
                  }}
                />
              </MarkerContent>
            </MapMarker>
          ))}

        <MapControls position="bottom-right" showZoom showCompass />
      </Map>

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1 shadow text-xs text-slate-600">
          Cargando puntos...
        </div>
      )}

      {/* Sin coords badge */}
      {resolvedSinCoordsCount > 0 && onOpenSinCoords && (
        <button
          type="button"
          onClick={onOpenSinCoords}
          className="absolute bottom-14 left-3 z-10 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-md transition-colors duration-150"
        >
          {resolvedSinCoordsCount} sin coordenadas
        </button>
      )}
    </div>
  );
}
