"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  type ChangeEvent,
  type SyntheticEvent,
} from "react";
import {
  Bold,
  Camera,
  Code2,
  Italic,
  Paperclip,
  Smile,
  Strikethrough,
  X,
} from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  GUIA_CC_DIFUSION_VERSION,
  postPortalGuiaTracking,
  postPortalFeedbackMessage,
  uploadPortalFeedbackAttachment,
} from "@/lib/api";
import { toast } from "sonner";

/** Servido desde `public/anuncios/...`. Bump versión backend + iframe al reemplazar el HTML. */
export const DIFUSION_GUIA_HTML = "/anuncios/comunicacion-shelfy-cc-difusion/index.html";

type TicketDestination = "producto" | "soporte" | "ideas";
type TicketPriority = "baja" | "media" | "alta" | "critica";

const DEST_META: Record<TicketDestination, { label: string; description: string }> = {
  producto: { label: "Producto Shelfy", description: "Flujos del portal y la experiencia día a día" },
  soporte: { label: "Soporte técnico", description: "Errores, lentitud o algo que no carga bien" },
  ideas: { label: "Ideas y roadmap", description: "Sugerencias y mejoras a futuro" },
};

const PRIOS: TicketPriority[] = ["baja", "media", "alta", "critica"];

const PRIO_LABEL: Record<TicketPriority, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
  critica: "Crítica",
};

function prioButtonClass(active: boolean, p: TicketPriority): string {
  const base =
    "h-9 rounded-lg border px-2 text-[11px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--shelfy-accent)] focus-visible:ring-offset-2 sm:text-xs";
  if (!active) {
    return cn(
      base,
      "border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text-soft)] hover:border-[var(--shelfy-accent)]/35 hover:bg-white",
      p === "critica" && "text-rose-800/85",
      p === "alta" && "text-amber-900/80",
    );
  }
  switch (p) {
    case "critica":
      return cn(base, "border-rose-600 bg-gradient-to-br from-rose-600 to-rose-700 text-white shadow-sm");
    case "alta":
      return cn(base, "border-amber-500 bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm");
    case "media":
      return cn(base, "border-transparent bg-[var(--shelfy-accent)] text-white shadow-md shadow-violet-400/25");
    default:
      return cn(base, "border-slate-500 bg-slate-800 text-white shadow-sm");
  }
}

function draftStorageKey(uid: number) {
  return `shelfy_portal_ticket_v1_${uid}`;
}

/** Legible para la página Tickets (superadmin); formato estable con separadores ASCII. */
function buildPortalTicketBlob(
  dest: TicketDestination,
  prio: TicketPriority,
  subject: string,
  body: string,
  attachments: { url: string; filename: string }[],
): string {
  const head = [
    `▸ TICKET PORTAL SHELFY`,
    `──────────────────────`,
    `Destinatario: ${DEST_META[dest].label}`,
    `Prioridad: ${PRIO_LABEL[prio]}`,
    `Asunto: ${subject.trim()}`,
    `──────────────────────`,
    ``,
    body.trim(),
  ];
  if (attachments.length) {
    head.push(
      "",
      "📎 Archivos adjuntos:",
      ...attachments.map((a) => `- ${a.url} (${a.filename})`),
    );
  }
  return head.join("\n");
}

const ATTACH_MAX_FILES = 6;
const ATTACH_MAX_BYTES = 10 * 1024 * 1024;

/** Inserta marcadores Markdown alrededor de la selección (o punto de inserción). */
function wrapSelection(
  el: HTMLTextAreaElement | null,
  value: string,
  setValue: (s: string) => void,
  before: string,
  after: string,
) {
  if (!el) return;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const slice = value.slice(start, end);
  const next = `${value.slice(0, start)}${before}${slice || ""}${after}${value.slice(end)}`;
  setValue(next);
  window.requestAnimationFrame(() => {
    el.focus();
    const caret = slice ? start + before.length + slice.length + after.length : start + before.length;
    el.setSelectionRange(caret, caret);
  });
}

