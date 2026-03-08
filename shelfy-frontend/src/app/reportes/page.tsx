"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { PageSpinner } from "@/components/ui/Spinner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState, useRef, useMemo } from "react";
import {
  fetchReporteExhibiciones, fetchReporteVendedores, fetchReporteTiposPdv, fetchReporteSucursales,
  fetchROI, type ROIAnalitico
} from "@/lib/api";
import { useSearchParams } from "next/navigation";
import { Printer, Download, Search, X, ChevronDown, Check, BarChart3, Trophy, Briefcase, SwitchCamera, PieChart, AlertTriangle, Users, MapPin, Flame, RefreshCw } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

import TabGenerarInforme from "@/app/academy/cuentas-corrientes/components/TabGenerarInforme";
import TabAlertasCredito from "@/app/academy/cuentas-corrientes/components/TabAlertasCredito";
import TabSeguimientoRecaudacion from "@/app/academy/cuentas-corrientes/components/TabSeguimientoRecaudacion";
import TabPadronClientes from "@/app/academy/cuentas-corrientes/components/TabPadronClientes";
// Nota: Para saldos se usa el TabSeguimientoRecaudacion que ya integra el VisorMultitablas

// Hook para clicks fuera del elemento
function useOnClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) {
        return;
      }
      handler();
    };
    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);
    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
  }, [ref, handler]);
}

interface Fila {
  id_exhibicion: number;
  vendedor: string;
  cliente: string;
  sucursal: string;
  tipo_pdv: string;
  estado: string;
  supervisor: string;
  comentario: string;
  fecha_carga: string;
  fecha_evaluacion: string;
  link_foto: string;
}

const ESTADOS = ["Aprobado", "Destacado", "Rechazado", "Pendiente"];

function hoy() {
  return new Date().toISOString().slice(0, 10);
}
function inicioMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

// ── Multi-select chip component ───────────────────────────────────────────────

