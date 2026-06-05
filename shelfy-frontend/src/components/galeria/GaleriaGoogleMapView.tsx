"use client";

import { useRef, useState, useCallback, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useQueryClient } from "@tanstack/react-query";
import { useGaleriaMapaQuery } from "@/hooks/useGaleriaMapaQuery";
import { useGaleriaMapPrefetch, prefetchGaleriaOnPinHover } from "@/hooks/useGaleriaPrefetch";
import { GaleriaMapPhotoPin } from "./GaleriaMapPhotoPin";
import { GaleriaMapClusterPin } from "./GaleriaMapClusterPin";
import type { GaleriaMapaPin } from "@/lib/api";
import { loadGoogleMapsLibrary, notifyGoogleMapsAuthFailure, subscribeGoogleMapsAuthFailure } from "@/lib/googleMapsLoader";
import {
  clusterGaleriaPins,
  ZOOM_CLUSTER_CLICK_STEP,
  ZOOM_MAX_CLUSTER_VIEW,
  ZOOM_SHOW_PINS,
} from "@/lib/galeria-map-cluster";
import { createGoogleMapsHtmlOverlay } from "@/lib/galeria-google-overlay";
import { cn } from "@/lib/utils";

interface GaleriaGoogleMapViewProps {
  vendedorId: number;
  distId: number;
  desde?: string;
  hasta?: string;
  estado?: string;
  onPinSelect: (pin: GaleriaMapaPin) => void;
  sinCoordsCount?: number;
  onOpenSinCoords?: () => void;
  onPinsChange?: (pins: GaleriaMapaPin[]) => void;
  /** Con el visor abierto: desactiva flechas de pan en Google Maps */
  disableMapKeyboard?: boolean;
  className?: string;
  /** Si Google rechaza el dominio (referrer), el wrapper puede caer a MapLibre */
  onAuthFailure?: () => void;
}

const DEFAULT_CENTER = { lat: -38.4161, lng: -63.6167 };
const DEFAULT_ZOOM = 5;

type MountedOverlay = {
  overlay: google.maps.OverlayView;
  root: Root;
  key: string;
  kind: "cluster" | "pin";
  pinId?: number;
};

function overlayLayoutKey(pins: GaleriaMapaPin[], zoom: number): string {
  const z = Math.floor(zoom);
  const { clusters, singles } = clusterGaleriaPins(pins, z);
  const clusterPart = clusters
    .map((c) => {
      const ids = c.pins
        .map((p) => p.id_cliente)
        .sort((a, b) => a - b)
        .join(",");
      return `${c.count}:${ids}`;
    })
    .sort()
    .join("|");
  const singlePart = singles
    .map((p) => p.id_cliente)
    .sort((a, b) => a - b)
    .join(",");
  return `z${z}|c[${clusterPart}]|s[${singlePart}]`;
}

function pinScaleForZoom(zoom: number): number {
  if (zoom >= 15) return 1;
  if (zoom >= 13) return 0.94;
  if (zoom >= 10) return 0.88;
  return 0.82;
}

/** Quita overlays del mapa al instante; unmount React en microtask (evita warning sync). */
function detachOverlays(batch: MountedOverlay[]) {
  for (const m of batch) {
    m.overlay.setMap(null);
  }
  if (batch.length === 0) return;
  queueMicrotask(() => {
    for (const m of batch) {
      try {
        m.root.unmount();
      } catch {
        /* root ya desmontado */
      }
    }
  });
}

