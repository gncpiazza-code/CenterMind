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
  Bell,
  Map as MapIcon,
  Eye,
  EyeOff,
  TrendingUp,
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

// ── Map: client-only via dynamic ────────────────────────────────────────────
const MapaRutas = dynamic(() => import("./MapaRutas"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[var(--shelfy-panel)] rounded-2xl">
      <Loader2 className="w-5 h-5 animate-spin text-[var(--shelfy-muted)]" />
    </div>
  ),
});

// ── Vendor color palette ─────────────────────────────────────────────────────
const VENDOR_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
];
const vendorColor = (i: number) => VENDOR_COLORS[i % VENDOR_COLORS.length];

// ── Day badge ────────────────────────────────────────────────────────────────
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
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${DIA_COLOR[dia] ?? DIA_COLOR["Variable"]}`}>
      {dia}
    </span>
  );
}

// ── Smooth accordion ─────────────────────────────────────────────────────────
function Accordion({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateRows: open ? "1fr" : "0fr",
      transition: "grid-template-rows 280ms ease",
    }}>
      <div style={{ overflow: "hidden" }}>{children}</div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(date: string | null): string | null {
  if (!date) return null;
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}
function isInactivo(fecha: string | null): boolean {
  if (!fecha) return true;
  return Date.now() - new Date(fecha).getTime() > 90 * 86_400_000;
}

// ── Vendor avatar with initials ──────────────────────────────────────────────
function VendorAvatar({ nombre, color }: { nombre: string; color: string }) {
  const initials = nombre.trim().split(/\s+/).slice(0, 2).map(w => w[0] ?? "").join("").toUpperCase() || "?";
  return (
    <div
      className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 select-none"
      style={{ backgroundColor: color + "22", color }}
    >
      {initials}
    </div>
  );
}

// ── Sub-menu card button ─────────────────────────────────────────────────────
function SubMenuCard({
  label, icon: Icon, active = false, coming = false,
}: { label: string; icon: React.ElementType; active?: boolean; coming?: boolean }) {
  return (
    <button
      disabled={coming}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-sm font-bold transition-all duration-200 ${
        active
          ? "bg-[var(--shelfy-primary)] text-white border-transparent shadow-lg shadow-blue-500/20"
          : coming
            ? "bg-[var(--shelfy-panel)] text-[var(--shelfy-muted)] border-[var(--shelfy-border)] opacity-40 cursor-not-allowed"
            : "bg-[var(--shelfy-panel)] text-[var(--shelfy-text)] border-[var(--shelfy-border)] hover:border-[var(--shelfy-primary)]/40"
      }`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {label}
      {coming && <span className="text-[10px] font-normal opacity-60 ml-0.5">próximamente</span>}
    </button>
  );
}

