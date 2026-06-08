"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { DrawnPolygon } from "@/store/useSupervisionStore";

const ROUTE_POLYGON_STYLE: google.maps.PolygonOptions = {
  fillColor: "#8b5cf6",
  fillOpacity: 0.22,
  strokeColor: "#8b5cf6",
  strokeWeight: 2.5,
  editable: false,
  clickable: false,
  zIndex: 2800,
};

const SNAP_CLOSE_METERS = 35;
const VERTEX_HIT_METERS = 20;

export interface VertexDrawOptions {
  enabled: boolean;
  mapRef: RefObject<google.maps.Map | null>;
  /** @deprecated ya no se usa overlay DOM */
  containerRef?: RefObject<HTMLDivElement | null>;
  mapLoaded: boolean;
  strokeColor?: string;
  onPolygonClosed: (pdvIds: number[], geoJson: DrawnPolygon["geoJson"]) => void;
  resolvePdvIdsInPolygon: (polygon: google.maps.Polygon) => number[];
  onCancel?: () => void;
  onVertexCountChange?: (count: number) => void;
}

function emptyGeoJson(): DrawnPolygon["geoJson"] {
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [] },
    properties: {},
  };
}

function distanceMeters(a: google.maps.LatLng, b: google.maps.LatLng): number {
  const spherical = window.google?.maps?.geometry?.spherical;
  if (!spherical) return Infinity;
  return spherical.computeDistanceBetween(a, b);
}

/** Dibujo click-vértices: pins ocultos en MapaRutas + listeners directos al mapa. */
export function useVertexPolygonDraw({
  enabled,
  mapRef,
  mapLoaded,
  strokeColor = "#8b5cf6",
  onPolygonClosed,
  resolvePdvIdsInPolygon,
  onCancel,
  onVertexCountChange,
}: VertexDrawOptions) {
  const pathRef = useRef<google.maps.LatLng[]>([]);
  const previewLineRef = useRef<google.maps.Polyline | null>(null);
  const previewPolyRef = useRef<google.maps.Polygon | null>(null);
  const vertexMarkersRef = useRef<google.maps.Marker[]>([]);
  const moveRafRef = useRef(0);

  const enabledRef = useRef(enabled);
  const strokeColorRef = useRef(strokeColor);
  const onPolygonClosedRef = useRef(onPolygonClosed);
  const resolveRef = useRef(resolvePdvIdsInPolygon);
  const onCancelRef = useRef(onCancel);
  const onVertexCountChangeRef = useRef(onVertexCountChange);

  enabledRef.current = enabled;
  strokeColorRef.current = strokeColor;
  onPolygonClosedRef.current = onPolygonClosed;
  resolveRef.current = resolvePdvIdsInPolygon;
  onCancelRef.current = onCancel;
  onVertexCountChangeRef.current = onVertexCountChange;

  const notifyVertexCount = (count: number) => {
    onVertexCountChangeRef.current?.(count);
  };

  const clearPreviewGraphics = useCallback(() => {
    previewLineRef.current?.setMap(null);
    previewPolyRef.current?.setMap(null);
    previewLineRef.current = null;
    previewPolyRef.current = null;
    vertexMarkersRef.current.forEach((m) => m.setMap(null));
    vertexMarkersRef.current = [];
    pathRef.current = [];
    notifyVertexCount(0);
  }, []);

  const updatePreview = useCallback((cursor?: google.maps.LatLng) => {
    const map = mapRef.current;
    if (!map || !window.google) return;
    const path = pathRef.current;
    if (path.length === 0) return;

    const color = strokeColorRef.current;
    const style = { ...ROUTE_POLYGON_STYLE, strokeColor: color, fillColor: color };

    if (path.length >= 2) {
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
          strokeWeight: 3,
          strokeOpacity: 0.95,
          clickable: false,
          zIndex: 2700,
        });
      } else {
        previewLineRef.current.setPath(linePath);
      }
    }
  }, [mapRef]);

  const addVertexMarker = (latLng: google.maps.LatLng, index: number) => {
    const map = mapRef.current;
    if (!map || !window.google) return;
    const color = strokeColorRef.current;
    const isFirst = index === 0;
    const marker = new window.google.maps.Marker({
      position: latLng,
      map,
      clickable: false,
      optimized: false,
      zIndex: 2900,
      label: isFirst
        ? { text: "1", color: color, fontSize: "10px", fontWeight: "800" }
        : undefined,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: isFirst ? 10 : 8,
        fillColor: isFirst ? "#ffffff" : color,
        fillOpacity: 1,
        strokeColor: color,
        strokeWeight: isFirst ? 3 : 2,
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

    const polygon = new window.google.maps.Polygon({ paths: path });
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
    notifyVertexCount(0);
  }, [mapRef]);

  const undoLastVertex = useCallback(() => {
    if (pathRef.current.length === 0) return;
    pathRef.current = pathRef.current.slice(0, -1);
    const last = vertexMarkersRef.current.pop();
    last?.setMap(null);
    updatePreview();
    notifyVertexCount(pathRef.current.length);
  }, [updatePreview]);

  const addVertex = useCallback(
    (latLng: google.maps.LatLng) => {
      const path = pathRef.current;
      if (path.length >= 3) {
        const first = path[0];
        if (distanceMeters(latLng, first) <= SNAP_CLOSE_METERS) {
          finishPolygon();
          return;
        }
      }
      for (let i = 0; i < path.length; i++) {
        if (distanceMeters(latLng, path[i]) <= VERTEX_HIT_METERS) return;
      }

      pathRef.current = [...path, latLng];
      addVertexMarker(latLng, pathRef.current.length - 1);
      updatePreview();
      notifyVertexCount(pathRef.current.length);
    },
    [finishPolygon, updatePreview],
  );

  const clearAll = useCallback(
    (notify = true) => {
      clearPreviewGraphics();
      if (notify) onPolygonClosedRef.current([], emptyGeoJson());
    },
    [clearPreviewGraphics],
  );

  const addVertexRef = useRef(addVertex);
  const finishPolygonRef = useRef(finishPolygon);
  const undoLastVertexRef = useRef(undoLastVertex);
  addVertexRef.current = addVertex;
  finishPolygonRef.current = finishPolygon;
  undoLastVertexRef.current = undoLastVertex;

  // Listeners solo activos en modo dibujo (pins ocultos en MapaRutas)
  useEffect(() => {
    const map = mapRef.current;
    if (!enabled || !mapLoaded || !map || !window.google?.maps) return;

    const clickL = map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (!enabledRef.current) return;
      const latLng = e.latLng;
      if (!latLng) return;
      addVertexRef.current(latLng);
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
      e.stop();
      if (pathRef.current.length >= 3) finishPolygonRef.current();
    });

    map.setOptions({
      draggableCursor: "crosshair",
      draggingCursor: "crosshair",
      disableDoubleClickZoom: true,
    });

    return () => {
      clickL.remove();
      moveL.remove();
      dblL.remove();
      map.setOptions({
        draggableCursor: null,
        draggingCursor: null,
        disableDoubleClickZoom: false,
      });
    };
  }, [enabled, mapLoaded, mapRef, updatePreview]);

  useEffect(() => {
    if (enabled || !mapLoaded) return;
    clearPreviewGraphics();
  }, [enabled, mapLoaded, clearPreviewGraphics]);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clearPreviewGraphics();
        onCancelRef.current?.();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        undoLastVertexRef.current();
      } else if (e.key === "Enter" && pathRef.current.length >= 3) {
        e.preventDefault();
        finishPolygonRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [enabled, clearPreviewGraphics]);

  return { finishPolygon, clearAll, undoLastVertex };
}