function DropdownMultiSelect({
  label, options, selected, onChange, placeholder = "Seleccionar..."
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useOnClickOutside(ref, () => setOpen(false));

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));

  const toggle = (v: string) => {
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  };

  const selectAll = () => onChange(filtered);
  const clear = () => onChange([]);

  return (
    <div className="relative flex-1 min-w-[150px]" ref={ref}>
      <label className="block text-xs text-[var(--shelfy-muted)] mb-1.5 font-medium">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] px-3 py-2 text-sm text-[var(--shelfy-text)] hover:border-[var(--shelfy-primary)] focus:outline-none transition-colors"
      >
        <span className="truncate">
          {selected.length === 0 ? placeholder : `${selected.length} seleccionados`}
        </span>
        <ChevronDown size={14} className="text-[var(--shelfy-muted)]" />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 min-w-full w-64 bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] shadow-xl rounded-xl overflow-hidden flex flex-col">
          <div className="p-2 border-b border-[var(--shelfy-border)] relative">
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--shelfy-muted)]" />
            <input
              type="text"
              placeholder="Buscar..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-md text-xs text-[var(--shelfy-text)] focus:outline-none focus:border-[var(--shelfy-primary)]"
            />
          </div>
          <div className="flex px-2 py-1.5 gap-2 border-b border-[var(--shelfy-border)] bg-[var(--shelfy-bg)]">
            <button type="button" onClick={selectAll} className="text-[11px] font-medium text-[var(--shelfy-primary)] hover:underline">Select visibles</button>
            <span className="text-[var(--shelfy-muted)]">•</span>
            <button type="button" onClick={clear} className="text-[11px] font-medium text-[var(--shelfy-muted)] hover:text-red-600 hover:underline">Limpiar</button>
          </div>
          <div className="max-h-56 overflow-y-auto p-1 custom-scrollbar">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-[var(--shelfy-muted)]">Sin resultados</div>
            ) : (
              filtered.map(o => {
                const isSel = selected.includes(o);
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => toggle(o)}
                    className="w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-[var(--shelfy-bg)] rounded-md transition-colors"
                  >
                    <span className="truncate pr-2">{o}</span>
                    {isSel && <Check size={14} className="text-[var(--shelfy-primary)] shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function HerramientasReportePage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [activeMainTab, setActiveMainTab] = useState<"exhibiciones" | "recaudacion" | "padron" | "cuentas_corrientes" | "roi">("exhibiciones");

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "cuentas_corrientes") setActiveMainTab("cuentas_corrientes");
    else if (tab === "padron") setActiveMainTab("padron");
    else if (tab === "recaudacion") setActiveMainTab("recaudacion");
  }, [searchParams]);

  const [ccpTab, setCcpTab] = useState<"resumen" | "alertas" | "informe">("resumen");
  const [ccTab, setCcTab] = useState<"generar" | "alertas">("generar");
  const [erpRoi, setErpRoi] = useState<ROIAnalitico | null>(null);
  const [loadingRoi, setLoadingRoi] = useState(false);

  // Filtros
  const [desde, setDesde] = useState(inicioMes());
  const [hasta, setHasta] = useState(hoy());
  const [vendedoresList, setVendedoresList] = useState<string[]>([]);
  const [tiposPdvList, setTiposPdvList] = useState<string[]>([]);
  const [sucursalesList, setSucursalesList] = useState<string[]>([]);
  const [selectedVendedores, setSelectedVendedores] = useState<string[]>([]);
  const [selectedEstados, setSelectedEstados] = useState<string[]>([]);
  const [selectedTipos, setSelectedTipos] = useState<string[]>([]);
  const [selectedSucursales, setSelectedSucursales] = useState<string[]>([]);
  const [nroCliente, setNroCliente] = useState("");

  // Resultados
  const [filas, setFilas] = useState<Fila[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOpts, setLoadingOpts] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  // Cargar listas de filtros al montar
  useEffect(() => {
    if (!user?.id_distribuidor) return;
    setLoadingOpts(true);
    const dId = user.id_distribuidor;
    Promise.all([
      fetchReporteVendedores(dId),
      fetchReporteTiposPdv(dId),
      fetchReporteSucursales(dId),
    ])
      .then(([v, t, s]) => { setVendedoresList(v); setTiposPdvList(t); setSucursalesList(s); })
      .catch(() => { })
      .finally(() => setLoadingOpts(false));
  }, [user]);

  async function handleBuscar() {
    if (!user?.id_distribuidor) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchReporteExhibiciones(user.id_distribuidor, {
        fecha_desde: desde,
        fecha_hasta: hasta,
        vendedores: selectedVendedores.length > 0 ? selectedVendedores : undefined,
        estados: selectedEstados.length > 0 ? selectedEstados : undefined,
        tipos_pdv: selectedTipos.length > 0 ? selectedTipos : undefined,
        sucursales: selectedSucursales.length > 0 ? selectedSucursales : undefined,
        nro_cliente: nroCliente.trim() || undefined,
      });
      setFilas(data as Fila[]);
      setSearched(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (activeMainTab === "roi" && user?.id_distribuidor && !erpRoi) {
      setLoadingRoi(true);
      fetchROI(user.id_distribuidor)
        .then(setErpRoi)
        .catch(console.error)
        .finally(() => setLoadingRoi(false));
    }
  }, [activeMainTab, user, erpRoi]);

  function handleLimpiar() {
    setSelectedVendedores([]);
    setSelectedEstados([]);
    setSelectedTipos([]);
    setSelectedSucursales([]);
    setNroCliente("");
    setDesde(inicioMes());
    setHasta(hoy());
  }

  // Cálculos para Gráficos
  const timelineData = useMemo(() => {
    if (filas.length === 0) return [];
    const counts: Record<string, number> = {};
    filas.forEach(f => {
      if (!f.fecha_carga) return;
      const dateStr = f.fecha_carga.substring(0, 10);
      counts[dateStr] = (counts[dateStr] || 0) + 1;
    });

    return Object.keys(counts).sort().map(dateStr => {
      const [y, m, d] = dateStr.split("-").map(Number);
      const dateObj = new Date(y, m - 1, d);
      const dayStr = dateObj.toLocaleDateString("es-ES", { weekday: "short" });
      return {
        fechaOriginal: dateStr,
        fecha: `${d}/${m} (${dayStr})`,
        cantidad: counts[dateStr]
      };
    });
  }, [filas]);

  // Cálculos para Ranking
  const rankingData = useMemo(() => {
    if (filas.length === 0) return [];
    const map: Record<string, { vendedor: string; puntos: number; aprobados: number; destacados: number }> = {};

    filas.forEach(f => {
      if (!f.vendedor) return;
      if (!map[f.vendedor]) {
        map[f.vendedor] = { vendedor: f.vendedor, puntos: 0, aprobados: 0, destacados: 0 };
      }
      if (f.estado === "Destacado") {
        map[f.vendedor].puntos += 2;
        map[f.vendedor].destacados += 1;
      } else if (f.estado === "Aprobado") {
        map[f.vendedor].puntos += 1;
        map[f.vendedor].aprobados += 1;
      }
    });

    return Object.values(map)
      .filter(r => r.puntos > 0)
      .sort((a, b) => b.puntos - a.puntos)
      .slice(0, 50); // Top 50 máximo en UI
  }, [filas]);

  function handleExportCSV() {
    if (filas.length === 0) return;
    const headers = ["ID", "Vendedor", "Sucursal", "Cliente", "Tipo PDV", "Estado", "Supervisor", "Comentario", "Fecha carga", "Fecha evaluación"];
    const rows = filas.map((f) => [
      f.id_exhibicion, f.vendedor, f.sucursal, f.cliente, f.tipo_pdv, f.estado,
      f.supervisor, f.comentario, f.fecha_carga, f.fecha_evaluacion,
    ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte_${desde}_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const hayFiltrosActivos = selectedVendedores.length > 0 || selectedEstados.length > 0 || selectedTipos.length > 0 || selectedSucursales.length > 0 || nroCliente.trim();

  return (
    <>
      <style>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .dashboard-container { padding: 0 !important; width: 100% !important; margin: 0 !important; }
          .print-card { box-shadow: none !important; border: 1px solid #ddd !important; break-inside: avoid; margin-bottom: 20px; }
        }
        .print-only { display: none; }
      `}</style>

      <div className="flex min-h-screen bg-[var(--shelfy-bg)] dashboard-container">
        <div className="no-print"><Sidebar /></div>
        <div className="no-print"><BottomNav /></div>
        <div className="flex flex-col flex-1 min-w-0">
          <div className="no-print"><Topbar title="Central de Reportes" /></div>

          <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 overflow-auto w-full max-w-7xl mx-auto">

            {/* Cabecera Principal */}
            <div className="mb-6 no-print">
              <h1 className="text-2xl font-black text-[var(--shelfy-text)] tracking-tight">
                Central de Reportes
              </h1>
              <p className="text-sm text-[var(--shelfy-muted)] mt-1">
                Analiza la evaluación corporativa en PDV o gestiona tus Cuentas Corrientes.
              </p>
            </div>

            {/* Selector de Herramienta Principal */}
            <div className="flex gap-1 bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] rounded-xl p-1 w-fit mb-6 shadow-sm no-print">
              <button
                onClick={() => setActiveMainTab("exhibiciones")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200
                     ${activeMainTab === "exhibiciones"
                    ? "bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-200/50"
                    : "text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] hover:bg-[var(--shelfy-bg)]"
                  }`}
              >
                <BarChart3 size={16} />
                Reporte de Exhibiciones
              </button>
              <button
                onClick={() => setActiveMainTab("recaudacion")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200
                     ${activeMainTab === "recaudacion"
                    ? "bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-200/50"
                    : "text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] hover:bg-[var(--shelfy-bg)]"
                  }`}
              >
                <PieChart size={16} />
                Seguimiento de Recaudación
              </button>
              <button
                onClick={() => setActiveMainTab("padron")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200
                     ${activeMainTab === "padron"
                    ? "bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-200/50"
                    : "text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] hover:bg-[var(--shelfy-bg)]"
                  }`}
              >
                <Users size={16} />
                Padrón de Clientes
              </button>
              <button
                onClick={() => setActiveMainTab("cuentas_corrientes")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200
                     ${activeMainTab === "cuentas_corrientes"
                    ? "bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-200/50"
                    : "text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] hover:bg-[var(--shelfy-bg)]"
                  }`}
              >
                <Briefcase size={16} />
                Cuentas Corrientes
              </button>

              {user?.usa_contexto_erp && (
                <button
                  onClick={() => setActiveMainTab("roi")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200
                       ${activeMainTab === "roi"
                      ? "bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-200/50"
                      : "text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] hover:bg-[var(--shelfy-bg)]"
                    }`}
                >
                  <BarChart3 size={16} />
                  ROI Analítico
                </button>
              )}
            </div>

            {/* Contenido Dinámico: Padrón de Clientes */}
            {activeMainTab === "padron" && user?.id_distribuidor && (
              <div className="fade-in animate-in slide-in-from-bottom-2 duration-300">
                <TabPadronClientes distId={user.id_distribuidor!} />
              </div>
            )}

            {/* Contenido Dinámico: ROI Analítico (PASO 10) */}
            {activeMainTab === "roi" && user && (
              <div className="fade-in animate-in slide-in-from-bottom-2 duration-300 md:px-4">
                <div className="flex flex-col gap-6">
                  <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                      <BarChart3 size={120} />
                    </div>
                    <div className="relative z-10">
                      <h2 className="text-xl font-black text-slate-900 mb-2">Impacto en Ventas (ROI)</h2>
                      <p className="text-sm text-slate-500 mb-8 max-w-2xl">
                        Comparamos el desempeño comercial de los clientes que poseen **Exhibiciones Destacadas** frente a aquellos que no tienen exhibiciones activas en el sistema.
                      </p>

                      {loadingRoi ? (
                        <div className="py-20 flex flex-col items-center justify-center gap-4">
                          <RefreshCw className="animate-spin text-emerald-500" size={40} />
                          <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Cruzando datos del ERP...</span>
                        </div>
                      ) : erpRoi && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          {/* Card Uplift */}
                          <div className="md:col-span-3 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-3xl p-6 text-white shadow-lg shadow-emerald-200 flex items-center justify-between">
                            <div>
                              <p className="text-xs font-black uppercase tracking-widest opacity-80 mb-1">Incremento de Venta (Uplift)</p>
                              <h3 className="text-4xl font-black">{(erpRoi.uplift_pct ?? 0) > 0 ? `+${(erpRoi.uplift_pct ?? 0).toFixed(1)}%` : `${(erpRoi.uplift_pct ?? 0).toFixed(1)}%`}</h3>
                            </div>
                            <div className="hidden sm:block">
                              <Flame size={60} className="fill-white/20 text-white/40" />
                            </div>
                          </div>

                          {/* Clientes con Exhibición */}
                          <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                            <h4 className="flex items-center gap-2 text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-4">
                              <Check size={14} className="bg-emerald-100 rounded-full p-0.5" /> Clientes Destacados
                            </h4>
                            <div className="space-y-4">
                              <div>
                                <p className="text-2xl font-black text-slate-900">${erpRoi.con_exhibicion.facturacion_promedio.toLocaleString()}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Venta Promedio</p>
                              </div>
                              <div className="pt-4 border-t border-slate-200">
                                <p className="text-sm font-bold text-slate-700">{erpRoi.con_exhibicion.clientes}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Base de Clientes</p>
                              </div>
                            </div>
                          </div>

                          {/* Clientes sin Exhibición */}
                          <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 opacity-60">
                            <h4 className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
                              <X size={14} className="bg-slate-200 rounded-full p-0.5" /> Sin Exhibición
                            </h4>
                            <div className="space-y-4">
                              <div>
                                <p className="text-2xl font-black text-slate-900">${erpRoi.sin_exhibicion.facturacion_promedio.toLocaleString()}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Venta Promedio</p>
                              </div>
                              <div className="pt-4 border-t border-slate-200">
                                <p className="text-sm font-bold text-slate-700">{erpRoi.sin_exhibicion.clientes}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Base de Clientes</p>
                              </div>
                            </div>
                          </div>

                          {/* Facturación Total de la Muestra */}
                          <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Facturación Total (Sample)</h4>
                            <div className="space-y-4">
                              <p className="text-2xl font-black text-emerald-400">${(erpRoi.con_exhibicion.facturacion_total + erpRoi.sin_exhibicion.facturacion_total).toLocaleString()}</p>
                              <p className="text-[10px] font-black text-slate-500 uppercase">Sumatoria facturado 30 días</p>
                              <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden mt-4">
                                <div
                                  className="h-full bg-emerald-500 rounded-full"
                                  style={{ width: `${(erpRoi.con_exhibicion.facturacion_total / (erpRoi.con_exhibicion.facturacion_total + erpRoi.sin_exhibicion.facturacion_total) * 100)}%` }}
                                />
                              </div>
                              <p className="text-[9px] text-slate-400 italic">La barra muestra el peso de los clientes con exhibición vs el total.</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Contenido Dinámico: Recaudación */}
            {activeMainTab === "recaudacion" && user?.id_distribuidor && (
              <div className="fade-in animate-in slide-in-from-bottom-2 duration-300">
                <TabSeguimientoRecaudacion distId={user.id_distribuidor!} />
              </div>
            )}

            {/* Contenido Dinámico: Cuentas Corrientes */}
            {activeMainTab === "cuentas_corrientes" && user && (
              <div className="flex flex-col gap-6 fade-in animate-in slide-in-from-bottom-2 duration-300">
                <div className="flex flex-wrap items-center gap-2 bg-[var(--shelfy-panel)] p-1 rounded-xl border border-[var(--shelfy-border)] w-fit no-print">
                  <button onClick={() => setCcpTab("resumen")} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${ccpTab === 'resumen' ? 'bg-[var(--shelfy-primary)] text-white shadow-sm' : 'text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]'}`}>Saldos y Alertas</button>
                  <button onClick={() => setCcpTab("alertas")} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${ccpTab === 'alertas' ? 'bg-[var(--shelfy-primary)] text-white shadow-sm' : 'text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]'}`}>Configurar Alertas</button>
                  <button onClick={() => setCcpTab("informe")} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${ccpTab === 'informe' ? 'bg-[var(--shelfy-primary)] text-white shadow-sm' : 'text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]'}`}>Reporte PDF</button>
                </div>

                {ccpTab === "resumen" && <TabSeguimientoRecaudacion distId={user.id_distribuidor!} />}
                {ccpTab === "alertas" && <TabAlertasCredito distId={user.id_distribuidor!} />}
                {ccpTab === "informe" && <TabGenerarInforme distId={user.id_distribuidor!} />}
              </div>
            )}


            {/* Contenido Dinámico: Exhibiciones */}
            {activeMainTab === "exhibiciones" && (
              <div className="fade-in animate-in slide-in-from-bottom-2 duration-300">
                {/* Cabecera Impresión */}
                <div className="print-only mb-6 pb-4 border-b border-gray-300">
                  <div className="flex items-center justify-between">
                    <img src="/LOGO_NUEVO.svg" alt="Shelfy" className="h-8 grayscale" />
                    <div className="text-right">
                      <h1 className="text-xl font-bold text-gray-800">Reporte de Exhibiciones</h1>
                      <p className="text-xs text-gray-500">Generado el {new Date().toLocaleString("es-ES")}</p>
                    </div>
                  </div>
                  {hayFiltrosActivos && (
                    <div className="mt-4 text-xs text-gray-600">
                      <strong>Filtros aplicados:</strong> Desde {desde} Hasta {hasta}
                      {nroCliente && ` | Cliente: ${nroCliente}`}
                      {selectedEstados.length > 0 && ` | Estados: ${selectedEstados.join(", ")}`}
                    </div>
                  )}
                </div>

                {/* Filtros */}
                <Card className="mb-5 no-print">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[var(--shelfy-text)] font-semibold text-sm">Filtros de búsqueda</h3>
                    {hayFiltrosActivos && (
                      <button onClick={handleLimpiar}
                        className="flex items-center gap-1 text-xs text-[var(--shelfy-muted)] hover:text-[var(--shelfy-error)] transition-colors">
                        <X size={12} /> Limpiar filtros
                      </button>
                    )}
                  </div>

                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-end gap-3 z-20 relative">
                      {/* Fecha */}
                      <div>
                        <label className="block text-xs text-[var(--shelfy-muted)] mb-1.5 font-medium">Desde</label>
                        <input
                          type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
                          className="rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--shelfy-primary)] w-[140px]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[var(--shelfy-muted)] mb-1.5 font-medium">Hasta</label>
                        <input
                          type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
                          className="rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--shelfy-primary)] w-[140px]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[var(--shelfy-muted)] mb-1.5 font-medium">N° Cliente / Local</label>
                        <input
                          type="text" value={nroCliente} onChange={(e) => setNroCliente(e.target.value)}
                          placeholder="Buscar..."
                          className="rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--shelfy-primary)] w-36"
                        />
                      </div>

                      {/* Estado */}
                      <DropdownMultiSelect
                        label="Estado"
                        options={ESTADOS}
                        selected={selectedEstados}
                        onChange={setSelectedEstados}
                      />

                      {/* Tipo PDV */}
                      {!loadingOpts && tiposPdvList.length > 0 && (
                        <DropdownMultiSelect
                          label="Tipo PDV"
                          options={tiposPdvList}
                          selected={selectedTipos}
                          onChange={setSelectedTipos}
                        />
                      )}

                      {/* Sucursales */}
                      {!loadingOpts && sucursalesList.length > 0 && (
                        <DropdownMultiSelect
                          label="Sucursales"
                          options={sucursalesList}
                          selected={selectedSucursales}
                          onChange={setSelectedSucursales}
                        />
                      )}

                      {/* Vendedores */}
                      {!loadingOpts && vendedoresList.length > 0 && (
                        <DropdownMultiSelect
                          label="Supervisor"
                          options={vendedoresList}
                          selected={selectedVendedores}
                          onChange={setSelectedVendedores}
                        />
                      )}
                    </div>

                    {/* Acciones */}
                    <div className="flex gap-2 pt-1">
                      <Button onClick={handleBuscar} loading={loading}>
                        <Search size={14} /> Buscar
                      </Button>
                      {filas.length > 0 && (
                        <Button variant="secondary" onClick={handleExportCSV}>
                          <Download size={14} /> Exportar
                        </Button>
                      )}
                      {filas.length > 0 && (
                        <Button variant="secondary" onClick={() => window.print()}>
                          <Printer size={14} /> Imprimir (PDF)
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
                    {error}
                  </div>
                )}
                {loading && <PageSpinner />}

                {!loading && searched && filas.length === 0 && (
                  <p className="text-[var(--shelfy-muted)] text-sm no-print">Sin resultados para los filtros seleccionados.</p>
                )}

                {!loading && filas.length > 0 && (
                  <div className="flex flex-col gap-6">

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Timeline Gráfico */}
                      <Card className="print-card">
                        <div className="flex items-center gap-2 mb-4 text-[var(--shelfy-text)] font-semibold text-sm">
                          <BarChart3 size={16} className="text-[var(--shelfy-primary)]" />
                          Evolución de Cargas
                        </div>
                        <div className="h-64 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={timelineData}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                              <XAxis dataKey="fecha" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                              <Tooltip
                                cursor={{ fill: "rgba(124, 58, 237, 0.05)" }}
                                contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                              />
                              <Bar dataKey="cantidad" fill="url(#colorPrimary)" radius={[4, 4, 0, 0]} name="Exhibiciones" />
                              <defs>
                                <linearGradient id="colorPrimary" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.9} />
                                  <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.6} />
                                </linearGradient>
                              </defs>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </Card>

                      {/* Ranking de Puntajes */}
                      <Card className="print-card">
                        <div className="flex items-center gap-2 mb-4 text-[var(--shelfy-text)] font-semibold text-sm">
                          <Trophy size={16} className="text-yellow-500" />
                          Puntuación y Ranking
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm text-left">
                            <thead>
                              <tr className="text-[var(--shelfy-muted)] border-b border-[var(--shelfy-border)]">
                                <th className="pb-2 pr-3 w-8">#</th>
                                <th className="pb-2 pr-3">Vendedor</th>
                                <th className="pb-2 pr-3 text-center">Aprob</th>
                                <th className="pb-2 pr-3 text-center">Dest</th>
                                <th className="pb-2 text-right">Pts Totales</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rankingData.slice(0, 10).map((r, i) => (
                                <tr key={r.vendedor} className="border-b border-[var(--shelfy-border)] last:border-0 hover:bg-[var(--shelfy-bg)] transition-colors">
                                  <td className="py-2.5 pr-3 text-[var(--shelfy-muted)] tabular-nums">{i + 1}</td>
                                  <td className="py-2.5 pr-3 font-medium text-[var(--shelfy-text)] truncate max-w-[120px]">{r.vendedor}</td>
                                  <td className="py-2.5 pr-3 text-center text-green-600">{r.aprobados}</td>
                                  <td className="py-2.5 pr-3 text-center text-purple-600">{r.destacados}</td>
                                  <td className="py-2.5 text-right font-bold tabular-nums text-[var(--shelfy-primary)]">{r.puntos}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {rankingData.length > 10 && (
                            <p className="text-xs text-[var(--shelfy-muted)] mt-3 text-center no-print">
                              Mostrando el top 10 de {rankingData.length} vendedores puntuados.
                            </p>
                          )}
                        </div>
                      </Card>
                    </div>

                    {/* Data Table */}
                    <Card className="print-card">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-semibold text-[var(--shelfy-text)]">{filas.length} registros detallados</p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-[var(--shelfy-muted)] text-left border-b border-[var(--shelfy-border)]">
                              {["ID", "Vendedor", "Sucursal", "Cliente", "PDV", "Estado", "Fecha carga"].map((h) => (
                                <th key={h} className="pb-3 pr-3 whitespace-nowrap font-semibold">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {filas.map((f) => (
                              <tr key={f.id_exhibicion} className="border-b border-[var(--shelfy-border)] last:border-0 hover:bg-[var(--shelfy-bg)] transition-colors">
                                <td className="py-2.5 pr-3 text-[var(--shelfy-muted)] tabular-nums">{f.id_exhibicion}</td>
                                <td className="py-2.5 pr-3 text-[var(--shelfy-text)] font-medium max-w-[150px] truncate">{f.vendedor}</td>
                                <td className="py-2.5 pr-3 text-[var(--shelfy-muted)] text-xs truncate max-w-[120px]">{f.sucursal}</td>
                                <td className="py-2.5 pr-3 text-[var(--shelfy-muted)] truncate max-w-[150px]">{f.cliente}</td>
                                <td className="py-2.5 pr-3 text-[var(--shelfy-muted)] truncate max-w-[100px]">{f.tipo_pdv}</td>
                                <td className="py-2.5 pr-3">
                                  <EstadoBadge estado={f.estado} />
                                </td>
                                <td className="py-2.5 text-[var(--shelfy-muted)] whitespace-nowrap tabular-nums">{f.fecha_carga?.slice(0, 16)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>

                  </div>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </>
  );
}

function EstadoBadge({ estado }: { estado: string }) {
  const colors: Record<string, string> = {
    Aprobado: "bg-green-100 text-green-700",
    Destacado: "bg-purple-100 text-purple-700",
    Rechazado: "bg-red-100 text-red-700",
    Pendiente: "bg-yellow-100 text-yellow-700",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[estado] ?? "bg-gray-100 text-gray-700"}`}>
      {estado}
    </span>
  );
}
