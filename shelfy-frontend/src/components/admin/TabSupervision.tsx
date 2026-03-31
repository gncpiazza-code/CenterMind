"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import {
  ChevronRight,
  MapPin,
  ShoppingCart,
  Calendar,
  Loader2,
  AlertCircle,
  RefreshCw,
  Route as RouteIcon,
  Map as MapIcon,
  Eye,
  EyeOff,
  Building2,
  TrendingUp,
  CreditCard,
  Printer,
  Radar,
  X,
} from "lucide-react";
import {
  fetchVendedoresSupervision,
  fetchRutasSupervision,
  fetchClientesSupervision,
  fetchDistribuidoras,
  fetchVentasSupervision,
  fetchCuentasSupervision,
  fetchPDVsCercanos,
  fetchClienteInfo,
  type PDVsCercanosResponse,
  type VendedorSupervision,
  type RutaSupervision,
  type ClienteSupervision,
  type Distribuidora,
  type VentasSupervision,
  type CuentasSupervision,
  type PDVCercano,
  type ClienteContacto,
} from "@/lib/api";
import type { PinCliente } from "./MapaRutas";
import { useSupervisionStore } from "@/store/useSupervisionStore";

// ── Map: SSR off ──────────────────────────────────────────────────────────────
const MapaRutas = dynamic(() => import("./MapaRutas"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[var(--shelfy-panel)]">
      <Loader2 className="w-5 h-5 animate-spin text-[var(--shelfy-muted)]" />
    </div>
  ),
});

// ── Vendor color palette ──────────────────────────────────────────────────────
const VENDOR_COLORS = [
  "#22d3ee", // cyan
  "#4ade80", // green
  "#f59e0b", // amber
  "#f87171", // red
  "#a78bfa", // violet
  "#fb7185", // rose
  "#34d399", // emerald
  "#60a5fa", // blue
  "#fbbf24", // yellow
  "#e879f9", // fuchsia
  "#2dd4bf", // teal
  "#fb923c", // orange
  "#a3e635", // lime
  "#818cf8", // indigo
  "#f472b6", // pink
  "#38bdf8", // sky
];
const vendorColor = (i: number) => VENDOR_COLORS[i % VENDOR_COLORS.length];

