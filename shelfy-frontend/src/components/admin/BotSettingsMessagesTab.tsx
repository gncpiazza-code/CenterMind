"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchBotMessageTemplates, updateBotMessageTemplate } from "@/lib/api";
import { TelegramRichEditor } from "@/components/objetivos/TelegramRichEditor";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";

const KEY_LABELS: Record<string, string> = {
  bienvenida: "Bienvenida",
  bienvenida_nuevo: "Bienvenida (nuevo integrante)",
  ayuda: "Ayuda (/ayuda)",
  ranking: "Ranking (/ranking)",
  stats: "Estadísticas (/stats)",
  objetivos: "Objetivos (/objetivos)",
  sin_ruta: "Sin ruta asignada",
  foto_ok: "Foto recibida correctamente",
  foto_error: "Error al procesar foto",
  aprobada: "Exhibición aprobada",
  destacada: "Exhibición destacada",
  rechazada: "Exhibición rechazada",
};

function humanLabel(key: string): string {
  return KEY_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function MessageRow({ messageKey, bodyHtml }: { messageKey: string; bodyHtml: string }) {
  const [draft, setDraft] = useState(bodyHtml);
  const qc = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: () => updateBotMessageTemplate(messageKey, draft),
    onSuccess: () => {
      toast.success(`Mensaje "${humanLabel(messageKey)}" guardado.`);
      qc.invalidateQueries({ queryKey: ["bot-settings-messages"] });
    },
    onError: (e: Error) => toast.error(e.message || "Error al guardar"),
  });

  const isDirty = draft !== bodyHtml;

  return (
    <Card className="rounded-2xl border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm font-bold text-[var(--shelfy-text)]">{humanLabel(messageKey)}</p>
          <p className="text-[10px] font-mono text-muted-foreground">{messageKey}</p>
        </div>
        <Button
          size="sm"
          className="gap-1.5 rounded-xl"
          onClick={() => saveMutation.mutate()}
          disabled={!isDirty || saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Save className="size-3.5" />
          )}
          Guardar
        </Button>
      </div>
      <TelegramRichEditor
        value={draft}
        onChange={setDraft}
        placeholder="Escribí el mensaje en formato Telegram HTML…"
        rows={4}
      />
    </Card>
  );
}

export function BotSettingsMessagesTab() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["bot-settings-messages"],
    queryFn: fetchBotMessageTemplates,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-36 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <p className="text-sm text-destructive p-4">
        Error al cargar las plantillas de mensajes.
      </p>
    );
  }

  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground p-4">
        No hay plantillas de mensajes configuradas.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {data.map((tpl) => (
        <MessageRow key={tpl.message_key} messageKey={tpl.message_key} bodyHtml={tpl.body_html} />
      ))}
    </div>
  );
}
