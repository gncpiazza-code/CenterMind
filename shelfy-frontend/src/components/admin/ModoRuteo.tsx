"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Map } from "@/components/ui/map";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { X, FileText, Route, Wand2, Grid3X3, PenLine, ChevronDown } from "lucide-react";
import type { VendedorSupervision, RutaSupervision, ClienteSupervision } from "@/lib/api";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ModoRuteoProps {
  vendedores: VendedorSupervision[];
  rutas: Record<number, RutaSupervision[]>;
  clientes: Record<number, ClienteSupervision[]>;
  distId: number;
  onClose?: () => void;
}

type SubModo = "manual" | "automatico";
type HerramientaAuto = "grilla" | "libre";
type CeldaSize = 500 | 1000 | 2000;

interface RecomendacionRuteo {
  id_cliente: number;
  nombre_cliente: string;
  vendedor_actual: string;
  id_vendedor_actual: number;
  vendedor_sugerido: string;
  id_vendedor_sugerido: number;
  dia_actual: string;
  dia_sugerido: string;
  motivo: string;
}

interface VendedorConPDVs {
  vendedor: VendedorSupervision;
  rutasLocal: RutaSupervision[];
  clientesPorRuta: Record<number, ClienteSupervision[]>;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const VENDOR_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ec4899", "#3b82f6"];

function hasValidCoords(lat: number | null, lng: number | null): boolean {
  return (
    lat !== null && lng !== null &&
    lat !== 0 && lng !== 0 &&
    lat >= -55 && lat <= -21 &&
    lng >= -74 && lng <= -53
  );
}

function getDisplayName(c: ClienteSupervision) {
  return c.nombre_fantasia || c.nombre_razon_social || `Cliente ${c.id_cliente}`;
}

// ─── PDF Generation ────────────────────────────────────────────────────────

async function generarPDFRuteo(
  slotsA: { vendedor: VendedorSupervision; rutasLocal: RutaSupervision[]; clientesPorRuta: Record<number, ClienteSupervision[]> } | null,
  slotsB: { vendedor: VendedorSupervision; rutasLocal: RutaSupervision[]; clientesPorRuta: Record<number, ClienteSupervision[]> } | null
) {
  // Dynamic import to keep bundle lean
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text("Planilla de Ruteo", 20, 20);
  doc.setFontSize(10);
  doc.text(`Fecha: ${new Date().toLocaleDateString("es-AR")}`, 20, 30);

  let y = 42;
  const slots = [slotsA, slotsB].filter(Boolean) as typeof slotsA[];

  for (const slot of slots) {
    if (!slot) continue;
    doc.setFontSize(13);
    doc.setTextColor(60, 60, 60);
    doc.text(slot.vendedor.nombre_vendedor, 20, y);
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(`Sucursal: ${slot.vendedor.sucursal_nombre}`, 20, y + 6);
    y += 14;

    for (const ruta of slot.rutasLocal) {
      const pdvs = slot.clientesPorRuta[ruta.id_ruta] ?? [];
      doc.setFontSize(10);
      doc.setTextColor(80, 80, 200);
      doc.text(`  ${ruta.dia_semana} — ${ruta.nombre_ruta} (${pdvs.length} PDV)`, 22, y);
      y += 6;
      doc.setFontSize(8);
      doc.setTextColor(40, 40, 40);
      for (const pdv of pdvs) {
        if (y > 275) { doc.addPage(); y = 20; }
        const nombre = getDisplayName(pdv);
        doc.text(`    • ${nombre}  (${pdv.domicilio || pdv.localidad || ""})`, 24, y);
        y += 5;
      }
      y += 2;
    }

    y += 6;
    if (y > 260) { doc.addPage(); y = 20; }
    doc.setDrawColor(200, 200, 200);
    doc.line(20, y - 3, 190, y - 3);
  }

  const nameA = slotsA?.vendedor.nombre_vendedor.replace(/\s+/g, "_") ?? "ruteo";
  doc.save(`ruteo_${nameA}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ─── Sub-componente: lista de PDVs draggable ────────────────────────────────

interface PDVListProps {
  rutasLocal: RutaSupervision[];
  clientesPorRuta: Record<number, ClienteSupervision[]>;
  vendedorColor: string;
  draggingId: number | null;
  onDragStart: (idCliente: number, idRuta: number) => void;
  onDrop: (idRutaDestino: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  dropTargetRuta: number | null;
  setDropTargetRuta: (id: number | null) => void;
}

function PDVList({
  rutasLocal,
  clientesPorRuta,
  vendedorColor,
  draggingId,
  onDragStart,
  onDrop,
  onDragOver,
  dropTargetRuta,
  setDropTargetRuta,
}: PDVListProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 8 }}>
      {rutasLocal.map((ruta) => {
        const pdvs = clientesPorRuta[ruta.id_ruta] ?? [];
        const isDropTarget = dropTargetRuta === ruta.id_ruta;
        return (
          <div
            key={ruta.id_ruta}
            onDragOver={(e) => { e.preventDefault(); setDropTargetRuta(ruta.id_ruta); onDragOver(e); }}
            onDragLeave={() => setDropTargetRuta(null)}
            onDrop={(e) => { e.preventDefault(); setDropTargetRuta(null); onDrop(ruta.id_ruta); }}
            style={{
              border: isDropTarget
                ? `2px dashed ${vendedorColor}`
                : "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              background: isDropTarget ? `${vendedorColor}14` : "rgba(255,255,255,0.03)",
              transition: "border-color 0.15s, background 0.15s",
              overflow: "hidden",
            }}
          >
            {/* Header de ruta */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 10px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                background: `${vendedorColor}18`,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: vendedorColor }}>
                {ruta.dia_semana}
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: "var(--shelfy-text-muted, #94a3b8)",
                  background: "rgba(255,255,255,0.07)",
                  borderRadius: 4,
                  padding: "1px 6px",
                }}
              >
                {pdvs.length} PDV
              </span>
            </div>

            {/* PDVs */}
            <div style={{ padding: "4px 6px", display: "flex", flexDirection: "column", gap: 2 }}>
              {pdvs.length === 0 && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--shelfy-text-muted, #64748b)",
                    textAlign: "center",
                    padding: "8px 0",
                    fontStyle: "italic",
                  }}
                >
                  Sin PDVs
                </div>
              )}
              {pdvs.map((pdv) => {
                const isDragging = draggingId === pdv.id_cliente;
                return (
                  <div
                    key={pdv.id_cliente}
                    draggable
                    onDragStart={() => onDragStart(pdv.id_cliente, ruta.id_ruta)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      padding: "5px 8px",
                      borderRadius: 6,
                      cursor: "grab",
                      background: isDragging ? `${vendedorColor}22` : "transparent",
                      opacity: isDragging ? 0.4 : 1,
                      border: `1px solid ${isDragging ? vendedorColor + "55" : "transparent"}`,
                      transition: "opacity 0.1s",
                      userSelect: "none",
                    }}
                  >
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: vendedorColor,
                        flexShrink: 0,
                        opacity: 0.8,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--shelfy-text, #e2e8f0)",
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {getDisplayName(pdv)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Componente VendedorSlot (columna izquierda/derecha) ─────────────────────

interface VendedorSlotProps {
  vendedores: VendedorSupervision[];
  selected: number | null;
  exclude: number | null;
  onChange: (id: number | null) => void;
  color: string;
  rutasLocal: RutaSupervision[];
  clientesPorRuta: Record<number, ClienteSupervision[]>;
  draggingId: number | null;
  onDragStart: (idCliente: number, idRuta: number) => void;
  onDrop: (idRuta: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  dropTargetRuta: number | null;
  setDropTargetRuta: (id: number | null) => void;
  label: string;
}

function VendedorSlot({
  vendedores,
  selected,
  exclude,
  onChange,
  color,
  rutasLocal,
  clientesPorRuta,
  draggingId,
  onDragStart,
  onDrop,
  onDragOver,
  dropTargetRuta,
  setDropTargetRuta,
  label,
}: VendedorSlotProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Selector */}
      <div>
        <label
          style={{
            display: "block",
            fontSize: 10,
            fontWeight: 700,
            color,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 5,
          }}
        >
          {label}
        </label>
        <div style={{ position: "relative" }}>
          <select
            value={selected ?? ""}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
            style={{
              width: "100%",
              padding: "7px 28px 7px 10px",
              borderRadius: 8,
              border: `1px solid ${color}55`,
              background: "rgba(255,255,255,0.05)",
              color: "var(--shelfy-text, #e2e8f0)",
              fontSize: 12,
              appearance: "none",
              cursor: "pointer",
              outline: "none",
            }}
          >
            <option value="">— Seleccionar vendedor —</option>
            {vendedores
              .filter((v) => v.id_vendedor !== exclude)
              .map((v) => (
                <option key={v.id_vendedor} value={v.id_vendedor}>
                  {v.nombre_vendedor}
                </option>
              ))}
          </select>
          <ChevronDown
            size={14}
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              color,
              pointerEvents: "none",
            }}
          />
        </div>
        {selected && (
          <p style={{ fontSize: 10, color: "var(--shelfy-text-muted, #64748b)", marginTop: 4 }}>
            {vendedores.find((v) => v.id_vendedor === selected)?.sucursal_nombre}
            {" · "}
            {rutasLocal.length} rutas
          </p>
        )}
      </div>

      {/* Lista scrollable */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {selected ? (
          rutasLocal.length > 0 ? (
            <PDVList
              rutasLocal={rutasLocal}
              clientesPorRuta={clientesPorRuta}
              vendedorColor={color}
              draggingId={draggingId}
              onDragStart={onDragStart}
              onDrop={onDrop}
              onDragOver={onDragOver}
              dropTargetRuta={dropTargetRuta}
              setDropTargetRuta={setDropTargetRuta}
            />
          ) : (
            <div
              style={{
                fontSize: 11,
                color: "var(--shelfy-text-muted, #64748b)",
                textAlign: "center",
                padding: "24px 0",
                fontStyle: "italic",
              }}
            >
              Sin rutas cargadas
            </div>
          )
        ) : (
          <div
            style={{
              fontSize: 11,
              color: "var(--shelfy-text-muted, #64748b)",
              textAlign: "center",
              padding: "24px 0",
              fontStyle: "italic",
            }}
          >
            Seleccioná un vendedor
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function ModoRuteo({
  vendedores,
  rutas,
  clientes,
  distId,
  onClose,
}: ModoRuteoProps) {
  const [subModo, setSubModo] = useState<SubModo>("manual");

  // ── Manual mode state ──
  const [vendedorAId, setVendedorAId] = useState<number | null>(null);
  const [vendedorBId, setVendedorBId] = useState<number | null>(null);
  // Local copy of routes+clients for drag-and-drop mutation
  const [rutasLocalesA, setRutasLocalesA] = useState<RutaSupervision[]>([]);
  const [rutasLocalesB, setRutasLocalesB] = useState<RutaSupervision[]>([]);
  const [clientesLocalesA, setClientesLocalesA] = useState<Record<number, ClienteSupervision[]>>({});
  const [clientesLocalesB, setClientesLocalesB] = useState<Record<number, ClienteSupervision[]>>({});
  const [hayCambios, setHayCambios] = useState(false);

  // Drag state
  const draggingRef = useRef<{ idCliente: number; idRutaOrigen: number; lado: "A" | "B" } | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dropTargetA, setDropTargetA] = useState<number | null>(null);
  const [dropTargetB, setDropTargetB] = useState<number | null>(null);

  // ── Auto mode state ──
  const [herramientaAuto, setHerramientaAuto] = useState<HerramientaAuto>("grilla");
  const [celdaSize, setCeldaSize] = useState<CeldaSize>(1000);
  const [vendedoresAutoIds, setVendedoresAutoIds] = useState<number[]>([]);
  const [cuadrantesSeleccionados, setCuadrantesSeleccionados] = useState<Set<string>>(new Set());
  const [recomendaciones, setRecomendaciones] = useState<RecomendacionRuteo[]>([]);
  const [recsSeleccionadas, setRecsSeleccionadas] = useState<Set<number>>(new Set());
  const [poligonoActivo, setPoligonoActivo] = useState(false);
  const [poligonoPuntos, setPoligonoPuntos] = useState<[number, number][]>([]);

  // Map refs
  const mapManualRef = useRef<any>(null);
  const mapAutoRef = useRef<any>(null);
  const markersManualRef = useRef<any[]>([]);
  const markersAutoRef = useRef<any[]>([]);
  const [mapManualLoaded, setMapManualLoaded] = useState(false);
  const [mapAutoLoaded, setMapAutoLoaded] = useState(false);
  const poligonoLayerAdded = useRef(false);

  // ── Sync local state when vendor selection changes ──
  useEffect(() => {
    if (vendedorAId === null) {
      setRutasLocalesA([]);
      setClientesLocalesA({});
      return;
    }
    const rs = rutas[vendedorAId] ?? [];
    setRutasLocalesA(rs);
    const cm: Record<number, ClienteSupervision[]> = {};
    for (const r of rs) {
      cm[r.id_ruta] = clientes[r.id_ruta] ?? [];
    }
    setClientesLocalesA(cm);
    setHayCambios(false);
  }, [vendedorAId, rutas, clientes]);

  useEffect(() => {
    if (vendedorBId === null) {
      setRutasLocalesB([]);
      setClientesLocalesB({});
      return;
    }
    const rs = rutas[vendedorBId] ?? [];
    setRutasLocalesB(rs);
    const cm: Record<number, ClienteSupervision[]> = {};
    for (const r of rs) {
      cm[r.id_ruta] = clientes[r.id_ruta] ?? [];
    }
    setClientesLocalesB(cm);
    setHayCambios(false);
  }, [vendedorBId, rutas, clientes]);

  // ── Drag handlers ──
  const handleDragStart = useCallback((idCliente: number, idRuta: number, lado: "A" | "B") => {
    draggingRef.current = { idCliente, idRutaOrigen: idRuta, lado };
    setDraggingId(idCliente);
  }, []);

  // Use refs to hold current state so the drop handler doesn't go stale
  const clientesARef = useRef(clientesLocalesA);
  const clientesBRef = useRef(clientesLocalesB);
  useEffect(() => { clientesARef.current = clientesLocalesA; }, [clientesLocalesA]);
  useEffect(() => { clientesBRef.current = clientesLocalesB; }, [clientesLocalesB]);

  const handleDrop = useCallback((idRutaDestino: number, ladoDestino: "A" | "B") => {
    const drag = draggingRef.current;
    if (!drag) return;
    setDraggingId(null);
    draggingRef.current = null;

    const { idCliente, idRutaOrigen, lado: ladoOrigen } = drag;
    if (ladoOrigen === ladoDestino && idRutaOrigen === idRutaDestino) return;

    const removeFrom = (
      map: Record<number, ClienteSupervision[]>,
      rutaId: number,
      cid: number
    ): Record<number, ClienteSupervision[]> => ({
      ...map,
      [rutaId]: (map[rutaId] ?? []).filter((c) => c.id_cliente !== cid),
    });

    const addTo = (
      map: Record<number, ClienteSupervision[]>,
      rutaId: number,
      cliente: ClienteSupervision
    ): Record<number, ClienteSupervision[]> => ({
      ...map,
      [rutaId]: [...(map[rutaId] ?? []), { ...cliente, id_ruta: rutaId }],
    });

    // Find the cliente object in whichever side it came from
    const srcMap = ladoOrigen === "A" ? clientesARef.current : clientesBRef.current;
    const cliente = Object.values(srcMap).flat().find((c) => c.id_cliente === idCliente);
    if (!cliente) return;

    let newA = { ...clientesARef.current };
    let newB = { ...clientesBRef.current };

    // Remove from source
    if (ladoOrigen === "A") newA = removeFrom(newA, idRutaOrigen, idCliente);
    else newB = removeFrom(newB, idRutaOrigen, idCliente);

    // Add to destination
    if (ladoDestino === "A") newA = addTo(newA, idRutaDestino, cliente);
    else newB = addTo(newB, idRutaDestino, cliente);

    setClientesLocalesA(newA);
    setClientesLocalesB(newB);
    setHayCambios(true);
  }, []);

  // ── Manual map markers ──
  const pinesManual = useMemo(() => {
    const result: Array<{ id: number; lat: number; lng: number; nombre: string; color: string; activo: boolean }> = [];
    const addPines = (clMap: Record<number, ClienteSupervision[]>, color: string) => {
      for (const pdvs of Object.values(clMap)) {
        for (const p of pdvs) {
          if (hasValidCoords(p.latitud, p.longitud)) {
            result.push({
              id: p.id_cliente,
              lat: p.latitud!,
              lng: p.longitud!,
              nombre: getDisplayName(p),
              color,
              activo: !!p.fecha_ultima_compra,
            });
          }
        }
      }
    };
    if (vendedorAId) addPines(clientesLocalesA, VENDOR_COLORS[0]);
    if (vendedorBId) addPines(clientesLocalesB, VENDOR_COLORS[1]);
    // Deduplicate
    const seen = new Set<number>();
    return result.filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
  }, [vendedorAId, vendedorBId, clientesLocalesA, clientesLocalesB]);

  useEffect(() => {
    const map = mapManualRef.current;
    if (!map || !mapManualLoaded) return;
    markersManualRef.current.forEach((m) => m.remove());
    markersManualRef.current = [];
    for (const p of pinesManual) {
      const el = document.createElement("div");
      el.style.cssText = `
        width:${p.id === draggingId ? 22 : 14}px;
        height:${p.id === draggingId ? 22 : 14}px;
        background:${p.color};
        border:2px solid ${p.activo ? "#22c55e" : "#ef4444"};
        border-radius:50%;
        cursor:pointer;
        box-shadow:0 1px 3px rgba(0,0,0,0.35);
        transition:width 0.1s,height 0.1s;
        opacity:${p.id === draggingId ? 0.5 : 1};
      `;
      const popup = new maplibregl.Popup({ offset: 10, closeButton: false, closeOnClick: false })
        .setHTML(`<div style="font-size:12px;padding:6px 8px;font-family:sans-serif;color:#1e293b"><b>${p.nombre}</b></div>`);
      el.addEventListener("mouseenter", () => popup.setLngLat([p.lng, p.lat]).addTo(map));
      el.addEventListener("mouseleave", () => popup.remove());
      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([p.lng, p.lat])
        .addTo(map);
      markersManualRef.current.push(marker);
    }
    if (pinesManual.length > 0) {
      const lngs = pinesManual.map((p) => p.lng);
      const lats = pinesManual.map((p) => p.lat);
      map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], {
        padding: 50,
        maxZoom: 14,
        animate: false,
      });
    }
  }, [pinesManual, mapManualLoaded, draggingId]);

  // ── Auto mode: vendedor multi-select ──
  const toggleVendedorAuto = (id: number) =>
    setVendedoresAutoIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  // ── Auto mode: grilla ──
  const [grillaCeldas, setGrillaCeldas] = useState<
    Array<{ id: string; bounds: [[number, number], [number, number]] }>
  >([]);

  const calcularGrilla = useCallback(() => {
    const map = mapAutoRef.current;
    if (!map) return;
    const bounds = map.getBounds();
    const minLng = bounds.getWest();
    const maxLng = bounds.getEast();
    const minLat = bounds.getSouth();
    const maxLat = bounds.getNorth();

    // Convert meters to degrees (approx)
    const mPerDeg = 111_320;
    const stepLng = celdaSize / (mPerDeg * Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180));
    const stepLat = celdaSize / mPerDeg;

    const celdas: typeof grillaCeldas = [];
    let row = 0;
    for (let lat = minLat; lat < maxLat; lat += stepLat) {
      let col = 0;
      for (let lng = minLng; lng < maxLng; lng += stepLng) {
        const letra = String.fromCharCode(65 + row);
        celdas.push({
          id: `${letra}${col + 1}`,
          bounds: [[lng, lat], [lng + stepLng, lat + stepLat]],
        });
        col++;
      }
      row++;
    }
    setGrillaCeldas(celdas);
    setCuadrantesSeleccionados(new Set());
  }, [celdaSize]);

  // Render grilla as MapLibre layers
  useEffect(() => {
    const map = mapAutoRef.current;
    if (!map || !mapAutoLoaded || grillaCeldas.length === 0) return;

    // Remove previous layers/sources
    ["grilla-fill", "grilla-line", "grilla-label"].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource("grilla")) map.removeSource("grilla");
    if (map.getSource("grilla-labels")) map.removeSource("grilla-labels");

    const features = grillaCeldas.map((c) => ({
      type: "Feature" as const,
      properties: { id: c.id, selected: cuadrantesSeleccionados.has(c.id) },
      geometry: {
        type: "Polygon" as const,
        coordinates: [[
          c.bounds[0],
          [c.bounds[1][0], c.bounds[0][1]],
          c.bounds[1],
          [c.bounds[0][0], c.bounds[1][1]],
          c.bounds[0],
        ]],
      },
    }));

    map.addSource("grilla", { type: "geojson", data: { type: "FeatureCollection", features } });

    map.addLayer({
      id: "grilla-fill",
      type: "fill",
      source: "grilla",
      paint: {
        "fill-color": ["case", ["get", "selected"], "#6366f1", "transparent"],
        "fill-opacity": 0.22,
      },
    });

    map.addLayer({
      id: "grilla-line",
      type: "line",
      source: "grilla",
      paint: {
        "line-color": ["case", ["get", "selected"], "#6366f1", "#94a3b8"],
        "line-width": ["case", ["get", "selected"], 2, 1],
        "line-opacity": 0.7,
      },
    });

    // Click handler to toggle cuadrantes
    const onClick = (e: any) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ["grilla-fill"] });
      if (!features.length) return;
      const celdaId = features[0].properties.id as string;
      setCuadrantesSeleccionados((prev) => {
        const next = new Set(prev);
        if (next.has(celdaId)) next.delete(celdaId);
        else next.add(celdaId);
        return next;
      });
    };

    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [grillaCeldas, mapAutoLoaded, cuadrantesSeleccionados]);

  // ── Auto mode: polígono libre ──
  useEffect(() => {
    const map = mapAutoRef.current;
    if (!map || !mapAutoLoaded) return;
    if (!poligonoActivo) return;

    const onClick = (e: maplibregl.MapMouseEvent) => {
      const pt: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      setPoligonoPuntos((prev) => [...prev, pt]);
    };

    const onDblClick = (e: maplibregl.MapMouseEvent) => {
      e.preventDefault();
      setPoligonoActivo(false);
    };

    map.on("click", onClick);
    map.on("dblclick", onDblClick);
    map.getCanvas().style.cursor = "crosshair";

    return () => {
      map.off("click", onClick);
      map.off("dblclick", onDblClick);
      map.getCanvas().style.cursor = "";
    };
  }, [poligonoActivo, mapAutoLoaded]);

  // Render polygon on map
  useEffect(() => {
    const map = mapAutoRef.current;
    if (!map || !mapAutoLoaded || poligonoPuntos.length < 2) return;

    const closed = [...poligonoPuntos, poligonoPuntos[0]];
    const geoJson: GeoJSON.Feature = {
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [closed] },
    };

    const updateOrAdd = () => {
      if (map.getSource("poligono-libre")) {
        (map.getSource("poligono-libre") as any).setData(geoJson);
      } else {
        map.addSource("poligono-libre", { type: "geojson", data: geoJson });
        map.addLayer({ id: "poligono-fill", type: "fill", source: "poligono-libre", paint: { "fill-color": "#f59e0b", "fill-opacity": 0.15 } });
        map.addLayer({ id: "poligono-line", type: "line", source: "poligono-libre", paint: { "line-color": "#f59e0b", "line-width": 2 } });
        poligonoLayerAdded.current = true;
      }
    };

    updateOrAdd();
  }, [poligonoPuntos, mapAutoLoaded]);

  const limpiarPoligono = () => {
    setPoligonoPuntos([]);
    const map = mapAutoRef.current;
    if (map) {
      ["poligono-fill", "poligono-line"].forEach((id) => { if (map.getLayer(id)) map.removeLayer(id); });
      if (map.getSource("poligono-libre")) map.removeSource("poligono-libre");
    }
    poligonoLayerAdded.current = false;
  };

  // ── Auto mode: balanceo ──
  const handleAnalizar = () => {
    const vendedoresConPDV: Array<{ vendedor: VendedorSupervision; pdvsPorDia: Record<string, ClienteSupervision[]> }> = [];

    for (const vId of vendedoresAutoIds) {
      const vend = vendedores.find((v) => v.id_vendedor === vId);
      if (!vend) continue;
      const rs = rutas[vId] ?? [];
      const pdvsPorDia: Record<string, ClienteSupervision[]> = {};
      for (const r of rs) {
        const dia = r.dia_semana;
        const cl = clientes[r.id_ruta] ?? [];
        if (!pdvsPorDia[dia]) pdvsPorDia[dia] = [];
        pdvsPorDia[dia].push(...cl);
      }
      vendedoresConPDV.push({ vendedor: vend, pdvsPorDia });
    }

    if (vendedoresConPDV.length < 2) return;

    // Collect all PDVs in area (use all if no area defined, otherwise filter by polygon/cuadrantes)
    const todosLosPDVs: Array<{ pdv: ClienteSupervision; vendedor: VendedorSupervision; dia: string }> = [];
    for (const { vendedor, pdvsPorDia } of vendedoresConPDV) {
      for (const [dia, pdvs] of Object.entries(pdvsPorDia)) {
        for (const pdv of pdvs) {
          todosLosPDVs.push({ pdv, vendedor, dia });
        }
      }
    }

    // Count PDVs per vendor per day
    const cuentas: Record<number, Record<string, number>> = {};
    for (const { vendedor } of vendedoresConPDV) {
      cuentas[vendedor.id_vendedor] = {};
      for (const dia of DIAS_SEMANA) cuentas[vendedor.id_vendedor][dia] = 0;
    }
    for (const { pdv, vendedor, dia } of todosLosPDVs) {
      cuentas[vendedor.id_vendedor][dia] = (cuentas[vendedor.id_vendedor][dia] ?? 0) + 1;
    }

    const recs: RecomendacionRuteo[] = [];
    // Find imbalances: if vendor A has 2+ more than vendor B on a day, suggest move
    const [vA, vB] = [vendedoresConPDV[0], vendedoresConPDV[1]];
    for (const dia of DIAS_SEMANA) {
      const cA = cuentas[vA.vendedor.id_vendedor][dia] ?? 0;
      const cB = cuentas[vB.vendedor.id_vendedor][dia] ?? 0;
      const diff = Math.abs(cA - cB);
      if (diff <= 1) continue;

      const surplus = cA > cB ? vA : vB;
      const deficit = cA > cB ? vB : vA;
      const movimientos = Math.floor(diff / 2);
      const pdvsDelSurplus = (surplus.pdvsPorDia[dia] ?? []).slice(0, movimientos);

      for (const pdv of pdvsDelSurplus) {
        recs.push({
          id_cliente: pdv.id_cliente,
          nombre_cliente: getDisplayName(pdv),
          vendedor_actual: surplus.vendedor.nombre_vendedor,
          id_vendedor_actual: surplus.vendedor.id_vendedor,
          vendedor_sugerido: deficit.vendedor.nombre_vendedor,
          id_vendedor_sugerido: deficit.vendedor.id_vendedor,
          dia_actual: dia,
          dia_sugerido: dia,
          motivo: "Balance de carga",
        });
      }
    }

    setRecomendaciones(recs);
    setRecsSeleccionadas(new Set(recs.map((r) => r.id_cliente)));
  };

  // ── Auto map markers ──
  const pinesAuto = useMemo(() => {
    const result: Array<{ id: number; lat: number; lng: number; nombre: string; color: string }> = [];
    vendedoresAutoIds.forEach((vId, idx) => {
      const rs = rutas[vId] ?? [];
      const color = VENDOR_COLORS[idx % VENDOR_COLORS.length];
      for (const r of rs) {
        for (const p of clientes[r.id_ruta] ?? []) {
          if (hasValidCoords(p.latitud, p.longitud)) {
            result.push({ id: p.id_cliente, lat: p.latitud!, lng: p.longitud!, nombre: getDisplayName(p), color });
          }
        }
      }
    });
    const seen = new Set<number>();
    return result.filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
  }, [vendedoresAutoIds, rutas, clientes]);

  useEffect(() => {
    const map = mapAutoRef.current;
    if (!map || !mapAutoLoaded) return;
    markersAutoRef.current.forEach((m) => m.remove());
    markersAutoRef.current = [];
    for (const p of pinesAuto) {
      const el = document.createElement("div");
      el.style.cssText = `width:10px;height:10px;background:${p.color};border-radius:50%;border:1.5px solid rgba(255,255,255,0.6);box-shadow:0 1px 3px rgba(0,0,0,0.3);cursor:pointer`;
      const popup = new maplibregl.Popup({ offset: 8, closeButton: false, closeOnClick: false })
        .setHTML(`<div style="font-size:11px;padding:4px 6px;font-family:sans-serif;color:#1e293b">${p.nombre}</div>`);
      el.addEventListener("mouseenter", () => popup.setLngLat([p.lng, p.lat]).addTo(map));
      el.addEventListener("mouseleave", () => popup.remove());
      markersAutoRef.current.push(new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([p.lng, p.lat]).addTo(map));
    }
  }, [pinesAuto, mapAutoLoaded]);

  // ── PDF helpers ──
  const handleGenerarPDF = async () => {
    const makeSlot = (
      vId: number | null,
      rutasLoc: RutaSupervision[],
      clLoc: Record<number, ClienteSupervision[]>
    ) => {
      if (!vId) return null;
      const vend = vendedores.find((v) => v.id_vendedor === vId);
      if (!vend) return null;
      return { vendedor: vend, rutasLocal: rutasLoc, clientesPorRuta: clLoc };
    };
    await generarPDFRuteo(
      makeSlot(vendedorAId, rutasLocalesA, clientesLocalesA),
      makeSlot(vendedorBId, rutasLocalesB, clientesLocalesB)
    );
  };

  // ── Render ──
  const panelBase: React.CSSProperties = {
    background: "var(--shelfy-panel, #0f172a)",
    color: "var(--shelfy-text, #e2e8f0)",
    borderRadius: 14,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
  };

  const btnBase: React.CSSProperties = {
    padding: "6px 14px",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
    color: "var(--shelfy-text, #e2e8f0)",
    fontSize: 12,
    cursor: "pointer",
    fontWeight: 600,
    transition: "background 0.15s, border-color 0.15s",
  };

  const btnActive: React.CSSProperties = {
    ...btnBase,
    background: "#6366f1",
    borderColor: "#6366f1",
    color: "#fff",
  };

  return (
    <div style={{ ...panelBase, height: "100%", minHeight: 500 }}>
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          flexShrink: 0,
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        {/* Sub-mode toggle */}
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <Route size={16} style={{ color: "#6366f1", marginRight: 4 }} />
          <span style={{ fontSize: 13, fontWeight: 700, marginRight: 8 }}>Modo Ruteo</span>
          <button
            style={subModo === "manual" ? btnActive : btnBase}
            onClick={() => setSubModo("manual")}
          >
            Manual
          </button>
          <button
            style={subModo === "automatico" ? btnActive : btnBase}
            onClick={() => setSubModo("automatico")}
          >
            Automático
          </button>
        </div>

        {/* Right actions */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {hayCambios && subModo === "manual" && (
            <span style={{ fontSize: 11, color: "#f59e0b", fontStyle: "italic" }}>
              Cambios sin guardar
              {/* TODO: implementar POST /api/admin/rutas/reasignar cuando esté disponible */}
            </span>
          )}
          <button
            style={{ ...btnBase, display: "flex", alignItems: "center", gap: 5 }}
            onClick={handleGenerarPDF}
            title="Generar PDF de planilla de ruteo"
          >
            <FileText size={14} />
            PDF
          </button>
          {onClose && (
            <button
              style={{ ...btnBase, padding: "6px 8px" }}
              onClick={onClose}
              title="Cerrar modo ruteo"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
        {subModo === "manual" ? (
          /* ===== MANUAL MODE ===== */
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "220px 1fr 220px",
              height: "100%",
              gap: 0,
            }}
          >
            {/* Columna A */}
            <div
              style={{
                padding: 12,
                borderRight: "1px solid rgba(255,255,255,0.07)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <VendedorSlot
                vendedores={vendedores}
                selected={vendedorAId}
                exclude={vendedorBId}
                onChange={setVendedorAId}
                color={VENDOR_COLORS[0]}
                rutasLocal={rutasLocalesA}
                clientesPorRuta={clientesLocalesA}
                draggingId={draggingId}
                onDragStart={(id, ruta) => handleDragStart(id, ruta, "A")}
                onDrop={(ruta) => handleDrop(ruta, "A")}
                onDragOver={(e) => e.preventDefault()}
                dropTargetRuta={dropTargetA}
                setDropTargetRuta={setDropTargetA}
                label="Vendedor A"
              />
            </div>

            {/* Mapa central */}
            <div style={{ position: "relative", overflow: "hidden" }}>
              <Map
                ref={mapManualRef}
                theme="dark"
                onLoad={() => setMapManualLoaded(true)}
                center={[-63.0, -34.0]}
                zoom={5}
              />
              {/* Leyenda */}
              {(vendedorAId || vendedorBId) && (
                <div
                  style={{
                    position: "absolute",
                    bottom: 10,
                    left: 10,
                    background: "rgba(10,14,24,0.88)",
                    borderRadius: 8,
                    padding: "6px 10px",
                    fontSize: 11,
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    zIndex: 10,
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  {vendedorAId && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: VENDOR_COLORS[0], display: "inline-block" }} />
                      <span style={{ color: "#e2e8f0" }}>{vendedores.find((v) => v.id_vendedor === vendedorAId)?.nombre_vendedor}</span>
                    </div>
                  )}
                  {vendedorBId && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: VENDOR_COLORS[1], display: "inline-block" }} />
                      <span style={{ color: "#e2e8f0" }}>{vendedores.find((v) => v.id_vendedor === vendedorBId)?.nombre_vendedor}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Columna B */}
            <div
              style={{
                padding: 12,
                borderLeft: "1px solid rgba(255,255,255,0.07)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <VendedorSlot
                vendedores={vendedores}
                selected={vendedorBId}
                exclude={vendedorAId}
                onChange={setVendedorBId}
                color={VENDOR_COLORS[1]}
                rutasLocal={rutasLocalesB}
                clientesPorRuta={clientesLocalesB}
                draggingId={draggingId}
                onDragStart={(id, ruta) => handleDragStart(id, ruta, "B")}
                onDrop={(ruta) => handleDrop(ruta, "B")}
                onDragOver={(e) => e.preventDefault()}
                dropTargetRuta={dropTargetB}
                setDropTargetRuta={setDropTargetB}
                label="Vendedor B"
              />
            </div>
          </div>
        ) : (
          /* ===== AUTOMÁTICO MODE ===== */
          <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
            {/* Toolbar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                borderBottom: "1px solid rgba(255,255,255,0.07)",
                flexShrink: 0,
                flexWrap: "wrap",
              }}
            >
              {/* Vendedor multi-select */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>
                  Vendedores:
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {vendedores.map((v, idx) => {
                    const sel = vendedoresAutoIds.includes(v.id_vendedor);
                    const color = VENDOR_COLORS[idx % VENDOR_COLORS.length];
                    return (
                      <button
                        key={v.id_vendedor}
                        onClick={() => toggleVendedorAuto(v.id_vendedor)}
                        style={{
                          ...btnBase,
                          padding: "3px 10px",
                          fontSize: 11,
                          borderColor: sel ? color + "88" : "rgba(255,255,255,0.1)",
                          background: sel ? color + "22" : "rgba(255,255,255,0.04)",
                          color: sel ? color : "#94a3b8",
                        }}
                      >
                        {v.nombre_vendedor}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Herramientas */}
              <div style={{ display: "flex", gap: 4, marginLeft: "auto", alignItems: "center" }}>
                <button
                  style={herramientaAuto === "grilla" ? { ...btnActive, display: "flex", alignItems: "center", gap: 5 } : { ...btnBase, display: "flex", alignItems: "center", gap: 5 }}
                  onClick={() => setHerramientaAuto("grilla")}
                >
                  <Grid3X3 size={13} />
                  Grilla
                </button>
                <button
                  style={herramientaAuto === "libre" ? { ...btnActive, display: "flex", alignItems: "center", gap: 5 } : { ...btnBase, display: "flex", alignItems: "center", gap: 5 }}
                  onClick={() => setHerramientaAuto("libre")}
                >
                  <PenLine size={13} />
                  Dibujar libre
                </button>

                {herramientaAuto === "grilla" && (
                  <>
                    <select
                      value={celdaSize}
                      onChange={(e) => setCeldaSize(Number(e.target.value) as CeldaSize)}
                      style={{
                        ...btnBase,
                        padding: "5px 8px",
                        appearance: "none",
                        minWidth: 70,
                      }}
                    >
                      <option value={500}>500 m</option>
                      <option value={1000}>1 km</option>
                      <option value={2000}>2 km</option>
                    </select>
                    <button style={btnBase} onClick={calcularGrilla}>
                      Aplicar grilla
                    </button>
                  </>
                )}

                {herramientaAuto === "libre" && (
                  <>
                    <button
                      style={poligonoActivo ? { ...btnActive, display: "flex", alignItems: "center", gap: 5 } : { ...btnBase, display: "flex", alignItems: "center", gap: 5 }}
                      onClick={() => { setPoligonoActivo(!poligonoActivo); if (!poligonoActivo) setPoligonoPuntos([]); }}
                    >
                      {poligonoActivo ? "Terminar dibujo" : "Iniciar dibujo"}
                    </button>
                    {poligonoPuntos.length > 0 && (
                      <button style={{ ...btnBase, color: "#f87171", borderColor: "#f8717144" }} onClick={limpiarPoligono}>
                        Limpiar
                      </button>
                    )}
                  </>
                )}

                <button
                  style={{
                    ...btnBase,
                    background: "#10b981",
                    borderColor: "#10b981",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                  onClick={handleAnalizar}
                  disabled={vendedoresAutoIds.length < 2}
                >
                  <Wand2 size={13} />
                  Analizar
                </button>
              </div>
            </div>

            {/* Mapa */}
            <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
              <Map
                ref={mapAutoRef}
                theme="dark"
                onLoad={() => setMapAutoLoaded(true)}
                center={[-63.0, -34.0]}
                zoom={6}
              />
              {poligonoActivo && (
                <div
                  style={{
                    position: "absolute",
                    top: 10,
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "rgba(245,158,11,0.9)",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "5px 14px",
                    borderRadius: 20,
                    zIndex: 10,
                    pointerEvents: "none",
                  }}
                >
                  Click para agregar punto · Doble-click para cerrar polígono
                </div>
              )}
            </div>

            {/* Recomendaciones */}
            {recomendaciones.length > 0 && (
              <div
                style={{
                  flexShrink: 0,
                  maxHeight: 220,
                  overflowY: "auto",
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                  padding: "10px 14px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700 }}>
                    {recomendaciones.length} recomendaciones de balanceo
                  </span>
                  <button
                    style={{
                      ...btnBase,
                      fontSize: 11,
                      background: "#6366f1",
                      borderColor: "#6366f1",
                      color: "#fff",
                    }}
                    onClick={() => {
                      // TODO: POST /api/admin/rutas/reasignar con recsSeleccionadas
                      alert("Aplicar cambios: funcionalidad pendiente de backend");
                    }}
                  >
                    Aplicar seleccionados ({recsSeleccionadas.size})
                  </button>
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ color: "#64748b" }}>
                      <th style={{ textAlign: "left", padding: "3px 6px", fontWeight: 600 }}>#</th>
                      <th style={{ textAlign: "left", padding: "3px 6px", fontWeight: 600 }}>PDV</th>
                      <th style={{ textAlign: "left", padding: "3px 6px", fontWeight: 600 }}>Vendedor actual</th>
                      <th style={{ textAlign: "center", padding: "3px 6px" }}>→</th>
                      <th style={{ textAlign: "left", padding: "3px 6px", fontWeight: 600 }}>Vendedor sugerido</th>
                      <th style={{ textAlign: "left", padding: "3px 6px", fontWeight: 600 }}>Día</th>
                      <th style={{ textAlign: "left", padding: "3px 6px", fontWeight: 600 }}>Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recomendaciones.map((rec) => {
                      const sel = recsSeleccionadas.has(rec.id_cliente);
                      return (
                        <tr
                          key={rec.id_cliente}
                          onClick={() =>
                            setRecsSeleccionadas((prev) => {
                              const next = new Set(prev);
                              if (next.has(rec.id_cliente)) next.delete(rec.id_cliente);
                              else next.add(rec.id_cliente);
                              return next;
                            })
                          }
                          style={{
                            cursor: "pointer",
                            background: sel ? "rgba(99,102,241,0.12)" : "transparent",
                            borderRadius: 5,
                            transition: "background 0.1s",
                          }}
                        >
                          <td style={{ padding: "4px 6px" }}>
                            <input type="checkbox" readOnly checked={sel} style={{ accentColor: "#6366f1" }} />
                          </td>
                          <td style={{ padding: "4px 6px", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {rec.nombre_cliente}
                          </td>
                          <td style={{ padding: "4px 6px", color: "#f87171" }}>{rec.vendedor_actual}</td>
                          <td style={{ padding: "4px 6px", textAlign: "center", color: "#94a3b8" }}>→</td>
                          <td style={{ padding: "4px 6px", color: "#4ade80" }}>{rec.vendedor_sugerido}</td>
                          <td style={{ padding: "4px 6px", color: "#94a3b8" }}>{rec.dia_actual}</td>
                          <td style={{ padding: "4px 6px", color: "#64748b", fontStyle: "italic" }}>{rec.motivo}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
