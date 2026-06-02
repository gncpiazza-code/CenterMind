"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import {
  Map,
  MapMarker,
  MarkerContent,
  MapClusterLayer,
  MapControls,
  useMap,
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
  onPinsChange?: (pins: GaleriaMapaPin[]) => void;
}

const DEFAULT_CENTER: [number, number] = [-63.6167, -38.4161];
const DEFAULT_ZOOM = 5;
function GaleriaClusterLayer({
  data,
  onPinSelect,
  pins,
  setSelectedPinId,
}: {
  data: GeoJSON.FeatureCollection<GeoJSON.Point>;
  pins: GaleriaMapaPin[];
  onPinSelect: (pin: GaleriaMapaPin) => void;
  setSelectedPinId: (id: number) => void;
}) {
  const { map } = useMap();

  const handleClusterClick = useCallback(
    (_clusterId: number, coordinates: [number, number], _pointCount: number) => {
      if (!map) return;
      const nextZoom = Math.min(Math.max(map.getZoom() + 2, 12), 16);
      map.easeTo({
        center: coordinates,
        zoom: nextZoom,
        duration: 500,
      });
    },
    [map]
  );

  return (
    <MapClusterLayer
      data={data}
      clusterMaxZoom={11}
      clusterRadius={56}
      clusterColors={["#3b82f6", "#2563eb", "#1d4ed8"]}
      clusterThresholds={[8, 24]}
      pointColor="#2563eb"
      onClusterClick={handleClusterClick}
      onPointClick={(feature) => {
        const idCliente = Number(feature.properties?.id_cliente);
        const pin = pins.find((p) => p.id_cliente === idCliente);
        if (pin) {
          setSelectedPinId(pin.id_cliente);
          onPinSelect(pin);
        }
      }}
    />
  );
}

export function GaleriaMapView({
  vendedorId,
  distId,
  desde,
  hasta,
  estado,
  onPinSelect,
  sinCoordsCount,
  onOpenSinCoords,
  onPinsChange,
}: GaleriaMapViewProps) {
  const mapRef = useRef<MapRef | null>(null);
  const [selectedPinId, setSelectedPinId] = useState<number | null>(null);
  const [currentZoom, setCurrentZoom] = useState(DEFAULT_ZOOM);
  const fitBoundsDoneRef = useRef(false);

  const { pins, sinCoordsCount: querySinCoordsCount, isLoading, onViewportChange } =
    useGaleriaMapaQuery({
      vendedorId,
      distId,
      desde,
      hasta,
      estado,
    });

  const pinsSigRef = useRef("");
  useEffect(() => {
    const sig = pins.map((p) => p.id_cliente).join(",");
    if (sig === pinsSigRef.current) return;
    pinsSigRef.current = sig;
    onPinsChange?.(pins);
  }, [pins, onPinsChange]);

  const { showNativeCluster, visiblePins } = useGaleriaMapClustering({
    pins,
    zoom: currentZoom,
  });

  useEffect(() => {
    setSelectedPinId(null);
    fitBoundsDoneRef.current = false;
  }, [vendedorId, desde, hasta, estado]);

  useEffect(() => {
    if (fitBoundsDoneRef.current) return;
    if (!mapRef.current || pins.length === 0) return;

    const lats = pins.map((p) => p.latitud);
    const lngs = pins.map((p) => p.longitud);
    mapRef.current.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 80, maxZoom: 13, duration: 800 }
    );
    fitBoundsDoneRef.current = true;
  }, [pins]);

  const handleMove = useCallback(
    (vp: MapViewport) => {
      setCurrentZoom(vp.zoom);
      onViewportChange(vp);
    },
    [onViewportChange]
  );

  const handleLoad = useCallback(
    (event: { target: MapRef }) => {
      mapRef.current = event.target;
      const center = event.target.getCenter();
      onViewportChange({
        center: [center.lng, center.lat],
        zoom: event.target.getZoom(),
        bearing: event.target.getBearing(),
        pitch: event.target.getPitch(),
      });
      setCurrentZoom(event.target.getZoom());
    },
    [onViewportChange]
  );

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
  const emptyPins = !isLoading && pins.length === 0 && Boolean(desde && hasta);

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
        {showNativeCluster && pins.length > 0 && (
          <GaleriaClusterLayer
            data={geojsonData}
            pins={pins}
            onPinSelect={onPinSelect}
            setSelectedPinId={setSelectedPinId}
          />
        )}

        {!showNativeCluster &&
          visiblePins.map((pin) => (
            <MapMarker
              key={`${vendedorId}-${pin.id_cliente}`}
              longitude={pin.longitud}
              latitude={pin.latitud}
              anchor="bottom"
            >
              <MarkerContent className="!cursor-pointer">
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

      {isLoading && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1 shadow text-xs text-slate-600">
          Cargando puntos...
        </div>
      )}

      {emptyPins && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-white/95 backdrop-blur-sm rounded-lg px-4 py-2 shadow text-xs text-slate-600 text-center max-w-xs">
          Sin PDVs con coordenadas en este mes para este vendedor
        </div>
      )}

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
