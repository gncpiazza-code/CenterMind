"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { DrawnPolygon } from "@/store/useSupervisionStore";

const ROUTE_POLYGON_STYLE: google.maps.PolygonOptions = {
  fillColor: "#8b5cf6",
  fillOpacity: 0.18,
  strokeColor: "#8b5cf6",
  strokeWeight: 2,
  editable: false,
  clickable: false,
};

export interface VertexDrawOptions {
  enabled: boolean;
  mapRef: RefObject<google.maps.Map | null>;
  mapLoaded: boolean;
  strokeColor?: string;
  onPolygonClosed: (pdvIds: number[], geoJson: DrawnPolygon["geoJson"]) => void;
  resolvePdvIdsInPolygon: (polygon: google.maps.Polygon) => number[];
  onCancel?: () => void;
}

/** Dibujo click-vértices sin setState en mousemove (evita re-render del árbol React). */
export function useVertexPolygonDraw({
  enabled,
  mapRef,
  mapLoaded,
  strokeColor = "#8b5cf6",
  onPolygonClosed,
  resolvePdvIdsInPolygon,
  onCancel,
}: VertexDrawOptions) {
  const pathRef = useRef<google.maps.LatLng[]>([]);
  const previewLineRef = useRef<google.maps.Polyline | null>(null);
  const previewPolyRef = useRef<google.maps.Polygon | null>(null);
  const finishedRef = useRef<google.maps.Polygon[]>([]);
  const vertexMarkersRef = useRef<google.maps.Marker[]>([]);
  const listenersAttachedRef = useRef(false);
  const moveRafRef = useRef(0);

  const enabledRef = useRef(enabled);
  const strokeColorRef = useRef(strokeColor);
  const onPolygonClosedRef = useRef(onPolygonClosed);
  const resolveRef = useRef(resolvePdvIdsInPolygon);
  const onCancelRef = useRef(onCancel);

  enabledRef.current = enabled;
  strokeColorRef.current = strokeColor;
  onPolygonClosedRef.current = onPolygonClosed;
  resolveRef.current = resolvePdvIdsInPolygon;
  onCancelRef.current = onCancel;

  const clearPreviewGraphics = () => {
    previewLineRef.current?.setMap(null);
    previewPolyRef.current?.setMap(null);
    previewLineRef.current = null;
    previewPolyRef.current = null;
    vertexMarkersRef.current.forEach((m) => m.setMap(null));
    vertexMarkersRef.current = [];
    pathRef.current = [];
  };

  const updatePreview = (cursor?: google.maps.LatLng) => {
    const map = mapRef.current;
    if (!map || !window.google) return;
    const path = pathRef.current;
    if (path.length === 0) return;

    const color = strokeColorRef.current;
    const style = { ...ROUTE_POLYGON_STYLE, strokeColor: color, fillColor: color };

    if (path.length >= 3) {
      previewLineRef.current?.setMap(null);
      previewLineRef.current = null;
      const paths = cursor ? [...path, cursor] : path;
      if (!previewPolyRef.current) {
        previewPolyRef.current = new window.google.maps.Polygon({ paths, map, ...style });
      } else {
        previewPolyRef.current.setPaths(paths);
      }
    } else {
      previewPolyRef.current?.setMap(null);
      previewPolyRef.current = null;
      const linePath = cursor ? [...path, cursor] : path;
      if (!previewLineRef.current) {
        previewLineRef.current = new window.google.maps.Polyline({
          path: linePath,
          map,
          strokeColor: color,
          strokeWeight: 2,
          strokeOpacity: 0.9,
          clickable: false,
          zIndex: 2500,
        });
      } else {
        previewLineRef.current.setPath(linePath);
      }
    }
  };

  const addVertexMarker = (latLng: google.maps.LatLng) => {
    const map = mapRef.current;
    if (!map || !window.google) return;
    const color = strokeColorRef.current;
    const marker = new window.google.maps.Marker({
      position: latLng,
      map,
      clickable: false,
      optimized: true,
      zIndex: 2600,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 7,
        fillColor: color,
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2,
      },
    });
    vertexMarkersRef.current.push(marker);
  };

  const finishPolygon = useCallback(() => {
    const map = mapRef.current;
    if (!map || !window.google) return;
    const path = pathRef.current;
    if (path.length < 3) return;

    previewLineRef.current?.setMap(null);
    previewPolyRef.current?.setMap(null);
    previewLineRef.current = null;
    previewPolyRef.current = null;

    const polygon = new window.google.maps.Polygon({
      paths: path,
      map,
      ...ROUTE_POLYGON_STYLE,
      strokeColor: strokeColorRef.current,
      fillColor: strokeColorRef.current,
      clickable: false,
    });
    finishedRef.current.push(polygon);

    const coords: number[][] = path.map((ll) => [ll.lng(), ll.lat()]);
    if (coords.length > 0) coords.push(coords[0]);
    const geoJson: DrawnPolygon["geoJson"] = {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [coords] },
      properties: {},
    };
    const pdvIds = resolveRef.current(polygon);
    onPolygonClosedRef.current(pdvIds, geoJson);

    vertexMarkersRef.current.forEach((m) => m.setMap(null));
    vertexMarkersRef.current = [];
    pathRef.current = [];
  }, [mapRef]);

  const clearAll = useCallback(
    (notify = true) => {
      finishedRef.current.forEach((p) => p.setMap(null));
      finishedRef.current = [];
      clearPreviewGraphics();
      if (notify) {
        onPolygonClosedRef.current([], {
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [] },
          properties: {},
        });
      }
    },
    [],
  );

  // Listeners Google Maps: una sola vez por instancia de mapa
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !window.google?.maps || listenersAttachedRef.current) return;

    const clickL = map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (!enabledRef.current) return;
      const latLng = e.latLng;
      if (!latLng) return;
      pathRef.current = [...pathRef.current, latLng];
      addVertexMarker(latLng);
      updatePreview();
    });

    const moveL = map.addListener("mousemove", (e: google.maps.MapMouseEvent) => {
      if (!enabledRef.current || pathRef.current.length === 0) return;
      const latLng = e.latLng ?? undefined;
      if (moveRafRef.current) cancelAnimationFrame(moveRafRef.current);
      moveRafRef.current = requestAnimationFrame(() => {
        moveRafRef.current = 0;
        updatePreview(latLng);
      });
    });

    const dblL = map.addListener("dblclick", (e: google.maps.MapMouseEvent) => {
      if (!enabledRef.current) return;
      e.stop?.();
      if (pathRef.current.length >= 3) finishPolygon();
    });

    listenersAttachedRef.current = true;

    return () => {
      clickL.remove();
      moveL.remove();
      dblL.remove();
      listenersAttachedRef.current = false;
    };
  }, [mapLoaded, mapRef, finishPolygon]);

  // Cursor + limpieza al salir del modo dibujo (sin notificar al padre)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    map.setOptions({
      draggableCursor: enabled ? "crosshair" : null,
      disableDoubleClickZoom: enabled,
    });
    if (!enabled) {
      finishedRef.current.forEach((p) => p.setMap(null));
      finishedRef.current = [];
      clearPreviewGraphics();
    }
  }, [enabled, mapLoaded, mapRef]);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clearPreviewGraphics();
        onCancelRef.current?.();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [enabled]);

  return { finishPolygon, clearAll };
}
