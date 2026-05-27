"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ImageOff, MapPin, ChevronLeft, ChevronRight, Activity, Hash, User, Clock } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/skeleton';
import { resolveImageUrl, type UltimaEvaluada } from '@/lib/api';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface HeroCarouselProps {
  items: UltimaEvaluada[];
  compact?: boolean;
}

const AUTOPLAY_MS = 8000;

function formatTimeText(dateInput?: string): string {
  if (!dateInput) return 'Reciente';
  const date = new Date(dateInput);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'hace un momento';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  const days = Math.floor(hours / 24);
  return `Hace ${days} ${days === 1 ? 'día' : 'días'}`;
}

function estadoBadgeStyle(estado: string): string {
  const e = estado.toLowerCase();
  if (e.includes('destacad')) return 'bg-violet-500 text-white';
  if (e.includes('aprobad'))  return 'bg-emerald-500 text-white';
  if (e.includes('rechaz'))   return 'bg-red-500 text-white';
  return 'bg-amber-500 text-white'; // pendiente
}

function estadoLabel(estado: string): string {
  const e = estado.toLowerCase();
  if (e.includes('destacad')) return 'Destacado';
  if (e.includes('aprobad'))  return 'Aprobado';
  if (e.includes('rechaz'))   return 'Rechazado';
  return 'Pendiente';
}

