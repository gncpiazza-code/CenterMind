"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Map as MapCanvas } from "@/components/ui/map";
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
  transition: box-shadow 0.15s ease;
}
.shelfy-pin:hover {
  box-shadow: 0 0 0 3px rgba(255,255,255,0.9), 0 0 12px rgba(0,0,0,0.35) !important;
}
@keyframes slideIn {
  from { transform: translateX(-100%); opacity: 0; }
  to   { transform: translateX(0); opacity: 1; }
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
  /** PDV id → marker wrapper (actualizar selección sin recrear marcadores = evita popup fantasma) */
  const pinWrapRef    = useRef<Map<number, HTMLDivElement>>(new Map());
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

  // Al cambiar la selección de vendedor/rutas, volver a mostrar todos los estados.
  // Evita la falsa percepción de "solo veo activos" por filtros previos del legend.
  useEffect(() => {
    setFilterEnabled({
      activo_exhibicion: true,
      activo: true,
      inactivo_exhibicion: true,
      inactivo: true,
    });
  }, [pines]);

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

    const addMarkers = () => {
      // Limpiar anteriores
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      pinWrapRef.current.clear();

      const conCoords = filteredPines.filter(p => p.lat && p.lng);

      conCoords.forEach(p => {
        const status      = getPinStatus(p);
        const statusColor = STATUS_COLORS[status];
        const vendorColor = p.color;
        const hasCount = p.totalExhibiciones && p.totalExhibiciones > 0;
        const size        = p.activo ? 18 : 14;

        const wrapper = document.createElement("div");
        wrapper.className = "shelfy-pin";
        wrapper.style.cssText = `
          --ac: ${statusColor};
          width:${size}px;
          height:${size}px;
          background:${vendorColor};
          border:2.5px solid ${statusColor};
          box-sizing:border-box;
          opacity:${p.activo ? 1 : 0.75};
          display:flex;
          align-items:center;
          justify-content:center;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
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
        const compraColor = p.activo ? "#86efac" : "#fca5a5";
        const compraLabel = diasCompra === null
          ? `<span style="color:#475569">Sin compras registradas</span>`
          : `<span style="color:${compraColor}">🛒 Últ. compra: ${p.ultimaCompra} · <b>hace ${diasCompra}d</b></span>`;

        let exhibLine = "";
        if (p.fechaUltimaExhibicion) {
          const exhDateStr = p.fechaUltimaExhibicion.split("T")[0];
          exhibLine = `
            <div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.07)">
              <span style="color:#fbbf24;font-size:11px">
                📸 Exhibición: ${exhDateStr}${diasExhib !== null ? ` · <b>hace ${diasExhib}d</b>` : ""}
              </span>
            </div>`;
        }

        const deudaLine = p.deuda != null && p.deuda > 0
          ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.07)">
               <span style="color:#fb923c;font-size:11px;font-weight:700">
                 💰 Deuda: $${p.deuda.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
               </span>
               ${p.antiguedadDias != null ? `<span style="color:#64748b;font-size:10px"> · ${p.antiguedadDias}d antigüedad</span>` : ""}
             </div>`
          : "";

        const photoBlock = p.urlExhibicion
          ? `<div style="margin-top:8px;border-radius:6px;overflow:hidden"><img src="${p.urlExhibicion}" style="width:100%;max-height:90px;object-fit:cover;display:block" loading="lazy" /></div>`
          : "";

        const popupHTML = `
          <div style="min-width:200px;max-width:260px;font-size:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                      background:#1e293b;color:#e2e8f0;padding:12px 14px;border-radius:10px;
                      box-shadow:0 8px 30px rgba(0,0,0,0.45);line-height:1.5;position:relative;border:1px solid rgba(255,255,255,0.08)">
            <button onclick="this.closest('.maplibregl-popup').querySelector('.maplibregl-popup-close-button').click()"
              style="position:absolute;top:8px;right:8px;background:rgba(255,255,255,0.08);border:none;cursor:pointer;
                     color:#94a3b8;font-size:13px;line-height:1;padding:3px 5px;border-radius:5px;transition:background 0.1s"
              onmouseover="this.style.background='rgba(255,255,255,0.16)'" onmouseout="this.style.background='rgba(255,255,255,0.08)'"
              title="Cerrar">✕</button>
            ${p.idClienteErp ? `<div style="font-size:9px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">Cliente ${p.idClienteErp}</div>` : ""}
            <b style="display:block;font-size:14px;color:#f8fafc;margin-bottom:6px;padding-right:24px;line-height:1.3">${p.nombre}</b>

            <div style="display:flex;align-items:center;gap:6px;margin:6px 0">
              <span style="width:9px;height:9px;border-radius:50%;background:${vendorColor};flex-shrink:0;border:1px solid rgba(255,255,255,0.2)"></span>
              <span style="font-size:11px;font-weight:600;color:#94a3b8">${p.vendedor}</span>
            </div>

            <div style="font-size:10px;padding:3px 8px;border-radius:20px;display:inline-flex;align-items:center;gap:4px;
                        background:${statusColor}22;color:${statusColor};
                        border:1px solid ${statusColor}44;font-weight:700;margin-bottom:8px">
              <span style="width:6px;height:6px;border-radius:50%;background:${statusColor};flex-shrink:0"></span>
              ${STATUS_LABELS[status]}
            </div>

            <div style="font-size:11px;color:${p.activo ? '#86efac' : '#fca5a5'}">${compraLabel}</div>
            ${exhibLine}
            ${deudaLine}
            ${photoBlock}
          </div>`;

        const popup = new maplibregl.Popup({ offset: 12, closeButton: true, closeOnClick: true })
          .setHTML(popupHTML);

        // Auto-close timer for click-opened popups
        let autoCloseTimer: ReturnType<typeof setTimeout>;

        // Click: selection toggle + open popup with auto-close after 2000ms
        wrapper.addEventListener('click', (e) => {
          e.stopPropagation();
          if (onTogglePDV) onTogglePDV(p.id);
          popup.setHTML(popupHTML).setLngLat([p.lng, p.lat]).addTo(map);
          clearTimeout(autoCloseTimer);
          autoCloseTimer = setTimeout(() => { popup.remove(); }, 2000);
        });

        // Hover: show popup immediately (photo already included in popupHTML)
        wrapper.addEventListener('mouseenter', () => {
          popup.setHTML(popupHTML).setLngLat([p.lng, p.lat]).addTo(map);
        });
        wrapper.addEventListener('mouseleave', () => {
          clearTimeout(autoCloseTimer);
          popup.remove();
        });

        const marker = new maplibregl.Marker({ element: wrapper, anchor: "center" })
          .setLngLat([p.lng, p.lat])
          .addTo(map);
        markersRef.current.push(marker);
        pinWrapRef.current.set(p.id, wrapper);
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
  }, [filteredPines, mapLoaded, mode, deudoresData, onTogglePDV]);

  // Selección de objetivos: solo actualiza sombra (no recrea markers → no re-dispara mouseenter del pin)
  useEffect(() => {
    const sel = new Set(selectedPDVs ?? []);
    pinWrapRef.current.forEach((wrapper, id) => {
      const on = sel.has(id);
      wrapper.style.boxShadow = on
        ? "0 0 0 3px white, 0 1px 3px rgba(0,0,0,0.3)"
        : "0 1px 3px rgba(0,0,0,0.3)";
    });
  }, [selectedPDVs, filteredPines]);

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
      padding: "8px 10px",
      background: "rgba(15,23,42,0.82)",
      backdropFilter: "blur(10px)",
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.10)",
      boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
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
              padding: "4px 9px", borderRadius: 7,
              border: `1px solid ${on ? color + "88" : "rgba(255,255,255,0.08)"}`,
              background: on ? color + "28" : "rgba(255,255,255,0.05)",
              color: on ? color : "rgba(255,255,255,0.75)",
              cursor: "pointer", fontSize: 11, fontWeight: 600,
              transition: "all 0.15s", opacity: count === 0 ? 0.35 : 1,
            }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: on ? color : "rgba(255,255,255,0.5)", flexShrink: 0 }} />
            <span style={{ maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {STATUS_LABELS[s]}
            </span>
            <span style={{
              background: on ? color + "33" : "rgba(255,255,255,0.12)",
              color: on ? color : "rgba(255,255,255,0.7)",
              borderRadius: 4, padding: "0 5px", fontSize: 10, minWidth: 18, textAlign: "center", fontWeight: 700,
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
          background: "rgba(10,14,24,0.97)",
          backdropFilter: "blur(16px)",
          borderRight: "1px solid rgba(255,255,255,0.07)",
          overflowY: "auto",
          boxShadow: "4px 0 24px rgba(0,0,0,0.4)",
          animation: "slideIn 0.25s ease-out",
        }}>
          {fullscreenPanel}
        </div>
      )}

      {/* Map area */}
      <div style={{ flex: 1, position: "relative", marginLeft: panelOffset }}>
        <MapCanvas
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
          display: "flex", gap: 5, zIndex: 30,
        }}>
          <button onClick={() => setIsFullscreen(f => !f)}
            title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
            style={{
              background: "rgba(15,23,42,0.75)", backdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8, color: "#e2e8f0", padding: "7px 9px",
              cursor: "pointer", fontSize: 14, lineHeight: 1,
              boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
              transition: "background 0.15s",
            }}
            onMouseOver={e => (e.currentTarget.style.background = "rgba(15,23,42,0.92)")}
            onMouseOut={e => (e.currentTarget.style.background = "rgba(15,23,42,0.75)")}
          >{isFullscreen ? "✕ Salir" : "⛶"}</button>
          <button onClick={handlePrint} title="Imprimir mapa A4 horizontal"
            style={{
              background: "rgba(15,23,42,0.75)", backdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8, color: "#e2e8f0", padding: "7px 9px",
              cursor: "pointer", fontSize: 14, lineHeight: 1,
              boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
              transition: "background 0.15s",
            }}
            onMouseOver={e => (e.currentTarget.style.background = "rgba(15,23,42,0.92)")}
            onMouseOut={e => (e.currentTarget.style.background = "rgba(15,23,42,0.75)")}
          >🖨️</button>
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
          background: "rgba(15,23,42,0.75)", backdropFilter: "blur(8px)",
          color: "#e2e8f0", fontSize: 11, fontWeight: 700,
          padding: "5px 11px", borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
          pointerEvents: "none", transition: "left 0.3s ease",
        }}>
          {filteredPines.length.toLocaleString()} <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 400 }}>PDVs visibles</span>
        </div>
      )}
    </div>
  );
}
