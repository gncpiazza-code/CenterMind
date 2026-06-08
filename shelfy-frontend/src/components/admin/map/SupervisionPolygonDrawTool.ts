"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
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
  const listenersRef = useRef<google.maps.MapsEventListener[]>([]);
  const [vertexCount, setVertexCount] = useState(0);
  const [polygonCount, setPolygonCount] = useState(0);

  const clearPreview = useCallback(() => {
    previewLineRef.current?.setMap(null);
    previewPolyRef.current?.setMap(null);
    previewLineRef.current = null;
    previewPolyRef.current = null;
    pathRef.current = [];
    setVertexCount(0);
  }, []);

  const updatePreview = useCallback(
    (cursor?: google.maps.LatLng) => {
      const map = mapRef.current;
      if (!map || !window.google) return;
      const path = pathRef.current;
      if (path.length === 0) return;
      const style = { ...ROUTE_POLYGON_STYLE, strokeColor, fillColor: strokeColor };
      if (path.length >= 3) {
        previewLineRef.current?.setMap(null);
        previewLineRef.current = null;
        if (!previewPolyRef.current) {
          previewPolyRef.current = new window.google.maps.Polygon({
            paths: cursor ? [...path, cursor] : path,
            map,
            ...style,
          });
        } else {
          previewPolyRef.current.setPaths(cursor ? [...path, cursor] : path);
        }
      } else {
        previewPolyRef.current?.setMap(null);
        previewPolyRef.current = null;
        const linePath = cursor ? [...path, cursor] : path;
        if (!previewLineRef.current) {
          previewLineRef.current = new window.google.maps.Polyline({
            path: linePath,
            map,
            strokeColor,
            strokeWeight: 2,
            strokeOpacity: 0.9,
          });
        } else {
          previewLineRef.current.setPath(linePath);
        }
      }
    },
    [mapRef, strokeColor],
  );

  const finishPolygon = useCallback(() => {
    const map = mapRef.current;
    if (!map || !window.google) return;
    const path = pathRef.current;
    if (path.length < 3) return;

    previewLineRef.current?.setMap(null);
    previewPolyRef.current?.setMap(null);

    const polygon = new window.google.maps.Polygon({
      paths: path,
      map,
      ...ROUTE_POLYGON_STYLE,
      strokeColor,
      fillColor: strokeColor,
    });
    finishedRef.current.push(polygon);
    setPolygonCount((c) => c + 1);

    const coords: number[][] = path.map((ll) => [ll.lng(), ll.lat()]);
    if (coords.length > 0) coords.push(coords[0]);
    const geoJson: DrawnPolygon["geoJson"] = {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [coords] },
      properties: {},
    };
    const pdvIds = resolvePdvIdsInPolygon(polygon);
    onPolygonClosed(pdvIds, geoJson);

    pathRef.current = [];
    setVertexCount(0);
  }, [mapRef, onPolygonClosed, resolvePdvIdsInPolygon, strokeColor]);

  const clearAll = useCallback(() => {
    finishedRef.current.forEach((p) => p.setMap(null));
    finishedRef.current = [];
    clearPreview();
    setPolygonCount(0);
    onPolygonClosed([], {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [] },
      properties: {},
    });
  }, [clearPreview, onPolygonClosed]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !window.google?.maps) return;

    const removeListeners = () => {
      listenersRef.current.forEach((l) => l.remove());
      listenersRef.current = [];
    };

    if (enabled) {
      map.setOptions({ draggableCursor: "crosshair", disableDoubleClickZoom: true });

      const clickL = map.addListener("click", (e: google.maps.MapMouseEvent) => {
        const latLng = e.latLng;
        if (!latLng) return;
        pathRef.current = [...pathRef.current, latLng];
        setVertexCount(pathRef.current.length);
        updatePreview();
      });

      const moveL = map.addListener("mousemove", (e: google.maps.MapMouseEvent) => {
        if (pathRef.current.length === 0) return;
        updatePreview(e.latLng ?? undefined);
      });

      const dblL = map.addListener("dblclick", (e: google.maps.MapMouseEvent) => {
        e.stop?.();
        if (pathRef.current.length >= 3) finishPolygon();
      });

      listenersRef.current = [clickL, moveL, dblL];
    } else {
      removeListeners();
      map.setOptions({ draggableCursor: null, disableDoubleClickZoom: false });
      finishedRef.current.forEach((p) => p.setMap(null));
      finishedRef.current = [];
      clearPreview();
      setPolygonCount(0);
    }

    return () => {
      removeListeners();
      if (map) map.setOptions({ draggableCursor: null, disableDoubleClickZoom: false });
    };
  }, [enabled, mapRef, mapLoaded, finishPolygon, updatePreview, clearPreview]);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clearPreview();
        onCancel?.();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [enabled, clearPreview, onCancel]);

  return { vertexCount, polygonCount, finishPolygon, clearAll };
}
