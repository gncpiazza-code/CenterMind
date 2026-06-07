"use client";

import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchBotCommands,
  createBotCustomCommand,
  deleteBotCustomCommand,
} from "@/lib/api";
import { TelegramRichEditor } from "@/components/objetivos/TelegramRichEditor";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Trash2, Plus, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const COMMAND_RE = /^[a-z][a-z0-9_]{0,31}$/;

function CustomCommandRow({ command, menuDescription }: { command: string; menuDescription: string }) {
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => deleteBotCustomCommand(command),
    onSuccess: () => {
      toast.success(`Comando /${command} eliminado.`);
      qc.invalidateQueries({ queryKey: ["bot-settings-commands"] });
      setConfirmOpen(false);
    },
    onError: (e: Error) => {
      toast.error(e.message || "Error al eliminar");
      setConfirmOpen(false);
    },
  });

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-mono font-semibold text-[var(--shelfy-text)] truncate">
          /{command}
        </p>
        <p className="text-[11px] text-muted-foreground truncate">{menuDescription}</p>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:bg-red-50 hover:text-destructive rounded-xl gap-1.5 shrink-0"
        disabled={deleteMutation.isPending}
        onClick={() => setConfirmOpen(true)}
      >
        {deleteMutation.isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Trash2 className="size-3.5" />
        )}
        Eliminar
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar /{command}</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. El comando dejará de estar disponible en el bot.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => setConfirmOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              className="rounded-xl bg-destructive text-white hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="size-3.5 animate-spin mr-1" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function BotSettingsCustomTab() {
  const qc = useQueryClient();

  const [command, setCommand] = useState("");
  const [menuDescription, setMenuDescription] = useState("");
  const [visibleInMenu, setVisibleInMenu] = useState(true);
  const [captionHtml, setCaptionHtml] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["bot-settings-commands"],
    queryFn: fetchBotCommands,
    staleTime: 60_000,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createBotCustomCommand({
        command,
        menu_description: menuDescription,
        visible_in_menu: visibleInMenu,
        caption_html: captionHtml,
        image_file: imageFile ?? undefined,
      }),
    onSuccess: () => {
      toast.success(`Comando /${command} creado.`);
      setCommand("");
      setMenuDescription("");
      setVisibleInMenu(true);
      setCaptionHtml("");
      setImageFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["bot-settings-commands"] });
    },
    onError: (e: Error) => toast.error(e.message || "Error al crear el comando"),
  });

  const customCommands = data?.filter((c) => c.kind === "static_media") ?? [];

  const commandError = command && !COMMAND_RE.test(command)
    ? "Solo letras minúsculas, números y guión bajo; debe comenzar con letra; máx. 32 chars."
    : null;

  const canCreate =
    COMMAND_RE.test(command) &&
    menuDescription.trim().length > 0 &&
    !createMutation.isPending;

  return (
    <div className="flex flex-col gap-6">
      {/* Existing custom commands */}
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive p-2">Error al cargar los comandos.</p>
      ) : customCommands.length > 0 ? (
        <Card className="rounded-2xl border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--shelfy-border)] bg-[var(--shelfy-bg)]/40">
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
              Comandos custom existentes ({customCommands.length})
            </span>
          </div>
          <div className="divide-y divide-[var(--shelfy-border)]/60">
            {customCommands.map((cmd) => (
              <CustomCommandRow
                key={cmd.command}
                command={cmd.command}
                menuDescription={cmd.menu_description}
              />
            ))}
          </div>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">No hay comandos custom configurados.</p>
      )}

      {/* Create new custom command */}
      <Card className="rounded-2xl border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Plus className="size-4 text-[var(--shelfy-primary)]" />
          <h2 className="text-sm font-bold text-[var(--shelfy-text)]">Crear comando custom</h2>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {/* Comando */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[var(--shelfy-text)]">
              Comando <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm select-none">
                /
              </span>
              <Input
                value={command}
                onChange={(e) => setCommand(e.target.value.toLowerCase())}
                placeholder="mi_comando"
                className={cn(
                  "pl-6 text-sm rounded-xl border-[var(--shelfy-border)]",
                  commandError && "border-destructive focus-visible:ring-destructive",
                )}
                maxLength={32}
              />
            </div>
            {commandError && (
              <p className="text-[11px] text-destructive leading-snug">{commandError}</p>
            )}
          </div>

          {/* Descripción menú */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[var(--shelfy-text)]">
              Descripción en menú <span className="text-destructive">*</span>
            </label>
            <Input
              value={menuDescription}
              onChange={(e) => setMenuDescription(e.target.value)}
              placeholder="Descripción breve del comando"
              className="text-sm rounded-xl border-[var(--shelfy-border)]"
              maxLength={255}
            />
          </div>
        </div>

        {/* Caption HTML */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-[var(--shelfy-text)]">
            Caption del mensaje
          </label>
          <TelegramRichEditor
            value={captionHtml}
            onChange={setCaptionHtml}
            placeholder="Texto del caption en formato Telegram HTML…"
            rows={3}
          />
        </div>

        {/* Imagen */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-[var(--shelfy-text)]">Imagen</label>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer rounded-xl border border-dashed border-[var(--shelfy-border)] px-4 py-2.5 text-sm text-muted-foreground hover:border-[var(--shelfy-primary)] hover:text-[var(--shelfy-primary)] transition-colors">
              <ImageIcon className="size-4 shrink-0" />
              {imageFile ? imageFile.name : "Seleccionar imagen…"}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {imageFile && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive rounded-xl"
                onClick={() => {
                  setImageFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              >
                Quitar
              </Button>
            )}
          </div>
        </div>

        {/* Visible en menú */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="visible-in-menu"
            checked={visibleInMenu}
            onChange={(e) => setVisibleInMenu(e.target.checked)}
            className="rounded border-[var(--shelfy-border)] accent-[var(--shelfy-primary)] size-4"
          />
          <label htmlFor="visible-in-menu" className="text-sm text-[var(--shelfy-text)] cursor-pointer">
            Visible en el menú de Telegram
          </label>
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            className="gap-2 rounded-xl"
            onClick={() => createMutation.mutate()}
            disabled={!canCreate}
          >
            {createMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Crear comando
          </Button>
        </div>
      </Card>
    </div>
  );
}
