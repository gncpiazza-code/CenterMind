"use client";
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import type { DrawnPolygon } from "@/store/useSupervisionStore";

// ── Interfaces ────────────────────────────────────────────────────────────────
export interface PinCliente {
  id: number;
  lat: number;
  lng: number;
  nombre: string;
  razonSocial?: string | null;
  color: string;
  activo: boolean;
  vendedor: string;
  ultimaCompra: string | null;
  conExhibicion: boolean;
  idClienteErp?: string | null;
  nroRuta?: string | null;
  fechaUltimaCompra?: string | null;
  fechaUltimaExhibicion?: string | null;
  urlExhibicion?: string | null;
  deuda?: number | null;
  antiguedadDias?: number | null;
  totalExhibiciones?: number;
  id_vendedor?: number;
}

export interface DeudorInfo {
  id_cliente_erp: string | null;
  cliente_nombre: string;
  deuda_total: number;
  antiguedad_dias: number;
  vendedor_nombre: string;
}

function debtBorderColor(antiguedad: number): string {
  if (antiguedad <= 30) return '#22c55e';
  if (antiguedad <= 60) return '#f97316';
  return '#ef4444';
}

export type PinStatus = "activo_exhibicion" | "activo" | "inactivo_exhibicion" | "inactivo";

export function getPinStatus(pin: PinCliente): PinStatus {
  if (pin.activo && pin.conExhibicion) return "activo_exhibicion";
  if (pin.activo && !pin.conExhibicion) return "activo";
  if (!pin.activo && pin.conExhibicion) return "inactivo_exhibicion";
  return "inactivo";
}

export const STATUS_COLORS: Record<PinStatus, string> = {
  activo_exhibicion:   "#22c55e",
  activo:              "#3b82f6",
  inactivo_exhibicion: "#f59e0b",
  inactivo:            "#ef4444",
};

export const STATUS_LABELS: Record<PinStatus, string> = {
  activo_exhibicion:   "Activo + Exhibición",
  activo:              "Activo",
  inactivo_exhibicion: "Inactivo + Exhibición",
  inactivo:            "Inactivo",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const diasDesdeIso = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
};

