"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchBotMessageFlows,
  repairAllBotMessages,
  resetBotMessageTemplate,
  updateBotMessageTemplate,
  type BotFlowNode,
  type BotMessageFlow,
} from "@/lib/api";
import { TelegramRichEditor } from "@/components/objetivos/TelegramRichEditor";
import { telegramHtmlToRenderHtml } from "@/lib/telegram-html";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ArrowDown,
  ChevronRight,
  Loader2,
  MessageSquare,
  RotateCcw,
  Save,
} from "lucide-react";

function FlowNodeCard({
  node,
  isSelected,
  isLast,
  onSelect,
}: {
  node: BotFlowNode;
  isSelected: boolean;
  isLast: boolean;
  onSelect: () => void;
}) {
  return (
    <div className="flex flex-col items-center w-full max-w-md mx-auto">
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "w-full text-left rounded-2xl border px-4 py-3 transition-all",
          "bg-white shadow-sm hover:shadow-md",
          isSelected
            ? "border-violet-400 ring-2 ring-violet-200"
            : "border-[var(--shelfy-border)] hover:border-violet-200",
        )}
      >
        <div className="flex items-start gap-2">
          <div
            className={cn(
              "size-8 rounded-xl flex items-center justify-center shrink-0 text-sm",
              isSelected ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600",
            )}
          >
            <MessageSquare className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold text-[var(--shelfy-text)]">{node.label}</p>
              {node.node_type === "dynamic_part" && (
                <Badge variant="outline" className="text-[9px] h-5 rounded-md border-amber-200 text-amber-800 bg-amber-50">
                  Plantilla dinámica
                </Badge>
              )}
              {node.is_customized && (
                <Badge variant="secondary" className="text-[9px] h-5 rounded-md">
                  Editado
                </Badge>
              )}
            </div>
            <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{node.message_key}</p>
            {node.description ? (
              <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{node.description}</p>
            ) : null}
          </div>
          <ChevronRight
            className={cn(
              "size-4 shrink-0 mt-1 transition-transform",
              isSelected ? "rotate-90 text-violet-600" : "text-muted-foreground",
            )}
          />
        </div>
        <div
          className="mt-2 text-xs text-[var(--shelfy-text)] line-clamp-3 leading-relaxed [&_b]:font-bold"
          dangerouslySetInnerHTML={{
            __html: telegramHtmlToRenderHtml(node.body_html.slice(0, 180)),
          }}
        />
      </button>
      {!isLast && (
        <div className="flex flex-col items-center py-1 text-muted-foreground/60">
          <div className="w-px h-3 bg-gradient-to-b from-violet-200 to-violet-400" />
          <ArrowDown className="size-3.5" />
        </div>
      )}
    </div>
  );
}

function NodeEditor({ node, onSaved }: { node: BotFlowNode; onSaved: () => void }) {
  const [draft, setDraft] = useState(() => node.body_html);
  const qc = useQueryClient();

  useEffect(() => {
    setDraft(node.body_html);
  }, [node.message_key, node.body_html]);

  const saveMutation = useMutation({
    mutationFn: () => updateBotMessageTemplate(node.message_key, draft),
    onSuccess: () => {
      toast.success(`"${node.label}" guardado.`);
      qc.invalidateQueries({ queryKey: ["bot-settings-flows"] });
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message || "Error al guardar"),
  });

  const resetMutation = useMutation({
    mutationFn: () => resetBotMessageTemplate(node.message_key),
    onSuccess: () => {
      setDraft(node.default_html);
      toast.success("Restaurado al texto por defecto.");
      qc.invalidateQueries({ queryKey: ["bot-settings-flows"] });
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message || "Error al restaurar"),
  });

  const isDirty = draft !== node.body_html;

  return (
    <Card className="rounded-2xl border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] p-4 flex flex-col gap-3 sticky top-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-black text-[var(--shelfy-text)]">{node.label}</p>
          <p className="text-[10px] font-mono text-muted-foreground">{node.message_key}</p>
          {node.node_type === "dynamic_part" && (
            <p className="text-[10px] text-amber-700 mt-1">
              Parte de un mensaje compuesto — el bot repite o ensambla bloques en runtime.
            </p>
          )}
        </div>
        <div className="flex gap-1.5 shrink-0">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-xl gap-1 h-8 text-xs"
            onClick={() => resetMutation.mutate()}
            disabled={resetMutation.isPending || !node.is_customized}
            title="Restaurar default"
          >
            <RotateCcw className="size-3" />
            Default
          </Button>
          <Button
            type="button"
            size="sm"
            className="rounded-xl gap-1 h-8 text-xs"
            onClick={() => saveMutation.mutate()}
            disabled={!isDirty || saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Save className="size-3" />
            )}
            Guardar
          </Button>
        </div>
      </div>

      {node.description ? (
        <p className="text-xs text-muted-foreground leading-relaxed">{node.description}</p>
      ) : null}

      {node.placeholders.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {node.placeholders.map((ph) => (
            <code
              key={ph}
              className="text-[10px] px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-800 border border-violet-100"
            >
              {`{${ph}}`}
            </code>
          ))}
        </div>
      )}

      <TelegramRichEditor
        key={node.message_key}
        value={draft}
        onChange={setDraft}
        placeholder="Mensaje Telegram HTML…"
        rows={6}
      />

      <div className="rounded-xl bg-[#e8eef3] p-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
          Preview
        </p>
        <div
          className="rounded-xl bg-white border px-3 py-2 text-sm leading-relaxed [&_b]:font-bold [&_code]:font-mono [&_code]:text-xs"
          dangerouslySetInnerHTML={{ __html: telegramHtmlToRenderHtml(draft) }}
        />
      </div>
    </Card>
  );
}

