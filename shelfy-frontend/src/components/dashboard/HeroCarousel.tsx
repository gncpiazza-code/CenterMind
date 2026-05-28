"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ImageOff, MapPin, ChevronLeft, ChevronRight, Activity, Hash, Clock } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/skeleton';
import { resolveImageUrl, type UltimaEvaluada } from '@/lib/api';
import { isUltimaCoherenteConVendedor } from '@/lib/dashboard-ultimas';
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
  return 'bg-amber-500 text-white';
}

function estadoLabel(estado: string): string {
  const e = estado.toLowerCase();
  if (e.includes('destacad')) return 'Destacado';
  if (e.includes('aprobad'))  return 'Aprobado';
  if (e.includes('rechaz'))   return 'Rechazado';
  return 'Pendiente';
}

/** Una diapositiva = imagen + overlay con la misma key (evita texto del slide anterior). */
function HeroSlide({
  item,
  compact,
  progressKey,
}: {
  item: UltimaEvaluada;
  compact?: boolean;
  progressKey: number;
}) {
  const [imgErr, setImgErr] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const imgSrc = resolveImageUrl(item.drive_link, item.id_exhibicion);
  const vendedorErp = (item.vendedor_erp || item.vendedor || "Sin vendedor").trim();
  const pdvNombre = (item.razon_social || "").trim();

  useEffect(() => {
    setImgErr(false);
    setLoaded(false);
  }, [item.id_exhibicion]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="absolute inset-0 flex flex-col"
    >
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-white/20 z-30">
        <div
          key={progressKey}
          className="h-0.5 bg-gradient-to-r from-violet-400 to-fuchsia-400"
          style={{ width: '0%', animation: `shelfy-progress ${AUTOPLAY_MS}ms linear forwards` }}
        />
      </div>

      <div className="absolute inset-0">
        {!imgErr && imgSrc ? (
          <div className="relative w-full h-full overflow-hidden flex items-center justify-center bg-slate-900/50">
            <img src={imgSrc} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30 blur-2xl scale-110" aria-hidden />
            {!loaded && <Skeleton className="absolute inset-0 z-10 rounded-none" />}
            <img
              src={imgSrc}
              alt="Exhibición"
              className="relative z-10 max-w-full max-h-full object-contain shadow-2xl"
              onLoad={() => setLoaded(true)}
              onError={() => setImgErr(true)}
            />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-slate-900">
            <ImageOff size={40} className="text-slate-800" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/55 to-transparent z-10 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-b from-violet-950/25 via-transparent to-transparent z-10 pointer-events-none" />
      </div>

      <div className={cn(
        "absolute bottom-0 left-0 right-0 z-20",
        compact ? "p-3" : "p-5 md:p-7",
      )}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/50 mb-0.5">Vendedor</p>
            <p
              className="text-white font-black text-sm uppercase tracking-tight leading-tight line-clamp-2 break-words"
              title={vendedorErp}
            >
              {vendedorErp}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className={cn(
              "text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg whitespace-nowrap",
              estadoBadgeStyle(item.estado),
            )}>
              {estadoLabel(item.estado)}
            </span>
            <span className="flex items-center gap-1 bg-black/35 backdrop-blur-sm border border-white/10 text-white/75 font-bold text-[9px] uppercase tracking-wide px-2 py-1 rounded-lg whitespace-nowrap">
              <Clock size={9} className="text-white/45 shrink-0" />
              {formatTimeText(item.fecha_evaluacion || item.timestamp_subida)}
            </span>
          </div>
        </div>

        <div className="space-y-1 bg-black/40 backdrop-blur-md rounded-2xl border border-white/15 px-2.5 py-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Hash size={10} className="text-violet-300/70 shrink-0" />
            <span className="text-[9px] font-bold uppercase tracking-wider text-white/55">ID ERP</span>
            <span className="text-white font-black text-xs tabular-nums truncate">
              {(item.nro_cliente || "").trim() || "—"}
            </span>
          </div>
          <p
            className="text-[11px] font-semibold text-white/90 leading-snug line-clamp-2"
            title={pdvNombre || undefined}
          >
            {pdvNombre || "Sin razón social"}
          </p>
          <div className="flex items-center gap-1 text-white/70 min-w-0">
            <MapPin size={10} className="text-violet-300/50 shrink-0" />
            <span className="text-[10px] font-bold uppercase tracking-wide truncate">
              {(item.ciudad || "").trim() || "Sin ciudad"}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function HeroCarousel({ items, compact = false }: HeroCarouselProps) {
  const filtered = items.filter(
    (e) => !/rechaz/i.test(e.estado) && isUltimaCoherenteConVendedor(e),
  );
  const [ci, setCi] = useState(0);
  const [progressKey, setProgressKey] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function resetTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (filtered.length <= 1) return;
    timerRef.current = setInterval(() => {
      setCi((curr) => (curr + 1) % filtered.length);
      setProgressKey((k) => k + 1);
    }, AUTOPLAY_MS);
  }

  useEffect(() => {
    resetTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.length]);

  useEffect(() => {
    if (ci >= filtered.length && filtered.length > 0) {
      setCi(0);
    }
  }, [filtered.length, ci]);

  function goTo(idx: number) {
    setCi(idx);
    setProgressKey((k) => k + 1);
    resetTimer();
  }
  const prev = () => goTo(ci === 0 ? filtered.length - 1 : ci - 1);
  const next = () => goTo(ci === filtered.length - 1 ? 0 : ci + 1);

  if (filtered.length === 0) {
    return (
      <Card className="h-full min-h-0 flex flex-col items-center justify-center bg-gradient-to-br from-violet-50 to-indigo-50 border-violet-200/50 border-dashed border-2 shadow-inner gap-4 rounded-3xl">
        <div className="w-20 h-20 bg-violet-100 rounded-full flex items-center justify-center">
          <Activity size={32} className="text-violet-400 animate-pulse" />
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
  }

  const safeIdx = Math.min(ci, filtered.length - 1);
  const item = filtered[safeIdx];
  const slideKey = `ex-${item.id_exhibicion}`;

  return (
    <div className="relative w-full h-full rounded-3xl overflow-hidden flex flex-col bg-slate-950 group">
      <style>{`@keyframes shelfy-progress { from { width: 0% } to { width: 100% } }`}</style>

      <AnimatePresence mode="wait">
        <HeroSlide
          key={slideKey}
          item={item}
          compact={compact}
          progressKey={progressKey}
        />
      </AnimatePresence>

      <div className="absolute top-1/2 -translate-y-1/2 w-full px-3 flex justify-between z-30 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none">
        <button type="button" onClick={prev} className="pointer-events-auto w-10 h-10 rounded-2xl bg-black/40 hover:bg-white hover:text-black backdrop-blur-xl flex items-center justify-center text-white transition-all hover:scale-110 active:scale-90 border border-white/10 hover:border-white shadow-2xl">
          <ChevronLeft size={20} />
        </button>
        <button type="button" onClick={next} className="pointer-events-auto w-10 h-10 rounded-2xl bg-black/40 hover:bg-white hover:text-black backdrop-blur-xl flex items-center justify-center text-white transition-all hover:scale-110 active:scale-90 border border-white/10 hover:border-white shadow-2xl">
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}
