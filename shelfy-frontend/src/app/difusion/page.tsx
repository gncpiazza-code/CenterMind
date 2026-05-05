"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, CreditCard, Users, AlertCircle, CheckCircle2,
  Loader2, Radio, Building2, ChevronDown, Target, Image, TrendingUp,
  Clock, CalendarDays, BarChart2, BookOpen, Eye, AlertTriangle,
  MessageSquare, ShieldAlert, Bot,
} from "lucide-react";

import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  fetchDifusionVendedores, postDifusionCCTelegram,
  fetchVendedoresSupervision, fetchDifusionVendedorResumen,
  fetchSigoDetail, postDifusionSIGOTelegram,
  postDifusionCCTelegramPreview,
  type DifusionVendedor, type DifusionCCResult, type DifusionVendedorResumen,
  type SigoDetailResponse, type DifusionSIGOResult, type DifusionPreviewResult,
  type DifusionPreviewItem,
} from "@/lib/api";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CCDifusionGuiaDialog } from "@/components/onboarding/CCDifusionGuiaDialog";

const PLANTILLAS = [
  {
    label: "Recordatorio de deuda",
    text: "Hola! Te compartimos el resumen de cuentas corrientes pendientes a la fecha. Por favor gestioná el cobro de los clientes incluidos en el PDF. ¡Gracias!",
  },
  {
    label: "Cierre de mes",
    text: "¡Cierre de mes! Adjuntamos el detalle de saldos pendientes. Es fundamental regularizar antes del próximo corte. Ante dudas, consultá con tu supervisor.",
  },
  {
    label: "Sin mensaje",
    text: "",
  },
];

const PREVIEW_THINKING_STEPS = [
  "Conectando con Telegram...",
  "Calculando envíos por vendedor...",
  "Validando grupos y conflictos...",
  "Preparando vista previa final...",
];

