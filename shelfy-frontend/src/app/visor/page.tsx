"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { PageSpinner } from "@/components/ui/Spinner";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useViewerStore } from "../../store/useViewerStore";
import NextImage from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  fetchPendientes, fetchStatsHoy, fetchVendedores,
  evaluar, revertir,
  resolveImageUrl,
  fetchERPContexto,
  type GrupoPendiente, type StatsHoy, type ERPContexto,
} from "@/lib/api";
import { Check, X, Flame, RotateCcw, RefreshCw, ChevronLeft, ChevronRight, ImageOff, Info, User, Lock } from "lucide-react";

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
    <div className="relative w-full h-full bg-[#0d0d0d] rounded-3xl overflow-hidden shadow-md">
      <NextImage
        src={src}
        alt={`Exhibición ${idExhibicion}`}
        fill
        className="object-contain rounded-3xl"
        priority={priority}
        quality={80}
        onError={() => setErr(true)}
        unoptimized // Evitar optimización Next.js si vienen de Supabase Storage/External
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
  const [comentario, setComentario] = useState("");
  const [flash, setFlash] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [erpContext, setErpContext] = useState<ERPContexto | null>(null);
  const [loadingERP, setLoadingERP] = useState(false);

  const distId = user?.id_distribuidor || 0;

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
  const filtrados = filtroVendedor === "Todos"
    ? grupos
    : grupos.filter((g) => g.vendedor === filtroVendedor);

  const grupo = filtrados[currentIndex] ?? null;
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

      // We don't remove from 'pendientes' query data yet because that would mess up 'filtrados' indexes
      // Instead, we just move the store index, and when the mutation finishes, we refetch or update cache properly.
      return { previousPendientes };
    },
    onSuccess: () => {
      // Move to next group instantly (Hypersonic)
      if (currentIndex < filtrados.length - 1) {
        // incrementIndex(); // Ya se hizo en handleEvaluar para máxima velocidad
      } else {
        queryClient.invalidateQueries({ queryKey: ['pendientes', distId] });
        setCurrentIndex(0);
        resetGroupState();
      }
    },
    onError: (err) => {
      setFlash({ msg: "Error al evaluar", type: "err" });
      console.error(err);
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
    // Reset group state when index changes
    resetGroupState();
    setComentario("");
    setErpContext(null);
  }, [currentIndex, filtroVendedor, resetGroupState]);

  useEffect(() => {
    if (!grupo || !user || !user.usa_contexto_erp) return;
    const cargarContexto = async () => {
      setLoadingERP(true);
      try {
        const ctx = await fetchERPContexto(user.id_distribuidor!, grupo.nro_cliente);
        setErpContext(ctx);
      } catch (e) {
        console.error("Error cargando contexto ERP:", e);
      } finally {
        setLoadingERP(false);
      }
    };
    cargarContexto();
  }, [grupo, user]);

  // Handlers
  async function handleEvaluar(estado: "Aprobado" | "Destacado" | "Rechazado") {
    if (!grupo || !user || mutationEvaluar.isPending || !todasVistas) return;
    const ids = grupo.fotos.map((f) => f.id_exhibicion);
    lastEvalIds.current = ids;
    
    // 1. Trigger network request
    mutationEvaluar.mutate({ ids, estado, comentario });
    
    // 2. Immediate UI jump
    if (currentIndex < filtrados.length - 1) {
      incrementIndex();
    } else {
      // Last one
      // The mutation onSuccess will handle the final state
    }
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
                  ${flash.type === "ok"
                    ? "bg-green-500/90 backdrop-blur-md text-white border border-green-400"
                    : "bg-red-500/90 backdrop-blur-md text-white border border-red-400"
                  }`}>
                {flash.msg === "Aprobado" && <Check className="mr-2" size={18} strokeWidth={3} />}
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
          ) : grupo && (
            /* ── VISOR LAYOUT: Image + overlays, fills entire remaining space ── */
            <div className="flex-1 flex flex-col min-h-0">
              {/* IMAGE CONTAINER — takes all remaining space */}
              <div className="flex-1 min-h-0 rounded-none md:rounded-2xl overflow-hidden bg-[#0a0a0a] relative group">
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
                {erpContext?.encontrado && (
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
                          #{grupo.nro_cliente}
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
                        <p className="text-[7px] font-black text-white/40 uppercase tracking-widest mb-0.5">Prom</p>
                        <p className="text-[11px] font-black text-emerald-400">${erpContext.promedio_factura?.toLocaleString()}</p>
                      </div>
                      <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                        <p className="text-[7px] font-black text-white/40 uppercase tracking-widest mb-0.5">Deuda</p>
                        <p className={`text-[11px] font-black ${erpContext.deuda_total > 0 ? 'text-red-400' : 'text-white/60'}`}>
                          ${erpContext.deuda_total?.toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                        <p className="text-[7px] font-black text-white/40 uppercase tracking-widest mb-0.5">Facturas</p>
                        <p className="text-[11px] font-black text-sky-400">{erpContext.cant_facturas}</p>
                      </div>
                      <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                        <p className="text-[7px] font-black text-white/40 uppercase tracking-widest mb-0.5">Últ. Compra</p>
                        <p className="text-[9px] font-bold text-white/60 truncate">{erpContext.ultima_compra?.slice(0, 10) || '—'}</p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* ── MOBILE TOP OVERLAY: compact info ── */}
                <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 via-black/40 to-transparent pt-3 pb-6 px-3 text-white md:hidden z-10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-[10px] font-black bg-violet-600/90 px-2 py-0.5 rounded-md">#{grupo.fotos[currentFotoIdx]?.id_exhibicion || "—"}</span>
                      <span className="text-[10px] font-bold truncate text-white/90">🏪 {grupo.nro_cliente ?? "—"}</span>
                      <span className="text-[10px] font-bold truncate text-white/70">👤 {grupo.vendedor ?? "—"}</span>
                    </div>
                    <span className="text-[9px] font-bold text-white/50 shrink-0 ml-2">{currentIndex + 1}/{totalGrupos}</span>
                  </div>
                </div>

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
                  <div className="absolute top-10 md:top-4 left-3 md:left-auto md:right-4 flex gap-1 bg-black/30 backdrop-blur-md p-1 rounded-full text-white z-10">
                    <button onClick={handlePrevFoto} disabled={currentFotoIdx === 0} className="w-7 h-7 md:w-8 md:h-8 flex items-center justify-center rounded-full hover:bg-black/40 disabled:opacity-30 transition-colors">
                      <ChevronLeft size={16} />
                    </button>
                    <span className="w-7 md:w-8 flex items-center justify-center text-[10px] md:text-xs font-bold font-mono">
                      {currentFotoIdx + 1}/{grupo.fotos.length}
                    </span>
                    <button onClick={handleNextFoto} disabled={currentFotoIdx >= grupo.fotos.length - 1} className="w-7 h-7 md:w-8 md:h-8 flex items-center justify-center rounded-full hover:bg-black/40 disabled:opacity-30 transition-colors">
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}

                {/* ── FROSTED BOTTOM BAR: Info + Comments + Buttons (Desktop) ── */}
                <div className="hidden md:flex absolute bottom-0 left-0 right-0 z-10 flex-col pointer-events-none">
                  <div className="pointer-events-auto flex items-center gap-3 px-4 py-2.5 bg-black/55 backdrop-blur-xl border-t border-white/10 text-white">
                    {/* Vendedor */}
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center shrink-0 border border-white/10">
                        <User className="text-white/80" size={14} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold text-white truncate leading-tight">{grupo.vendedor || "Sin asignar"}</p>
                        <p className="text-[8px] font-medium text-white/40">Vendedor</p>
                      </div>
                    </div>
                    <div className="h-5 w-px bg-white/15" />
                    {/* Cliente */}
                    <div className="min-w-0">
                      <p className="text-[8px] font-medium text-white/40">Cliente</p>
                      <p className="text-[10px] font-bold text-white truncate">{grupo.nro_cliente || "—"}</p>
                    </div>
                    <div className="h-5 w-px bg-white/15" />
                    {/* Tipo PDV */}
                    <div className="min-w-0">
                      <p className="text-[8px] font-medium text-white/40">Tipo</p>
                      <p className="text-[9px] font-bold bg-white/10 text-white/90 px-1.5 py-0.5 rounded inline-block">{grupo.tipo_pdv || "—"}</p>
                    </div>
                    <div className="h-5 w-px bg-white/15" />
                    {/* Fecha */}
                    <div className="min-w-0">
                      <p className="text-[8px] font-medium text-white/40">Fecha</p>
                      <p className="text-[10px] font-bold text-white truncate">{grupo.fecha_hora?.slice(0, 16).replace('T', ' ') || "—"}</p>
                    </div>

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Comentario inline */}
                    <div className="w-48 xl:w-64 shrink-0">
                      <textarea
                        placeholder="Observaciones..."
                        className="w-full bg-white/10 hover:bg-white/15 focus:bg-white/20 border border-white/10 focus:border-violet-400/50 rounded-lg px-2.5 py-1 text-[10px] text-white placeholder-white/35 outline-none transition-all resize-none"
                        rows={1}
                        value={comentario}
                        onChange={(e) => setComentario(e.target.value)}
                      />
                    </div>

                    <div className="h-5 w-px bg-white/15" />

                    {/* ── EVALUATION BUTTONS (inline in the bar) ── */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={handleRevertir}
                        disabled={!lastEvalIds.current.length || mutationRevertir.isPending}
                        title="Revertir"
                        className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 hover:text-white disabled:opacity-30 transition-all active:scale-95 border border-white/10"
                      >
                        <RotateCcw size={16} strokeWidth={2.5} />
                      </button>
                      <button
                        onClick={() => handleEvaluar("Rechazado")}
                        disabled={mutationEvaluar.isPending || !todasVistas || isValidacion}
                        title="Rechazar"
                        className="w-11 h-11 flex items-center justify-center rounded-full bg-[#fa5252] text-white shadow-[0_4px_16px_rgba(250,82,82,0.4)] hover:scale-110 disabled:opacity-20 transition-all duration-200 active:scale-95"
                      >
                        <X size={22} strokeWidth={3.5} />
                      </button>
                      <button
                        onClick={() => handleEvaluar("Destacado")}
                        disabled={mutationEvaluar.isPending || !todasVistas || isValidacion}
                        title="Destacar"
                        className="w-12 h-12 flex items-center justify-center rounded-full bg-[#f97316] text-white shadow-[0_4px_16px_rgba(249,115,22,0.45)] hover:scale-110 disabled:opacity-20 transition-all duration-200 active:scale-95"
                      >
                        <Flame size={24} strokeWidth={3} className="fill-white/20" />
                      </button>
                      <button
                        onClick={() => handleEvaluar("Aprobado")}
                        disabled={mutationEvaluar.isPending || !todasVistas || isValidacion}
                        title="Aprobar"
                        className="w-11 h-11 flex items-center justify-center rounded-full bg-[#10b981] text-white shadow-[0_4px_16px_rgba(16,185,129,0.4)] hover:scale-110 disabled:opacity-20 transition-all duration-200 active:scale-95"
                      >
                        <Check size={22} strokeWidth={3.5} />
                      </button>
                      <button
                        onClick={() => queryClient.invalidateQueries({ queryKey: ['pendientes', distId] })}
                        title="Refrescar"
                        className="w-9 h-9 flex items-center justify-center rounded-full bg-[#fbbf24]/80 text-white hover:bg-[#fbbf24] transition-all active:scale-95 border border-white/10"
                      >
                        <RefreshCw size={16} strokeWidth={2.5} />
                      </button>
                    </div>

                    <div className="h-5 w-px bg-white/15" />

                    {/* Progress counter */}
                    <div className="text-[10px] font-bold text-white/60 whitespace-nowrap shrink-0">
                      {currentIndex + 1}<span className="text-white/30">/{totalGrupos}</span>
                    </div>
                  </div>
                </div>

                {/* ── MOBILE FROSTED BOTTOM BAR ── */}
                <div className="flex md:hidden absolute bottom-0 left-0 right-0 z-10 flex-col pointer-events-none">
                  <div className="pointer-events-auto flex items-center gap-2 px-3 py-2 bg-black/60 backdrop-blur-xl border-t border-white/10 text-white" style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
                    {/* Mini info */}
                    <div className="flex flex-col min-w-0 flex-1">
                      <p className="text-[9px] font-bold text-white/90 truncate leading-tight">{grupo.tipo_pdv || "—"}</p>
                      <p className="text-[8px] text-white/40 truncate">{grupo.fecha_hora?.slice(0, 16).replace('T', ' ') || "—"}</p>
                    </div>

                    {/* Evaluation buttons — compact for mobile */}
                    <div className="flex items-center gap-1.5 shrink-0">
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
                    </div>
                  </div>
                </div>
              </div>

              {/* ── PROGRESS BAR (thin, below image, always visible) ── */}
              <div className="hidden md:flex items-center gap-3 px-1 py-1.5 shrink-0">
                <span className="text-[9px] font-bold text-[var(--shelfy-muted)] whitespace-nowrap">SESIÓN</span>
                <div className="flex-1 h-1 bg-violet-200/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-500 rounded-full transition-all duration-500"
                    style={{ width: `${totalGrupos > 0 ? ((currentIndex + 1) / totalGrupos) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-[9px] font-bold text-violet-500 whitespace-nowrap">{currentIndex + 1}/{totalGrupos}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