function buildPinSvg(fillColor: string, borderColor: string, size: number, count?: number): string {
  const r = size / 2 - 1.5;
  const cx = size / 2;
  const textContent = count && count > 0
    ? `<text x="${cx}" y="${cx + 3.5}" text-anchor="middle" font-size="9" font-weight="900" fill="white" font-family="system-ui">${count}</text>`
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="${fillColor}" stroke="${borderColor}" stroke-width="2.5"/>
    ${textContent}
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function buildPinSvgWithLabel(fillColor: string, borderColor: string, size: number, label: string): string {
  const r = size / 2 - 1.5;
  const cx = size / 2;
  const safeLabel = label.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="${fillColor}" stroke="${borderColor}" stroke-width="2.5"/>
    <text x="${cx}" y="${cx + 3}" text-anchor="middle" font-size="7" font-weight="900" fill="white" font-family="system-ui">${safeLabel}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function buildSelectedPinSvg(fillColor: string, borderColor: string, size: number): string {
  const r = size / 2 - 1.5;
  const cx = size / 2;
  const outerR = size / 2 + 4;
  const totalSize = size + 8;
  const ocx = totalSize / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalSize}" height="${totalSize}" viewBox="0 0 ${totalSize} ${totalSize}">
    <circle cx="${ocx}" cy="${ocx}" r="${outerR - 1}" fill="white" opacity="0.9"/>
    <circle cx="${ocx}" cy="${ocx}" r="${r}" fill="${fillColor}" stroke="${borderColor}" stroke-width="2.5"/>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function normalizeKey(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function compactDebtAmount(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}k`;
  return `$${Math.round(amount)}`;
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface MapaRutasProps {
  pines: PinCliente[];
  fullscreenPanel?: React.ReactNode;
  shelfyMapsMode?: boolean;
  mode?: 'activos' | 'deudores' | 'ruteo';
  onModeChange?: (mode: 'activos' | 'deudores' | 'ruteo') => void;
  deudoresData?: DeudorInfo[];
  selectedPDVs?: number[];
  onTogglePDV?: (id: number) => void;
  // Armar Ruta
  routeBuildEnabled?: boolean;
  onPolygonSelectionChange?: (pdvIds: number[], geoJson: DrawnPolygon['geoJson']) => void;
}

// ── Google Maps API Key ───────────────────────────────────────────────────────
const GMAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

let gmapsConfigured = false;
function ensureGmapsConfigured() {
  if (!gmapsConfigured) {
    setOptions({ key: GMAPS_KEY, v: 'weekly' });
    gmapsConfigured = true;
  }
}

async function loadGmaps() {
  ensureGmapsConfigured();
  await importLibrary('maps');
  await importLibrary('drawing');
  await importLibrary('geometry');
}

// ── Street View Panel ─────────────────────────────────────────────────────────
function StreetViewPanel({ lat, lng, onClose }: { lat: number; lng: number; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [svError, setSvError] = useState<string | null>(null);

  useEffect(() => {
    if (!panelRef.current || !window.google) return;
    setSvError(null);
    const svc = new window.google.maps.StreetViewService();
    svc.getPanorama({ location: { lat, lng }, radius: 120 }, (data, status) => {
      if (status !== window.google.maps.StreetViewStatus.OK || !data?.location?.latLng) {
        setSvError("No hay cobertura de Street View cerca de este PDV.");
        return;
      }
      if (!panelRef.current) return;
      new window.google.maps.StreetViewPanorama(panelRef.current, {
        position: data.location.latLng,
        pov: { heading: 0, pitch: 0 },
        zoom: 1,
        addressControl: false,
        fullscreenControl: false,
        linksControl: true,
        motionTracking: false,
      });
    });
  }, [lat, lng]);

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0,
      width: '45%', minWidth: 360, maxWidth: 700, height: '100%', zIndex: 35,
      background: '#000',
      borderLeft: '2px solid rgba(139,92,246,0.6)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 10px',
        background: 'rgba(15,23,42,0.92)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <span style={{ color: '#e2e8f0', fontSize: 11, fontWeight: 600 }}>📷 Street View</span>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 5,
            color: '#94a3b8', cursor: 'pointer', padding: '2px 7px', fontSize: 12,
          }}
        >✕</button>
      </div>
      {svError ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: 12, padding: 16, textAlign: 'center' }}>
          {svError}
        </div>
      ) : (
        <div ref={panelRef} style={{ flex: 1 }} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function MapaRutas({
  pines,
  fullscreenPanel,
  shelfyMapsMode,
  mode = 'activos',
  onModeChange,
  deudoresData,
  selectedPDVs,
  onTogglePDV,
  routeBuildEnabled = false,
  onPolygonSelectionChange,
}: MapaRutasProps) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const mapRef        = useRef<google.maps.Map | null>(null);
  const markersMapRef = useRef<Map<number, google.maps.Marker>>(new Map());
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const drawingMgrRef = useRef<google.maps.drawing.DrawingManager | null>(null);
  const drawnPolyRef  = useRef<google.maps.Polygon[]>([]);
  const fittedRef     = useRef(false);

  const [mapLoaded,    setMapLoaded]    = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSidePanel, setShowSidePanel] = useState(true);
  const [svPos,        setSvPos]        = useState<{ lat: number; lng: number } | null>(null);
  const [noKey,        setNoKey]        = useState(false);
  const [polygonCount, setPolygonCount] = useState(0);

  // ── Filter toggles ─────────────────────────────────────────────────────────
  const [filterEnabled, setFilterEnabled] = useState<Record<PinStatus, boolean>>({
    activo_exhibicion: true, activo: true, inactivo_exhibicion: true, inactivo: true,
  });

  useEffect(() => {
    setFilterEnabled({ activo_exhibicion: true, activo: true, inactivo_exhibicion: true, inactivo: true });
  }, [pines]);

  const toggleFilter = (status: PinStatus) =>
    setFilterEnabled(prev => ({ ...prev, [status]: !prev[status] }));

  const statusCounts = useMemo(() =>
    (["activo_exhibicion", "activo", "inactivo_exhibicion", "inactivo"] as PinStatus[]).reduce(
      (acc, s) => ({ ...acc, [s]: pines.filter(p => getPinStatus(p) === s).length }),
      {} as Record<PinStatus, number>
    ), [pines]);

  const filteredPines = useMemo(
    () => pines.filter(p => filterEnabled[getPinStatus(p)]),
    [pines, filterEnabled]
  );

  // Resetear fitBounds cuando cambia el set de pines
  const prevPineIdsRef = useRef<string>('');
  const currentPineIds = pines.map(p => p.id).sort().join(',');
  if (currentPineIds !== prevPineIdsRef.current) {
    prevPineIdsRef.current = currentPineIds;
    fittedRef.current = false;
  }

  // ── Initialize Google Maps ─────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    if (!GMAPS_KEY) { setNoKey(true); return; }

    let cancelled = false;
    loadGmaps().then(() => {
      if (cancelled || !containerRef.current) return;

      const map = new window.google.maps.Map(containerRef.current, {
        center: { lat: -34.0, lng: -63.0 },
        zoom: 5,
        mapTypeId: 'roadmap',
        fullscreenControl: false,
        streetViewControl: false,
        zoomControl: true,
        mapTypeControl: false,
        scaleControl: false,
        rotateControl: false,
        gestureHandling: 'greedy',
        styles: [
          { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
          { featureType: 'transit', stylers: [{ visibility: 'off' }] },
        ],
      });

      infoWindowRef.current = new window.google.maps.InfoWindow({ disableAutoPan: true });
      mapRef.current = map;
      setMapLoaded(true);
    }).catch(() => { if (!cancelled) setNoKey(true); });

    return () => { cancelled = true; };
  }, []);

  // ── Resize on fullscreen toggle ────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    window.google?.maps?.event?.trigger(mapRef.current, 'resize');
  }, [isFullscreen]);

  useEffect(() => {
    if (!isFullscreen) setShowSidePanel(true);
  }, [isFullscreen]);

  // ── Markers ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !window.google) return;

    // Clear existing markers
    markersMapRef.current.forEach(m => m.setMap(null));
    markersMapRef.current.clear();
    if (infoWindowRef.current) infoWindowRef.current.close();

    const conCoords = filteredPines.filter(p => p.lat && p.lng);
    const selSet = new Set(selectedPDVs ?? []);

    conCoords.forEach(p => {
      const status      = getPinStatus(p);
      const statusColor = STATUS_COLORS[status];
      const vendorColor = p.color;
      const size        = p.activo ? 18 : 14;
      const isSelected  = selSet.has(p.id);

      // Deuda: resolver deudor para borde + etiqueta interna en modo deudores
      let matchedDeudor: DeudorInfo | null = null;
      if (mode === 'deudores' && deudoresData) {
        matchedDeudor =
          deudoresData.find(d =>
            d.id_cliente_erp && p.idClienteErp && d.id_cliente_erp === p.idClienteErp
          ) ??
          deudoresData.find(d =>
            normalizeKey(d.cliente_nombre) === normalizeKey(p.nombre) &&
            normalizeKey(d.vendedor_nombre) === normalizeKey(p.vendedor)
          ) ??
          null;
      }
      // Fallback: pin carries pre-computed debt data from pines memo (ERP-ID matched in TabSupervision)
      if (mode === 'deudores' && !matchedDeudor && p.deuda != null && p.deuda > 0) {
        matchedDeudor = {
          id_cliente_erp: p.idClienteErp ?? null,
          cliente_nombre: p.nombre,
          deuda_total: p.deuda,
          antiguedad_dias: p.antiguedadDias ?? 0,
          vendedor_nombre: p.vendedor,
        };
      }
      const debtColor = matchedDeudor ? debtBorderColor(matchedDeudor.antiguedad_dias) : null;

      const pinLabel =
        mode === "deudores" && matchedDeudor
          ? compactDebtAmount(matchedDeudor.deuda_total)
          : null;
      const pinFillColor = vendorColor;
      const pinBorderColor = mode === "deudores" && debtColor ? debtColor : statusColor;
      const iconUrl = isSelected
        ? buildSelectedPinSvg(pinFillColor, pinBorderColor, size)
        : pinLabel
          ? buildPinSvgWithLabel(pinFillColor, pinBorderColor, size, pinLabel)
          : buildPinSvg(pinFillColor, pinBorderColor, size, p.totalExhibiciones);

      const iconSize = isSelected ? size + 8 : size;

      const marker = new window.google.maps.Marker({
        position: { lat: p.lat, lng: p.lng },
        map,
        icon: {
          url: iconUrl,
          scaledSize: new window.google.maps.Size(iconSize, iconSize),
          anchor: new window.google.maps.Point(iconSize / 2, iconSize / 2),
        },
        title: `#${p.idClienteErp ?? p.id} - ${p.nombre}`,
        optimized: false,
        zIndex: p.activo ? 10 : 5,
      });

      markersMapRef.current.set(p.id, marker);

      // ── Build popup HTML ─────────────────────────────────────────────────
      const diasCompra = diasDesdeIso(p.fechaUltimaCompra);
      const diasExhib  = diasDesdeIso(p.fechaUltimaExhibicion);
      const compraColor = p.activo ? '#86efac' : '#fca5a5';
      const compraLabel = diasCompra === null
        ? `<span style="color:#475569">Sin compras registradas</span>`
        : `<span style="color:${compraColor}">🛒 Últ. compra: ${p.ultimaCompra} · <b>hace ${diasCompra}d</b></span>`;
      const razonSocial = (p.razonSocial ?? '').trim();
      const nombreFantasia = (p.nombre ?? '').trim();
      const razonLine = razonSocial && razonSocial.toLowerCase() !== nombreFantasia.toLowerCase()
        ? `<div style="font-size:11px;color:#94a3b8;margin-top:-2px;margin-bottom:6px">${razonSocial}</div>`
        : '';
      const exhibLine = p.fechaUltimaExhibicion
        ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.07)">
             <span style="color:#fbbf24;font-size:11px">
               📸 Exhibición: ${p.fechaUltimaExhibicion.split('T')[0]}${diasExhib !== null ? ` · <b>hace ${diasExhib}d</b>` : ''}
             </span>
           </div>`
        : '';
      const deudaLine = p.deuda != null && p.deuda > 0
        ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.07)">
             <span style="color:#fb923c;font-size:11px;font-weight:700">💰 Deuda: $${p.deuda.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
             ${p.antiguedadDias != null ? `<span style="color:#64748b;font-size:10px"> · ${p.antiguedadDias}d antigüedad</span>` : ''}
           </div>`
        : '';
      const photoBlock = p.urlExhibicion
        ? `<div style="margin-top:8px;border-radius:6px;overflow:hidden"><img src="${p.urlExhibicion}" style="width:100%;max-height:90px;object-fit:cover;display:block" loading="lazy"/></div>`
        : '';
      const svBtn = `<button onclick="window.__shelfySV&&window.__shelfySV(${p.lat},${p.lng})"
        style="margin-top:8px;width:100%;background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.4);
               color:#a78bfa;font-size:10px;font-weight:600;border-radius:6px;padding:5px 8px;cursor:pointer">
        🏘️ Street View
      </button>`;

      const debtAgeLabel = matchedDeudor
        ? matchedDeudor.antiguedad_dias <= 30
          ? "Al día (<=30d)"
          : matchedDeudor.antiguedad_dias <= 60
            ? "Atención (31-60d)"
            : "Crítico (>60d)"
        : null;
      const modeBadge = mode === "deudores"
        ? `<div style="font-size:10px;padding:3px 8px;border-radius:20px;display:inline-flex;align-items:center;gap:4px;
                    background:${(debtColor ?? "#64748b")}22;color:${debtColor ?? "#94a3b8"};
                    border:1px solid ${(debtColor ?? "#64748b")}44;font-weight:700;margin-bottom:8px">
             <span style="width:6px;height:6px;border-radius:50%;background:${debtColor ?? "#64748b"};flex-shrink:0"></span>
             ${debtAgeLabel ?? "Sin deuda mapeada"}
           </div>`
        : `<div style="font-size:10px;padding:3px 8px;border-radius:20px;display:inline-flex;align-items:center;gap:4px;
                    background:${statusColor}22;color:${statusColor};border:1px solid ${statusColor}44;font-weight:700;margin-bottom:8px">
             <span style="width:6px;height:6px;border-radius:50%;background:${statusColor};flex-shrink:0"></span>
             ${STATUS_LABELS[status]}
           </div>`;

      const popupHTML = `
        <div style="min-width:200px;max-width:260px;font-size:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                    background:#1e293b;color:#e2e8f0;padding:12px 14px;border-radius:10px;
                    box-shadow:0 8px 30px rgba(0,0,0,0.45);line-height:1.5;border:1px solid rgba(255,255,255,0.08)">
          ${p.idClienteErp ? `<div style="font-size:9px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">Cliente ${p.idClienteErp}</div>` : ''}
          <b style="display:block;font-size:14px;color:#f8fafc;margin-bottom:6px;line-height:1.3">${p.nombre}</b>
          ${razonLine}
          <div style="display:flex;align-items:center;gap:6px;margin:6px 0">
            <span style="width:9px;height:9px;border-radius:50%;background:${vendorColor};flex-shrink:0;border:1px solid rgba(255,255,255,0.2)"></span>
            <span style="font-size:11px;font-weight:600;color:#94a3b8">${p.vendedor}</span>
          </div>
          ${modeBadge}
          <div style="font-size:11px">${compraLabel}</div>
          ${exhibLine}
          ${deudaLine}
          ${photoBlock}
          ${svBtn}
        </div>`;

      // Expose Street View callback globally (simpler than passing through InfoWindow HTML)
      (window as any).__shelfySV = (lat: number, lng: number) => {
        setSvPos({ lat, lng });
        if (infoWindowRef.current) infoWindowRef.current.close();
      };

      marker.addListener('click', () => {
        if (onTogglePDV) onTogglePDV(p.id);
        if (infoWindowRef.current) {
          infoWindowRef.current.setContent(popupHTML);
          infoWindowRef.current.open(map, marker);
        }
      });
    });

    // fitBounds
    if (conCoords.length > 0 && !fittedRef.current) {
      fittedRef.current = true;
      const bounds = new window.google.maps.LatLngBounds();
      conCoords.forEach(p => bounds.extend({ lat: p.lat, lng: p.lng }));
      map.fitBounds(bounds, 60);
      if (conCoords.length === 1) map.setZoom(14);
    }
  }, [filteredPines, mapLoaded, mode, deudoresData, onTogglePDV]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Update selection style without recreating markers ─────────────────────
  useEffect(() => {
    if (!mapLoaded || !window.google) return;
    const selSet = new Set(selectedPDVs ?? []);
    markersMapRef.current.forEach((marker, id) => {
      const pin = filteredPines.find(p => p.id === id);
      if (!pin) return;
      const status      = getPinStatus(pin);
      const statusColor = STATUS_COLORS[status];
      const size        = pin.activo ? 18 : 14;
      const isSelected  = selSet.has(id);
      const iconUrl = isSelected
        ? buildSelectedPinSvg(pin.color, statusColor, size)
        : buildPinSvg(pin.color, statusColor, size, pin.totalExhibiciones);
      const iconSize = isSelected ? size + 8 : size;
      marker.setIcon({
        url: iconUrl,
        scaledSize: new window.google.maps.Size(iconSize, iconSize),
        anchor: new window.google.maps.Point(iconSize / 2, iconSize / 2),
      });
      marker.setZIndex(isSelected ? 20 : (pin.activo ? 10 : 5));
    });
  }, [selectedPDVs, filteredPines, mapLoaded]);

  // ── Drawing Manager (Armar Ruta mode) ─────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !window.google) return;

    if (routeBuildEnabled) {
      if (!drawingMgrRef.current) {
        const dm = new window.google.maps.drawing.DrawingManager({
          drawingMode: window.google.maps.drawing.OverlayType.POLYGON,
          drawingControl: false,
          polygonOptions: {
            fillColor: '#8b5cf6',
            fillOpacity: 0.18,
            strokeColor: '#8b5cf6',
            strokeWeight: 2,
            editable: false,
            clickable: false,
          },
        });

        window.google.maps.event.addListener(dm, 'polygoncomplete', (polygon: google.maps.Polygon) => {
          drawnPolyRef.current.push(polygon);
          setPolygonCount(c => c + 1);

          // Spatial containment: find PDVs inside polygon
          const pdvIds: number[] = [];
          pines.forEach(p => {
            if (!p.lat || !p.lng) return;
            const point = new window.google.maps.LatLng(p.lat, p.lng);
            if (window.google.maps.geometry.poly.containsLocation(point, polygon)) {
              pdvIds.push(p.id);
            }
          });

          // Build GeoJSON Feature<Polygon>
          const path = polygon.getPath();
          const coords: number[][] = path.getArray().map((ll: google.maps.LatLng) => [ll.lng(), ll.lat()]);
          if (coords.length > 0) coords.push(coords[0]); // close ring
          const geoJson: DrawnPolygon['geoJson'] = {
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [coords] },
            properties: {},
          };

          onPolygonSelectionChange?.(pdvIds, geoJson);

          // Switch back to pan mode after drawing
          dm.setDrawingMode(null);
        });

        dm.setMap(map);
        drawingMgrRef.current = dm;
      } else {
        drawingMgrRef.current.setMap(map);
        drawingMgrRef.current.setDrawingMode(window.google.maps.drawing.OverlayType.POLYGON);
      }
    } else {
      if (drawingMgrRef.current) {
        drawingMgrRef.current.setMap(null);
        drawingMgrRef.current.setDrawingMode(null);
      }
      // Clear drawn polygons from map
      drawnPolyRef.current.forEach(p => p.setMap(null));
      drawnPolyRef.current = [];
      setPolygonCount(0);
    }
  }, [routeBuildEnabled, mapLoaded, pines, onPolygonSelectionChange]);

  // ── ESC to exit fullscreen ────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isFullscreen]);

  // ── Clear drawn polygons handler ──────────────────────────────────────────
  const clearPolygons = useCallback(() => {
    drawnPolyRef.current.forEach(p => p.setMap(null));
    drawnPolyRef.current = [];
    setPolygonCount(0);
    onPolygonSelectionChange?.([], { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: {} });
  }, [onPolygonSelectionChange]);

  // ── Print ─────────────────────────────────────────────────────────────────
  const handlePrint = () => {
    const legend = filteredPines.map(p =>
      `<tr><td style="padding:4px 8px;border:1px solid #ccc;">${p.nombre}</td><td style="padding:4px 8px;border:1px solid #ccc;">${p.vendedor}</td></tr>`
    ).join('');
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Mapa de Rutas</title>
    <style>body{margin:0;font-family:sans-serif;} table{border-collapse:collapse;width:100%;margin-top:16px;} @media print{@page{margin:1cm;}}</style>
    </head><body>
    <h2 style="font-size:16px;margin:8px 0;">Mapa de Rutas — PDVs visibles (${filteredPines.length})</h2>
    <table><thead><tr><th style="padding:4px 8px;border:1px solid #ccc;text-align:left;">PDV</th><th style="padding:4px 8px;border:1px solid #ccc;text-align:left;">Vendedor</th></tr></thead>
    <tbody>${legend}</tbody></table>
    <script>window.onload=function(){window.print();}<\/script>
    </body></html>`);
    win.document.close();
  };

  const STATUS_ORDER: PinStatus[] = ['activo_exhibicion', 'activo', 'inactivo_exhibicion', 'inactivo'];
  const panelOffset = isFullscreen && fullscreenPanel && showSidePanel ? 300 : 0;

  // ── Filter Legend ─────────────────────────────────────────────────────────
  const FilterLegend = () => (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 5, padding: '8px 10px',
      background: 'rgba(15,23,42,0.82)', backdropFilter: 'blur(10px)',
      borderRadius: 12, border: '1px solid rgba(255,255,255,0.10)',
      boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
    }}>
      {STATUS_ORDER.map(s => {
        const on = filterEnabled[s];
        const count = statusCounts[s];
        const color = STATUS_COLORS[s];
        return (
          <button key={s} onClick={() => toggleFilter(s)}
            title={on ? `Ocultar: ${STATUS_LABELS[s]}` : `Mostrar: ${STATUS_LABELS[s]}`}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 9px', borderRadius: 7,
              border: `1px solid ${on ? color + '88' : 'rgba(255,255,255,0.08)'}`,
              background: on ? color + '28' : 'rgba(255,255,255,0.05)',
              color: on ? color : 'rgba(255,255,255,0.75)',
              cursor: 'pointer', fontSize: 11, fontWeight: 600,
              transition: 'all 0.15s', opacity: count === 0 ? 0.35 : 1,
            }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: on ? color : 'rgba(255,255,255,0.5)', flexShrink: 0 }} />
            <span style={{ maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {STATUS_LABELS[s]}
            </span>
            <span style={{
              background: on ? color + '33' : 'rgba(255,255,255,0.12)',
              color: on ? color : 'rgba(255,255,255,0.7)',
              borderRadius: 4, padding: '0 5px', fontSize: 10, minWidth: 18, textAlign: 'center', fontWeight: 700,
            }}>{count}</span>
          </button>
        );
      })}
    </div>
  );

  // ── No API key fallback ───────────────────────────────────────────────────
  if (noKey) {
    return (
      <div style={{
        position: 'relative', height: '100%', width: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: '#f8fafc', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16,
        gap: 12,
      }}>
        <div style={{ fontSize: 36 }}>🗺️</div>
        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 15 }}>Google Maps no configurado</div>
        <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center', maxWidth: 280, lineHeight: 1.6 }}>
          Agregá <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> a tus variables de entorno para activar el mapa.
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: isFullscreen ? 'fixed' : 'relative',
        inset: isFullscreen ? 0 : undefined,
        zIndex: isFullscreen ? 9999 : undefined,
        height: isFullscreen ? '100vh' : '100%',
        width: isFullscreen ? '100vw' : '100%',
        borderRadius: isFullscreen ? 0 : 16,
        overflow: 'hidden',
        background: '#f8fafc',
        display: 'flex',
      }}
      className="shelfy-print-mapa"
    >
      {/* Vendor panel overlay (fullscreen only) */}
      {isFullscreen && fullscreenPanel && showSidePanel && (
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 300,
          zIndex: 20, display: 'flex', flexDirection: 'column',
          background: 'rgba(10,14,24,0.97)', backdropFilter: 'blur(16px)',
          borderRight: '1px solid rgba(255,255,255,0.07)',
          overflowY: 'auto', boxShadow: '4px 0 24px rgba(0,0,0,0.4)',
        }}>
          {fullscreenPanel}
        </div>
      )}

      {/* Map canvas */}
      <div style={{ flex: 1, position: 'relative', marginLeft: panelOffset }}>
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

        {/* Street View panel */}
        {svPos && (
          <StreetViewPanel
            lat={svPos.lat}
            lng={svPos.lng}
            onClose={() => setSvPos(null)}
          />
        )}

        {/* "Armar Ruta" overlay bar */}
        {routeBuildEnabled && (
          <div style={{
            position: 'absolute', top: isFullscreen ? 56 : 10, left: '50%', transform: 'translateX(-50%)',
            zIndex: 30, display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(139,92,246,0.92)', backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.20)',
            borderRadius: 10, padding: '7px 14px',
            boxShadow: '0 4px 20px rgba(139,92,246,0.4)',
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'white' }}>
              ✏️ Dibujá un polígono para seleccionar PDVs
            </span>
            {polygonCount > 0 && (
              <button
                onClick={clearPolygons}
                style={{
                  background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: 6, color: 'white', fontSize: 10, fontWeight: 700,
                  padding: '3px 8px', cursor: 'pointer',
                }}
              >
                🗑️ Limpiar ({polygonCount})
              </button>
            )}
          </div>
        )}
      </div>

      {/* Left hamburger (fullscreen side panel toggle) */}
      {isFullscreen && fullscreenPanel && (
        <div style={{
          position: 'absolute', top: 10, left: showSidePanel ? 308 : 10, zIndex: 31,
          transition: 'left 0.2s ease',
        }}>
          <button
            onClick={() => setShowSidePanel(v => !v)}
            title={showSidePanel ? 'Ocultar panel izquierdo' : 'Mostrar panel izquierdo'}
            style={{
              background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8, color: '#e2e8f0', padding: '7px 9px',
              cursor: 'pointer', fontSize: 12, lineHeight: 1,
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
            }}
          >
            {showSidePanel ? '☰ Ocultar' : '☰ Mostrar'}
          </button>
        </div>
      )}

      {/* Fullscreen mode switcher */}
      {!shelfyMapsMode && isFullscreen && onModeChange && (
        <div style={{
          position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
          zIndex: 31, display: 'flex', gap: 6,
          background: 'rgba(15,23,42,0.78)', backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: 4,
          boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        }}>
          <button
            onClick={() => onModeChange('activos')}
            style={{
              border: 'none',
              borderRadius: 8,
              padding: '6px 10px',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              color: mode === 'activos' ? '#0f172a' : '#cbd5e1',
              background: mode === 'activos' ? '#a78bfa' : 'transparent',
            }}
          >
            Activos
          </button>
          <button
            onClick={() => onModeChange('deudores')}
            style={{
              border: 'none',
              borderRadius: 8,
              padding: '6px 10px',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              color: mode === 'deudores' ? '#0f172a' : '#cbd5e1',
              background: mode === 'deudores' ? '#f97316' : 'transparent',
            }}
          >
            Deudores
          </button>
          <button
            onClick={() => onModeChange('ruteo')}
            style={{
              border: 'none',
              borderRadius: 8,
              padding: '6px 10px',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              color: mode === 'ruteo' ? '#0f172a' : '#cbd5e1',
              background: mode === 'ruteo' ? '#22c55e' : 'transparent',
            }}
          >
            Ruteo
          </button>
        </div>
      )}

      {/* Top-right controls */}
      {!shelfyMapsMode && (
        <div style={{
          position: 'absolute', top: 10, right: 10,
          display: 'flex', gap: 5, zIndex: 30,
        }}>
          <button
            onClick={() => setIsFullscreen(f => !f)}
            title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            style={{
              background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8, color: '#e2e8f0', padding: '7px 9px',
              cursor: 'pointer', fontSize: 14, lineHeight: 1,
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
              transition: 'background 0.15s',
            }}
            onMouseOver={e => (e.currentTarget.style.background = 'rgba(15,23,42,0.92)')}
            onMouseOut={e => (e.currentTarget.style.background = 'rgba(15,23,42,0.75)')}
          >{isFullscreen ? '✕ Salir' : '⛶'}</button>
          <button
            onClick={handlePrint}
            title="Imprimir lista de PDVs"
            style={{
              background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8, color: '#e2e8f0', padding: '7px 9px',
              cursor: 'pointer', fontSize: 14, lineHeight: 1,
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
              transition: 'background 0.15s',
            }}
            onMouseOver={e => (e.currentTarget.style.background = 'rgba(15,23,42,0.92)')}
            onMouseOut={e => (e.currentTarget.style.background = 'rgba(15,23,42,0.75)')}
          >🖨️</button>
        </div>
      )}

      {/* Filter legend (modo activos) */}
      {!shelfyMapsMode && mode !== 'deudores' && (
        <div style={{
          position: 'absolute', bottom: 40, left: panelOffset + 12,
          zIndex: 30, transition: 'left 0.2s ease',
        }}>
          <FilterLegend />
        </div>
      )}

      {/* Debt legend (modo deudores) */}
      {mode === 'deudores' && (
        <div className="absolute bottom-4 left-4 z-10 bg-black/70 backdrop-blur-sm rounded-lg p-3 text-xs space-y-1.5">
          <div className="text-white/50 font-medium mb-1">Estado de deuda</div>
          {[['#22c55e', '≤ 30 días'], ['#f97316', '31 – 60 días'], ['#ef4444', '> 60 días']].map(([c, l]) => (
            <div key={l} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ background: c }} />
              <span className="text-white/70">{l}</span>
            </div>
          ))}
        </div>
      )}

      {/* PDV count badge */}
      {!shelfyMapsMode && (
        <div style={{
          position: 'absolute', top: 10,
          left: (isFullscreen && fullscreenPanel)
            ? (showSidePanel ? 403 : 105)
            : (panelOffset + 10),
          zIndex: 30,
          background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(8px)',
          color: '#e2e8f0', fontSize: 11, fontWeight: 700,
          padding: '5px 11px', borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          pointerEvents: 'none', transition: 'left 0.3s ease',
        }}>
          {filteredPines.length.toLocaleString()} <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 400 }}>PDVs visibles</span>
        </div>
      )}
    </div>
  );
}
