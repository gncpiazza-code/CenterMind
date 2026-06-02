"use client";

import { useState, useCallback, useEffect, forwardRef, useImperativeHandle } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GaleriaPublicacion } from "@/lib/galeria-publicaciones";
import { formatGaleriaFechaVisita } from "@/lib/fecha-ar";

export interface GaleriaCarouselHandle {
  photoPrev: () => void;
  photoNext: () => void;
}

interface GaleriaPublicationCarouselProps {
  publicaciones: GaleriaPublicacion[];
  onPublicacionChange?: (idx: number, pub: GaleriaPublicacion) => void;
  /** Índice controlado desde panel historial */
  activePubIdx?: number;
}

const ESTADO_CHIP: Record<string, string> = {
  Aprobada: "bg-emerald-500/90 text-white border-0",
  Aprobado: "bg-emerald-500/90 text-white border-0",
  Rechazada: "bg-red-500/90 text-white border-0",
  Rechazado: "bg-red-500/90 text-white border-0",
  Destacada: "bg-amber-500/90 text-white border-0",
  Destacado: "bg-amber-500/90 text-white border-0",
  Pendiente: "bg-white/20 text-white border-white/30",
};

const variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? "18%" : "-18%",
    opacity: 0,
    scale: 0.97,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? "-12%" : "12%",
    opacity: 0,
    scale: 0.98,
  }),
};

export const GaleriaPublicationCarousel = forwardRef<
  GaleriaCarouselHandle,
  GaleriaPublicationCarouselProps
