"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageSquareText, Reply, Building2, UserCircle } from "lucide-react";

import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/Card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchPortalFeedbackMessages,
  patchPortalFeedbackReply,
  type PortalFeedbackRow,
} from "@/lib/api";

export default function AdminMensajesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [replyRow, setReplyRow] = useState<PortalFeedbackRow | null>(null);
  const [replyDraft, setReplyDraft] = useState("");

  useEffect(() => {
    if (user && !user.is_superadmin) router.replace("/dashboard");
  }, [user, router]);

  const { data, isLoading } = useQuery({
    queryKey: ["portal-feedback-messages"],
    queryFn: () => fetchPortalFeedbackMessages(250),
    enabled: !!user?.is_superadmin,
    staleTime: 30_000,
  });

  const replyMutation = useMutation({
    mutationFn: ({ id, r }: { id: string; r: string }) => patchPortalFeedbackReply(id, r),
    onSuccess: () => {
      toast.success("Respuesta guardada.");
      qc.invalidateQueries({ queryKey: ["portal-feedback-messages"] });
      setReplyRow(null);
      setReplyDraft("");
    },
    onError: (err: Error) => toast.error(err.message || "Error al guardar"),
  });

  if (!user?.is_superadmin) return null;

  const rows = data?.items ?? [];

  return (
    <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <BottomNav />

      <div className="flex flex-col flex-1 min-w-0">
        <Topbar title="Mensajes (desarrollo)" />

        <main className="flex-1 p-4 md:p-8 pb-28 md:pb-8 overflow-auto max-w-3xl mx-auto w-full">
          <div className="flex items-start gap-3 mb-6">
            <div className="size-12 rounded-2xl bg-violet-100 flex items-center justify-center shrink-0">
              <MessageSquareText className="size-6 text-[var(--shelfy-primary)]" />
            </div>
            <div>
              <h1 className="text-lg font-black text-[var(--shelfy-text)] tracking-tight">
                Tickets desde el comunicado CC / DIFusión
              </h1>
              <p className="text-xs text-[var(--shelfy-muted)] mt-0.5">
                Los usuarios escriben desde «Enviar mensaje al desarrollador» dentro de la guía.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {isLoading ? (
              [0, 1, 2].map((k) => <Skeleton key={k} className="h-32 w-full rounded-2xl" />)
            ) : rows.length === 0 ? (
              <Card className="p-8 rounded-2xl border-[var(--shelfy-border)] text-center text-sm text-muted-foreground">
                No hay mensajes todavía.
              </Card>
            ) : (
              rows.map((r) => {
                const hasReply = !!(r.respuesta && String(r.respuesta).trim());
                return (
                  <Card
                    key={r.id}
                    className="p-4 rounded-2xl border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] shadow-sm flex flex-col gap-3"
                  >
                    <div className="flex flex-wrap gap-2 items-center justify-between">
                      <div className="flex items-center gap-2 text-[11px] text-[var(--shelfy-muted)]">
                        <UserCircle size={13} />
                        <span className="font-semibold text-[var(--shelfy-text)]">
                          {r.usuario_snapshot ?? `User #${r.id_usuario}`}
                        </span>
                        <span className="text-[var(--shelfy-muted)]">({r.rol_snapshot || "?"})</span>
                      </div>
                      {!hasReply ? (
                        <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">
                          Sin respuesta
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700">
                          Respondido
                        </Badge>
                      )}
                    </div>
                    {r.id_distribuidor != null && (
                      <div className="flex items-center gap-1 text-[10px] text-[var(--shelfy-muted)]">
                        <Building2 size={11} /> Dist&nbsp;#{r.id_distribuidor}
                      </div>
                    )}
                    <p className="text-sm text-[var(--shelfy-text)] whitespace-pre-wrap leading-relaxed">
                      {r.contenido}
                    </p>
                    <p className="text-[10px] text-[var(--shelfy-muted)]">
                      {new Date(r.created_at).toLocaleString("es-AR")}
                    </p>
                    {hasReply && (
                      <div className="rounded-xl bg-emerald-50/70 border border-emerald-200/60 px-3 py-2 text-xs text-emerald-900">
                        <span className="font-bold block mb-1">Tu respuesta</span>
                        {r.respuesta}
                      </div>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs rounded-xl w-fit border-[var(--shelfy-border)]"
                      onClick={() => {
                        setReplyRow(r);
                        setReplyDraft(hasReply ? (r.respuesta ?? "") : "");
                      }}
                    >
                      <Reply size={13} /> {hasReply ? "Editar respuesta" : "Responder"}
                    </Button>
                  </Card>
                );
              })
            )}
          </div>
        </main>
      </div>

      <Dialog open={!!replyRow} onOpenChange={(o) => { if (!o) { setReplyRow(null); setReplyDraft(""); } }}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>{replyRow?.usuario_snapshot ?? "Usuario"}</DialogTitle>
            <DialogDescription className="text-xs">
              La respuesta queda guardada en el ticket. (En una próxima iteración el usuario podría ver las respuestas en el portal.)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-2 whitespace-pre-wrap max-h-[120px] overflow-y-auto">
              {replyRow?.contenido}
            </p>
            <Textarea
              value={replyDraft}
              onChange={(e) => setReplyDraft(e.target.value)}
              rows={8}
              className="text-sm resize-y min-h-[160px]"
              placeholder="Respondé desde producción..."
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => { setReplyRow(null); setReplyDraft(""); }}>
              Cancelar
            </Button>
            <Button
              size="sm"
              loading={replyMutation.isPending}
              disabled={replyDraft.trim().length < 1}
              onClick={() =>
                replyRow && replyMutation.mutate({ id: replyRow.id, r: replyDraft.trim() })
              }
            >
              Guardar respuesta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
