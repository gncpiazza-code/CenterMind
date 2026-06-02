"use client";

import { useState } from "react";
import Image from "next/image";
import { useMutation } from "@tanstack/react-query";
import { BookOpen, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { enviarGuiaExhibicionPorExhibicion } from "@/lib/api";
import { cn } from "@/lib/utils";

const GUIA_IMAGE_PATH = "/galeria/guia-estandares-exhibicion.png";

interface Props {
  distId: number;
  idExhibicion: number | null | undefined;
  nombreVendedor?: string | null;
  className?: string;
  variant?: "default" | "compact";
}

export function VisorEnviarGuiaExhibicion({
  distId,
  idExhibicion,
  nombreVendedor,
  className,
  variant = "default",
}: Props) {
  const [open, setOpen] = useState(false);
  const disabled = !idExhibicion || distId <= 0;

  const mutation = useMutation({
    mutationFn: () => enviarGuiaExhibicionPorExhibicion(distId, idExhibicion!),
    onSuccess: () => {
      toast.success("Guía enviada al grupo de Telegram del vendedor");
      setOpen(false);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "No se pudo enviar la guía";
      toast.error(msg);
    },
  });

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={variant === "compact" ? "sm" : "default"}
        disabled={disabled}
        className={cn(
          "gap-1.5 font-semibold border-[var(--shelfy-border)]",
          variant === "compact" && "h-8 text-[11px] px-2.5",
          className,
        )}
        onClick={() => setOpen(true)}
        title="Enviar guía de exhibición al grupo Telegram del vendedor"
      >
        <BookOpen size={variant === "compact" ? 12 : 14} className="shrink-0" />
        Enviar imagen de referencia
      </Button>

      <Dialog open={open} onOpenChange={(v) => !mutation.isPending && setOpen(v)}>
        <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Guía de estándares de exhibición</DialogTitle>
            <DialogDescription className="text-left space-y-2 pt-1">
              <span className="block">
                Útil cuando la exhibición no cumple criterios: se enviará al{" "}
                <strong>grupo de Telegram</strong>
                {nombreVendedor ? (
                  <>
                    {" "}
                    de <strong>{nombreVendedor}</strong>
                  </>
                ) : (
                  " del vendedor"
                )}{" "}
                esta imagen con un mensaje que explica qué es una exhibición{" "}
                <strong>aprobada</strong> y <strong>destacada</strong>.
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="relative w-full aspect-[3/4] max-h-[50vh] rounded-lg overflow-hidden border bg-muted">
            <Image
              src={GUIA_IMAGE_PATH}
              alt="Guía de estándares de exhibición"
              fill
              className="object-contain"
              sizes="(max-width: 512px) 100vw, 512px"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={mutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={disabled || mutation.isPending}
            >
              {mutation.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Send size={14} />
              )}
              Enviar al grupo de Telegram
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
