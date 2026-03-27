"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  type PDVsCercanosResponse,
  type VendedorSupervision,
  type RutaSupervision,
  type ClienteSupervision,
  type Distribuidora,
  type VentasSupervision,
  type CuentasSupervision,
  type PDVCercano,
} from "@/lib/api";
import type { PinCliente } from "./MapaRutas";

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
      className={`w-6 h-6 rounded-md flex items-center justify-center border transition-all duration-200 shrink-0 ${
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
  const [selectedDist, setSelectedDist]         = useState(distId);
  const [distribuidoras, setDistribuidoras]     = useState<Distribuidora[]>([]);
  const [vendedores, setVendedores]             = useState<VendedorSupervision[]>([]);
  const [loading, setLoading]                   = useState(false);
  const [error, setError]                       = useState<string | null>(null);

  // sucursal step
  const [selectedSucursal, setSelectedSucursal] = useState<string | null>(null);

  // accordion state
  const [openVend, setOpenVend]                 = useState<number | null>(null);
  const [openRuta, setOpenRuta]                 = useState<number | null>(null);
  const [openCliente, setOpenCliente]           = useState<number | null>(null);

  // lazy data
  const [rutas, setRutas]                       = useState<Record<number, RutaSupervision[]>>({});
  const [clientes, setClientes]                 = useState<Record<number, ClienteSupervision[]>>({});
  const [loadingRutas, setLoadingRutas]         = useState<number | null>(null);
  const [loadingCli, setLoadingCli]             = useState<number | null>(null);

  // ── 3-level visibility ────────────────────────────────────────────────────
  // Each level is independent: pin shows only if ALL THREE levels are ON
  const [visibleVends, setVisibleVends]         = useState<Set<number>>(new Set());
  const [visibleRutas, setVisibleRutas]         = useState<Set<number>>(new Set());
  const [visibleClientes, setVisibleClientes]   = useState<Set<number>>(new Set());
  const [loadingMap, setLoadingMap]             = useState<Set<number>>(new Set());

  // ── Scanner GPS ───────────────────────────────────────────────────────────
  const [scannerOpen, setScannerOpen]           = useState(false);
  const [scannerLoading, setScannerLoading]     = useState(false);
  const [pdvsCercanos, setPdvsCercanos]         = useState<PDVCercano[]>([]);
  const [scannerFallback, setScannerFallback]   = useState(false);
  const [gpsError, setGpsError]                 = useState<string | null>(null);

  // ── Ventas & Cuentas ──────────────────────────────────────────────────────
  const [ventasDias, setVentasDias]             = useState<7 | 30 | 90>(30);
  const [ventasData, setVentasData]             = useState<VentasSupervision | null>(null);
  const [loadingVentas, setLoadingVentas]       = useState(false);
  const [openVentasVend, setOpenVentasVend]     = useState<string | null>(null);
  const [cuentasData, setCuentasData]           = useState<CuentasSupervision | null>(null);
  const [loadingCuentas, setLoadingCuentas]     = useState(false);
  const [openCuentasVend, setOpenCuentasVend]   = useState<string | null>(null);

  // ── Load distribuidoras ───────────────────────────────────────────────────
  useEffect(() => {
    if (isSuperadmin) fetchDistribuidoras(true).then(setDistribuidoras).catch(() => {});
  }, [isSuperadmin]);

  // ── Sync selectedDist when distId changes (handles auth loading delay) ─────
  // useState(distId) only uses initial value once; this keeps non-superadmin
  // users always locked to their own distributor, even after the auth hydrates.
  useEffect(() => {
    if (!isSuperadmin && distId > 0 && distId !== selectedDist) {
      setSelectedDist(distId);
    }
  }, [distId, isSuperadmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load vendedores ───────────────────────────────────────────────────────
  const loadVendedores = useCallback(async () => {
    if (!selectedDist) return;
    setLoading(true);
    setError(null);
    setOpenVend(null); setOpenRuta(null); setOpenCliente(null);
    setRutas({}); setClientes({});
    setVisibleVends(new Set());
    setVisibleRutas(new Set());
    setVisibleClientes(new Set());
    setSelectedSucursal(null);
    try {
      const data = await fetchVendedoresSupervision(selectedDist);
      setVendedores(data);
      const slist = [...new Set(data.map(v => v.sucursal_nombre))];
      if (slist.length === 1) setSelectedSucursal(slist[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error cargando datos");
    } finally {
      setLoading(false);
    }
  }, [selectedDist]);

  useEffect(() => { loadVendedores(); }, [loadVendedores]);

  useEffect(() => {
    if (!selectedDist) return;
    setVentasData(null);
    setLoadingVentas(true);
    fetchVentasSupervision(selectedDist, ventasDias)
      .then(setVentasData).catch(() => {}).finally(() => setLoadingVentas(false));
  }, [selectedDist, ventasDias]);

  useEffect(() => {
    if (!selectedDist) return;
    setCuentasData(null);
    setLoadingCuentas(true);
    fetchCuentasSupervision(selectedDist)
      .then((data) => {
        console.log("[CUENTAS DEBUG] dist_id:", selectedDist);
        console.log("[CUENTAS DEBUG] vendedores recibidos:", data.vendedores.length);
        console.log("[CUENTAS DEBUG] sucursales en cuentas:", [...new Set(data.vendedores.map((v: any) => v.sucursal))]);
        console.log("[CUENTAS DEBUG] raw:", data);
        setCuentasData(data);
      })
      .catch((e) => console.error("[CUENTAS DEBUG] error:", e))
      .finally(() => setLoadingCuentas(false));
  }, [selectedDist]);

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

  const cuentasFiltradas = useMemo(() => {
    if (!cuentasData || !selectedSucursal) return null;
    // El campo sucursal de cada vendedor viene de sucursales_v2 via cc_detalle (autoritative)
    console.log("[CUENTAS DEBUG] selectedSucursal:", selectedSucursal);
    console.log("[CUENTAS DEBUG] vendedores en cuentasData:", cuentasData.vendedores.map((v: any) => ({ vendedor: v.vendedor, sucursal: v.sucursal })));
    const filteredVends = cuentasData.vendedores.filter(
      (v: any) => (v.sucursal ?? "").toLowerCase() === selectedSucursal.toLowerCase()
    );
    console.log("[CUENTAS DEBUG] filteredVends:", filteredVends.length);
    const totalDeuda = filteredVends.reduce((s: number, v: any) => s + v.deuda_total, 0);
    const clientesDeudores = filteredVends.reduce((s: number, v: any) => s + v.cantidad_clientes, 0);
    const allClientes = filteredVends.flatMap((v: any) => v.clientes);
    const promedioDias = allClientes.length > 0
      ? allClientes.reduce((s: number, c: any) => s + (c.antiguedad ?? 0), 0) / allClientes.length
      : 0;
    return {
      ...cuentasData,
      metadatos: { total_deuda: totalDeuda, clientes_deudores: clientesDeudores, promedio_dias_retraso: promedioDias },
      vendedores: filteredVends,
    };
  }, [cuentasData, selectedSucursal]);

  // ── Print cuentas corrientes ─────────────────────────────────────────────
  function handlePrintCuentas() {
    if (!cuentasFiltradas) return;
    const data = cuentasFiltradas;
    const fmtN = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
    const coloresDia: Record<string, string> = {
      "1-7 Días": "#16a34a", "8-15 Días": "#ca8a04",
      "16-21 Días": "#ea580c", "22-30 Días": "#dc2626", "+30 Días": "#9f1239",
    };
    const vendedoresHTML = data.vendedores.map((v: any) => {
      const filas = v.clientes.map((c: any) => {
        const dias = c.antiguedad ?? 0;
        const colorDias = dias > 30 ? "#dc2626" : dias > 21 ? "#ea580c" : dias > 15 ? "#ca8a04" : dias > 7 ? "#16a34a" : "#6b7280";
        return `<tr>
          <td style="padding:4px 8px;border:1px solid #e5e7eb;font-size:9px">${c.cliente ?? "-"}</td>
          <td style="padding:4px 8px;border:1px solid #e5e7eb;font-size:9px;color:#6b7280">${c.sucursal ?? "-"}</td>
          <td style="padding:4px 8px;border:1px solid #e5e7eb;font-size:9px;text-align:center;color:${colorDias};font-weight:bold">${dias}</td>
          <td style="padding:4px 8px;border:1px solid #e5e7eb;font-size:9px;text-align:center">${c.cantidad_comprobantes ?? "-"}</td>
          <td style="padding:4px 8px;border:1px solid #e5e7eb;font-size:9px;text-align:center">${c.fecha_ultima_compra ? new Date(c.fecha_ultima_compra).toLocaleDateString("es-AR") : "-"}</td>
          <td style="padding:4px 8px;border:1px solid #e5e7eb;font-size:9px;text-align:right;font-weight:600">$${fmtN(c.deuda_total)}</td>
        </tr>`;
      }).join("");
      return `<div style="margin-bottom:20px;page-break-inside:avoid">
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
            <th style="padding:5px 8px;border:1px solid #d1d5db;font-size:8px;text-align:center;text-transform:uppercase;letter-spacing:.4px">Últ. Compra</th>
            <th style="padding:5px 8px;border:1px solid #d1d5db;font-size:8px;text-align:right;text-transform:uppercase;letter-spacing:.4px">Deuda</th>
          </tr></thead>
          <tbody>${filas}</tbody>
          <tfoot><tr style="background:#f9fafb;border-top:2px solid #d1d5db">
            <td colspan="5" style="padding:5px 8px;font-size:9px;text-align:right;font-weight:700">Total</td>
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

  // ── Accordion handlers ────────────────────────────────────────────────────
  async function handleVend(id: number) {
    if (openVend === id) { setOpenVend(null); return; }
    setOpenVend(id); setOpenRuta(null); setOpenCliente(null);
    if (!rutas[id]) {
      setLoadingRutas(id);
      try {
        const data = await fetchRutasSupervision(id);
        setRutas(p => ({ ...p, [id]: data }));
      } finally { setLoadingRutas(null); }
    }
  }

  async function handleRuta(id: number) {
    if (openRuta === id) { setOpenRuta(null); return; }
    setOpenRuta(id); setOpenCliente(null);
    if (!clientes[id]) {
      setLoadingCli(id);
      try {
        const data = await fetchClientesSupervision(id);
        setClientes(p => ({ ...p, [id]: data }));
      } finally { setLoadingCli(null); }
    }
  }

  function handleCliente(id: number) {
    setOpenCliente(openCliente === id ? null : id);
  }

  // ── Load helper: all routes+clients for one vendor ────────────────────────
  async function loadDataForVendor(vendId: number): Promise<{
    vendRutas: RutaSupervision[];
    allClientIds: number[];
    allRutaIds: number[];
  }> {
    let vendRutas = rutas[vendId];
    if (!vendRutas) {
      vendRutas = await fetchRutasSupervision(vendId);
      setRutas(p => ({ ...p, [vendId]: vendRutas! }));
    }
    const allRutaIds: number[] = vendRutas.map(r => r.id_ruta);
    const allClientIds: number[] = [];
    await Promise.all(
      vendRutas.map(async r => {
        let cli = clientes[r.id_ruta];
        if (!cli) {
          cli = await fetchClientesSupervision(r.id_ruta);
          setClientes(p => ({ ...p, [r.id_ruta]: cli! }));
        }
        cli.forEach(c => allClientIds.push(c.id_cliente));
      })
    );
    return { vendRutas, allClientIds, allRutaIds };
  }

  // ── VENDOR TOGGLE ─────────────────────────────────────────────────────────
  async function toggleVendor(vendId: number) {
    const isOn = visibleVends.has(vendId);
    if (isOn) {
      // Turn OFF: remove vendor from map (routes/clients stay cached, just won't render)
      setVisibleVends(p => { const s = new Set(p); s.delete(vendId); return s; });
    } else {
      // Turn ON: load everything, enable all routes+clients
      setLoadingMap(p => new Set([...p, vendId]));
      try {
        const { allRutaIds, allClientIds } = await loadDataForVendor(vendId);
        setVisibleVends(p  => new Set([...p, vendId]));
        setVisibleRutas(p  => new Set([...p, ...allRutaIds]));
        setVisibleClientes(p => new Set([...p, ...allClientIds]));
      } finally {
        setLoadingMap(p => { const s = new Set(p); s.delete(vendId); return s; });
      }
    }
  }

  // ── ROUTE TOGGLE ─────────────────────────────────────────────────────────
  async function toggleRuta(rutaId: number, vendId: number) {
    const isOn = visibleRutas.has(rutaId);
    if (isOn) {
      // Turn OFF: remove ruta and all its clients
      const rutaClientes = clientes[rutaId] ?? [];
      const clientIds    = rutaClientes.map(c => c.id_cliente);
      setVisibleRutas(p => { const s = new Set(p); s.delete(rutaId); return s; });
      setVisibleClientes(p => {
        const s = new Set(p);
        clientIds.forEach(id => s.delete(id));
        return s;
      });
    } else {
      // Turn ON: ensure vendor + ruta are on, load clients
      setLoadingMap(p => new Set([...p, vendId]));
      try {
        let cli = clientes[rutaId];
        if (!cli) {
          cli = await fetchClientesSupervision(rutaId);
          setClientes(p => ({ ...p, [rutaId]: cli! }));
        }
        // auto-enable vendor if not already
        setVisibleVends(p  => new Set([...p, vendId]));
        setVisibleRutas(p  => new Set([...p, rutaId]));
        setVisibleClientes(p => new Set([...p, ...cli!.map(c => c.id_cliente)]));
      } finally {
        setLoadingMap(p => { const s = new Set(p); s.delete(vendId); return s; });
      }
    }
  }

  // ── PDV TOGGLE ────────────────────────────────────────────────────────────
  function toggleCliente(clienteId: number) {
    setVisibleClientes(p => {
      const s = new Set(p);
      if (s.has(clienteId)) s.delete(clienteId);
      else s.add(clienteId);
      return s;
    });
  }

  // ── Map pins — 3-level visibility check ───────────────────────────────────
  const pines = useMemo<PinCliente[]>(() => {
    const result: PinCliente[] = [];
    vendedores.forEach((v, idx) => {
      if (!visibleVends.has(v.id_vendedor)) return;
      const color = vendorColor(idx);
      (rutas[v.id_vendedor] ?? []).forEach(r => {
        if (!visibleRutas.has(r.id_ruta)) return;
        (clientes[r.id_ruta] ?? []).forEach(c => {
          if (!visibleClientes.has(c.id_cliente)) return;
          if (!c.latitud || !c.longitud) return;
          result.push({
            id:           c.id_cliente,
            lat:          c.latitud,
            lng:          c.longitud,
            nombre:       c.nombre_fantasia || c.nombre_razon_social || "Sin nombre",
            color,
            activo:       !isInactivo(c.fecha_ultima_compra),
            vendedor:     v.nombre_vendedor,
            ultimaCompra: fmt(c.fecha_ultima_compra),
          });
        });
      });
    });
    return result;
  }, [vendedores, visibleVends, visibleRutas, visibleClientes, rutas, clientes]);

  const totalPdv     = vendedoresFiltrados.reduce((s, v) => s + v.total_pdv, 0);
  const totalActivos = vendedoresFiltrados.reduce((s, v) => s + (v.pdv_activos ?? 0), 0);
  const pctActivos   = totalPdv > 0 ? Math.round((totalActivos / totalPdv) * 100) : 0;

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
            <span className="hidden sm:inline">Scanner</span>
          </button>
          <button
            onClick={loadVendedores}
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

      {/* Main split */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3 min-h-[60vh] xl:h-[680px]">

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
            <MapaRutas pines={pines} />
          )}

          {pines.length > 0 && (
            <div className="absolute top-3 left-3 z-[400] bg-black/60 backdrop-blur-sm text-white text-xs font-semibold px-2.5 py-1 rounded-lg border border-white/10 pointer-events-none">
              {pines.length.toLocaleString()} PDV visibles
            </div>
          )}
          {pines.length > 0 && (
            <div className="absolute bottom-3 left-3 z-[400] bg-black/60 backdrop-blur-sm rounded-lg px-2.5 py-1.5 flex items-center gap-3 border border-white/10 pointer-events-none">
              <span className="flex items-center gap-1.5 text-[11px] text-white/80">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" /> activo
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-white/50">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-500 inline-block" /> sin actividad +90d
              </span>
            </div>
          )}
        </div>

        {/* ── RIGHT PANEL — lista vendedores/rutas ────────────────────────── */}
        <div className="col-span-1 xl:col-span-2 flex flex-col rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] overflow-hidden">

          {/* Sucursal selector */}
          <div className="px-4 py-3 border-b border-[var(--shelfy-border)]/60 shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--shelfy-muted)] mb-2">
              Sucursal
            </p>
            {loading ? (
              <div className="flex gap-2">
                {[1, 2].map(i => <div key={i} className="h-7 w-24 rounded-lg bg-white/5 animate-pulse" />)}
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
                const vRutas    = rutas[v.id_vendedor] ?? [];
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
                          {/* Vendor eye: bigger, toggles everything */}
                          <button
                            onClick={() => toggleVendor(v.id_vendedor)}
                            title={isVendOn ? "Ocultar vendedor del mapa" : "Mostrar todos los PDV en mapa"}
                            className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-all duration-200 shrink-0 ${
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
                                    {r.nombre_ruta}
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
                                            <div className="flex items-center gap-3 flex-wrap">
                                              <div className="flex items-center gap-1">
                                                <ShoppingCart className="w-3 h-3 text-[var(--shelfy-muted)]" />
                                                <span className={`text-[11px] font-semibold ${inactivo ? "text-red-400" : "text-emerald-400"}`}>
                                                  {ultimaComp ?? "sin compras"}
                                                </span>
                                              </div>
                                              <div className="flex items-center gap-1">
                                                <Calendar className="w-3 h-3 text-[var(--shelfy-muted)]" />
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

          {/* Footer note */}
          <div className="px-4 py-2 border-t border-[var(--shelfy-border)]/40 shrink-0">
            <p className="text-[10px] text-[var(--shelfy-muted)] opacity-40 italic">
              * Re-subí el padrón para ver fecha_alta · 👁 = toggle en mapa
            </p>
          </div>
        </div>

        {/* ── MOBILE CC — columna derecha en mobile (xl:hidden) ───────────── */}
        <div className="col-span-1 xl:hidden flex flex-col rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] overflow-y-auto">
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
            {ventasFiltradas && ventasFiltradas.vendedores.length > 0 && (
              <button
                onClick={() => {
                  const rows = [["Vendedor","Fecha","Cliente","Comprobante","Número","Tipo","Devolución","Facturado","Recaudado"]];
                  ventasFiltradas.vendedores.forEach(v => v.transacciones.forEach(t => rows.push([v.vendedor, t.fecha, t.cliente??'', t.comprobante??'', t.numero??'', t.tipo_operacion??'', t.es_devolucion?'SI':'NO', String(t.monto_total), String(t.monto_recaudado)])));
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
                  <p className="text-base font-bold text-[var(--shelfy-text)]">${ventasFiltradas.total_facturado.toLocaleString("es-AR",{maximumFractionDigits:0})}</p>
                </div>
                <div className="px-5 py-3">
                  <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide mb-0.5">Recaudado</p>
                  <p className="text-base font-bold text-emerald-400">${ventasFiltradas.total_recaudado.toLocaleString("es-AR",{maximumFractionDigits:0})}</p>
                </div>
                <div className="px-5 py-3">
                  <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide mb-0.5">Comprobantes</p>
                  <p className="text-base font-bold text-[var(--shelfy-text)]">{ventasFiltradas.total_facturas.toLocaleString()}</p>
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

            {ventasFiltradas && ventasFiltradas.vendedores.length > 0 && (
              <div className="divide-y divide-[var(--shelfy-border)]/30">
                {ventasFiltradas.vendedores.map((v, idx) => {
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
                                  <th className="text-center px-3 py-2.5 font-semibold">Días</th>
                                  <th className="text-center px-3 py-2.5 font-semibold">Comprob.</th>
                                  <th className="text-center px-3 py-2.5 font-semibold">Últ. compra</th>
                                  <th className="text-right px-3 py-2.5 font-semibold">Deuda</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[var(--shelfy-border)]/20">
                                {v.clientes.map((c: any, ci: number) => {
                                  const dias = c.antiguedad ?? 0;
                                  const diasColor = dias > 30
                                    ? "text-rose-400 font-bold"
                                    : dias > 21
                                      ? "text-orange-400 font-semibold"
                                      : dias > 15
                                        ? "text-amber-400"
                                        : "text-[var(--shelfy-text)]";
                                  return (
                                    <tr key={ci} className="hover:bg-white/5 text-[var(--shelfy-text)]">
                                      <td className="px-3 py-2 max-w-[200px] truncate" title={c.cliente ?? undefined}>
                                        {c.cliente ?? "-"}
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
                                      <td className="px-3 py-2 text-center text-[var(--shelfy-muted)] tabular-nums text-[10px]">
                                        {c.fecha_ultima_compra ? new Date(c.fecha_ultima_compra).toLocaleDateString("es-AR") : "-"}
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
                                  <td colSpan={6} className="px-3 py-2 text-right text-[11px] font-bold text-[var(--shelfy-muted)] uppercase tracking-wide">
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
