"use client";

import { useEffect, useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link2, Loader2, Save, Unlink, Wand2 } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  applyBindingDirect,
  unlinkBindingDirect,
  fetchBindingGroupCandidates,
  fetchFuerzaVentasVendedores,
  fetchTelegramUsuariosGrupoFuerzaVentas,
  type GrupoBindingStatus,
} from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  grupo: GrupoBindingStatus | null;
  distId: number;
  open: boolean;
  onClose: () => void;
}

export function GrupoBindingSheet({ grupo, distId, open, onClose }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const username = user?.usuario || "portal";

  const chatId = grupo?.telegram_chat_id ?? null;

  const [vendedorId, setVendedorId] = useState<string>("");
  const [telegramUserId, setTelegramUserId] = useState<string>("");
  const [suggestLoading, setSuggestLoading] = useState(false);

  const { data: vendedores = [], isLoading: loadingVendedores } = useQuery({
    queryKey: ["fv-vendedores", distId],
    queryFn: () => fetchFuerzaVentasVendedores(distId),
    enabled: open && distId > 0,
    staleTime: 60_000,
  });

  const { data: usuarios = [], isLoading: loadingUsuarios } = useQuery({
    queryKey: ["fv-usuarios", distId, chatId],
    queryFn: () => fetchTelegramUsuariosGrupoFuerzaVentas(distId, chatId ?? undefined),
    enabled: open && distId > 0 && chatId != null,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!grupo) return;
    setVendedorId(grupo.id_vendedor_v2 != null ? String(grupo.id_vendedor_v2) : "");
    setTelegramUserId(
      grupo.dominant_uploader_uid != null ? String(grupo.dominant_uploader_uid) : "",
    );
  }, [grupo]);

  const invalidateAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["binding-grupos", distId] });
    qc.invalidateQueries({ queryKey: ["binding-health", distId] });
    qc.invalidateQueries({ queryKey: ["binding-suggestions", distId] });
    qc.invalidateQueries({ queryKey: ["fv-vendedores", distId] });
  }, [qc, distId]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (chatId == null || !vendedorId) {
        throw new Error("Seleccioná un vendedor ERP");
      }
      const uid = telegramUserId.trim() ? Number(telegramUserId) : null;
      await applyBindingDirect(
        distId,
        chatId,
        Number(vendedorId),
        username,
        uid,
      );
    },
    onSuccess: () => {
      toast.success("Grupo vinculado correctamente");
      invalidateAll();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message || "Error al guardar vinculación"),
  });

  const unlinkMutation = useMutation({
    mutationFn: async () => {
      if (chatId == null) return;
      await unlinkBindingDirect(distId, chatId, username);
    },
    onSuccess: () => {
      toast.success("Grupo desvinculado");
      invalidateAll();
      onClose();
    },
    onError: () => toast.error("Error al desvincular"),
  });

  const handleSugerir = useCallback(async () => {
    if (chatId == null) return;
    setSuggestLoading(true);
    try {
      const candidates = await fetchBindingGroupCandidates(distId, chatId);
      if (!candidates.length) {
        toast.warning("No hay candidatos para este grupo");
        return;
      }
      const top = candidates[0];
      setVendedorId(String(top.id_vendedor));
      toast.success(
        `Sugerido: ${top.nombre_erp} (${Math.round(top.score * 100)}% confianza)`,
      );
    } catch {
      toast.error("No se pudo obtener sugerencias");
    } finally {
      setSuggestLoading(false);
    }
  }, [chatId, distId]);

  const sortedVendedores = [...vendedores].sort((a, b) =>
    a.nombre_erp.localeCompare(b.nombre_erp, "es"),
  );

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Configurar grupo
          </SheetTitle>
          <SheetDescription>
            {grupo?.nombre_grupo || (chatId != null ? `Grupo ${chatId}` : "—")}
          </SheetDescription>
        </SheetHeader>

        {grupo && (
          <div className="space-y-6">
            <div className="rounded-lg border p-3 text-sm space-y-1 bg-muted/40">
              <p>
                <span className="text-muted-foreground">Chat ID:</span>{" "}
                <code className="text-xs">{grupo.telegram_chat_id}</code>
              </p>
              <p>
                <span className="text-muted-foreground">Integrantes:</span>{" "}
                {grupo.integrantes_count ?? 0}
              </p>
              <p>
                <span className="text-muted-foreground">Estado:</span>{" "}
                <Badge variant="secondary">{grupo.binding_status}</Badge>
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Vendedor ERP</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleSugerir}
                  disabled={suggestLoading}
                >
                  {suggestLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <Wand2 className="h-3 w-3 mr-1" />
                  )}
                  Sugerir
                </Button>
              </div>
              <Select
                value={vendedorId || undefined}
                onValueChange={setVendedorId}
                disabled={loadingVendedores}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar vendedor..." />
                </SelectTrigger>
                <SelectContent>
                  {sortedVendedores.map((v) => (
                    <SelectItem key={v.id_vendedor} value={String(v.id_vendedor)}>
                      {v.nombre_erp}
                      {v.sucursal_nombre ? ` · ${v.sucursal_nombre}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Usuario Telegram (UID)</Label>
              {usuarios.length > 0 ? (
                <Select
                  value={telegramUserId || undefined}
                  onValueChange={setTelegramUserId}
                  disabled={loadingUsuarios}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Integrante del grupo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {usuarios.map((u) =>
                      u.telegram_user_id != null ? (
                        <SelectItem
                          key={u.id}
                          value={String(u.telegram_user_id)}
                        >
                          {u.nombre_integrante} ({u.telegram_user_id})
                        </SelectItem>
                      ) : null,
                    )}
                  </SelectContent>
                </Select>
              ) : null}
              <Input
                inputMode="numeric"
                placeholder="UID manual (ej. 8397016600)"
                value={telegramUserId}
                onChange={(e) => setTelegramUserId(e.target.value.replace(/\D/g, ""))}
              />
              <p className="text-xs text-muted-foreground">
                Uploader principal del grupo. Opcional pero recomendado para drift y legacy binding.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !vendedorId}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Guardar vinculación
              </Button>
              {grupo.binding_status === "linked" && (
                <Button
                  variant="outline"
                  onClick={() => unlinkMutation.mutate()}
                  disabled={unlinkMutation.isPending}
                >
                  {unlinkMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Unlink className="h-4 w-4 mr-2" />
                  )}
                  Desvincular grupo
                </Button>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
