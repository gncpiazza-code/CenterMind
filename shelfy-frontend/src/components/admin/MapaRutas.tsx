"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Map } from "@/components/ui/map";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export interface PinCliente {
  id: number;
  lat: number;
  lng: number;
  nombre: string;
  color: string;
  activo: boolean;
  vendedor: string;
  ultimaCompra: string | null;        // formateada (legible)
  conExhibicion: boolean;
  // Datos enriquecidos para el popup
  idClienteErp?: string | null;
  nroRuta?: string | null;
  fechaUltimaCompra?: string | null;  // ISO crudo para calcular días
  fechaUltimaExhibicion?: string | null;
  urlExhibicion?: string | null;      // url_foto_drive
  // Deuda cruzada desde cc_detalle (opcional, se enriquece en TabSupervision)
  deuda?: number | null;
  antiguedadDias?: number | null;
  totalExhibiciones?: number;
  // Vendor FK for objective creation
  id_vendedor?: number;
}

export interface DeudorInfo {
  id_cliente_erp: string | null;
  cliente_nombre: string;
  deuda_total: number;
  antiguedad_dias: number;
  vendedor_nombre: string;
}

// Debt status thresholds
// verde: antiguedad_dias <= 30
// naranja: 31-60
// rojo: > 60
function debtBorderColor(antiguedad: number): string {
  if (antiguedad <= 30) return '#22c55e';   // green-500
  if (antiguedad <= 60) return '#f97316';   // orange-500
  return '#ef4444';                          // red-500
}

// ── Status helpers ────────────────────────────────────────────────────────────
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

const SHELFY_PIN_CSS = `
.shelfy-pin {
  border-radius: 50%;
  pointer-events: auto;
  cursor: pointer;
  /* NO transition: transform — having it here promotes the element to a separate
     GPU compositing layer. During MapLibre pan/zoom (which positions markers via
     transform on the parent .maplibregl-marker), that separate layer composites
     independently from the WebGL canvas, causing 1-frame drift ("dancing pins"). */
  transition: box-shadow 0.15s ease;
}
.shelfy-pin:hover {
  box-shadow: 0 0 0 3px rgba(255,255,255,0.75), 0 0 10px rgba(0,0,0,0.35) !important;
}
`;

function injectShelfyPinCSS() {
  if (typeof document === "undefined") return;
  if (document.getElementById("shelfy-pin-css")) return;
  const el = document.createElement("style");
  el.id = "shelfy-pin-css";
  el.textContent = SHELFY_PIN_CSS;
  document.head.appendChild(el);
}

interface MapaRutasProps {
  pines: PinCliente[];
  fullscreenPanel?: React.ReactNode;
  shelfyMapsMode?: boolean;
  mode?: 'activos' | 'deudores';
  deudoresData?: DeudorInfo[];
  selectedPDVs?: number[];
  onTogglePDV?: (id: number) => void;
}

