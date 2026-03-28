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
}

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

export default function MapaRutas({ pines }: { pines: PinCliente[] }) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  // Actualizar markers cuando cambian los pines
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Esperar a que el mapa esté listo para agregar markers
    const addMarkers = () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      const conCoords = pines.filter(p => p.lat && p.lng);

      conCoords.forEach(p => {
        const el = document.createElement("div");
        const size = p.activo ? 12 : 8;
        const bg = p.activo ? p.color : "#6b7280";
        const border = p.activo ? p.color : "#9ca3af";
        const opacity = p.activo ? 0.85 : 0.35;
        el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:2px solid ${border};opacity:${opacity};cursor:pointer;box-sizing:border-box;`;

        const popupHTML = `
          <div style="min-width:160px;font-size:13px;font-family:sans-serif;background:#1a1d27;color:#f1f5f9;padding:10px 12px;border-radius:8px;border:1px solid #374151;">
            <b style="display:block;margin-bottom:4px">${p.nombre}</b>
            <div style="color:${p.color};font-size:11px;margin-bottom:4px">● ${p.vendedor}</div>
            ${p.ultimaCompra ? `<div style="font-size:11px;color:#94a3b8">Últ. compra: ${p.ultimaCompra}</div>` : ""}
            ${!p.activo ? `<div style="color:#f87171;font-size:11px;margin-top:4px">⚠ Sin actividad reciente</div>` : ""}
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
  }, [pines]);

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

    // Inyectar estilos de impresión temporales
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

    // Cambiar a tiles claros
    map.setStyle(LIGHT_STYLE);

    setTimeout(() => {
      window.print();
      // Restaurar
      setTimeout(() => {
        map.setStyle(DARK_STYLE);
        const el = document.getElementById("shelfy-print-style");
        if (el) el.remove();
      }, 1000);
    }, 800);
  };

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
      }}
      className="shelfy-print-mapa"
    >
      <div ref={mapContainer} style={{ height: "100%", width: "100%" }} />

      {/* Controles superpuestos */}
      <div
        className="shelfy-map-controls"
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          display: "flex",
          gap: 6,
          zIndex: 10,
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
    </div>
  );
}
