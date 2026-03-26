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
} from "lucide-react";
import {
  fetchVendedoresSupervision,
  fetchRutasSupervision,
  fetchClientesSupervision,
  fetchDistribuidoras,
  type VendedorSupervision,
  type RutaSupervision,
  type ClienteSupervision,
  type Distribuidora,
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
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
  "#06b6d4", "#a3e635", "#fb923c", "#f472b6",
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
function VendorAvatar({ nombre, color }: { nombre: string; color: string }) {
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

  // map visibility — starts EMPTY always
  const [visibleVends, setVisibleVends]         = useState<Set<number>>(new Set());
  const [loadingMap, setLoadingMap]             = useState<Set<number>>(new Set());

  // ── Load distribuidoras ───────────────────────────────────────────────────
  useEffect(() => {
    if (isSuperadmin) fetchDistribuidoras(true).then(setDistribuidoras).catch(() => {});
  }, [isSuperadmin]);

  // ── Load vendedores ───────────────────────────────────────────────────────
  const loadVendedores = useCallback(async () => {
    if (!selectedDist) return;
    setLoading(true);
    setError(null);
    setOpenVend(null); setOpenRuta(null); setOpenCliente(null);
    setRutas({}); setClientes({});
    setVisibleVends(new Set()); // map always starts empty
    setSelectedSucursal(null);
    try {
      const data = await fetchVendedoresSupervision(selectedDist);
      setVendedores(data);
      // auto-select when only one sucursal
      const slist = [...new Set(data.map(v => v.sucursal_nombre))];
      if (slist.length === 1) setSelectedSucursal(slist[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error cargando datos");
    } finally {
      setLoading(false);
    }
  }, [selectedDist]);

  useEffect(() => { loadVendedores(); }, [loadVendedores]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const sucursales = useMemo(() =>
    [...new Set(vendedores.map(v => v.sucursal_nombre))].sort(),
    [vendedores]
  );

  const vendedoresFiltrados = useMemo(() =>
    selectedSucursal
      ? vendedores.filter(v => v.sucursal_nombre === selectedSucursal)
      : [],
    [vendedores, selectedSucursal]
  );

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

  // ── Load all data for map (lazy per vendor) ───────────────────────────────
  async function loadAllForMap(vendId: number) {
    if (loadingMap.has(vendId)) return;
    setLoadingMap(p => new Set([...p, vendId]));
    try {
      let vendRutas = rutas[vendId];
      if (!vendRutas) {
        vendRutas = await fetchRutasSupervision(vendId);
        setRutas(p => ({ ...p, [vendId]: vendRutas! }));
      }
      await Promise.all(
        vendRutas.map(async r => {
          if (!clientes[r.id_ruta]) {
            const cli = await fetchClientesSupervision(r.id_ruta);
            setClientes(p => ({ ...p, [r.id_ruta]: cli }));
          }
        })
      );
    } finally {
      setLoadingMap(p => { const s = new Set(p); s.delete(vendId); return s; });
    }
  }

  function toggleVend(vendId: number) {
    setVisibleVends(prev => {
      const next = new Set(prev);
      if (next.has(vendId)) {
        next.delete(vendId);
        return next;
      }
      next.add(vendId);
      loadAllForMap(vendId);
      return next;
    });
  }

  // ── Map pins (only from visible vendors) ─────────────────────────────────
  const pines = useMemo<PinCliente[]>(() => {
    const result: PinCliente[] = [];
    vendedores.forEach((v, idx) => {
      if (!visibleVends.has(v.id_vendedor)) return;
      const color = vendorColor(idx);
      (rutas[v.id_vendedor] ?? []).forEach(r => {
        (clientes[r.id_ruta] ?? []).forEach(c => {
          if (!c.latitud || !c.longitud) return;
          result.push({
            id:          c.id_cliente,
            lat:         c.latitud,
            lng:         c.longitud,
            nombre:      c.nombre_fantasia || c.nombre_razon_social || "Sin nombre",
            color,
            activo:      !isInactivo(c.fecha_ultima_compra),
            vendedor:    v.nombre_vendedor,
            ultimaCompra: fmt(c.fecha_ultima_compra),
          });
        });
      });
    });
    return result;
  }, [vendedores, visibleVends, rutas, clientes]);

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
          {isSuperadmin && distribuidoras.length > 0 && (
            <select
              value={selectedDist}
              onChange={e => setSelectedDist(Number(e.target.value))}
              className="rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-3 py-1.5 text-sm focus:outline-none"
            >
              {distribuidoras.map(d => (
                <option key={d.id} value={d.id}>{d.nombre}</option>
              ))}
            </select>
          )}
          <button
            onClick={loadVendedores}
            disabled={loading}
            title="Actualizar"
            className="text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] transition-colors p-1.5 rounded-lg hover:bg-white/5"
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

      {/* Main split: map left + panel right */}
      <div
        className="grid grid-cols-1 xl:grid-cols-5 gap-3"
        style={{ height: 680 }}
      >

        {/* ── MAP ─────────────────────────────────────────────────────────── */}
        <div className="xl:col-span-3 rounded-2xl overflow-hidden border border-[var(--shelfy-border)] relative bg-[var(--shelfy-panel)]">
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
                  : "Activá un vendedor para ver sus PDV en el mapa"
                }
              </p>
            </div>
          ) : (
            <MapaRutas pines={pines} />
          )}

          {/* Floating badge: PDV count */}
          {pines.length > 0 && (
            <div className="absolute top-3 left-3 z-[400] bg-black/60 backdrop-blur-sm text-white text-xs font-semibold px-2.5 py-1 rounded-lg border border-white/10 pointer-events-none">
              {pines.length.toLocaleString()} PDV visibles
            </div>
          )}

          {/* Floating legend */}
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

        {/* ── RIGHT PANEL ─────────────────────────────────────────────────── */}
        <div className="xl:col-span-2 flex flex-col rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] overflow-hidden">

          {/* Sucursal selector */}
          <div className="px-4 py-3 border-b border-[var(--shelfy-border)]/60 shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--shelfy-muted)] mb-2">
              Sucursal
            </p>
            {loading ? (
              <div className="flex gap-2">
                {[1, 2].map(i => (
                  <div key={i} className="h-7 w-24 rounded-lg bg-white/5 animate-pulse" />
                ))}
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
                      setVisibleVends(new Set()); // reset map when switching
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

          {/* Vendor list — scrollable */}
          <div className="flex-1 overflow-y-auto min-h-0">

            {/* Empty states */}
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

            {/* Vendor cards */}
            <div className="divide-y divide-[var(--shelfy-border)]/40">
              {vendedoresFiltrados.map(v => {
                const idx     = vendedores.indexOf(v);
                const color   = vendorColor(idx);
                const vOpen   = openVend === v.id_vendedor;
                const vRutas  = rutas[v.id_vendedor] ?? [];
                const isOnMap = visibleVends.has(v.id_vendedor);
                const isLoad  = loadingMap.has(v.id_vendedor);
                const pct     = v.total_pdv > 0
                  ? Math.round(((v.pdv_activos ?? 0) / v.total_pdv) * 100)
                  : 0;

                return (
                  <div key={v.id_vendedor}>

                    {/* ── Vendor card ── */}
                    <div className="flex items-stretch">
                      {/* Active color strip */}
                      <div
                        className="w-0.5 shrink-0 transition-colors duration-300"
                        style={{ backgroundColor: isOnMap ? color : "transparent" }}
                      />

                      <div className="flex-1 min-w-0 px-3 py-2.5">
                        {/* Row 1: avatar + name + eye toggle */}
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
                          {/* Eye toggle button */}
                          <button
                            onClick={() => toggleVend(v.id_vendedor)}
                            title={isOnMap ? "Ocultar del mapa" : "Mostrar en mapa"}
                            className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-all duration-200 shrink-0 ${
                              isOnMap
                                ? "border-transparent text-white shadow-sm"
                                : "border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:border-current hover:text-[var(--shelfy-text)]"
                            }`}
                            style={isOnMap ? { backgroundColor: color, boxShadow: `0 0 8px ${color}55` } : {}}
                          >
                            {isLoad
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : isOnMap
                                ? <Eye className="w-3.5 h-3.5" />
                                : <EyeOff className="w-3.5 h-3.5" />
                            }
                          </button>
                        </div>

                        {/* Row 2: activity bar */}
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

                        {/* Row 3: expand rutas link */}
                        <button
                          onClick={() => handleVend(v.id_vendedor)}
                          className="flex items-center gap-1 text-[11px] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] transition-colors"
                        >
                          <ChevronRight
                            className={`w-3 h-3 transition-transform duration-200 ${vOpen ? "rotate-90" : ""}`}
                          />
                          {vOpen ? "Ocultar rutas" : "Ver rutas"}
                          {loadingRutas === v.id_vendedor && (
                            <Loader2 className="w-3 h-3 animate-spin ml-1" />
                          )}
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
                          const rOpen = openRuta === r.id_ruta;
                          const rCli  = clientes[r.id_ruta] ?? [];

                          return (
                            <div key={r.id_ruta}>
                              <button
                                onClick={() => handleRuta(r.id_ruta)}
                                className="w-full flex items-center gap-2 px-5 py-2 hover:bg-white/5 transition-colors text-left"
                              >
                                <ChevronRight
                                  className={`w-3 h-3 text-[var(--shelfy-muted)] shrink-0 transition-transform duration-200 ${rOpen ? "rotate-90" : ""}`}
                                />
                                <RouteIcon
                                  className="w-3 h-3 shrink-0"
                                  style={{ color: color + "99" }}
                                />
                                <span className="text-[11px] font-semibold text-[var(--shelfy-text)] flex-1 truncate">
                                  {r.nombre_ruta}
                                </span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <DiaBadge dia={r.dia_semana} />
                                  <span className="text-[10px] text-[var(--shelfy-muted)]">
                                    {r.total_pdv} PDV
                                  </span>
                                  {loadingCli === r.id_ruta && (
                                    <Loader2 className="w-3 h-3 animate-spin text-[var(--shelfy-muted)]" />
                                  )}
                                </div>
                              </button>

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
                                    const mapUrl     = c.latitud && c.longitud
                                      ? `https://www.google.com/maps/search/?api=1&query=${c.latitud},${c.longitud}`
                                      : null;

                                    return (
                                      <div key={c.id_cliente}>
                                        <button
                                          onClick={() => handleCliente(c.id_cliente)}
                                          className="w-full flex items-center gap-2 pl-8 pr-3 py-1.5 hover:bg-white/5 transition-colors text-left"
                                        >
                                          <ChevronRight
                                            className={`w-3 h-3 text-[var(--shelfy-muted)] shrink-0 transition-transform duration-200 ${cOpen ? "rotate-90" : ""}`}
                                          />
                                          <span
                                            className="w-1.5 h-1.5 rounded-full shrink-0"
                                            style={{ backgroundColor: inactivo ? "#6b7280" : color }}
                                          />
                                          <span className={`text-[11px] flex-1 truncate ${inactivo ? "text-[var(--shelfy-muted)]" : "text-[var(--shelfy-text)]"}`}>
                                            {c.nombre_fantasia || c.nombre_razon_social || "Sin nombre"}
                                          </span>
                                        </button>

                                        {/* Detail card */}
                                        <Accordion open={cOpen}>
                                          <div className="mx-3 mb-1.5 rounded-lg border border-[var(--shelfy-border)]/50 bg-[var(--shelfy-panel)] px-3 py-2 space-y-1.5">
                                            {c.domicilio && (
                                              <div className="flex items-start gap-1.5">
                                                <MapPin className="w-3 h-3 text-[var(--shelfy-muted)] mt-0.5 shrink-0" />
                                                <span className="text-[11px] text-[var(--shelfy-text)] flex-1 leading-snug">
                                                  {c.domicilio}{c.localidad ? `, ${c.localidad}` : ""}
                                                  {c.provincia ? ` (${c.provincia})` : ""}
                                                </span>
                                                {mapUrl && (
                                                  <a
                                                    href={mapUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
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
                                                style={{
                                                  backgroundColor: color + "15",
                                                  color,
                                                  borderColor: color + "30",
                                                }}
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
              * Re-subí el padrón para ver fecha_alta
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