export default function MapaRutas({ pines, fullscreenPanel, shelfyMapsMode, mode = 'activos', deudoresData, selectedPDVs, onTogglePDV }: MapaRutasProps) {
  const mapRef        = useRef<any>(null);
  const markersRef    = useRef<any[]>([]);
  const fittedRef     = useRef(false); // fitBounds sólo en la primera carga con datos
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);

  // ── Filter toggles ─────────────────────────────────────────────────────────
  const [filterEnabled, setFilterEnabled] = useState<Record<PinStatus, boolean>>({
    activo_exhibicion: true,
    activo:            true,
    inactivo_exhibicion: true,
    inactivo:          true,
  });

  const toggleFilter = (status: PinStatus) =>
    setFilterEnabled(prev => ({ ...prev, [status]: !prev[status] }));

  const statusCounts = useMemo(() =>
    (["activo_exhibicion", "activo", "inactivo_exhibicion", "inactivo"] as PinStatus[]).reduce(
      (acc, s) => ({ ...acc, [s]: pines.filter(p => getPinStatus(p) === s).length }),
      {} as Record<PinStatus, number>
    ),
    [pines]
  );

  // Memoize so the array reference is stable between renders.
  // Without this, every parent re-render creates a new array reference,
  // triggering the marker useEffect and destroying/recreating all markers.
  const filteredPines = useMemo(
    () => pines.filter(p => filterEnabled[getPinStatus(p)]),
    [pines, filterEnabled]
  );

  // Resetear fitBounds cuando cambia el set de pines (nuevo vendedor/ruta seleccionado)
  const prevPineIdsRef = useRef<string>("");
  const currentPineIds = pines.map(p => p.id).sort().join(",");
  if (currentPineIds !== prevPineIdsRef.current) {
    prevPineIdsRef.current = currentPineIds;
    fittedRef.current = false;
  }

  useEffect(() => {
    injectShelfyPinCSS();
  }, []);

  // ── Markers ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const selSet = new Set(selectedPDVs ?? []);

    const addMarkers = () => {
      // Limpiar anteriores
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      const conCoords = filteredPines.filter(p => p.lat && p.lng);

      conCoords.forEach(p => {
        const status      = getPinStatus(p);
        const statusColor = STATUS_COLORS[status];
        const vendorColor = p.color;
        const hasCount = p.totalExhibiciones && p.totalExhibiciones > 0;
        const isSelected  = selSet.has(p.id);
        const size        = p.activo ? 18 : 14;

        const wrapper = document.createElement("div");
        wrapper.className = "shelfy-pin";
        wrapper.style.cssText = `
          width:${size}px;
          height:${size}px;
          background:${vendorColor};
          border:2px solid ${statusColor};
          box-sizing:border-box;
          opacity:${p.activo ? 1 : 0.8};
          display:flex;
          align-items:center;
          justify-content:center;
          box-shadow: ${isSelected ? `0 0 0 3px white, 0 1px 3px rgba(0,0,0,0.3)` : `0 1px 3px rgba(0,0,0,0.3)`};
          cursor: ${onTogglePDV ? 'pointer' : 'default'};
        `;
        wrapper.innerHTML = hasCount
          ? `<span style="font-size:10px;font-weight:900;color:#fff;line-height:1;text-shadow:0 0 2px #000">${p.totalExhibiciones}</span>`
          : '';

        // ── Modo deudores: aplicar outline por estado de deuda ─────────────
        if (mode === 'deudores' && deudoresData) {
          const deudor = deudoresData.find(d =>
            d.id_cliente_erp && p.idClienteErp &&
            d.id_cliente_erp === p.idClienteErp
          );
          if (deudor) {
            const borderColor = debtBorderColor(deudor.antiguedad_dias);
            wrapper.style.outline = `3px solid ${borderColor}`;
            wrapper.style.outlineOffset = '2px';
          }
        }

        // ── Popup Content ──────────────────────────────────────────────────
        const diasDesde = (iso: string | null | undefined): number | null => {
          if (!iso) return null;
          const ms = Date.now() - new Date(iso).getTime();
          return Math.floor(ms / 86_400_000);
        };

        const diasCompra = diasDesde(p.fechaUltimaCompra);
        const diasExhib  = diasDesde(p.fechaUltimaExhibicion);
        const compraColor = p.activo ? "#16a34a" : "#dc2626";
        const compraLabel = diasCompra === null
          ? `<span style="color:#94a3b8">Sin compras registradas</span>`
          : `<span style="color:${compraColor}">Últ. compra: ${p.ultimaCompra} · <b>hace ${diasCompra}d</b></span>`;

        let exhibLine = "";
        if (p.fechaUltimaExhibicion) {
          const exhDateStr = p.fechaUltimaExhibicion.split("T")[0];
          exhibLine = `
            <div style="margin-top:5px;padding-top:5px;border-top:1px solid #f1f5f9">
              <span style="color:#d97706;font-size:11px">
                ● Exhibición: ${exhDateStr} · <b>hace ${diasExhib}d</b>
              </span>
            </div>`;
        }

        const popupHTML = `
          <div style="min-width:180px;max-width:240px;font-size:12px;font-family:sans-serif;
                      background:#fff;color:#1e293b;padding:10px 12px;border-radius:8px;
                      box-shadow:0 4px 20px #0003;line-height:1.4;position:relative">
            <button onclick="this.closest('.maplibregl-popup').querySelector('.maplibregl-popup-close-button').click()"
              style="position:absolute;top:6px;right:6px;background:none;border:none;cursor:pointer;
                     color:#94a3b8;font-size:14px;line-height:1;padding:2px 4px;border-radius:4px"
              title="Cerrar">✕</button>
            ${p.idClienteErp ? `<div style="font-size:9px;font-weight:800;color:#94a3b8;text-transform:uppercase;margin-bottom:2px">Nº CLIENTE: ${p.idClienteErp}</div>` : ""}
            <b style="display:block;font-size:13px;color:#0f172a;margin-bottom:4px;padding-right:20px">${p.nombre}</b>

            <div style="display:flex;align-items:center;gap:6px;margin:6px 0">
              <span style="width:8px;height:8px;border-radius:50%;background:${vendorColor};flex-shrink:0"></span>
              <span style="font-size:11px;font-weight:600;color:#475569">${p.vendedor}</span>
            </div>

            <div style="font-size:10px;padding:3px 8px;border-radius:5px;display:inline-block;
                        background:${statusColor}15;color:${statusColor};
                        border:1px solid ${statusColor}40;font-weight:700;margin-bottom:6px">
              ${STATUS_LABELS[status]}
            </div>

            <div style="font-size:11px">${compraLabel}</div>
            ${exhibLine}
          </div>`;

        const popup = new maplibregl.Popup({ offset: 12, closeButton: true, closeOnClick: true })
          .setHTML(popupHTML);

        // Click: selection toggle
        if (onTogglePDV) {
          wrapper.addEventListener('click', (e) => {
            e.stopPropagation();
            onTogglePDV(p.id);
          });
        }

        // Hover event listeners
        wrapper.addEventListener('mouseenter', () => {
          popup.setLngLat([p.lng, p.lat]).addTo(map);
        });
        wrapper.addEventListener('mouseleave', () => {
          popup.remove();
        });

        const marker = new maplibregl.Marker({ element: wrapper, anchor: "center" })
          .setLngLat([p.lng, p.lat])
          .addTo(map);
        markersRef.current.push(marker);
      });

      if (conCoords.length > 0 && !fittedRef.current) {
        fittedRef.current = true;
        const lngs = conCoords.map(p => p.lng);
        const lats = conCoords.map(p => p.lat);
        map.fitBounds(
          [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
          { padding: 60, maxZoom: 14, animate: false }
        );
      }
    };

    addMarkers();
  }, [filteredPines, mapLoaded, mode, deudoresData, selectedPDVs, onTogglePDV]);

  // ESC to exit fullscreen
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && isFullscreen) setIsFullscreen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isFullscreen]);

  const handlePrint = () => {
    const map = mapRef.current;
    if (!map) return;
    const canvas = map.getCanvas();
    const dataUrl = canvas.toDataURL('image/png');
    const visiblePins = filteredPines;
    const legend = visiblePins.map(p =>
      `<tr><td style="padding:4px 8px;border:1px solid #ccc;">${p.nombre}</td><td style="padding:4px 8px;border:1px solid #ccc;">${p.vendedor}</td></tr>`
    ).join('');
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Mapa de Rutas</title>
    <style>body{margin:0;font-family:sans-serif;} img{max-width:100%;} table{border-collapse:collapse;width:100%;margin-top:16px;} @media print{@page{margin:1cm;}}</style>
    </head><body>
    <h2 style="font-size:16px;margin:8px 0;">Mapa de Rutas — PDVs visibles</h2>
    <img src="${dataUrl}" style="width:100%;border:1px solid #eee;" />
    <table><thead><tr><th style="padding:4px 8px;border:1px solid #ccc;text-align:left;">PDV</th><th style="padding:4px 8px;border:1px solid #ccc;text-align:left;">Vendedor</th></tr></thead>
    <tbody>${legend}</tbody></table>
    <script>window.onload=function(){window.print();}<\/script>
    </body></html>`);
    win.document.close();
  };

  const STATUS_ORDER: PinStatus[] = ["activo_exhibicion", "activo", "inactivo_exhibicion", "inactivo"];

  const FilterLegend = () => (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: 5,
      padding: "7px 9px",
      background: "rgba(255,255,255,0.92)",
      backdropFilter: "blur(8px)",
      borderRadius: 10,
      border: "1px solid #e2e8f0",
      boxShadow: "0 2px 8px #0001",
    }}>
      {STATUS_ORDER.map(s => {
        const on    = filterEnabled[s];
        const count = statusCounts[s];
        const color = STATUS_COLORS[s];
        return (
          <button key={s} onClick={() => toggleFilter(s)}
            title={on ? `Ocultar: ${STATUS_LABELS[s]}` : `Mostrar: ${STATUS_LABELS[s]}`}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "3px 8px", borderRadius: 6,
              border: `1px solid ${on ? color + "66" : "#e2e8f0"}`,
              background: on ? color + "12" : "#f8fafc",
              color: on ? color : "#94a3b8",
              cursor: "pointer", fontSize: 11, fontWeight: 600,
              transition: "all 0.15s", opacity: count === 0 ? 0.4 : 1,
            }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: on ? color : "#cbd5e1", flexShrink: 0 }} />
            <span style={{ maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {STATUS_LABELS[s]}
            </span>
            <span style={{
              background: on ? color + "22" : "#f1f5f9", color: on ? color : "#94a3b8",
              borderRadius: 4, padding: "0 4px", fontSize: 10, minWidth: 18, textAlign: "center",
            }}>{count}</span>
          </button>
        );
      })}
    </div>
  );

  const panelOffset = isFullscreen && fullscreenPanel ? 300 : 0;

  return (
    <div
      style={{
        position: isFullscreen ? "fixed" : "relative",
        inset:    isFullscreen ? 0 : undefined,
        zIndex:   isFullscreen ? 9999 : undefined,
        height:   isFullscreen ? "100vh" : "100%",
        width:    isFullscreen ? "100vw" : "100%",
        borderRadius: isFullscreen ? 0 : 16,
        overflow: "hidden",
        background: "#f8fafc",
        display:  "flex",
      }}
      className="shelfy-print-mapa"
    >
      {/* Vendor panel overlay (fullscreen only) */}
      {isFullscreen && fullscreenPanel && (
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0, width: 300,
          zIndex: 20, display: "flex", flexDirection: "column",
          background: "rgba(10,14,24,0.96)",
          backdropFilter: "blur(12px)",
          borderRight: "1px solid rgba(255,255,255,0.08)",
          overflowY: "auto",
        }}>
          {fullscreenPanel}
        </div>
      )}

      {/* Map area */}
      <div style={{ flex: 1, position: "relative", marginLeft: panelOffset }}>
        <Map
          ref={mapRef}
          theme="light"
          onLoad={() => setMapLoaded(true)}
          center={[-63.0, -34.0]}
          zoom={5}
        />
      </div>

      {/* Top-right controls */}
      {!shelfyMapsMode && (
        <div className="shelfy-map-controls" style={{
          position: "absolute", top: 10, right: 10,
          display: "flex", gap: 6, zIndex: 30,
        }}>
          <button onClick={() => setIsFullscreen(f => !f)}
            title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
            style={{
              background: "rgba(255,255,255,0.92)", border: "1px solid #e2e8f0",
              borderRadius: 6, color: "#334155", padding: "6px 8px",
              cursor: "pointer", fontSize: 14, lineHeight: 1,
              boxShadow: "0 1px 4px #0001",
            }}>{isFullscreen ? "⊠" : "⛶"}</button>
          <button onClick={handlePrint} title="Imprimir mapa A4 horizontal"
            style={{
              background: "rgba(255,255,255,0.92)", border: "1px solid #e2e8f0",
              borderRadius: 6, color: "#334155", padding: "6px 8px",
              cursor: "pointer", fontSize: 14, lineHeight: 1,
              boxShadow: "0 1px 4px #0001",
            }}>🖨️</button>
        </div>
      )}

      {/* Filter legend (modo activos) */}
      {!shelfyMapsMode && mode !== 'deudores' && (
        <div style={{
          position: "absolute", bottom: 40, left: panelOffset + 12,
          zIndex: 30, transition: "left 0.2s ease",
        }}>
          <FilterLegend />
        </div>
      )}

      {/* Debt legend (modo deudores) */}
      {mode === 'deudores' && (
        <div className="absolute bottom-4 left-4 z-10 bg-black/70 backdrop-blur-sm rounded-lg p-3 text-xs space-y-1.5">
          <div className="text-white/50 font-medium mb-1">Estado de deuda</div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-white/70">≤ 30 días</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-orange-500" />
            <span className="text-white/70">31 – 60 días</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-white/70">{'> 60 días'}</span>
          </div>
        </div>
      )}

      {/* PDV count badge */}
      {!shelfyMapsMode && (
        <div style={{
          position: "absolute", top: 10, left: panelOffset + 10,
          zIndex: 30,
          background: "rgba(255,255,255,0.92)", backdropFilter: "blur(4px)",
          color: "#334155", fontSize: 11, fontWeight: 700,
          padding: "4px 10px", borderRadius: 8,
          border: "1px solid #e2e8f0",
          boxShadow: "0 1px 4px #0001",
          pointerEvents: "none", transition: "left 0.2s ease",
        }}>
          {filteredPines.length.toLocaleString()} PDV visibles
        </div>
      )}
    </div>
  );
}
