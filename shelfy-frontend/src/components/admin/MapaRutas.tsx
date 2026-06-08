"use client";
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Settings } from "lucide-react";
import { loadGoogleMapsFull, getGoogleMapsApiKey, ensureGoogleMapsConfigured, subscribeGoogleMapsAuthFailure, googleMapsReferrerWhitelistHint } from "@/lib/googleMapsLoader";
import type { DrawnPolygon, MapToolMode } from "@/store/useSupervisionStore";
import { diasCalendarioDesdeFechaCompra, normalizeFechaPadrón } from "@/lib/supervisionMapHelpers";
import { MapLegendTooltip } from "./MapLegendTooltip";
import { useVertexPolygonDraw } from "./map/SupervisionPolygonDrawTool";
import type { MapaCapaPlanificacion } from "@/lib/api";
import { SupervisionMapLayerPanel } from "./map/SupervisionMapLayerPanel";

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
  fechaAlta?: string | null;
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
/** Días calendario desde fecha padrón (evita parse ISO solo-fecha en UTC). */
const diasDesdeIso = (iso: string | null | undefined): number | null =>
  diasCalendarioDesdeFechaCompra(normalizeFechaPadrón(iso) ?? iso ?? null);

function altaBorderColor(fechaAlta: string | null | undefined): string | null {
  const dias = diasDesdeIso(fechaAlta);
  if (dias === null) return null;
  if (dias < 7)  return '#f97316'; // naranja — alta < 7d
  if (dias < 30) return '#38bdf8'; // celeste — alta 7-30d
  return null;
}

