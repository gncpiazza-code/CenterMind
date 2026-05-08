"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronRight,
  ExternalLink,
  Layers,
  Loader2,
  MessageSquareText,
  Pencil,
  Sparkles,
  UserCircle,
  FileJson,
  ArrowDown,
  ArrowUp,
} from "lucide-react";

import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { PortalTicketContenido } from "@/components/admin/PortalTicketContenido";
import {
  exportPortalFeedbackMessagesJson,
  fetchPortalFeedbackMessages,
  generatePortalTicketPreResolution,
  patchPortalFeedbackReply,
  type PortalFeedbackRow,
  type PortalTicketClasificacionAgent,
  type PortalTicketCampos,
  type PortalTicketPreResolucion,
} from "@/lib/api";

function TicketHeaderFields({ campos }: { campos: PortalTicketCampos | null | undefined }) {
  if (!campos || (!campos.asunto && !campos.prioridad)) return null;
  return (
    <div className="flex flex-wrap gap-2 items-center text-xs">
      {campos.prioridad ? (
        <Badge variant="outline" className="text-[10px] border-rose-200 text-rose-800">
          Prioridad (usuario): {campos.prioridad}
        </Badge>
      ) : null}
      {campos.asunto ? (
        <span className="font-semibold text-[var(--shelfy-text)] leading-snug">{campos.asunto}</span>
      ) : null}
    </div>
  );
}

function CriticidadBadge({ level }: { level?: string | null }) {
  const v = (level || "media").toLowerCase();
  const cls: Record<string, string> = {
    critica:
      "border-rose-400/80 bg-rose-500/12 text-rose-900 dark:text-rose-100",
    alta: "border-orange-300/80 bg-orange-500/12 text-orange-900 dark:text-orange-100",
    media: "border-amber-200/90 bg-amber-500/10 text-amber-950 dark:text-amber-50",
    baja: "border-slate-200 bg-slate-100/80 text-slate-700 dark:text-slate-200",
  };
  return (
    <Badge variant="outline" className={`text-[10px] font-bold uppercase tracking-wide ${cls[v] || cls.media}`}>
      {v}
    </Badge>
  );
}

function TicketRulesPanel({ c }: { c: PortalTicketClasificacionAgent }) {
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
        <Layers className="size-3.5 text-violet-600 shrink-0" aria-hidden />
        <span className="text-[10px] font-black uppercase tracking-wider text-violet-800">Clasificación automática</span>
        <Badge variant="outline" className="text-[10px] font-semibold border-violet-300/80 bg-white/80">
          {c.categoria_etiqueta}
        </Badge>
        <CriticidadBadge level={c.criticidad} />
        <Badge variant="secondary" className="text-[10px] capitalize">
          Conf. {c.confianza}
        </Badge>
      </div>
      {c.criticidad_motivo ? (
        <p className="text-[10px] text-muted-foreground leading-snug">
          <span className="font-semibold text-[var(--shelfy-text)]">Criticidad (reglas):</span> {c.criticidad_motivo}
        </p>
      ) : null}
      <p className="text-[13px] leading-snug text-[var(--shelfy-text)]">{c.hipotesis_falla}</p>
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
  );
}

