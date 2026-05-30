"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link2, CheckCircle2, Loader2, Save, Sparkles, Unlink } from "lucide-react";

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
import { VendedorSearchCombobox } from "@/components/fuerza-ventas/VendedorSearchCombobox";
import {
  applyBindingDirect,
  unlinkBindingDirect,
  fetchBindingSuggest,
  fetchFuerzaVentasVendedores,
  fetchTelegramUsuariosGrupoFuerzaVentas,
  type GrupoBindingStatus,
  type GroupBindingSuggestResponse,
} from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  grupo: GrupoBindingStatus | null;
  distId: number;
  open: boolean;
  onClose: () => void;
}

function scoreLabel(score: number): string {
  return `${Math.round(score * 100)}%`;
}

function SuggestionHint({
  label,
  score,
}: {
  label: string;
  score: number;
}) {
  const variant = score >= 0.8 ? "default" : score >= 0.5 ? "secondary" : "outline";
  return (
    <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
      <Sparkles className="h-3 w-3 shrink-0 text-amber-500" />
      <span>Sugerido: {label}</span>
      <Badge variant={variant} className="text-[10px] px-1.5 py-0">
        {scoreLabel(score)}
      </Badge>
    </p>
  );
}

export function GrupoBindingSheet({ grupo, distId, open, onClose }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const username = user?.usuario || "portal";

  const chatId = grupo?.telegram_chat_id ?? null;

  const [vendedorId, setVendedorId] = useState<string>("");
  const [telegramUserId, setTelegramUserId] = useState<string>("");
  const [suggestion, setSuggestion] = useState<GroupBindingSuggestResponse | null>(
    null,
  );
  const [prefetchReady, setPrefetchReady] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);

  const skipVendorSuggest = useRef(false);
  const skipUidSuggest = useRef(false);
  const initialLoadDone = useRef(false);

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
    setSuggestion(null);
    setPrefetchReady(false);
    skipVendorSuggest.current = false;
    skipUidSuggest.current = false;
    initialLoadDone.current = false;
  }, [grupo]);

  const runSuggest = useCallback(
    async (
      opts?: { idVendedor?: number; telegramUserId?: number; silent?: boolean },
    ) => {
      if (chatId == null) return null;
      setSuggestLoading(true);
      try {
        const result = await fetchBindingSuggest(distId, chatId, opts);
        setSuggestion(result);
        setPrefetchReady(Boolean(result.prefetch_ready));
        return result;
      } catch {
        if (!opts?.silent) toast.error("No se pudo calcular sugerencias");
        return null;
      } finally {
        setSuggestLoading(false);
      }
    },
    [chatId, distId],
  );

  useEffect(() => {
    if (!open) {
      initialLoadDone.current = false;
    }
  }, [open]);

  // Prefetch al abrir: si el título del grupo indica vendedor, prellenar todo
  useEffect(() => {
    if (!open || chatId == null || !grupo || initialLoadDone.current) return;

    void (async () => {
      const result = await runSuggest({ silent: true });
      initialLoadDone.current = true;
      if (!result) return;

      const isUnlinked = grupo.binding_status !== "linked";
      if (!isUnlinked) return;

      const applyPrefetch = (res: GroupBindingSuggestResponse) => {
        let filled = false;
        if (res.vendedor_sugerido) {
          skipUidSuggest.current = true;
          setVendedorId(String(res.vendedor_sugerido.id_vendedor));
          filled = true;
        }
        if (res.uid_sugerido && (res.uid_sugerido.auto_fill || res.prefetch_ready)) {
          skipVendorSuggest.current = true;
          setTelegramUserId(String(res.uid_sugerido.telegram_user_id));
          filled = true;
        }
        return filled;
      };

      if (result.prefetch_ready) {
        applyPrefetch(result);
        return;
      }

      const hasVendor = grupo.id_vendedor_v2 != null;
      const hasUid = grupo.dominant_uploader_uid != null;
      let filled = false;

      if (!hasVendor && result.vendedor_sugerido?.auto_fill) {
        skipUidSuggest.current = true;
        setVendedorId(String(result.vendedor_sugerido.id_vendedor));
        filled = true;
      }

      if (
        !hasUid &&
        result.uid_sugerido?.auto_fill
      ) {
        skipVendorSuggest.current = true;
        setTelegramUserId(String(result.uid_sugerido.telegram_user_id));
        filled = true;
      }

      if (filled && result.vendedor_sugerido && result.uid_sugerido) {
        toast.info(
          `Sugerencia automática: ${result.vendedor_sugerido.nombre_erp} · UID ${result.uid_sugerido.telegram_user_id}`,
          { duration: 4000 },
        );
      }
    })();
  }, [open, chatId, grupo, runSuggest]);

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

  const handleVendedorChange = useCallback(
    async (value: string) => {
      setVendedorId(value);
      setPrefetchReady(false);
      if (skipVendorSuggest.current) {
        skipVendorSuggest.current = false;
        return;
      }
      const result = await runSuggest({
        idVendedor: Number(value),
        silent: true,
      });
      if (
        result?.uid_sugerido?.auto_fill &&
        !skipUidSuggest.current
      ) {
        skipUidSuggest.current = true;
        setTelegramUserId(String(result.uid_sugerido.telegram_user_id));
        const name =
          result.uid_sugerido.nombre_integrante ||
          String(result.uid_sugerido.telegram_user_id);
        toast.info(
          `UID sugerido para este vendedor: ${name} (${scoreLabel(result.uid_sugerido.score)})`,
          { duration: 3500 },
        );
      }
    },
    [runSuggest],
  );

  const handleUidSelect = useCallback(
    async (value: string) => {
      setTelegramUserId(value);
      setPrefetchReady(false);
      if (skipUidSuggest.current) {
        skipUidSuggest.current = false;
        return;
      }
      const result = await runSuggest({
        telegramUserId: Number(value),
        silent: true,
      });
      if (
        result?.vendedor_sugerido?.auto_fill &&
        !skipVendorSuggest.current &&
        !vendedorId
      ) {
        skipVendorSuggest.current = true;
        setVendedorId(String(result.vendedor_sugerido.id_vendedor));
        toast.info(
          `Vendedor sugerido: ${result.vendedor_sugerido.nombre_erp} (${scoreLabel(result.vendedor_sugerido.score)})`,
          { duration: 3500 },
        );
      }
    },
    [runSuggest, vendedorId],
  );

  const handleRecalcular = useCallback(async () => {
    const vid = vendedorId ? Number(vendedorId) : undefined;
    const uid = telegramUserId.trim() ? Number(telegramUserId) : undefined;
    const result = await runSuggest({ idVendedor: vid, telegramUserId: uid });
    if (!result) return;

    if (result.vendedor_sugerido?.auto_fill) {
      skipUidSuggest.current = true;
      setVendedorId(String(result.vendedor_sugerido.id_vendedor));
    }
    if (result.uid_sugerido?.auto_fill) {
      skipVendorSuggest.current = true;
      setTelegramUserId(String(result.uid_sugerido.telegram_user_id));
    }

    if (!result.vendedor_sugerido && !result.uid_sugerido) {
      toast.warning("No hay sugerencias con confianza suficiente");
    } else {
      toast.success("Sugerencias actualizadas");
    }
  }, [runSuggest, telegramUserId, vendedorId]);

  const sortedVendedores = [...vendedores].sort((a, b) =>
    a.nombre_erp.localeCompare(b.nombre_erp, "es"),
  );

  const vendorCandidates = suggestion?.vendedor_candidates ?? [];
  const vendorHint = suggestion?.vendedor_sugerido;
  const uidHint = suggestion?.uid_sugerido;
  const showVendorHint =
    vendorHint &&
    (!vendedorId || String(vendorHint.id_vendedor) === vendedorId);
  const showUidHint =
    uidHint &&
    (!telegramUserId || String(uidHint.telegram_user_id) === telegramUserId);

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

            {prefetchReady && suggestion?.prefetch_reason ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50/80 dark:bg-emerald-950/30 dark:border-emerald-900 px-3 py-3 space-y-1">
                <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Listo para confirmar
                </p>
                <p className="text-xs text-emerald-800/90 dark:text-emerald-200/90">
                  {suggestion.prefetch_reason}. Revisá los campos y guardá si coincide.
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-md border border-dashed px-3 py-2 bg-amber-50/50 dark:bg-amber-950/20">
                <p className="text-xs text-muted-foreground">
                  Al elegir vendedor o UID se completa el otro campo automáticamente.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleRecalcular()}
                  disabled={suggestLoading}
                >
                  {suggestLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <Sparkles className="h-3 w-3 mr-1" />
                  )}
                  Recalcular
                </Button>
              </div>
            )}

            <div className="space-y-2">
              <Label>Vendedor ERP</Label>
              <VendedorSearchCombobox
                vendedores={sortedVendedores}
                value={vendedorId}
                onChange={(v) => void handleVendedorChange(v)}
                disabled={loadingVendedores}
                loading={loadingVendedores}
                candidates={vendorCandidates}
              />
              {showVendorHint && (
                <SuggestionHint
                  label={vendorHint.nombre_erp}
                  score={vendorHint.score}
                />
              )}
            </div>

            <div className="space-y-2">
              <Label>Usuario Telegram (UID)</Label>
              {usuarios.length > 0 ? (
                <Select
                  value={telegramUserId || undefined}
                  onValueChange={(v) => void handleUidSelect(v)}
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
                onChange={(e) => {
                  setPrefetchReady(false);
                  setTelegramUserId(e.target.value.replace(/\D/g, ""));
                }}
              />
              {showUidHint && (
                <SuggestionHint
                  label={
                    uidHint.nombre_integrante
                      ? `${uidHint.nombre_integrante} (${uidHint.telegram_user_id})`
                      : String(uidHint.telegram_user_id)
                  }
                  score={uidHint.score}
                />
              )}
              <p className="text-xs text-muted-foreground">
                Uploader principal del grupo. Se infiere por integrantes, historial y
                exhibiciones recientes.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !vendedorId}
                className={prefetchReady ? "bg-emerald-600 hover:bg-emerald-700" : undefined}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : prefetchReady ? (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {prefetchReady ? "Confirmar vinculación" : "Guardar vinculación"}
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
