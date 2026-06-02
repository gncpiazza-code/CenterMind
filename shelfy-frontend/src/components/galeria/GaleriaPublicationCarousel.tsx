"use client";

import { useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GaleriaPublicacion } from "@/lib/galeria-publicaciones";

interface GaleriaPublicationCarouselProps {
  publicaciones: GaleriaPublicacion[];
  onPublicacionChange?: (idx: number, pub: GaleriaPublicacion) => void;
}

const variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? "100%" : "-100%",
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? "-100%" : "100%",
    opacity: 0,
  }),
};

export function GaleriaPublicationCarousel({
  publicaciones,
  onPublicacionChange,
}: GaleriaPublicationCarouselProps) {
  const [pubIdx, setPubIdx] = useState(0);
  const [fotoIdx, setFotoIdx] = useState(0);
  const [direction, setDirection] = useState(0);

  const pub = publicaciones[pubIdx];
  const totalPubs = publicaciones.length;
  const totalFotos = pub?.fotos.length ?? 0;

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

  if (!pub) {
    return (
      <div className="relative w-full h-full bg-black flex items-center justify-center">
        <p className="text-white/60 text-sm">Sin publicaciones</p>
      </div>
    );
  }

  const currentFoto = pub.fotos[fotoIdx];
  const prevPub = pubIdx > 0 ? publicaciones[pubIdx - 1] : null;
  const nextPub = pubIdx < totalPubs - 1 ? publicaciones[pubIdx + 1] : null;

  return (
    <div className="relative w-full h-full bg-black flex flex-col select-none">
      {/* Progress bar – fotos del día actual */}
      <div className="flex gap-0.5 px-4 pt-3 pb-2 z-10 shrink-0">
        {pub.fotos.map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-0.5 flex-1 rounded-full transition-all duration-300",
              i === fotoIdx ? "bg-white" : "bg-white/35",
            )}
          />
        ))}
      </div>

      {/* Área principal */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        {/* Peek blur — publicación anterior */}
        {prevPub && prevPub.fotos[0] && (
          <div
            className="absolute left-0 w-[15%] h-full pointer-events-none z-0"
            style={{ filter: "blur(8px)", opacity: 0.55 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={prevPub.fotos[0].url_foto}
              alt=""
              className="w-full h-full object-cover scale-[0.85] origin-right"
            />
          </div>
        )}

        {/* Imagen actual */}
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={`${pubIdx}-${fotoIdx}`}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 260, damping: 28, mass: 0.9 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            {currentFoto?.url_foto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentFoto.url_foto}
                alt={`Exhibición ${pub.dia_ar}`}
                className="w-full h-full object-contain"
                draggable={false}
              />
            ) : (
              <div className="flex flex-col items-center gap-2">
                <p className="text-white/50 text-sm">Sin imagen</p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Peek blur — publicación siguiente */}
        {nextPub && nextPub.fotos[0] && (
          <div
            className="absolute right-0 w-[15%] h-full pointer-events-none z-0"
            style={{ filter: "blur(8px)", opacity: 0.55 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={nextPub.fotos[0].url_foto}
              alt=""
              className="w-full h-full object-cover scale-[0.85] origin-left"
            />
          </div>
        )}

        {/* Zonas tap para navegar fotos (izq/der) */}
        <button
          type="button"
          className="absolute left-0 top-0 w-1/3 h-full z-10 cursor-pointer"
          aria-label="Foto anterior"
          onClick={() => {
            if (fotoIdx > 0) {
              goToFoto(fotoIdx - 1);
            } else {
              goToPub(pubIdx - 1);
            }
          }}
        />
        <button
          type="button"
          className="absolute right-0 top-0 w-1/3 h-full z-10 cursor-pointer"
          aria-label="Foto siguiente"
          onClick={() => {
            if (fotoIdx < totalFotos - 1) {
              goToFoto(fotoIdx + 1);
            } else {
              goToPub(pubIdx + 1);
            }
          }}
        />

        {/* Flechas de navegación entre publicaciones */}
        {pubIdx > 0 && (
          <button
            type="button"
            onClick={() => goToPub(pubIdx - 1)}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/70 transition-colors"
            aria-label="Publicación anterior"
          >
            <ChevronLeft size={20} />
          </button>
        )}
        {pubIdx < totalPubs - 1 && (
          <button
            type="button"
            onClick={() => goToPub(pubIdx + 1)}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/70 transition-colors"
            aria-label="Publicación siguiente"
          >
            <ChevronRight size={20} />
          </button>
        )}
      </div>

      {/* Dots de fotos + indicador de publicación */}
      <div className="flex flex-col items-center gap-1.5 py-3 shrink-0">
        {totalFotos > 1 && (
          <div className="flex gap-1.5 justify-center">
            {pub.fotos.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goToFoto(i)}
                className={cn(
                  "rounded-full bg-white transition-all duration-200",
                  i === fotoIdx ? "w-2 h-2" : "w-1.5 h-1.5 opacity-40",
                )}
                aria-label={`Foto ${i + 1}`}
              />
            ))}
          </div>
        )}
        {totalPubs > 1 && (
          <p className="text-white/50 text-[10px] font-semibold">
            Visita {pubIdx + 1} de {totalPubs} · {pub.dia_ar}
          </p>
        )}
      </div>
    </div>
  );
}