>(function GaleriaPublicationCarousel(
  { publicaciones, onPublicacionChange, activePubIdx },
  ref,
) {
  const [pubIdx, setPubIdx] = useState(0);
  const [fotoIdx, setFotoIdx] = useState(0);
  const [direction, setDirection] = useState(0);

  useEffect(() => {
    if (typeof activePubIdx !== "number") return;
    if (activePubIdx < 0 || activePubIdx >= publicaciones.length) return;
    if (activePubIdx === pubIdx) return;
    setDirection(activePubIdx > pubIdx ? 1 : -1);
    setPubIdx(activePubIdx);
    setFotoIdx(0);
  }, [activePubIdx, publicaciones.length, pubIdx]);

  const pub = publicaciones[pubIdx];
  const totalPubs = publicaciones.length;
  const totalFotos = pub?.fotos.length ?? 0;
  const currentFoto = pub?.fotos[fotoIdx];
  const visitaFecha = pub
    ? formatGaleriaFechaVisita(pub.dia_ar, currentFoto?.timestamp_subida)
    : { fecha: "—", relativo: "" };

  const goToPub = useCallback(
    (nextIdx: number) => {
      if (nextIdx < 0 || nextIdx >= totalPubs) return;
      const dir = nextIdx > pubIdx ? 1 : -1;
      setDirection(dir);
      setPubIdx(nextIdx);
      setFotoIdx(0);
      if (onPublicacionChange) {
        onPublicacionChange(nextIdx, publicaciones[nextIdx]);
      }
    },
    [pubIdx, totalPubs, publicaciones, onPublicacionChange],
  );

  const goToFoto = useCallback(
    (nextFoto: number) => {
      if (nextFoto < 0 || nextFoto >= totalFotos) return;
      setFotoIdx(nextFoto);
    },
    [totalFotos],
  );

  const photoPrev = useCallback(() => {
    if (fotoIdx > 0) {
      goToFoto(fotoIdx - 1);
    } else {
      goToPub(pubIdx - 1);
    }
  }, [fotoIdx, pubIdx, goToFoto, goToPub]);

  const photoNext = useCallback(() => {
    if (fotoIdx < totalFotos - 1) {
      goToFoto(fotoIdx + 1);
    } else {
      goToPub(pubIdx + 1);
    }
  }, [fotoIdx, totalFotos, pubIdx, goToFoto, goToPub]);

  useImperativeHandle(ref, () => ({ photoPrev, photoNext }), [photoPrev, photoNext]);

  if (!pub) {
    return (
      <div className="relative w-full h-full flex items-center justify-center">
        <p className="text-white/60 text-sm">Sin publicaciones</p>
      </div>
    );
  }

  const prevPub = pubIdx > 0 ? publicaciones[pubIdx - 1] : null;
  const nextPub = pubIdx < totalPubs - 1 ? publicaciones[pubIdx + 1] : null;

  return (
    <div className="relative w-full h-full flex flex-col select-none">
      {/* Barras de progreso estilo stories */}
      <div className="flex gap-1 px-3 pt-3 pb-1 z-10 shrink-0">
        {pub.fotos.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => goToFoto(i)}
            className="h-1 flex-1 rounded-full overflow-hidden bg-white/25 hover:bg-white/35 transition-colors"
            aria-label={`Foto ${i + 1} de ${totalFotos}`}
          >
            <div
              className={cn(
                "h-full rounded-full bg-white transition-all duration-500 ease-out",
                i < fotoIdx ? "w-full" : i === fotoIdx ? "w-full animate-pulse" : "w-0",
              )}
            />
          </button>
        ))}
      </div>

      {/* Meta visita */}
      <div className="flex items-center justify-between px-4 pb-2 z-10 shrink-0">
        <div className="flex items-center gap-2">
          <Badge
            className={cn(
              "text-[10px] font-bold shadow-sm",
              ESTADO_CHIP[pub.estado_dia] ?? ESTADO_CHIP.Pendiente,
            )}
          >
            {pub.estado_dia}
          </Badge>
          <span className="text-white/80 text-xs font-semibold drop-shadow tabular-nums">
            {visitaFecha.fecha}
            {visitaFecha.relativo ? (
              <span className="text-white/55 font-medium"> · {visitaFecha.relativo}</span>
            ) : null}
          </span>
        </div>
        {totalPubs > 1 && (
          <span className="text-[10px] font-bold text-white/50 tabular-nums">
            {pubIdx + 1}/{totalPubs}
          </span>
        )}
      </div>

      {/* Área principal */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden mx-1 rounded-xl">
        <div
          className="pointer-events-none absolute inset-0 z-[5] rounded-xl"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.35) 100%)",
          }}
        />

        {prevPub && prevPub.fotos[0] && (
          <div
            className="absolute left-0 w-[18%] h-[85%] top-[7.5%] pointer-events-none z-0 rounded-r-lg overflow-hidden opacity-40"
            style={{ filter: "blur(10px)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={prevPub.fotos[0].url_foto}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={`${pubIdx}-${fotoIdx}`}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 320, damping: 32, mass: 0.85 }}
            className="absolute inset-2 flex items-center justify-center z-[6]"
          >
            {currentFoto?.url_foto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentFoto.url_foto}
                alt={`Exhibición ${pub.dia_ar}`}
                className="max-w-full max-h-full w-auto h-auto object-contain rounded-lg shadow-2xl ring-1 ring-white/10"
                draggable={false}
              />
            ) : (
              <p className="text-white/50 text-sm">Sin imagen</p>
            )}
          </motion.div>
        </AnimatePresence>

        {nextPub && nextPub.fotos[0] && (
          <div
            className="absolute right-0 w-[18%] h-[85%] top-[7.5%] pointer-events-none z-0 rounded-l-lg overflow-hidden opacity-40"
            style={{ filter: "blur(10px)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={nextPub.fotos[0].url_foto}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <button
          type="button"
          className="absolute left-0 top-0 w-[38%] h-full z-10 cursor-pointer"
          aria-label="Foto anterior"
          onClick={photoPrev}
        />
        <button
          type="button"
          className="absolute right-0 top-0 w-[38%] h-full z-10 cursor-pointer"
          aria-label="Foto siguiente"
          onClick={photoNext}
        />

        {pubIdx > 0 && (
          <button
            type="button"
            onClick={() => goToPub(pubIdx - 1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/25 text-white flex items-center justify-center hover:bg-white/20 transition-all shadow-lg"
            aria-label="Visita anterior"
          >
            <ChevronLeft size={22} />
          </button>
        )}
        {pubIdx < totalPubs - 1 && (
          <button
            type="button"
            onClick={() => goToPub(pubIdx + 1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/25 text-white flex items-center justify-center hover:bg-white/20 transition-all shadow-lg"
            aria-label="Visita siguiente"
          >
            <ChevronRight size={22} />
          </button>
        )}
      </div>

      <div className="flex flex-col items-center gap-2 py-4 shrink-0">
        {totalFotos > 1 && (
          <div className="flex gap-2 justify-center">
            {pub.fotos.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goToFoto(i)}
                className={cn(
                  "rounded-full transition-all duration-300",
                  i === fotoIdx
                    ? "w-2.5 h-2.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)]"
                    : "w-1.5 h-1.5 bg-white/35 hover:bg-white/55",
                )}
                aria-label={`Foto ${i + 1}`}
              />
            ))}
          </div>
        )}
        <p className="text-white/45 text-[10px] font-medium tracking-wide">
          Tocá los lados · ← → fotos
          {totalPubs > 1 ? " · visitas con flechas" : ""}
        </p>
      </div>
    </div>
  );
});