export function GaleriaGoogleMapView({
  vendedorId,
  distId,
  desde,
  hasta,
  estado,
  onPinSelect,
  sinCoordsCount,
  onOpenSinCoords,
  onPinsChange,
  disableMapKeyboard = false,
  className,
  onAuthFailure,
}: GaleriaGoogleMapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const fitBoundsDoneRef = useRef(false);
  const mountedOverlaysRef = useRef<MountedOverlay[]>([]);
  const layoutKeyRef = useRef("");
  const zoomFloorRef = useRef(-1);
  const pinScaleZoomRef = useRef(-1);
  const rebuildScheduledRef = useRef<number | null>(null);
  const qc = useQueryClient();

  const [selectedPinId, setSelectedPinId] = useState<number | null>(null);
  const [currentZoom, setCurrentZoom] = useState(DEFAULT_ZOOM);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

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

  useGaleriaMapPrefetch(pins, {
    distId,
    vendedorId,
    desde,
    hasta,
    enabled: pins.length > 0,
  });

  const applyPinScaleCss = useCallback((zoom: number) => {
    const z = Math.floor(zoom);
    if (z === pinScaleZoomRef.current) return;
    pinScaleZoomRef.current = z;
    mapContainerRef.current?.style.setProperty(
      "--galeria-map-pin-scale",
      String(pinScaleForZoom(zoom)),
    );
  }, []);

  const disposeAllOverlays = useCallback(() => {
    const batch = mountedOverlaysRef.current;
    mountedOverlaysRef.current = [];
    layoutKeyRef.current = "";
    if (batch.length > 0) detachOverlays(batch);
  }, []);

  const zoomToCluster = useCallback((clusterPins: GaleriaMapaPin[]) => {
    const map = mapRef.current;
    if (!map || clusterPins.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    clusterPins.forEach((p) => bounds.extend({ lat: p.latitud, lng: p.longitud }));
    map.fitBounds(bounds, 72);
    google.maps.event.addListenerOnce(map, "idle", () => {
      const z = map.getZoom();
      if (z == null) return;
      const next = Math.min(z + ZOOM_CLUSTER_CLICK_STEP, ZOOM_SHOW_PINS - 1);
      if (next > z) map.setZoom(next);
    });
  }, []);

  const renderPinNode = useCallback(
    (pin: GaleriaMapaPin) => (
      <div
        onMouseEnter={() =>
          prefetchGaleriaOnPinHover(qc, pin, { distId, vendedorId, desde, hasta })
        }
      >
        <GaleriaMapPhotoPin
          pin={pin}
          selected={selectedPinId === pin.id_cliente}
          onClick={() => {
            setSelectedPinId(pin.id_cliente);
            onPinSelect(pin);
          }}
        />
      </div>
    ),
    [qc, distId, vendedorId, desde, hasta, selectedPinId, onPinSelect],
  );

  const refreshPinSelection = useCallback(() => {
    for (const entry of mountedOverlaysRef.current) {
      if (entry.kind !== "pin" || entry.pinId == null) continue;
      const pin = pins.find((p) => p.id_cliente === entry.pinId);
      if (!pin) continue;
      entry.root.render(renderPinNode(pin));
    }
  }, [pins, renderPinNode]);

  const rebuildOverlays = useCallback(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const zoom = map.getZoom() ?? currentZoom;
    const z = Math.floor(zoom);
    applyPinScaleCss(zoom);

    const layoutKey = overlayLayoutKey(pins, z);
    if (layoutKey === layoutKeyRef.current) return;

    const prev = mountedOverlaysRef.current;
    mountedOverlaysRef.current = [];
    layoutKeyRef.current = layoutKey;
    if (prev.length > 0) detachOverlays(prev);

    const { clusters, singles } = clusterGaleriaPins(pins, z);
    const showPhotoPins = z >= ZOOM_SHOW_PINS;

    const mount = (
      lat: number,
      lng: number,
      node: ReactNode,
      meta: { key: string; kind: "cluster" | "pin"; pinId?: number },
    ) => {
      const el = document.createElement("div");
      const root = createRoot(el);
      root.render(node);
      const overlay = createGoogleMapsHtmlOverlay({ lat, lng }, el, { x: 0.5, y: 1 });
      overlay.setMap(map);
      mountedOverlaysRef.current.push({
        overlay,
        root,
        key: meta.key,
        kind: meta.kind,
        pinId: meta.pinId,
      });
    };

    if (showPhotoPins) {
      for (const pin of singles) {
        mount(pin.latitud, pin.longitud, renderPinNode(pin), {
          key: `pin:${pin.id_cliente}`,
          kind: "pin",
          pinId: pin.id_cliente,
        });
      }
      return;
    }

    for (const cluster of clusters) {
      const openCluster = () => zoomToCluster(cluster.pins);
      mount(
        cluster.lat,
        cluster.lng,
        <GaleriaMapClusterPin
          variant="full"
          count={cluster.count}
          onClick={openCluster}
          onDoubleClick={openCluster}
        />,
        { key: `cluster:${cluster.id}:${cluster.count}`, kind: "cluster" },
      );
    }
  }, [mapReady, pins, currentZoom, applyPinScaleCss, renderPinNode, zoomToCluster]);

  const scheduleRebuildOverlays = useCallback(() => {
    if (rebuildScheduledRef.current != null) {
      cancelAnimationFrame(rebuildScheduledRef.current);
    }
    rebuildScheduledRef.current = requestAnimationFrame(() => {
      rebuildScheduledRef.current = null;
      rebuildOverlays();
    });
  }, [rebuildOverlays]);

  const reportViewport = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    const z = map.getZoom() ?? DEFAULT_ZOOM;
    if (!c) return;
    setCurrentZoom((prev) => (prev === z ? prev : z));
    applyPinScaleCss(z);
    onViewportChange({
      center: [c.lng(), c.lat()],
      zoom: z,
      bearing: 0,
      pitch: 0,
    });
    // No remontar overlays al panear: Google redibuja posiciones en draw().
  }, [onViewportChange, applyPinScaleCss]);

  const onZoomFloorChange = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const z = Math.floor(map.getZoom() ?? DEFAULT_ZOOM);
    if (z === zoomFloorRef.current) return;
    zoomFloorRef.current = z;
    applyPinScaleCss(map.getZoom() ?? z);
    scheduleRebuildOverlays();
  }, [scheduleRebuildOverlays, applyPinScaleCss]);

  const reportViewportRef = useRef(reportViewport);
  reportViewportRef.current = reportViewport;
  const onZoomFloorChangeRef = useRef(onZoomFloorChange);
  onZoomFloorChangeRef.current = onZoomFloorChange;

  useEffect(() => {
    setSelectedPinId(null);
    fitBoundsDoneRef.current = false;
    zoomFloorRef.current = -1;
    disposeAllOverlays();
  }, [vendedorId, desde, hasta, estado, disposeAllOverlays]);

  useEffect(() => {
    fitBoundsDoneRef.current = false;
  }, [vendedorId, desde, hasta]);

  useEffect(() => {
    return subscribeGoogleMapsAuthFailure(() => {
      onAuthFailure?.();
    });
  }, [onAuthFailure]);

  useEffect(() => {
    if (!mapReady || !mapContainerRef.current) return;
    const el = mapContainerRef.current;
    const check = () => {
      if (el.querySelector(".gm-err-container")) {
        notifyGoogleMapsAuthFailure();
        onAuthFailure?.();
      }
    };
    const t1 = window.setTimeout(check, 800);
    const t2 = window.setTimeout(check, 2500);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [mapReady, onAuthFailure]);

  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;

    let cancelled = false;
    setMapError(null);

    loadGoogleMapsLibrary("maps")
      .then(() => {
        if (cancelled || !mapContainerRef.current) return;

        if (!mapRef.current) {
          mapRef.current = new google.maps.Map(mapContainerRef.current, {
            center: DEFAULT_CENTER,
            zoom: DEFAULT_ZOOM,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            zoomControl: true,
            gestureHandling: "greedy",
            clickableIcons: false,
            keyboardShortcuts: !disableMapKeyboard,
          });
          mapRef.current.addListener("idle", () => reportViewportRef.current());
          mapRef.current.addListener("zoom_changed", () => onZoomFloorChangeRef.current());
        }

        google.maps.event.trigger(mapRef.current, "resize");
        zoomFloorRef.current = Math.floor(mapRef.current.getZoom() ?? DEFAULT_ZOOM);
        reportViewportRef.current();
        setMapReady(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "";
        if (msg === "NO_GOOGLE_MAPS_KEY") {
          setMapError(
            "Falta NEXT_PUBLIC_GOOGLE_MAPS_API_KEY en shelfy-frontend/.env.local (reiniciá npm run dev).",
          );
        } else {
          notifyGoogleMapsAuthFailure();
          onAuthFailure?.();
        }
      });

    return () => {
      cancelled = true;
      disposeAllOverlays();
    };
  }, [disposeAllOverlays]);

  useEffect(() => {
    mapRef.current?.setOptions({ keyboardShortcuts: !disableMapKeyboard });
  }, [disableMapKeyboard, mapReady]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || pins.length === 0 || fitBoundsDoneRef.current) return;
    const map = mapRef.current;
    const applyView = () => {
      const z = map.getZoom();
      if (z != null && z > ZOOM_MAX_CLUSTER_VIEW) {
        map.setZoom(ZOOM_MAX_CLUSTER_VIEW);
      }
      scheduleRebuildOverlays();
      fitBoundsDoneRef.current = true;
    };

    if (pins.length === 1) {
      const p = pins[0];
      map.setCenter({ lat: p.latitud, lng: p.longitud });
      map.setZoom(ZOOM_MAX_CLUSTER_VIEW);
      google.maps.event.addListenerOnce(map, "idle", applyView);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    pins.forEach((p) => bounds.extend({ lat: p.latitud, lng: p.longitud }));
    map.fitBounds(bounds, 96);
    google.maps.event.addListenerOnce(map, "idle", applyView);
  }, [pins, mapReady, vendedorId, scheduleRebuildOverlays]);

  useEffect(() => {
    if (!mapReady) return;
    scheduleRebuildOverlays();
  }, [mapReady, pins, scheduleRebuildOverlays]);

  useEffect(() => {
    if (!mapReady) return;
    refreshPinSelection();
  }, [selectedPinId, refreshPinSelection, mapReady]);

  useEffect(() => {
    return () => {
      if (rebuildScheduledRef.current != null) {
        cancelAnimationFrame(rebuildScheduledRef.current);
      }
    };
  }, []);

  const resolvedSinCoordsCount = sinCoordsCount ?? querySinCoordsCount;
  const emptyPins = !isLoading && pins.length === 0 && Boolean(desde && hasta);
  if (mapError) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center bg-muted/30 text-sm text-muted-foreground px-6 text-center",
          className,
        )}
      >
        {mapError}
      </div>
    );
  }

  return (
    <div
      className={cn("relative h-full w-full", className)}
      style={{ ["--galeria-map-pin-scale" as string]: "1" }}
    >
      <div ref={mapContainerRef} className="absolute inset-0" />

      {isLoading && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1 shadow text-xs text-slate-600">
          Cargando puntos...
        </div>
      )}

      {emptyPins && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-white/95 backdrop-blur-sm rounded-lg px-4 py-2 shadow text-xs text-slate-600 text-center max-w-xs">
          {resolvedSinCoordsCount > 0
            ? `${resolvedSinCoordsCount} PDV(s) con exhibición sin coordenadas en el mapa`
            : "Sin PDVs con coordenadas en este mes para este vendedor"}
        </div>
      )}

      {resolvedSinCoordsCount > 0 && onOpenSinCoords && (
        <button
          type="button"
          onClick={onOpenSinCoords}
          className="absolute bottom-14 left-3 z-10 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-md"
        >
          {resolvedSinCoordsCount} sin coordenadas
        </button>
      )}
    </div>
  );
}
