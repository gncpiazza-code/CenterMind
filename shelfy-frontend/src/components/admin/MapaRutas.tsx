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
  activo_exhibicion: "#22c55e",
  activo:            "#3b82f6",
  inactivo_exhibicion: "#f59e0b",
  inactivo:          "#ef4444",
};

export const STATUS_LABELS: Record<PinStatus, string> = {
  activo_exhibicion:   "Activo + Exhibición",
  activo:              "Activo",
  inactivo_exhibicion: "Inactivo + Exhibición",
  inactivo:            "Inactivo",
};

const DARK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: "raster",
      tiles: ["https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors © CARTO",
    },
  },
  layers: [{ id: "carto", type: "raster", source: "carto" }],
};

const LIGHT_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

interface MapaRutasProps {
  pines: PinCliente[];
  /** Optional vendor panel rendered as overlay in fullscreen mode */
  fullscreenPanel?: React.ReactNode;
}

export default function MapaRutas({ pines, fullscreenPanel }: MapaRutasProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ── Filter toggles ────────────────────────────────────────────────────────
  const [filterEnabled, setFilterEnabled] = useState<Record<PinStatus, boolean>>({
    activo_exhibicion: true,
    activo: true,
    inactivo_exhibicion: true,
    inactivo: true,
  });

  const toggleFilter = (status: PinStatus) => {
    setFilterEnabled(prev => ({ ...prev, [status]: !prev[status] }));
  };

  // Count pins per status
  const statusCounts = (["activo_exhibicion", "activo", "inactivo_exhibicion", "inactivo"] as PinStatus[]).reduce(
    (acc, s) => ({ ...acc, [s]: pines.filter(p => getPinStatus(p) === s).length }),
    {} as Record<PinStatus, number>
  );

  // Filtered pins based on active filters
  const filteredPines = pines.filter(p => filterEnabled[getPinStatus(p)]);

  // Inicializar mapa
  useEffect(() => {
    if (!mapContainer.current) return;
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: DARK_STYLE,
      center: [-58.4, -34.6],
      zoom: 9,
    });
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Actualizar markers cuando cambian los pines filtrados
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const addMarkers = () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      const conCoords = filteredPines.filter(p => p.lat && p.lng);

      conCoords.forEach(p => {
        const status = getPinStatus(p);
        const statusColor = STATUS_COLORS[status];
        const el = document.createElement("div");

        // Size: bigger for active
        const size = p.activo ? 13 : 9;
        const opacity = p.activo ? 0.9 : 0.65;

        // Dot with status-based color
        el.style.cssText = [
          `width:${size}px`,
          `height:${size}px`,
          `border-radius:50%`,
          `background:${statusColor}`,
          `border:2px solid ${statusColor}`,
          `opacity:${opacity}`,
          `cursor:pointer`,
          `box-sizing:border-box`,
          p.conExhibicion ? `box-shadow:0 0 6px ${statusColor}99` : "",
        ].join(";");

        const ultimaCompraLine = p.ultimaCompra
          ? `<div style="font-size:11px;color:#94a3b8">Últ. compra: ${p.ultimaCompra}</div>`
          : "";
        const exhibicionLine = p.conExhibicion
          ? `<div style="font-size:11px;color:#22c55e;margin-top:2px">● Con Exhibición (30d)</div>`
          : "";
        const inactivoLine = !p.activo
          ? `<div style="color:#f87171;font-size:11px;margin-top:4px">⚠ Sin compra +30d</div>`
          : "";

        const popupHTML = `
          <div style="min-width:170px;font-size:13px;font-family:sans-serif;background:#1a1d27;color:#f1f5f9;padding:10px 12px;border-radius:8px;border:1px solid #374151;">
            <b style="display:block;margin-bottom:4px">${p.nombre}</b>
            <div style="color:${p.color};font-size:11px;margin-bottom:4px">● ${p.vendedor}</div>
            <div style="font-size:10px;padding:2px 6px;border-radius:4px;display:inline-block;margin-bottom:4px;background:${statusColor}22;color:${statusColor};border:1px solid ${statusColor}44">${STATUS_LABELS[status]}</div>
            ${ultimaCompraLine}
            ${exhibicionLine}
            ${inactivoLine}
          </div>`;

        const popup = new maplibregl.Popup({ offset: 10, closeButton: false }).setHTML(popupHTML);
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([p.lng, p.lat])
          .setPopup(popup)
          .addTo(map);
        markersRef.current.push(marker);
      });

      if (conCoords.length > 0) {
        const lngs = conCoords.map(p => p.lng);
        const lats = conCoords.map(p => p.lat);
        map.fitBounds(
          [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
          { padding: 50, maxZoom: 13 }
        );
      }
    };

    if (map.loaded()) {
      addMarkers();
    } else {
      map.once("load", addMarkers);
    }
  }, [filteredPines]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resize mapa al cambiar fullscreen
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const timer = setTimeout(() => map.resize(), 50);
    return () => clearTimeout(timer);
  }, [isFullscreen]);

  // ESC para salir de fullscreen
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) setIsFullscreen(false);
    };
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
        .shelfy-print-mapa { display: block !important; position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important; }
        .maplibregl-canvas { max-width: 100% !important; }
        .maplibregl-ctrl-bottom-right, .shelfy-map-controls { display: none !important; }
      }
    `;
    document.head.appendChild(styleEl);

    map.setStyle(LIGHT_STYLE);

    setTimeout(() => {
      window.print();
      setTimeout(() => {
        map.setStyle(DARK_STYLE);
        const el = document.getElementById("shelfy-print-style");
        if (el) el.remove();
      }, 1000);
    }, 800);
  };

  const STATUS_ORDER: PinStatus[] = ["activo_exhibicion", "activo", "inactivo_exhibicion", "inactivo"];

  const FilterLegend = () => (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        padding: "8px 10px",
        background: "#0d111acc",
        backdropFilter: "blur(8px)",
        borderRadius: 10,
        border: "1px solid #ffffff14",
      }}
    >
      {STATUS_ORDER.map(s => {
        const on = filterEnabled[s];
        const count = statusCounts[s];
        const color = STATUS_COLORS[s];
        return (
          <button
            key={s}
            onClick={() => toggleFilter(s)}
            title={on ? `Ocultar: ${STATUS_LABELS[s]}` : `Mostrar: ${STATUS_LABELS[s]}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "3px 8px",
              borderRadius: 6,
              border: `1px solid ${on ? color + "66" : "#ffffff18"}`,
              background: on ? color + "18" : "#ffffff08",
              color: on ? color : "#ffffff40",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 600,
              transition: "all 0.15s ease",
              opacity: count === 0 ? 0.4 : 1,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: on ? color : "#ffffff20",
                flexShrink: 0,
              }}
            />
            <span style={{ maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {STATUS_LABELS[s]}
            </span>
            <span
              style={{
                background: on ? color + "30" : "#ffffff10",
                color: on ? color : "#ffffff40",
                borderRadius: 4,
                padding: "0 4px",
                fontSize: 10,
                minWidth: 18,
                textAlign: "center",
              }}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      style={{
        position: isFullscreen ? "fixed" : "relative",
        inset: isFullscreen ? 0 : undefined,
        zIndex: isFullscreen ? 9999 : undefined,
        height: isFullscreen ? "100vh" : "100%",
        width: isFullscreen ? "100vw" : "100%",
        borderRadius: isFullscreen ? 0 : 16,
        overflow: "hidden",
        background: "#0f1117",
        display: "flex",
      }}
      className="shelfy-print-mapa"
    >
      {/* ── Vendor panel overlay (fullscreen only) ─────────────────────────── */}
      {isFullscreen && fullscreenPanel && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 300,
            zIndex: 20,
            display: "flex",
            flexDirection: "column",
            background: "#0a0e18f0",
            backdropFilter: "blur(12px)",
            borderRight: "1px solid #ffffff14",
            overflowY: "auto",
          }}
        >
          {fullscreenPanel}
        </div>
      )}

      {/* ── Map canvas ────────────────────────────────────────────────────── */}
      <div
        ref={mapContainer}
        style={{
          flex: 1,
          height: "100%",
          marginLeft: isFullscreen && fullscreenPanel ? 300 : 0,
          transition: "margin-left 0.2s ease",
        }}
      />

      {/* ── Top-right controls ─────────────────────────────────────────────── */}
      <div
        className="shelfy-map-controls"
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          display: "flex",
          gap: 6,
          zIndex: 30,
        }}
      >
        <button
          onClick={() => setIsFullscreen(f => !f)}
          title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
          style={{
            background: "#1a1d27cc",
            border: "1px solid #374151",
            borderRadius: 6,
            color: "white",
            padding: "6px 8px",
            cursor: "pointer",
            fontSize: 14,
            lineHeight: 1,
          }}
        >
          {isFullscreen ? "⊠" : "⛶"}
        </button>
        <button
          onClick={handlePrint}
          title="Imprimir mapa A4 horizontal"
          style={{
            background: "#1a1d27cc",
            border: "1px solid #374151",
            borderRadius: 6,
            color: "white",
            padding: "6px 8px",
            cursor: "pointer",
            fontSize: 14,
            lineHeight: 1,
          }}
        >
          🖨️
        </button>
      </div>

      {/* ── Filter legend — bottom-left ─────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: isFullscreen && fullscreenPanel ? 312 : 12,
          zIndex: 30,
          transition: "left 0.2s ease",
        }}
      >
        <FilterLegend />
      </div>

      {/* ── PDV count badge — top-left ──────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: isFullscreen && fullscreenPanel ? 312 : 10,
          zIndex: 30,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(4px)",
          color: "white",
          fontSize: 11,
          fontWeight: 700,
          padding: "4px 10px",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.1)",
          pointerEvents: "none",
          transition: "left 0.2s ease",
        }}
      >
        {filteredPines.length.toLocaleString()} PDV visibles
      </div>
    </div>
  );
}
