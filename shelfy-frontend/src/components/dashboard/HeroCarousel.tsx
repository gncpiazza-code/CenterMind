"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ImageOff, Clock, MapPin, ChevronLeft, ChevronRight, Activity, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/skeleton';
import { resolveImageUrl, type UltimaEvaluada } from '@/lib/api';
import Link from 'next/link';

interface HeroCarouselProps {
  items: UltimaEvaluada[];
}

const AUTOPLAY_MS = 8000;

function formatTimeText(dateInput?: string) {
  if (!dateInput) return 'Reciente';
  const date = new Date(dateInput);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'hace un momento';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours}h`;
  return `hace ${Math.floor(hours / 24)}d`;
}

function getStatusColor(estado: string) {
  if (estado === "Destacado") return "from-purple-600 to-fuchsia-600";
  if (estado === "Rechazado")  return "from-red-600 to-rose-600";
  return "from-emerald-600 to-teal-500";
}

export function HeroCarousel({ items }: HeroCarouselProps) {
  const [ci, setCi] = useState(0);
  const [imgErr, setImgErr] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Mejora #10: clave de progreso
  const [progressKey, setProgressKey] = useState(0);
  // Mejora #11: errores de miniaturas indexados
  const [thumbErrors, setThumbErrors] = useState<Record<number, boolean>>({});

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function resetTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (items.length <= 1) return;
    timerRef.current = setInterval(() => {
      setCi(curr => (curr + 1) % items.length);
      setImgErr(false);
      setLoaded(false);
      setProgressKey(k => k + 1);
    }, AUTOPLAY_MS);
  }

  useEffect(() => {
    resetTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [items.length]);

  function goTo(idx: number) {
    setCi(idx);
    setImgErr(false);
    setLoaded(false);
    setProgressKey(k => k + 1);
    resetTimer();
  }
  const prev = () => goTo(ci === 0 ? items.length - 1 : ci - 1);
  const next = () => goTo(ci === items.length - 1 ? 0 : ci + 1);

  // Mejora #13: Empty state mejorado
  if (items.length === 0) return (
    <Card className="h-full flex flex-col items-center justify-center bg-slate-50 border-slate-200 border-dashed border-2 shadow-inner min-h-[500px] gap-4">
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

  const item   = items[ci];
  const imgSrc = resolveImageUrl(item.drive_link, item.id_exhibicion);

  return (
    <div className="relative w-full h-full rounded-[2.5rem] overflow-hidden shadow-2xl ring-1 ring-slate-200/50 flex flex-col bg-slate-950 group">

      {/* Mejora #10: Barra de progreso autoplay — superior */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-white/20 z-30">
        <div
          key={progressKey}
          className="h-0.5 bg-white"
          style={{ width: '0%', animation: `shelfy-progress ${AUTOPLAY_MS}ms linear forwards` }}
        />
      </div>
      <style>{`@keyframes shelfy-progress { from { width: 0% } to { width: 100% } }`}</style>

      {/* IMAGEN DE FONDO & CONTENIDO */}
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
              {/* Mejora #20: hover scale aumentado a 1.05 */}
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
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent z-10 pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent z-10 pointer-events-none" />
        </motion.div>
      </AnimatePresence>

      {/* DETALLES */}
      <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10 z-20">
        <AnimatePresence mode="wait">
          <motion.div
            key={`info-${ci}`}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="flex items-center gap-3 mb-4">
              <span className={`px-5 py-1.5 rounded-full text-[10px] font-black tracking-[0.2em] text-white uppercase shadow-lg bg-gradient-to-r ${getStatusColor(item.estado)}`}>
                {item.estado}
              </span>
              <span className="text-white/60 text-xs font-bold flex items-center gap-1.5 backdrop-blur-md bg-white/5 py-1.5 px-3 rounded-full border border-white/10 uppercase tracking-widest">
                <Clock size={12} className="text-white/40" />
                {formatTimeText(item.fecha_evaluacion || item.timestamp_subida)}
              </span>
            </div>

            <h2 className="text-3xl md:text-5xl font-black text-white leading-[1.1] mb-3 drop-shadow-2xl tracking-tighter line-clamp-1">
              {item.vendedor}
            </h2>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2.5 bg-white/10 backdrop-blur-xl px-4 py-2 rounded-2xl border border-white/20 shadow-xl hover:bg-white/20 transition-all cursor-default">
                <div className="w-2 h-2 rounded-full bg-blue-400" />
                <span className="text-white font-black text-sm uppercase tracking-wider">
                  Cliente #{item.nro_cliente}
                </span>
                <span className="text-white/40 text-xs font-bold">{item.tipo_pdv}</span>
              </div>

              {item.ciudad && (
                <div className="flex items-center gap-2 text-white/50 text-xs font-black uppercase tracking-[0.15em]">
                  <MapPin size={13} className="text-white/30" /> {item.ciudad}
                </div>
              )}

              {/* Mejora #26: CTA "Ver en Visor" por slide */}
              <Link
                href={`/visor?exhibicion=${item.id_exhibicion}`}
                className="ml-auto flex items-center gap-1.5 bg-white/15 hover:bg-white/25 backdrop-blur-xl px-4 py-2 rounded-2xl border border-white/20 text-white text-[10px] font-black uppercase tracking-widest transition-all group/link"
              >
                Ver en Visor
                <ExternalLink size={11} className="opacity-60 group-hover/link:opacity-100 transition-opacity" />
              </Link>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* CONTROLES de navegación */}
      <div className="absolute top-1/2 -translate-y-1/2 w-full px-4 flex justify-between z-20 opacity-0 group-hover:opacity-100 transition-all duration-300">
        <button onClick={prev} className="w-12 h-12 rounded-2xl bg-black/40 hover:bg-white hover:text-black backdrop-blur-xl flex items-center justify-center text-white transition-all hover:scale-110 active:scale-90 border border-white/10 hover:border-white shadow-2xl">
          <ChevronLeft size={24} />
        </button>
        <button onClick={next} className="w-12 h-12 rounded-2xl bg-black/40 hover:bg-white hover:text-black backdrop-blur-xl flex items-center justify-center text-white transition-all hover:scale-110 active:scale-90 border border-white/10 hover:border-white shadow-2xl">
          <ChevronRight size={24} />
        </button>
      </div>

      {/* Mejora #11: Tira de miniaturas + Mejora #10: dots movidos aquí */}
      {items.length > 1 && (
        <div className="absolute bottom-[180px] md:bottom-[200px] left-0 right-0 px-6 z-20 flex items-center gap-2 overflow-x-auto scrollbar-none">
          {items.map((thumb, i) => {
            const thumbSrc = resolveImageUrl(thumb.drive_link, thumb.id_exhibicion);
            return (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={`relative shrink-0 rounded-xl overflow-hidden border-2 transition-all duration-300 ${
                  i === ci
                    ? 'w-14 h-14 border-white shadow-lg scale-110'
                    : 'w-9 h-9 border-white/20 opacity-50 hover:opacity-80 hover:scale-105'
                }`}
              >
                {!thumbErrors[i] && thumbSrc ? (
                  <img
                    src={thumbSrc}
                    alt={`thumb-${i}`}
                    className="w-full h-full object-cover"
                    onError={() => setThumbErrors(prev => ({ ...prev, [i]: true }))}
                  />
                ) : (
                  <div className="w-full h-full bg-slate-800 flex items-center justify-center">
                    <span className="text-[8px] text-white/40 font-black">{i + 1}</span>
                  </div>
                )}
                {i === ci && (
                  <div className="absolute inset-0 bg-white/10 rounded-xl" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