// ── Day badge ─────────────────────────────────────────────────────────────────
const DIA_COLOR: Record<string, string> = {
  "Lunes":     "bg-blue-500/15 text-blue-400 border-blue-500/25",
  "Martes":    "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  "Miércoles": "bg-violet-500/15 text-violet-400 border-violet-500/25",
  "Jueves":    "bg-orange-500/15 text-orange-400 border-orange-500/25",
  "Viernes":   "bg-rose-500/15 text-rose-400 border-rose-500/25",
  "Sábado":    "bg-amber-500/15 text-amber-400 border-amber-500/25",
  "Domingo":   "bg-red-500/15 text-red-400 border-red-500/25",
  "Variable":  "bg-slate-500/15 text-slate-400 border-slate-500/25",
};
function DiaBadge({ dia }: { dia: string }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${DIA_COLOR[dia] ?? DIA_COLOR["Variable"]}`}>
      {dia}
    </span>
  );
}

// ── Smooth accordion ──────────────────────────────────────────────────────────
function Accordion({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateRows: open ? "1fr" : "0fr",
      transition: "grid-template-rows 250ms ease",
    }}>
      <div style={{ overflow: "hidden" }}>{children}</div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(date: string | null): string | null {
  if (!date) return null;
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}
function isInactivo(fecha: string | null): boolean {
  if (!fecha) return true;
  return Date.now() - new Date(fecha).getTime() > 90 * 86_400_000;
}
/** For map pins: inactive = no purchase in last 30 days (or never) */
function isInactivo30(fecha: string | null): boolean {
  if (!fecha) return true;
  return Date.now() - new Date(fecha).getTime() > 30 * 86_400_000;
}
/** Returns true if fecha is within `days` days from today */
function isRecentDate(fecha: string | null | undefined, days: number): boolean {
  if (!fecha) return false;
  return Date.now() - new Date(fecha).getTime() <= days * 86_400_000;
}
/**
 * Returns true only if the coords are non-null, non-zero, and within
 * Argentina's bounding box (lat -55..−21, lng -74..−53).
 * Filters null-island (0,0), missing data, and stray out-of-country values.
 */
function hasValidCoords(lat: number | null, lng: number | null): boolean {
  if (!lat || !lng) return false;
  return lat >= -55 && lat <= -21 && lng >= -74 && lng <= -53;
}
function diasDesde(fecha: string | null | undefined): string {
  if (!fecha) return "Sin registro";
  const dias = Math.floor((Date.now() - new Date(fecha).getTime()) / 86_400_000);
  if (dias === 0) return "Hoy";
  if (dias === 1) return "Ayer";
  return `Hace ${dias} días`;
}

// ── Day sort order ─────────────────────────────────────────────────────────────
const DIA_ORDER: Record<string, number> = {
  lunes: 1, martes: 2, miercoles: 3, miércoles: 3, jueves: 4,
  viernes: 5, sabado: 6, sábado: 6, domingo: 7,
};

// ── Vendor avatar ─────────────────────────────────────────────────────────────
const RANGO_COLORS: Record<string, string> = {
  "1-7 Días":   "bg-green-500/15 text-green-400 border-green-500/25",
  "8-15 Días":  "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  "16-21 Días": "bg-orange-500/15 text-orange-400 border-orange-500/25",
  "22-30 Días": "bg-red-500/15 text-red-400 border-red-500/25",
  "+30 Días":   "bg-rose-500/15 text-rose-400 border-rose-500/25",
};

const VendorAvatar = ({ nombre, color }: { nombre: string; color: string }) => {
  const initials = nombre.trim().split(/\s+/).slice(0, 2)
    .map(w => w[0] ?? "").join("").toUpperCase() || "?";
  return (
    <div
      className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 select-none"
      style={{ backgroundColor: color + "22", color }}
    >
      {initials}
    </div>
  );
};

// ── Small eye toggle button ───────────────────────────────────────────────────
function EyeBtn({
  on, loading, color, onClick, title,
}: {
  on: boolean; loading?: boolean; color?: string;
  onClick: () => void; title?: string;
}) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      title={title ?? (on ? "Ocultar del mapa" : "Mostrar en mapa")}
      className={`hidden xl:flex w-6 h-6 rounded-md items-center justify-center border transition-all duration-200 shrink-0 ${
        on
          ? "border-transparent text-white"
          : "border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] hover:border-current"
      }`}
      style={on && color ? { backgroundColor: color, boxShadow: `0 0 6px ${color}55` } : {}}
    >
      {loading
        ? <Loader2 className="w-3 h-3 animate-spin" />
        : on
          ? <Eye className="w-3 h-3" />
          : <EyeOff className="w-3 h-3" />
      }
    </button>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface TabSupervisionProps {
  distId: number;
  isSuperadmin?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function TabSupervision({ distId, isSuperadmin }: TabSupervisionProps) {
  const queryClient = useQueryClient();
  const [selectedDist, setSelectedDist]         = useState(distId);
  
  // Zustand store for persistent visibility state
  const {
    selectedSucursal,
    setSelectedSucursal,
    visibleVends,
    visibleRutas,
    visibleClientes,
    toggleVendor: toggleVendorStore,
    toggleRuta: toggleRutaStore,
    toggleCliente: toggleClienteStore,
    setVisibleVends,
    setVisibleRutas,
    setVisibleClientes,
    clearAll,
  } = useSupervisionStore();

  // accordion state (local UI only)
  const [openVend, setOpenVend]                 = useState<number | null>(null);
  const [openRuta, setOpenRuta]                 = useState<number | null>(null);
  const [openCliente, setOpenCliente]           = useState<number | null>(null);

  // loading states for async operations
  const [loadingMap, setLoadingMap]             = useState<Set<number>>(new Set());

  // ── Scanner GPS ───────────────────────────────────────────────────────────
  const [scannerOpen, setScannerOpen]           = useState(false);
  const [scannerLoading, setScannerLoading]     = useState(false);
  const [pdvsCercanos, setPdvsCercanos]         = useState<PDVCercano[]>([]);
  const [scannerFallback, setScannerFallback]   = useState(false);
  const [gpsError, setGpsError]                 = useState<string | null>(null);

  // ── ShelfyMaps ────────────────────────────────────────────────────────────
  const [shelfyMapsOpen, setShelfyMapsOpen]     = useState(false);
  const [showGpsDialog, setShowGpsDialog]       = useState(false);
  const [shelfyGpsGranted, setShelfyGpsGranted] = useState(false);
  const [shelfyFilterOpen, setShelfyFilterOpen] = useState(false);

  // ── Ventas & Cuentas ──────────────────────────────────────────────────────
  const [ventasDias, setVentasDias]             = useState<7 | 30 | 90>(30);
  const [ventasData, setVentasData]             = useState<VentasSupervision | null>(null);
  const [loadingVentas, setLoadingVentas]       = useState(false);
  const [openVentasVend, setOpenVentasVend]     = useState<string | null>(null);
  const [cuentasData, setCuentasData]           = useState<CuentasSupervision | null>(null);
  const [loadingCuentas, setLoadingCuentas]     = useState(false);
  const [openCuentasVend, setOpenCuentasVend]   = useState<string | null>(null);
  const [clientePopup, setClientePopup]         = useState<{
    nombre: string;
    data: ClienteContacto[] | null;
    loading: boolean;
  } | null>(null);
  const [ccSort, setCcSort] = useState<{ col: "dias" | "deuda"; asc: boolean }>({ col: "dias", asc: false });

  // ── TanStack Query: Distribuidoras ────────────────────────────────────────
  const { data: distribuidoras = [] } = useQuery({
    queryKey: ['distribuidoras'],
    queryFn: () => fetchDistribuidoras(true),
    enabled: isSuperadmin,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // ── Sync selectedDist when distId changes (handles auth loading delay) ─────
  useEffect(() => {
    if (!isSuperadmin && distId > 0 && distId !== selectedDist) {
      setSelectedDist(distId);
    }
  }, [distId, isSuperadmin, selectedDist]);

  // ── TanStack Query: Vendedores ────────────────────────────────────────────
  const {
    data: vendedores = [],
    isLoading: loading,
    error: vendedoresError,
    refetch: refetchVendedores,
  } = useQuery({
    queryKey: ['supervision-vendedores', selectedDist],
    queryFn: () => fetchVendedoresSupervision(selectedDist),
    enabled: !!selectedDist,
    staleTime: 2 * 60 * 1000, // 2 minutes - vendedores don't change often
    placeholderData: (prev) => prev, // Keep previous data while refetching
  });

  const error = vendedoresError ? (vendedoresError instanceof Error ? vendedoresError.message : "Error cargando datos") : null;

  // Auto-select sucursal if only one exists
  useEffect(() => {
    if (vendedores.length > 0 && !selectedSucursal) {
      const slist = [...new Set(vendedores.map(v => v.sucursal_nombre))];
      if (slist.length === 1) setSelectedSucursal(slist[0]);
    }
  }, [vendedores, selectedSucursal, setSelectedSucursal]);

  // Clear visibility when changing distributor
  useEffect(() => {
    clearAll();
    setOpenVend(null);
    setOpenRuta(null);
    setOpenCliente(null);
  }, [selectedDist, clearAll]);

  useEffect(() => {
    if (!selectedDist) return;
    setVentasData(null);
    setLoadingVentas(true);
    fetchVentasSupervision(selectedDist, ventasDias)
      .then(setVentasData).catch(() => {}).finally(() => setLoadingVentas(false));
  }, [selectedDist, ventasDias]);

  useEffect(() => {
    if (!selectedDist || !selectedSucursal) {
      setCuentasData(null);
      return;
    }
    setCuentasData(null);
    setLoadingCuentas(true);
    fetchCuentasSupervision(selectedDist, selectedSucursal)
      .then(setCuentasData)
      .catch(() => {})
      .finally(() => setLoadingCuentas(false));
  }, [selectedDist, selectedSucursal]);

  // ── Derived & Filtered ────────────────────────────────────────────────────
  const sucursales = useMemo(() =>
    [...new Set(vendedores.map(v => v.sucursal_nombre))].sort(),
    [vendedores]
  );

  const vendedoresFiltrados = useMemo(() =>
    selectedSucursal ? vendedores.filter(v => v.sucursal_nombre === selectedSucursal) : [],
    [vendedores, selectedSucursal]
  );

  const ventasFiltradas = useMemo(() => {
    if (!ventasData || !selectedSucursal) return null;
    // Buscamos vendedores que pertenecen a esta sucursal en el listado base
    const vendsInSuc = new Set(vendedoresFiltrados.map(v => v.nombre_vendedor.toLowerCase()));
    const filteredVends = ventasData.vendedores.filter(v => vendsInSuc.has(v.vendedor.toLowerCase()));
    
    return {
      ...ventasData,
      total_facturado: filteredVends.reduce((s, v) => s + v.monto_total, 0),
      total_recaudado: filteredVends.reduce((s, v) => s + v.monto_recaudado, 0),
      total_facturas: filteredVends.reduce((s, v) => s + v.total_facturas, 0),
      vendedores: filteredVends
    };
  }, [ventasData, selectedSucursal, vendedoresFiltrados]);

  // Backend ya filtra por sucursal — cuentasData llega pre-filtrado
  const cuentasFiltradas = cuentasData ?? null;

  // ── Print cuentas corrientes ─────────────────────────────────────────────
  function handlePrintCuentas() {
    if (!cuentasFiltradas) return;
    const data = cuentasFiltradas;
    const fmtN = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
    const coloresDia: Record<string, string> = {
      "1-7 Días": "#16a34a", "8-15 Días": "#ca8a04",
      "16-21 Días": "#ea580c", "22-30 Días": "#dc2626", "+30 Días": "#9f1239",
    };
    const vendedoresHTML = data.vendedores.map((v: any, vIdx: number) => {
      const filas = v.clientes.map((c: any) => {
        const dias = c.antiguedad ?? 0;
        const colorDias = dias > 30 ? "#dc2626" : dias > 21 ? "#ea580c" : dias > 15 ? "#ca8a04" : dias > 7 ? "#16a34a" : "#6b7280";
        return `<tr>
          <td style="padding:4px 8px;border:1px solid #e5e7eb;font-size:9px">${c.cliente ?? "-"}</td>
          <td style="padding:4px 8px;border:1px solid #e5e7eb;font-size:9px;color:#6b7280">${c.sucursal ?? "-"}</td>
          <td style="padding:4px 8px;border:1px solid #e5e7eb;font-size:9px;text-align:center;color:${colorDias};font-weight:bold">${dias}</td>
          <td style="padding:4px 8px;border:1px solid #e5e7eb;font-size:9px;text-align:center">${c.cantidad_comprobantes ?? "-"}</td>
          <td style="padding:4px 8px;border:1px solid #e5e7eb;font-size:9px;text-align:right;font-weight:600">$${fmtN(c.deuda_total)}</td>
        </tr>`;
      }).join("");
      return `<div style="${vIdx > 0 ? "page-break-before:always;" : ""}margin-bottom:20px">
        <div style="background:#1f2937;color:white;padding:8px 12px;border-radius:6px 6px 0 0;display:flex;align-items:center;gap:16px">
          <span style="font-weight:700;font-size:11px;flex:1">${v.vendedor}</span>
          <span style="font-size:10px;color:#fbbf24">Deuda: $${fmtN(v.deuda_total)}</span>
          <span style="font-size:9px;color:#9ca3af">${v.cantidad_clientes} clientes</span>
        </div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="background:#f3f4f6">
            <th style="padding:5px 8px;border:1px solid #d1d5db;font-size:8px;text-align:left;text-transform:uppercase;letter-spacing:.4px">Cliente</th>
            <th style="padding:5px 8px;border:1px solid #d1d5db;font-size:8px;text-align:left;text-transform:uppercase;letter-spacing:.4px">Sucursal</th>
            <th style="padding:5px 8px;border:1px solid #d1d5db;font-size:8px;text-align:center;text-transform:uppercase;letter-spacing:.4px">Días</th>
            <th style="padding:5px 8px;border:1px solid #d1d5db;font-size:8px;text-align:center;text-transform:uppercase;letter-spacing:.4px">Comprobantes</th>
            <th style="padding:5px 8px;border:1px solid #d1d5db;font-size:8px;text-align:right;text-transform:uppercase;letter-spacing:.4px">Deuda</th>
          </tr></thead>
          <tbody>${filas}</tbody>
          <tfoot><tr style="background:#f9fafb;border-top:2px solid #d1d5db">
            <td colspan="4" style="padding:5px 8px;font-size:9px;text-align:right;font-weight:700">Total</td>
            <td style="padding:5px 8px;font-size:9px;text-align:right;font-weight:700">$${fmtN(v.deuda_total)}</td>
          </tr></tfoot>
        </table>
      </div>`;
    }).join("");

    const rangoBadges = Object.entries(coloresDia).map(([label, color]) => {
      const count = data.vendedores.flatMap((v: any) => v.clientes)
        .filter((c: any) => c.rango_antiguedad === label).length;
      if (!count) return "";
      return `<span style="display:inline-block;margin:2px 4px;padding:3px 8px;border-radius:4px;font-size:9px;background:${color}22;color:${color};border:1px solid ${color}55;font-weight:600">${label}: ${count}</span>`;
    }).join("");

    const html = `<!DOCTYPE html><html lang="es"><head>
      <meta charset="UTF-8">
      <title>Cuentas Corrientes</title>
      <style>
        @page { size: A4 portrait; margin: 1.5cm 1.2cm; }
        body { font-family: Arial, sans-serif; color: #1a1a1a; margin: 0; }
        @media print { * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style>
    </head><body>
      <div style="border-bottom:3px solid #1f2937;padding-bottom:12px;margin-bottom:16px">
        <h1 style="margin:0;font-size:18px;font-weight:900">Cuentas Corrientes</h1>
        <p style="margin:4px 0 0;font-size:11px;color:#6b7280">Al ${data.fecha ?? "—"} · Impreso el ${new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}</p>
      </div>
      <div style="display:flex;gap:20px;margin-bottom:16px;padding:10px 14px;background:#f9fafb;border-radius:6px;border:1px solid #e5e7eb">
        <div><div style="font-size:8px;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px">Deuda Total</div><div style="font-size:16px;font-weight:900;color:#d97706">$${fmtN(data.metadatos?.total_deuda ?? 0)}</div></div>
        <div><div style="font-size:8px;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px">Clientes Deudores</div><div style="font-size:16px;font-weight:900">${(data.metadatos?.clientes_deudores ?? 0).toLocaleString()}</div></div>
        <div><div style="font-size:8px;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px">Vendedores</div><div style="font-size:16px;font-weight:900">${data.vendedores.length}</div></div>
        <div><div style="font-size:8px;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px">Prom. Días Atraso</div><div style="font-size:16px;font-weight:900">${Math.round(data.metadatos?.promedio_dias_retraso ?? 0)} días</div></div>
      </div>
      ${rangoBadges ? `<div style="margin-bottom:16px">${rangoBadges}</div>` : ""}
      ${vendedoresHTML}
    </body></html>`;

    const win = window.open("", "_blank", "width=900,height=950");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  }

  // ── CC Cliente info popup ────────────────────────────────────────────────
  const handleClienteClick = async (nombre: string, idClienteErp?: string | null) => {
    setClientePopup({ nombre, data: null, loading: true });
    try {
      const data = await fetchClienteInfo(selectedDist, nombre, idClienteErp);
      setClientePopup({ nombre, data, loading: false });
    } catch {
      setClientePopup({ nombre, data: [], loading: false });
    }
  };

  // ── Scanner GPS handler ───────────────────────────────────────────────────
  const handleScanner = () => {
    setGpsError(null);
    setScannerLoading(true);
    setScannerOpen(true);
    setPdvsCercanos([]);
    setScannerFallback(false);

    if (!navigator.geolocation) {
      setGpsError("Tu dispositivo no soporta geolocalización");
      setScannerLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res: PDVsCercanosResponse = await fetchPDVsCercanos(
            selectedDist,
            pos.coords.latitude,
            pos.coords.longitude,
            5000
          );
          setPdvsCercanos(res.pdvs);
          setScannerFallback(res.fallback);
        } catch (err) {
          setGpsError(`Error al buscar PDVs: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          setScannerLoading(false);
        }
      },
      (err) => {
        setGpsError(
          err.code === 1
            ? "Permiso de ubicación denegado. Habilitalo en la configuración del navegador."
            : "No se pudo obtener tu ubicación"
        );
        setScannerLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // ── ShelfyMaps: open with optional GPS dialog ────────────────────────────
  const handleShelfyMaps = async () => {
    // Check if permission API is available and already granted
    if (typeof navigator !== "undefined" && navigator.permissions) {
      try {
        const result = await navigator.permissions.query({ name: "geolocation" as PermissionName });
        if (result.state === "granted") {
          setShelfyGpsGranted(true);
          setShelfyMapsOpen(true);
          return;
        }
      } catch {
        // permissions API not supported, fall through to dialog
      }
    }
    // Show GPS dialog
    setShowGpsDialog(true);
  };

  const handleGpsActivar = () => {
    if (!navigator.geolocation) {
      setShowGpsDialog(false);
      setShelfyMapsOpen(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => {
        setShelfyGpsGranted(true);
        setShowGpsDialog(false);
        setShelfyMapsOpen(true);
      },
      () => {
        setShelfyGpsGranted(false);
        setShowGpsDialog(false);
        setShelfyMapsOpen(true);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // ── TanStack Query: Rutas (lazy-loaded per vendor) ───────────────────────
  const getRutasQuery = (vendorId: number) => ({
    queryKey: ['supervision-rutas', vendorId],
    queryFn: () => fetchRutasSupervision(vendorId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: false, // Lazy load
  });

  // ── TanStack Query: Clientes (lazy-loaded per ruta) ──────────────────────
  const getClientesQuery = (rutaId: number) => ({
    queryKey: ['supervision-clientes', rutaId],
    queryFn: () => fetchClientesSupervision(rutaId),
    staleTime: Infinity, // Clientes don't change often - cache forever until manual invalidation
    enabled: false, // Lazy load
  });

  // ── Accordion handlers with query prefetching ─────────────────────────────
  async function handleVend(id: number) {
    if (openVend === id) { 
      setOpenVend(null); 
      return; 
    }
    setOpenVend(id); 
    setOpenRuta(null); 
    setOpenCliente(null);
    
    // Prefetch rutas if not in cache
    await queryClient.prefetchQuery(getRutasQuery(id));
  }

  async function handleRuta(id: number) {
    if (openRuta === id) { 
      setOpenRuta(null); 
      return; 
    }
    setOpenRuta(id); 
    setOpenCliente(null);
    
    // Prefetch clientes if not in cache
    await queryClient.prefetchQuery(getClientesQuery(id));
  }

  function handleCliente(id: number) {
    setOpenCliente(openCliente === id ? null : id);
  }

  // ── Load helper: all routes+clients for one vendor (uses query cache) ────
  async function loadDataForVendor(vendId: number): Promise<{
    vendRutas: RutaSupervision[];
    allClientIds: number[];
    allRutaIds: number[];
  }> {
    // Fetch or get from cache
    const vendRutas = await queryClient.fetchQuery(getRutasQuery(vendId));
    const allRutaIds: number[] = vendRutas.map(r => r.id_ruta);
    const allClientIds: number[] = [];
    
    // Fetch all clientes in parallel
    await Promise.all(
      vendRutas.map(async r => {
        const cli = await queryClient.fetchQuery(getClientesQuery(r.id_ruta));
        cli.forEach(c => allClientIds.push(c.id_cliente));
      })
    );
    
    return { vendRutas, allClientIds, allRutaIds };
  }

  // ── VENDOR TOGGLE (uses Zustand store) ───────────────────────────────────
  async function toggleVendor(vendId: number) {
    const isOn = visibleVends.has(vendId);
    if (isOn) {
      // Turn OFF: remove vendor from map
      toggleVendorStore(vendId);
    } else {
      // Turn ON: load everything, enable all routes+clients
      setLoadingMap(p => new Set([...p, vendId]));
      try {
        const { allRutaIds, allClientIds } = await loadDataForVendor(vendId);
        setVisibleVends(new Set([...visibleVends, vendId]));
        setVisibleRutas(new Set([...visibleRutas, ...allRutaIds]));
        setVisibleClientes(new Set([...visibleClientes, ...allClientIds]));
      } finally {
        setLoadingMap(p => { const s = new Set(p); s.delete(vendId); return s; });
      }
    }
  }

  // ── ROUTE TOGGLE (uses Zustand store) ────────────────────────────────────
  async function toggleRuta(rutaId: number, vendId: number) {
    const isOn = visibleRutas.has(rutaId);
    if (isOn) {
      // Turn OFF: remove ruta and all its clients
      const rutaClientes = queryClient.getQueryData<ClienteSupervision[]>(['supervision-clientes', rutaId]) ?? [];
      const clientIds = rutaClientes.map(c => c.id_cliente);
      
      toggleRutaStore(rutaId);
      const newVisibleClientes = new Set(visibleClientes);
      clientIds.forEach(id => newVisibleClientes.delete(id));
      setVisibleClientes(newVisibleClientes);
    } else {
      // Turn ON: ensure vendor + ruta are on, load clients
      setLoadingMap(p => new Set([...p, vendId]));
      try {
        const cli = await queryClient.fetchQuery(getClientesQuery(rutaId));
        
        // auto-enable vendor if not already
        setVisibleVends(new Set([...visibleVends, vendId]));
        setVisibleRutas(new Set([...visibleRutas, rutaId]));
        setVisibleClientes(new Set([...visibleClientes, ...cli.map(c => c.id_cliente)]));
      } finally {
        setLoadingMap(p => { const s = new Set(p); s.delete(vendId); return s; });
      }
    }
  }

  // ── PDV TOGGLE (uses Zustand store) ──────────────────────────────────────
  function toggleCliente(clienteId: number) {
    toggleClienteStore(clienteId);
  }

  // ── Map pins — 3-level visibility check (uses query cache + server flag) ─
  const pines = useMemo<PinCliente[]>(() => {
    // Build deuda lookup from cuentas corrientes
    const deudaByErpId = new Map<string, { deuda: number; antiguedad: number }>();
    const deudaByNombre = new Map<string, { deuda: number; antiguedad: number }>();
    if (cuentasData) {
      cuentasData.vendedores.forEach((v: any) => {
        v.clientes.forEach((c: any) => {
          if (c.id_cliente_erp) {
            deudaByErpId.set(String(c.id_cliente_erp), { deuda: c.deuda_total ?? 0, antiguedad: c.antiguedad ?? 0 });
          }
          if (c.cliente) {
            deudaByNombre.set(c.cliente.toLowerCase().trim(), { deuda: c.deuda_total ?? 0, antiguedad: c.antiguedad ?? 0 });
          }
        });
      });
    }

    const result: PinCliente[] = [];
    vendedores.forEach((v, idx) => {
      if (!visibleVends.has(v.id_vendedor)) return;
      const color = vendorColor(idx);
      
      // Get rutas from query cache
      const vendRutas = queryClient.getQueryData<RutaSupervision[]>(['supervision-rutas', v.id_vendedor]) ?? [];
      
      vendRutas.forEach(r => {
        if (!visibleRutas.has(r.id_ruta)) return;
        
        // Get clientes from query cache
        const rutaClientes = queryClient.getQueryData<ClienteSupervision[]>(['supervision-clientes', r.id_ruta]) ?? [];
        
        rutaClientes.forEach(c => {
          if (!visibleClientes.has(c.id_cliente)) return;
          if (!hasValidCoords(c.latitud, c.longitud)) return;
          
          // Cross-reference deuda
          const erpId = c.id_cliente_erp ? String(c.id_cliente_erp) : null;
          const nombre = (c.nombre_fantasia || c.nombre_razon_social || "").toLowerCase().trim();
          const deudaInfo = (erpId ? deudaByErpId.get(erpId) : null)
            ?? (nombre ? deudaByNombre.get(nombre) : null)
            ?? null;
          
          result.push({
            id:                    c.id_cliente,
            lat:                   c.latitud!,
            lng:                   c.longitud!,
            nombre:                c.nombre_fantasia || c.nombre_razon_social || "Sin nombre",
            color,
            activo:                !isInactivo30(c.fecha_ultima_compra),
            vendedor:              v.nombre_vendedor,
            ultimaCompra:          fmt(c.fecha_ultima_compra),
            conExhibicion:         c.tiene_exhibicion_reciente ?? false, // Server-calculated flag
            idClienteErp:          c.id_cliente_erp ?? null,
            nroRuta:               r.dia_semana ?? null,
            fechaUltimaCompra:     c.fecha_ultima_compra ?? null,
            fechaUltimaExhibicion: c.fecha_ultima_exhibicion ?? null,
            urlExhibicion:         c.url_ultima_exhibicion ?? null,
            deuda:                 deudaInfo?.deuda ?? null,
            antiguedadDias:        deudaInfo?.antiguedad ?? null,
          });
        });
      });
    });
    
    // Deduplicar por id_cliente
    const seen = new Set<number>();
    return result.filter(p => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }, [vendedores, visibleVends, visibleRutas, visibleClientes, cuentasData, queryClient]);

  const totalPdv     = vendedoresFiltrados.reduce((s, v) => s + v.total_pdv, 0);
  const totalActivos = vendedoresFiltrados.reduce((s, v) => s + (v.pdv_activos ?? 0), 0);
  const pctActivos   = totalPdv > 0 ? Math.round((totalActivos / totalPdv) * 100) : 0;

  // ── Vendor panel content for MapaRutas fullscreen overlay ────────────────
  const vendorPanelContent = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-white/10 shrink-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1.5">Sucursal</p>
        <div className="flex flex-wrap gap-1">
          {sucursales.map(suc => (
            <button
              key={suc}
              onClick={() => {
                setSelectedSucursal(suc === selectedSucursal ? null : suc);
                setVisibleVends(new Set());
                setVisibleRutas(new Set());
                setVisibleClientes(new Set());
              }}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-all duration-200 ${
                selectedSucursal === suc
                  ? "bg-[var(--shelfy-primary)] text-white border-transparent"
                  : "bg-white/5 text-white/50 border-white/10 hover:text-white/80"
              }`}
            >
              {suc}
            </button>
          ))}
        </div>
      </div>
      {/* Vendor list */}
      <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-white/5">
        {vendedoresFiltrados.map(v => {
          const idx      = vendedores.indexOf(v);
          const color    = vendorColor(idx);
          const isVendOn = visibleVends.has(v.id_vendedor);
          const isVendLoad = loadingMap.has(v.id_vendedor);
          const pct      = v.total_pdv > 0 ? Math.round(((v.pdv_activos ?? 0) / v.total_pdv) * 100) : 0;
          return (
            <div key={v.id_vendedor} className="px-3 py-2">
              <div className="flex items-center gap-2">
                <VendorAvatar nombre={v.nombre_vendedor} color={color} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold text-white truncate leading-snug">{v.nombre_vendedor}</p>
                  <p className="text-[10px] text-white/40">{v.total_pdv} PDV · {pct}% activos</p>
                </div>
                <button
                  onClick={() => toggleVendor(v.id_vendedor)}
                  className={`w-6 h-6 rounded flex items-center justify-center border transition-all shrink-0 ${
                    isVendOn ? "border-transparent text-white" : "border-white/20 text-white/30"
                  }`}
                  style={isVendOn ? { backgroundColor: color, boxShadow: `0 0 6px ${color}55` } : {}}
                >
                  {isVendLoad
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : isVendOn ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />
                  }
                </button>
              </div>
              {v.total_pdv > 0 && (
                <div className="mt-1.5 w-full h-0.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                </div>
              )}
            </div>
          );
        })}
        {vendedoresFiltrados.length === 0 && (
          <div className="flex items-center justify-center py-8 text-white/30 text-xs">
            {selectedSucursal ? "Sin vendedores" : "Seleccioná una sucursal"}
          </div>
        )}
      </div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">

      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-[var(--shelfy-text)]">Rutas de Venta</h2>
          {selectedSucursal && totalPdv > 0 && (
            <p className="text-xs text-[var(--shelfy-muted)] mt-0.5">
              {vendedoresFiltrados.length} vendedores · {totalPdv.toLocaleString()} PDV ·{" "}
              <span className="text-emerald-400 font-semibold">{pctActivos}% activos</span>
              <span className="mx-1 opacity-40">·</span>
              <span className="text-red-400 font-semibold">{100 - pctActivos}% inactivos</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {sucursales.length > 0 && (
            <div className="flex items-center gap-2 bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] rounded-xl px-3 py-1.5 shadow-sm">
              <Building2 className="w-4 h-4 text-amber-400" />
              <select
                value={selectedSucursal || ""}
                onChange={e => {
                  setSelectedSucursal(e.target.value || null);
                  setVisibleVends(new Set());
                  setVisibleRutas(new Set());
                  setVisibleClientes(new Set());
                }}
                className="bg-transparent text-[var(--shelfy-text)] text-sm font-semibold focus:outline-none min-w-[140px]"
              >
                <option value="">Seleccionar Sucursal...</option>
                {sucursales.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}
          {isSuperadmin && distribuidoras.length > 0 && (
            <select
              value={selectedDist}
              onChange={e => setSelectedDist(Number(e.target.value))}
              className="rounded-xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] text-[var(--shelfy-text)] px-3 py-1.5 text-sm focus:outline-none font-medium h-[38px]"
            >
              {distribuidoras.map(d => (
                <option key={d.id} value={d.id}>{d.nombre}</option>
              ))}
            </select>
          )}
          <button
            onClick={handleScanner}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-medium transition-colors"
            title="Escanear PDVs cercanos (GPS)"
          >
            <Radar size={14} />
            <span>Scanner</span>
          </button>
          <button
            onClick={() => refetchVendedores()}
            disabled={loading}
            title="Actualizar todo"
            className="text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] transition-colors p-2 rounded-xl hover:bg-white/5 border border-[var(--shelfy-border)] h-[38px]"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 rounded-lg px-4 py-2 border border-red-500/20">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Mobile primary CTA: ShelfyMaps — superadmin only */}
      {isSuperadmin && (
        <button
          onClick={handleShelfyMaps}
          className="xl:hidden flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl font-semibold text-sm text-white transition-all active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)", boxShadow: "0 4px 16px rgba(124,58,237,0.35)" }}
        >
          🗺️ Entrar a ShelfyMaps
        </button>
      )}

      {/* Mobile Scanner button — secondary */}
      <button
        onClick={handleScanner}
        className="xl:hidden flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-medium text-sm transition-colors hover:bg-amber-500/20"
      >
        <Radar size={14} />
        Scanner GPS — PDVs cercanos
      </button>

      {/* Main split */}
      <div className="flex flex-col xl:grid xl:grid-cols-5 gap-3 xl:h-[680px]">

        {/* ── MAP — oculto en mobile ──────────────────────────────────────── */}
        <div className="hidden xl:block xl:col-span-3 rounded-2xl overflow-hidden border border-[var(--shelfy-border)] relative bg-[var(--shelfy-panel)]">
          {loading ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-[var(--shelfy-muted)]">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p className="text-sm">Cargando...</p>
            </div>
          ) : pines.length === 0 ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-[var(--shelfy-muted)]">
              <MapIcon className="w-12 h-12 opacity-15" />
              <p className="text-sm font-medium text-center px-8 leading-relaxed">
                {!selectedSucursal
                  ? "Seleccioná una sucursal para comenzar"
                  : "Activá un vendedor, ruta o PDV para verlos en el mapa"
                }
              </p>
            </div>
          ) : (
            <MapaRutas pines={pines} fullscreenPanel={vendorPanelContent} />
          )}

        </div>

        {/* ── RIGHT PANEL — lista vendedores/rutas ────────────────────────── */}
        <div className="xl:col-span-2 flex flex-col rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] overflow-hidden min-h-[400px] xl:min-h-0">

          {/* Sucursal selector */}
          <div className="px-4 py-3 border-b border-[var(--shelfy-border)]/60 shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--shelfy-muted)] mb-2">
              Sucursal
            </p>
            {loading ? (
              <div className="flex gap-2">
                {[1, 2].map(i => <div key={`skeleton-nav-${i}`} className="h-7 w-24 rounded-lg bg-white/5 animate-pulse" />)}
              </div>
            ) : sucursales.length === 0 ? (
              <p className="text-xs text-[var(--shelfy-muted)] italic">Sin datos cargados</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {sucursales.map(suc => (
                  <button
                    key={suc}
                    onClick={() => {
                      setSelectedSucursal(suc === selectedSucursal ? null : suc);
                      setVisibleVends(new Set());
                      setVisibleRutas(new Set());
                      setVisibleClientes(new Set());
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all duration-200 ${
                      selectedSucursal === suc
                        ? "bg-[var(--shelfy-primary)] text-white border-transparent shadow-sm shadow-blue-500/20"
                        : "bg-[var(--shelfy-bg)] text-[var(--shelfy-muted)] border-[var(--shelfy-border)] hover:border-[var(--shelfy-primary)]/50 hover:text-[var(--shelfy-text)]"
                    }`}
                  >
                    {suc}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Scrollable vendor list */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {!selectedSucursal && !loading && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--shelfy-muted)] py-12">
                <Building2 className="w-8 h-8 opacity-20" />
                <p className="text-xs text-center px-6 leading-relaxed">
                  Seleccioná una sucursal para ver los vendedores
                </p>
              </div>
            )}
            {selectedSucursal && vendedoresFiltrados.length === 0 && !loading && (
              <p className="text-xs text-[var(--shelfy-muted)] text-center py-10">
                No hay vendedores para esta sucursal.
              </p>
            )}

            <div className="divide-y divide-[var(--shelfy-border)]/40">
              {vendedoresFiltrados.map(v => {
                const idx       = vendedores.indexOf(v);
                const color     = vendorColor(idx);
                const vOpen     = openVend === v.id_vendedor;
                const vRutas    = [...(rutas[v.id_vendedor] ?? [])].sort(
                  (a, b) =>
                    (DIA_ORDER[a.dia_semana?.toLowerCase() ?? ""] ?? 9) -
                    (DIA_ORDER[b.dia_semana?.toLowerCase() ?? ""] ?? 9)
                );
                const isVendOn  = visibleVends.has(v.id_vendedor);
                const isVendLoad = loadingMap.has(v.id_vendedor);
                const pct       = v.total_pdv > 0
                  ? Math.round(((v.pdv_activos ?? 0) / v.total_pdv) * 100)
                  : 0;

                return (
                  <div key={v.id_vendedor}>

                    {/* ── Vendor row ── */}
                    <div className="flex items-stretch">
                      <div
                        className="w-0.5 shrink-0 transition-colors duration-300"
                        style={{ backgroundColor: isVendOn ? color : "transparent" }}
                      />
                      <div className="flex-1 min-w-0 px-3 py-2.5">
                        {/* Avatar + name + eye */}
                        <div className="flex items-center gap-2 mb-1.5">
                          <VendorAvatar nombre={v.nombre_vendedor} color={color} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-bold text-[var(--shelfy-text)] truncate leading-snug">
                              {v.nombre_vendedor}
                            </p>
                            <p className="text-[11px] text-[var(--shelfy-muted)]">
                              {v.total_pdv.toLocaleString()} PDV · {v.total_rutas} rutas
                            </p>
                          </div>
                          {/* Vendor eye: bigger, toggles everything — hidden on mobile (no map) */}
                          <button
                            onClick={() => toggleVendor(v.id_vendedor)}
                            title={isVendOn ? "Ocultar vendedor del mapa" : "Mostrar todos los PDV en mapa"}
                            className={`hidden xl:flex w-7 h-7 rounded-lg items-center justify-center border transition-all duration-200 shrink-0 ${
                              isVendOn
                                ? "border-transparent text-white"
                                : "border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] hover:border-current"
                            }`}
                            style={isVendOn ? { backgroundColor: color, boxShadow: `0 0 8px ${color}55` } : {}}
                          >
                            {isVendLoad
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : isVendOn
                                ? <Eye className="w-3.5 h-3.5" />
                                : <EyeOff className="w-3.5 h-3.5" />
                            }
                          </button>
                        </div>
                        {/* Activity bar */}
                        {v.total_pdv > 0 && (
                          <div className="mb-2">
                            <div className="flex justify-between items-center mb-0.5">
                              <span className="text-[10px] text-emerald-400 font-semibold">
                                {(v.pdv_activos ?? 0).toLocaleString()} activos
                              </span>
                              <span className="text-[10px] font-bold" style={{ color }}>
                                {pct}%
                              </span>
                            </div>
                            <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${pct}%`, backgroundColor: color }}
                              />
                            </div>
                          </div>
                        )}
                        {/* Expand rutas */}
                        <button
                          onClick={() => handleVend(v.id_vendedor)}
                          className="flex items-center gap-1 text-[11px] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] transition-colors"
                        >
                          <ChevronRight className={`w-3 h-3 transition-transform duration-200 ${vOpen ? "rotate-90" : ""}`} />
                          {vOpen ? "Ocultar rutas" : "Ver rutas"}
                          {loadingRutas === v.id_vendedor && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
                        </button>
                      </div>
                    </div>

                    {/* ── Rutas accordion ── */}
                    <Accordion open={vOpen}>
                      <div className="bg-[var(--shelfy-bg)]/50 divide-y divide-[var(--shelfy-border)]/30">
                        {vRutas.length === 0 && loadingRutas === v.id_vendedor && (
                          <div className="flex items-center gap-2 py-2 px-5 text-[11px] text-[var(--shelfy-muted)]">
                            <Loader2 className="w-3 h-3 animate-spin" /> Cargando rutas...
                          </div>
                        )}
                        {vRutas.length === 0 && loadingRutas !== v.id_vendedor && vOpen && (
                          <p className="text-[11px] text-[var(--shelfy-muted)] px-5 py-2 italic">
                            Sin rutas asignadas.
                          </p>
                        )}

                        {vRutas.map(r => {
                          const rOpen    = openRuta === r.id_ruta;
                          const rCli     = clientes[r.id_ruta] ?? [];
                          const isRutaOn = visibleRutas.has(r.id_ruta);
                          // count how many clients in this route are visible
                          const cliVisible = rCli.filter(c => visibleClientes.has(c.id_cliente)).length;

                          return (
                            <div key={r.id_ruta}>
                              {/* Route row */}
                              <div className="flex items-center gap-2 px-5 py-2 hover:bg-white/5 transition-colors">
                                {/* Expand button */}
                                <button
                                  onClick={() => handleRuta(r.id_ruta)}
                                  className="flex items-center gap-2 flex-1 min-w-0 text-left"
                                >
                                  <ChevronRight
                                    className={`w-3 h-3 text-[var(--shelfy-muted)] shrink-0 transition-transform duration-200 ${rOpen ? "rotate-90" : ""}`}
                                  />
                                  <RouteIcon
                                    className="w-3 h-3 shrink-0"
                                    style={{ color: isRutaOn ? color : color + "66" }}
                                  />
                                  <span className="text-[11px] font-semibold text-[var(--shelfy-text)] flex-1 truncate">
                                    Ruta {r.nombre_ruta}
                                  </span>
                                </button>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <DiaBadge dia={r.dia_semana} />
                                  <span className="text-[10px] text-[var(--shelfy-muted)]">
                                    {isRutaOn && rCli.length > 0
                                      ? <span style={{ color }}>{cliVisible}</span>
                                      : r.total_pdv
                                    }
                                  </span>
                                  {loadingCli === r.id_ruta && (
                                    <Loader2 className="w-3 h-3 animate-spin text-[var(--shelfy-muted)]" />
                                  )}
                                  {/* Route eye toggle */}
                                  <EyeBtn
                                    on={isRutaOn}
                                    color={color}
                                    loading={loadingMap.has(v.id_vendedor) && !isRutaOn}
                                    onClick={() => toggleRuta(r.id_ruta, v.id_vendedor)}
                                    title={isRutaOn ? "Ocultar ruta del mapa" : "Mostrar ruta en mapa"}
                                  />
                                </div>
                              </div>

                              {/* ── Clientes accordion ── */}
                              <Accordion open={rOpen}>
                                <div className="bg-[var(--shelfy-bg)]/60 divide-y divide-[var(--shelfy-border)]/20">
                                  {rCli.length === 0 && loadingCli === r.id_ruta && (
                                    <div className="flex items-center gap-2 py-2 px-8 text-[11px] text-[var(--shelfy-muted)]">
                                      <Loader2 className="w-3 h-3 animate-spin" /> Cargando clientes...
                                    </div>
                                  )}

                                  {rCli.map(c => {
                                    const cOpen      = openCliente === c.id_cliente;
                                    const inactivo   = isInactivo(c.fecha_ultima_compra);
                                    const fechaAlta  = fmt(c.fecha_alta);
                                    const ultimaComp = fmt(c.fecha_ultima_compra);
                                    const isCliOn    = visibleClientes.has(c.id_cliente);
                                    const mapUrl     = c.latitud && c.longitud
                                      ? `https://www.google.com/maps/search/?api=1&query=${c.latitud},${c.longitud}`
                                      : null;
                                    // effective dot color: if route is on but client off → gray
                                    const dotColor   = !isRutaOn || !isCliOn
                                      ? "#4b5563"
                                      : inactivo ? "#6b7280" : color;

                                    return (
                                      <div key={c.id_cliente}>
                                        <div className="flex items-center gap-2 pl-8 pr-2 py-1.5 hover:bg-white/5 transition-colors">
                                          {/* Detail toggle */}
                                          <button
                                            onClick={() => handleCliente(c.id_cliente)}
                                            className="flex items-center gap-2 flex-1 min-w-0 text-left"
                                          >
                                            <ChevronRight
                                              className={`w-3 h-3 text-[var(--shelfy-muted)] shrink-0 transition-transform duration-200 ${cOpen ? "rotate-90" : ""}`}
                                            />
                                            {/* Dot = PDV map toggle */}
                                            <span
                                              className="w-2 h-2 rounded-full shrink-0 cursor-pointer transition-all"
                                              style={{ backgroundColor: dotColor, boxShadow: isCliOn && isRutaOn && !inactivo ? `0 0 4px ${color}88` : "none" }}
                                              onClick={e => { e.stopPropagation(); toggleCliente(c.id_cliente); }}
                                              title={isCliOn ? "Ocultar PDV del mapa" : "Mostrar PDV en mapa"}
                                            />
                                            <span className={`text-[11px] flex-1 truncate ${!isCliOn || !isRutaOn ? "opacity-50" : inactivo ? "text-[var(--shelfy-muted)]" : "text-[var(--shelfy-text)]"}`}>
                                              <span className="font-mono text-[9px] bg-white/10 px-1 rounded mr-1 opacity-70">
                                                {c.id_cliente_erp}
                                              </span>
                                              {c.nombre_fantasia || c.nombre_razon_social || "Sin nombre"}
                                            </span>
                                          </button>
                                          {/* PDV eye mini toggle */}
                                          <EyeBtn
                                            on={isCliOn}
                                            color={inactivo ? "#6b7280" : color}
                                            onClick={() => toggleCliente(c.id_cliente)}
                                            title={isCliOn ? "Ocultar PDV del mapa" : "Mostrar PDV en mapa"}
                                          />
                                        </div>

                                        {/* Detail card */}
                                        <Accordion open={cOpen}>
                                          <div className="mx-3 mb-1.5 rounded-lg border border-[var(--shelfy-border)]/50 bg-[var(--shelfy-panel)] px-3 py-2 space-y-1.5">
                                            <div className="flex items-center justify-between gap-2 border-b border-[var(--shelfy-border)]/30 pb-1.5">
                                              <span className="text-[10px] font-bold text-[var(--shelfy-muted)] uppercase tracking-tight">Código ERP</span>
                                              <span className="text-[11px] font-mono font-bold text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded">{c.id_cliente_erp}</span>
                                            </div>

                                            {c.domicilio && (
                                              <div className="flex items-start gap-1.5">
                                                <MapPin className="w-3 h-3 text-[var(--shelfy-muted)] mt-0.5 shrink-0" />
                                                <span className="text-[11px] text-[var(--shelfy-text)] flex-1 leading-snug">
                                                  {c.domicilio}{c.localidad ? `, ${c.localidad}` : ""}{c.provincia ? ` (${c.provincia})` : ""}
                                                </span>
                                                {mapUrl && (
                                                  <a
                                                    href={mapUrl} target="_blank" rel="noopener noreferrer"
                                                    onClick={e => e.stopPropagation()}
                                                    className="text-[10px] text-[var(--shelfy-primary)] hover:underline shrink-0"
                                                  >
                                                    mapa ↗
                                                  </a>
                                                )}
                                              </div>
                                            )}
                                            <div className="flex flex-col gap-1">
                                              <div className="flex items-center gap-1">
                                                <ShoppingCart className="w-3 h-3 text-[var(--shelfy-muted)] shrink-0" />
                                                <span className={`text-[11px] font-semibold ${inactivo ? "text-red-400" : "text-emerald-400"}`}>
                                                  {ultimaComp
                                                    ? <>Últ. compra: {ultimaComp} <span className="font-normal opacity-70">({diasDesde(c.fecha_ultima_compra)})</span></>
                                                    : "Sin compras"}
                                                </span>
                                              </div>
                                              <div className="flex items-center gap-1">
                                                <Calendar className="w-3 h-3 text-[var(--shelfy-muted)] shrink-0" />
                                                <span className="text-[11px] text-[var(--shelfy-text)]">
                                                  {c.fecha_ultima_exhibicion
                                                    ? <>Últ. exhibición: <span className="font-semibold">{fmt(c.fecha_ultima_exhibicion?.split("T")[0])}</span> <span className="opacity-60">({diasDesde(c.fecha_ultima_exhibicion)})</span></>
                                                    : <span className="opacity-40 italic text-[10px]">Sin exhibiciones registradas</span>
                                                  }
                                                </span>
                                              </div>
                                              <div className="flex items-center gap-1">
                                                <Calendar className="w-3 h-3 text-[var(--shelfy-muted)] shrink-0" />
                                                <span className="text-[11px] text-[var(--shelfy-text)]">
                                                  Alta:{" "}
                                                  {fechaAlta
                                                    ? <span className="font-semibold">{fechaAlta}</span>
                                                    : <span className="italic opacity-40 text-[10px]">re-subir padrón*</span>
                                                  }
                                                </span>
                                              </div>
                                            </div>
                                            {c.canal && (
                                              <span
                                                className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border"
                                                style={{ backgroundColor: color + "15", color, borderColor: color + "30" }}
                                              >
                                                {c.canal}
                                              </span>
                                            )}
                                          </div>
                                        </Accordion>
                                      </div>
                                    );
                                  })}
                                </div>
                              </Accordion>

                            </div>
                          );
                        })}
                      </div>
                    </Accordion>

                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* ── MOBILE CC — debajo de rutas en mobile (xl:hidden) ──────────── */}
        <div className="xl:hidden flex flex-col rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] overflow-y-auto min-h-[300px]">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--shelfy-border)]/50 shrink-0">
            <CreditCard className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-bold text-[var(--shelfy-text)]">Cuentas</span>
            {cuentasFiltradas?.fecha && (
              <span className="text-[10px] text-[var(--shelfy-muted)] truncate">· {fmt(cuentasFiltradas.fecha)}</span>
            )}
            {loadingCuentas && <Loader2 className="w-3 h-3 animate-spin text-[var(--shelfy-muted)] ml-auto" />}
          </div>
          {cuentasFiltradas?.metadatos && (
            <div className="grid grid-cols-2 divide-x divide-[var(--shelfy-border)]/40 border-b border-[var(--shelfy-border)]/30 shrink-0">
              <div className="px-3 py-2">
                <p className="text-[9px] text-[var(--shelfy-muted)] uppercase tracking-wide">Deuda</p>
                <p className="text-sm font-bold text-amber-400">${(cuentasFiltradas.metadatos.total_deuda??0).toLocaleString("es-AR",{maximumFractionDigits:0})}</p>
              </div>
              <div className="px-3 py-2">
                <p className="text-[9px] text-[var(--shelfy-muted)] uppercase tracking-wide">Prom. días</p>
                <p className="text-sm font-bold text-[var(--shelfy-text)]">{Math.round(cuentasFiltradas.metadatos.promedio_dias_retraso??0)}d</p>
              </div>
            </div>
          )}
          {!selectedSucursal && !loadingCuentas && (
            <div className="flex-1 flex items-center justify-center p-4">
              <p className="text-xs text-[var(--shelfy-muted)] text-center">Seleccioná una sucursal</p>
            </div>
          )}
          {cuentasFiltradas && cuentasFiltradas.vendedores.length === 0 && !loadingCuentas && (
            <div className="flex-1 flex items-center justify-center p-4">
              <p className="text-xs text-[var(--shelfy-muted)] text-center">Sin deudas registradas</p>
            </div>
          )}
          {cuentasFiltradas && cuentasFiltradas.vendedores.length > 0 && (
            <div className="divide-y divide-[var(--shelfy-border)]/30 overflow-y-auto">
              {cuentasFiltradas.vendedores.map((v: any, idx: number) => {
                const color = vendorColor(idx);
                const isOpen = openCuentasVend === v.vendedor;
                return (
                  <div key={v.vendedor}>
                    <button
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors text-left"
                      onClick={() => setOpenCuentasVend(isOpen ? null : v.vendedor)}
                    >
                      <VendorAvatar nombre={v.vendedor} color={color} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[var(--shelfy-text)] truncate">{v.vendedor}</p>
                        <p className="text-xs font-bold text-amber-400">${v.deuda_total.toLocaleString("es-AR",{maximumFractionDigits:0})}</p>
                      </div>
                      <ChevronRight className={`w-3.5 h-3.5 text-[var(--shelfy-muted)] shrink-0 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`} />
                    </button>
                    <Accordion open={isOpen}>
                      <div className="px-2 pb-2 overflow-x-auto">
                        <table className="w-full text-[10px]">
                          <thead><tr className="bg-[var(--shelfy-bg)] text-[var(--shelfy-muted)] uppercase text-[9px]">
                            <th className="text-left px-2 py-1.5 font-semibold">Cliente</th>
                            <th className="text-center px-2 py-1.5 font-semibold">Días</th>
                            <th className="text-right px-2 py-1.5 font-semibold">Deuda</th>
                          </tr></thead>
                          <tbody className="divide-y divide-[var(--shelfy-border)]/20">
                            {v.clientes.map((c: any, ci: number) => {
                              const dias = c.antiguedad ?? 0;
                              const diasColor = dias > 30 ? "text-rose-400 font-bold" : dias > 21 ? "text-orange-400" : dias > 15 ? "text-amber-400" : "text-[var(--shelfy-text)]";
                              return (
                                <tr key={ci} className="hover:bg-white/5 text-[var(--shelfy-text)]">
                                  <td className="px-2 py-1.5 max-w-[90px] truncate" title={c.cliente ?? undefined}>{c.cliente ?? "-"}</td>
                                  <td className={`px-2 py-1.5 text-center tabular-nums ${diasColor}`}>{c.antiguedad ?? "-"}</td>
                                  <td className="px-2 py-1.5 text-right font-semibold text-amber-400 tabular-nums">${c.deuda_total.toLocaleString("es-AR",{maximumFractionDigits:0})}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </Accordion>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* ── SECCIÓN VENTAS (oculta temporalmente, pendiente de pulir) ────────── */}
      {false && <div className="rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] overflow-hidden shadow-sm">
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[var(--shelfy-border)]/50">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-[var(--shelfy-text)]">Ventas</h3>
            {ventasFiltradas && (
              <span className="text-[11px] text-[var(--shelfy-muted)]">últimos {ventasDias} días</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {([7, 30, 90] as const).map(d => (
              <button
                key={d}
                onClick={() => setVentasDias(d)}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                  ventasDias === d
                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400 font-semibold"
                    : "border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"
                }`}
              >
                {d}d
              </button>
            ))}
            {ventasFiltradas && (ventasFiltradas?.vendedores?.length ?? 0) > 0 && (
              <button
                onClick={() => {
                  const rows = [["Vendedor","Fecha","Cliente","Comprobante","Número","Tipo","Devolución","Facturado","Recaudado"]];
                  ventasFiltradas?.vendedores?.forEach(v => v.transacciones.forEach(t => rows.push([v.vendedor, t.fecha, t.cliente??'', t.comprobante??'', t.numero??'', t.tipo_operacion??'', t.es_devolucion?'SI':'NO', String(t.monto_total), String(t.monto_recaudado)])));
                  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
                  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"})); a.download = `ventas_${selectedSucursal}_${ventasDias}d.csv`; a.click();
                }}
                className="text-xs px-2.5 py-1 rounded-lg border border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] transition-colors"
              >↓ CSV</button>
            )}
            {loadingVentas && <Loader2 className="w-4 h-4 animate-spin text-[var(--shelfy-muted)]" />}
          </div>
        </div>

        {!selectedSucursal ? (
          <div className="py-12 flex flex-col items-center justify-center text-center px-6">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3">
              <TrendingUp className="w-6 h-6 text-emerald-500/50" />
            </div>
            <p className="text-sm text-[var(--shelfy-muted)] max-w-[240px]">
              Seleccioná una sucursal para ver el desglose de ventas.
            </p>
          </div>
        ) : (
          <>
            {ventasFiltradas && (
              <div className="grid grid-cols-3 divide-x divide-[var(--shelfy-border)]/40 border-b border-[var(--shelfy-border)]/30">
                <div className="px-5 py-3">
                  <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide mb-0.5">Facturado</p>
                  <p className="text-base font-bold text-[var(--shelfy-text)]">${(ventasFiltradas?.total_facturado ?? 0).toLocaleString("es-AR",{maximumFractionDigits:0})}</p>
                </div>
                <div className="px-5 py-3">
                  <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide mb-0.5">Recaudado</p>
                  <p className="text-base font-bold text-emerald-400">${(ventasFiltradas?.total_recaudado ?? 0).toLocaleString("es-AR",{maximumFractionDigits:0})}</p>
                </div>
                <div className="px-5 py-3">
                  <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide mb-0.5">Comprobantes</p>
                  <p className="text-base font-bold text-[var(--shelfy-text)]">{(ventasFiltradas?.total_facturas ?? 0).toLocaleString()}</p>
                </div>
              </div>
            )}

            {loadingVentas && !ventasFiltradas && (
              <div className="flex items-center gap-2 justify-center py-8 text-[var(--shelfy-muted)]">
                <Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm">Cargando ventas...</span>
              </div>
            )}
            {ventasFiltradas && ventasFiltradas.vendedores.length === 0 && !loadingVentas && (
              <p className="text-sm text-[var(--shelfy-muted)] text-center py-8 italic">Sin datos de ventas para esta sucursal.</p>
            )}

            {ventasFiltradas && (ventasFiltradas?.vendedores?.length ?? 0) > 0 && (
              <div className="divide-y divide-[var(--shelfy-border)]/30">
                {(ventasFiltradas?.vendedores ?? []).map((v, idx) => {
                  const color = vendorColor(idx);
                  const isOpen = openVentasVend === v.vendedor;
                  const pctRec = v.monto_total > 0 ? Math.round((v.monto_recaudado / v.monto_total) * 100) : 0;
                  return (
                    <div key={v.vendedor}>
                      <button
                        className="w-full flex items-center gap-3 px-5 py-3 hover:bg-white/5 transition-colors text-left"
                        onClick={() => setOpenVentasVend(isOpen ? null : v.vendedor)}
                      >
                        <VendorAvatar nombre={v.vendedor} color={color} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[var(--shelfy-text)] truncate">{v.vendedor}</p>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            <span className="text-xs text-[var(--shelfy-muted)]">Fact: <span className="text-[var(--shelfy-text)] font-medium">${v.monto_total.toLocaleString("es-AR",{maximumFractionDigits:0})}</span></span>
                            <span className="text-xs text-[var(--shelfy-muted)]">Rec: <span className="text-emerald-400 font-medium">${v.monto_recaudado.toLocaleString("es-AR",{maximumFractionDigits:0})}</span><span className="text-[10px] opacity-60 ml-0.5">({pctRec}%)</span></span>
                            <span className="text-xs text-[var(--shelfy-muted)]">{v.total_facturas} comprob.</span>
                          </div>
                        </div>
                        <ChevronRight className={`w-4 h-4 text-[var(--shelfy-muted)] transition-transform duration-200 ${isOpen?"rotate-90":""}`} />
                      </button>
                      <Accordion open={isOpen}>
                        <div className="px-5 pb-3">
                          <div className="rounded-xl border border-[var(--shelfy-border)]/50 overflow-auto max-h-64">
                            <table className="w-full text-[11px]">
                              <thead className="sticky top-0">
                                <tr className="bg-[var(--shelfy-panel)] text-[var(--shelfy-muted)] uppercase tracking-wide text-[10px]">
                                  <th className="text-left px-3 py-2">Fecha</th>
                                  <th className="text-left px-3 py-2">Cliente</th>
                                  <th className="text-left px-3 py-2">Comprobante</th>
                                  <th className="text-right px-3 py-2">Facturado</th>
                                  <th className="text-right px-3 py-2">Recaudado</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[var(--shelfy-border)]/20">
                                {v.transacciones.map((t: any, ti: number) => (
                                  <tr key={ti} className={`hover:bg-white/5 ${t.es_devolucion?"text-orange-400/80":"text-[var(--shelfy-text)]"}`}>
                                    <td className="px-3 py-1.5 whitespace-nowrap">{fmt(t.fecha)}</td>
                                    <td className="px-3 py-1.5 max-w-[160px] truncate">{t.cliente??"-"}</td>
                                    <td className="px-3 py-1.5 text-[var(--shelfy-muted)]">
                                      {t.comprobante??""} {t.numero??""}
                                      {t.es_devolucion && <span className="ml-1 text-[9px] bg-orange-500/20 text-orange-400 px-1 rounded">DEV</span>}
                                    </td>
                                    <td className="px-3 py-1.5 text-right font-medium">${t.monto_total.toLocaleString("es-AR",{maximumFractionDigits:0})}</td>
                                    <td className="px-3 py-1.5 text-right text-emerald-400">${t.monto_recaudado.toLocaleString("es-AR",{maximumFractionDigits:0})}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {v.transacciones.length >= 100 && (
                              <p className="text-center text-[10px] text-[var(--shelfy-muted)] py-1.5 italic">Mostrando primeros 100 comprobantes</p>
                            )}
                          </div>
                        </div>
                      </Accordion>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>}

      {/* ── SECCIÓN CUENTAS CORRIENTES — solo desktop (xl+) ─────────────────── */}
      <div className="hidden xl:block rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] overflow-hidden shadow-sm">

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[var(--shelfy-border)]/50">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-[var(--shelfy-text)]">Cuentas Corrientes</h3>
            {cuentasFiltradas?.fecha && (
              <span className="text-[11px] text-[var(--shelfy-muted)]">· Al {fmt(cuentasFiltradas.fecha)}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {cuentasFiltradas && cuentasFiltradas.vendedores.length > 0 && (
              <>
                <button
                  onClick={handlePrintCuentas}
                  title="Imprimir en A4"
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] hover:border-amber-500/40 transition-colors"
                >
                  <Printer className="w-3 h-3" />
                  Imprimir
                </button>
                <button
                  onClick={() => {
                    const rows = [["Vendedor","Cliente","Sucursal","Rango","Antigüedad (días)","Comprobantes","Últ. Compra","Deuda"]];
                    cuentasFiltradas.vendedores.forEach((v: any) => v.clientes.forEach((c: any) =>
                      rows.push([v.vendedor, c.cliente??'', c.sucursal??'', c.rango_antiguedad??'', String(c.antiguedad??''), String(c.cantidad_comprobantes??''), c.fecha_ultima_compra ? new Date(c.fecha_ultima_compra).toLocaleDateString("es-AR") : '', String(c.deuda_total)])
                    ));
                    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"}));
                    a.download = `cuentas_${cuentasFiltradas.fecha??'sin_fecha'}.csv`;
                    a.click();
                  }}
                  className="text-xs px-2.5 py-1 rounded-lg border border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] transition-colors"
                >
                  ↓ CSV
                </button>
              </>
            )}
            {loadingCuentas && <Loader2 className="w-4 h-4 animate-spin text-[var(--shelfy-muted)]" />}
          </div>
        </div>

        {/* Sin distribuidor seleccionado */}
        {!selectedDist ? (
          <div className="py-12 flex flex-col items-center justify-center text-center px-6">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mb-3">
              <CreditCard className="w-6 h-6 text-amber-500/50" />
            </div>
            <p className="text-sm text-[var(--shelfy-muted)] max-w-[240px]">
              Seleccioná un distribuidor para ver las cuentas corrientes.
            </p>
          </div>
        ) : (
          <>
            {/* KPIs strip */}
            {cuentasFiltradas?.metadatos && (
              <div className="grid grid-cols-4 divide-x divide-[var(--shelfy-border)]/40 border-b border-[var(--shelfy-border)]/30">
                <div className="px-5 py-3">
                  <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide mb-0.5">Deuda Total</p>
                  <p className="text-base font-bold text-amber-400">${(cuentasFiltradas.metadatos.total_deuda??0).toLocaleString("es-AR",{maximumFractionDigits:0})}</p>
                </div>
                <div className="px-5 py-3">
                  <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide mb-0.5">Clientes Deudores</p>
                  <p className="text-base font-bold text-[var(--shelfy-text)]">{(cuentasFiltradas.metadatos.clientes_deudores??0).toLocaleString()}</p>
                </div>
                <div className="px-5 py-3">
                  <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide mb-0.5">Vendedores</p>
                  <p className="text-base font-bold text-[var(--shelfy-text)]">{cuentasFiltradas.vendedores.length}</p>
                </div>
                <div className="px-5 py-3">
                  <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide mb-0.5">Prom. Días Atraso</p>
                  <p className="text-base font-bold text-[var(--shelfy-text)]">{Math.round(cuentasFiltradas.metadatos.promedio_dias_retraso??0)} días</p>
                </div>
              </div>
            )}

            {/* Sin sucursal seleccionada */}
            {!selectedSucursal && !loadingCuentas && (
              <div className="py-10 flex flex-col items-center justify-center text-center px-6">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center mb-2">
                  <Building2 className="w-5 h-5 text-amber-500/50" />
                </div>
                <p className="text-sm text-[var(--shelfy-muted)]">Seleccioná una sucursal para ver las cuentas corrientes.</p>
              </div>
            )}

            {/* Loading */}
            {loadingCuentas && !cuentasFiltradas && (
              <div className="flex items-center gap-2 justify-center py-10 text-[var(--shelfy-muted)]">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Cargando cuentas corrientes...</span>
              </div>
            )}

            {/* Sin datos */}
            {cuentasFiltradas && cuentasFiltradas.vendedores.length === 0 && !loadingCuentas && (
              <div className="py-10 flex flex-col items-center justify-center text-center px-6">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center mb-2">
                  <CreditCard className="w-5 h-5 text-emerald-500/50" />
                </div>
                <p className="text-sm text-[var(--shelfy-muted)]">Sin deudas registradas para este distribuidor.</p>
              </div>
            )}


            {/* Tarjetas de vendedores */}
            {cuentasFiltradas && cuentasFiltradas.vendedores.length > 0 && (
              <div className="divide-y divide-[var(--shelfy-border)]/30">
                {cuentasFiltradas.vendedores.map((v: any, idx: number) => {
                  const color = vendorColor(idx);
                  const isOpen = openCuentasVend === v.vendedor;

                  // Distribución por rango para mostrar en el header de la tarjeta
                  const rangeDist: Record<string, number> = {};
                  v.clientes.forEach((c: any) => {
                    const r = c.rango_antiguedad ?? "Sin datos";
                    rangeDist[r] = (rangeDist[r] ?? 0) + 1;
                  });

                  return (
                    <div key={v.vendedor}>
                      {/* Cabecera clickeable */}
                      <button
                        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-white/5 transition-colors text-left"
                        onClick={() => setOpenCuentasVend(isOpen ? null : v.vendedor)}
                      >
                        <VendorAvatar nombre={v.vendedor} color={color} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[var(--shelfy-text)] truncate">{v.vendedor}</p>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            <span className="text-xs font-bold text-amber-400">
                              ${v.deuda_total.toLocaleString("es-AR",{maximumFractionDigits:0})}
                            </span>
                            <span className="text-[11px] text-[var(--shelfy-muted)]">
                              {v.cantidad_clientes} {v.cantidad_clientes === 1 ? "cliente" : "clientes"}
                            </span>
                            {/* Chips de rango compactos */}
                            {Object.entries(rangeDist).map(([r, count]) => (
                              <span key={r} className={`text-[10px] px-1.5 py-0.5 rounded border ${RANGO_COLORS[r] ?? "bg-white/5 text-[var(--shelfy-muted)] border-[var(--shelfy-border)]"}`}>
                                {r.replace(" Días","d").replace("+30","30+")}·{count}
                              </span>
                            ))}
                          </div>
                        </div>
                        <ChevronRight className={`w-4 h-4 text-[var(--shelfy-muted)] transition-transform duration-200 shrink-0 ${isOpen ? "rotate-90" : ""}`} />
                      </button>

                      {/* Contenido expandido */}
                      <Accordion open={isOpen}>
                        <div className="px-5 pb-4">
                          <div className="rounded-xl border border-[var(--shelfy-border)]/50 overflow-auto">
                            <table className="w-full text-[11px]">
                              <thead className="sticky top-0 z-10">
                                <tr className="bg-[var(--shelfy-bg)] text-[var(--shelfy-muted)] uppercase tracking-wide text-[10px]">
                                  <th className="text-left px-3 py-2.5 font-semibold">Cliente</th>
                                  <th className="text-left px-3 py-2.5 font-semibold">Sucursal</th>
                                  <th className="text-center px-3 py-2.5 font-semibold">Rango</th>
                                  <th className="text-center px-3 py-2.5 font-semibold cursor-pointer select-none hover:text-[var(--shelfy-text)] transition-colors"
                                    onClick={() => setCcSort(s => s.col === "dias" ? { col: "dias", asc: !s.asc } : { col: "dias", asc: false })}>
                                    Días {ccSort.col === "dias" ? (ccSort.asc ? "↑" : "↓") : <span className="opacity-30">↕</span>}
                                  </th>
                                  <th className="text-center px-3 py-2.5 font-semibold">Comprob.</th>
                                  <th className="text-right px-3 py-2.5 font-semibold cursor-pointer select-none hover:text-[var(--shelfy-text)] transition-colors"
                                    onClick={() => setCcSort(s => s.col === "deuda" ? { col: "deuda", asc: !s.asc } : { col: "deuda", asc: false })}>
                                    Deuda {ccSort.col === "deuda" ? (ccSort.asc ? "↑" : "↓") : <span className="opacity-30">↕</span>}
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[var(--shelfy-border)]/20">
                                {[...v.clientes].sort((a: any, b: any) => {
                                  const val = ccSort.col === "dias"
                                    ? (a.antiguedad ?? 0) - (b.antiguedad ?? 0)
                                    : (a.deuda_total ?? 0) - (b.deuda_total ?? 0);
                                  return ccSort.asc ? val : -val;
                                }).map((c: any, ci: number) => {
                                  const dias = c.antiguedad ?? 0;
                                  const diasColor = dias > 30
                                    ? "text-rose-400 font-bold"
                                    : dias > 21
                                      ? "text-orange-400 font-semibold"
                                      : dias > 15
                                        ? "text-amber-400"
                                        : "text-[var(--shelfy-text)]";
                                  return (
                                    <tr key={ci} className="hover:bg-white/5 text-[var(--shelfy-text)] cursor-pointer" onClick={() => c.cliente && handleClienteClick(c.cliente, c.id_cliente_erp)}>
                                      <td className="px-3 py-2 max-w-[200px] truncate group" title={c.cliente ?? undefined}>
                                        <span className="group-hover:text-[var(--shelfy-primary)] transition-colors">{c.cliente ?? "-"}</span>
                                        <span className="ml-1 text-[9px] text-[var(--shelfy-muted)] opacity-0 group-hover:opacity-100 transition-opacity">↗</span>
                                      </td>
                                      <td className="px-3 py-2 text-[var(--shelfy-muted)]">{c.sucursal ?? "-"}</td>
                                      <td className="px-3 py-2 text-center">
                                        {c.rango_antiguedad ? (
                                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${RANGO_COLORS[c.rango_antiguedad] ?? "bg-white/5 text-[var(--shelfy-muted)] border-[var(--shelfy-border)]"}`}>
                                            {c.rango_antiguedad}
                                          </span>
                                        ) : "-"}
                                      </td>
                                      <td className={`px-3 py-2 text-center tabular-nums ${diasColor}`}>
                                        {c.antiguedad ?? "-"}
                                      </td>
                                      <td className="px-3 py-2 text-center text-[var(--shelfy-muted)]">
                                        {c.cantidad_comprobantes ?? "-"}
                                      </td>
                                      <td className="px-3 py-2 text-right font-semibold text-amber-400 tabular-nums">
                                        ${c.deuda_total.toLocaleString("es-AR",{maximumFractionDigits:0})}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot>
                                <tr className="border-t-2 border-[var(--shelfy-border)]/40 bg-white/3">
                                  <td colSpan={5} className="px-3 py-2 text-right text-[11px] font-bold text-[var(--shelfy-muted)] uppercase tracking-wide">
                                    Total
                                  </td>
                                  <td className="px-3 py-2 text-right font-bold text-amber-400 tabular-nums">
                                    ${v.deuda_total.toLocaleString("es-AR",{maximumFractionDigits:0})}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      </Accordion>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Cliente Contacto Popup */}
      {clientePopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setClientePopup(null)}
        >
          <div
            className="bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] rounded-2xl w-full max-w-sm shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--shelfy-border)]/60">
              <div>
                <p className="text-sm font-bold text-[var(--shelfy-text)] truncate max-w-[220px]">{clientePopup.nombre}</p>
                <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide mt-0.5">Datos de contacto</p>
              </div>
              <button onClick={() => setClientePopup(null)} className="text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] p-1 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="px-5 py-4">
              {clientePopup.loading && (
                <div className="flex items-center justify-center gap-2 py-6 text-[var(--shelfy-muted)]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Buscando...</span>
                </div>
              )}
              {!clientePopup.loading && clientePopup.data && clientePopup.data.length === 0 && (
                <p className="text-sm text-[var(--shelfy-muted)] text-center py-6 italic">Sin datos de contacto registrados</p>
              )}
              {!clientePopup.loading && clientePopup.data && clientePopup.data.length > 0 && (() => {
                const c = clientePopup.data![0];
                const mapsUrl = c.latitud && c.longitud
                  ? `https://www.google.com/maps/search/?api=1&query=${c.latitud},${c.longitud}`
                  : null;
                return (
                  <div className="space-y-3">
                    {(c.nombre_fantasia || c.nombre_razon_social) && (
                      <div>
                        <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide">Razón social</p>
                        <p className="text-sm text-[var(--shelfy-text)] font-medium">
                          {c.nombre_razon_social || c.nombre_fantasia}
                        </p>
                      </div>
                    )}
                    {c.id_cliente_erp && (
                      <div>
                        <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide">N° Cliente ERP</p>
                        <p className="text-sm text-[var(--shelfy-text)] font-mono">{c.id_cliente_erp}</p>
                      </div>
                    )}
                    {(c.domicilio || c.localidad || c.provincia) && (
                      <div>
                        <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide">Dirección</p>
                        <p className="text-sm text-[var(--shelfy-text)]">
                          {[c.domicilio, c.localidad, c.provincia].filter(Boolean).join(", ")}
                        </p>
                      </div>
                    )}
                    {c.canal && (
                      <div>
                        <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide">Canal</p>
                        <p className="text-sm text-[var(--shelfy-text)]">{c.canal}</p>
                      </div>
                    )}
                    {mapsUrl && (
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors mt-1"
                      >
                        <MapPin size={14} />
                        Ver en Google Maps
                      </a>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* GPS Permission Dialog — superadmin only */}
      {isSuperadmin && showGpsDialog && (
        <div
          className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setShowGpsDialog(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border shadow-2xl overflow-hidden"
            style={{ background: "rgba(10,14,24,0.98)", borderColor: "rgba(124,58,237,0.35)" }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-3 text-center">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl"
                style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)" }}>
                📍
              </div>
              <p className="text-sm font-bold text-white mb-1">Activar ubicación</p>
              <p className="text-xs text-white/50 leading-relaxed">
                ShelfyMaps necesita tu ubicación para mostrarte los PDVs cercanos
              </p>
            </div>
            <div className="px-4 pb-5 flex flex-col gap-2 mt-1">
              <button
                onClick={handleGpsActivar}
                className="w-full py-2.5 rounded-xl font-semibold text-sm text-white transition-all active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)" }}
              >
                Activar GPS
              </button>
              <button
                onClick={() => { setShowGpsDialog(false); setShelfyMapsOpen(true); }}
                className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                Continuar sin GPS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ShelfyMaps Fullscreen Modal — superadmin only */}
      {isSuperadmin && shelfyMapsOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", flexDirection: "column", background: "#0a0e1a" }}
        >
          {/* Top bar */}
          <div style={{
            height: 48, flexShrink: 0, display: "flex", alignItems: "center",
            padding: "0 12px", gap: 8,
            background: "rgba(10,14,24,0.98)",
            borderBottom: "1px solid rgba(124,58,237,0.2)",
          }}>
            {/* Back button */}
            <button
              onClick={() => { setShelfyMapsOpen(false); setShelfyFilterOpen(false); }}
              style={{
                width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, cursor: "pointer", flexShrink: 0,
              }}
            >
              ←
            </button>
            {/* Title */}
            <span style={{
              flex: 1, textAlign: "center", fontWeight: 700, fontSize: 15,
              color: "white", letterSpacing: "0.01em",
            }}>
              🗺️ ShelfyMaps
            </span>
            {/* GPS indicator */}
            {shelfyGpsGranted && (
              <span style={{ fontSize: 10, color: "#10B981", fontWeight: 600, flexShrink: 0, marginRight: 4 }}>
                GPS ●
              </span>
            )}
            {/* Filter toggle button */}
            <button
              onClick={() => setShelfyFilterOpen(f => !f)}
              style={{
                width: 36, height: 36, borderRadius: 10,
                border: shelfyFilterOpen ? "1px solid rgba(124,58,237,0.5)" : "1px solid rgba(255,255,255,0.1)",
                background: shelfyFilterOpen ? "rgba(124,58,237,0.2)" : "rgba(255,255,255,0.06)",
                color: shelfyFilterOpen ? "#a78bfa" : "rgba(255,255,255,0.7)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, cursor: "pointer", flexShrink: 0,
              }}
            >
              ☰
            </button>
          </div>

          {/* Map area with optional filter panel overlay */}
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            {/* Vendor filter panel — slides in from right */}
            {shelfyFilterOpen && (
              <div style={{
                position: "absolute", top: 0, right: 0, bottom: 0, width: 300,
                zIndex: 20, display: "flex", flexDirection: "column",
                background: "rgba(10,14,24,0.96)",
                backdropFilter: "blur(12px)",
                borderLeft: "1px solid rgba(255,255,255,0.08)",
                overflowY: "auto",
              }}>
                {/* Panel header */}
                <div style={{
                  padding: "12px 12px 10px", display: "flex", alignItems: "center",
                  justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.06)",
                  flexShrink: 0,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Vendedores
                  </span>
                  <button
                    onClick={() => setShelfyFilterOpen(false)}
                    style={{ color: "rgba(255,255,255,0.3)", background: "none", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 2 }}
                  >
                    ×
                  </button>
                </div>
                {/* Sucursal chips */}
                <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
                  <p style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Sucursal</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {sucursales.map(suc => (
                      <button
                        key={suc}
                        onClick={() => {
                          setSelectedSucursal(suc === selectedSucursal ? null : suc);
                          setVisibleVends(new Set());
                          setVisibleRutas(new Set());
                          setVisibleClientes(new Set());
                        }}
                        style={{
                          padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600,
                          border: selectedSucursal === suc ? "1px solid transparent" : "1px solid rgba(255,255,255,0.1)",
                          background: selectedSucursal === suc ? "#7C3AED" : "rgba(255,255,255,0.05)",
                          color: selectedSucursal === suc ? "white" : "rgba(255,255,255,0.5)",
                          cursor: "pointer",
                        }}
                      >
                        {suc}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Vendor list with toggles */}
                <div style={{ flex: 1, overflowY: "auto" }}>
                  {vendedoresFiltrados.length === 0 && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 24, color: "rgba(255,255,255,0.2)", fontSize: 12 }}>
                      {selectedSucursal ? "Sin vendedores" : "Seleccioná una sucursal"}
                    </div>
                  )}
                  {vendedoresFiltrados.map((v) => {
                    const idx = vendedores.indexOf(v);
                    const color = vendorColor(idx);
                    const isVendOn = visibleVends.has(v.id_vendedor);
                    const isVendLoad = loadingMap.has(v.id_vendedor);
                    const pct = v.total_pdv > 0 ? Math.round(((v.pdv_activos ?? 0) / v.total_pdv) * 100) : 0;
                    return (
                      <div key={v.id_vendedor} style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {/* Avatar */}
                          <div style={{
                            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                            backgroundColor: color + "22", color,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 11, fontWeight: 700,
                          }}>
                            {v.nombre_vendedor.trim().split(/\s+/).slice(0, 2).map((w: string) => w[0] ?? "").join("").toUpperCase() || "?"}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 12, fontWeight: 700, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>
                              {v.nombre_vendedor}
                            </p>
                            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{v.total_pdv} PDV · {pct}% activos</p>
                          </div>
                          {/* Toggle button */}
                          <button
                            onClick={() => toggleVendor(v.id_vendedor)}
                            style={{
                              width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                              border: isVendOn ? "1px solid transparent" : "1px solid rgba(255,255,255,0.2)",
                              background: isVendOn ? color : "transparent",
                              color: isVendOn ? "white" : "rgba(255,255,255,0.3)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              cursor: "pointer", fontSize: 13,
                              boxShadow: isVendOn ? `0 0 6px ${color}55` : "none",
                            }}
                          >
                            {isVendLoad ? "⟳" : isVendOn ? "●" : "○"}
                          </button>
                        </div>
                        {v.total_pdv > 0 && (
                          <div style={{ marginTop: 6, height: 2, borderRadius: 2, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, backgroundColor: color }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* The map — fills the entire area */}
            {pines.length === 0 ? (
              <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "rgba(255,255,255,0.3)" }}>
                <span style={{ fontSize: 40 }}>🗺️</span>
                <p style={{ fontSize: 14, textAlign: "center", padding: "0 32px", lineHeight: 1.5 }}>
                  {!selectedSucursal
                    ? "Abrí el menú ☰ y seleccioná una sucursal"
                    : "Activá un vendedor en el menú ☰ para ver sus PDVs"
                  }
                </p>
              </div>
            ) : (
              <MapaRutas pines={pines} shelfyMapsMode={true} />
            )}

            {/* PDV count pill — top-left over map */}
            {pines.length > 0 && (
              <div style={{
                position: "absolute", top: 10, left: 10, zIndex: 10,
                background: "rgba(10,14,24,0.85)", backdropFilter: "blur(8px)",
                color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: 700,
                padding: "4px 10px", borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.1)",
                pointerEvents: "none",
              }}>
                {pines.length.toLocaleString()} PDV
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scanner GPS Modal */}
      {scannerOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#0a0f1a] border border-green-500/20 rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-[0_0_40px_rgba(34,197,94,0.08)]">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-green-500/15">
              <div className="flex items-center gap-3">
                <div className="relative w-8 h-8 flex items-center justify-center">
                  {/* Radar rings */}
                  <span className="absolute inset-0 rounded-full border border-green-400/60 animate-ping" style={{ animationDuration: "1.4s" }} />
                  <span className="absolute inset-1 rounded-full border border-green-400/40 animate-ping" style={{ animationDuration: "1.4s", animationDelay: "0.3s" }} />
                  <span className="absolute inset-2 rounded-full border border-green-400/20 animate-ping" style={{ animationDuration: "1.4s", animationDelay: "0.6s" }} />
                  <div className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)] z-10" />
                </div>
                <div>
                  <p className="text-sm font-bold text-green-400 tracking-wide">SCANNER GPS</p>
                  <p className="text-[10px] text-white/40 font-mono">
                    {scannerLoading
                      ? "Escaneando..."
                      : pdvsCercanos.length > 0
                        ? scannerFallback
                          ? `${pdvsCercanos.length} PDV${pdvsCercanos.length !== 1 ? "s" : ""} más cercano${pdvsCercanos.length !== 1 ? "s" : ""} (fuera de radio)`
                          : `${pdvsCercanos.length} PDV${pdvsCercanos.length !== 1 ? "s" : ""} detectado${pdvsCercanos.length !== 1 ? "s" : ""}`
                        : "Sin señal"}
                  </p>
                </div>
              </div>
              <button onClick={() => setScannerOpen(false)} className="text-white/30 hover:text-white/80 transition-colors p-1">
                <X size={16} />
              </button>
            </div>

            {/* Radar animation or results */}
            <div className="flex-1 overflow-y-auto">
              {scannerLoading && (
                <div className="flex flex-col items-center justify-center py-12 gap-6">
                  {/* Big radar */}
                  <div className="relative w-32 h-32 flex items-center justify-center">
                    <span className="absolute inset-0 rounded-full border-2 border-green-400/50 animate-ping" style={{ animationDuration: "1.2s" }} />
                    <span className="absolute inset-3 rounded-full border border-green-400/35 animate-ping" style={{ animationDuration: "1.2s", animationDelay: "0.25s" }} />
                    <span className="absolute inset-6 rounded-full border border-green-400/20 animate-ping" style={{ animationDuration: "1.2s", animationDelay: "0.5s" }} />
                    <span className="absolute inset-9 rounded-full border border-green-400/15 animate-ping" style={{ animationDuration: "1.2s", animationDelay: "0.75s" }} />
                    <div className="w-5 h-5 rounded-full bg-green-400 shadow-[0_0_16px_rgba(74,222,128,0.9)]" />
                  </div>
                  <p className="text-green-400/70 text-sm font-mono tracking-widest animate-pulse">ESCANEANDO ZONA...</p>
                </div>
              )}

              {gpsError && (
                <div className="flex flex-col items-center justify-center py-10 px-6 gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                    <X size={18} className="text-red-400" />
                  </div>
                  <p className="text-red-400 text-sm text-center">{gpsError}</p>
                </div>
              )}

              {!scannerLoading && !gpsError && pdvsCercanos.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <p className="text-white/30 text-sm font-mono">SIN RESULTADOS</p>
                </div>
              )}

              {pdvsCercanos.length > 0 && !scannerLoading && (
                <div className="divide-y divide-green-500/10">
                  {pdvsCercanos.map((pdv, idx) => {
                    const diasUltimaCompra = pdv.fecha_ultima_compra
                      ? Math.floor((Date.now() - new Date(pdv.fecha_ultima_compra).getTime()) / 86400000)
                      : null;
                    const compraActiva = diasUltimaCompra !== null && diasUltimaCompra < 90;
                    const distLabel = pdv.distancia_metros < 1000
                      ? `${pdv.distancia_metros}m`
                      : `${(pdv.distancia_metros / 1000).toFixed(1)}km`;
                    return (
                      <div key={pdv.id_cliente} className="px-5 py-3.5 hover:bg-green-500/5 transition-colors">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {/* Index dot */}
                            <span className="shrink-0 w-5 h-5 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center text-[9px] font-bold text-green-400 font-mono">{idx + 1}</span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-white leading-tight truncate">
                                {pdv.nombre_fantasia || pdv.nombre_razon_social}
                              </p>
                              {pdv.nombre_fantasia && pdv.nombre_razon_social && (
                                <p className="text-[10px] text-white/35 truncate">{pdv.nombre_razon_social}</p>
                              )}
                            </div>
                          </div>
                          <span className="shrink-0 text-xs bg-green-500/15 text-green-400 border border-green-500/25 px-2 py-0.5 rounded-full font-mono font-semibold">
                            {distLabel}
                          </span>
                        </div>

                        {pdv.domicilio && (
                          <p className="text-[11px] text-white/40 mb-2 pl-7">
                            {pdv.domicilio}{pdv.localidad ? `, ${pdv.localidad}` : ""}
                          </p>
                        )}

                        <div className="pl-7 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                          {pdv.canal && <span className="text-white/35">Canal: <span className="text-white/60">{pdv.canal}</span></span>}
                          {pdv.vendedor_nombre && <span className="text-white/35">Vendedor: <span className="text-white/60">{pdv.vendedor_nombre}</span></span>}
                          {pdv.fecha_alta && <span className="text-white/35">Alta: <span className="text-white/60">{new Date(pdv.fecha_alta).toLocaleDateString("es-AR")}</span></span>}
                          {pdv.fecha_ultima_exhibicion && <span className="text-white/35">Últ. exhibición: <span className="text-white/60">{new Date(pdv.fecha_ultima_exhibicion).toLocaleDateString("es-AR")}</span></span>}
                        </div>

                        <div className="pl-7 mt-1.5 flex items-center gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${compraActiva ? "bg-green-400 shadow-[0_0_4px_rgba(74,222,128,0.8)]" : "bg-white/20"}`} />
                          <span className={`text-[11px] ${compraActiva ? "text-green-400" : "text-white/30"}`}>
                            {pdv.fecha_ultima_compra
                              ? `Últ. compra: ${new Date(pdv.fecha_ultima_compra).toLocaleDateString("es-AR")} · ${diasUltimaCompra}d`
                              : "Sin compras registradas"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