export default function DifusionPage() {
  const { user, effectiveDistribuidorId } = useAuth();
  const router = useRouter();
  const distId = effectiveDistribuidorId ?? 0;

  // ── CC state ──
  const [modo, setModo]               = useState<"uno" | "todos">("uno");
  const [sucursal, setSucursal]       = useState<string>("");
  const [idVendedor, setIdVendedor]   = useState<number | null>(null);
  const [mensaje, setMensaje]         = useState(PLANTILLAS[0].text);
  const [result, setResult]           = useState<DifusionCCResult | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  // ── Preview modal state ──
  const [previewOpen, setPreviewOpen]           = useState(false);
  const [previewData, setPreviewData]           = useState<DifusionPreviewResult | null>(null);
  const [previewLoading, setPreviewLoading]     = useState(false);
  const [previewError, setPreviewError]         = useState<string | null>(null);
  const [conflictOverride, setConflictOverride] = useState(false);
  const [previewStepIdx, setPreviewStepIdx]     = useState(0);
  const [previewFakePct, setPreviewFakePct]     = useState(8);

  // ── SIGO state ──
  const [sigoModo, setSigoModo]       = useState<"uno" | "todos">("todos");
  const [sigoSucursal, setSigoSucursal] = useState<string>("");
  const [sigoVendedor, setSigoVendedor] = useState<number | null>(null);
  const [sigoMensaje, setSigoMensaje] = useState("");
  const [sigoResult, setSigoResult]   = useState<DifusionSIGOResult | null>(null);

  /** Reabrir el comunicado (el auto-open está en dashboard tras login). */
  const [guiaOpen, setGuiaOpen] = useState(false);

  useEffect(() => {
    if (!user) router.replace("/dashboard");
  }, [user, router]);

  // ── Base vendors (for sucursal list) ──
  const { data: vendedoresBase = [], isLoading: loadingBase } = useQuery({
    queryKey: ["supervision-vendedores", distId],
    queryFn: () => fetchVendedoresSupervision(distId),
    enabled: !!distId,
    staleTime: 10 * 60_000,
  });

  const sucursales = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const v of vendedoresBase) {
      const s = v.sucursal_nombre;
      if (s && !seen.has(s)) { seen.add(s); list.push(s); }
    }
    return list.sort();
  }, [vendedoresBase]);

  // ── CC vendors ──
  const { data: vendedoresDifusion = [], isLoading: loadingVend } = useQuery<DifusionVendedor[]>({
    queryKey: ["difusion-vendedores", distId, sucursal],
    queryFn: () => fetchDifusionVendedores(distId, sucursal || undefined),
    enabled: !!distId,
    staleTime: 5 * 60_000,
  });

  const vendedoresConTelegram = useMemo(
    () => vendedoresDifusion.filter((v) => v.tiene_telegram),
    [vendedoresDifusion]
  );

  useEffect(() => { setIdVendedor(null); }, [sucursal]);

  const selectedVend = useMemo(
    () => vendedoresDifusion.find((v) => v.id_vendedor === idVendedor) ?? null,
    [vendedoresDifusion, idVendedor]
  );

  const { data: resumen, isLoading: loadingResumen } = useQuery<DifusionVendedorResumen>({
    queryKey: ["difusion-resumen", distId, idVendedor],
    queryFn: () => fetchDifusionVendedorResumen(distId, idVendedor!),
    enabled: !!distId && !!idVendedor && modo === "uno",
    staleTime: 2 * 60_000,
  });

  // ── SIGO data ──
  const { data: sigoDetail, isLoading: sigoLoading } = useQuery<SigoDetailResponse>({
    queryKey: ["sigo-detail-difusion", distId],
    queryFn: () => fetchSigoDetail(distId),
    enabled: !!distId,
    staleTime: 5 * 60_000,
  });

  const { data: vendedoresSigo = [], isLoading: loadingSigoVend } = useQuery<DifusionVendedor[]>({
    queryKey: ["difusion-vendedores-sigo", distId, sigoSucursal],
    queryFn: () => fetchDifusionVendedores(distId, sigoSucursal || undefined),
    enabled: !!distId,
    staleTime: 5 * 60_000,
  });

  useEffect(() => { setSigoVendedor(null); }, [sigoSucursal]);

  const sigoKpiAgg = useMemo(() => {
    const rows = sigoDetail?.por_vendedor_y_dia ?? [];
    return {
      planeadas: rows.reduce((s, r) => s + r.planeadas, 0),
      ejecutadas: rows.reduce((s, r) => s + r.ejecutadas, 0),
      conVenta: rows.reduce((s, r) => s + r.con_venta, 0),
      sinInfo: rows.reduce((s, r) => s + r.sin_info, 0),
    };
  }, [sigoDetail]);

  // ── CC mutation ──
  const ccMutation = useMutation({
    mutationFn: () =>
      postDifusionCCTelegram({
        dist_id: distId,
        modo,
        id_vendedor: modo === "uno" ? idVendedor : null,
        sucursal: sucursal || null,
        mensaje_template: mensaje,
      }),
    onSuccess: (data) => {
      setResult(data);
      setConfirmando(false);
      if (data.enviados.length > 0) toast.success(`${data.enviados.length} envío(s) completado(s)`);
      if (data.errores.length > 0) toast.error(`${data.errores.length} envío(s) fallido(s)`);
    },
    onError: (err: Error) => {
      setConfirmando(false);
      toast.error(err.message || "Error al enviar");
    },
  });

  // ── SIGO mutation ──
  const sigoMutation = useMutation({
    mutationFn: () =>
      postDifusionSIGOTelegram({
        dist_id: distId,
        modo: sigoModo,
        id_vendedor: sigoModo === "uno" && sigoVendedor ? sigoVendedor : undefined,
        mensaje_template: sigoMensaje || undefined,
        sigo_data: sigoDetail,
      }),
    onSuccess: (data) => {
      setSigoResult(data);
      if (data.enviados.length > 0) toast.success(`${data.enviados.length} envío(s) completado(s)`);
      if (data.errores.length > 0) toast.error(`${data.errores.length} envío(s) fallido(s)`);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Error al enviar SIGO");
    },
  });

  const canSendCC =
    !!distId && (modo === "todos" ? vendedoresConTelegram.length > 0 : !!idVendedor);

  async function openPreview() {
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewData(null);
    setConflictOverride(false);
    setPreviewStepIdx(0);
    setPreviewFakePct(10);
    setPreviewOpen(true);
    try {
      const data = await postDifusionCCTelegramPreview({
        dist_id: distId,
        modo,
        id_vendedor: modo === "uno" ? idVendedor : null,
        sucursal: sucursal || null,
      });
      setPreviewData(data);
    } catch (e: unknown) {
      setPreviewError(e instanceof Error ? e.message : "Error al cargar preview");
    } finally {
      setPreviewLoading(false);
    }
  }

  useEffect(() => {
    if (!previewLoading) return;
    const stepTimer = window.setInterval(() => {
      setPreviewStepIdx((i) => (i + 1) % PREVIEW_THINKING_STEPS.length);
    }, 1800);
    const progressTimer = window.setInterval(() => {
      setPreviewFakePct((p) => (p < 92 ? p + Math.max(2, Math.round((100 - p) * 0.08)) : p));
    }, 350);
    return () => {
      window.clearInterval(stepTimer);
      window.clearInterval(progressTimer);
    };
  }, [previewLoading]);

  function confirmFromPreview() {
    setPreviewOpen(false);
    setResult(null);
    ccMutation.mutate();
  }

  const canSendSigo =
    !!distId && (sigoModo === "todos"
      ? vendedoresSigo.filter((v) => v.tiene_telegram).length > 0
      : !!sigoVendedor);

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <BottomNav />

      <div className="flex flex-col flex-1 min-w-0">
        <Topbar title="Difusión" />

        <main className="flex-1 p-4 md:p-6 pb-28 md:pb-8 overflow-auto">
          <div className="max-w-2xl mx-auto flex flex-col gap-5">
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs rounded-full gap-1.5 border-[var(--shelfy-border)] text-[var(--shelfy-text)] bg-[var(--shelfy-panel)]"
                onClick={() => setGuiaOpen(true)}
              >
                <BookOpen className="size-3.5 text-[var(--shelfy-primary)] shrink-0" />
                Guía CC y Telegram
              </Button>
            </div>

            <Tabs defaultValue="cc">
              <TabsList className="w-full">
                <TabsTrigger value="cc" className="flex-1 gap-1.5 text-xs">
                  <CreditCard className="w-3.5 h-3.5" />
                  Cuentas Corrientes
                </TabsTrigger>
                <TabsTrigger value="sigo" className="flex-1 gap-1.5 text-xs">
                  <BarChart2 className="w-3.5 h-3.5" />
                  SIGO
                </TabsTrigger>
              </TabsList>

              {/* ──────────────────────────────────────────── */}
              {/* TAB CC                                       */}
              {/* ──────────────────────────────────────────── */}
              <TabsContent value="cc" className="flex flex-col gap-5 mt-4">
                <div>
                  <h2 className="text-lg font-black text-[var(--shelfy-text)] tracking-tight flex items-center gap-2">
                    <Radio className="w-5 h-5 text-[var(--shelfy-primary)]" />
                    Cuentas Corrientes vía Telegram
                  </h2>
                  <p className="text-xs text-[var(--shelfy-muted)] mt-1">
                    Enviá el PDF de CC activas al grupo Telegram del vendedor.
                  </p>
                </div>

                {/* Sucursal */}
                <div className="rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] p-4 flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-[var(--shelfy-text)] uppercase tracking-wide">
                    <Building2 className="w-3.5 h-3.5 text-amber-400" />
                    Sucursal
                  </div>
                  <Select value={sucursal || "__all__"} onValueChange={(v) => setSucursal(v === "__all__" ? "" : v)}>
                    <SelectTrigger className="h-9 text-sm bg-transparent border-[var(--shelfy-border)]">
                      <SelectValue placeholder="Todas las sucursales" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todas las sucursales</SelectItem>
                      {sucursales.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Modo */}
                <div className="rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] p-4 flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-[var(--shelfy-text)] uppercase tracking-wide">
                    <Users className="w-3.5 h-3.5 text-violet-400" />
                    Destinatarios
                  </div>
                  <div className="flex rounded-xl overflow-hidden border border-[var(--shelfy-border)]">
                    {(["uno", "todos"] as const).map((m) => (
                      <button
                        key={m}
                        className={cn(
                          "flex-1 py-2.5 text-xs font-semibold transition-colors",
                          modo === m
                            ? "bg-[var(--shelfy-primary)]/20 text-[var(--shelfy-primary)]"
                            : "text-[var(--shelfy-muted)]"
                        )}
                        onClick={() => { setModo(m); setResult(null); }}
                      >
                        {m === "uno" ? "Un vendedor" : "Todos"}
                      </button>
                    ))}
                  </div>

                  {modo === "uno" && (
                    loadingVend ? (
                      <Skeleton className="h-9 w-full rounded-lg" />
                    ) : (
                      <Select
                        value={idVendedor ? String(idVendedor) : ""}
                        onValueChange={(v) => setIdVendedor(Number(v))}
                      >
                        <SelectTrigger className="h-9 text-sm bg-transparent border-[var(--shelfy-border)]">
                          <SelectValue placeholder="Elegí un vendedor..." />
                        </SelectTrigger>
                        <SelectContent>
                          {vendedoresDifusion.map((v) => (
                            <SelectItem key={v.id_vendedor} value={String(v.id_vendedor)}>
                              <span className={v.tiene_telegram ? "text-foreground" : "text-muted-foreground line-through"}>
                                {v.nombre_erp}
                              </span>
                              {!v.tiene_telegram && (
                                <span className="ml-2 text-[10px] text-muted-foreground">(sin Telegram)</span>
                              )}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )
                  )}

                  {modo === "todos" && (
                    <div className="flex items-center gap-2 text-xs text-[var(--shelfy-muted)] bg-[var(--shelfy-bg)] rounded-lg px-3 py-2 border border-[var(--shelfy-border)]">
                      <Users className="w-3.5 h-3.5 shrink-0" />
                      {loadingVend ? (
                        <span>Cargando...</span>
                      ) : (
                        <span>
                          {vendedoresConTelegram.length} vendedor{vendedoresConTelegram.length !== 1 ? "es" : ""} con grupo Telegram
                          {vendedoresDifusion.length > vendedoresConTelegram.length && (
                            <> · <span className="text-amber-400">{vendedoresDifusion.length - vendedoresConTelegram.length} sin Telegram (se omiten)</span></>
                          )}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Resumen vendedor */}
                {modo === "uno" && idVendedor && (
                  <div className="rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-[var(--shelfy-border)]/50 flex items-center gap-2">
                      <TrendingUp className="w-3.5 h-3.5 text-violet-400" />
                      <span className="text-xs font-bold text-[var(--shelfy-text)] uppercase tracking-wide">
                        Seguimiento — {selectedVend?.nombre_erp ?? "…"}
                      </span>
                      {!selectedVend?.tiene_telegram && (
                        <Badge variant="outline" className="ml-auto text-[10px] border-amber-500/40 text-amber-400">Sin Telegram</Badge>
                      )}
                    </div>

                    {loadingResumen ? (
                      <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
                      </div>
                    ) : resumen ? (
                      <div className="p-4 flex flex-col gap-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div className="rounded-xl bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] px-3 py-2.5 flex flex-col gap-0.5">
                            <span className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide flex items-center gap-1">
                              <CreditCard className="w-3 h-3" />Deuda CC
                            </span>
                            <span className="text-sm font-black text-amber-400 tabular-nums">
                              {resumen.cc.cantidad_clientes > 0
                                ? `$${resumen.cc.deuda_total.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`
                                : "Sin deuda"}
                            </span>
                            {resumen.cc.cantidad_clientes > 0 && (
                              <span className="text-[10px] text-[var(--shelfy-muted)]">
                                {resumen.cc.cantidad_clientes} cliente{resumen.cc.cantidad_clientes !== 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                          <div className="rounded-xl bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] px-3 py-2.5 flex flex-col gap-0.5">
                            <span className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide flex items-center gap-1">
                              <Clock className="w-3 h-3" />Antigüedad
                            </span>
                            {resumen.cc.antiguedad_max != null ? (
                              <>
                                <span className={cn(
                                  "text-sm font-black tabular-nums",
                                  resumen.cc.antiguedad_max >= 60 ? "text-rose-400" :
                                  resumen.cc.antiguedad_max >= 30 ? "text-amber-400" : "text-emerald-400"
                                )}>
                                  {resumen.cc.antiguedad_max}d máx
                                </span>
                                <span className="text-[10px] text-[var(--shelfy-muted)]">{resumen.cc.antiguedad_min}d mín</span>
                              </>
                            ) : (
                              <span className="text-sm font-black text-[var(--shelfy-muted)]">—</span>
                            )}
                          </div>
                          <div className="rounded-xl bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] px-3 py-2.5 flex flex-col gap-0.5">
                            <span className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide flex items-center gap-1">
                              <Target className="w-3 h-3" />Objetivos
                            </span>
                            <span className={cn(
                              "text-sm font-black tabular-nums",
                              resumen.objetivos.total_abiertos > 0 ? "text-violet-400" : "text-[var(--shelfy-muted)]"
                            )}>
                              {resumen.objetivos.total_abiertos} abierto{resumen.objetivos.total_abiertos !== 1 ? "s" : ""}
                            </span>
                            {Object.entries(resumen.objetivos.por_tipo).length > 0 && (
                              <span className="text-[10px] text-[var(--shelfy-muted)] truncate">
                                {Object.entries(resumen.objetivos.por_tipo).map(([t, n]) => `${n} ${t}`).join(" · ")}
                              </span>
                            )}
                          </div>
                          <div className="rounded-xl bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] px-3 py-2.5 flex flex-col gap-0.5">
                            <span className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide flex items-center gap-1">
                              <Image className="w-3 h-3" />Exhibiciones
                            </span>
                            <span className="text-sm font-black tabular-nums text-emerald-400">
                              {resumen.exhibiciones.aprobadas} aprob.
                            </span>
                            <span className="text-[10px] text-[var(--shelfy-muted)]">
                              {resumen.exhibiciones.pendientes} pend. · mes {resumen.exhibiciones.mes_actual.replace("-", "/")}
                            </span>
                          </div>
                        </div>
                        {resumen.cc.fecha_snapshot && (
                          <div className="flex items-center gap-1.5 text-[10px] text-[var(--shelfy-muted)]">
                            <CalendarDays className="w-3 h-3" />
                            Snapshot CC: {resumen.cc.fecha_snapshot.slice(0, 10).split("-").reverse().join("/")}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-5 flex flex-col items-center justify-center gap-2 text-center">
                        <AlertCircle className="w-5 h-5 text-[var(--shelfy-muted)] opacity-50" />
                        <span className="text-xs text-[var(--shelfy-muted)]">
                          Sin datos de seguimiento disponibles para este vendedor.
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Mensaje */}
                <div className="rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-[var(--shelfy-text)] uppercase tracking-wide">
                      <Send className="w-3.5 h-3.5 text-sky-400" />
                      Mensaje
                    </div>
                    <Select
                      value=""
                      onValueChange={(v) => {
                        const t = PLANTILLAS.find((p) => p.label === v);
                        if (t) setMensaje(t.text);
                      }}
                    >
                      <SelectTrigger className="h-7 text-[11px] w-auto gap-1 bg-transparent border-[var(--shelfy-border)] pr-2">
                        <ChevronDown className="w-3 h-3" />
                        <SelectValue placeholder="Plantillas" />
                      </SelectTrigger>
                      <SelectContent>
                        {PLANTILLAS.map((p) => (
                          <SelectItem key={p.label} value={p.label} className="text-xs">{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <textarea
                    value={mensaje}
                    onChange={(e) => setMensaje(e.target.value)}
                    rows={4}
                    placeholder="Mensaje adicional que acompañará al PDF (opcional)..."
                    className="w-full bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-xl px-3 py-2.5 text-sm text-[var(--shelfy-text)] placeholder:text-[var(--shelfy-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--shelfy-primary)]/50 resize-none"
                  />
                </div>

                {/* Preview PDF */}
                <div className="rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] px-4 py-3 flex items-start gap-3">
                  <CreditCard className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <div className="text-xs text-[var(--shelfy-muted)] leading-relaxed">
                    El PDF incluirá: <span className="text-[var(--shelfy-text)] font-semibold">nombre del vendedor, fecha del snapshot, total de deuda</span> y una tabla con todos sus clientes deudores. Se adjuntará junto al mensaje en el grupo Telegram.
                  </div>
                </div>

                {modo === "todos" && !ccMutation.isPending && (
                  <Alert className="border-amber-500/30 bg-amber-500/8">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    <AlertTitle className="text-xs font-bold text-amber-800">Envío masivo</AlertTitle>
                    <AlertDescription className="text-xs text-amber-700">
                      Se enviará un PDF a <strong>{vendedoresConTelegram.length}</strong> grupos de Telegram.
                      Revisá el preview antes de confirmar.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex gap-3">
                  {modo === "todos" ? (
                    <Button
                      className="flex-1 gap-2"
                      variant="outline"
                      disabled={!canSendCC || ccMutation.isPending}
                      onClick={openPreview}
                    >
                      <Eye className="w-4 h-4" />
                      Ver preview y enviar
                    </Button>
                  ) : (
                    <Button
                      className="flex-1 gap-2"
                      disabled={!canSendCC || ccMutation.isPending}
                      onClick={() => { setResult(null); ccMutation.mutate(); }}
                    >
                      {ccMutation.isPending ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                      ) : (
                        <><Send className="w-4 h-4" /> Enviar</>
                      )}
                    </Button>
                  )}
                </div>

                {result && (
                  <div className="rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] overflow-hidden">
                    <div className="px-4 py-3 border-b border-[var(--shelfy-border)]/50 flex items-center gap-2">
                      <span className="text-xs font-bold text-[var(--shelfy-text)]">Resultado del envío</span>
                      {result.fecha_snapshot && (
                        <Badge variant="outline" className="text-[10px]">
                          Snapshot: {result.fecha_snapshot.slice(0, 10).split("-").reverse().join("/")}
                        </Badge>
                      )}
                    </div>
                    <div className="divide-y divide-[var(--shelfy-border)]/30">
                      {result.enviados.map((r, i) => (
                        <div key={i} className="flex items-center gap-2 px-4 py-2.5 text-xs">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="text-[var(--shelfy-text)] font-medium truncate">{r.vendedor}</span>
                          <span className="text-emerald-400 ml-auto shrink-0">Enviado</span>
                        </div>
                      ))}
                      {result.errores.map((r, i) => (
                        <div key={i} className="flex items-center gap-2 px-4 py-2.5 text-xs">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          <span className="text-[var(--shelfy-muted)] font-medium truncate">{r.vendedor}</span>
                          <span className="text-rose-400 ml-auto shrink-0 max-w-[120px] truncate">{r.error}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* ──────────────────────────────────────────── */}
              {/* TAB SIGO                                     */}
              {/* ──────────────────────────────────────────── */}
              <TabsContent value="sigo" className="flex flex-col gap-5 mt-4">
                <div>
                  <h2 className="text-lg font-black text-[var(--shelfy-text)] tracking-tight flex items-center gap-2">
                    <Radio className="w-5 h-5 text-[var(--shelfy-primary)]" />
                    Resumen SIGO de visitas vía Telegram
                  </h2>
                  <p className="text-xs text-[var(--shelfy-muted)] mt-1">
                    Enviá el resumen de visitas SIGO al grupo Telegram del vendedor.
                  </p>
                </div>

                {/* Sucursal SIGO */}
                <div className="rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] p-4 flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-[var(--shelfy-text)] uppercase tracking-wide">
                    <Building2 className="w-3.5 h-3.5 text-amber-400" />
                    Sucursal
                  </div>
                  <Select
                    value={sigoSucursal || "__all__"}
                    onValueChange={(v) => setSigoSucursal(v === "__all__" ? "" : v)}
                  >
                    <SelectTrigger className="h-9 text-sm bg-transparent border-[var(--shelfy-border)]">
                      <SelectValue placeholder="Todas las sucursales" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todas las sucursales</SelectItem>
                      {sucursales.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Modo */}
                  <div className="flex items-center gap-2 text-xs font-bold text-[var(--shelfy-text)] uppercase tracking-wide mt-1">
                    <Users className="w-3.5 h-3.5 text-violet-400" />
                    Destinatarios
                  </div>
                  <div className="flex rounded-xl overflow-hidden border border-[var(--shelfy-border)]">
                    {(["todos", "uno"] as const).map((m) => (
                      <button
                        key={m}
                        className={cn(
                          "flex-1 py-2.5 text-xs font-semibold transition-colors",
                          sigoModo === m
                            ? "bg-[var(--shelfy-primary)]/20 text-[var(--shelfy-primary)]"
                            : "text-[var(--shelfy-muted)]"
                        )}
                        onClick={() => { setSigoModo(m); setSigoVendedor(null); setSigoResult(null); }}
                      >
                        {m === "todos" ? "Todos" : "Un vendedor"}
                      </button>
                    ))}
                  </div>

                  {sigoModo === "uno" && (
                    loadingSigoVend ? (
                      <Skeleton className="h-9 w-full rounded-lg" />
                    ) : (
                      <Select
                        value={sigoVendedor ? String(sigoVendedor) : ""}
                        onValueChange={(v) => setSigoVendedor(Number(v))}
                      >
                        <SelectTrigger className="h-9 text-sm bg-transparent border-[var(--shelfy-border)]">
                          <SelectValue placeholder="Elegí un vendedor..." />
                        </SelectTrigger>
                        <SelectContent>
                          {vendedoresSigo.filter((v) => v.tiene_telegram).map((v) => (
                            <SelectItem key={v.id_vendedor} value={String(v.id_vendedor)} className="text-xs">
                              {v.nombre_erp}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )
                  )}
                </div>

                {/* Mensaje adicional */}
                <div className="rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] p-4 flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-[var(--shelfy-text)] uppercase tracking-wide">
                    <Send className="w-3.5 h-3.5 text-sky-400" />
                    Mensaje adicional (opcional)
                  </div>
                  <textarea
                    value={sigoMensaje}
                    onChange={(e) => setSigoMensaje(e.target.value)}
                    rows={3}
                    placeholder="Mensaje extra que acompañará al resumen SIGO..."
                    className="w-full bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-xl px-3 py-2.5 text-sm text-[var(--shelfy-text)] placeholder:text-[var(--shelfy-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--shelfy-primary)]/50 resize-none"
                  />
                </div>

                {/* Preview */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className="rounded-2xl border border-violet-200 bg-violet-50/40 p-4 flex flex-col gap-1.5 text-sm text-[var(--shelfy-text)]"
                >
                  <p className="text-[10px] font-black uppercase tracking-widest text-violet-600 mb-1">Preview del mensaje</p>
                  {sigoLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-48 rounded" />
                      <Skeleton className="h-4 w-36 rounded" />
                      <Skeleton className="h-4 w-40 rounded" />
                    </div>
                  ) : (
                    <>
                      <p>📊 <strong>Resumen SIGO</strong></p>
                      <p>🏃 Visitados: <strong>{sigoKpiAgg.ejecutadas}</strong> / {sigoKpiAgg.planeadas} planeados</p>
                      <p>💰 Con venta: <strong>{sigoKpiAgg.conVenta}</strong></p>
                      <p>⏰ Sin info: <strong>{sigoKpiAgg.sinInfo}</strong></p>
                      {sigoMensaje && (
                        <p className="text-[var(--shelfy-muted)] italic text-xs mt-1">"{sigoMensaje}"</p>
                      )}
                    </>
                  )}
                </motion.div>

                {/* Botón difundir */}
                <Button
                  className="w-full gap-2"
                  disabled={!canSendSigo || sigoMutation.isPending}
                  onClick={() => { setSigoResult(null); sigoMutation.mutate(); }}
                >
                  {sigoMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Enviando...</>
                  ) : (
                    <><Send className="w-4 h-4" />Difundir</>
                  )}
                </Button>

                {/* Resultados SIGO */}
                <AnimatePresence>
                  {sigoResult && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] overflow-hidden"
                    >
                      <div className="px-4 py-3 border-b border-[var(--shelfy-border)]/50 flex items-center gap-2">
                        <span className="text-xs font-bold text-[var(--shelfy-text)]">Resultado del envío SIGO</span>
                        <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300">
                          {sigoResult.enviados.length} OK
                        </Badge>
                        {sigoResult.errores.length > 0 && (
                          <Badge variant="outline" className="text-[10px] text-rose-500 border-rose-300">
                            {sigoResult.errores.length} error
                          </Badge>
                        )}
                      </div>
                      <div className="divide-y divide-[var(--shelfy-border)]/30">
                        {sigoResult.enviados.map((r, i) => (
                          <motion.div
                            key={`ok-${i}`}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.04 }}
                            className="flex items-center gap-2 px-4 py-2.5 text-xs"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span className="text-[var(--shelfy-text)] font-medium truncate">{r.vendedor}</span>
                            <span className="text-emerald-400 ml-auto shrink-0">Enviado</span>
                          </motion.div>
                        ))}
                        {sigoResult.errores.map((r, i) => (
                          <motion.div
                            key={`err-${i}`}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.04 }}
                            className="flex items-center gap-2 px-4 py-2.5 text-xs"
                          >
                            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                            <span className="text-[var(--shelfy-muted)] font-medium truncate">{r.vendedor}</span>
                            <span className="text-rose-400 ml-auto shrink-0 max-w-[120px] truncate">{r.error}</span>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </TabsContent>
            </Tabs>

          </div>
        </main>
      </div>

      <CCDifusionGuiaDialog open={guiaOpen} onOpenChange={setGuiaOpen} />

      {/* ── Preview Dialog ───────────────────────────────────── */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-[var(--shelfy-border)]">
            <DialogTitle className="flex items-center gap-2 text-sm font-bold">
              <Eye className="w-4 h-4 text-violet-500" />
              Preview de envíos — CC Telegram
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--shelfy-muted)]">
              Revisá el cruce vendedor&nbsp;↔&nbsp;grupo antes de enviar. Los conflictos bloquean el envío masivo.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto px-5 py-4">
            {previewLoading && (
              <div className="min-h-[300px] flex flex-col items-center justify-center gap-4 text-center">
                <div className="size-12 rounded-full border border-violet-200 bg-violet-50 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-violet-500 animate-spin" />
                </div>
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold text-[var(--shelfy-text)]">
                    {PREVIEW_THINKING_STEPS[previewStepIdx]}
                  </p>
                  <p className="text-xs text-[var(--shelfy-muted)]">
                    Estamos preparando el cruce vendedor ↔ grupo para evitar envíos erróneos.
                  </p>
                </div>
                <div className="w-full max-w-md space-y-1.5">
                  <div className="h-2 rounded-full bg-muted/60 overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-violet-400 to-fuchsia-500"
                      animate={{ width: `${previewFakePct}%` }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                    />
                  </div>
                  <p className="text-[10px] text-[var(--shelfy-muted)] tabular-nums">{previewFakePct}%</p>
                </div>
              </div>
            )}

            {previewError && (
              <Alert variant="destructive" className="text-xs">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error al cargar preview</AlertTitle>
                <AlertDescription>{previewError}</AlertDescription>
              </Alert>
            )}

            {previewData && (
              <div className="flex flex-col gap-4">
                {/* Metadata */}
                <div className="flex items-center gap-2 flex-wrap">
                  {previewData.fecha_snapshot && (
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <CalendarDays className="w-3 h-3" />
                      Snapshot: {previewData.fecha_snapshot.slice(0, 10).split("-").reverse().join("/")}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <Users className="w-3 h-3" />
                    {previewData.envios.length} envíos planificados
                  </Badge>
                  {previewData.tiene_conflictos && (
                    <Badge className="text-[10px] gap-1 bg-rose-500/15 text-rose-600 border-rose-300">
                      <ShieldAlert className="w-3 h-3" />
                      Conflictos detectados
                    </Badge>
                  )}
                </div>

                {/* Conflict warning */}
                {previewData.tiene_conflictos && (
                  <Alert className="border-rose-400/40 bg-rose-500/8">
                    <ShieldAlert className="h-4 w-4 text-rose-500" />
                    <AlertTitle className="text-xs font-bold text-rose-700">Grupos Telegram duplicados</AlertTitle>
                    <AlertDescription className="text-xs text-rose-600 flex flex-col gap-2">
                      Dos o más vendedores comparten el mismo grupo. Corregí los bindings en Fuerza de Ventas antes de enviar.
                      <label className="flex items-center gap-2 mt-1 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          className="accent-rose-500"
                          checked={conflictOverride}
                          onChange={(e) => setConflictOverride(e.target.checked)}
                        />
                        <span className="font-semibold">Entiendo el riesgo y quiero enviar igual (superadmin)</span>
                      </label>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Envíos table */}
                <div className="rounded-xl border border-[var(--shelfy-border)] overflow-hidden">
                  <div className="grid grid-cols-[1fr_64px_80px_1fr_72px] text-[10px] font-bold uppercase tracking-wide text-[var(--shelfy-muted)] bg-muted/30 px-3 py-2 border-b border-[var(--shelfy-border)]">
                    <span>Vendedor ERP</span>
                    <span className="text-right">Clientes</span>
                    <span className="text-right">Deuda</span>
                    <span className="pl-3">Grupo Telegram</span>
                    <span className="text-right">Estado</span>
                  </div>
                  <div className="divide-y divide-[var(--shelfy-border)]/50 max-h-[340px] overflow-auto">
                    {previewData.envios.map((e: DifusionPreviewItem, i: number) => {
                      const hasProblem = e.flags.missing_group || e.flags.empty_cc || e.flags.duplicate_group;
                      return (
                        <div
                          key={i}
                          className={cn(
                            "grid grid-cols-[1fr_64px_80px_1fr_72px] px-3 py-2.5 text-xs items-center",
                            hasProblem ? "bg-rose-500/4" : "bg-transparent",
                          )}
                        >
                          <span className="font-medium truncate text-[var(--shelfy-text)]">
                            {e.vendedor_nombre}
                          </span>
                          <span className="text-right tabular-nums text-[var(--shelfy-muted)]">
                            {e.clientes_count}
                          </span>
                          <span className="text-right tabular-nums font-mono text-[11px] text-rose-500 font-semibold">
                            {e.deuda_total > 0
                              ? `$${Math.round(e.deuda_total).toLocaleString("es-AR")}`
                              : "—"}
                          </span>
                          <span className="pl-3 truncate flex items-center gap-1.5">
                            {e.flags.missing_group ? (
                              <span className="text-amber-500 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 shrink-0" /> Sin grupo
                              </span>
                            ) : (
                              <>
                                <Bot className="w-3 h-3 text-violet-400 shrink-0" />
                                <span className="truncate text-[var(--shelfy-text)]">
                                  {e.telegram_title ?? String(e.telegram_group_id)}
                                </span>
                              </>
                            )}
                          </span>
                          <span className="text-right">
                            {e.flags.duplicate_group ? (
                              <Badge className="text-[9px] bg-rose-500/15 text-rose-600 border-rose-300">Duplicado</Badge>
                            ) : e.flags.missing_group ? (
                              <Badge className="text-[9px] bg-amber-500/15 text-amber-600 border-amber-300">Sin grupo</Badge>
                            ) : e.flags.empty_cc ? (
                              <Badge className="text-[9px] bg-slate-500/15 text-slate-500 border-slate-300">Sin CC</Badge>
                            ) : (
                              <Badge className="text-[9px] bg-emerald-500/15 text-emerald-600 border-emerald-300">OK</Badge>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="px-5 py-4 border-t border-[var(--shelfy-border)] flex gap-2 flex-row justify-end">
            <Button variant="outline" size="sm" onClick={() => setPreviewOpen(false)} className="h-8 text-xs">
              Cancelar
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5"
              disabled={
                previewLoading ||
                !previewData ||
                previewData.envios.length === 0 ||
                (previewData.tiene_conflictos && !conflictOverride)
              }
              onClick={confirmFromPreview}
            >
              {ccMutation.isPending ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Enviando...</>
              ) : (
                <><Send className="w-3.5 h-3.5" /> Confirmar y enviar</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
