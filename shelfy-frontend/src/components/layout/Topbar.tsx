"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Crown, LogOut, Building2, UserCog, Users, MessageSquareText, Mail, X, Send, Paperclip, Loader2, MessageSquarePlus, Monitor, Bot, Smartphone } from "lucide-react";
import {
  fetchDistribuidoras,
  fetchPortalFeedbackPendingCount,
  fetchPortalFeedbackMessages,
  getSuperadminWSUrl,
  postPortalFeedbackMessage,
  uploadPortalFeedbackAttachment,
} from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TopModeTabs } from "./TopModeTabs";
import { EspectadorBanner } from "./EspectadorBanner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { TopbarBrandSweep } from "./TopbarBrandSweep";

// ── Ticket flotante ───────────────────────────────────────────────────────────

function TicketPanel({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const [asunto, setAsunto] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [pos, setPos] = useState({ x: window.innerWidth - 420, y: 70 });
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: history } = useQuery({
    queryKey: ["portal-feedback-messages-mine"],
    queryFn: () => fetchPortalFeedbackMessages(50),
    staleTime: 30_000,
  });

  const myTickets = (history?.items ?? []).filter(
    (m: any) => m.id_usuario === user?.id_usuario
  );

  const buildContextLog = () => JSON.stringify({
    ruta: pathname,
    distribuidor: user?.id_distribuidor,
    usuario: user?.usuario,
    rol: user?.rol,
    ts: new Date().toISOString(),
    pathname: typeof window !== "undefined" ? window.location.pathname : undefined,
    search: typeof window !== "undefined" ? window.location.search : undefined,
    href: typeof window !== "undefined" ? window.location.href : undefined,
    timestamp_cliente: new Date().toISOString(),
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    viewport: typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : undefined,
    screen: typeof window !== "undefined" ? `${screen.width}x${screen.height}` : undefined,
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const uploaded: { url: string; filename: string }[] = [];
      for (const file of attachments) {
        const r = await uploadPortalFeedbackAttachment(file);
        uploaded.push({ url: r.url, filename: r.filename });
      }
      const bodyLines = [
        `Asunto: ${asunto.trim()}`,
        "",
        mensaje.trim(),
        "",
        "Contexto técnico:",
        buildContextLog(),
      ];
      if (uploaded.length) {
        bodyLines.push("", "Adjuntos:");
        uploaded.forEach((a) => bodyLines.push(`- ${a.url} (${a.filename})`));
      }
      await postPortalFeedbackMessage(bodyLines.join("\n"));
    },
    onSuccess: () => {
      toast.success("Ticket enviado");
      setAsunto(""); setMensaje(""); setAttachments([]);
    },
    onError: (e: any) => toast.error(e.message || "Error al enviar"),
  });

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imgItem = items.find((i) => i.type.startsWith("image/"));
    if (imgItem) {
      const file = imgItem.getAsFile();
      if (file) setAttachments((prev) => [...prev, file]);
    }
  }, []);

  const supportsScreenshot = typeof window !== "undefined" && "getDisplayMedia" in (navigator.mediaDevices || {});

  const handleScreenshot = async () => {
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { displaySurface: "browser" },
        preferCurrentTab: true,
      });
      const track = stream.getVideoTracks()[0];
      const imageCapture = new (window as any).ImageCapture(track);
      const bitmap = await imageCapture.grabFrame();
      track.stop();
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(bitmap, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], "screenshot.png", { type: "image/png" });
          setAttachments((prev) => [...prev, file]);
        }
      }, "image/png");
    } catch (e) {
      console.warn("Screenshot cancelled or not supported:", e);
    }
  };

  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  };
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
    };
    const up = () => { dragging.current = false; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, []);

  return (
    <div
      style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 9999, width: 380 }}
      className="rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] shadow-2xl flex flex-col overflow-hidden"
    >
      {/* Header draggable */}
      <div
        onMouseDown={onMouseDown}
        className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--shelfy-border)] cursor-grab active:cursor-grabbing select-none bg-[var(--shelfy-bg)]/60"
      >
        <div className="flex items-center gap-2">
          <Mail size={14} className="text-violet-400" />
          <span className="text-xs font-bold text-[var(--shelfy-text)]">Contactar al equipo</span>
        </div>
        <button onClick={onClose} className="text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Form */}
      <div className="p-3 flex flex-col gap-2 border-b border-[var(--shelfy-border)]">
        <input
          value={asunto}
          onChange={(e) => setAsunto(e.target.value)}
          placeholder="Asunto"
          className="w-full text-xs rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] px-3 py-1.5 text-[var(--shelfy-text)] placeholder:text-[var(--shelfy-muted)] focus:outline-none focus:border-violet-400"
        />
        <textarea
          ref={textareaRef}
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          onPaste={handlePaste}
          placeholder="Describí el problema o sugerencia… (pegá imágenes con Ctrl+V)"
          rows={4}
          className="w-full text-xs rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] px-3 py-2 text-[var(--shelfy-text)] placeholder:text-[var(--shelfy-muted)] focus:outline-none focus:border-violet-400 resize-none"
        />
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {attachments.map((f, i) => (
              <span key={i} className="flex items-center gap-1 text-[10px] bg-violet-500/10 text-violet-400 border border-violet-500/20 rounded-full px-2 py-0.5">
                <Paperclip size={9} />
                {f.name || `imagen-${i + 1}`}
                <button onClick={() => setAttachments((a) => a.filter((_, j) => j !== i))} className="hover:text-red-400 ml-0.5">×</button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <label className="cursor-pointer text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] transition-colors">
              <Paperclip size={13} />
              <input type="file" className="hidden" multiple onChange={(e) => {
                if (e.target.files) setAttachments((a) => [...a, ...Array.from(e.target.files!)]);
              }} />
            </label>
            {supportsScreenshot && (
              <button
                type="button"
                onClick={handleScreenshot}
                title="Capturar pantalla"
                className="flex items-center gap-1 text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] transition-colors text-[10px]"
              >
                <Monitor size={13} />
                <span>Capturar pantalla</span>
              </button>
            )}
          </div>
          <Button
            size="sm"
            onClick={() => sendMutation.mutate()}
            disabled={!asunto.trim() || !mensaje.trim() || sendMutation.isPending}
            className="h-7 text-xs gap-1.5"
          >
            {sendMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
            Enviar
          </Button>
        </div>
        <p className="text-[10px] text-[var(--shelfy-muted)] mt-1">Los adjuntos se conservan 30 días.</p>
      </div>

      {/* Historial propio */}
      {myTickets.length > 0 && (
        <div className="max-h-64 overflow-y-auto divide-y divide-[var(--shelfy-border)]/40 bg-[var(--shelfy-bg)]/30">
          {myTickets.slice(0, 10).map((t: any) => (
            <div key={t.id} className="px-3 py-2.5 flex flex-col gap-1.5">
              <div className="flex justify-between items-start gap-2">
                <span className="text-[9px] font-medium text-[var(--shelfy-muted)]">
                  {new Date(t.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
                {t.respuesta ? (
                  <span className="text-[9px] font-semibold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">Respondido</span>
                ) : (
                  <span className="text-[9px] font-semibold text-orange-500 bg-orange-500/10 px-1.5 py-0.5 rounded">Pendiente</span>
                )}
              </div>
              <p className="text-[11px] text-[var(--shelfy-text)] whitespace-pre-wrap">{t.contenido}</p>
              {t.respuesta && (
                <div className="mt-1 p-2 bg-violet-500/10 border border-violet-500/20 rounded-md">
                  <p className="text-[10px] font-semibold text-violet-500 mb-0.5">Respuesta de soporte:</p>
                  <p className="text-[11px] text-violet-400 whitespace-pre-wrap">{t.respuesta}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface TopbarProps {
  title?: string;
  live?: boolean;
}

export function Topbar({ title, live = false }: TopbarProps) {
  const {
    user,
    logout,
    effectiveDistribuidorId,
    switchDistributor,
    canSwitchDistribuidor,
  } = useAuth();
  const isSuperadmin = user?.is_superadmin;
  const qc = useQueryClient();

  const { data: myTicketsData } = useQuery({
    queryKey: ["portal-feedback-messages-mine"],
    queryFn: () => fetchPortalFeedbackMessages({ limit: 10 }),
    enabled: !!user,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const myTickets = useMemo(() => {
    return (myTicketsData?.items ?? []).filter(
      (m: any) => m.id_usuario === user?.id_usuario
    );
  }, [myTicketsData, user?.id_usuario]);

  const [lastSeenTickets, setLastSeenTickets] = useState<string | null>(null);
  
  useEffect(() => {
    if (typeof window !== "undefined") {
      setLastSeenTickets(localStorage.getItem("last_seen_tickets"));
    }
  }, []);

  const hasUnreadResponse = useMemo(() => {
    const withResponse = myTickets.filter((t: any) => t.respuesta && t.responded_at);
    if (!withResponse.length) return false;
    withResponse.sort((a: any, b: any) => new Date(b.responded_at).getTime() - new Date(a.responded_at).getTime());
    const latestResponse = withResponse[0];
    if (!lastSeenTickets) return true;
    return new Date(latestResponse.responded_at) > new Date(lastSeenTickets);
  }, [myTickets, lastSeenTickets]);

  const handleOpenTickets = () => {
    setTicketOpen(true);
    const now = new Date().toISOString();
    setLastSeenTickets(now);
    localStorage.setItem("last_seen_tickets", now);
  };

  const { data: pendingTicketsData } = useQuery({
    queryKey: ["portal-feedback-pending-count"],
    queryFn: fetchPortalFeedbackPendingCount,
    enabled: !!isSuperadmin && !!user,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const pendingTickets = pendingTicketsData?.pending ?? 0;
  const [ticketOpen, setTicketOpen] = useState(false);

  useEffect(() => {
    if (!isSuperadmin) return;
    const wsUrl = getSuperadminWSUrl();
    if (!wsUrl) return;
    let alive = true;
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as {
          type?: string;
          pending?: number | null;
        };

        if (typeof msg.pending === "number" && Number.isFinite(msg.pending)) {
          qc.setQueryData(["portal-feedback-pending-count"], { pending: msg.pending });
        }

        if (msg.type === "portal_feedback_new") {
          toast.info("Nuevo ticket desde el portal", {
            description: "Abrí «Tickets» en el menú Corona para ver la clasificación del agente.",
          });
          if (!(typeof msg.pending === "number" && Number.isFinite(msg.pending))) {
            void qc.invalidateQueries({ queryKey: ["portal-feedback-pending-count"] });
          }
          void qc.invalidateQueries({ queryKey: ["portal-feedback-messages"] });
        }

        if (msg.type === "portal_feedback_updated") {
          void qc.invalidateQueries({ queryKey: ["portal-feedback-messages"] });
        }
      } catch {
        /* ignore */
      }
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    };
    return () => {
      alive = false;
      ws.onclose = null;
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.onopen = () => ws.close();
      } else {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      }
    };
  }, [isSuperadmin, qc]);

  const { data: distribuidoras = [] } = useQuery({
    queryKey: ["tenant-distribuidoras"],
    queryFn: () => fetchDistribuidoras(true),
    staleTime: 5 * 60_000,
    enabled: !!user && canSwitchDistribuidor,
  });

  const autoDistSwitchRef = useRef(false);
  useEffect(() => {
    if (!canSwitchDistribuidor || !distribuidoras.length) return;
    if (effectiveDistribuidorId != null) return;
    if (autoDistSwitchRef.current) return;
    autoDistSwitchRef.current = true;
    const d = distribuidoras[0];
    switchDistributor(d.id, d.nombre);
  }, [canSwitchDistribuidor, distribuidoras, effectiveDistribuidorId, switchDistributor]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="shrink-0 z-50">
      <header className="h-14 flex items-center px-3 md:px-5 border-b border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] gap-2">

        <TopbarBrandSweep />

        {/* Center: TopModeTabs (desktop) / title (mobile) */}
        <div className="flex-1 flex items-center justify-center overflow-hidden">
          <TopModeTabs />

          {/* Mobile: page title */}
          {title && (
            <div className="flex md:hidden items-center gap-2">
              <h1 className="text-[var(--shelfy-text)] font-semibold text-base truncate">{title}</h1>
              {live && (
                <span className="relative flex size-1.5 shrink-0" title="Datos en tiempo real">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right: user info + logout */}
        {user && (
          <div className="flex items-center gap-3 shrink-0">
            {canSwitchDistribuidor && distribuidoras.length > 0 && (
              <Select
                value={effectiveDistribuidorId != null ? String(effectiveDistribuidorId) : String(distribuidoras[0].id)}
                onValueChange={(v) => {
                  const id = Number(v);
                  const d = distribuidoras.find((x) => x.id === id);
                  if (d) switchDistributor(d.id, d.nombre);
                }}
              >
                <SelectTrigger className="h-8 gap-2 text-xs shrink-0 w-[min(220px,44vw)] sm:w-[220px]" aria-label="Cambiar distribuidora">
                  <Building2 className="size-3.5 text-amber-500 shrink-0" />
                  <SelectValue placeholder="Empresa" />
                </SelectTrigger>
                <SelectContent align="end" className="max-h-[min(320px,50vh)]">
                  {distribuidoras.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      <span className="truncate">{d.nombre}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {isSuperadmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-[var(--shelfy-muted)] hover:text-violet-600 hover:bg-violet-50"
                    title="Herramientas superadmin"
                  >
                    <Crown size={17} />
                    <span className="sr-only">Herramientas superadmin</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Superadmin</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/fuerza-ventas" className="flex items-center gap-2">
                      <UserCog size={14} className="shrink-0" />
                      Fuerza de Ventas
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/admin/supervisores" className="flex items-center gap-2">
                      <Users size={14} className="shrink-0" />
                      Supervisores
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/admin/dashboard">Corridas RPA</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/admin/match-center">Match Center</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/admin/permissions">Permisos</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/admin/altas">Altas en Sistema</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/admin">Administrar</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/admin/mapa">Mapa en Vivo</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link
                      href="/admin/tickets"
                      className="flex items-center justify-between gap-2 w-full"
                    >
                      <span className="flex items-center gap-2">
                        <MessageSquareText size={14} className="shrink-0" />
                        Tickets
                      </span>
                      {pendingTickets > 0 ? (
                        <span
                          title={`${pendingTickets} sin respuesta`}
                          className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-violet-600 text-[10px] font-bold text-white inline-flex items-center justify-center shrink-0"
                        >
                          {pendingTickets > 99 ? "99+" : pendingTickets}
                        </span>
                      ) : null}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/admin/bot-settings" className="flex items-center gap-2">
                      <Bot size={14} className="shrink-0" />
                      Bot Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/admin/app-settings" className="flex items-center gap-2">
                      <Smartphone size={14} className="shrink-0" />
                      App Settings
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <div className="hidden sm:block text-right">
              <p className="text-xs font-medium text-[var(--shelfy-text)]">{user?.usuario ?? "Invitado"}</p>
              <p className="text-[10px] text-[var(--shelfy-muted)]">{user?.nombre_empresa ?? "Modo Mockup"}</p>
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => ticketOpen ? setTicketOpen(false) : handleOpenTickets()}
                    className="text-[var(--shelfy-muted)] hover:text-violet-500 hover:bg-violet-50"
                  >
                    <MessageSquarePlus size={17} />
                    <span className="sr-only">Contactar al equipo</span>
                  </Button>
                  {hasUnreadResponse && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">Contactar al equipo</TooltipContent>
            </Tooltip>

            <Avatar className="size-8 shrink-0">
              <AvatarFallback
                className={cn(
                  "text-white text-xs font-bold",
                  isSuperadmin
                    ? "bg-gradient-to-br from-violet-500 to-indigo-600"
                    : "bg-[var(--shelfy-primary)]",
                )}
              >
                {user?.usuario?.charAt(0).toUpperCase() ?? "I"}
              </AvatarFallback>
            </Avatar>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={logout}
                  className="text-[var(--shelfy-muted)] hover:text-destructive hover:bg-red-50"
                >
                  <LogOut size={18} />
                  <span className="sr-only">Cerrar sesión</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Cerrar sesión</TooltipContent>
            </Tooltip>
          </div>
        )}
      </header>
      <EspectadorBanner />
      </div>
      {ticketOpen && <TicketPanel onClose={() => setTicketOpen(false)} />}
    </TooltipProvider>
  );
}