function insertTextAtCaret(
  el: HTMLTextAreaElement | null,
  value: string,
  setValue: (s: string) => void,
  insert: string,
) {
  if (!el) return;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const next = `${value.slice(0, start)}${insert}${value.slice(end)}`;
  setValue(next);
  window.requestAnimationFrame(() => {
    el.focus();
    const pos = start + insert.length;
    el.setSelectionRange(pos, pos);
  });
}

type DraftShape = {
  dest: TicketDestination;
  prio: TicketPriority;
  subject: string;
  body: string;
};

function ToolbarIcon({
  title,
  children,
  onPress,
  disabled,
}: {
  title: string;
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onPress}
      disabled={disabled}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-lg text-slate-600",
        "transition hover:bg-violet-50 hover:text-[var(--shelfy-accent)]",
        "disabled:pointer-events-none disabled:opacity-45",
      )}
    >
      {children}
    </button>
  );
}

type Props = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

type TrackAgg = { scrollMaxPct: number; activeSeconds: number };

export function CCDifusionGuiaDialog({
  open: controlledOpen,
  onOpenChange,
}: Props) {
  const { user } = useAuth();
  const controlled = controlledOpen !== undefined;
  const [internalOpen, internalSetOpen] = React.useState(false);
  const [composerOpen, setComposerOpen] = React.useState(false);
  const [composerBody, setComposerBody] = React.useState("");
  const [ticketDest, setTicketDest] = React.useState<TicketDestination>("soporte");
  const [ticketPrio, setTicketPrio] = React.useState<TicketPriority>("media");
  const [ticketSubject, setTicketSubject] = React.useState("");
  const [attachedFiles, setAttachedFiles] = React.useState<{ id: string; file: File }[]>([]);
  const [autosaveLabel, setAutosaveLabel] = React.useState<string | null>(null);
  const [sendingNote, setSendingNote] = React.useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevComposerOpen = useRef(false);
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

  const persistDraft = useCallback(() => {
    const uid = user?.id_usuario;
    if (!uid) return;
    try {
      const blob: DraftShape = {
        dest: ticketDest,
        prio: ticketPrio,
        subject: ticketSubject,
        body: composerBody,
      };
      localStorage.setItem(draftStorageKey(uid), JSON.stringify(blob));
      setAutosaveLabel(
        new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
      );
    } catch {
      /* ignore */
    }
  }, [user?.id_usuario, ticketDest, ticketPrio, ticketSubject, composerBody]);

  const resetComposerForm = useCallback(() => {
    setTicketSubject("");
    setComposerBody("");
    setAttachedFiles([]);
    setTicketDest("soporte");
    setTicketPrio("media");
    setAutosaveLabel(null);
  }, []);

  /** Borrador desde localStorage al pasar cerrado → abierto. */
  useEffect(() => {
    const uid = user?.id_usuario;
    const wasOpen = prevComposerOpen.current;

    if (composerOpen && !wasOpen && uid) {
      try {
        const raw = localStorage.getItem(draftStorageKey(uid));
        if (raw) {
          const d = JSON.parse(raw) as Partial<DraftShape>;
          if (d.dest === "producto" || d.dest === "soporte" || d.dest === "ideas") setTicketDest(d.dest);
          if (d.prio === "baja" || d.prio === "media" || d.prio === "alta" || d.prio === "critica") {
            setTicketPrio(d.prio);
          }
          if (typeof d.subject === "string") setTicketSubject(d.subject);
          if (typeof d.body === "string") setComposerBody(d.body);
        }
      } catch {
        /* ignore */
      }
    }

    prevComposerOpen.current = composerOpen;
  }, [composerOpen, user?.id_usuario]);

  /** Autoguardado local discreto para no perder el texto. */
  useEffect(() => {
    if (!composerOpen || !user?.id_usuario) return;
    const timer = window.setTimeout(() => {
      persistDraft();
    }, 650);
    return () => window.clearTimeout(timer);
  }, [
    composerOpen,
    user?.id_usuario,
    ticketDest,
    ticketPrio,
    ticketSubject,
    composerBody,
    persistDraft,
  ]);

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
    const sub = ticketSubject.trim();
    const bod = composerBody.trim();
    if (sub.length < 4) {
      toast.error("Escribí un asunto un poco más descriptivo (al menos 4 caracteres).");
      return;
    }
    if (bod.length < 16) {
      toast.error("Contá un poco más de detalle en el mensaje (al menos 16 caracteres).");
      return;
    }
    setSendingNote(true);
    try {
      const uploaded: { url: string; filename: string }[] = [];
      for (const row of attachedFiles) {
        const r = await uploadPortalFeedbackAttachment(row.file);
        uploaded.push({ url: r.url, filename: r.filename });
      }
      const payload = buildPortalTicketBlob(ticketDest, ticketPrio, sub, bod, uploaded);
      await postPortalFeedbackMessage(payload);
      toast.success("Ticket enviado. Gracias por el feedback.");
      try {
        const uid = user?.id_usuario;
        if (uid) localStorage.removeItem(draftStorageKey(uid));
      } catch {
        /* ignore */
      }
      resetComposerForm();
      setComposerOpen(false);
      void flushTracking(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "No se pudo enviar.");
    } finally {
      setSendingNote(false);
    }
  };

  const handleSaveDraftClick = () => {
    persistDraft();
    toast.success("Borrador guardado en este dispositivo.", { duration: 2200 });
  };

  const handleAttachChange = (ev: ChangeEvent<HTMLInputElement>) => {
    const list = ev.target.files;
    if (!list?.length) return;
    const remainingSlots = ATTACH_MAX_FILES - attachedFiles.length;
    if (remainingSlots <= 0) {
      toast.warning(`Como máximo ${ATTACH_MAX_FILES} archivos por ticket.`);
      ev.target.value = "";
      return;
    }
    const batch: { id: string; file: File }[] = [];
    for (let i = 0; i < list.length && batch.length < remainingSlots; i++) {
      const f = list[i];
      if (!f) continue;
      if (f.size > ATTACH_MAX_BYTES) {
        toast.error(`${f.name} supera los 10 MB`);
        continue;
      }
      batch.push({ id: crypto.randomUUID(), file: f });
    }
    if (list.length > batch.length && batch.length >= remainingSlots) {
      toast.warning(`Solo se agregaron ${batch.length} archivo(s) (máximo ${ATTACH_MAX_FILES} por ticket).`);
    }
    if (batch.length) {
      setAttachedFiles((prev) => [...prev, ...batch]);
    }
    ev.target.value = "";
  };

  const handleInsertEmoji = () => {
    insertTextAtCaret(bodyRef.current, composerBody, setComposerBody, " 🙂 ");
  };

  const handleComposerClose = (next: boolean) => {
    if (!next && user?.id_usuario) {
      try {
        persistDraft();
      } catch {
        /* ignore */
      }
    }
    setComposerOpen(next);
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
              Guía de referencia. Siempre disponible en Difusión → «Guía CC y Telegram».
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

      <Dialog open={composerOpen} onOpenChange={handleComposerClose}>
        <DialogContent
          className={cn(
            "max-w-[min(100vw-1.25rem,32rem)] overflow-hidden rounded-2xl border border-[var(--shelfy-border)]",
            "bg-[var(--shelfy-panel)] p-0 gap-0 shadow-[0_22px_48px_-28px_rgba(79,22,184,0.45)]",
          )}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-violet-400 via-[var(--shelfy-accent)] to-fuchsia-400" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_52%_at_50%_-25%,rgba(124,58,237,0.11),transparent)]" />

          <div className="relative px-5 pt-6 pb-4">
            <DialogHeader className="space-y-2 text-left gap-0">
              <DialogTitle className="font-serif text-xl font-semibold tracking-tight text-[var(--shelfy-text)] pr-8">
                Ticket para Shelfy
              </DialogTitle>
              <p className="text-[13px] leading-relaxed text-[var(--shelfy-muted)]">
                Toda idea cuenta: lo leemos con calma y respondemos desde{" "}
                <span className="text-[var(--shelfy-accent)] font-medium">Tickets</span> (superadmin).
              </p>
              <DialogDescription className="sr-only">
                Formulario tipo ticket: destinatario, prioridad, asunto y detalle. Borrador local opcional.
              </DialogDescription>
            </DialogHeader>
          </div>

          <Separator className="opacity-60" />

          <form onSubmit={handleComposerSubmit} className="relative flex flex-col gap-0">
            <div className="grid gap-5 px-5 py-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--shelfy-accent)]">
                  Destinatario
                </Label>
                <Select
                  value={ticketDest}
                  onValueChange={(v) => setTicketDest(v as TicketDestination)}
                  disabled={sendingNote}
                >
                  <SelectTrigger className="h-11 rounded-xl border-[var(--shelfy-border)] bg-white/90 text-left text-sm shadow-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(DEST_META) as TicketDestination[]).map((k) => (
                      <SelectItem key={k} value={k} className="text-sm">
                        <div className="flex flex-col py-0.5">
                          <span className="font-semibold text-[var(--shelfy-text)]">{DEST_META[k].label}</span>
                          <span className="text-[11px] text-[var(--shelfy-muted)]">
                            {DEST_META[k].description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--shelfy-accent)]">
                  Prioridad
                </Label>
                <div role="radiogroup" aria-label="Prioridad del ticket" className="grid grid-cols-2 gap-1.5">
                  {PRIOS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      role="radio"
                      aria-checked={ticketPrio === p}
                      onClick={() => setTicketPrio(p)}
                      disabled={sendingNote}
                      className={cn(
                        prioButtonClass(ticketPrio === p, p),
                        sendingNote && "pointer-events-none opacity-60",
                      )}
                    >
                      {PRIO_LABEL[p]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2 px-5">
              <Label
                htmlFor="ticket-subject"
                className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--shelfy-accent)]"
              >
                Asunto del ticket
              </Label>
              <Input
                id="ticket-subject"
                value={ticketSubject}
                onChange={(e) => setTicketSubject(e.target.value)}
                disabled={sendingNote}
                placeholder="Un título corto que resuma la consulta…"
                maxLength={140}
                className="h-11 rounded-xl border-[var(--shelfy-border)] bg-white/90 text-sm shadow-sm"
              />
            </div>

            <div className="mt-5 mx-5 overflow-hidden rounded-xl border border-[var(--shelfy-border)] bg-white shadow-inner">
              <div className="flex flex-wrap items-center gap-1 border-b border-[var(--shelfy-border)] bg-slate-50/90 px-2 py-1.5">
                <div className="flex items-center gap-0.5 rounded-lg bg-white/80 p-0.5 shadow-sm">
                  <ToolbarIcon
                    title="Negrita (**)"
                    onPress={() => wrapSelection(bodyRef.current, composerBody, setComposerBody, "**", "**")}
                    disabled={sendingNote}
                  >
                    <Bold className="size-3.5" />
                  </ToolbarIcon>
                  <ToolbarIcon
                    title="Cursiva (*)"
                    onPress={() => wrapSelection(bodyRef.current, composerBody, setComposerBody, "*", "*")}
                    disabled={sendingNote}
                  >
                    <Italic className="size-3.5" />
                  </ToolbarIcon>
                  <ToolbarIcon
                    title="Tachado (~~)"
                    onPress={() => wrapSelection(bodyRef.current, composerBody, setComposerBody, "~~", "~~")}
                    disabled={sendingNote}
                  >
                    <Strikethrough className="size-3.5" />
                  </ToolbarIcon>
                  <ToolbarIcon
                    title="Código (`)"
                    onPress={() => wrapSelection(bodyRef.current, composerBody, setComposerBody, "`", "`")}
                    disabled={sendingNote}
                  >
                    <Code2 className="size-3.5" />
                  </ToolbarIcon>
                </div>
                <Separator orientation="vertical" className="mx-1 hidden h-7 sm:block bg-border" />
                <div className="flex flex-1 flex-wrap items-center gap-0.5">
                  <ToolbarIcon
                    title="Adjuntar archivo (captura, PDF, Excel…)"
                    onPress={() => fileInputRef.current?.click()}
                    disabled={sendingNote}
                  >
                    <Paperclip className="size-3.5" />
                  </ToolbarIcon>
                  <ToolbarIcon
                    title="Misma acción — ideal para capturas"
                    onPress={() => fileInputRef.current?.click()}
                    disabled={sendingNote}
                  >
                    <Camera className="size-3.5" />
                  </ToolbarIcon>
                  <ToolbarIcon title="Insertar emoji" onPress={handleInsertEmoji} disabled={sendingNote}>
                    <Smile className="size-3.5" />
                  </ToolbarIcon>
                </div>
                <span className="ml-auto hidden text-[9px] font-bold uppercase tracking-wider text-muted-foreground tabular-nums sm:inline">
                  {autosaveLabel ? <>Autoguardado · {autosaveLabel}</> : "Borrador local"}
                </span>
              </div>
              <p className="sm:hidden border-b border-transparent px-3 py-1.5 text-center text-[9px] font-bold uppercase tracking-wider text-muted-foreground tabular-nums">
                {autosaveLabel ? <>Autoguardado · {autosaveLabel}</> : "Borrador solo en este dispositivo"}
              </p>
              <Textarea
                ref={bodyRef}
                id="ticket-body"
                value={composerBody}
                onChange={(e) => setComposerBody(e.target.value)}
                disabled={sendingNote}
                placeholder="Contá pasos para reproducir el problema, qué esperabas y qué viste. Cuanto más contexto, mejor."
                className={cn(
                  "min-h-[140px] resize-y rounded-none border-0 bg-transparent px-3 py-3 text-sm",
                  "leading-relaxed shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 md:min-h-[168px]",
                )}
              />
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                accept="image/*,.pdf,.txt,.csv,.xlsx,.zip"
                onChange={handleAttachChange}
              />

              {attachedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 border-t border-dashed border-[var(--shelfy-border)] bg-violet-50/30 px-3 py-3">
                  {attachedFiles.map((row) => (
                    <span
                      key={row.id}
                      className="group inline-flex max-w-full items-center gap-1.5 rounded-full border border-violet-200 bg-white pl-2.5 pr-1 text-[11px] font-medium text-violet-950"
                    >
                      <span className="truncate" title={row.file.name}>
                        {row.file.name}
                        <span className="text-violet-600/90 font-normal">
                          {" "}
                          ({Math.ceil(row.file.size / 1024)} KB)
                        </span>
                      </span>
                      <button
                        type="button"
                        aria-label={`Quitar ${row.file.name}`}
                        disabled={sendingNote}
                        className="rounded-full p-0.5 text-violet-600 transition hover:bg-violet-100 hover:text-violet-950"
                        onClick={() => setAttachedFiles((xs) => xs.filter((x) => x.id !== row.id))}
                      >
                        <X className="size-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <p className="border-t border-[var(--shelfy-border)] bg-slate-50/50 px-3 py-2 text-[10px] text-[var(--shelfy-muted)]">
                Al enviar, los archivos se suben automáticamente (máx. {ATTACH_MAX_FILES} · 10 MB c/u): imágenes, PDF,
                Excel y ZIP.
              </p>
            </div>

            <DialogFooter className="mt-5 flex-col gap-3 border-t border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] justify-start px-0 sm:order-1 sm:justify-center"
                disabled={sendingNote}
                onClick={() => handleComposerClose(false)}
              >
                Cancelar
              </Button>
              <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto sm:flex-nowrap">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 flex-1 rounded-xl border-[var(--shelfy-border)] sm:flex-none"
                  disabled={sendingNote}
                  onClick={handleSaveDraftClick}
                >
                  Guardar borrador
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="h-9 flex-1 rounded-xl bg-[var(--shelfy-accent)] text-white hover:bg-[var(--shelfy-accent)]/90 sm:flex-none"
                  disabled={sendingNote}
                  loading={sendingNote}
                >
                  Enviar ticket
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