export function HeroCarousel({ items, compact = false }: HeroCarouselProps) {
  // Filtrar rechazadas
  const filtered = items.filter((e) => !/rechaz/i.test(e.estado));
  const [ci, setCi]           = useState(0);
  const [imgErr, setImgErr]   = useState(false);
  const [loaded, setLoaded]   = useState(false);
  const [progressKey, setProgressKey] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function resetTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (filtered.length <= 1) return;
    timerRef.current = setInterval(() => {
      setCi(curr => (curr + 1) % filtered.length);
      setImgErr(false);
      setLoaded(false);
      setProgressKey(k => k + 1);
    }, AUTOPLAY_MS);
  }

  useEffect(() => {
    resetTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.length]);

  function goTo(idx: number) {
    setCi(idx);
    setImgErr(false);
    setLoaded(false);
    setProgressKey(k => k + 1);
    resetTimer();
  }
  const prev = () => goTo(ci === 0 ? filtered.length - 1 : ci - 1);
  const next = () => goTo(ci === filtered.length - 1 ? 0 : ci + 1);

  if (filtered.length === 0) return (
    <Card className="h-full min-h-0 flex flex-col items-center justify-center bg-slate-50 border-slate-200 border-dashed border-2 shadow-inner gap-4">
      <div className="w-20 h-20 bg-violet-50 rounded-full flex items-center justify-center">
        <Activity size={32} className="text-violet-300 animate-pulse" />
      </div>
      <div className="flex flex-col items-center gap-1">
        <span className="text-slate-700 font-black uppercase tracking-widest text-xs">Sin actividad reciente</span>
        <span className="text-slate-400 font-bold text-xs">Las fotos evaluadas aparecerán aquí</span>
      </div>
      <Link href="/visor" className="mt-2 px-5 py-2 rounded-2xl border border-violet-300 text-violet-600 font-black text-[10px] uppercase tracking-widest hover:bg-violet-50 transition-all">
        Ir al Visor
      </Link>
    </Card>
  );

  const safeIdx = Math.min(ci, filtered.length - 1);
  const item    = filtered[safeIdx];
  const imgSrc  = resolveImageUrl(item.drive_link, item.id_exhibicion);

  return (
    <div className="relative w-full h-full rounded-[2.5rem] overflow-hidden shadow-2xl ring-1 ring-slate-200/50 flex flex-col bg-slate-950 group">

      {/* Barra de progreso autoplay */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-white/20 z-30">
        <div
          key={progressKey}
          className="h-0.5 bg-white"
          style={{ width: '0%', animation: `shelfy-progress ${AUTOPLAY_MS}ms linear forwards` }}
        />
      </div>
      <style>{`@keyframes shelfy-progress { from { width: 0% } to { width: 100% } }`}</style>

      {/* IMAGEN */}
      <AnimatePresence mode="wait">
        <motion.div
          key={ci}
          initial={{ opacity: 0, scale: 1.1 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7 }}
          className="absolute inset-0"
        >
          {!imgErr && imgSrc ? (
            <div className="relative w-full h-full overflow-hidden flex items-center justify-center bg-slate-900/50">
              <img src={imgSrc} alt="BG" className="absolute inset-0 w-full h-full object-cover opacity-30 blur-2xl scale-110" />
              {!loaded && <Skeleton className="absolute inset-0 z-10 rounded-none" />}
              <img
                src={imgSrc}
                alt="Exhibicion"
                className="relative z-10 max-w-full max-h-full object-contain shadow-2xl transition-all duration-700 group-hover:scale-[1.05]"
                onLoad={() => setLoaded(true)}
                onError={() => setImgErr(true)}
              />
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-slate-900">
              <ImageOff size={40} className="text-slate-800" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/50 to-transparent z-10 pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-transparent z-10 pointer-events-none" />
        </motion.div>
      </AnimatePresence>

      {/* OVERLAY INFERIOR */}
      <div className={cn(
        "absolute bottom-0 left-0 right-0 z-20",
        compact ? "p-4" : "p-6 md:p-8",
      )}>
        <AnimatePresence mode="wait">
          <motion.div
            key={`info-${ci}`}
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -8, opacity: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            {/* ── 3 badges en fila: Vendedor | Estado | Tiempo ── */}
            <div className={cn(
              "flex flex-wrap items-center gap-1.5",
              compact ? "mb-2.5" : "mb-3",
            )}>
              {/* Badge 1: Vendedor */}
              <span className="flex items-center gap-1.5 bg-white/15 backdrop-blur-sm border border-white/20 text-white font-black text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-full shadow-md max-w-[130px] truncate">
                <User size={10} className="text-white/60 shrink-0" />
                <span className="truncate">{item.vendedor}</span>
              </span>

              {/* Badge 2: Estado */}
              <span className={cn(
                "text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full shadow-md",
                estadoBadgeStyle(item.estado),
              )}>
                {estadoLabel(item.estado)}
              </span>

              {/* Badge 3: Tiempo */}
              <span className="flex items-center gap-1 bg-black/30 backdrop-blur-sm border border-white/10 text-white/80 font-bold text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-full">
                <Clock size={10} className="text-white/50 shrink-0" />
                {formatTimeText(item.fecha_evaluacion || item.timestamp_subida)}
              </span>
            </div>

            {/* ── PDV info ── */}
            <div className="flex flex-wrap items-center gap-2">
              {/* ID cliente */}
              <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-xl border border-white/15">
                <Hash size={10} className="text-white/50 shrink-0" />
                <span className="text-white font-black text-[11px] tracking-wider">#{item.nro_cliente}</span>
              </div>

              {/* Nombre / Razón social (tipo_pdv como fallback) */}
              {item.tipo_pdv && (
                <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-xl border border-white/15 max-w-[140px]">
                  <span className="text-white/80 font-bold text-[10px] truncate">{item.tipo_pdv}</span>
                </div>
              )}

              {/* Ciudad */}
              {item.ciudad && (
                <div className="flex items-center gap-1.5 text-white/60">
                  <MapPin size={10} className="text-white/40 shrink-0" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">{item.ciudad}</span>
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Controles navegación */}
      <div className="absolute top-1/2 -translate-y-1/2 w-full px-3 flex justify-between z-20 opacity-0 group-hover:opacity-100 transition-all duration-300">
        <button onClick={prev} className="w-10 h-10 rounded-2xl bg-black/40 hover:bg-white hover:text-black backdrop-blur-xl flex items-center justify-center text-white transition-all hover:scale-110 active:scale-90 border border-white/10 hover:border-white shadow-2xl">
          <ChevronLeft size={20} />
        </button>
        <button onClick={next} className="w-10 h-10 rounded-2xl bg-black/40 hover:bg-white hover:text-black backdrop-blur-xl flex items-center justify-center text-white transition-all hover:scale-110 active:scale-90 border border-white/10 hover:border-white shadow-2xl">
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}
