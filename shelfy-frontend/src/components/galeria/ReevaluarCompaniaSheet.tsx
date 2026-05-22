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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [anunciarTelegram, setAnunciarTelegram] = useState(false);

  const motivoValido = motivo.trim().length >= MIN_MOTIVO;
  const canConfirm = !!selectedEstado && motivoValido;
  const canSubmit = canConfirm && confirmChecked;

  const mutation = useMutation({
    mutationFn: () =>
      reevaluarExhibicionCompania({
        id_exhibicion: idExhibicion,
        estado_nuevo: selectedEstado!,
        motivo: motivo.trim(),
        anunciar_telegram: anunciarTelegram,
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
      setConfirmChecked(false);
    },
  });

  function handleClose() {
    if (mutation.isPending) return;
    setSelectedEstado(null);
    setMotivo("");
    setConfirmChecked(false);
    setAnunciarTelegram(false);
    onClose();
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

        {/* Checkboxes de confirmación */}
        <div className="space-y-3 mt-4">
          {/* Anunciar por Telegram (siempre visible, desmarcado por defecto) */}
          <div className="flex items-start gap-3 p-3 rounded-xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)]">
            <Checkbox
              id="anunciar-telegram"
              checked={anunciarTelegram}
              onCheckedChange={(v) => setAnunciarTelegram(!!v)}
              disabled={mutation.isPending}
            />
            <div className="grid gap-1">
              <Label htmlFor="anunciar-telegram" className="text-[12px] font-semibold cursor-pointer" style={{ color: "var(--shelfy-text)" }}>
                Anunciar por Telegram
              </Label>
              <p className="text-[11px]" style={{ color: "var(--shelfy-muted)" }}>
                Notificará al vendedor con el estado, motivo y quién realizó la revisión.
              </p>
            </div>
          </div>

          {/* Confirmar re-evaluación (requerido para habilitar el botón) */}
          <div className="flex items-center gap-3 p-3 rounded-xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)]">
            <Checkbox
              id="confirm-reeval"
              checked={confirmChecked}
              onCheckedChange={(v) => setConfirmChecked(!!v)}
              disabled={mutation.isPending || !canConfirm}
            />
            <Label htmlFor="confirm-reeval" className="text-[12px] font-semibold cursor-pointer" style={{ color: "var(--shelfy-text)" }}>
              Confirmo la re-evaluación
            </Label>
          </div>
        </div>

        <Button
          onClick={() => {
            if (!canConfirm || !confirmChecked || mutation.isPending) return;
            mutation.mutate();
          }}
          disabled={!canConfirm || !confirmChecked || mutation.isPending}
          className="w-full mt-4 font-black uppercase tracking-wider text-[11px]"
        >
          {mutation.isPending ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" strokeOpacity={0.25} />
                <path d="M12 2a10 10 0 0 1 10 10" />
              </svg>
              Procesando...
            </span>
          ) : "Confirmar re-evaluación"}
        </Button>

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
