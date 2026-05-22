"use client";

import { Rocket, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { Objetivo } from "@/lib/api";

interface LanzarObjetivoDialogProps {
  objetivo: Objetivo | null;
  open: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function formatFecha(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return iso;
  }
}

const TIPO_LABELS: Record<string, string> = {
  conversion_estado: "Activación",
  cobranza: "Cobranza",
  ruteo_alteo: "Alteo",
  exhibicion: "Exhibición",
  ruteo: "Cambio de ruta",
  compradores: "Compradores",
};

export function LanzarObjetivoDialog({
  objetivo,
  open,
  loading,
  onConfirm,
  onCancel,
}: LanzarObjetivoDialogProps) {
  if (!objetivo) return null;

  const inicioOriginal = formatFecha(objetivo.fecha_inicio);
  const tipoLabel = TIPO_LABELS[objetivo.tipo] ?? objetivo.tipo;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Rocket className="w-4 h-4 text-violet-600" />
            ¿Lanzar este objetivo ahora?
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-1.5 text-sm text-left pt-1">
              <p>
                <span className="font-medium text-[var(--shelfy-text)]">Vendedor:</span>{" "}
                {objetivo.nombre_vendedor ?? "—"}
              </p>
              <p>
                <span className="font-medium text-[var(--shelfy-text)]">Tipo:</span>{" "}
                {tipoLabel}
              </p>
              <p>
                <span className="font-medium text-[var(--shelfy-text)]">Inicio programado:</span>{" "}
                {inicioOriginal}
              </p>
              <p className="mt-2 text-amber-700 font-medium text-xs rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                Se enviará un mensaje al grupo de Telegram del vendedor de forma inmediata.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            autoFocus
            className="flex-1 py-2 rounded-lg border border-[var(--shelfy-border)] text-sm text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Rocket className="w-3.5 h-3.5" />
            )}
            Confirmar y enviar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
