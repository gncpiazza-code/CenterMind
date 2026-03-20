import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ImageOff, Clock, MapPin, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { resolveImageUrl, type UltimaEvaluada } from '@/lib/api';

interface HeroCarouselProps {
  items: UltimaEvaluada[];
}

export function HeroCarousel({ items }: HeroCarouselProps) {
  const [ci, setCi] = useState(0);
  const [imgErr, setImgErr] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Auto-play
  useEffect(() => {
    if (items.length <= 1) return;
    const timer = setInterval(() => {
      setCi(curr => (curr + 1) % items.length);
      setImgErr(false);
      setLoaded(false);
    }, 8000);
    return () => clearInterval(timer);
  }, [items.length]);

  if (items.length === 0) return (
    <Card className="h-full flex flex-col items-center justify-center bg-slate-50 border-slate-200 border-dashed border-2 shadow-inner min-h-[500px]">
      <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6">
        <ImageOff size={32} className="text-slate-300" />
      </div>
      <span className="text-slate-500 font-bold uppercase tracking-widest text-xs">No hay actividad reciente en este filtro</span>
    </Card>
  );

  const item = items[ci];
  const imgSrc = resolveImageUrl(item.drive_link, item.id_exhibicion);

  const prev = () => { setCi((i) => (i === 0 ? items.length - 1 : i - 1)); setImgErr(false); setLoaded(false); };
  const next = () => { setCi((i) => (i === items.length - 1 ? 0 : i + 1)); setImgErr(false); setLoaded(false); };

  const getStatusColor = (e: string) => {
    if (e === "Destacado") return "from-purple-600 to-fuchsia-600";
    if (e === "Rechazado") return "from-red-600 to-rose-600";
    return "from-emerald-600 to-teal-500";
  };

  const formatTimeText = (dateInput?: string) => {
    if (!dateInput) return 'Reciente';
    const date = new Date(dateInput);
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return 'hace un momento';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `hace ${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `hace ${hours}h`;
    const days = Math.floor(hours / 24);
    return `hace ${days}d`;
  };

  return (
    <div className="relative w-full h-full rounded-[2.5rem] overflow-hidden shadow-2xl ring-1 ring-slate-200/50 flex flex-col bg-slate-950 group">

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
            <img
              src={imgSrc}
              alt="Exhibicion"
              className="w-full h-full object-cover opacity-70 group-hover:opacity-60 transition-opacity duration-700"
              onLoad={() => setLoaded(true)}
              onError={() => setImgErr(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-slate-900">
              <ImageOff size={40} className="text-slate-800" />
            </div>
          )}
          {/* Gradiente Oscuro */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
        </motion.div>
      </AnimatePresence>

      {/* DETALLES DE EXHIBICION */}
      <div className="absolute bottom-0 left-0 right-0 p-8 md:p-12 z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={`info-${ci}`}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="flex items-center gap-3 mb-6">
              <span className={`px-5 py-2 rounded-full text-[10px] font-black tracking-[0.2em] text-white uppercase shadow-lg bg-gradient-to-r ${getStatusColor(item.estado)}`}>
                {item.estado}
              </span>
              <span className="text-white/60 text-xs font-bold flex items-center gap-1.5 backdrop-blur-md bg-white/5 py-1.5 px-3 rounded-full border border-white/10 uppercase tracking-widest">
                <Clock size={12} className="text-white/40" />
                {formatTimeText(item.fecha_evaluacion || item.timestamp_subida)}
              </span>
            </div>

            <h2 className="text-4xl md:text-6xl font-black text-white leading-[1.1] mb-4 drop-shadow-2xl tracking-tighter">
              {item.vendedor}
            </h2>
            
            <div className="flex flex-wrap items-center gap-3 md:gap-4">
              <div className="flex items-center gap-2.5 bg-white/10 backdrop-blur-xl px-4 py-2.5 rounded-2xl border border-white/20 shadow-xl group/badge hover:bg-white/20 transition-all cursor-default">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-400 group-hover/badge:scale-125 transition-transform" />
                <span className="text-white font-black text-sm uppercase tracking-wider">
                  Cliente #{item.nro_cliente}
                </span>
                <span className="text-white/40 text-xs font-bold">
                  {item.tipo_pdv}
                </span>
              </div>
              
              {item.ciudad && (
                <div className="flex items-center gap-2 text-white/50 text-xs font-black uppercase tracking-[0.15em] ml-2">
                  <MapPin size={14} className="text-white/30" /> {item.ciudad}
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* CONTROLES */}
      <div className="absolute top-1/2 -translate-y-1/2 w-full px-6 flex justify-between z-20 opacity-0 group-hover:opacity-100 transition-all duration-300">
        <button onClick={prev} className="w-14 h-14 rounded-2xl bg-black/40 hover:bg-white hover:text-black backdrop-blur-xl flex items-center justify-center text-white transition-all hover:scale-110 active:scale-90 border border-white/10 hover:border-white shadow-2xl">
          <ChevronLeft size={28} />
        </button>
        <button onClick={next} className="w-14 h-14 rounded-2xl bg-black/40 hover:bg-white hover:text-black backdrop-blur-xl flex items-center justify-center text-white transition-all hover:scale-110 active:scale-90 border border-white/10 hover:border-white shadow-2xl">
          <ChevronRight size={28} />
        </button>
      </div>

      {/* INDICADORES */}
      <div className="absolute top-8 right-10 flex gap-2 z-20">
        {items.map((_, i) => (
          <button
            key={i}
            onClick={() => setCi(i)}
            className={`h-1 rounded-full transition-all duration-500 shadow-sm ${i === ci ? 'w-10 bg-white' : 'w-2 bg-white/20 hover:bg-white/40'}`} 
          />
        ))}
      </div>
    </div>
  );
}
