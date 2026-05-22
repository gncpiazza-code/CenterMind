"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Flame, AlertTriangle } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { SlideToConfirm } from "./SlideToConfirm";
import { reevaluarExhibicionCompania, type EstadoCompania } from "@/lib/api";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  idExhibicion: number;
  estadoActual: string;
  distId: number;
  onSuccess?: () => void;
}

const ESTADO_OPTIONS: { value: EstadoCompania; label: string; icon: React.ElementType; color: string; bg: string; border: string }[] = [
  { value: "Aprobada",  label: "Aprobada",  icon: CheckCircle2, color: "text-green-700",  bg: "bg-green-50",  border: "border-green-300" },
  { value: "Destacada", label: "Destacada", icon: Flame,        color: "text-amber-700", bg: "bg-amber-50",  border: "border-amber-300" },
  { value: "Rechazada", label: "Rechazada", icon: XCircle,      color: "text-red-700",   bg: "bg-red-50",    border: "border-red-300" },
];

const MIN_MOTIVO = 20;

export function ReevaluarCompaniaSheet({
  open,
  onClose,
  idExhibicion,
  estadoActual,
  distId,
  onSuccess,
}: Props) {
  const queryClient = useQueryClient();
  const [selectedEstado, setSelectedEstado] = useState<EstadoCompania | null>(null);
  const [motivo, setMotivo] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const motivoValido = motivo.trim().length >= MIN_MOTIVO;
  const canConfirm = !!selectedEstado && motivoValido;

  const mutation = useMutation({
    mutationFn: () =>
      reevaluarExhibicionCompania({
        id_exhibicion: idExhibicion,
        estado_nuevo: selectedEstado!,
        motivo: motivo.trim(),
      }),
    onSuccess: () => {
      toast.success("Re-evaluación registrada correctamente");
      queryClient.invalidateQueries({ queryKey: ["galeria-timeline", distId] });
      queryClient.invalidateQueries({ queryKey: ["ranking-compania", distId] });
      onSuccess?.();
      handleClose();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Error al re-evaluar";
      toast.error(msg);
      setConfirmed(false);
    },
  });

  function handleClose() {
    if (mutation.isPending) return;
    setSelectedEstado(null);
    setMotivo("");
    setConfirmed(false);
    onClose();
  }

  function handleConfirm() {
    if (!canConfirm || mutation.isPending) return;
    setConfirmed(true);
    mutation.mutate();
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[90dvh] overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="font-black text-base" style={{ color: "var(--shelfy-text)" }}>
            Re-evaluar exhibición
          </SheetTitle>
          <SheetDescription className="text-[12px]" style={{ color: "var(--shelfy-muted)" }}>
            Esta acción es solo visible para Compañía. El estado del distribuidor no se modifica.
          </SheetDescription>
        </SheetHeader>

        {/* Estado actual */}
        <div className="mb-4 flex items-center gap-2">
          <span className="text-[12px]" style={{ color: "var(--shelfy-muted)" }}>Estado actual:</span>
          <Badge variant="outline" className="text-[11px] font-semibold">{estadoActual}</Badge>
        </div>

        {/* Selector de estado nuevo */}
        <div className="mb-5">
          <p className="text-[12px] font-semibold mb-2" style={{ color: "var(--shelfy-text)" }}>
            Nuevo estado Compañía
          </p>
          <div className="grid grid-cols-3 gap-2">
            {ESTADO_OPTIONS.map(({ value, label, icon: Icon, color, bg, border }) => (
              <button
                key={value}
                type="button"
                onClick={() => setSelectedEstado(value)}
                className={cn(
                  "flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 transition-all",
                  selectedEstado === value
                    ? cn(bg, border, "shadow-sm scale-[1.03]")
                    : "border-transparent bg-slate-50 hover:bg-slate-100",
                )}
              >
                <Icon size={18} className={selectedEstado === value ? color : "text-slate-400"} />
                <span className={cn("text-[11px] font-bold", selectedEstado === value ? color : "text-slate-500")}>
                  {label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Motivo */}
        <div className="mb-5">
          <label className="block text-[12px] font-semibold mb-1.5" style={{ color: "var(--shelfy-text)" }}>
            Motivo <span className="font-normal text-slate-400">(mín. {MIN_MOTIVO} caracteres)</span>
          </label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            disabled={mutation.isPending}
            rows={3}
            placeholder="Describí el motivo de la revisión compañía..."
            className="w-full rounded-xl border px-3 py-2 text-[13px] resize-none outline-none focus:ring-2 ring-offset-1 transition-shadow"
            style={{
              borderColor: "var(--shelfy-border)",
              background: "var(--shelfy-bg)",
              color: "var(--shelfy-text)",
            }}
          />
          <p className={cn("text-[11px] mt-1", motivo.length >= MIN_MOTIVO ? "text-green-600" : "text-slate-400")}>
            {motivo.trim().length} / {MIN_MOTIVO} caracteres mínimos
          </p>
        </div>

        {/* Alerta si no completo */}
        {!canConfirm && (selectedEstado || motivo.length > 0) && (
          <Alert variant="default" className="mb-4 py-2">
            <AlertTriangle size={14} className="text-amber-500" />
            <AlertDescription className="text-[12px]">
              {!selectedEstado ? "Seleccioná un estado." : "El motivo debe tener al menos 20 caracteres."}
            </AlertDescription>
          </Alert>
        )}

        {/* Slide to confirm */}
        <div className="mt-2">
          {canConfirm ? (
            <SlideToConfirm
              label="Deslizá para confirmar revisión"
              onConfirm={handleConfirm}
              disabled={mutation.isPending || confirmed}
            />
          ) : (
            <div className="h-12 rounded-full flex items-center justify-center text-[13px] font-semibold opacity-40" style={{ background: "var(--shelfy-border)", color: "var(--shelfy-muted)" }}>
              Completá los campos para confirmar
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-3 text-slate-500"
          onClick={handleClose}
          disabled={mutation.isPending}
        >
          Cancelar
        </Button>
      </SheetContent>
    </Sheet>
  );
}