// Star (5-point) — activo_exhibicion
function buildStarSvg(fillColor: string, borderColor: string | null, size: number): string {
  const cx = size / 2, cy = size / 2, r_out = size / 2 - 2, r_in = r_out * 0.4;
  const pts = Array.from({length: 10}, (_, i) => {
    const angle = (i * Math.PI / 5) - Math.PI / 2;
    const r = i % 2 === 0 ? r_out : r_in;
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(' ');
  const stroke = borderColor ?? '#ffffff33';
  const sw = borderColor ? 2.5 : 1;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <polygon points="${pts}" fill="${fillColor}" stroke="${stroke}" stroke-width="${sw}"/>
    </svg>`
  )}`;
}

// Dollar sign — activo
function buildDollarSvg(fillColor: string, borderColor: string | null, size: number): string {
  const cx = size / 2, r = size / 2 - 2;
  const stroke = borderColor ?? '#ffffff33';
  const sw = borderColor ? 2.5 : 1;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${cx}" cy="${cx}" r="${r}" fill="${fillColor}" stroke="${stroke}" stroke-width="${sw}"/>
      <text x="${cx}" y="${cx + 4}" text-anchor="middle" font-size="${size * 0.52}" font-weight="900" fill="white" font-family="system-ui">$</text>
    </svg>`
  )}`;
}

// Question mark — inactivo_exhibicion
function buildQuestionSvg(fillColor: string, borderColor: string | null, size: number): string {
  const cx = size / 2, r = size / 2 - 2;
  const stroke = borderColor ?? '#ffffff33';
  const sw = borderColor ? 2.5 : 1;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${cx}" cy="${cx}" r="${r}" fill="${fillColor}" stroke="${stroke}" stroke-width="${sw}"/>
      <text x="${cx}" y="${cx + 4}" text-anchor="middle" font-size="${size * 0.52}" font-weight="900" fill="white" font-family="system-ui">?</text>
    </svg>`
  )}`;
}

// Cross (✕) — inactivo
function buildCrossSvg(fillColor: string, borderColor: string | null, size: number): string {
  const cx = size / 2, r = size / 2 - 2;
  const d = size * 0.22, h = size * 0.08;
  const stroke = borderColor ?? '#ffffff33';
  const sw = borderColor ? 2.5 : 1;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${cx}" cy="${cx}" r="${r}" fill="${fillColor}" stroke="${stroke}" stroke-width="${sw}"/>
      <line x1="${cx - d}" y1="${cx - d}" x2="${cx + d}" y2="${cx + d}" stroke="white" stroke-width="${h * 2}" stroke-linecap="round"/>
      <line x1="${cx + d}" y1="${cx - d}" x2="${cx - d}" y2="${cx + d}" stroke="white" stroke-width="${h * 2}" stroke-linecap="round"/>
    </svg>`
  )}`;
}

function buildShapeSvg(pin: PinCliente, fillColor: string, size: number): string {
  const bc = altaBorderColor(pin.fechaAlta);
  const status = getPinStatus(pin);
  if (status === 'activo_exhibicion') return buildStarSvg(fillColor, bc, size);
  if (status === 'activo')            return buildDollarSvg(fillColor, bc, size);
  if (status === 'inactivo_exhibicion') return buildQuestionSvg(fillColor, bc, size);
  return buildCrossSvg(fillColor, bc, size);
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


const LEGEND_ICON_SIZE = 18;
const LEGEND_ICONS: Record<PinStatus, string> = {
  activo_exhibicion:   buildStarSvg(STATUS_COLORS.activo_exhibicion, null, LEGEND_ICON_SIZE),
  activo:              buildDollarSvg(STATUS_COLORS.activo, null, LEGEND_ICON_SIZE),
  inactivo_exhibicion: buildQuestionSvg(STATUS_COLORS.inactivo_exhibicion, null, LEGEND_ICON_SIZE),
  inactivo:            buildCrossSvg(STATUS_COLORS.inactivo, null, LEGEND_ICON_SIZE),
};

// ── Props ─────────────────────────────────────────────────────────────────────
export interface VendedorKpis {
  pdv_nuevos_7d?: number;
  pdv_activados_7d?: number;
  pdv_altas_mes?: number;
  pdv_compradores_mes?: number;
  mes?: string;
  nombre?: string;
}

interface MapaRutasProps {
  pines: PinCliente[];
  fullscreenPanel?: React.ReactNode;
  selectedPDVs?: number[];
  onTogglePDV?: (id: number) => void;
  vendedorKpis?: VendedorKpis;
  mapToolMode?: MapToolMode;
  /** @deprecated use mapToolMode !== 'explorar' */
  routeBuildEnabled?: boolean;
  onToggleRouteBuild?: () => void;
  onPolygonSelectionChange?: (pdvIds: number[], geoJson: DrawnPolygon['geoJson']) => void;
  distId?: number;
  isSuperadmin?: boolean;
  capas?: MapaCapaPlanificacion[];
  visibleCapaIds?: Set<number>;
  vendorNames?: Record<number, string>;
  onToggleCapa?: (id: number) => void;
  onToggleVendorCapas?: (ids: number[], visible: boolean) => void;
  layerPanelSlot?: React.ReactNode;
  onFinishPolygonRef?: React.MutableRefObject<(() => void) | null>;
}

// ── Google Maps API Key ───────────────────────────────────────────────────────
const GMAPS_KEY = getGoogleMapsApiKey();

const ROUTE_POLYGON_STYLE: google.maps.PolygonOptions = {
  fillColor: '#8b5cf6',
  fillOpacity: 0.18,
  strokeColor: '#8b5cf6',
  strokeWeight: 2,
  editable: false,
  clickable: false,
};

/** Distancia mínima entre puntos al dibujar arrastrando (freehand) — legacy, removido. */
const FREEHAND_SAMPLE_METERS = 10;

async function loadGmaps() {
  await loadGoogleMapsFull();
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
  selectedPDVs,
  onTogglePDV,
  vendedorKpis,
  mapToolMode = 'explorar',
  routeBuildEnabled: routeBuildEnabledProp,
  onToggleRouteBuild,
  onPolygonSelectionChange,
  distId,
  isSuperadmin,
  capas = [],
  visibleCapaIds = new Set<number>(),
  vendorNames = {},
  onToggleCapa,
  onToggleVendorCapas,
  layerPanelSlot,
  onFinishPolygonRef,
}: MapaRutasProps) {
  const routeBuildEnabled = routeBuildEnabledProp ?? mapToolMode !== 'explorar';
  const drawStrokeColor = mapToolMode === 'crear_rutas' ? '#0ea5e9' : '#8b5cf6';
  const containerRef  = useRef<HTMLDivElement>(null);
  const mapRef        = useRef<google.maps.Map | null>(null);
  const markersMapRef = useRef<Map<number, google.maps.Marker>>(new Map());
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const drawnPolyRef  = useRef<google.maps.Polygon[]>([]);
  const capaDataRef   = useRef<Map<number, google.maps.Data>>(new Map());
  const fittedRef     = useRef(false);

  const [mapLoaded,    setMapLoaded]    = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSidePanel, setShowSidePanel] = useState(true);
  const [svPos,        setSvPos]        = useState<{ lat: number; lng: number } | null>(null);
  const [noKey,        setNoKey]        = useState(false);
  const [authFailed,   setAuthFailed]   = useState(false);
  const [polygonCount, setPolygonCount] = useState(0);
  const [pinConfig, setPinConfig] = useState({ pin_size_activo: 35, pin_size_inactivo: 24 });
  const [configOpen, setConfigOpen] = useState(false);

  useEffect(() => {
    if (!distId) return;
    const token = typeof window !== 'undefined' ? localStorage.getItem('shelfy_token') || '' : '';
    const API = process.env.NEXT_PUBLIC_API_URL || '';
    fetch(`${API}/api/admin/mapa-config/${distId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setPinConfig(d); })
      .catch(() => {});
  }, [distId]);

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

  // Keep ref updated so polygon closure always has current filtered pins
  const filteredPinesRef = useRef(filteredPines);
  useEffect(() => { filteredPinesRef.current = filteredPines; }, [filteredPines]);

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

    ensureGoogleMapsConfigured();
    const unsubAuth = subscribeGoogleMapsAuthFailure(() => setAuthFailed(true));

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

    return () => {
      cancelled = true;
      unsubAuth();
    };
  }, []);

  // Respaldo si gm_authFailure no dispara: detectar overlay de error de Google
  useEffect(() => {
    if (!mapLoaded || authFailed || !containerRef.current) return;
    const el = containerRef.current;
    const check = () => {
      if (el.querySelector(".gm-err-container")) {
        setAuthFailed(true);
      }
    };
    const t1 = window.setTimeout(check, 800);
    const t2 = window.setTimeout(check, 2500);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [mapLoaded, authFailed]);

  // ── Resize on fullscreen toggle ────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    window.google?.maps?.event?.trigger(mapRef.current, 'resize');
  }, [isFullscreen]);

  // ── ResizeObserver: re-trigger resize when container dimensions change ─────
  // Handles tab switches, mapOnly mount, and window resizes that alter the container.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      if (mapRef.current) {
        window.google?.maps?.event?.trigger(mapRef.current, 'resize');
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

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
      const size        = p.activo ? pinConfig.pin_size_activo : pinConfig.pin_size_inactivo;
      const isSelected  = selSet.has(p.id);

      const pinFillColor = p.color;
      const iconUrl = isSelected
        ? buildSelectedPinSvg(pinFillColor, STATUS_COLORS[getPinStatus(p)], size)
        : buildShapeSvg(p, pinFillColor, size);

      const iconSize = isSelected ? size + 10 : size;

      const marker = new window.google.maps.Marker({
        position: { lat: p.lat, lng: p.lng },
        map,
        clickable: !routeBuildEnabled,
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
        ? `<span style="color:#475569">Sin compras registradas (padrón)</span>`
        : `<span style="color:${compraColor}">🛒 Últ. compra (padrón): ${p.ultimaCompra} · <b>hace ${diasCompra}d</b></span>`;
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

      const status      = getPinStatus(p);
      const statusColor = STATUS_COLORS[status];
      const vendorColor = p.color;
      const modeBadge = `<div style="font-size:10px;padding:3px 8px;border-radius:20px;display:inline-flex;align-items:center;gap:4px;
                    background:${statusColor}22;color:${statusColor};border:1px solid ${statusColor}44;font-weight:700;margin-bottom:8px">
             <span style="width:6px;height:6px;border-radius:50%;background:${statusColor};flex-shrink:0"></span>
             ${STATUS_LABELS[status]}
           </div>`;

      const popupHTML = `
        <div style="min-width:200px;max-width:260px;max-height:288px;overflow-y:auto;font-size:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
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

      let clickTimer: ReturnType<typeof setTimeout> | null = null;
      marker.addListener('click', () => {
        if (clickTimer) return;
        clickTimer = setTimeout(() => {
          clickTimer = null;
          if (infoWindowRef.current) {
            infoWindowRef.current.setContent(popupHTML);
            infoWindowRef.current.open(map, marker);
          }
        }, 250);
      });
      marker.addListener('dblclick', () => {
        if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
        if (onTogglePDV) onTogglePDV(p.id);
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
  }, [filteredPines, mapLoaded, onTogglePDV, pinConfig, routeBuildEnabled]);

  // ── Update selection style without recreating markers ─────────────────────
  useEffect(() => {
    if (!mapLoaded || !window.google) return;
    const selSet = new Set(selectedPDVs ?? []);
    markersMapRef.current.forEach((marker, id) => {
      const pin = filteredPines.find(p => p.id === id);
      if (!pin) return;
      const size       = pin.activo ? pinConfig.pin_size_activo : pinConfig.pin_size_inactivo;
      const isSelected = selSet.has(id);

      const iconUrl = isSelected
        ? buildSelectedPinSvg(pin.color, STATUS_COLORS[getPinStatus(pin)], size)
        : buildShapeSvg(pin, pin.color, size);
      const iconSize = isSelected ? size + 10 : size;
      marker.setIcon({
        url: iconUrl,
        scaledSize: new window.google.maps.Size(iconSize, iconSize),
        anchor: new window.google.maps.Point(iconSize / 2, iconSize / 2),
      });
      marker.setZIndex(isSelected ? 20 : (pin.activo ? 10 : 5));
    });
  }, [selectedPDVs, filteredPines, mapLoaded, pinConfig]);

  const resolvePdvIdsInPolygon = useCallback((polygon: google.maps.Polygon) => {
    const pdvIds: number[] = [];
    filteredPinesRef.current.forEach(p => {
      if (!p.lat || !p.lng) return;
      const point = new window.google.maps.LatLng(p.lat, p.lng);
      if (window.google.maps.geometry.poly.containsLocation(point, polygon)) {
        pdvIds.push(p.id);
      }
    });
    return pdvIds;
  }, []);

  const handlePolygonClosed = useCallback(
    (pdvIds: number[], geoJson: DrawnPolygon['geoJson']) => {
      onPolygonSelectionChange?.(pdvIds, geoJson);
    },
    [onPolygonSelectionChange],
  );

  const { vertexCount, polygonCount: drawPolygonCount, finishPolygon, clearAll: clearDrawPolygons } =
    useVertexPolygonDraw({
      enabled: routeBuildEnabled && mapLoaded,
      mapRef,
      mapLoaded,
      strokeColor: drawStrokeColor,
      onPolygonClosed: handlePolygonClosed,
      resolvePdvIdsInPolygon,
      onCancel: () => {
        onPolygonSelectionChange?.([], {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [] },
          properties: {},
        });
      },
    });

  useEffect(() => {
    if (onFinishPolygonRef) onFinishPolygonRef.current = finishPolygon;
  }, [finishPolygon, onFinishPolygonRef]);

  useEffect(() => {
    setPolygonCount(drawPolygonCount);
  }, [drawPolygonCount]);

  // ── Capas persistidas (google.maps.Data) ─────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !window.google?.maps?.Data) return;

    const activeIds = new Set(visibleCapaIds);
    capaDataRef.current.forEach((layer, id) => {
      if (!activeIds.has(id)) {
        layer.setMap(null);
      }
    });

    for (const capa of capas) {
      let layer = capaDataRef.current.get(capa.id);
      if (!layer) {
        layer = new window.google.maps.Data();
        capaDataRef.current.set(capa.id, layer);
        try {
          layer.addGeoJson(capa.geojson as object);
        } catch {
          /* invalid geojson */
        }
        layer.setStyle({
          fillColor: capa.color || '#8b5cf6',
          fillOpacity: 0.2,
          strokeColor: capa.color || '#8b5cf6',
          strokeWeight: 2,
          clickable: false,
        });
      }
      layer.setMap(activeIds.has(capa.id) ? map : null);
    }

    capaDataRef.current.forEach((layer, id) => {
      if (!capas.some(c => c.id === id)) {
        layer.setMap(null);
        capaDataRef.current.delete(id);
      }
    });
  }, [capas, visibleCapaIds, mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (routeBuildEnabled) {
      infoWindowRef.current?.close();
      markersMapRef.current.forEach(m => m.setClickable(false));
    } else {
      markersMapRef.current.forEach(m => m.setClickable(true));
      clearDrawPolygons();
    }
  }, [routeBuildEnabled, mapLoaded, clearDrawPolygons]);

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
    clearDrawPolygons();
    setPolygonCount(0);
    onPolygonSelectionChange?.([], { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: {} });
  }, [onPolygonSelectionChange, clearDrawPolygons]);

  // ── Print ─────────────────────────────────────────────────────────────────
  const handlePrint = () => {
    const mapContainer = containerRef.current;
    if (!mapContainer) return;

    const styleId = '__shelfy_print_style';
    let style = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }
    const containerId = mapContainer.id || '__shelfy_map_print_target';
    if (!mapContainer.id) mapContainer.id = containerId;

    style.textContent = `
      @media print {
        * { visibility: hidden !important; }
        #${containerId} {
          visibility: visible !important;
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
        }
        #${containerId} * { visibility: visible !important; }
      }
    `;
    window.print();
    style.textContent = '';
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
            <img
              src={LEGEND_ICONS[s]}
              width={LEGEND_ICON_SIZE}
              height={LEGEND_ICON_SIZE}
              style={{ flexShrink: 0, opacity: on ? 1 : 0.4 }}
              alt=""
            />
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

  if (authFailed) {
    return (
      <div style={{
        position: 'relative', height: '100%', width: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: '#f8fafc', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16,
        gap: 12, padding: '24px 32px',
      }}>
        <div style={{ fontSize: 36 }}>🗺️</div>
        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 15 }}>Google Maps: dominio no autorizado</div>
        <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center', maxWidth: 360, lineHeight: 1.6 }}>
          Tras el cambio a <strong>shelfycenter.com</strong>, hay que agregar estos referrers en Google Cloud Console
          (API key → Restricciones de aplicación → Referentes HTTP):
        </div>
        <code style={{
          background: '#f1f5f9', padding: '10px 12px', borderRadius: 8, fontSize: 11,
          color: '#334155', textAlign: 'left', maxWidth: 360, lineHeight: 1.7, wordBreak: 'break-all',
        }}>
          {googleMapsReferrerWhitelistHint()}
        </code>
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
              ✏️ Clic = vértice · doble clic o Cerrar polígono · ESC cancelar
              {vertexCount > 0 ? ` · ${vertexCount} pts` : ''}
            </span>
            {vertexCount >= 3 && (
              <button
                onClick={finishPolygon}
                style={{
                  background: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.35)',
                  borderRadius: 6, color: 'white', fontSize: 10, fontWeight: 700,
                  padding: '3px 8px', cursor: 'pointer',
                }}
              >
                Cerrar polígono
              </button>
            )}
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

      {/* Fullscreen Armar Ruta toggle */}
      {isFullscreen && onToggleRouteBuild && (
        <div style={{
          position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
          zIndex: 31, display: 'flex', gap: 6,
          background: 'rgba(15,23,42,0.78)', backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: 4,
          boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        }}>
          <button
            onClick={onToggleRouteBuild}
            style={{
              border: 'none',
              borderRadius: 8,
              padding: '6px 10px',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              color: routeBuildEnabled ? '#0f172a' : '#cbd5e1',
              background: routeBuildEnabled ? '#8b5cf6' : 'transparent',
            }}
          >
            Dibujar Zona
          </button>
        </div>
      )}

      {/* Layer panel + custom slot */}
      {(layerPanelSlot || (capas.length > 0 && onToggleCapa)) && (
        <div style={{
          position: 'absolute', bottom: 12, left: panelOffset + 12, zIndex: 30,
          width: 280, maxHeight: 280, overflow: 'hidden',
          background: 'rgba(15,23,42,0.88)', backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12,
        }}>
          {layerPanelSlot ?? (
            onToggleCapa && onToggleVendorCapas ? (
              <SupervisionMapLayerPanel
                capas={capas}
                vendorNames={vendorNames}
                visibleCapaIds={visibleCapaIds}
                onToggleCapa={onToggleCapa}
                onToggleVendorCapas={onToggleVendorCapas}
              />
            ) : null
          )}
        </div>
      )}

      {/* Top-right controls */}
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

      {/* Filter legend */}
      <div style={{
        position: 'absolute', bottom: 52, left: panelOffset + 12,
        zIndex: 30, transition: 'left 0.2s ease',
      }}>
        <FilterLegend />
      </div>

      {/* MapLegendTooltip */}
      <div style={{ position: 'absolute', bottom: 16, left: panelOffset + 12, zIndex: 30 }}>
        <MapLegendTooltip />
      </div>

      {/* Superadmin: config panel */}
      {isSuperadmin && (
        <>
          <button
            onClick={() => setConfigOpen(v => !v)}
            className="absolute bottom-16 right-3 z-30 bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] rounded-lg p-2 shadow-md hover:bg-white/10 transition"
            title="Configuración del mapa"
          >
            <Settings className="w-4 h-4 text-[var(--shelfy-muted)]" />
          </button>

          {configOpen && (
            <div className="absolute bottom-28 right-3 z-40 bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] rounded-xl shadow-xl p-4 w-60">
              <p className="text-xs font-bold text-[var(--shelfy-text)] mb-3">Config del mapa</p>

              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide">Pin activo: {pinConfig.pin_size_activo}px</label>
                  <input type="range" min={16} max={52} value={pinConfig.pin_size_activo}
                    onChange={e => setPinConfig(p => ({ ...p, pin_size_activo: +e.target.value }))}
                    className="w-full mt-1" />
                </div>
                <div>
                  <label className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide">Pin inactivo: {pinConfig.pin_size_inactivo}px</label>
                  <input type="range" min={12} max={40} value={pinConfig.pin_size_inactivo}
                    onChange={e => setPinConfig(p => ({ ...p, pin_size_inactivo: +e.target.value }))}
                    className="w-full mt-1" />
                </div>
                <button
                  onClick={() => {
                    const token = localStorage.getItem('shelfy_token') || '';
                    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/mapa-config/${distId}`, {
                      method: 'PATCH',
                      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                      body: JSON.stringify(pinConfig),
                    }).then(r => r.ok && setConfigOpen(false));
                  }}
                  className="mt-1 w-full py-1.5 text-xs bg-[var(--shelfy-accent)] text-white rounded-lg font-semibold hover:opacity-90 transition"
                >
                  Guardar para todos
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* PDV count badge */}
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

      {/* Vendedor KPI badges */}
      {vendedorKpis && ((vendedorKpis.pdv_compradores_mes ?? 0) > 0 || (vendedorKpis.pdv_altas_mes ?? 0) > 0) && (
        <div style={{
          position: 'absolute', top: 42,
          left: (isFullscreen && fullscreenPanel)
            ? (showSidePanel ? 403 : 105)
            : (panelOffset + 10),
          zIndex: 30,
          display: 'flex', gap: 5, transition: 'left 0.3s ease',
        }}>
          {(vendedorKpis.pdv_altas_mes ?? 0) > 0 && (
            <div style={{
              background: 'rgba(16,185,129,0.18)', backdropFilter: 'blur(8px)',
              border: '1px solid rgba(16,185,129,0.35)',
              color: '#34d399', fontSize: 10, fontWeight: 700,
              padding: '3px 8px', borderRadius: 6,
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
              pointerEvents: 'none',
            }}>
              +{vendedorKpis.pdv_altas_mes} altas {vendedorKpis.mes?.slice(5) ?? ""}
            </div>
          )}
          {(vendedorKpis.pdv_compradores_mes ?? 0) > 0 && (
            <div style={{
              background: 'rgba(139,92,246,0.18)', backdropFilter: 'blur(8px)',
              border: '1px solid rgba(139,92,246,0.35)',
              color: '#a78bfa', fontSize: 10, fontWeight: 700,
              padding: '3px 8px', borderRadius: 6,
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
              pointerEvents: 'none',
            }}>
              {vendedorKpis.pdv_compradores_mes} compr. {vendedorKpis.mes?.slice(5) ?? ""}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