// ── Props ────────────────────────────────────────────────────────────────────
interface TabSupervisionProps {
  distId: number;
  isSuperadmin?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function TabSupervision({ distId, isSuperadmin }: TabSupervisionProps) {
  const [selectedDist, setSelectedDist]     = useState(distId);
  const [distribuidoras, setDistribuidoras] = useState<Distribuidora[]>([]);
  const [vendedores, setVendedores]         = useState<VendedorSupervision[]>([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState<string | null>(null);

  // accordion state
  const [openVend, setOpenVend]             = useState<number | null>(null);
  const [openRuta, setOpenRuta]             = useState<number | null>(null);
  const [openCliente, setOpenCliente]       = useState<number | null>(null);

  // lazy data
  const [rutas, setRutas]                   = useState<Record<number, RutaSupervision[]>>({});
  const [clientes, setClientes]             = useState<Record<number, ClienteSupervision[]>>({});
  const [loadingRutas, setLoadingRutas]     = useState<number | null>(null);
  const [loadingCli, setLoadingCli]         = useState<number | null>(null);

  // map visibility
  const [visibleVends, setVisibleVends]     = useState<Set<number>>(new Set());
  const [loadingMap, setLoadingMap]         = useState<Set<number>>(new Set());

  // ── Load distribuidoras ────────────────────────────────────────────────────
  useEffect(() => {
    if (isSuperadmin) fetchDistribuidoras(true).then(setDistribuidoras).catch(() => {});
  }, [isSuperadmin]);

  // ── Load vendedores ────────────────────────────────────────────────────────
  const loadVendedores = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOpenVend(null); setOpenRuta(null); setOpenCliente(null);
    setRutas({}); setClientes({});
    setVisibleVends(new Set());
    try {
      const data = await fetchVendedoresSupervision(selectedDist);
      setVendedores(data);
      // start with all vendors visible on map
      setVisibleVends(new Set(data.map(v => v.id_vendedor)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error cargando datos");
    } finally {
      setLoading(false);
    }
  }, [selectedDist]);

  useEffect(() => { loadVendedores(); }, [loadVendedores]);

  // ── Accordion handlers ─────────────────────────────────────────────────────
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

  // ── Load all data for map (routes + clients for a vendor) ──────────────────
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

  // ── Toggle vendor on map ───────────────────────────────────────────────────
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

  // ── Derive map pins from loaded data ───────────────────────────────────────
  const pines = useMemo<PinCliente[]>(() => {
    const result: PinCliente[] = [];
    vendedores.forEach((v, idx) => {
      if (!visibleVends.has(v.id_vendedor)) return;
      const color = vendorColor(idx);
      (rutas[v.id_vendedor] ?? []).forEach(r => {
        (clientes[r.id_ruta] ?? []).forEach(c => {
          if (!c.latitud || !c.longitud) return;
          result.push({
            id: c.id_cliente,
            lat: c.latitud,
            lng: c.longitud,
            nombre: c.nombre_fantasia || c.nombre_razon_social || "Sin nombre",
            color,
            activo: !isInactivo(c.fecha_ultima_compra),
            vendedor: v.nombre_vendedor,
            ultimaCompra: fmt(c.fecha_ultima_compra),
          });
        });
      });
    });
    return result;
  }, [vendedores, visibleVends, rutas, clientes]);

  const totalPdv      = vendedores.reduce((s, v) => s + v.total_pdv, 0);
  const totalActivos  = vendedores.reduce((s, v) => s + (v.pdv_activos ?? 0), 0);
  const pctActivos    = totalPdv > 0 ? Math.round((totalActivos / totalPdv) * 100) : 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Sub-menu */}
      <div className="flex items-center gap-2 flex-wrap">
        <SubMenuCard label="Rutas de Venta" icon={RouteIcon} active />
        <SubMenuCard label="Alertas"         icon={Bell}       coming />
        <SubMenuCard label="Cobertura"       icon={MapIcon}    coming />
        <SubMenuCard label="Tendencias"      icon={TrendingUp} coming />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-[var(--shelfy-text)]">Mapa de Rutas</h2>
          <p className="text-xs text-[var(--shelfy-muted)] mt-0.5">
            {vendedores.length} vendedores · {totalPdv.toLocaleString()} PDV
            {totalPdv > 0 && (
              <span className="ml-2">
                <span className="text-emerald-400 font-semibold">{pctActivos}% activos</span>
                <span className="mx-1 opacity-40">·</span>
                <span className="text-red-400 font-semibold">{100 - pctActivos}% inactivos</span>
              </span>
            )}
          </p>
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
          <button onClick={loadVendedores} disabled={loading} title="Actualizar"
            className="text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] transition-colors">
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

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20 gap-3 text-[var(--shelfy-muted)]">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Cargando vendedores...</span>
        </div>
      )}

