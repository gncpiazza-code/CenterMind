"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { GaleriaMapaPin } from "@/lib/api";
import {
  galeriaKeys,
  prefetchGaleriaTimeline,
  prefetchGaleriaPdvDetalle,
} from "@/lib/galeria-queries";

/** Prefetch timelines de los primeros pins y vecinos al cargar mapa. */
export function useGaleriaMapPrefetch(
  pins: GaleriaMapaPin[],
  opts: {
    distId: number;
    vendedorId: number;
    desde?: string;
    hasta?: string;
    activeClienteId?: number | null;
    enabled?: boolean;
  },
) {
  const qc = useQueryClient();
  const { distId, vendedorId, desde, hasta, activeClienteId, enabled = true } = opts;

  useEffect(() => {
    if (!enabled || pins.length === 0) return;

    const priorityIds = new Set<number>();
    if (activeClienteId != null) {
      priorityIds.add(activeClienteId);
      const idx = pins.findIndex((p) => p.id_cliente === activeClienteId);
      if (idx >= 0) {
        if (idx > 0) priorityIds.add(pins[idx - 1].id_cliente);
        if (idx < pins.length - 1) priorityIds.add(pins[idx + 1].id_cliente);
      }
    }
    pins.slice(0, 8).forEach((p) => priorityIds.add(p.id_cliente));

    priorityIds.forEach((idCliente) => {
      const pin = pins.find((p) => p.id_cliente === idCliente);
      void prefetchGaleriaTimeline(qc, {
        distId,
        idCliente,
        idVendedor: vendedorId,
        desde,
        hasta,
      });
      if (pin?.id_cliente_erp) {
        void prefetchGaleriaPdvDetalle(qc, distId, pin.id_cliente_erp, { desde, hasta });
      }
    });
  }, [pins, distId, vendedorId, desde, hasta, activeClienteId, enabled, qc]);
}

export function prefetchGaleriaOnPinHover(
  qc: ReturnType<typeof useQueryClient>,
  pin: GaleriaMapaPin,
  opts: { distId: number; vendedorId: number; desde?: string; hasta?: string },
) {
  void prefetchGaleriaTimeline(qc, {
    distId: opts.distId,
    idCliente: pin.id_cliente,
    idVendedor: opts.vendedorId,
    desde: opts.desde,
    hasta: opts.hasta,
  });
  if (pin.id_cliente_erp) {
    void prefetchGaleriaPdvDetalle(qc, opts.distId, pin.id_cliente_erp, {
      desde: opts.desde,
      hasta: opts.hasta,
    });
  }
}
