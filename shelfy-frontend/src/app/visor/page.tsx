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

// Preloader invisible para las siguientes imágenes
function Preloader({ urls }: { urls: string[] }) {
  return (
    <div className="hidden" aria-hidden="true">
      {urls.map((url, i) => (
        <NextImage key={`${url}-${i}`} src={url} alt="preload" width={1} height={1} priority={false} unoptimized />
      ))}
    </div>
  );
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

  // Precarga de URLs
  const nextUrls = filtrados.slice(currentIndex + 1, currentIndex + 3).flatMap(g => 
    g.fotos.map(f => resolveImageUrl(f.drive_link, f.id_exhibicion) || "")
  ).filter(url => url !== "");

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
    <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <BottomNav />
      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex md:hidden items-center justify-between px-4 py-4 bg-white sticky top-0 z-30 shadow-sm">
          <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center text-white">
            <span className="font-bold text-lg leading-none">S</span>
          </div>
          <h1 className="text-lg font-bold text-violet-700">Evaluar</h1>
          <button className="w-8 h-8 flex items-center justify-center text-violet-700 bg-violet-50 rounded-full">
            <Info size={18} />
          </button>
        </header>

        <div className="hidden md:block">
          <Topbar title="Evaluar Exhibiciones" />
        </div>

        <main className="flex-1 p-0 md:p-6 overflow-x-hidden overflow-y-auto pb-28 md:pb-6 relative bg-[#faf5ff] md:bg-transparent">
          <Preloader urls={nextUrls} />

          <AnimatePresence>
            {flash && (
              <motion.div 
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                className={`mx-4 mt-4 px-6 py-3 rounded-2xl text-sm font-bold shadow-lg flex items-center justify-center transition-all absolute top-2 left-0 right-0 z-50
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

          {errorPend && <p className="text-red-500 text-sm font-semibold mb-4 text-center">{(errorPend as Error).message}</p>}

          {totalGrupos === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
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
          ) : (
            <>
              {grupo && (
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 max-w-6xl mx-auto items-start">
                  {/* COLA IZQUIERDA: IMAGEN Y BOTONES DE ACCIÓN */}
                  <div className="flex flex-col flex-1 relative h-[calc(100vh-140px)] md:h-auto min-h-[500px]">
                    <div className="w-full h-full md:aspect-[4/5] lg:aspect-auto lg:h-[610px] rounded-t-[32px] md:rounded-3xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.2)] bg-[#0a0a0a] border border-white/5 group relative">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={`${currentIndex}-${currentFotoIdx}`}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          transition={{ duration: 0.15, ease: "easeOut" }}
                          className="w-full h-full"
                        >
                          <FotoViewer 
                            driveUrl={grupo.fotos[currentFotoIdx]?.drive_link ?? ""} 
                            idExhibicion={grupo.fotos[currentFotoIdx]?.id_exhibicion} 
                            priority={true}
                          />
                        </motion.div>
                      </AnimatePresence>

                      <div className="absolute top-0 left-0 right-0 bg-black/60 backdrop-blur-md pt-6 pb-6 px-5 text-white border-b border-white/20 md:hidden">
                        <h2 className="text-xl font-extrabold tracking-tight mb-2 drop-shadow-md">
                          Exhibición #{grupo.fotos[currentFotoIdx]?.id_exhibicion || "---"}
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

                      {grupo.fotos.length > 1 && (
                        <div className="absolute top-4 right-4 flex gap-1 bg-black/30 backdrop-blur-md p-1 rounded-full text-white">
                          <button onClick={handlePrevFoto} disabled={currentFotoIdx === 0} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/40 disabled:opacity-30 transition-colors">
                            <ChevronLeft size={18} />
                          </button>
                          <span className="w-8 flex items-center justify-center text-xs font-bold font-mono">
                            {currentFotoIdx + 1}/{grupo.fotos.length}
                          </span>
                          <button onClick={handleNextFoto} disabled={currentFotoIdx >= grupo.fotos.length - 1} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/40 disabled:opacity-30 transition-colors">
                            <ChevronRight size={18} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Botones Hypersonic */}
                    <div className="flex justify-center items-center gap-3 sm:gap-5 absolute bottom-0 left-0 right-0 translate-y-1/2 md:translate-y-0 md:relative md:mt-2 z-10 px-4">
                      <button
                        onClick={handleRevertir}
                        disabled={!lastEvalIds.current.length || mutationRevertir.isPending}
                        className="w-[46px] h-[46px] sm:w-12 sm:h-12 flex items-center justify-center rounded-full bg-white text-slate-500 shadow-[0_4px_16px_rgba(0,0,0,0.12)] hover:text-slate-700 disabled:opacity-40 transition-all active:scale-95 z-0"
                      >
                        <RotateCcw size={20} strokeWidth={2.5} />
                      </button>

                      <button
                        onClick={() => handleEvaluar("Rechazado")}
                        disabled={mutationEvaluar.isPending || !todasVistas || isValidacion}
                        className="w-[58px] h-[58px] sm:w-16 sm:h-16 flex items-center justify-center rounded-full bg-[#fa5252] text-white shadow-[0_8px_24px_rgba(250,82,82,0.4)] hover:-translate-y-1 disabled:opacity-20 transition-all duration-200 active:scale-95 z-10"
                      >
                        <X size={28} strokeWidth={3.5} />
                      </button>

                      <button
                        onClick={() => handleEvaluar("Destacado")}
                        disabled={mutationEvaluar.isPending || !todasVistas || isValidacion}
                        className="w-[64px] h-[64px] sm:w-20 sm:h-20 flex items-center justify-center rounded-full bg-[#f97316] text-white shadow-[0_10px_28px_rgba(249,115,22,0.45)] hover:-translate-y-1 disabled:opacity-20 transition-all duration-200 active:scale-95 z-20"
                      >
                        <Flame size={32} strokeWidth={3} className="fill-white/20" />
                      </button>

                      <button
                        onClick={() => handleEvaluar("Aprobado")}
                        disabled={mutationEvaluar.isPending || !todasVistas || isValidacion}
                        className="w-[58px] h-[58px] sm:w-16 sm:h-16 flex items-center justify-center rounded-full bg-[#10b981] text-white shadow-[0_8px_24px_rgba(16,185,129,0.4)] hover:-translate-y-1 disabled:opacity-20 transition-all duration-200 active:scale-95 z-10"
                      >
                        <Check size={28} strokeWidth={3.5} />
                      </button>

                      <button
                        onClick={() => queryClient.invalidateQueries({ queryKey: ['pendientes', distId] })}
                        className="w-[46px] h-[46px] sm:w-12 sm:h-12 flex items-center justify-center rounded-full bg-[#fbbf24] text-white shadow-[0_6px_20px_rgba(251,191,36,0.35)] hover:-translate-y-0.5 transition-all active:scale-95 z-0"
                      >
                        <RefreshCw size={20} strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-6 md:mt-0 mt-8">
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

                    {(erpContext || loadingERP) && (
                      <div className={`bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-800 text-white relative overflow-hidden transition-all duration-300 ${loadingERP ? 'opacity-50 grayscale' : 'opacity-100'}`}>
                        <div className="absolute top-0 right-0 p-4 opacity-10">
                          <Info size={60} />
                        </div>
                        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4">Información del Cliente</h3>
                        {!erpContext && loadingERP ? (
                          <div className="py-10 flex flex-col items-center justify-center gap-2">
                            <RefreshCw className="animate-spin text-slate-600" size={24} />
                            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Sincronizando ERP...</span>
                          </div>
                        ) : erpContext?.encontrado ? (
                          <>
                            <div className="space-y-4 mb-6">
                              <div>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Ruta y Canal</p>
                                <div className="flex gap-2">
                                  <span className="text-[11px] font-black bg-violet-600 text-white px-2 py-0.5 rounded-md">RUTA {erpContext.nro_ruta || "SR"}</span>
                                  <span className="text-[11px] font-black bg-slate-700 text-slate-300 px-2 py-0.5 rounded-md uppercase">{erpContext.canal || "General"}</span>
                                </div>
                              </div>
                              <div>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Ubicación</p>
                                <p className="text-xs font-bold text-slate-200 line-clamp-1">{erpContext.domicilio || 'Sin dirección'}</p>
                                <p className="text-[10px] font-medium text-slate-400">{erpContext.localidad || 'Sin localidad'}</p>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div className="bg-slate-800/40 rounded-2xl p-3 border border-white/5">
                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Promedio</p>
                                <p className="text-sm font-black text-emerald-400">${erpContext.promedio_factura?.toLocaleString()}</p>
                              </div>
                              <div className="bg-slate-800/40 rounded-2xl p-3 border border-white/5">
                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Deuda</p>
                                <p className={`text-sm font-black ${erpContext.deuda_total > 0 ? 'text-red-400' : 'text-slate-300'}`}>
                                  ${erpContext.deuda_total?.toLocaleString()}
                                </p>
                              </div>
                              <div className="bg-slate-800/40 rounded-2xl p-3 border border-white/5">
                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Frecuencia</p>
                                <p className="text-sm font-black text-sky-400">{erpContext.cant_facturas} fcts</p>
                              </div>
                              <div className="bg-slate-800/40 rounded-2xl p-3 border border-white/5">
                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Últ. Compra</p>
                                <p className="text-[10px] font-bold text-slate-300 truncate">{erpContext.ultima_compra || '—'}</p>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="py-6 flex flex-col items-center justify-center text-center opacity-40 italic">
                            <span className="text-xs">Sin registros maestros encontrados</span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="bg-violet-50 rounded-3xl p-5 border border-violet-100/50">
                      <div className="flex justify-between text-xs font-bold text-violet-700 mb-2">
                        <span>SESIÓN DE HOY</span>
                        <span>{currentIndex + 1} / {totalGrupos}</span>
                      </div>
                      <div className="h-2 w-full bg-violet-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-violet-600 rounded-full transition-all duration-500"
                          style={{ width: `${totalGrupos > 0 ? ((currentIndex + 1) / totalGrupos) * 100 : 0}%` }}
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
