"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { PageSpinner } from "@/components/ui/Spinner";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useViewerStore } from "../../store/useViewerStore";
import { motion, AnimatePresence } from "framer-motion";
import {
  fetchPendientes, fetchStatsHoy, fetchVendedores,
  evaluar, revertir,
  resolveImageUrl,
  fetchERPContexto,
  type GrupoPendiente, type StatsHoy, type ERPContexto,
} from "@/lib/api";
import { Check, X, Flame, RotateCcw, RefreshCw, ChevronLeft, ChevronRight, ImageOff, User, Lock, ChevronUp } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/Button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const VISOR_TEMPLATE_KEY = "shelfy:visor:comment-templates";

function readCommentTemplates(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(VISOR_TEMPLATE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((x: unknown): x is string => typeof x === "string" && x.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function saveCommentTemplates(templates: string[]) {
  try {
    localStorage.setItem(VISOR_TEMPLATE_KEY, JSON.stringify(templates));
  } catch {
    /* ignore */
  }
}

function daysSinceIso(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

// ── Componente foto con Precarga y Hypersonic ────────────────────────────────

function FotoViewer({ driveUrl, idExhibicion, priority = false }: { driveUrl: string, idExhibicion?: number, priority?: boolean }) {
  const [err, setErr] = useState(false);
  const src = resolveImageUrl(driveUrl, idExhibicion);

  if (!src || err) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full bg-slate-100 text-slate-400 gap-2 rounded-3xl transition-opacity duration-300">
        <ImageOff size={40} className="opacity-40" />
        <span className="text-xs font-medium">Sin imagen disponible</span>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full rounded-3xl overflow-hidden shadow-md bg-slate-900/30">
      {/* Fondo adaptativo para evitar letterbox negro dominante */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        aria-hidden
        className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-35"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900/20 via-slate-900/10 to-slate-900/25" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`Exhibición ${idExhibicion}`}
        className="relative z-[1] w-full h-full object-contain object-center rounded-3xl p-1 md:p-2"
        loading={priority ? "eager" : "lazy"}
        onError={() => setErr(true)}
      />
    </div>
  );
}

// Aggressive image preloader — eagerly loads ALL images on mount
function useEagerPreload(grupos: GrupoPendiente[]) {
  useEffect(() => {
    if (!grupos.length) return;
    const allUrls = grupos.flatMap(g =>
      g.fotos.map(f => resolveImageUrl(f.drive_link, f.id_exhibicion))
    ).filter((u): u is string => !!u);

    // Deduplicate
    const unique = [...new Set(allUrls)];
    
    // Fire all preloads immediately via native Image objects
    unique.forEach(url => {
      const img = new Image();
      img.src = url;
    });
  }, [grupos]);
}

// ── Página principal Refactorizada (Motor Hipersónico) ───────────────────────

export default function VisorPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const lastEvalIds = useRef<number[]>([]);
  
  // Zustand Store
  const { 
    currentIndex, currentFotoIdx, vistas, 
    setCurrentIndex, setCurrentFotoIdx, incrementIndex, resetGroupState 
  } = useViewerStore();

  // Local state para UI efímera
  const [filtroVendedor, setFiltroVendedor] = useState("Todos");
  const [filtroSucursal, setFiltroSucursal] = useState("Todas");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [focusHoldActive, setFocusHoldActive] = useState(false);
  const [visorTab, setVisorTab] = useState<"todas" | "objetivo">("todas");
  const [comentario, setComentario] = useState("");
  const [flash, setFlash] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [commentTemplates, setCommentTemplates] = useState<string[]>([]);
  const [newTemplateText, setNewTemplateText] = useState("");

  const distId = user?.id_distribuidor || 0;
  const isSubmittingRef = useRef(false);
  const focusHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Queries con TanStack Query
  const { data: grupos = [], isLoading: loadingPendientes, error: errorPend } = useQuery({
    queryKey: ['pendientes', distId],
    queryFn: () => fetchPendientes(distId),
    enabled: !!user,
    staleTime: 1000 * 60, // 1 minuto
  });

  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['stats', distId],
    queryFn: () => fetchStatsHoy(distId),
    enabled: !!user,
  });

  const { data: vendedores = [] } = useQuery({
    queryKey: ['vendedores', distId],
    queryFn: () => fetchVendedores(distId),
    enabled: !!user,
  });

  // Filtrado
  const sucursalesDisponibles = Array.from(
    new Set(
      grupos
        .map((g) => (g.sucursal || "Sin sucursal").trim())
        .filter((s) => s.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b, "es"));

  const filtrados = (() => {
    let base = filtroVendedor === "Todos" ? grupos : grupos.filter((g) => g.vendedor === filtroVendedor);
    base = filtroSucursal === "Todas" ? base : base.filter((g) => (g.sucursal || "Sin sucursal") === filtroSucursal);
    if (visorTab === "objetivo") base = base.filter(g => g.fotos.some(f => f.es_objetivo));
    return base;
  })();

  const grupo = filtrados[currentIndex] ?? null;
  const nroForErp = grupo?.nro_cliente ? String(grupo.nro_cliente).trim() : "";
  const skipErpFetch =
    !nroForErp || nroForErp === "S/C" || nroForErp === "0" || nroForErp === "—";

  const { data: erpRaw, isFetching: loadingERP } = useQuery({
    queryKey: ["visor", "erp-contexto", distId, nroForErp],
    queryFn: () => fetchERPContexto(distId, nroForErp),
    enabled: !!user?.usa_contexto_erp && distId > 0 && !skipErpFetch,
    staleTime: 60_000,
  });

  const erpContext: ERPContexto | null = erpRaw
    ? {
        ...erpRaw,
        nombre_fantasia: erpRaw.nombre_fantasia || erpRaw.razon_social || undefined,
        ultima_compra: erpRaw.ultima_compra ?? undefined,
        promedio_factura: erpRaw.promedio_factura ?? undefined,
        deuda_total: erpRaw.deuda_total ?? 0,
        cant_facturas: erpRaw.cant_facturas ?? undefined,
        domicilio: erpRaw.domicilio ?? undefined,
        localidad: erpRaw.localidad ?? undefined,
        nro_ruta: erpRaw.nro_ruta ?? undefined,
        dia_visita: erpRaw.dia_visita ?? undefined,
      }
    : null;

  const diasUltCompra = daysSinceIso(erpContext?.ultima_compra);
  const ventas30 =
    typeof erpContext?.total_30d === "number" && erpContext.total_30d > 0;
  const compraUltimos30 =
    ventas30 ||
    (diasUltCompra !== null && diasUltCompra <= 30 && !!erpContext?.ultima_compra);
  const conIngresoComercio =
    !!erpContext?.encontrado &&
    (ventas30 ||
      (diasUltCompra !== null && diasUltCompra < 90) ||
      (erpContext.cant_facturas != null && erpContext.cant_facturas > 0));

  const totalGrupos = filtrados.length;
  const totalFotos = grupo?.fotos.length ?? 0;
  const todasVistas = vistas.size >= totalFotos;
  const isValidacion = (grupo?.fotos.some(f => f.estado === "VALIDACION") ?? false);

  // Eager preload ALL images on data arrival
  useEagerPreload(filtrados);

  // Mutations
  const mutationEvaluar = useMutation({
    mutationFn: ({ ids, estado, comentario }: { ids: number[], estado: string, comentario: string }) => 
      evaluar(ids, estado, user?.usuario || "system", comentario),
    onSettled: () => {
      isSubmittingRef.current = false;
    },
    onMutate: async (variables) => {
      // Optimistic Update: Remove from local cache immediately
      await queryClient.cancelQueries({ queryKey: ['pendientes', distId] });
      const previousPendientes = queryClient.getQueryData<GrupoPendiente[]>(['pendientes', distId]);
      
      // Update stats optimistically
      queryClient.setQueryData(['stats', distId], (old: StatsHoy | undefined) => {
        if (!old) return old;
        return {
          ...old,
          pendientes: Math.max(0, old.pendientes - 1),
          aprobadas: variables.estado === "Aprobado" ? old.aprobadas + 1 : old.aprobadas,
          destacadas: variables.estado === "Destacado" ? old.destacadas + 1 : old.destacadas,
          rechazadas: variables.estado === "Rechazado" ? old.rechazadas + 1 : old.rechazadas,
        };
      });

      // Show flash instantly
      setFlash({ msg: variables.estado, type: "ok" });
      setTimeout(() => setFlash(null), 2000);

      // Remover optimísticamente el grupo evaluado para que la UI avance
      // de forma estable al siguiente pendiente, sin saltos al inicio.
      const firstEvalId = variables.ids[0];
      queryClient.setQueryData<GrupoPendiente[]>(['pendientes', distId], (old = []) => {
        const next = old.filter((g) => !g.fotos.some((f) => f.id_exhibicion === firstEvalId));
        const lastIdx = Math.max(0, next.length - 1);
        setCurrentIndex((idx) => Math.min(idx, lastIdx));
        resetGroupState();
        return next;
      });

      return { previousPendientes };
    },
    onSuccess: (data: { affected?: number } | undefined) => {
      if (data?.affected === 0) {
        // Another evaluator got there first — refresh silently
        setFlash({ msg: "Ya evaluado por otro usuario", type: "err" });
        setTimeout(() => setFlash(null), 2000);
        queryClient.invalidateQueries({ queryKey: ['pendientes', distId] });
        queryClient.invalidateQueries({ queryKey: ['stats', distId] });
        return;
      }
      // Siempre refrescar pendientes: si no, la caché deja el grupo con estado "Pendiente" aunque la DB ya esté Aprobado/Rechazado.
      queryClient.invalidateQueries({ queryKey: ['pendientes', distId] });
      queryClient.invalidateQueries({ queryKey: ['stats', distId] });
    },
    onError: (err) => {
      setFlash({ msg: "Error al evaluar", type: "err" });
      console.error(err);
      queryClient.invalidateQueries({ queryKey: ['pendientes', distId] });
      queryClient.invalidateQueries({ queryKey: ['stats', distId] });
    }
  });

  const mutationRevertir = useMutation({
    mutationFn: (ids: number[]) => revertir(ids),
    onSuccess: () => {
      setFlash({ msg: "Revertido", type: "ok" });
      queryClient.invalidateQueries({ queryKey: ['pendientes', distId] });
      queryClient.invalidateQueries({ queryKey: ['stats', distId] });
    }
  });

  // Effects
  useEffect(() => {
    resetGroupState();
    setComentario("");
    setNewTemplateText("");
  }, [currentIndex, filtroVendedor, filtroSucursal, resetGroupState]);

  useEffect(() => {
    setMobileFiltersOpen(false);
    setMobileToolsOpen(false);
  }, [currentIndex, filtroVendedor, filtroSucursal, visorTab]);

  useEffect(() => {
    const clearFocusTimer = () => {
      if (focusHoldTimerRef.current) {
        clearTimeout(focusHoldTimerRef.current);
        focusHoldTimerRef.current = null;
      }
    };

    const isTypingTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      return (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target.isContentEditable
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (isTypingTarget(e.target)) return;
      if (e.repeat) return;
      clearFocusTimer();
      // Activación intencional: mantener apretado un momento.
      focusHoldTimerRef.current = setTimeout(() => {
        setFocusHoldActive(true);
      }, 700);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      clearFocusTimer();
      setFocusHoldActive(false);
    };

    const onBlur = () => {
      clearFocusTimer();
      setFocusHoldActive(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    return () => {
      clearFocusTimer();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    // Evita estado "pantalla vacía" cuando cambia la lista filtrada mientras
    // el índice fue adelantado optimísticamente tras evaluar.
    if (totalGrupos <= 0) return;
    if (currentIndex < totalGrupos) return;
    setCurrentIndex(totalGrupos - 1);
    resetGroupState();
  }, [currentIndex, totalGrupos, setCurrentIndex, resetGroupState]);

  useEffect(() => {
    setCommentTemplates(readCommentTemplates());
  }, []);

  function applyCommentTemplate(text: string) {
    const t = text.trim();
    if (!t) return;
    setComentario((c) => (c.trim() ? `${c.trim()} ${t}` : t));
  }

  function addCommentTemplate() {
    const t = newTemplateText.trim();
    if (!t) return;
    const next = [...commentTemplates.filter((x) => x !== t), t];
    setCommentTemplates(next);
    saveCommentTemplates(next);
    setNewTemplateText("");
  }

  // Handlers
  async function handleEvaluar(estado: "Aprobado" | "Destacado" | "Rechazado") {
    if (!grupo || !user || mutationEvaluar.isPending || !todasVistas || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    const ids = grupo.fotos.map((f) => f.id_exhibicion);
    lastEvalIds.current = ids;
    // Trigger network request (el avance visual lo maneja onMutate de forma estable)
    mutationEvaluar.mutate({ ids, estado, comentario });
  }

  const handleNextFoto = () => {
    const nextIdx = Math.min(totalFotos - 1, currentFotoIdx + 1);
    setCurrentFotoIdx(nextIdx);
  };

  const handlePrevFoto = () => {
    setCurrentFotoIdx(Math.max(0, currentFotoIdx - 1));
  };

  async function handleRevertir() {
    if (!lastEvalIds.current.length || mutationRevertir.isPending) return;
    mutationRevertir.mutate(lastEvalIds.current);
    lastEvalIds.current = [];
  }

  if (loadingPendientes) {
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
    <div className="flex h-[100dvh] bg-[var(--shelfy-bg)] overflow-hidden">
      <Sidebar />
      {/* BottomNav hidden on visor — we use our own bottom bar */}
      <div className="hidden md:block"><BottomNav /></div>
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">

        {/* Desktop header */}
        <div className="hidden md:block shrink-0">
          <Topbar title="Evaluar Exhibiciones" />
        </div>

        {/* ── Tab toggle: Todas / Con Objetivo ── */}
        <div className="hidden md:flex shrink-0 items-center gap-2 px-4 py-1.5 border-b border-[var(--shelfy-border)] bg-[var(--shelfy-panel)]">
          <div className="flex gap-1 bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg p-0.5">
            <button
              onClick={() => { setVisorTab("todas"); setCurrentIndex(0); resetGroupState(); }}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${visorTab === "todas" ? "bg-[var(--shelfy-accent)]/10 text-[var(--shelfy-accent)]" : "text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"}`}
            >
              Todas
            </button>
            <button
              onClick={() => { setVisorTab("objetivo"); setCurrentIndex(0); resetGroupState(); }}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 ${visorTab === "objetivo" ? "bg-[var(--shelfy-accent)]/10 text-[var(--shelfy-accent)]" : "text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"}`}
            >
              Con Objetivo
              {grupos.filter(g => g.fotos.some(f => f.es_objetivo)).length > 0 && (
                <span className="text-[9px] font-black bg-[var(--shelfy-accent)]/20 text-[var(--shelfy-accent)] px-1 py-0 rounded-full">
                  {grupos.filter(g => g.fotos.some(f => f.es_objetivo)).length}
                </span>
              )}
            </button>
          </div>
          <select
            value={filtroSucursal}
            onChange={(e) => {
              setFiltroSucursal(e.target.value);
              setCurrentIndex(0);
            }}
            className="h-8 px-2.5 rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-xs font-semibold text-[var(--shelfy-text)]"
          >
            <option value="Todas">Todas las sucursales</option>
            {sucursalesDisponibles.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={filtroVendedor}
            onChange={(e) => {
              setFiltroVendedor(e.target.value);
              setCurrentIndex(0);
            }}
            className="h-8 px-2.5 rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-xs font-semibold text-[var(--shelfy-text)]"
          >
            <option value="Todos">Todos los vendedores</option>
            {vendedores.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>

        {/* ── MAIN CONTENT: fills remaining viewport ── */}
        <div className="flex-1 flex flex-col min-h-0 p-0 md:p-4 md:pt-2 relative">
          {/* Flash notification */}
          <AnimatePresence>
            {flash && (
              <motion.div
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                className={`mx-4 px-6 py-2.5 rounded-2xl text-sm font-bold shadow-lg flex items-center justify-center absolute top-2 left-0 right-0 z-50
                  ${flash.msg === "Rechazado"
                    ? "bg-red-500/90 backdrop-blur-md text-white border border-red-400"
                    : flash.msg === "Destacado"
                      ? "bg-amber-500/90 backdrop-blur-md text-white border border-amber-400"
                      : flash.type === "ok"
                        ? "bg-emerald-500/90 backdrop-blur-md text-white border border-emerald-400"
                        : "bg-red-500/90 backdrop-blur-md text-white border border-red-400"
                  }`}>
                {flash.msg === "Aprobado"  && <Check className="mr-2" size={18} strokeWidth={3} />}
                {flash.msg === "Rechazado" && <X className="mr-2" size={18} strokeWidth={3} />}
                {flash.msg === "Destacado" && <Flame className="mr-2" size={18} strokeWidth={3} />}
                {flash.msg}
              </motion.div>
            )}
          </AnimatePresence>

          {errorPend && <p className="text-red-500 text-sm font-semibold text-center py-2 shrink-0">{(errorPend as Error).message}</p>}

          {totalGrupos === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 text-center">
              <div className="w-20 h-20 bg-violet-100 rounded-3xl flex items-center justify-center text-violet-500 mb-6 shadow-inner">
                <Check size={32} strokeWidth={3} />
              </div>
              <p className="text-2xl font-black text-slate-800 mb-2 tracking-tight">¡Todo al día!</p>
              <p className="text-slate-500 font-medium mb-8">No hay exhibiciones pendientes de evaluación</p>
              <button 
                onClick={() => queryClient.invalidateQueries({ queryKey: ['pendientes', distId] })} 
                className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 text-slate-700 rounded-2xl font-bold shadow-sm hover:bg-slate-50 transition-all active:scale-95"
              >
                <RefreshCw size={16} /> Buscar nuevas
              </button>
            </div>
          ) : !grupo ? (
            <div className="flex flex-col items-center justify-center flex-1 text-center px-6">
              <div className="w-14 h-14 rounded-2xl bg-slate-200/80 flex items-center justify-center mb-4">
                <RefreshCw size={20} className="text-slate-500 animate-spin" />
              </div>
              <p className="text-slate-700 font-semibold">Reacomodando exhibiciones...</p>
              <p className="text-slate-500 text-sm mt-1">Actualizando la siguiente pendiente.</p>
            </div>
          ) : (
            /* ── VISOR LAYOUT: Image + overlays, fills entire remaining space ── */
            <div className="flex-1 flex flex-col min-h-0">
              {/* IMAGE CONTAINER — takes all remaining space */}
              <div className="flex-1 min-h-0 rounded-none md:rounded-2xl overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.22),_rgba(15,23,42,0.28)_52%,_rgba(2,6,23,0.45)_100%)] relative group">
                {/* Photo */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${currentIndex}-${currentFotoIdx}`}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="absolute inset-0"
                  >
                    <FotoViewer 
                      driveUrl={grupo.fotos[currentFotoIdx]?.drive_link ?? ""} 
                      idExhibicion={grupo.fotos[currentFotoIdx]?.id_exhibicion} 
                      priority={true}
                    />
                  </motion.div>
                </AnimatePresence>

                {/* ── ERP PROFILE CARD (Desktop, top-right) ── */}
                {!focusHoldActive && erpContext?.encontrado && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="hidden md:block absolute top-4 right-4 w-72 bg-black/45 backdrop-blur-xl border border-white/10 rounded-2xl p-4 text-white shadow-2xl z-10"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-[12px] font-black text-white truncate mb-0.5">
                          {erpContext.nombre_fantasia || erpContext.razon_social || "Cliente"}
                        </h3>
                        <p className="text-[9px] font-bold text-white/60 uppercase tracking-wider">
                          Cód. Cliente: {nroForErp || grupo.nro_cliente || "—"}
                        </p>
                      </div>
                      <div className="flex gap-1 ml-2">
                        <span className="text-[8px] font-black bg-violet-600 text-white px-1.5 py-0.5 rounded whitespace-nowrap">
                          R{erpContext.nro_ruta || "—"}
                        </span>
                        {erpContext.dia_visita && (
                          <span className="text-[8px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded uppercase">
                            {erpContext.dia_visita.slice(0, 3)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                        <p className="text-[7px] font-black text-white/40 uppercase tracking-widest mb-0.5">Prom. Factura</p>
                        <p className="text-[11px] font-black text-emerald-400">
                          {erpContext.promedio_factura != null ? `$${erpContext.promedio_factura.toLocaleString()}` : "Sin datos"}
                        </p>
                      </div>
                      <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                        <p className="text-[7px] font-black text-white/40 uppercase tracking-widest mb-0.5">Deuda Total</p>
                        <p className={`text-[11px] font-black ${(erpContext.deuda_total ?? 0) > 0 ? 'text-red-400' : 'text-white/60'}`}>
                          {erpContext.deuda_total != null ? `$${erpContext.deuda_total.toLocaleString()}` : "–"}
                        </p>
                      </div>
                      <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                        <p className="text-[7px] font-black text-white/40 uppercase tracking-widest mb-0.5">Facturas</p>
                        <p className="text-[11px] font-black text-sky-400">
                          {erpContext.cant_facturas != null ? erpContext.cant_facturas : "–"}
                        </p>
                      </div>
                      <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                        <p className="text-[7px] font-black text-white/40 uppercase tracking-widest mb-0.5">Última Compra</p>
                        <p className="text-[9px] font-bold text-white/60 truncate">
                          {erpContext.ultima_compra ? erpContext.ultima_compra.slice(0, 10) : "Sin datos"}
                        </p>
                      </div>
                      {(erpContext.domicilio || erpContext.localidad) && (
                        <div className="col-span-2 bg-white/5 rounded-lg p-2 border border-white/5">
                          <p className="text-[7px] font-black text-white/40 uppercase tracking-widest mb-0.5">Dirección</p>
                          <p className="text-[9px] font-bold text-white/60 truncate">
                            {erpContext.domicilio
                              ? `${erpContext.domicilio}${erpContext.localidad ? `, ${erpContext.localidad}` : ""}`
                              : erpContext.localidad || "–"}
                          </p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* ── MOBILE TOP OVERLAY: compact info ── */}
                {!focusHoldActive && <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 via-black/30 to-transparent pt-3 pb-6 px-3 text-white md:hidden z-10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                      <span className="text-[10px] font-black bg-violet-600/90 px-2 py-0.5 rounded-md">#{grupo.fotos[currentFotoIdx]?.id_exhibicion || "—"}</span>
                      <span className="text-[10px] font-bold truncate text-white/90">🏪 Cód. {grupo.nro_cliente ?? "—"}</span>
                      <span className="text-[10px] font-bold truncate text-white/70">👤 {grupo.vendedor ?? "—"}</span>
                      {grupo.fotos.some(f => f.es_objetivo) && (
                        <motion.span
                          animate={{ scale: [1, 1.08, 1] }}
                          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                          className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-500/30 text-violet-200 border border-violet-400/40"
                        >
                          🎯 Objetivo
                        </motion.span>
                      )}
                    </div>
                    <span className="text-[9px] font-bold text-white/50 shrink-0 ml-2">{currentIndex + 1}/{totalGrupos}</span>
                  </div>

                  <div className="mt-2 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => setMobileFiltersOpen((v) => !v)}
                      className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-black/35 px-2 py-1 text-[10px] font-bold text-white/85 backdrop-blur-sm"
                    >
                      Filtros
                      <ChevronUp
                        size={12}
                        className={`transition-transform ${mobileFiltersOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                  </div>

                  {mobileFiltersOpen && (
                    <div className="mt-2 rounded-xl border border-white/15 bg-black/45 p-2 backdrop-blur-md">
                      <div className="grid grid-cols-1 gap-2">
                        <label className="flex flex-col gap-1">
                          <span className="text-[9px] font-semibold uppercase tracking-wider text-white/65">
                            Sucursal
                          </span>
                          <select
                            value={filtroSucursal}
                            onChange={(e) => {
                              setFiltroSucursal(e.target.value);
                              setCurrentIndex(0);
                            }}
                            className="h-7 rounded-md border border-white/20 bg-black/30 px-2 text-[11px] font-semibold text-white"
                          >
                            <option value="Todas">Todas las sucursales</option>
                            {sucursalesDisponibles.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </label>

                        <label className="flex flex-col gap-1">
                          <span className="text-[9px] font-semibold uppercase tracking-wider text-white/65">
                            Vendedor
                          </span>
                          <select
                            value={filtroVendedor}
                            onChange={(e) => {
                              setFiltroVendedor(e.target.value);
                              setCurrentIndex(0);
                            }}
                            className="h-7 rounded-md border border-white/20 bg-black/30 px-2 text-[11px] font-semibold text-white"
                          >
                            <option value="Todos">Todos los vendedores</option>
                            {vendedores.map((v) => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  )}
                </div>}

                {/* ── VALIDATION LOCK ── */}
                {isValidacion && (
                  <div className="absolute inset-0 bg-amber-900/60 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-20 pointer-events-none">
                    <Lock size={48} className="text-amber-200" />
                    <p className="text-white font-black text-lg tracking-tight">VALIDACIÓN ERP</p>
                    <p className="text-amber-100 text-xs font-semibold text-center px-8">
                      El cliente no figura en el ERP.<br />
                      Se habilitará automáticamente cuando impacten los datos.
                    </p>
                  </div>
                )}

                {/* ── PHOTO NAVIGATION (multi-photo groups) ── */}
                {grupo.fotos.length > 1 && (
                  <>
                    {/* Flechas laterales estilo carrusel */}
                    <button
                      onClick={handlePrevFoto}
                      disabled={currentFotoIdx === 0}
                      className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-20 w-9 h-9 md:w-11 md:h-11 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-md text-white border border-white/20 hover:bg-black/60 disabled:opacity-25 disabled:cursor-not-allowed transition-all"
                      aria-label="Foto anterior"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <button
                      onClick={handleNextFoto}
                      disabled={currentFotoIdx >= grupo.fotos.length - 1}
                      className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-20 w-9 h-9 md:w-11 md:h-11 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-md text-white border border-white/20 hover:bg-black/60 disabled:opacity-25 disabled:cursor-not-allowed transition-all"
                      aria-label="Foto siguiente"
                    >
                      <ChevronRight size={20} />
                    </button>

                    {/* Contador de fotos */}
                    <div className="absolute top-10 md:top-4 right-3 md:right-4 z-20 bg-black/35 backdrop-blur-md px-2 py-1 rounded-full text-white/90 text-[10px] md:text-xs font-bold font-mono border border-white/15">
                      {currentFotoIdx + 1}/{grupo.fotos.length}
                    </div>
                  </>
                )}

                {/* ── FROSTED BOTTOM BAR: izq info · centro botones · der comentarios (Desktop) ── */}
                {!focusHoldActive && <div className="hidden md:flex absolute bottom-0 left-0 right-0 z-10 flex-col pointer-events-none">
                  <div className="pointer-events-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto_minmax(220px,300px)] gap-2 px-4 py-1.5 bg-black/42 backdrop-blur-xl border-t border-white/10 text-white items-end">
                    {/* IZQUIERDA: vendedor, código ERP, envío, ingreso, 30d */}
                    <div className="min-w-0 flex flex-col gap-1 text-left">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center shrink-0 border border-white/10">
                            <User className="text-white/80" size={12} />
                          </div>
                          <span className="text-[11px] font-bold text-white truncate">{grupo.vendedor || "Sin asignar"}</span>
                        </div>
                        {grupo.fotos.some(f => f.es_objetivo) && (
                          <motion.span
                            animate={{ scale: [1, 1.06, 1] }}
                            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                            className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--shelfy-primary)]/20 text-[var(--shelfy-primary)] border border-[var(--shelfy-primary)]/35"
                          >
                            Objetivo
                          </motion.span>
                        )}
                      </div>
                      <p className="text-[10px] text-white/85">
                        <span className="text-white/45">id cliente ERP</span>{" "}
                        <span className="font-mono font-bold">{nroForErp || grupo.nro_cliente || "—"}</span>
                      </p>
                      <p className="text-[10px] text-white/85">
                        <span className="text-white/45">Envío</span>{" "}
                        {grupo.fecha_hora?.slice(0, 16).replace("T", " ") || "—"}
                      </p>
                      <p className="text-[10px]">
                        <span className="text-white/45">Tipo de comercio</span>{" "}
                        {!user?.usa_contexto_erp || skipErpFetch ? (
                          <span className="text-white/50">Sin contexto ERP</span>
                        ) : loadingERP ? (
                          <span className="text-white/50">Cargando…</span>
                        ) : erpContext?.encontrado ? (
                          <span className={conIngresoComercio ? "text-emerald-400 font-semibold" : "text-red-400 font-semibold"}>
                            {conIngresoComercio ? "Con ingreso" : "Sin ingreso"}
                          </span>
                        ) : (
                          <span className="text-amber-300/90">No encontrado en ERP</span>
                        )}
                      </p>
                      <p className="text-[10px]">
                        <span className="text-white/45">Compró últimos 30d</span>{" "}
                        {!user?.usa_contexto_erp || skipErpFetch ? (
                          <span className="text-white/50">—</span>
                        ) : loadingERP ? (
                          <span className="text-white/50">…</span>
                        ) : erpContext?.encontrado ? (
                          <motion.span
                            key={compraUltimos30 ? "si" : "no"}
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ duration: 0.2 }}
                            className={`font-black inline-block px-1.5 py-0.5 rounded text-[9px] ${compraUltimos30 ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}
                          >
                            {compraUltimos30 ? "SÍ" : "NO"}
                          </motion.span>
                        ) : (
                          <span className="text-white/50">—</span>
                        )}
                      </p>
                    </div>

                    {/* CENTRO: botones evaluación */}
                    <div className="flex flex-col items-center gap-1 shrink-0 justify-end pb-0.5">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleRevertir}
                          disabled={!lastEvalIds.current.length || mutationRevertir.isPending}
                          title="Revertir"
                          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 hover:text-white disabled:opacity-30 transition-all active:scale-95 border border-white/10"
                        >
                          <RotateCcw size={16} strokeWidth={2.5} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEvaluar("Rechazado")}
                          disabled={mutationEvaluar.isPending || !todasVistas || isValidacion}
                          title="Rechazar"
                          className="w-11 h-11 flex items-center justify-center rounded-full bg-[#fa5252] text-white shadow-[0_4px_16px_rgba(250,82,82,0.4)] hover:scale-110 disabled:opacity-20 transition-all duration-200 active:scale-95"
                        >
                          <X size={22} strokeWidth={3.5} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEvaluar("Destacado")}
                          disabled={mutationEvaluar.isPending || !todasVistas || isValidacion}
                          title="Destacar"
                          className="w-12 h-12 flex items-center justify-center rounded-full bg-[#f97316] text-white shadow-[0_4px_16px_rgba(249,115,22,0.45)] hover:scale-110 disabled:opacity-20 transition-all duration-200 active:scale-95"
                        >
                          <Flame size={24} strokeWidth={3} className="fill-white/20" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEvaluar("Aprobado")}
                          disabled={mutationEvaluar.isPending || !todasVistas || isValidacion}
                          title="Aprobar"
                          className="w-11 h-11 flex items-center justify-center rounded-full bg-[#10b981] text-white shadow-[0_4px_16px_rgba(16,185,129,0.4)] hover:scale-110 disabled:opacity-20 transition-all duration-200 active:scale-95"
                        >
                          <Check size={22} strokeWidth={3.5} />
                        </button>
                        <button
                          type="button"
                          onClick={() => queryClient.invalidateQueries({ queryKey: ['pendientes', distId] })}
                          title="Refrescar"
                          className="w-9 h-9 flex items-center justify-center rounded-full bg-[#fbbf24]/80 text-white hover:bg-[#fbbf24] transition-all active:scale-95 border border-white/10"
                        >
                          <RefreshCw size={16} strokeWidth={2.5} />
                        </button>
                      </div>
                      <span className="text-[9px] font-bold text-white/45">
                        {currentIndex + 1}<span className="text-white/25">/{totalGrupos}</span>
                      </span>
                    </div>

                    {/* DERECHA: plantillas + observaciones */}
                    <div className="min-w-0 flex flex-col gap-1.5 w-full">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-8 w-full justify-between text-[10px] bg-white/10 border-white/15 text-white hover:bg-white/20"
                          >
                            Frases rápidas
                            <ChevronUp className="size-3.5 opacity-70" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          side="top"
                          align="end"
                          className="w-72 max-h-72 overflow-y-auto border-white/10 bg-zinc-900 text-white p-3"
                        >
                          <p className="text-[10px] font-semibold text-white/50 uppercase tracking-wider mb-2">Insertar con un clic</p>
                          <div className="flex flex-col gap-1 mb-3">
                            {commentTemplates.length === 0 ? (
                              <span className="text-xs text-white/40">No hay frases guardadas.</span>
                            ) : (
                              commentTemplates.map((t) => (
                                <button
                                  key={t}
                                  type="button"
                                  className="text-left text-xs py-1.5 px-2 rounded-md bg-white/5 hover:bg-violet-500/25 border border-white/10"
                                  onClick={() => applyCommentTemplate(t)}
                                >
                                  {t}
                                </button>
                              ))
                            )}
                          </div>
                          <p className="text-[10px] font-semibold text-white/50 uppercase tracking-wider mb-1">Nueva frase</p>
                          <div className="flex gap-1">
                            <input
                              type="text"
                              value={newTemplateText}
                              onChange={(e) => setNewTemplateText(e.target.value)}
                              placeholder="Ej. Falta cartel con precios"
                              className="flex-1 min-w-0 rounded-md border border-white/15 bg-black/40 px-2 py-1.5 text-xs text-white placeholder:text-white/35"
                            />
                            <Button type="button" size="sm" className="shrink-0 h-8 text-xs" onClick={addCommentTemplate}>
                              Guardar
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                      <Textarea
                        placeholder="Observaciones…"
                        rows={2}
                        value={comentario}
                        onChange={(e) => setComentario(e.target.value)}
                        className="min-h-[52px] resize-none bg-white/10 border-white/15 text-[11px] text-white placeholder:text-white/35 focus-visible:ring-violet-400/50"
                      />
                    </div>
                  </div>
                </div>}

                {/* ── MOBILE FROSTED BOTTOM BAR ── */}
                {!focusHoldActive && <div className="flex md:hidden absolute bottom-0 left-0 right-0 z-10 flex-col pointer-events-none">
                  <div
                    className="pointer-events-auto flex flex-col gap-1.5 px-3 py-1.5 bg-black/50 backdrop-blur-xl border-t border-white/10 text-white"
                    style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}
                  >
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] leading-tight">
                      <span className="font-bold truncate max-w-[45%]">{grupo.vendedor || "—"}</span>
                      <span className="text-white/50 font-mono">#{nroForErp || grupo.nro_cliente || "—"}</span>
                      <span className="text-white/45">{grupo.fecha_hora?.slice(0, 16).replace("T", " ") || ""}</span>
                      {erpContext?.encontrado && !loadingERP && (
                        <>
                          <span className={conIngresoComercio ? "text-emerald-400" : "text-red-400"}>
                            {conIngresoComercio ? "Con ingreso" : "Sin ingreso"}
                          </span>
                          <span className={compraUltimos30 ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                            30d: {compraUltimos30 ? "SÍ" : "NO"}
                          </span>
                        </>
                      )}
                    </div>
                    {mobileToolsOpen && (
                      <>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-7 w-full justify-between text-[10px] bg-white/10 border-white/15 text-white"
                            >
                              Frases rápidas
                              <ChevronUp className="size-3.5 opacity-70" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent side="top" className="w-[min(100vw-2rem,18rem)] max-h-64 overflow-y-auto border-white/10 bg-zinc-900 text-white p-3">
                            <div className="flex flex-col gap-1 mb-2">
                              {commentTemplates.map((t) => (
                                <button
                                  key={t}
                                  type="button"
                                  className="text-left text-xs py-1.5 px-2 rounded-md bg-white/5 hover:bg-violet-500/25"
                                  onClick={() => applyCommentTemplate(t)}
                                >
                                  {t}
                                </button>
                              ))}
                            </div>
                            <div className="flex gap-1">
                              <input
                                type="text"
                                value={newTemplateText}
                                onChange={(e) => setNewTemplateText(e.target.value)}
                                placeholder="Nueva frase…"
                                className="flex-1 rounded-md border border-white/15 bg-black/40 px-2 py-1 text-xs text-white"
                              />
                              <Button type="button" size="sm" className="h-7 text-xs shrink-0" onClick={addCommentTemplate}>
                                +
                              </Button>
                            </div>
                          </PopoverContent>
                        </Popover>
                        <Textarea
                          placeholder="Observaciones…"
                          rows={2}
                          value={comentario}
                          onChange={(e) => setComentario(e.target.value)}
                          className="min-h-[44px] resize-none bg-white/10 border-white/15 text-xs text-white placeholder:text-white/35"
                        />
                      </>
                    )}

                    {/* Evaluation buttons — compact for mobile */}
                    <div className="flex items-center gap-1.5 shrink-0 justify-center">
                      <button
                        onClick={handleRevertir}
                        disabled={!lastEvalIds.current.length || mutationRevertir.isPending}
                        className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 text-white/50 disabled:opacity-30 transition-all active:scale-90 border border-white/10"
                      >
                        <RotateCcw size={14} strokeWidth={2.5} />
                      </button>
                      <button
                        onClick={() => handleEvaluar("Rechazado")}
                        disabled={mutationEvaluar.isPending || !todasVistas || isValidacion}
                        className="w-11 h-11 flex items-center justify-center rounded-full bg-[#fa5252] text-white shadow-[0_2px_10px_rgba(250,82,82,0.4)] disabled:opacity-20 transition-all active:scale-90"
                      >
                        <X size={20} strokeWidth={3.5} />
                      </button>
                      <button
                        onClick={() => handleEvaluar("Destacado")}
                        disabled={mutationEvaluar.isPending || !todasVistas || isValidacion}
                        className="w-12 h-12 flex items-center justify-center rounded-full bg-[#f97316] text-white shadow-[0_2px_12px_rgba(249,115,22,0.45)] disabled:opacity-20 transition-all active:scale-90"
                      >
                        <Flame size={22} strokeWidth={3} className="fill-white/20" />
                      </button>
                      <button
                        onClick={() => handleEvaluar("Aprobado")}
                        disabled={mutationEvaluar.isPending || !todasVistas || isValidacion}
                        className="w-11 h-11 flex items-center justify-center rounded-full bg-[#10b981] text-white shadow-[0_2px_10px_rgba(16,185,129,0.4)] disabled:opacity-20 transition-all active:scale-90"
                      >
                        <Check size={20} strokeWidth={3.5} />
                      </button>
                      <button
                        onClick={() => queryClient.invalidateQueries({ queryKey: ['pendientes', distId] })}
                        className="w-9 h-9 flex items-center justify-center rounded-full bg-[#fbbf24]/80 text-white transition-all active:scale-90 border border-white/10"
                      >
                        <RefreshCw size={14} strokeWidth={2.5} />
                      </button>
                      <button
                        onClick={() => setMobileToolsOpen((v) => !v)}
                        className="h-9 px-2.5 flex items-center justify-center rounded-full bg-white/10 text-white/85 transition-all active:scale-90 border border-white/10 text-[10px] font-bold"
                      >
                        {mobileToolsOpen ? "Ocultar" : "Obs"}
                      </button>
                    </div>
                  </div>
                </div>}
              </div>


            </div>
          )}
        </div>
      </div>
    </div>
  );
}
