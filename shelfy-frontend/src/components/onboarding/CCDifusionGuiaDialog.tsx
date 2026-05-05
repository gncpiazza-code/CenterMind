"use client";

import React, { useCallback, useEffect, useRef, type SyntheticEvent } from "react";

import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  GUIA_CC_DIFUSION_VERSION,
  postPortalGuiaTracking,
  postPortalFeedbackMessage,
} from "@/lib/api";
import { toast } from "sonner";

/** Servido desde `public/anuncios/...`. Bump versión backend + iframe al reemplazar el HTML. */
export const DIFUSION_GUIA_HTML = "/anuncios/comunicacion-shelfy-cc-difusion/index.html";

/** Una sola pulsación tras login válida (consumida al abrir el modal). */
const SESSION_LOGIN_PULSE = "shelfy_login_pulse_guia";
/** Cuántas veces se abrió automáticamente tras login (3 primeros ingresos con pulso). */
const LOGIN_PROMPT_COUNT_KEY = "shelfy_difusion_cc_guia_login_opens";

type Props = {
  autoOpenIfUnseen?: boolean;
  sessionReady?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

type TrackAgg = { scrollMaxPct: number; activeSeconds: number };

export function CCDifusionGuiaDialog({
  autoOpenIfUnseen = false,
  sessionReady = true,
  open: controlledOpen,
  onOpenChange,
}: Props) {
  const { user } = useAuth();
  const controlled = controlledOpen !== undefined;
  const [internalOpen, internalSetOpen] = React.useState(false);
  const [composerOpen, setComposerOpen] = React.useState(false);
  const [composerBody, setComposerBody] = React.useState("");
  const [sendingNote, setSendingNote] = React.useState(false);
  const trackAgg = useRef<TrackAgg>({ scrollMaxPct: 0, activeSeconds: 0 });
  const lastFlushAt = useRef(0);

  const open = controlled ? controlledOpen : internalOpen;
  const setOpen = useCallback(
    (v: boolean) => {
      if (controlled) onOpenChange?.(v);
      else internalSetOpen(v);
    },
    [controlled, onOpenChange],
  );

  const flushTracking = useCallback(
    async (cerradoModal: boolean) => {
      if (!user) return;
      const { scrollMaxPct, activeSeconds } = trackAgg.current;
      if (scrollMaxPct === 0 && activeSeconds === 0 && !cerradoModal) return;
      try {
        await postPortalGuiaTracking({
          scroll_max_pct: scrollMaxPct,
          active_seconds: activeSeconds,
          guia_version: GUIA_CC_DIFUSION_VERSION,
          cerrado_modal: cerradoModal,
        });
        lastFlushAt.current = Date.now();
      } catch {
        /* no bloquear UX */
      }
    },
    [user],
  );

  useEffect(() => {
    if (controlled || !autoOpenIfUnseen || !sessionReady) return;
    try {
      const pulse = sessionStorage.getItem(SESSION_LOGIN_PULSE);
      if (!pulse) return;
      sessionStorage.removeItem(SESSION_LOGIN_PULSE);

      let n = 0;
      try {
        n = parseInt(localStorage.getItem(LOGIN_PROMPT_COUNT_KEY) || "0", 10);
      } catch {
        n = 0;
      }
      if (Number.isNaN(n) || n >= 3) return;
      internalSetOpen(true);
      localStorage.setItem(LOGIN_PROMPT_COUNT_KEY, String(n + 1));
    } catch {
      /* ignore */
    }
  }, [autoOpenIfUnseen, controlled, sessionReady]);

  useEffect(() => {
    if (!open) return undefined;
    const onMsg = (e: MessageEvent) => {
      if (typeof window === "undefined" || e.source == null) return;
      try {
        if (window.location.origin !== e.origin) return;
      } catch {
        return;
      }
      const data = e.data;
      if (!data || typeof data !== "object" || (data as { type?: string }).type !== "shelfy-guia") {
        return;
      }
      const action = (data as { action?: string }).action;
      if (action === "contact") {
        setComposerOpen(true);
        return;
      }
      if (action === "track") {
        const scrollRaw = Number((data as { scrollMaxPct?: number }).scrollMaxPct);
        const secRaw = Number((data as { activeSeconds?: number }).activeSeconds);
        const pct = Number.isFinite(scrollRaw)
          ? Math.min(100, Math.max(0, Math.round(scrollRaw)))
          : 0;
        const sec = Number.isFinite(secRaw) ? Math.max(0, Math.round(secRaw)) : 0;
        trackAgg.current.scrollMaxPct = Math.max(trackAgg.current.scrollMaxPct, pct);
        trackAgg.current.activeSeconds = Math.max(trackAgg.current.activeSeconds, sec);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [open]);

  useEffect(() => {
    if (!open || !user) return undefined;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastFlushAt.current < 4000) return;
      void flushTracking(false);
    }, 12_000);
    return () => clearInterval(id);
  }, [open, user, flushTracking]);

  const handleRootOpenChange = (next: boolean) => {
    if (!next && open) void flushTracking(true);
    if (!next) trackAgg.current = { scrollMaxPct: 0, activeSeconds: 0 };
    setOpen(next);
  };

  const handleComposerSubmit = async (ev: SyntheticEvent) => {
    ev.preventDefault();
    const trimmed = composerBody.trim();
    if (trimmed.length < 3) {
      toast.error("Escribí al menos unas palabras para enviar.");
      return;
    }
    setSendingNote(true);
    try {
      await postPortalFeedbackMessage(trimmed);
      toast.success("Mensaje enviado al equipo de desarrollo.");
      setComposerBody("");
      setComposerOpen(false);
      void flushTracking(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "No se pudo enviar.");
    } finally {
      setSendingNote(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleRootOpenChange}>
        <DialogContent className="max-w-[min(100vw-1.5rem,56rem)] w-full max-h-[min(92vh,920px)] p-0 gap-0 flex flex-col overflow-hidden rounded-2xl border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] [&>button]:text-[var(--shelfy-text)] translate-y-[0%] top-[52%] sm:translate-y-[-50%] sm:top-[50%]">
          <DialogHeader className="px-4 pt-4 pb-2 pr-12 shrink-0 border-b border-[var(--shelfy-border)] text-left">
            <DialogTitle className="text-base text-[var(--shelfy-text)]">
              Cuentas corrientes y difusión vía Telegram
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--shelfy-muted)]">
              Te lo mostramos hasta 3 veces al iniciar sesión. Recordatorio: Difusión → «Guía CC y Telegram».
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
              onClick={() => handleRootOpenChange(false)}
            >
              Seguir después
            </Button>
            <Button
              type="button"
              size="sm"
              className="text-xs flex-1 sm:flex-none bg-[var(--shelfy-primary)] text-[var(--shelfy-primary-contrast,var(--foreground))]"
              onClick={() => handleRootOpenChange(false)}
            >
              Listo por ahora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={composerOpen} onOpenChange={setComposerOpen}>
        <DialogContent className="max-w-lg border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] rounded-2xl">
          <DialogHeader className="space-y-2 text-left">
            <p className="text-xs text-[var(--shelfy-muted)] leading-snug">
              Toda idea es bienvenida: el equipo de desarrollo la tendrá en cuenta.
            </p>
            <DialogTitle>Mensaje al desarrollador</DialogTitle>
            <DialogDescription className="sr-only">
              Escribí un mensaje opcional sobre la guía o el producto. Podés usar varias líneas.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleComposerSubmit} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="dev-note" className="text-xs">
                ¿Qué querés comunicar?
              </Label>
              <Textarea
                id="dev-note"
                value={composerBody}
                onChange={(e) => setComposerBody(e.target.value)}
                rows={6}
                className="text-sm min-h-[120px]"
                placeholder="Contá problema, idea o consulta..."
                disabled={sendingNote}
              />
            </div>
            <DialogFooter className="gap-2 flex-row justify-end pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setComposerOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={sendingNote} loading={sendingNote}>
                Enviar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
