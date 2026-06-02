"use client";

import { useCallback, useEffect, useMemo } from "react";
import type { GaleriaMapaPin } from "@/lib/api";
import { sortMapPinsForNav } from "@/lib/galeria-pdv-insights";

export interface GaleriaViewerNavTarget {
  idCliente: number;
  nombreCliente: string;
  lat: number;
  lng: number;
  idClienteErp?: string | null;
}

interface UseGaleriaViewerNavParams {
  open: boolean;
  mapPins: GaleriaMapaPin[];
  activeClienteId: number | null;
  onSelectPdv: (target: GaleriaViewerNavTarget) => void;
  onPhotoPrev: () => void;
  onPhotoNext: () => void;
}

export function useGaleriaViewerNav({
  open,
  mapPins,
  activeClienteId,
  onSelectPdv,
  onPhotoPrev,
  onPhotoNext,
}: UseGaleriaViewerNavParams) {
  const orderedPins = useMemo(() => sortMapPinsForNav(mapPins), [mapPins]);

  const activeIndex = useMemo(() => {
    if (activeClienteId == null) return -1;
    const idx = orderedPins.findIndex((p) => p.id_cliente === activeClienteId);
    return idx;
  }, [orderedPins, activeClienteId]);

  const resolvedIndex = activeIndex >= 0 ? activeIndex : orderedPins.length > 0 ? 0 : -1;

  const goPdv = useCallback(
    (delta: -1 | 1) => {
      if (orderedPins.length === 0) return;
      let idx = activeIndex;
      if (idx < 0 && activeClienteId != null) {
        idx = orderedPins.findIndex((p) => p.id_cliente === activeClienteId);
      }
      if (idx < 0) idx = 0;
      const next = idx + delta;
      if (next < 0 || next >= orderedPins.length) return;
      const pin = orderedPins[next];
      onSelectPdv({
        idCliente: pin.id_cliente,
        nombreCliente: pin.nombre_cliente,
        lat: pin.latitud,
        lng: pin.longitud,
        idClienteErp: pin.id_cliente_erp,
      });
    },
    [orderedPins, activeIndex, activeClienteId, onSelectPdv],
  );

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          e.stopPropagation();
          onPhotoPrev();
          break;
        case "ArrowRight":
          e.preventDefault();
          e.stopPropagation();
          onPhotoNext();
          break;
        case "ArrowUp":
          e.preventDefault();
          e.stopPropagation();
          goPdv(-1);
          break;
        case "ArrowDown":
          e.preventDefault();
          e.stopPropagation();
          goPdv(1);
          break;
        case "Escape":
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [open, onPhotoPrev, onPhotoNext, goPdv]);

  return {
    orderedPins,
    activeIndex,
    totalPdvs: orderedPins.length,
    goPdvPrev: () => goPdv(-1),
    goPdvNext: () => goPdv(1),
    canGoPdvPrev: resolvedIndex > 0,
    canGoPdvNext: resolvedIndex >= 0 && resolvedIndex < orderedPins.length - 1,
  };
}
