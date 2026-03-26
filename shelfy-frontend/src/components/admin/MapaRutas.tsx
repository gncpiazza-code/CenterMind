"use client";
import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

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

function FitBounds({ pines }: { pines: PinCliente[] }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || pines.length === 0) return;
    const valid = pines.filter(p => p.lat && p.lng);
    if (valid.length === 0) return;
    const bounds = valid.map(p => [p.lat, p.lng] as [number, number]);
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
    fitted.current = true;
  }, [pines, map]);
  return null;
}

export default function MapaRutas({ pines }: { pines: PinCliente[] }) {
  const conCoords = pines.filter(p => p.lat && p.lng);
  return (
    <MapContainer
      center={[-34.6, -58.4]}
      zoom={9}
      style={{ height: "100%", width: "100%", borderRadius: "16px" }}
      className="z-0"
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
        maxZoom={19}
      />
      <FitBounds pines={conCoords} />
      {conCoords.map(p => (
        <CircleMarker
          key={p.id}
          center={[p.lat, p.lng]}
          radius={p.activo ? 6 : 4}
          pathOptions={{
            color:       p.activo ? p.color : "#6b7280",
            fillColor:   p.activo ? p.color : "#9ca3af",
            fillOpacity: p.activo ? 0.85 : 0.25,
            weight: 1.5,
          }}
        >
          <Popup>
            <div style={{ minWidth: 160, fontSize: 13 }}>
              <p style={{ fontWeight: 700, marginBottom: 2 }}>{p.nombre}</p>
              <p style={{ color: p.color, fontSize: 11, marginBottom: 4 }}>● {p.vendedor}</p>
              {p.ultimaCompra && <p style={{ fontSize: 11 }}>Últ. compra: {p.ultimaCompra}</p>}
              {!p.activo && <p style={{ color: "#f87171", fontSize: 11, marginTop: 4 }}>⚠ Sin actividad reciente</p>}
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
