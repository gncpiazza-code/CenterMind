"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchBotCommands, updateBotCommand } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Info } from "lucide-react";

const KIND_LABELS: Record<string, string> = {
  system: "Sistema",
  system_pdf: "Sistema PDF",
  static_media: "Media estática",
  admin_only: "Solo admin",
};

export function BotSettingsCommandsTab() {
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["bot-settings-commands"],
    queryFn: fetchBotCommands,
    staleTime: 60_000,
  });

  const patchMutation = useMutation({
    mutationFn: ({
      command,
      patch,
    }: {
      command: string;
      patch: { visible_in_menu?: boolean; enabled?: boolean };
    }) => updateBotCommand(command, patch),
    onSuccess: (res, { command, patch }) => {
      qc.invalidateQueries({ queryKey: ["bot-settings-commands"] });
      const sync = res?.menu_sync;
      const syncOk = sync && sync.updated > 0 && (sync.errors?.length ?? 0) === 0;
      const label = patch.visible_in_menu === false ? "oculto del menú" : patch.visible_in_menu ? "visible en menú" : patch.enabled === false ? "deshabilitado" : "actualizado";
      if (syncOk) {
        toast.success(`/${command} ${label}. Menú Telegram sincronizado (${sync!.updated} bot(s)).`);
      } else if (sync?.errors?.length) {
        toast.warning(`/${command} guardado, pero falló sync Telegram: ${sync.errors[0]}`);
      } else {
        toast.success(`/${command} ${label}.`);
      }
    },
    onError: (e: Error) => toast.error(e.message || "Error al actualizar el comando"),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <p className="text-sm text-destructive p-4">Error al cargar los comandos.</p>
    );
  }

  const visibleCommands = data.filter(
    (c) => c.kind === "system" || c.kind === "system_pdf",
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Nota aclaratoria */}
      <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-900">
        <Info className="size-3.5 shrink-0 mt-0.5" />
        <span>
          Al cambiar <b>Visible menú</b> o <b>Habilitado</b>, el menú de Telegram se sincroniza
          automáticamente en todos los bots activos. Ocultar del menú no deshabilita el handler.
        </span>
      </div>

      <Card className="rounded-2xl border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-4 py-2.5 border-b border-[var(--shelfy-border)] bg-[var(--shelfy-bg)]/40">
          <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
            Comando
          </span>
          <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground w-24 text-center">
            Tipo
          </span>
          <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground w-24 text-center">
            Visible menú
          </span>
          <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground w-24 text-center">
            Habilitado
          </span>
        </div>

        {visibleCommands.length === 0 ? (
          <p className="text-sm text-muted-foreground p-6 text-center">
            No hay comandos built-in configurados.
          </p>
        ) : (
          <div className="divide-y divide-[var(--shelfy-border)]/60">
            {visibleCommands.map((cmd) => (
              <div
                key={cmd.command}
                className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-mono font-semibold text-[var(--shelfy-text)] truncate">
                    /{cmd.command}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {cmd.menu_description}
                  </p>
                </div>

                <div className="w-24 flex justify-center">
                  <Badge variant="outline" className="text-[10px] font-normal">
                    {KIND_LABELS[cmd.kind] ?? cmd.kind}
                  </Badge>
                </div>

                <div className="w-24 flex justify-center">
                  <Switch
                    checked={cmd.visible_in_menu}
                    onCheckedChange={(val) =>
                      patchMutation.mutate({
                        command: cmd.command,
                        patch: { visible_in_menu: val },
                      })
                    }
                    disabled={patchMutation.isPending}
                    aria-label={`Visible en menú: ${cmd.command}`}
                  />
                </div>

                <div className="w-24 flex justify-center">
                  <Switch
                    checked={cmd.enabled}
                    onCheckedChange={(val) =>
                      patchMutation.mutate({
                        command: cmd.command,
                        patch: { enabled: val },
                      })
                    }
                    disabled={patchMutation.isPending}
                    aria-label={`Habilitado: ${cmd.command}`}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