      {/* Two-column layout */}
      {!loading && !error && (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">

          {/* ── LEFT: vendor wall ──────────────────────────────────────────── */}
          <div className="xl:col-span-2 flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: 680 }}>

            {vendedores.length === 0 && (
              <p className="text-[var(--shelfy-muted)] text-sm py-10 text-center">
                No hay vendedores con padrón cargado para esta distribuidora.
              </p>
            )}

            {vendedores.map((v, idx) => {
              const color    = vendorColor(idx);
              const vOpen    = openVend === v.id_vendedor;
              const vRutas   = rutas[v.id_vendedor] ?? [];
              const isOnMap  = visibleVends.has(v.id_vendedor);
              const isLoad   = loadingMap.has(v.id_vendedor);

              return (
                <div key={v.id_vendedor}
                  className="rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] overflow-hidden">

                  {/* Card top */}
                  <div className="flex">
                    {/* Color strip */}
                    <div className="w-1 shrink-0 rounded-l-2xl" style={{ backgroundColor: color }} />

                    <div className="flex-1 min-w-0">
                      {/* Vendor header row */}
                      <button
                        onClick={() => handleVend(v.id_vendedor)}
                        className="w-full flex items-center gap-3 px-3 pt-3 pb-2 hover:bg-white/3 transition-colors text-left"
                      >
                        <VendorAvatar nombre={v.nombre_vendedor} color={color} />
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-[var(--shelfy-text)] text-sm truncate leading-snug">
                            {v.nombre_vendedor}
                          </p>
                          <p className="text-[11px] text-[var(--shelfy-muted)] truncate">{v.sucursal_nombre}</p>
                        </div>
                        <div className="flex flex-col items-end shrink-0 mr-1">
                          <span className="text-sm font-black text-[var(--shelfy-text)]">{v.total_pdv.toLocaleString()}</span>
                          <span className="text-[10px] text-[var(--shelfy-muted)]">{v.total_rutas} rutas</span>
                        </div>
                        <ChevronRight className={`w-4 h-4 text-[var(--shelfy-muted)] shrink-0 transition-transform duration-200 ${vOpen ? "rotate-90" : ""}`} />
                      </button>

                      {/* Actividad bar */}
                      {v.total_pdv > 0 && (
                        <div className="px-3 pb-2">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-3 text-[11px]">
                              <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                                {(v.pdv_activos ?? 0).toLocaleString()} activos
                              </span>
                              <span className="flex items-center gap-1 text-[var(--shelfy-muted)]">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-500 inline-block" />
                                {(v.pdv_inactivos ?? 0).toLocaleString()} inactivos
                              </span>
                            </div>
                            <span className="text-[11px] font-bold" style={{ color }}>
                              {v.total_pdv > 0 ? Math.round(((v.pdv_activos ?? 0) / v.total_pdv) * 100) : 0}%
                            </span>
                          </div>
                          <div className="w-full h-1 rounded-full bg-slate-700/60 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${v.total_pdv > 0 ? ((v.pdv_activos ?? 0) / v.total_pdv) * 100 : 0}%`,
                                backgroundColor: color,
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Map toggle row */}
                      <div className="flex items-center gap-2 px-3 pb-2.5">
                        <button
                          onClick={() => toggleVend(v.id_vendedor)}
                          className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-all ${
                            isOnMap
                              ? "border-transparent text-white"
                              : "border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:border-current"
                          }`}
                          style={isOnMap ? { backgroundColor: color + "cc" } : {}}
                        >
                          {isLoad
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : isOnMap ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />
                          }
                          {isOnMap ? "en mapa" : "ver en mapa"}
                        </button>
                        {loadingRutas === v.id_vendedor && (
                          <Loader2 className="w-3 h-3 animate-spin text-[var(--shelfy-muted)]" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Rutas accordion */}
                  <Accordion open={vOpen}>
                    <div className="border-t border-[var(--shelfy-border)]/60 bg-[var(--shelfy-bg)]/40 px-2 py-1.5 space-y-1">
                      {vRutas.length === 0 && loadingRutas === v.id_vendedor && (
                        <div className="flex items-center gap-2 py-3 px-2 text-xs text-[var(--shelfy-muted)]">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando rutas...
                        </div>
                      )}
                      {vRutas.length === 0 && loadingRutas !== v.id_vendedor && (
                        <p className="text-xs text-[var(--shelfy-muted)] px-2 py-2">Sin rutas asignadas.</p>
                      )}

                      {vRutas.map(r => {
                        const rOpen = openRuta === r.id_ruta;
                        const rCli  = clientes[r.id_ruta] ?? [];

                        return (
                          <div key={r.id_ruta}
                            className="rounded-xl border border-[var(--shelfy-border)]/60 bg-[var(--shelfy-panel)] overflow-hidden">

                            <button
                              onClick={() => handleRuta(r.id_ruta)}
                              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/5 transition-colors text-left"
                            >
                              <ChevronRight className={`w-3.5 h-3.5 text-[var(--shelfy-muted)] shrink-0 transition-transform ${rOpen ? "rotate-90" : ""}`} />
                              <RouteIcon className="w-3.5 h-3.5 shrink-0" style={{ color: color + "aa" }} />
                              <span className="text-xs font-semibold text-[var(--shelfy-text)] flex-1 truncate">
                                Ruta {r.nombre_ruta}
                              </span>
                              <div className="flex items-center gap-2 shrink-0">
                                <DiaBadge dia={r.dia_semana} />
                                <span className="text-[11px] text-[var(--shelfy-muted)]">
                                  <span className="font-bold text-[var(--shelfy-text)]">{r.total_pdv}</span> PDV
                                </span>
                                {loadingCli === r.id_ruta && <Loader2 className="w-3 h-3 animate-spin text-[var(--shelfy-muted)]" />}
                              </div>
                            </button>

                            {/* Clientes accordion */}
                            <Accordion open={rOpen}>
                              <div className="border-t border-[var(--shelfy-border)]/40 bg-[var(--shelfy-bg)]/50 px-2 py-1 space-y-0.5">
                                {rCli.length === 0 && loadingCli === r.id_ruta && (
                                  <div className="flex items-center gap-2 py-2 px-1 text-xs text-[var(--shelfy-muted)]">
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
                                    <div key={c.id_cliente} className="rounded-lg overflow-hidden">
                                      <button
                                        onClick={() => handleCliente(c.id_cliente)}
                                        className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 transition-colors text-left rounded-lg"
                                      >
                                        <ChevronRight className={`w-3 h-3 text-[var(--shelfy-muted)] shrink-0 transition-transform duration-200 ${cOpen ? "rotate-90" : ""}`} />
                                        <span
                                          className="w-1.5 h-1.5 rounded-full shrink-0"
                                          style={{ backgroundColor: inactivo ? "#6b7280" : color }}
                                        />
                                        <span className={`text-xs flex-1 truncate font-medium ${inactivo ? "text-[var(--shelfy-muted)]" : "text-[var(--shelfy-text)]"}`}>
                                          {c.nombre_fantasia || c.nombre_razon_social || "Sin nombre"}
                                        </span>
                                        <div className="flex items-center gap-2 shrink-0">
                                          {fechaAlta && (
                                            <span className="text-[10px] text-[var(--shelfy-muted)] hidden sm:inline">
                                              Alta: {fechaAlta}
                                            </span>
                                          )}
                                          <span className="text-[10px] text-[var(--shelfy-muted)] font-mono">
                                            #{c.id_cliente_erp}
                                          </span>
                                        </div>
                                      </button>

                                      {/* Detail card */}
                                      <Accordion open={cOpen}>
                                        <div className="mx-2 mb-1 rounded-xl border border-[var(--shelfy-border)]/50 bg-[var(--shelfy-bg)] px-3 py-2.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                          {c.domicilio && (
                                            <div className="flex items-start gap-1.5 col-span-full">
                                              <MapPin className="w-3.5 h-3.5 text-[var(--shelfy-muted)] mt-0.5 shrink-0" />
                                              <span className="text-xs text-[var(--shelfy-text)]">
                                                {c.domicilio}{c.localidad ? `, ${c.localidad}` : ""}{c.provincia ? ` (${c.provincia})` : ""}
                                              </span>
                                              {mapUrl && (
                                                <a href={mapUrl} target="_blank" rel="noopener noreferrer"
                                                  onClick={e => e.stopPropagation()}
                                                  className="text-[11px] text-[var(--shelfy-primary)] hover:underline shrink-0 ml-1">
                                                  ver mapa
                                                </a>
                                              )}
                                            </div>
                                          )}
                                          <div className="flex items-center gap-1.5">
                                            <ShoppingCart className="w-3.5 h-3.5 text-[var(--shelfy-muted)] shrink-0" />
                                            <span className="text-xs text-[var(--shelfy-muted)]">Últ. compra:</span>
                                            <span className={`text-xs font-semibold ${inactivo ? "text-red-400" : "text-emerald-400"}`}>
                                              {ultimaComp ?? "—"}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-1.5">
                                            <Calendar className="w-3.5 h-3.5 text-[var(--shelfy-muted)] shrink-0" />
                                            <span className="text-xs text-[var(--shelfy-muted)]">Alta:</span>
                                            <span className="text-xs font-semibold text-[var(--shelfy-text)]">
                                              {fechaAlta ?? <span className="text-[var(--shelfy-muted)] italic text-[11px]">sin fecha*</span>}
                                            </span>
                                          </div>
                                          {c.canal && (
                                            <div className="col-span-full flex items-center gap-2 mt-0.5">
                                              <span
                                                className="text-[11px] font-semibold px-2 py-0.5 rounded-lg border"
                                                style={{ backgroundColor: color + "15", color, borderColor: color + "30" }}
                                              >
                                                {c.canal}
                                              </span>
                                              <span className="text-[10px] text-[var(--shelfy-muted)] italic opacity-50">
                                                ventas · cta. cte. (Fase 4)
                                              </span>
                                            </div>
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

          {/* ── RIGHT: map ─────────────────────────────────────────────────── */}
          <div className="xl:col-span-3 flex flex-col gap-3">

            {/* Layer controls */}
            <div className="rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] px-4 py-3">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-bold text-[var(--shelfy-text)] uppercase tracking-wider">
                  Capas del mapa
                </span>
                <div className="flex items-center gap-3 text-[11px] text-[var(--shelfy-muted)]">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" /> activo
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-500 inline-block" /> inactivo (&gt;90d)
                  </span>
                  <span className="font-semibold text-[var(--shelfy-text)]">
                    {pines.length.toLocaleString()} pts
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {vendedores.map((v, idx) => {
                  const color  = vendorColor(idx);
                  const isOn   = visibleVends.has(v.id_vendedor);
                  const isLoad = loadingMap.has(v.id_vendedor);
                  const firstName = v.nombre_vendedor.split(" ")[0];
                  return (
                    <button
                      key={v.id_vendedor}
                      onClick={() => toggleVend(v.id_vendedor)}
                      title={v.nombre_vendedor}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                        isOn
                          ? "border-transparent text-white"
                          : "border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:border-current"
                      }`}
                      style={isOn ? { backgroundColor: color + "cc" } : {}}
                    >
                      {isLoad
                        ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        : <span className="w-2 h-2 rounded-full shrink-0 inline-block" style={{ backgroundColor: isOn ? "white" : color }} />
                      }
                      {firstName}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Map */}
            <div
              className="rounded-2xl overflow-hidden border border-[var(--shelfy-border)] flex-1"
              style={{ minHeight: 500 }}
            >
              {pines.length === 0 ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-[var(--shelfy-panel)] text-[var(--shelfy-muted)]" style={{ minHeight: 500 }}>
                  <MapIcon className="w-10 h-10 opacity-20" />
                  <p className="text-sm font-medium">Activá un vendedor para ver su ruta en el mapa</p>
                  <p className="text-xs opacity-50">Los puntos aparecerán al cargar los clientes</p>
                </div>
              ) : (
                <MapaRutas pines={pines} />
              )}
            </div>

          </div>
        </div>
      )}

      {/* Nota fecha_alta */}
      <p className="text-[11px] text-[var(--shelfy-muted)] opacity-40 italic">
        * fecha_alta estará disponible al re-subir el padrón (el servicio ya la captura).
      </p>

    </div>
  );
}