export function BotSettingsFlowsTab() {
  const [activeFlowId, setActiveFlowId] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const qc = useQueryClient();

  const repairMutation = useMutation({
    mutationFn: repairAllBotMessages,
    onSuccess: (res) => {
      toast.success(
        `Mensajes reparados: ${res.fixed} corregidos, ${res.reset_to_default} restaurados al default.`,
      );
      qc.invalidateQueries({ queryKey: ["bot-settings-flows"] });
    },
    onError: (e: Error) => toast.error(e.message || "Error al reparar mensajes"),
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ["bot-settings-flows"],
    queryFn: fetchBotMessageFlows,
    staleTime: 30_000,
  });

  const flows = data ?? [];
  const activeFlow = useMemo(
    () => flows.find((f) => f.flow_id === (activeFlowId ?? flows[0]?.flow_id)),
    [flows, activeFlowId],
  );

  const selectedNode = useMemo(
    () => activeFlow?.nodes.find((n) => n.message_key === selectedKey) ?? null,
    [activeFlow, selectedKey],
  );

  useEffect(() => {
    if (activeFlow?.nodes.length && !selectedKey) {
      setSelectedKey(activeFlow.nodes[0].message_key);
    }
  }, [activeFlow, selectedKey]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (isError || !flows.length) {
    return (
      <p className="text-sm text-destructive p-4">
        Error al cargar los flujos de conversación.
      </p>
    );
  }

  const currentFlowId = activeFlow?.flow_id ?? flows[0].flow_id;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-violet-50 border border-violet-100 px-3 py-2.5 text-xs text-violet-900 leading-relaxed flex flex-wrap items-center justify-between gap-2">
        <span>
          Diagrama de flujos del bot: cada nodo es un mensaje editable. Los cambios aplican a{" "}
          <b>todos los tenants</b>. Usá placeholders como <code>{`{nombre_dist}`}</code> donde corresponda.
          Probá en el simulador de chat →
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs shrink-0 bg-white"
          disabled={repairMutation.isPending}
          onClick={() => repairMutation.mutate()}
        >
          {repairMutation.isPending ? (
            <Loader2 className="size-3.5 animate-spin mr-1.5" />
          ) : (
            <RotateCcw className="size-3.5 mr-1.5" />
          )}
          Reparar saltos de línea
        </Button>
      </div>

      {/* Selector de flujos */}
      <div className="flex flex-wrap gap-2">
        {flows.map((flow: BotMessageFlow) => (
          <button
            key={flow.flow_id}
            type="button"
            onClick={() => {
              setActiveFlowId(flow.flow_id);
              setSelectedKey(flow.nodes[0]?.message_key ?? null);
            }}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors",
              currentFlowId === flow.flow_id
                ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                : "bg-white border-[var(--shelfy-border)] hover:border-violet-200 text-[var(--shelfy-text)]",
            )}
          >
            <span>{flow.icon}</span>
            <span>{flow.title}</span>
            <Badge
              variant="secondary"
              className={cn(
                "text-[9px] h-4 px-1.5 rounded-md",
                currentFlowId === flow.flow_id && "bg-white/20 text-white border-0",
              )}
            >
              {flow.nodes.length}
            </Badge>
          </button>
        ))}
      </div>

      {activeFlow && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {/* Diagrama vertical */}
          <Card className="rounded-2xl border-[var(--shelfy-border)] bg-gradient-to-b from-slate-50 to-white p-4 md:p-6 min-h-[320px]">
            <div className="mb-4">
              <h3 className="text-sm font-black text-[var(--shelfy-text)]">
                {activeFlow.icon} {activeFlow.title}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">{activeFlow.description}</p>
            </div>
            <div className="flex flex-col gap-0 py-2">
              {activeFlow.nodes.map((node, idx) => (
                <FlowNodeCard
                  key={node.message_key}
                  node={node}
                  isSelected={selectedKey === node.message_key}
                  isLast={idx === activeFlow.nodes.length - 1}
                  onSelect={() => setSelectedKey(node.message_key)}
                />
              ))}
            </div>
          </Card>

          {/* Editor del nodo seleccionado */}
          {selectedNode ? (
            <NodeEditor
              key={selectedNode.message_key}
              node={selectedNode}
              onSaved={() => {}}
            />
          ) : (
            <Card className="rounded-2xl border-dashed border-[var(--shelfy-border)] p-8 flex items-center justify-center text-sm text-muted-foreground">
              Seleccioná un nodo del diagrama para editarlo
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
