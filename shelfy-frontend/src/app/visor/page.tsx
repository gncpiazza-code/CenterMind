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
  extractDriveId, getImageUrl,
  type GrupoPendiente, type StatsHoy,
} from "@/lib/api";
import {
  CheckCircle, XCircle, Star, RotateCcw, RefreshCw,
  ChevronLeft, ChevronRight, ImageOff, MapPin, User, Hash,
  CalendarDays, Store, ArrowRight,
} from "lucide-react";

// ── Componente foto ───────────────────────────────────────────────────────────

function FotoViewer({
  driveUrl,
  className = "",
}: {
  driveUrl: string;
  className?: string;
}) {
  const [status, setStatus] = useState<"loading" | "ok" | "err">("loading");
  const [errMsg, setErrMsg] = useState("");
  const fileId = extractDriveId(driveUrl);
  const src = fileId ? getImageUrl(fileId) : null;

  useEffect(() => { setStatus("loading"); setErrMsg(""); }, [driveUrl]);

  if (!src) {
    return (
      <div className={`flex flex-col items-center justify-center text-[var(--shelfy-muted)] gap-2 bg-[var(--shelfy-bg)] ${className}`}>
        <ImageOff size={36} className="opacity-30" />
        <span className="text-xs">Sin link de imagen</span>
        <span className="text-[10px] opacity-50 px-2 text-center break-all">{driveUrl || "(vacío)"}</span>
      </div>
    );
  }

  return (
    <div className={`overflow-hidden relative ${className}`}>
      {status !== "ok" && (
        <div className={`absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[var(--shelfy-bg)] z-10 ${status === "loading" ? "" : "text-[var(--shelfy-muted)]"}`}>
          {status === "loading" ? (
            <div className="w-7 h-7 border-2 border-[var(--shelfy-primary)] border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <ImageOff size={36} className="opacity-30" />
              <span className="text-xs">Error al cargar imagen</span>
              {errMsg && <span className="text-[10px] opacity-60 px-3 text-center">{errMsg}</span>}
            </>
          )}
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Exhibición"
        className="w-full h-full object-cover"
        style={{ opacity: status === "ok" ? 1 : 0 }}
        onLoad={() => setStatus("ok")}
        onError={async () => {
          // Intentar obtener el mensaje de error del backend
          try {
            const r = await fetch(src);
            const body = await r.json().catch(() => ({ detail: `HTTP ${r.status}` }));
            setErrMsg(body?.detail ?? `HTTP ${r.status}`);
          } catch {
            setErrMsg("Sin conexión con el servidor");
          }
          setStatus("err");
        }}
      />
    </div>
  );
}


// ── Botón circular de acción ──────────────────────────────────────────────────

function CircleBtn({
  onClick, disabled, bg, shadow, size = "md", children,
}: {
  onClick: () => void;
  disabled?: boolean;
  bg: string;
  shadow?: string;
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
}) {
  const dims = size === "lg" ? "w-16 h-16" : size === "sm" ? "w-10 h-10" : "w-12 h-12";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${dims} flex items-center justify-center rounded-full text-white font-bold transition-all
        active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed ${bg} ${shadow ?? ""}`}
    >
      {children}
    </button>
  );
}

// ── Fila de detalle ───────────────────────────────────────────────────────────

function DetailRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-[var(--shelfy-border)] last:border-0">
      <div className="w-7 h-7 rounded-lg bg-[var(--shelfy-bg)] flex items-center justify-center shrink-0 mt-0.5">
        <Icon size={13} className="text-[var(--shelfy-primary)]" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wide">{label}</p>
        <p className="text-sm text-[var(--shelfy-text)] font-medium truncate">{value}</p>
      </div>
    </div>
  );
}

// ── Stats bar (desktop) ───────────────────────────────────────────────────────

function DesktopStatsBar({ stats, total }: { stats: StatsHoy; total: number }) {
  const done = stats.aprobadas + stats.destacadas + stats.rechazadas;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-[var(--shelfy-muted)] uppercase tracking-wider">Sesión de hoy</span>
        <span className="text-sm font-bold text-[var(--shelfy-primary)]">{done} / {total}</span>
      </div>
      <div className="w-full h-2 bg-[var(--shelfy-bg)] rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[var(--shelfy-primary)] to-violet-400 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex gap-3 mt-3">
        <span className="text-[10px] text-emerald-600 font-medium">✓ {stats.aprobadas} aprob.</span>
        <span className="text-[10px] text-violet-600 font-medium">★ {stats.destacadas} dest.</span>
        <span className="text-[10px] text-red-500 font-medium">✕ {stats.rechazadas} rech.</span>
      </div>
    </div>
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

  // Total inicial para la barra de progreso de sesión
  const totalInicial = useRef(0);

  const filtrados = filtroVendedor === "Todos"
    ? grupos
    : grupos.filter((g) => g.vendedor === filtroVendedor);

  const grupo = filtrados[idx] ?? null;
  const totalGrupos = filtrados.length;

  const cargar = useCallback(async () => {
    if (!user) return;
    try {
      const [pend, st, vend] = await Promise.all([
        fetchPendientes(user.id_distribuidor),
        fetchStatsHoy(user.id_distribuidor),
        fetchVendedores(user.id_distribuidor),
      ]);
      setGrupos(pend);
      setStats(st);
      setVendedores(vend);
      setIdx(0);
      setFotoIdx(0);
      // Guardar total inicial para barra de progreso
      if (totalInicial.current === 0 && st) {
        const done = st.aprobadas + st.destacadas + st.rechazadas;
        totalInicial.current = pend.length + done;
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { cargar(); }, [cargar]);

  // Auto-refresh cada 30s
  useEffect(() => {
    const t = setInterval(cargar, 30_000);
    return () => clearInterval(t);
  }, [cargar]);

  // Resetear foto y comentario al cambiar grupo
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
      // auto-clear comentario ✓
      setComentario("");
      setStats((s) => s ? {
        ...s,
        pendientes: Math.max(0, s.pendientes - 1),
        aprobadas: estado === "Aprobado" ? s.aprobadas + 1 : s.aprobadas,
        destacadas: estado === "Destacado" ? s.destacadas + 1 : s.destacadas,
        rechazadas: estado === "Rechazado" ? s.rechazadas + 1 : s.rechazadas,
      } : s);
      setGrupos((g) => g.filter((item) => item !== grupo));
      setIdx((i) => Math.max(0, Math.min(i, filtrados.length - 2)));
      showFlash(`${estado} ✓`, "ok");
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

  // ── Pantalla de carga ──
  if (loading) {
    return (
      <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
        <Sidebar />
        <BottomNav />
        <div className="flex flex-col flex-1">
          <Topbar title="Evaluación de exhibiciones" />
          <div className="flex-1 flex items-center justify-center"><PageSpinner /></div>
        </div>
      </div>
    );
  }

  // ── Calcular total sesión para barra ──
  const totalSesion = totalInicial.current > 0
    ? totalInicial.current
    : (stats ? stats.aprobadas + stats.destacadas + stats.rechazadas + filtrados.length : filtrados.length);

  return (
    <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <BottomNav />
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar title="Evaluación de exhibiciones" />

        <main className="flex-1 overflow-auto pb-36 md:pb-6">

          {/* ── Flash ── */}
          {flash && (
            <div
              className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-full text-sm font-semibold shadow-lg transition-all
                ${flash.type === "ok"
                  ? "bg-emerald-500 text-white"
                  : "bg-red-500 text-white"
                }`}
            >
              {flash.msg}
            </div>
          )}

          {error && (
            <div className="mx-4 mt-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {/* ── Sin pendientes ── */}
          {totalGrupos === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6">
              <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle size={36} className="text-emerald-500" />
              </div>
              <h2 className="text-xl font-bold text-[var(--shelfy-text)]">¡Todo al día!</h2>
              <p className="text-[var(--shelfy-muted)] text-sm text-center">No hay exhibiciones pendientes de evaluación</p>
              <button
                onClick={cargar}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--shelfy-primary)] text-white text-sm font-semibold hover:bg-[var(--shelfy-primary-2)] transition-colors"
              >
                <RefreshCw size={14} /> Buscar nuevas
              </button>
            </div>
          ) : (
            <>
              {/* ───────────── MOBILE LAYOUT ───────────── */}
              <div className="lg:hidden flex flex-col">

                {/* Header filtros mobile */}
                <div className="flex items-center gap-2 px-4 pt-4 pb-2">
                  <select
                    value={filtroVendedor}
                    onChange={(e) => { setFiltroVendedor(e.target.value); setIdx(0); }}
                    className="flex-1 rounded-xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] text-[var(--shelfy-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--shelfy-primary)]"
                  >
                    <option value="Todos">Todos los vendedores</option>
                    {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                  <button
                    onClick={cargar}
                    className="w-10 h-10 flex items-center justify-center rounded-xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] transition-colors"
                  >
                    <RefreshCw size={15} />
                  </button>
                </div>

                {/* Contador grupos */}
                <div className="flex items-center justify-between px-4 py-1 mb-3">
                  <button
                    onClick={() => setIdx((i) => Math.max(0, i - 1))}
                    disabled={idx === 0}
                    className="p-1.5 rounded-full text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] disabled:opacity-30"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className="text-sm font-semibold text-[var(--shelfy-text)]">
                    {idx + 1} / {totalGrupos}
                  </span>
                  <button
                    onClick={() => setIdx((i) => Math.min(totalGrupos - 1, i + 1))}
                    disabled={idx >= totalGrupos - 1}
                    className="p-1.5 rounded-full text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] disabled:opacity-30"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>

                {grupo && (
                  <>
                    {/* Card principal con foto */}
                    <div className="mx-4 rounded-3xl overflow-hidden shadow-xl bg-black relative" style={{ minHeight: 380 }}>
                      {/* Foto */}
                      <FotoViewer
                        driveUrl={grupo.fotos[fotoIdx]?.drive_link ?? ""}
                        className="w-full h-[380px]"
                      />

                      {/* Navegación fotos (si hay varias) */}
                      {grupo.fotos.length > 1 && (
                        <>
                          <button
                            onClick={() => setFotoIdx((i) => Math.max(0, i - 1))}
                            disabled={fotoIdx === 0}
                            className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center disabled:opacity-20"
                          >
                            <ChevronLeft size={18} />
                          </button>
                          <button
                            onClick={() => setFotoIdx((i) => Math.min(grupo.fotos.length - 1, i + 1))}
                            disabled={fotoIdx >= grupo.fotos.length - 1}
                            className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center disabled:opacity-20"
                          >
                            <ChevronRight size={18} />
                          </button>
                          <div className="absolute top-3 right-3 bg-black/50 text-white text-xs font-medium px-2 py-1 rounded-full">
                            {fotoIdx + 1} / {grupo.fotos.length}
                          </div>
                        </>
                      )}

                      {/* Overlay info inferior */}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-5 pt-10 pb-5">
                        <p className="text-white font-bold text-lg leading-tight">{grupo.nro_cliente ?? "—"}</p>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <MapPin size={12} className="text-white/70 shrink-0" />
                          <p className="text-white/80 text-xs truncate">{grupo.tipo_pdv ?? "—"}</p>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <User size={12} className="text-white/70 shrink-0" />
                          <p className="text-white/70 text-xs truncate">{grupo.vendedor ?? "—"} · {grupo.fecha_hora?.slice(0, 10) ?? "—"}</p>
                        </div>
                      </div>
                    </div>

                    {/* Botones de acción mobile — circular */}
                    <div className="flex items-center justify-center gap-4 mt-5 px-4">
                      {/* Revertir */}
                      <CircleBtn
                        onClick={handleRevertir}
                        disabled={!lastEvalIds.current.length || actionLoading}
                        bg="bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)]"
                        size="sm"
                      >
                        <RotateCcw size={15} className="text-[var(--shelfy-muted)]" />
                      </CircleBtn>

                      {/* Rechazar */}
                      <CircleBtn
                        onClick={() => handleEvaluar("Rechazado")}
                        disabled={actionLoading}
                        bg="bg-red-500"
                        shadow="shadow-lg shadow-red-200"
                        size="md"
                      >
                        <XCircle size={20} />
                      </CircleBtn>

                      {/* Destacar — más grande, central */}
                      <CircleBtn
                        onClick={() => handleEvaluar("Destacado")}
                        disabled={actionLoading}
                        bg="bg-[var(--shelfy-primary)]"
                        shadow="shadow-xl shadow-violet-200"
                        size="lg"
                      >
                        <Star size={24} />
                      </CircleBtn>

                      {/* Aprobar */}
                      <CircleBtn
                        onClick={() => handleEvaluar("Aprobado")}
                        disabled={actionLoading}
                        bg="bg-emerald-500"
                        shadow="shadow-lg shadow-emerald-200"
                        size="md"
                      >
                        <CheckCircle size={20} />
                      </CircleBtn>

                      {/* Recargar */}
                      <CircleBtn
                        onClick={cargar}
                        disabled={actionLoading}
                        bg="bg-amber-400"
                        shadow="shadow-lg shadow-amber-100"
                        size="sm"
                      >
                        <RefreshCw size={14} className="text-white" />
                      </CircleBtn>
                    </div>

                    {/* Sección comentario mobile */}
                    <div className="mx-4 mt-5">
                      <p className="text-sm font-semibold text-[var(--shelfy-primary)] mb-2">Observaciones adicionales</p>
                      <textarea
                        value={comentario}
                        onChange={(e) => setComentario(e.target.value)}
                        rows={3}
                        placeholder="Escribe comentarios sobre la ejecución..."
                        className="w-full rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] text-[var(--shelfy-text)] px-4 py-3 text-sm resize-none focus:outline-none focus:border-[var(--shelfy-primary)] placeholder:text-[var(--shelfy-muted)] shadow-sm"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* ───────────── DESKTOP LAYOUT ───────────── */}
              <div className="hidden lg:flex flex-col h-full">

                {/* Top bar desktop */}
                <div className="flex items-center gap-4 px-6 pt-5 pb-3">
                  {/* Filtro vendedor */}
                  <select
                    value={filtroVendedor}
                    onChange={(e) => { setFiltroVendedor(e.target.value); setIdx(0); }}
                    className="rounded-xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] text-[var(--shelfy-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--shelfy-primary)]"
                  >
                    <option value="Todos">Todos los vendedores</option>
                    {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>

                  {/* Navegación entre grupos */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIdx((i) => Math.max(0, i - 1))}
                      disabled={idx === 0}
                      className="w-8 h-8 rounded-lg border border-[var(--shelfy-border)] flex items-center justify-center text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] disabled:opacity-30 bg-[var(--shelfy-panel)]"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-sm font-semibold text-[var(--shelfy-text)] min-w-[60px] text-center">
                      {idx + 1} / {totalGrupos}
                    </span>
                    <button
                      onClick={() => setIdx((i) => Math.min(totalGrupos - 1, i + 1))}
                      disabled={idx >= totalGrupos - 1}
                      className="w-8 h-8 rounded-lg border border-[var(--shelfy-border)] flex items-center justify-center text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] disabled:opacity-30 bg-[var(--shelfy-panel)]"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  <button
                    onClick={cargar}
                    title="Recargar"
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] transition-colors"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>

                {/* Contenido principal desktop */}
                {grupo && (
                  <div className="flex gap-5 px-6 pb-6 flex-1">

                    {/* — Columna izquierda: foto — */}
                    <div className="flex-1 min-w-0 flex flex-col gap-3">
                      {/* Tabs fotos */}
                      {grupo.fotos.length > 1 && (
                        <div className="flex gap-2 flex-wrap">
                          {grupo.fotos.map((_, i) => (
                            <button
                              key={i}
                              onClick={() => setFotoIdx(i)}
                              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors
                                ${fotoIdx === i
                                  ? "bg-[var(--shelfy-primary)] text-white"
                                  : "bg-[var(--shelfy-panel)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] border border-[var(--shelfy-border)]"
                                }`}
                            >
                              Foto {i + 1}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Foto grande con overlay */}
                      <div className="relative rounded-2xl overflow-hidden bg-black flex-1" style={{ minHeight: 440 }}>
                        <FotoViewer
                          driveUrl={grupo.fotos[fotoIdx]?.drive_link ?? ""}
                          className="w-full h-full absolute inset-0"
                        />

                        {/* Navegación fotos */}
                        {grupo.fotos.length > 1 && (
                          <>
                            <button
                              onClick={() => setFotoIdx((i) => Math.max(0, i - 1))}
                              disabled={fotoIdx === 0}
                              className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center disabled:opacity-20 transition-all"
                            >
                              <ChevronLeft size={20} />
                            </button>
                            <button
                              onClick={() => setFotoIdx((i) => Math.min(grupo.fotos.length - 1, i + 1))}
                              disabled={fotoIdx >= grupo.fotos.length - 1}
                              className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center disabled:opacity-20 transition-all"
                            >
                              <ChevronRight size={20} />
                            </button>
                          </>
                        )}

                        {/* Overlay inferior con info */}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-6 pb-5 pt-10">
                          <div className="flex items-end justify-between">
                            <div>
                              <p className="text-white font-bold text-xl leading-tight">{grupo.nro_cliente ?? "—"}</p>
                              <div className="flex items-center gap-1.5 mt-1">
                                <MapPin size={13} className="text-white/70" />
                                <p className="text-white/80 text-sm">{grupo.tipo_pdv ?? "—"}</p>
                              </div>
                            </div>
                            {grupo.fotos.length > 1 && (
                              <span className="text-xs text-white/70 bg-black/40 px-2.5 py-1 rounded-full">
                                {fotoIdx + 1} / {grupo.fotos.length}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Botones de acción desktop — bajo la foto, estilo circular */}
                      <div className="flex items-center justify-center gap-6 py-2">
                        <CircleBtn
                          onClick={handleRevertir}
                          disabled={!lastEvalIds.current.length || actionLoading}
                          bg="bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)]"
                          size="sm"
                        >
                          <RotateCcw size={14} className="text-[var(--shelfy-muted)]" />
                        </CircleBtn>

                        <CircleBtn
                          onClick={() => handleEvaluar("Rechazado")}
                          disabled={actionLoading}
                          bg="bg-red-500"
                          shadow="shadow-lg shadow-red-200"
                          size="md"
                        >
                          <XCircle size={20} />
                        </CircleBtn>

                        <CircleBtn
                          onClick={() => handleEvaluar("Aprobado")}
                          disabled={actionLoading}
                          bg="bg-emerald-500"
                          shadow="shadow-xl shadow-emerald-200"
                          size="lg"
                        >
                          <CheckCircle size={24} />
                        </CircleBtn>

                        <CircleBtn
                          onClick={() => handleEvaluar("Destacado")}
                          disabled={actionLoading}
                          bg="bg-[var(--shelfy-primary)]"
                          shadow="shadow-lg shadow-violet-200"
                          size="md"
                        >
                          <Star size={20} />
                        </CircleBtn>

                        <CircleBtn
                          onClick={cargar}
                          disabled={actionLoading}
                          bg="bg-amber-400"
                          shadow="shadow-lg shadow-amber-100"
                          size="sm"
                        >
                          <RefreshCw size={14} className="text-white" />
                        </CircleBtn>
                      </div>
                    </div>

                    {/* — Columna derecha: detalles + comentario + guardar — */}
                    <div className="w-80 shrink-0 flex flex-col gap-4">

                      {/* Card detalles */}
                      <div className="bg-[var(--shelfy-panel)] rounded-2xl border border-[var(--shelfy-border)] p-4">
                        <p className="text-[10px] font-bold text-[var(--shelfy-muted)] uppercase tracking-wider mb-3">Detalles de envío</p>

                        {/* Avatar + nombre vendedor */}
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--shelfy-bg)] mb-3">
                          <div className="w-10 h-10 rounded-full bg-[var(--shelfy-primary)] flex items-center justify-center text-white font-bold text-sm shrink-0">
                            {(grupo.vendedor ?? "?").charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[var(--shelfy-text)] truncate">{grupo.vendedor ?? "—"}</p>
                            <p className="text-[11px] text-[var(--shelfy-muted)]">Vendedor</p>
                          </div>
                          <div className="ml-auto w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                          </div>
                        </div>

                        <DetailRow icon={Hash} label="Número de cliente" value={grupo.nro_cliente ?? "—"} />
                        <DetailRow icon={CalendarDays} label="Fecha y Hora" value={grupo.fecha_hora?.slice(0, 16).replace("T", " • ") ?? "—"} />
                        <DetailRow icon={Store} label="Tipo de PDV" value={grupo.tipo_pdv ?? "—"} />
                      </div>

                      {/* Comentario */}
                      <div className="bg-[var(--shelfy-panel)] rounded-2xl border border-[var(--shelfy-border)] p-4 flex flex-col gap-2">
                        <p className="text-[10px] font-bold text-[var(--shelfy-muted)] uppercase tracking-wider">Comentario Opcional</p>
                        <textarea
                          value={comentario}
                          onChange={(e) => setComentario(e.target.value)}
                          rows={5}
                          placeholder="Añade una nota sobre esta exhibición..."
                          className="w-full rounded-xl border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-[var(--shelfy-primary)] placeholder:text-[var(--shelfy-muted)]"
                        />
                        <p className="text-[10px] text-[var(--shelfy-muted)] text-center">
                          Tip: aprueba con el botón ✓ o rechaza con ✕
                        </p>
                      </div>

                      {/* Botón guardar + siguiente */}
                      <button
                        onClick={() => handleEvaluar("Aprobado")}
                        disabled={actionLoading}
                        className="w-full py-3.5 rounded-2xl bg-[var(--shelfy-text)] hover:bg-gray-800 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-lg"
                      >
                        Guardar y Siguiente <ArrowRight size={16} />
                      </button>

                      {/* Barra de progreso sesión */}
                      {stats && (
                        <DesktopStatsBar stats={stats} total={totalSesion} />
                      )}

                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
