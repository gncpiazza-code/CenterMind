"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { PageSpinner } from "@/components/ui/Spinner";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  fetchPendientes, fetchStatsHoy, fetchVendedores,
  evaluar, revertir,
  resolveImageUrl,
  type GrupoPendiente, type StatsHoy,
} from "@/lib/api";
import { Check, X, Flame, RotateCcw, RefreshCw, ChevronLeft, ChevronRight, ImageOff, Info, User } from "lucide-react";

// ── Componente foto ──────────────────────────────────────────────────────────

function FotoViewer({ driveUrl, idExhibicion }: { driveUrl: string, idExhibicion?: number }) {
  const [err, setErr] = useState(false);
  const src = resolveImageUrl(driveUrl, idExhibicion);

  if (!src || err) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full bg-slate-100 text-slate-400 gap-2 rounded-3xl">
        <ImageOff size={40} className="opacity-40" />
        <span className="text-xs font-medium">Sin imagen disponible</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Exhibición"
      className="w-full h-full object-cover rounded-3xl shadow-md"
      onError={() => setErr(true)}
    />
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function VisorPage() {
  const { user } = useAuth();
  const [grupos, setGrupos] = useState<GrupoPendiente[]>([]);
  const [stats, setStats] = useState<StatsHoy | null>(null);
  const [vendedores, setVendedores] = useState<string[]>([]);
  const [filtroVendedor, setFiltroVendedor] = useState("Todos");
  const [idx, setIdx] = useState(0);
  const [fotoIdx, setFotoIdx] = useState(0);
  const [comentario, setComentario] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const lastEvalIds = useRef<number[]>([]);

  const filtrados = filtroVendedor === "Todos"
    ? grupos
    : grupos.filter((g) => g.vendedor === filtroVendedor);

  const grupo = filtrados[idx] ?? null;
  const totalGrupos = filtrados.length;

  const cargar = useCallback(async () => {
    if (!user) return;
    try {
      const distId = user?.id_distribuidor || 0;
      const [pend, st, vend] = await Promise.all([
        fetchPendientes(distId),
        fetchStatsHoy(distId),
        fetchVendedores(distId),
      ]);
      setGrupos(pend);
      setStats(st);
      setVendedores(vend);
      setIdx(0);
      setFotoIdx(0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    const t = setInterval(cargar, 30_000);
    return () => clearInterval(t);
  }, [cargar]);

  useEffect(() => { setFotoIdx(0); setComentario(""); }, [idx, filtroVendedor]);

  function showFlash(msg: string, type: "ok" | "err") {
    setFlash({ msg, type });
    setTimeout(() => setFlash(null), 2500);
  }

  async function handleEvaluar(estado: "Aprobado" | "Destacado" | "Rechazado") {
    if (!grupo || !user || actionLoading) return;
    const ids = grupo.fotos.map((f) => f.id_exhibicion);
    setActionLoading(true);
    try {
      await evaluar(ids, estado, user.usuario, comentario);
      lastEvalIds.current = ids;
      setStats((s) => s ? {
        ...s,
        pendientes: Math.max(0, s.pendientes - 1),
        aprobadas: estado === "Aprobado" ? s.aprobadas + 1 : s.aprobadas,
        destacadas: estado === "Destacado" ? s.destacadas + 1 : s.destacadas,
        rechazadas: estado === "Rechazado" ? s.rechazadas + 1 : s.rechazadas,
      } : s);
      setGrupos((g) => g.filter((item) => item !== grupo));
      setIdx((i) => Math.max(0, Math.min(i, filtrados.length - 2)));
      showFlash(`${estado}`, "ok");
    } catch (e: unknown) {
      showFlash(e instanceof Error ? e.message : "Error", "err");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRevertir() {
    if (!lastEvalIds.current.length || actionLoading) return;
    setActionLoading(true);
    try {
      await revertir(lastEvalIds.current);
      lastEvalIds.current = [];
      showFlash("Revertido", "ok");
      cargar();
    } catch (e: unknown) {
      showFlash(e instanceof Error ? e.message : "Error", "err");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
        <Sidebar />
        <BottomNav />
        <div className="flex flex-col flex-1">
          <Topbar title="Evaluar" />
          <div className="flex-1 flex items-center justify-center"><PageSpinner /></div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <BottomNav />
      <div className="flex flex-col flex-1 min-w-0">
        {/* Topbar personalizada para visor mobile-first */}
        <header className="flex md:hidden items-center justify-between px-4 py-4 bg-white sticky top-0 z-30 shadow-sm">
          <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center text-white">
            <span className="font-bold text-lg leading-none">S</span>
          </div>
          <h1 className="text-lg font-bold text-violet-700">Evaluar</h1>
          <button className="w-8 h-8 flex items-center justify-center text-violet-700 bg-violet-50 rounded-full">
            <Info size={18} />
          </button>
        </header>

        {/* Topbar para desktop usando el componente estándar modificado o directamente acá */}
        <div className="hidden md:block">
          <Topbar title="Evaluar Exhibiciones" />
        </div>

        <main className="flex-1 p-0 md:p-6 overflow-x-hidden overflow-y-auto pb-28 md:pb-6 relative bg-[#faf5ff] md:bg-transparent">
          {flash && (
            <div className={`mx-4 mt-4 px-4 py-3 rounded-2xl text-sm font-bold shadow-sm flex items-center justify-center transition-all absolute top-2 left-0 right-0 z-50
              ${flash.type === "ok"
                ? "bg-green-100/90 backdrop-blur-md text-green-700 border border-green-200"
                : "bg-red-100/90 backdrop-blur-md text-red-700 border border-red-200"
              }`}>
              {flash.msg}
            </div>
          )}

          {error && <p className="text-red-500 text-sm font-semibold mb-4 text-center">{error}</p>}

          {totalGrupos === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-20 h-20 bg-violet-100 rounded-3xl flex items-center justify-center text-violet-500 mb-6 shadow-inner">
                <Check size={32} strokeWidth={3} />
              </div>
              <p className="text-2xl font-black text-slate-800 mb-2 tracking-tight">¡Todo al día!</p>
              <p className="text-slate-500 font-medium mb-8">No hay exhibiciones pendientes de evaluación</p>
              <button onClick={cargar} className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 text-slate-700 rounded-2xl font-bold shadow-sm hover:bg-slate-50 transition-all active:scale-95">
                <RefreshCw size={16} /> Buscar nuevas
              </button>
            </div>
          ) : (
            <>
              {grupo && (
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 max-w-6xl mx-auto items-start">

                  {/* COLA IZQUIERDA: IMAGEN Y BOTONES DE ACCIÓN */}
                  <div className="flex flex-col flex-1 relative h-[calc(100vh-140px)] md:h-auto min-h-[500px]">
                    {/* Contenedor de la Imagen - Ocupa casi todo en mobile */}
                    <div className="w-full h-full md:aspect-[4/5] lg:aspect-auto lg:h-[600px] rounded-t-[32px] md:rounded-3xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.08)] bg-[#111] border border-slate-100 group relative">
                      <FotoViewer driveUrl={grupo.fotos[fotoIdx]?.drive_link ?? ""} idExhibicion={grupo.fotos[fotoIdx]?.id_exhibicion} />

                      {/* Overlay Superior de Info (como en el mockup: Título, Cliente, Distribuidora, Fecha) */}
                      {/* En PC (md:), este bloque se oculta a pedido del usuario */}
                      <div className="absolute top-0 left-0 right-0 bg-black/60 backdrop-blur-md pt-6 pb-6 px-5 text-white border-b border-white/20 md:hidden">
                        <h2 className="text-xl font-extrabold tracking-tight mb-2 drop-shadow-md">
                          Exhibición #{grupo.fotos[fotoIdx]?.id_exhibicion || "---"}
                        </h2>
                        <div className="flex flex-col gap-1.5 text-[13px] font-medium text-white/90">
                          <div className="flex items-center gap-4">
                            <span className="flex items-center gap-1.5 truncate">
                              <span className="opacity-70">🏪</span> {grupo.nro_cliente ?? "Cliente"}
                            </span>
                            <span className="flex items-center gap-1.5 truncate">
                              <span className="opacity-70">👤</span> {grupo.vendedor ?? "Sin asignar"}
                            </span>
                          </div>
                          <p className="flex items-center gap-1.5 opacity-80 mt-0.5">
                            <span>📅</span> {grupo.fecha_hora?.slice(0, 16).replace('T', ' ') ?? ""}
                          </p>
                        </div>
                      </div>

                      {/* Overlay Inferior de Info & Textarea superpuesto */}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent pt-24 pb-6 px-5 text-white md:bg-black/40 md:backdrop-blur-sm md:pt-6 md:pb-6">
                        <h3 className="text-[11px] font-black tracking-widest uppercase mb-2 text-white/80 drop-shadow-md">
                          Observaciones Adicionales
                        </h3>
                        <textarea
                          placeholder="Escribe comentarios sobre la ejecución..."
                          className="w-full bg-white/20 hover:bg-white/25 focus:bg-white/30 md:bg-black/50 md:focus:bg-black/70 backdrop-blur-md border border-white/30 md:border-white/10 rounded-2xl p-3.5 text-sm text-white placeholder-white/50 md:placeholder-white/40 outline-none transition-all resize-none shadow-inner"
                          rows={2}
                          value={comentario}
                          onChange={(e) => setComentario(e.target.value)}
                        />
                      </div>

                      {/* Info adicional Solo en PC superpuesta (pequeña y discreta, o nada) */}
                      {/* Controles de paginación de fotos si hay más de 1 */}
                      {grupo.fotos.length > 1 && (
                        <div className="absolute top-4 right-4 flex gap-1 bg-black/30 backdrop-blur-md p-1 rounded-full text-white">
                          <button onClick={() => setFotoIdx((i) => Math.max(0, i - 1))} disabled={fotoIdx === 0} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/40 disabled:opacity-30 transition-colors">
                            <ChevronLeft size={18} />
                          </button>
                          <span className="w-8 flex items-center justify-center text-xs font-bold font-mono">
                            {fotoIdx + 1}/{grupo.fotos.length}
                          </span>
                          <button onClick={() => setFotoIdx((i) => Math.min(grupo.fotos.length - 1, i + 1))} disabled={fotoIdx >= grupo.fotos.length - 1} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/40 disabled:opacity-30 transition-colors">
                            <ChevronRight size={18} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Botones Circulares Flotantes/Inferiores */}
                    <div className="flex justify-center items-center gap-3 sm:gap-5 absolute bottom-0 left-0 right-0 translate-y-1/2 md:translate-y-0 md:relative md:mt-2 z-10 px-4">

                      <button
                        onClick={handleRevertir}
                        disabled={!lastEvalIds.current.length || actionLoading}
                        className="w-[46px] h-[46px] sm:w-12 sm:h-12 flex items-center justify-center rounded-full bg-white text-slate-500 shadow-[0_4px_16px_rgba(0,0,0,0.12)] hover:text-slate-700 disabled:opacity-40 transition-all active:scale-95 z-0"
                      >
                        <RotateCcw size={20} strokeWidth={2.5} />
                      </button>

                      <button
                        onClick={() => handleEvaluar("Rechazado")}
                        disabled={actionLoading}
                        className="w-[58px] h-[58px] sm:w-16 sm:h-16 flex items-center justify-center rounded-full bg-[#fa5252] text-white shadow-[0_8px_24px_rgba(250,82,82,0.4)] hover:-translate-y-1 disabled:opacity-50 transition-all duration-200 active:scale-95 z-10"
                      >
                        <X size={28} strokeWidth={3.5} />
                      </button>

                      <button
                        onClick={() => handleEvaluar("Destacado")}
                        disabled={actionLoading}
                        className="w-[64px] h-[64px] sm:w-20 sm:h-20 flex items-center justify-center rounded-full bg-[#f97316] text-white shadow-[0_10px_28px_rgba(249,115,22,0.45)] hover:-translate-y-1 disabled:opacity-50 transition-all duration-200 active:scale-95 z-20"
                      >
                        <Flame size={32} strokeWidth={3} className="fill-white/20" />
                      </button>

                      <button
                        onClick={() => handleEvaluar("Aprobado")}
                        disabled={actionLoading}
                        className="w-[58px] h-[58px] sm:w-16 sm:h-16 flex items-center justify-center rounded-full bg-[#10b981] text-white shadow-[0_8px_24px_rgba(16,185,129,0.4)] hover:-translate-y-1 disabled:opacity-50 transition-all duration-200 active:scale-95 z-10"
                      >
                        <Check size={28} strokeWidth={3.5} />
                      </button>

                      <button
                        onClick={cargar}
                        disabled={loading || actionLoading}
                        className="w-[46px] h-[46px] sm:w-12 sm:h-12 flex items-center justify-center rounded-full bg-[#fbbf24] text-white shadow-[0_6px_20px_rgba(251,191,36,0.35)] hover:-translate-y-0.5 disabled:opacity-50 transition-all active:scale-95 z-0"
                      >
                        <RefreshCw size={20} strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>

                  {/* COLUMNA DERECHA (DESKTOP) o CAJAS INFERIORES (MOBILE) */}
                  <div className="flex flex-col gap-6 md:mt-0 mt-8">
                    {/* Detalles de Envío */}
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                      <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4">Detalles de envío</h3>

                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center overflow-hidden shrink-0 border border-orange-200">
                          <User className="text-orange-500" size={24} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">{grupo.vendedor || "Sin asignar"}</p>
                          <p className="text-xs font-medium text-slate-500">Vendedor</p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                          <span className="text-xs text-slate-500 font-medium">Número de Cliente</span>
                          <span className="text-xs font-bold text-slate-900">{grupo.nro_cliente || "—"}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                          <span className="text-xs text-slate-500 font-medium">Fecha y Hora</span>
                          <span className="text-xs font-bold text-slate-900">{grupo.fecha_hora?.slice(0, 16).replace('T', ' ') || "—"}</span>
                        </div>
                        <div className="flex justify-between items-center py-2">
                          <span className="text-xs text-slate-500 font-medium">Tipo de PDV</span>
                          <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-1 rounded-md">{grupo.tipo_pdv || "—"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Comentarios */}
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                      <h3 className="text-[11px] font-black text-violet-700 uppercase tracking-widest mb-3">Observaciones adicionales</h3>
                      <textarea
                        value={comentario}
                        onChange={(e) => setComentario(e.target.value)}
                        rows={4}
                        placeholder="Escribe comentarios sobre la ejecución..."
                        className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 text-slate-900 px-4 py-3 text-sm resize-none focus:outline-none focus:border-violet-300 focus:bg-white transition-colors"
                      />

                      {/* Botón de Guardar en caso de que se use para escritorio y no clickeen los botones circulares, o puede ignorarse porque ya tienen los botones de acción */}
                      <div className="hidden md:block mt-6">
                        <p className="text-[10px] text-center text-slate-400 font-semibold mb-2">Usa los botones circulares para evaluar</p>
                      </div>
                    </div>

                    {/* ProgressBar de Evaluación Inferior */}
                    <div className="bg-violet-50 rounded-3xl p-5 border border-violet-100/50">
                      <div className="flex justify-between text-xs font-bold text-violet-700 mb-2">
                        <span>SESIÓN DE HOY</span>
                        <span>{idx} / {totalGrupos}</span>
                      </div>
                      <div className="h-2 w-full bg-violet-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-violet-600 rounded-full transition-all duration-500"
                          style={{ width: `${totalGrupos > 0 ? (idx / totalGrupos) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
