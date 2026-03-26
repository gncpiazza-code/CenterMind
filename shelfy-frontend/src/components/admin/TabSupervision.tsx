"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronRight,
  MapPin,
  ShoppingCart,
  Calendar,
  Loader2,
  AlertCircle,
  RefreshCw,
  User,
  Route,
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

// ─── Colores por día ───────────────────────────────────────────────────────────

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

// ─── Animación accordion ───────────────────────────────────────────────────────

function Accordion({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: open ? "1fr" : "0fr",
        transition: "grid-template-rows 280ms ease",
      }}
    >
      <div style={{ overflow: "hidden" }}>{children}</div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(date: string | null) {
  if (!date) return "—";
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

function mapsUrl(lat: number | null, lng: number | null, nombre: string) {
  if (!lat || !lng) return null;
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface TabSupervisionProps {
  distId: number;
  isSuperadmin?: boolean;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function TabSupervision({ distId, isSuperadmin }: TabSupervisionProps) {
  const [selectedDist, setSelectedDist]   = useState(distId);
  const [distribuidoras, setDistribuidoras] = useState<Distribuidora[]>([]);
  const [vendedores, setVendedores]       = useState<VendedorSupervision[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);

  // Estado de apertura (un nivel a la vez)
  const [openVend, setOpenVend]           = useState<number | null>(null);
  const [openRuta, setOpenRuta]           = useState<number | null>(null);
  const [openCliente, setOpenCliente]     = useState<number | null>(null);

  // Datos lazy-cargados
  const [rutas, setRutas]                 = useState<Record<number, RutaSupervision[]>>({});
  const [clientes, setClientes]           = useState<Record<number, ClienteSupervision[]>>({});
  const [loadingRutas, setLoadingRutas]   = useState<number | null>(null);
  const [loadingCli, setLoadingCli]       = useState<number | null>(null);

  // Cargar distribuidoras para superadmin
  useEffect(() => {
    if (isSuperadmin) fetchDistribuidoras(true).then(setDistribuidoras).catch(() => {});
  }, [isSuperadmin]);

  // Cargar vendedores al cambiar de dist
  const loadVendedores = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOpenVend(null); setOpenRuta(null); setOpenCliente(null);
    setRutas({}); setClientes({});
    try {
      setVendedores(await fetchVendedoresSupervision(selectedDist));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error cargando datos");
    } finally {
      setLoading(false);
    }
  }, [selectedDist]);

  useEffect(() => { loadVendedores(); }, [loadVendedores]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleVend(id: number) {
    if (openVend === id) { setOpenVend(null); return; }
    setOpenVend(id); setOpenRuta(null); setOpenCliente(null);
    if (!rutas[id]) {
      setLoadingRutas(id);
      try { setRutas(p => ({ ...p, [id]: [] })); // placeholder
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

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Header + selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--shelfy-text)]">Rutas de Venta</h2>
          <p className="text-xs text-[var(--shelfy-muted)] mt-0.5">
            Vendedor → Ruta → Clientes PDV
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isSuperadmin && distribuidoras.length > 0 && (
            <select
              value={selectedDist}
              onChange={e => setSelectedDist(Number(e.target.value))}
              className="rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-3 py-1.5 text-sm focus:outline-none focus:border-[var(--shelfy-primary)]"
            >
              {distribuidoras.map(d => (
                <option key={d.id} value={d.id}>{d.nombre}</option>
              ))}
            </select>
          )}
          <button onClick={loadVendedores} disabled={loading}
            className="text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] transition-colors" title="Actualizar">
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

      {/* Lista de vendedores */}
      {!loading && !error && (
        <div className="space-y-2">
          {vendedores.length === 0 && (
            <p className="text-[var(--shelfy-muted)] text-sm py-10 text-center">
              No hay vendedores con padrón cargado para esta distribuidora.
            </p>
          )}

          {vendedores.map(v => {
            const vOpen = openVend === v.id_vendedor;
            const vRutas = rutas[v.id_vendedor] ?? [];

            return (
              <div key={v.id_vendedor}
                className="rounded-xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] overflow-hidden">

                {/* ── Fila vendedor ── */}
                <button
                  onClick={() => handleVend(v.id_vendedor)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 transition-colors text-left"
                >
                  <ChevronRight className={`w-4 h-4 text-[var(--shelfy-muted)] shrink-0 transition-transform duration-250 ${vOpen ? "rotate-90" : ""}`} />
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <User className="w-4 h-4 text-[var(--shelfy-primary)] shrink-0" />
                    <span className="font-semibold text-[var(--shelfy-text)] truncate">{v.nombre_vendedor}</span>
                    <span className="text-xs text-[var(--shelfy-muted)] hidden sm:inline shrink-0">· {v.sucursal_nombre}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-xs text-[var(--shelfy-muted)]">
                    <span><span className="font-semibold text-[var(--shelfy-text)]">{v.total_rutas}</span> rutas</span>
                    <span><span className="font-semibold text-[var(--shelfy-text)]">{v.total_pdv.toLocaleString()}</span> PDV</span>
                    {loadingRutas === v.id_vendedor && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  </div>
                </button>

                {/* ── Rutas (nivel 2) ── */}
                <Accordion open={vOpen}>
                  <div className="border-t border-[var(--shelfy-border)] bg-[var(--shelfy-bg)]/40 px-3 py-2 space-y-1">
                    {vRutas.length === 0 && loadingRutas === v.id_vendedor && (
                      <div className="flex items-center gap-2 py-3 px-2 text-xs text-[var(--shelfy-muted)]">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando rutas...
                      </div>
                    )}

                    {vRutas.map(r => {
                      const rOpen = openRuta === r.id_ruta;
                      const rCli = clientes[r.id_ruta] ?? [];

                      return (
                        <div key={r.id_ruta}
                          className="rounded-lg border border-[var(--shelfy-border)]/60 bg-[var(--shelfy-panel)] overflow-hidden">

                          {/* Fila ruta */}
                          <button
                            onClick={() => handleRuta(r.id_ruta)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 transition-colors text-left"
                          >
                            <ChevronRight className={`w-3.5 h-3.5 text-[var(--shelfy-muted)] shrink-0 transition-transform duration-250 ${rOpen ? "rotate-90" : ""}`} />
                            <Route className="w-3.5 h-3.5 text-[var(--shelfy-muted)] shrink-0" />
                            <span className="text-sm font-medium text-[var(--shelfy-text)] flex-1 truncate">
                              Ruta {r.nombre_ruta}
                            </span>
                            <div className="flex items-center gap-2 shrink-0">
                              <DiaBadge dia={r.dia_semana} />
                              <span className="text-xs text-[var(--shelfy-muted)]">
                                <span className="font-semibold text-[var(--shelfy-text)]">{r.total_pdv}</span> PDV
                              </span>
                              {loadingCli === r.id_ruta && <Loader2 className="w-3 h-3 animate-spin text-[var(--shelfy-muted)]" />}
                            </div>
                          </button>

                          {/* Clientes (nivel 3) */}
                          <Accordion open={rOpen}>
                            <div className="border-t border-[var(--shelfy-border)]/60 bg-[var(--shelfy-bg)]/60 px-2 py-1.5 space-y-0.5">
                              {rCli.length === 0 && loadingCli === r.id_ruta && (
                                <div className="flex items-center gap-2 py-2 px-2 text-xs text-[var(--shelfy-muted)]">
                                  <Loader2 className="w-3 h-3 animate-spin" /> Cargando clientes...
                                </div>
                              )}

                              {rCli.map(c => {
                                const cOpen = openCliente === c.id_cliente;
                                const mapUrl = mapsUrl(c.latitud, c.longitud, c.nombre_fantasia);

                                return (
                                  <div key={c.id_cliente}
                                    className="rounded-md overflow-hidden">

                                    {/* Fila cliente */}
                                    <button
                                      onClick={() => handleCliente(c.id_cliente)}
                                      className="w-full flex items-center gap-2 px-2 py-2 hover:bg-white/5 transition-colors text-left rounded-md"
                                    >
                                      <ChevronRight className={`w-3 h-3 text-[var(--shelfy-muted)] shrink-0 transition-transform duration-200 ${cOpen ? "rotate-90" : ""}`} />
                                      <span className="text-xs font-medium text-[var(--shelfy-text)] flex-1 truncate">
                                        {c.nombre_fantasia || c.nombre_razon_social || "Sin nombre"}
                                      </span>
                                      <span className="text-[11px] text-[var(--shelfy-muted)] shrink-0 font-mono">
                                        #{c.id_cliente_erp}
                                      </span>
                                    </button>

                                    {/* Detalle cliente (nivel 4) */}
                                    <Accordion open={cOpen}>
                                      <div className="mx-2 mb-1.5 rounded-lg border border-[var(--shelfy-border)]/60 bg-[var(--shelfy-bg)] px-3 py-2.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                        {c.domicilio && (
                                          <div className="flex items-start gap-1.5 col-span-full">
                                            <MapPin className="w-3.5 h-3.5 text-[var(--shelfy-muted)] mt-0.5 shrink-0" />
                                            <span className="text-xs text-[var(--shelfy-text)]">
                                              {c.domicilio}{c.localidad ? `, ${c.localidad}` : ""}
                                              {c.provincia ? ` (${c.provincia})` : ""}
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
                                          <span className="text-xs text-[var(--shelfy-text)] font-medium">{fmt(c.fecha_ultima_compra)}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          <Calendar className="w-3.5 h-3.5 text-[var(--shelfy-muted)] shrink-0" />
                                          <span className="text-xs text-[var(--shelfy-muted)]">Alta:</span>
                                          <span className="text-xs text-[var(--shelfy-text)] font-medium">{fmt(c.fecha_alta)}</span>
                                        </div>
                                        {c.canal && (
                                          <div className="flex items-center gap-1.5 col-span-full">
                                            <span className="text-[11px] bg-[var(--shelfy-primary)]/10 text-[var(--shelfy-primary)] border border-[var(--shelfy-primary)]/20 rounded px-1.5 py-0.5">
                                              {c.canal}
                                            </span>
                                            {/* Skeleton para ventas/cuentas — Fase 4 */}
                                            <span className="text-[11px] text-[var(--shelfy-muted)] italic opacity-40">
                                              ventas · cta. cte. (próximamente)
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
      )}
    </div>
  );
}
