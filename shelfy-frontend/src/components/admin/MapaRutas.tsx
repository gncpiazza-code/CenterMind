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

// CSS de animación de aura — usa box-shadow (sin transform) para evitar
// conflictos de composición GPU con el canvas WebGL de MapLibre.
// La variable --ac se setea inline por elemento.
const PULSE_CSS = `
@keyframes shelfy-aura {
  0%   { box-shadow: 0 0 0 1px var(--ac); }
  70%  { box-shadow: 0 0 0 9px transparent; }
  100% { box-shadow: 0 0 0 9px transparent; }
}
.shelfy-pin {
  border-radius: 50%;
  pointer-events: auto;
  cursor: pointer;
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
  shelfyMapsMode?: boolean;
}

export default function MapaRutas({ pines, fullscreenPanel, shelfyMapsMode }: MapaRutasProps) {
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
      container:              mapContainer.current,
      style:                  LIGHT_STYLE,
      center:                 [-63.0, -34.0],
      zoom:                   5,
      pitch:                  0,
      bearing:                0,
      preserveDrawingBuffer:  true,
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
        const hasCount = p.totalExhibiciones && p.totalExhibiciones > 0;
        const size        = p.activo ? (hasCount ? 18 : 12) : (hasCount ? 14 : 8);

        // Un único div — sin transform en la animación.
        // box-shadow pulse no crea capas GPU que compitan con el canvas WebGL.
        const wrapper = document.createElement("div");
        wrapper.className = "shelfy-pin";
        wrapper.style.cssText = `
          width:${size}px;
          height:${size}px;
          background:${vendorColor};
          border:2px solid ${auraColor};
          box-sizing:border-box;
          opacity:${p.activo ? 0.95 : 0.6};
          display:flex;
          align-items:center;
          justify-content:center;
        `;
        wrapper.innerHTML = hasCount
          ? `<span style="font-size:9px;font-weight:700;color:#fff;line-height:1;">${p.totalExhibiciones}</span>`
          : '';

        // ── Popup ──────────────────────────────────────────────────────────
        // Helper: días desde una fecha ISO (date o timestamp)
        const diasDesde = (iso: string | null | undefined): number | null => {
          if (!iso) return null;
          const ms = Date.now() - new Date(iso).getTime();
          return Math.floor(ms / 86_400_000);
        };

        const diasCompra = diasDesde(p.fechaUltimaCompra);
        const diasExhib  = diasDesde(p.fechaUltimaExhibicion);

        // Línea de compra
        const compraColor = p.activo ? "#16a34a" : "#dc2626";
        const compraLabel = diasCompra === null
          ? `<span style="color:#94a3b8">Sin compras registradas</span>`
          : `<span style="color:${compraColor}">Últ. compra: ${p.ultimaCompra} · <b>hace ${diasCompra}d</b></span>`;

        // Línea de exhibición
        let exhibLine = "";
        if (p.fechaUltimaExhibicion) {
          const exhDateStr = p.fechaUltimaExhibicion.split("T")[0];
          // Thumbnail desde Drive: usar URL de thumbnail pública de Google
          // url_foto_drive es en realidad una URL pública de Supabase Storage
          const imgUrl    = p.urlExhibicion ?? null;
          const thumbHtml = imgUrl
            ? `<a href="${imgUrl}" target="_blank" rel="noopener" style="display:block;margin-top:5px">
                <img src="${imgUrl}" alt="Exhibición"
                  style="width:100%;max-width:200px;border-radius:5px;border:1px solid #e2e8f0;display:block;object-fit:cover"/>
               </a>`
            : "";
          const viewUrl = imgUrl;
          exhibLine = `
            <div style="margin-top:5px;padding-top:5px;border-top:1px solid #f1f5f9">
              <span style="color:#d97706;font-size:11px">
                ● Exhibición: ${exhDateStr} · <b>hace ${diasExhib}d</b>
              </span>
              ${thumbHtml}
              ${viewUrl ? `<a href="${viewUrl}" target="_blank" rel="noopener"
                style="font-size:10px;color:#3b82f6;display:inline-block;margin-top:3px">
                Ver imagen original ↗</a>` : ""}
            </div>`;
        }

        // Línea de deuda (enriquecida desde cc_detalle vía TabSupervision)
        const deudaLine = p.deuda != null
          ? `<div style="margin-top:4px;padding:3px 6px;background:#fef3c715;border-radius:4px;border:1px solid #fef3c740">
               <span style="color:#d97706;font-size:11px">💳 Deuda: <b>$${p.deuda.toLocaleString("es-AR",{maximumFractionDigits:0})}</b>${p.antiguedadDias != null ? ` · <b style="color:#ef4444">${p.antiguedadDias}d</b>` : ""}</span>
             </div>`
          : "";

        const metaLine = `
          <div style="font-size:10px;color:#94a3b8;margin-top:3px;display:flex;gap:8px;flex-wrap:wrap">
            ${p.idClienteErp ? `<span>Nº cliente: <b style="color:#475569">${p.idClienteErp}</b></span>` : ""}
            ${p.nroRuta      ? `<span>Ruta: <b style="color:#475569">${p.nroRuta}</b></span>` : ""}
          </div>`;

        const popupHTML = `
          <div style="min-width:200px;max-width:240px;font-size:12px;font-family:sans-serif;
                      background:#fff;color:#1e293b;padding:10px 12px;border-radius:8px;
                      box-shadow:0 4px 16px #0002;line-height:1.5">
            <b style="display:block;font-size:13px;margin-bottom:2px">${p.nombre}</b>
            ${metaLine}
            <div style="display:flex;align-items:center;gap:5px;margin:5px 0 3px">
              <span style="width:8px;height:8px;border-radius:50%;background:${vendorColor};
                           display:inline-block;flex-shrink:0"></span>
              <span style="font-size:11px;color:#475569">${p.vendedor}</span>
            </div>
            <div style="font-size:10px;padding:2px 7px;border-radius:4px;display:inline-block;
                        background:${auraColor}18;color:${auraColor};
                        border:1px solid ${auraColor}44;font-weight:600;margin-bottom:4px">
              ${STATUS_LABELS[status]}
            </div>
            <div style="font-size:11px">${compraLabel}</div>
            ${deudaLine}
            ${exhibLine}
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
    if (!mapRef.current) return;
    const canvas = mapRef.current.getCanvas();
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

      {/* Top-right controls — hidden in shelfyMapsMode (replaced by ShelfyMaps topbar) */}
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

      {/* Filter legend — bottom-left — hidden in shelfyMapsMode */}
      {!shelfyMapsMode && (
        <div style={{
          position: "absolute", bottom: 40, left: panelOffset + 12,
          zIndex: 30, transition: "left 0.2s ease",
        }}>
          <FilterLegend />
        </div>
      )}

      {/* PDV count badge — top-left — hidden in shelfyMapsMode */}
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
