"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchBotCommands,
  fetchDistribuidoras,
  fetchFuerzaVentasVendedores,
  previewBotInteraction,
  type BotPreviewMessage,
} from "@/lib/api";
import { telegramHtmlToRenderHtml } from "@/lib/telegram-html";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Bot, FileText, Loader2, Send, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ChatEntry =
  | { role: "user"; text: string }
  | { role: "bot"; message: BotPreviewMessage };

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function BotBubble({
  message,
  onButtonClick,
}: {
  message: BotPreviewMessage;
  onButtonClick: (action: string) => void;
}) {
  if (message.type === "photo") {
    return (
      <div className="max-w-[92%] rounded-2xl rounded-bl-md overflow-hidden bg-white border border-[var(--shelfy-border)] shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={message.photo_url}
          alt="Comando custom"
          className="w-full max-h-48 object-cover"
        />
        {message.caption_html ? (
          <div
            className="px-3 py-2 text-sm text-[var(--shelfy-text)] leading-relaxed [&_b]:font-bold [&_i]:italic [&_code]:font-mono [&_code]:text-xs [&_code]:bg-black/5 [&_code]:px-1 [&_code]:rounded"
            dangerouslySetInnerHTML={{
              __html: telegramHtmlToRenderHtml(message.caption_html),
            }}
          />
        ) : null}
      </div>
    );
  }

  if (message.type === "document") {
    return (
      <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-white border border-[var(--shelfy-border)] shadow-sm p-3 flex gap-3 items-start">
        <div className="size-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
          <FileText className="size-5 text-red-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--shelfy-text)] truncate">
            {message.filename}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            PDF · {formatBytes(message.size_bytes)}
          </p>
          {message.caption_html ? (
            <div
              className="mt-2 text-xs text-[var(--shelfy-text)] leading-relaxed [&_b]:font-bold [&_i]:italic"
              dangerouslySetInnerHTML={{
                __html: telegramHtmlToRenderHtml(message.caption_html),
              }}
            />
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-white border border-[var(--shelfy-border)] shadow-sm px-3 py-2.5">
      <div
        className="text-sm text-[var(--shelfy-text)] leading-relaxed whitespace-pre-wrap [&_b]:font-bold [&_i]:italic [&_code]:font-mono [&_code]:text-xs [&_code]:bg-black/5 [&_code]:px-1 [&_code]:rounded"
        dangerouslySetInnerHTML={{
          __html: telegramHtmlToRenderHtml(message.html ?? ""),
        }}
      />
      {message.buttons?.length ? (
        <div className="mt-2 flex flex-col gap-1.5">
          {message.buttons.map((row, ri) => (
            <div key={ri} className="flex flex-wrap gap-1.5">
              {row.map((btn) => (
                <button
                  key={btn.action}
                  type="button"
                  className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-sky-50 text-sky-800 border border-sky-200 hover:bg-sky-100 transition-colors"
                  onClick={() => onButtonClick(btn.action)}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function BotSettingsPreviewChat() {
  const [distId, setDistId] = useState<number | null>(null);
  const [vendedorId, setVendedorId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: dists, isLoading: loadingDists } = useQuery({
    queryKey: ["admin-distribuidoras-active"],
    queryFn: () => fetchDistribuidoras(true),
    staleTime: 120_000,
  });

  const { data: commands } = useQuery({
    queryKey: ["bot-settings-commands"],
    queryFn: fetchBotCommands,
    staleTime: 60_000,
  });

  const { data: vendedores, isLoading: loadingVendedores } = useQuery({
    queryKey: ["fv-vendedores-preview", distId],
    queryFn: () => fetchFuerzaVentasVendedores(distId!),
    enabled: distId != null,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (dists?.length && distId == null) {
      setDistId(dists[0].id);
    }
  }, [dists, distId]);

  useEffect(() => {
    setVendedorId(null);
  }, [distId]);

  const menuChips = useMemo(() => {
    const cmds =
      commands
        ?.filter((c) => c.enabled && c.visible_in_menu && c.kind !== "admin_only")
        .slice(0, 8)
        .map((c) => `/${c.command}`) ?? [];
    const flowSteps = ["@foto", "@nro 194", "@registrando", "@ok"];
    return [...flowSteps, ...cmds];
  }, [commands]);

  const sendInteraction = useCallback(
    async (opts: { text?: string; callbackAction?: string }) => {
      if (distId == null) return;
      const userLabel = opts.text ?? `[${opts.callbackAction}]`;
      setChat((prev) => [...prev, { role: "user", text: userLabel }]);
      setLoading(true);
      try {
        const res = await previewBotInteraction({
          dist_id: distId,
          id_vendedor: vendedorId,
          input: opts.text,
          callback_action: opts.callbackAction,
        });
        setChat((prev) => [
          ...prev,
          ...res.messages.map((m) => ({ role: "bot" as const, message: m })),
        ]);
      } catch (e) {
        setChat((prev) => [
          ...prev,
          {
            role: "bot",
            message: {
              type: "text",
              html: e instanceof Error ? e.message : "Error en la simulación",
            },
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [distId, vendedorId],
  );

  const handleCallback = useCallback(
    (action: string) => {
      void sendInteraction({ callbackAction: action });
    },
    [sendInteraction],
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chat, loading]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    setInput("");
    void sendInteraction({ text: trimmed.startsWith("/") || trimmed.startsWith("@") ? trimmed : `/${trimmed}` });
  }

  function handleClear() {
    setChat([]);
  }

  return (
    <Card className="rounded-2xl border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] flex flex-col h-full min-h-[420px] lg:min-h-0 overflow-hidden">
      {/* Header estilo Telegram */}
      <div className="shrink-0 px-4 py-3 border-b border-[var(--shelfy-border)] bg-gradient-to-r from-sky-500 to-sky-600 text-white">
        <div className="flex items-center gap-2">
          <div className="size-9 rounded-full bg-white/20 flex items-center justify-center">
            <Bot className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold truncate">Simulador del bot</p>
            <p className="text-[10px] text-white/80">Preview en tiempo real · sin Telegram</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/15 rounded-xl shrink-0"
            onClick={handleClear}
            title="Limpiar chat"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {/* Contexto dist + vendedor */}
      <div className="shrink-0 p-3 border-b border-[var(--shelfy-border)] bg-[var(--shelfy-bg)]/50 flex flex-col gap-2">
        {loadingDists ? (
          <Skeleton className="h-9 w-full rounded-xl" />
        ) : (
          <Select
            value={distId != null ? String(distId) : undefined}
            onValueChange={(v) => setDistId(Number(v))}
          >
            <SelectTrigger className="h-9 rounded-xl text-xs bg-white">
              <SelectValue placeholder="Distribuidora" />
            </SelectTrigger>
            <SelectContent>
              {(dists ?? []).map((d) => (
                <SelectItem key={d.id} value={String(d.id)}>
                  {d.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {distId != null && (
          loadingVendedores ? (
            <Skeleton className="h-9 w-full rounded-xl" />
          ) : (
            <Select
              value={vendedorId != null ? String(vendedorId) : "none"}
              onValueChange={(v) => setVendedorId(v === "none" ? null : Number(v))}
            >
              <SelectTrigger className="h-9 rounded-xl text-xs bg-white">
                <SelectValue placeholder="Vendedor (opcional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin vendedor (solo /help, /ranking…)</SelectItem>
                {(vendedores ?? []).map((v) => (
                  <SelectItem key={v.id_vendedor} value={String(v.id_vendedor)}>
                    {v.nombre_erp}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        )}
      </div>

      {/* Mensajes */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 space-y-3 bg-[#e8eef3] min-h-[240px]"
      >
        {chat.length === 0 && !loading && (
          <div className="text-center py-8 px-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Escribí un comando o tocá un chip del menú para probar respuestas del bot con datos
              reales de la distribuidora seleccionada.
            </p>
          </div>
        )}

        {chat.map((entry, i) =>
          entry.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-sky-500 text-white px-3 py-2 text-sm shadow-sm">
                {entry.text}
              </div>
            </div>
          ) : (
            <div key={i} className="flex justify-start gap-2">
              <div className="size-7 rounded-full bg-sky-500/15 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="size-3.5 text-sky-600" />
              </div>
              <BotBubble message={entry.message} onButtonClick={handleCallback} />
            </div>
          ),
        )}

        {loading && (
          <div className="flex justify-start gap-2">
            <div className="size-7 rounded-full bg-sky-500/15 flex items-center justify-center shrink-0">
              <Bot className="size-3.5 text-sky-600" />
            </div>
            <div className="rounded-2xl rounded-bl-md bg-white border px-3 py-2.5 shadow-sm">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      {/* Chips de comandos visibles */}
      {menuChips.length > 0 && (
        <div className="shrink-0 px-3 py-2 border-t border-[var(--shelfy-border)] flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
          {menuChips.map((cmd) => (
            <button
              key={cmd}
              type="button"
              disabled={loading}
              className={cn(
                "text-[10px] font-mono px-2 py-1 rounded-lg bg-white border border-[var(--shelfy-border)]",
                "hover:bg-violet-50 hover:border-violet-200 transition-colors disabled:opacity-50",
              )}
              onClick={() => void sendInteraction({ text: cmd })}
            >
              {cmd}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="shrink-0 p-3 border-t border-[var(--shelfy-border)] bg-white flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="/stats, /ranking, /help…"
          className="flex-1 h-10 px-3 rounded-xl border border-[var(--shelfy-border)] text-sm bg-[var(--shelfy-bg)] focus:outline-none focus:ring-2 focus:ring-sky-500/30"
          disabled={loading || distId == null}
        />
        <Button
          type="submit"
          size="icon"
          className="rounded-xl shrink-0"
          disabled={loading || !input.trim() || distId == null}
        >
          <Send className="size-4" />
        </Button>
      </form>
    </Card>
  );
}
