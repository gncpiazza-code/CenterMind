"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Layers, MessageSquareText, Reply, Building2, Sparkles, UserCircle } from "lucide-react";

import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/Card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PortalTicketContenido } from "@/components/admin/PortalTicketContenido";
import {
  fetchPortalFeedbackMessages,
  exportPortalFeedbackMessagesJson,
  generatePortalTicketPreResolution,
  patchPortalFeedbackReply,
  type PortalFeedbackRow,
  type PortalTicketClasificacionAgent,
  type PortalTicketCampos,
  type PortalTicketPreResolucion,
} from "@/lib/api";
import { Input } from "@/components/ui/Input";

function TicketHeaderFields({ campos }: { campos: PortalTicketCampos | null | undefined }) {
  if (!campos || (!campos.asunto && !campos.prioridad)) return null;
  return (
    <div className="flex flex-wrap gap-2 items-center text-xs">
      {campos.prioridad ? (
        <Badge variant="outline" className="text-[10px] border-rose-200 text-rose-800">
          Prioridad: {campos.prioridad}
        </Badge>
      ) : null}
      {campos.asunto ? (
        <span className="font-semibold text-[var(--shelfy-text)] leading-snug">{campos.asunto}</span>
      ) : null}
    </div>
  );
}

function TicketAgentPanel({ c }: { c: PortalTicketClasificacionAgent }) {
  const conf = c.confianza;
  const confCls =
    conf === "alta"
      ? "border-violet-400/55 bg-violet-50/85"
      : conf === "media"
        ? "border-amber-300/65 bg-amber-50/65"
        : "border-slate-200 bg-slate-50/90";
  return (
    <div className={`rounded-xl border px-3 py-2.5 text-xs space-y-2 ${confCls}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="size-3.5 text-violet-600 shrink-0" aria-hidden />
        <span className="text-[10px] font-black uppercase tracking-wider text-violet-800">
          Clasificación agente
        </span>
        <Badge variant="outline" className="text-[10px] font-semibold border-violet-300/80 bg-white/80">
          {c.categoria_etiqueta}
        </Badge>
        <Badge variant="secondary" className="text-[10px] capitalize">
          Conf. {c.confianza}
        </Badge>
        {c.reglas_version ? (
          <span className="text-[9px] text-muted-foreground tabular-nums font-mono">{c.reglas_version}</span>
        ) : null}
      </div>
      <p className="text-[13px] leading-snug text-[var(--shelfy-text)]">{c.hipotesis_falla}</p>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1">
          <Layers className="size-3" aria-hidden />
          Dónde puede estar el fallo
        </p>
        <div className="flex flex-wrap gap-1.5">
          {c.capas_afectadas.map((cap) => (
            <Badge
              key={cap.id}
              variant="outline"
              className="text-[10px] font-normal max-w-full whitespace-normal text-left bg-white/70"
            >
              {cap.etiqueta}
            </Badge>
          ))}
        </div>
      </div>
      {c.señales_detectadas && c.señales_detectadas.length > 0 ? (
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          <span className="font-semibold text-[var(--shelfy-text)]">Reglas disparadas:</span>{" "}
          {c.señales_detectadas.join(" · ")}
        </p>
      ) : null}
      {c.revision_checklist && c.revision_checklist.length > 0 ? (
        <div className="pt-1 border-t border-violet-200/50">
          <p className="text-[10px] font-bold uppercase tracking-wide text-violet-900 mb-1.5">
            Checklist revisión (mapa / padrón)
          </p>
          <ul className="list-disc pl-4 space-y-1 text-[11px] text-[var(--shelfy-text)] leading-snug">
            {c.revision_checklist.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default function AdminTicketsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [replyRow, setReplyRow] = useState<PortalFeedbackRow | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "answered">("all");
  const [distFilter, setDistFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [preById, setPreById] = useState<Record<string, PortalTicketPreResolucion>>({});

  useEffect(() => {
    if (user && !user.is_superadmin) router.replace("/dashboard");
  }, [user, router]);

  const { data, isLoading } = useQuery({
    queryKey: ["portal-feedback-messages", categoryFilter, statusFilter, distFilter, search],
    queryFn: () =>
      fetchPortalFeedbackMessages({
        limit: 250,
        category_id: categoryFilter !== "all" ? categoryFilter : undefined,
        status: statusFilter,
        dist_id: distFilter !== "all" ? Number(distFilter) : undefined,
        q: search.trim() || undefined,
      }),
    enabled: !!user?.is_superadmin,
    staleTime: 30_000,
  });

  const replyMutation = useMutation({
    mutationFn: ({ id, r }: { id: string; r: string }) => patchPortalFeedbackReply(id, r),
    onSuccess: () => {
      toast.success("Respuesta guardada.");
      qc.invalidateQueries({ queryKey: ["portal-feedback-messages"] });
      qc.invalidateQueries({ queryKey: ["portal-feedback-pending-count"] });
      setReplyRow(null);
      setReplyDraft("");
    },
    onError: (err: Error) => toast.error(err.message || "Error al guardar"),
  });

  const rows = useMemo(() => data?.items ?? [], [data?.items]);

  const categoryOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      const c = r.clasificacion_agent;
      if (!c?.categoria_id) continue;
      if (!map.has(c.categoria_id)) map.set(c.categoria_id, c.categoria_etiqueta || c.categoria_id);
    }
    return [...map.entries()].sort((a, b) =>
      String(a[1]).localeCompare(String(b[1]), "es"),
    );
  }, [rows]);

  const filteredRows = rows;
  const distOptions = useMemo(() => {
    const ids = new Set<number>();
    for (const r of rows) if (typeof r.id_distribuidor === "number") ids.add(r.id_distribuidor);
    return Array.from(ids).sort((a, b) => a - b);
  }, [rows]);

  const preMutation = useMutation({
    mutationFn: (id: string) => generatePortalTicketPreResolution(id),
    onSuccess: (res) => {
      if (res?.id && res.pre_resolucion) {
        setPreById((prev) => ({ ...prev, [res.id]: res.pre_resolucion }));
        toast.success("Pre-resolución generada.");
      }
    },
    onError: (err: Error) => toast.error(err.message || "No se pudo generar la pre-resolución"),
  });

  if (!user?.is_superadmin) return null;

  return (
    <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <BottomNav />

      <div className="flex flex-col flex-1 min-w-0">
        <Topbar title="Tickets (portal)" />

        <main className="flex-1 p-4 md:p-8 pb-28 md:pb-8 overflow-auto max-w-4xl mx-auto w-full">
          <div className="flex items-start gap-3 mb-6">
            <div className="size-12 rounded-2xl bg-violet-100 flex items-center justify-center shrink-0">
              <MessageSquareText className="size-6 text-[var(--shelfy-primary)]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-black text-[var(--shelfy-text)] tracking-tight">
                Tickets del portal Shelfy
              </h1>
              <p className="text-xs text-[var(--shelfy-muted)] mt-0.5">
                Incluye lo enviado desde la guía CC / Difusión. El agente clasifica tema, capas técnicas e hipótesis
                (reglas Shelfy&nbsp;— sin LLM).
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:items-center mb-5">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-72 h-10 text-xs rounded-xl border-[var(--shelfy-border)]">
                <SelectValue placeholder="Filtrar por categoría del agente" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all" className="text-xs">
                  Todas las categorías
                </SelectItem>
                {categoryOptions.map(([id, label]) => (
                  <SelectItem key={id} value={id} className="text-xs">
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | "pending" | "answered")}>
              <SelectTrigger className="w-full sm:w-52 h-10 text-xs rounded-xl border-[var(--shelfy-border)]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all" className="text-xs">Todos</SelectItem>
                <SelectItem value="pending" className="text-xs">Sin respuesta</SelectItem>
                <SelectItem value="answered" className="text-xs">Respondidos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={distFilter} onValueChange={setDistFilter}>
              <SelectTrigger className="w-full sm:w-44 h-10 text-xs rounded-xl border-[var(--shelfy-border)]">
                <SelectValue placeholder="Distribuidora" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all" className="text-xs">Todas dist.</SelectItem>
                {distOptions.map((d) => (
                  <SelectItem key={d} value={String(d)} className="text-xs">
                    Dist #{d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar texto, usuario o hipótesis..."
              className="h-10 text-xs rounded-xl sm:max-w-72"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-xl text-xs"
              onClick={async () => {
                try {
                  const payload = await exportPortalFeedbackMessagesJson({
                    limit: 1000,
                    category_id: categoryFilter !== "all" ? categoryFilter : undefined,
                    status: statusFilter,
                    dist_id: distFilter !== "all" ? Number(distFilter) : undefined,
                    q: search.trim() || undefined,
                  });
                  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
                  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `tickets-portal-${stamp}.json`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                  toast.success("Export JSON generado.");
                } catch (e) {
                  const msg = e instanceof Error ? e.message : "No se pudo exportar";
                  toast.error(msg);
                }
              }}
            >
              Exportar JSON
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Mostrando <span className="font-semibold text-[var(--shelfy-text)]">{filteredRows.length}</span> de{" "}
              <span className="font-semibold text-[var(--shelfy-text)]">{rows.length}</span> tickets
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {isLoading ? (
              [0, 1, 2].map((k) => <Skeleton key={k} className="h-40 w-full rounded-2xl" />)
            ) : filteredRows.length === 0 ? (
              <Card className="p-8 rounded-2xl border-[var(--shelfy-border)] text-center text-sm text-muted-foreground">
                {rows.length === 0
                  ? "No hay tickets todavía."
                  : "No hay tickets en esta categoría — probá con «Todas»."}
              </Card>
            ) : (
              filteredRows.map((r) => {
                const hasReply = !!(r.respuesta && String(r.respuesta).trim());
                const clf = r.clasificacion_agent;
                const campos = clf?.campos_ticket;
                return (
                  <Card
                    key={r.id}
                    className="p-4 rounded-2xl border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] shadow-sm flex flex-col gap-3"
                  >
                    <div className="flex flex-wrap gap-2 items-center justify-between">
                      <div className="flex items-center gap-2 text-[11px] text-[var(--shelfy-muted)] min-w-0">
                        <UserCircle size={13} />
                        <span className="font-semibold text-[var(--shelfy-text)] truncate">
                          {r.usuario_snapshot ?? `User #${r.id_usuario}`}
                        </span>
                        <span className="text-[var(--shelfy-muted)] shrink-0">({r.rol_snapshot || "?"})</span>
                      </div>
                      {!hasReply ? (
                        <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 shrink-0">
                          Sin respuesta
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700 shrink-0">
                          Respondido
                        </Badge>
                      )}
                    </div>
                    {r.id_distribuidor != null && (
                      <div className="flex items-center gap-1 text-[10px] text-[var(--shelfy-muted)]">
                        <Building2 size={11} /> Dist&nbsp;#{r.id_distribuidor}
                      </div>
                    )}
                    {clf ? <TicketAgentPanel c={clf} /> : null}
                    <TicketHeaderFields campos={campos} />
                    <PortalTicketContenido text={r.contenido} />
                    <p className="text-[10px] text-[var(--shelfy-muted)]">
                      {new Date(r.created_at).toLocaleString("es-AR")}
                    </p>
                    {hasReply && (
                      <div className="rounded-xl bg-emerald-50/70 border border-emerald-200/60 px-3 py-2 text-xs text-emerald-900 whitespace-pre-wrap">
                        <span className="font-bold block mb-1">Tu respuesta</span>
                        {r.respuesta}
                      </div>
                    )}
                    {preById[r.id] ? (
                      <div className="rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-2 text-xs text-violet-950 space-y-1.5">
                        <span className="font-bold block">Pre-resolución ({preById[r.id].fuente})</span>
                        {preById[r.id].resumen ? <p>{preById[r.id].resumen}</p> : null}
                        {preById[r.id].hipotesis ? (
                          <p>
                            <span className="font-semibold">Hipótesis:</span> {preById[r.id].hipotesis}
                          </p>
                        ) : null}
                        {preById[r.id].checks_sugeridos?.length ? (
                          <ul className="list-disc pl-4 space-y-1">
                            {preById[r.id].checks_sugeridos?.slice(0, 6).map((line, i) => <li key={i}>{line}</li>)}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}
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
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs rounded-xl w-fit border-[var(--shelfy-border)]"
                      disabled={preMutation.isPending}
                      onClick={() => preMutation.mutate(r.id)}
                    >
                      <Sparkles size={13} /> Pre-resolución IA
                    </Button>
                  </Card>
                );
              })
            )}
          </div>
        </main>
      </div>

      <Dialog
        open={!!replyRow}
        onOpenChange={(o) => {
          if (!o) {
            setReplyRow(null);
            setReplyDraft("");
          }
        }}
      >
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>{replyRow?.usuario_snapshot ?? "Usuario"}</DialogTitle>
            <DialogDescription className="text-xs">
              La respuesta queda guardada en el ticket. (En una próxima iteración el usuario podría ver las
              respuestas en el portal.)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3 max-h-[280px] overflow-y-auto space-y-2">
              {replyRow?.clasificacion_agent ? <TicketAgentPanel c={replyRow.clasificacion_agent} /> : null}
              <TicketHeaderFields campos={replyRow?.clasificacion_agent?.campos_ticket} />
              <PortalTicketContenido
                text={replyRow?.contenido ?? ""}
                className="text-xs leading-relaxed text-[var(--shelfy-text)] whitespace-pre-wrap break-words flex flex-col gap-2"
              />
            </div>
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
