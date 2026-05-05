"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Servido desde `public/anuncios/...`. Bump `*_seen_v*` al cambiar el HTML para forzar relectura. */
export const DIFUSION_GUIA_HTML = "/anuncios/comunicacion-shelfy-cc-difusion/index.html";
export const DIFUSION_GUIA_STORAGE_KEY = "shelfy_difusion_cc_guia_seen_v1";

type Props = {
  /**
   * Tras el login se redirige al dashboard: abre el modal una vez si no hay marca en localStorage.
   */
  autoOpenIfUnseen?: boolean;
  /** Esperar sesión cargada antes de disparar auto-open. */
  sessionReady?: boolean;
  /** Modo controlado (p. ej. botón «Guía» en /difusion). Si se pasa, `autoOpenIfUnseen` no aplica. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function CCDifusionGuiaDialog({
  autoOpenIfUnseen = false,
  sessionReady = true,
  open: controlledOpen,
  onOpenChange,
}: Props) {
  const controlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);

  const open = controlled ? controlledOpen : internalOpen;
  const setOpen = useCallback(
    (v: boolean) => {
      if (controlled) onOpenChange?.(v);
      else setInternalOpen(v);
    },
    [controlled, onOpenChange]
  );

  useEffect(() => {
    if (controlled || !autoOpenIfUnseen || !sessionReady) return;
    try {
      if (!localStorage.getItem(DIFUSION_GUIA_STORAGE_KEY)) setInternalOpen(true);
    } catch {
      /* ignore */
    }
  }, [autoOpenIfUnseen, controlled, sessionReady]);

  const marcarLeido = () => {
    try {
      localStorage.setItem(DIFUSION_GUIA_STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-[min(100vw-1.5rem,56rem)] w-full max-h-[min(92vh,920px)] p-0 gap-0 flex flex-col overflow-hidden rounded-2xl border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] [&>button]:text-[var(--shelfy-text)] translate-y-[0%] top-[52%] sm:translate-y-[-50%] sm:top-[50%]">
        <DialogHeader className="px-4 pt-4 pb-2 pr-12 shrink-0 border-b border-[var(--shelfy-border)] text-left">
          <DialogTitle className="text-base text-[var(--shelfy-text)]">
            Cuentas corrientes y difusión vía Telegram
          </DialogTitle>
          <DialogDescription className="text-xs text-[var(--shelfy-muted)]">
            Comunicado informativo después de iniciar sesión. Podés volver a abrirlo desde Difusión:
            botón «Guía CC y Telegram».
          </DialogDescription>
        </DialogHeader>
        <iframe
          title="Guía oficial — Shelfy CC y Difusión"
          src={DIFUSION_GUIA_HTML}
          className="w-full flex-1 min-h-[52vh] sm:min-h-[58vh] border-0 bg-[var(--shelfy-bg)]"
        />
        <DialogFooter className="px-4 py-3 gap-2 border-t border-[var(--shelfy-border)] shrink-0 bg-[var(--shelfy-bg)] flex-row justify-stretch sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs flex-1 sm:flex-none"
            onClick={() => setOpen(false)}
          >
            Seguir después
          </Button>
          <Button
            type="button"
            size="sm"
            className="text-xs flex-1 sm:flex-none bg-[var(--shelfy-primary)] text-[var(--shelfy-primary-contrast,var(--foreground))]"
            onClick={marcarLeido}
          >
            Listo, ya lo leí
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
