"use client";

/**
 * ExhibicionesTimelineDialog — thin wrapper deprecado.
 *
 * Redirige al viewer unificado GaleriaExhibicionViewer.
 * Mantiene las mismas props para no romper imports existentes.
 */

import type { GaleriaTimelineItem } from "@/lib/api";
import { GaleriaExhibicionViewer } from "./GaleriaExhibicionViewer";

interface Props {
  idClientePdv: number | null;
  distId: number;
  idVendedor?: number | null;
  fechaDesde?: string;
  fechaHasta?: string;
  nombreCliente: string;
  /** @deprecated no usado en el nuevo viewer */
  motivoNoReferencia?: string | null;
  /** @deprecated no usado en el nuevo viewer */
  directItems?: GaleriaTimelineItem[];
  /** @deprecated no usado en el nuevo viewer */
  pageSize?: number;
  open: boolean;
  onClose: () => void;
  canReevaluarCompania?: boolean;
}

export function ExhibicionesTimelineDialog({
  idClientePdv,
  distId,
  idVendedor,
  fechaDesde,
  fechaHasta,
  nombreCliente,
  open,
  onClose,
  canReevaluarCompania,
}: Props) {
  return (
    <GaleriaExhibicionViewer
      open={open}
      onClose={onClose}
      idCliente={idClientePdv}
      nombreCliente={nombreCliente}
      distId={distId}
      idVendedor={idVendedor}
      canReevaluarCompania={canReevaluarCompania}
      fechaDesde={fechaDesde}
      fechaHasta={fechaHasta}
    />
  );
}
