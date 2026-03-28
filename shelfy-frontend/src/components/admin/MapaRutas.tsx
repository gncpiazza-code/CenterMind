"use client";
import { useEffect, useRef, useState } from "react";
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
  ultimaCompra: string | null;
  conExhibicion: boolean;
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

// Carto Positron (light, calles y nombres, free)
const LIGHT_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

// CSS de animación de aura — se inyecta una sola vez
const PULSE_CSS = `
@keyframes shelfy-aura {
  0%   { transform: scale(1);   opacity: 0.7; }
  70%  { transform: scale(2.4); opacity: 0;   }
  100% { transform: scale(2.4); opacity: 0;   }
}
.shelfy-pin-aura {
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  animation: shelfy-aura 2s ease-out infinite;
  pointer-events: none;
}
`;

function injectPulseCSS() {
  if (typeof document === "undefined") return;
  if (document.getElementById("shelfy-pulse-css")) return;
  const el = document.createElement("style");
  el.id = "shelfy-pulse-css";
  el.textContent = PULSE_CSS;
  document.head.appendChild(el);
}

interface MapaRutasProps {
  pines: PinCliente[];
  fullscreenPanel?: React.ReactNode;
}

export default function MapaRutas({ pines, fullscreenPanel }: MapaRutasProps) {
  const mapContainer  = useRef<HTMLDivElement>(null);
  const mapRef        = useRef<maplibregl.Map | null>(null);
  const markersRef    = useRef<maplibregl.Marker[]>([]);
  const fittedRef     = useRef(false); // fitBounds sólo en la primera carga con datos
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ── Filter toggles ─────────────────────────────────────────────────────────
  const [filterEnabled, setFilterEnabled] = useState<Record<PinStatus, boolean>>({
    activo_exhibicion: true,
    activo:            true,
    inactivo_exhibicion: true,
    inactivo:          true,
  });

  const toggleFilter = (status: PinStatus) =>
    setFilterEnabled(prev => ({ ...prev, [status]: !prev[status] }));

  const statusCounts = (["activo_exhibicion", "activo", "inactivo_exhibicion", "inactivo"] as PinStatus[]).reduce(
    (acc, s) => ({ ...acc, [s]: pines.filter(p => getPinStatus(p) === s).length }),
    {} as Record<PinStatus, number>
  );

  const filteredPines = pines.filter(p => filterEnabled[getPinStatus(p)]);

  // Resetear fitBounds cuando cambia el set de pines (nuevo vendedor/ruta seleccionado)
  // pero NO cuando sólo cambian los filtros de status
  const prevPineIdsRef = useRef<string>("");
  const currentPineIds = pines.map(p => p.id).sort().join(",");
  if (currentPineIds !== prevPineIdsRef.current) {
    prevPineIdsRef.current = currentPineIds;
    fittedRef.current = false;
  }

  // ── Init map ───────────────────────────────────────────────────────────────
  useEffect(() => {
    injectPulseCSS();
    if (!mapContainer.current) return;
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style:     LIGHT_STYLE,
      center:    [-63.0, -34.0],
      zoom:      5,
      pitch:     0,
      bearing:   0,
    });
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    mapRef.current = map;

    // ResizeObserver: llama map.resize() cada vez que el contenedor cambia de tamaño.
    // Esto evita que los markers queden desincronizados con el canvas cuando el layout
    // cambia (flex, fullscreen, panel lateral, etc.)
    const ro = new ResizeObserver(() => { map.resize(); });
    if (mapContainer.current) ro.observe(mapContainer.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ── Markers ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const addMarkers = () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      const conCoords = filteredPines.filter(p => p.lat && p.lng);

      conCoords.forEach(p => {
        const status      = getPinStatus(p);
        const auraColor   = STATUS_COLORS[status];
        const vendorColor = p.color;
        const size        = p.activo ? 12 : 8;

        // Wrapper: relative so aura is positioned relative to dot
        const wrapper = document.createElement("div");
        wrapper.style.cssText = `
          position:relative;
          width:${size}px;
          height:${size}px;
          cursor:pointer;
        `;

        // Aura ring (pulsing, status color)
        const aura = document.createElement("div");
        aura.className = "shelfy-pin-aura";
        aura.style.background = auraColor + "66";
        // Stagger animation per pin to avoid all pulsing at once
        aura.style.animationDelay = `${(p.id % 20) * 0.1}s`;
        wrapper.appendChild(aura);

        // Dot (vendor color)
        const dot = document.createElement("div");
        dot.style.cssText = `
          position:absolute;
          inset:0;
          border-radius:50%;
          background:${vendorColor};
          border:2px solid ${auraColor};
          box-sizing:border-box;
          opacity:${p.activo ? 0.95 : 0.65};
        `;
        wrapper.appendChild(dot);

        // Popup
        const ultimaCompraLine = p.ultimaCompra
          ? `<div style="font-size:11px;color:#64748b;margin-top:3px">Últ. compra: ${p.ultimaCompra}</div>`
          : `<div style="font-size:11px;color:#94a3b8;margin-top:3px">Sin compra registrada</div>`;
        const exhibicionLine = p.conExhibicion
          ? `<div style="font-size:11px;color:#16a34a;margin-top:2px">● Exhibición últimos 30d</div>`
          : "";
        const inactivoLine = !p.activo
          ? `<div style="font-size:11px;color:#dc2626;margin-top:3px">⚠ Sin compra +30d</div>`
          : "";

        const popupHTML = `
          <div style="min-width:175px;font-size:13px;font-family:sans-serif;background:#fff;color:#1e293b;padding:10px 12px;border-radius:8px;box-shadow:0 4px 16px #0002;">
            <b style="display:block;margin-bottom:3px">${p.nombre}</b>
            <div style="display:flex;align-items:center;gap:5px;margin-bottom:5px">
              <span style="width:8px;height:8px;border-radius:50%;background:${vendorColor};display:inline-block;flex-shrink:0"></span>
              <span style="font-size:11px;color:#475569">${p.vendedor}</span>
            </div>
            <div style="font-size:10px;padding:2px 7px;border-radius:4px;display:inline-block;margin-bottom:4px;background:${auraColor}18;color:${auraColor};border:1px solid ${auraColor}44;font-weight:600">${STATUS_LABELS[status]}</div>
            ${ultimaCompraLine}
            ${exhibicionLine}
            ${inactivoLine}
          </div>`;

        const popup  = new maplibregl.Popup({ offset: 12, closeButton: false }).setHTML(popupHTML);
        const marker = new maplibregl.Marker({ element: wrapper, anchor: "center" })
          .setLngLat([p.lng, p.lat])
          .setPopup(popup)
          .addTo(map);
        markersRef.current.push(marker);
      });

      // fitBounds sólo la primera vez que llegan datos con coordenadas.
      // animate:false evita que los markers aparezcan en posiciones "viejas"
      // durante la animación de vuelo del mapa.
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

    if (map.loaded()) addMarkers();
    else map.once("load", addMarkers);
  }, [filteredPines]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resize explícito al cambiar fullscreen — el ResizeObserver cubre cambios
  // de layout, pero fullscreen cambia el CSS de position/fixed que puede
  // necesitar un ciclo extra para que el contenedor reporte el nuevo tamaño.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const t = setTimeout(() => map.resize(), 220);
    return () => clearTimeout(t);
  }, [isFullscreen]);

  // ESC to exit fullscreen
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && isFullscreen) setIsFullscreen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isFullscreen]);

  const handlePrint = () => {
    const map = mapRef.current;
    if (!map) return;
    const styleEl = document.createElement("style");
    styleEl.id = "shelfy-print-style";
    styleEl.textContent = `
      @media print {
        @page { size: A4 landscape; margin: 10mm; }
        body > *:not(.shelfy-print-mapa) { display: none !important; }
        .shelfy-print-mapa { display:block !important; position:fixed !important; inset:0 !important; width:100vw !important; height:100vh !important; }
        .maplibregl-ctrl-bottom-right, .shelfy-map-controls { display:none !important; }
      }
    `;
    document.head.appendChild(styleEl);
    setTimeout(() => {
      window.print();
      setTimeout(() => { document.getElementById("shelfy-print-style")?.remove(); }, 1000);
    }, 400);
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
      {/* Vendor panel overlay (fullscreen only) — fondo oscuro para texto white */}
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

      {/* Map canvas — sin transition en marginLeft para que MapLibre no pierda
          la referencia de tamaño durante el CSS animation */}
      <div ref={mapContainer} style={{
        flex: 1, height: "100%",
        marginLeft: panelOffset,
      }} />

      {/* Top-right controls */}
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

      {/* Filter legend — bottom-left */}
      <div style={{
        position: "absolute", bottom: 40, left: panelOffset + 12,
        zIndex: 30, transition: "left 0.2s ease",
      }}>
        <FilterLegend />
      </div>

      {/* PDV count badge — top-left */}
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
    </div>
  );
}