function PanelAnalisisIa({ pre, loading }: { pre: PortalTicketPreResolucion | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="rounded-xl border border-dashed border-violet-200 bg-violet-50/40 p-4 flex items-center gap-2 text-sm text-violet-900">
        <Loader2 className="size-4 animate-spin shrink-0" />
        Generando análisis con IA (Gemini)…
      </div>
    );
  }
  if (!pre) return null;
  const critIa = pre.criticidad_ia;
  const catIa = pre.categoria_etiqueta_corta_es;
  return (
    <div className="rounded-xl border border-violet-300/55 bg-gradient-to-br from-violet-50/90 to-white p-4 space-y-3 text-sm shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="size-4 text-violet-600" aria-hidden />
        <span className="font-black text-[11px] uppercase tracking-wider text-violet-900">
          Posible solución · {pre.fuente}
          {pre.modelo ? (
            <span className="ml-1 font-mono font-normal opacity-75"> · {pre.modelo}</span>
          ) : null}
        </span>
        {catIa ? (
          <Badge variant="outline" className="text-[10px] bg-white/90">
            {catIa}
          </Badge>
        ) : null}
        {critIa ? <CriticidadBadge level={critIa} /> : null}
      </div>
      {critIa && pre.justificacion_criticidad_ia ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-[var(--shelfy-text)]">Por qué esta criticidad (IA):</span>{" "}
          {pre.justificacion_criticidad_ia}
        </p>
      ) : null}
      {(pre.resumen_ticket || pre.resumen) ? (
        <p className="text-[var(--shelfy-text)] leading-snug">{pre.resumen_ticket || pre.resumen}</p>
      ) : null}
      {(pre.hipotesis_principal || pre.hipotesis) ? (
        <div>
          <p className="text-[10px] font-bold uppercase text-violet-900 mb-1">Hipótesis técnica</p>
          <p className="text-xs leading-relaxed text-[var(--shelfy-text)]">{pre.hipotesis_principal || pre.hipotesis}</p>
        </div>
      ) : null}
      {(pre.archivos_o_modulos_sospechosos ?? pre.codigo_posible)?.length ? (
        <div>
          <p className="text-[10px] font-bold uppercase text-violet-900 mb-1">Archivos / módulos a revisar</p>
          <ul className="font-mono text-[11px] space-y-0.5 text-violet-950/90 bg-white/70 rounded-lg px-2 py-1.5 border border-violet-100">
            {(pre.archivos_o_modulos_sospechosos ?? pre.codigo_posible ?? []).slice(0, 12).map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {(pre.checks_ordenados ?? pre.checks_sugeridos)?.length ? (
        <div>
          <p className="text-[10px] font-bold uppercase text-violet-900 mb-1">Pasos ordenados</p>
          <ol className="list-decimal pl-4 space-y-1 text-xs text-[var(--shelfy-text)]">
            {(pre.checks_ordenados ?? pre.checks_sugeridos ?? []).map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}
      {pre.mensaje_supervisor_si_aplica ? (
        <div className="rounded-lg bg-emerald-50/90 border border-emerald-200/70 px-2 py-1.5 text-xs text-emerald-950 whitespace-pre-wrap">
          <span className="font-bold">Para copiar al usuario:</span> {pre.mensaje_supervisor_si_aplica}
        </div>
      ) : null}
      {pre.error_proveedor ? (
        <p className="text-xs text-destructive">Proveedor IA: {pre.error_proveedor}</p>
      ) : null}
    </div>
  );
}

export default function AdminTicketsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();

  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "answered">("all");
  const [distFilter, setDistFilter] = useState<string>("all");
  const [criticidadFilter, setCriticidadFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [order, setOrder] = useState<"desc" | "asc">("desc");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selected, setSelected] = useState<PortalFeedbackRow | null>(null);
  const [replyDraft, setReplyDraft] = useState("");

  useEffect(() => {
    if (user && !user.is_superadmin) router.replace("/dashboard");
  }, [user, router]);

  const { data, isLoading } = useQuery({
    queryKey: ["portal-feedback-messages", categoryFilter, statusFilter, distFilter, search, order],
    queryFn: () =>
      fetchPortalFeedbackMessages({
        limit: 300,
        category_id: categoryFilter !== "all" ? categoryFilter : undefined,
        status: statusFilter,
        dist_id: distFilter !== "all" ? Number(distFilter) : undefined,
        q: search.trim() || undefined,
        order,
      }),
    enabled: !!user?.is_superadmin,
    staleTime: 30_000,
  });

  const rowsRaw = useMemo(() => data?.items ?? [], [data?.items]);

  const rows = useMemo(() => {
    if (criticidadFilter === "all") return rowsRaw;
    return rowsRaw.filter(
      (r) => String(r.clasificacion_agent?.criticidad || "").toLowerCase() === criticidadFilter,
    );
  }, [rowsRaw, criticidadFilter]);

  const categoryOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rowsRaw) {
      const c = r.clasificacion_agent;
      if (!c?.categoria_id) continue;
      if (!map.has(c.categoria_id)) map.set(c.categoria_id, c.categoria_etiqueta || c.categoria_id);
    }
    return [...map.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1]), "es"));
  }, [rowsRaw]);

  const distOptions = useMemo(() => {
    const ids = new Set<number>();
    for (const r of rowsRaw) if (typeof r.id_distribuidor === "number") ids.add(r.id_distribuidor);
    return Array.from(ids).sort((a, b) => a - b);
  }, [rowsRaw]);

  const analysisQ = useQuery({
    queryKey: ["portal-ticket-ia-analysis", selected?.id],
    queryFn: () => generatePortalTicketPreResolution(selected!.id),
    enabled: !!user?.is_superadmin && sheetOpen && !!selected?.id,
    staleTime: 45 * 60 * 1000,
  });

  const replyMutation = useMutation({
    mutationFn: ({ id, r }: { id: string; r: string }) => patchPortalFeedbackReply(id, r),
    onSuccess: () => {
      toast.success("Respuesta guardada.");
      qc.invalidateQueries({ queryKey: ["portal-feedback-messages"] });
      qc.invalidateQueries({ queryKey: ["portal-feedback-pending-count"] });
      setSheetOpen(false);
      setSelected(null);
      setReplyDraft("");
    },
    onError: (err: Error) => toast.error(err.message || "Error al guardar"),
  });

  function openTicket(r: PortalFeedbackRow) {
    setSelected(r);
    const hasReply = !!(r.respuesta && String(r.respuesta).trim());
    setReplyDraft(hasReply ? (r.respuesta ?? "") : "");
    setSheetOpen(true);
  }

  if (!user?.is_superadmin) return null;

  const pre = analysisQ.data?.pre_resolucion ?? null;
  const clasificMerged = analysisQ.data?.clasificacion_agent ?? selected?.clasificacion_agent;

  return (
    <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <BottomNav />

      <div className="flex flex-col flex-1 min-w-0">
        <Topbar title="Tickets" />

        <main className="flex-1 p-4 md:p-8 pb-28 md:pb-8 overflow-hidden flex flex-col min-h-0 w-full max-w-[1400px] mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
            <div className="flex items-start gap-3 min-w-0">
              <div className="size-11 rounded-2xl bg-violet-100 flex items-center justify-center shrink-0">
                <MessageSquareText className="size-5 text-[var(--shelfy-primary)]" />
              </div>
              <div>
                <h1 className="text-xl font-black text-[var(--shelfy-text)] tracking-tight">Centro de tickets</h1>
                <p className="text-xs text-muted-foreground mt-0.5 max-w-xl leading-relaxed">
                  Tabla tipo consola · clasificación automática y criticidad al listar · análisis con IA en el detalle al
                  abrir cada fila.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="default"
              className="rounded-xl gap-2 shrink-0 shadow-sm bg-[var(--shelfy-primary)]"
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
                  a.download = `tickets-shelfy-${stamp}.json`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                  toast.success("Export JSON descargado.");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Export falló");
                }
              }}
            >
              <FileJson className="size-4" /> Export JSON
            </Button>
          </div>

          <Card className="rounded-2xl border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] flex flex-col overflow-hidden shadow-sm mb-4">
            <div className="p-4 flex flex-col lg:flex-row gap-3 lg:items-center border-b border-[var(--shelfy-border)]/70">
              <div className="flex flex-wrap gap-2 flex-1">
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-[200px] h-9 text-xs rounded-xl border-[var(--shelfy-border)]">
                    <SelectValue placeholder="Categoría" />
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
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                  <SelectTrigger className="w-[148px] h-9 text-xs rounded-xl border-[var(--shelfy-border)]">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="all" className="text-xs">
                      Estado: todos
                    </SelectItem>
                    <SelectItem value="pending" className="text-xs">
                      Sin respuesta
                    </SelectItem>
                    <SelectItem value="answered" className="text-xs">
                      Respondido
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Select value={distFilter} onValueChange={setDistFilter}>
                  <SelectTrigger className="w-[130px] h-9 text-xs rounded-xl border-[var(--shelfy-border)]">
                    <SelectValue placeholder="Dist." />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="all" className="text-xs">
                      Todas dist.
                    </SelectItem>
                    {distOptions.map((d) => (
                      <SelectItem key={d} value={String(d)} className="text-xs">
                        #{d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={criticidadFilter} onValueChange={setCriticidadFilter}>
                  <SelectTrigger className="w-[150px] h-9 text-xs rounded-xl border-[var(--shelfy-border)]">
                    <SelectValue placeholder="Criticidad" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="all" className="text-xs">
                      Crít.: todas
                    </SelectItem>
                    <SelectItem value="critica" className="text-xs">
                      Crítica
                    </SelectItem>
                    <SelectItem value="alta" className="text-xs">
                      Alta
                    </SelectItem>
                    <SelectItem value="media" className="text-xs">
                      Media
                    </SelectItem>
                    <SelectItem value="baja" className="text-xs">
                      Baja
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar texto, usuario, hipótesis…"
                className="h-9 text-xs rounded-xl max-w-sm lg:max-w-[280px] border-[var(--shelfy-border)]"
              />
            </div>

            <div className="overflow-x-auto min-h-[240px]">
              {isLoading ? (
                <div className="p-8 space-y-3">
                  <Skeleton className="h-10 w-full rounded-xl" />
                  <Skeleton className="h-10 w-full rounded-xl" />
                  <Skeleton className="h-10 w-full rounded-xl" />
                </div>
              ) : rows.length === 0 ? (
                <p className="p-12 text-center text-sm text-muted-foreground">
                  {rowsRaw.length === 0 ? "No hay tickets aún." : "Sin coincidencias con estos filtros."}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-[var(--shelfy-border)]/80">
                      <TableHead className="text-[10px] uppercase font-black text-muted-foreground w-[180px]">Usuario</TableHead>
                      <TableHead className="text-[10px] uppercase font-black text-muted-foreground">Asunto</TableHead>
                      <TableHead className="text-[10px] uppercase font-black text-muted-foreground w-[72px]">Dist</TableHead>
                      <TableHead className="text-[10px] uppercase font-black text-muted-foreground min-w-[140px]">
                        Categoría
                      </TableHead>
                      <TableHead className="text-[10px] uppercase font-black text-muted-foreground w-[88px]">Crítico</TableHead>
                      <TableHead className="text-[10px] uppercase font-black text-muted-foreground w-[100px]">Estado</TableHead>
                      <TableHead 
                        className="text-[10px] uppercase font-black text-muted-foreground w-[120px] cursor-pointer hover:text-violet-500 transition-colors select-none"
                        onClick={() => setOrder(order === "desc" ? "asc" : "desc")}
                        title="Click para ordenar por fecha"
                      >
                        <div className="flex items-center gap-1">
                          Fecha
                          {order === "desc" ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />}
                        </div>
                      </TableHead>
                      <TableHead className="text-[10px] uppercase font-black text-muted-foreground w-[72px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => {
                      const clf = r.clasificacion_agent;
                      const asunto =
                        clf?.campos_ticket?.asunto ||
                        String(r.contenido || "").split("\n")[0]?.slice(0, 72) ||
                        "(sin asunto)";
                      const hasReply = !!(r.respuesta && String(r.respuesta).trim());
                      return (
                        <TableRow
                          key={r.id}
                          className="cursor-pointer border-[var(--shelfy-border)]/70 hover:bg-violet-50/50 dark:hover:bg-violet-950/20 transition-colors"
                          onClick={() => openTicket(r)}
                        >
                          <TableCell className="py-3 align-middle">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <UserCircle className="size-3.5 shrink-0 text-muted-foreground" />
                              <span className="text-xs font-semibold truncate text-[var(--shelfy-text)]">
                                {r.usuario_snapshot ?? `#${r.id_usuario}`}
                              </span>
                            </div>
                            <span className="text-[10px] text-muted-foreground">({r.rol_snapshot ?? "?"})</span>
                          </TableCell>
                          <TableCell className="py-3 max-w-[320px] align-middle">
                            <span className="text-xs line-clamp-2 text-[var(--shelfy-text)]">{asunto}</span>
                          </TableCell>
                          <TableCell className="py-3 text-xs tabular-nums text-muted-foreground">
                            {r.id_distribuidor ?? "—"}
                          </TableCell>
                          <TableCell className="py-3 align-middle">
                            {clf ? (
                              <Badge variant="outline" className="text-[10px] font-normal max-w-[220px] whitespace-normal bg-white/60">
                                {clf.categoria_etiqueta}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="py-3 align-middle">
                            <CriticidadBadge level={clf?.criticidad} />
                          </TableCell>
                          <TableCell className="py-3 align-middle">
                            {hasReply ? (
                              <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-800">
                                Respondido
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-800">
                                Pendiente
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="py-3 text-[11px] text-muted-foreground whitespace-nowrap">
                            {new Date(r.created_at).toLocaleString("es-AR", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </TableCell>
                          <TableCell className="py-3 text-right align-middle">
                            <ChevronRight className="size-4 text-muted-foreground inline" aria-hidden />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>

            {!isLoading && rows.length > 0 ? (
              <div className="px-4 py-2 border-t border-[var(--shelfy-border)]/70 text-[11px] text-muted-foreground">
                Mostrando <strong className="text-[var(--shelfy-text)]">{rows.length}</strong>
                {criticidadFilter !== "all" ? ` filtradas · ${rowsRaw.length} totales cargadas` : ` tickets`}
              </div>
            ) : null}
          </Card>
        </main>
      </div>

      <Sheet
        open={sheetOpen}
        onOpenChange={(o) => {
          setSheetOpen(o);
          if (!o) {
            setSelected(null);
            setReplyDraft("");
          }
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-xl md:max-w-2xl lg:max-w-3xl p-0 gap-0 border-l-[var(--shelfy-border)] flex flex-col bg-[var(--shelfy-bg)]"
        >
          <SheetHeader className="p-6 pb-4 border-b border-[var(--shelfy-border)] shrink-0 text-left bg-[var(--shelfy-panel)]">
            <SheetTitle className="text-lg font-black text-[var(--shelfy-text)] tracking-tight pr-10">
              Ticket · {selected?.usuario_snapshot ?? "Usuario"}
            </SheetTitle>
            <SheetDescription className="text-xs flex flex-wrap gap-2 items-center">
              Dist <span className="font-mono">#{selected?.id_distribuidor ?? "?"}</span>
              · ID <span className="font-mono">{selected?.id}</span>
              {selected?.created_at ? (
                <>
                  · {new Date(selected.created_at).toLocaleString("es-AR")}
                </>
              ) : null}
              {clasificMerged?.categoria_etiqueta ? (
                <>
                  · <Badge variant="secondary">{clasificMerged.categoria_etiqueta}</Badge>
                </>
              ) : null}
              <CriticidadBadge level={clasificMerged?.criticidad} />
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="flex-1 min-h-0 px-6">
            <div className="py-4 flex flex-col gap-4 pb-28">
              {clasificMerged ? <TicketRulesPanel c={clasificMerged as PortalTicketClasificacionAgent} /> : null}
              <TicketHeaderFields campos={clasificMerged?.campos_ticket} />

              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1.5">Mensaje</p>
                <Card className="rounded-xl border-[var(--shelfy-border)] p-3 bg-white/70">
                  <PortalTicketContenido text={selected?.contenido ?? ""} />
                </Card>
              </div>

              <Separator />

              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-violet-900 mb-2 flex items-center gap-1">
                  <Sparkles className="size-3.5" />
                  Análisis IA (automático al abrir)
                </p>
                <PanelAnalisisIa pre={pre} loading={analysisQ.isLoading} />
              </div>

              {selected?.respuesta ? (
                <div className="rounded-xl bg-emerald-50/80 border border-emerald-200 px-3 py-2 text-xs text-emerald-950 whitespace-pre-wrap">
                  <span className="font-bold flex items-center gap-1 mb-1">
                    <ExternalLink size={12} /> Respuesta publicada
                  </span>
                  {selected.respuesta}
                </div>
              ) : null}
            </div>
          </ScrollArea>

          <SheetFooter className="p-6 pt-4 border-t border-[var(--shelfy-border)] shrink-0 flex-col gap-3 items-stretch bg-[var(--shelfy-panel)]">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Pencil size={13} /> Responder cliente (queda persistida en el ticket)
            </div>
            <Textarea
              value={replyDraft}
              onChange={(e) => setReplyDraft(e.target.value)}
              rows={5}
              className="text-sm resize-y min-h-[120px] rounded-xl border-[var(--shelfy-border)]"
              placeholder="Escribí la respuesta…"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl"
                onClick={() => analysisQ.refetch()}
                disabled={!selected?.id || analysisQ.isFetching}
              >
                {analysisQ.isFetching ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                &nbsp;Regenerar IA
              </Button>
              <Button
                type="button"
                size="sm"
                className="rounded-xl bg-[var(--shelfy-primary)]"
                loading={replyMutation.isPending}
                disabled={!replyDraft.trim() || !selected}
                onClick={() => selected && replyMutation.mutate({ id: selected.id, r: replyDraft.trim() })}
              >
                Guardar respuesta
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
