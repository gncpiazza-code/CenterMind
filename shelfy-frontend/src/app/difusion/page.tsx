"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Send, CreditCard, Users, AlertCircle, CheckCircle2,
  Loader2, Radio, Building2, ChevronDown,
} from "lucide-react";

import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  fetchDifusionVendedores, postDifusionCCTelegram,
  fetchVendedoresSupervision,
  type DifusionVendedor, type DifusionCCResult,
} from "@/lib/api";
import { toast } from "sonner";

const ALLOWED_ROLES = ["superadmin", "admin", "directorio"];

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

export default function DifusionPage() {
  const { user, effectiveDistribuidorId } = useAuth();
  const router = useRouter();
  const isSuperadmin = user?.rol === "superadmin";
  const distId = effectiveDistribuidorId ?? 0;

  const [modo, setModo]               = useState<"uno" | "todos">("uno");
  const [sucursal, setSucursal]       = useState<string>("");
  const [idVendedor, setIdVendedor]   = useState<number | null>(null);
  const [mensaje, setMensaje]         = useState(PLANTILLAS[0].text);
  const [result, setResult]           = useState<DifusionCCResult | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    if (user && !ALLOWED_ROLES.includes(user.rol)) {
      router.replace("/dashboard");
    }
  }, [user, router]);

  // Vendedores base (para sucursales)
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

  // Vendedores con binding Telegram para la sucursal seleccionada
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

  // Reset vendedor al cambiar sucursal
  useEffect(() => { setIdVendedor(null); }, [sucursal]);

  const selectedVend = useMemo(
    () => vendedoresDifusion.find((v) => v.id_vendedor === idVendedor) ?? null,
    [vendedoresDifusion, idVendedor]
  );

  const mutation = useMutation({
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
      if (data.enviados.length > 0) {
        toast.success(`✅ ${data.enviados.length} envío(s) completado(s)`);
      }
      if (data.errores.length > 0) {
        toast.error(`⚠️ ${data.errores.length} envío(s) fallido(s)`);
      }
    },
    onError: (err: Error) => {
      setConfirmando(false);
      toast.error(err.message || "Error al enviar");
    },
  });

  const canSend =
    !!distId &&
    (modo === "todos" ? vendedoresConTelegram.length > 0 : !!idVendedor);

  if (!user || !ALLOWED_ROLES.includes(user.rol)) return null;

  return (
    <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <BottomNav />

      <div className="flex flex-col flex-1 min-w-0">
        <Topbar title="Difusión" />

        <main className="flex-1 p-4 md:p-6 pb-28 md:pb-8 overflow-auto">
          <div className="max-w-2xl mx-auto flex flex-col gap-5">

            {/* Header */}
            <div>
              <h2 className="text-lg font-black text-[var(--shelfy-text)] tracking-tight flex items-center gap-2">
                <Radio className="w-5 h-5 text-[var(--shelfy-primary)]" />
                Cuentas Corrientes vía Telegram
              </h2>
              <p className="text-xs text-[var(--shelfy-muted)] mt-1">
                Enviá el PDF de CC activas al grupo Telegram del vendedor. El PDF incluye todos los clientes con deuda del snapshot más reciente.
              </p>
            </div>

            {/* Selector de sucursal */}
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

            {/* Modo: uno o todos */}
            <div className="rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--shelfy-text)] uppercase tracking-wide">
                <Users className="w-3.5 h-3.5 text-violet-400" />
                Destinatarios
              </div>

              {/* Tab: uno / todos */}
              <div className="flex rounded-xl overflow-hidden border border-[var(--shelfy-border)]">
                {(["uno", "todos"] as const).map((m) => (
                  <button
                    key={m}
                    className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                      modo === m
                        ? "bg-[var(--shelfy-primary)]/20 text-[var(--shelfy-primary)]"
                        : "text-[var(--shelfy-muted)]"
                    }`}
                    onClick={() => { setModo(m); setResult(null); }}
                  >
                    {m === "uno" ? "Un vendedor" : "Todos"}
                  </button>
                ))}
              </div>

              {/* Selector de vendedor (modo uno) */}
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

              {/* Info modo todos */}
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

            {/* Preview del PDF */}
            <div className="rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] px-4 py-3 flex items-start gap-3">
              <CreditCard className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div className="text-xs text-[var(--shelfy-muted)] leading-relaxed">
                El PDF incluirá: <span className="text-[var(--shelfy-text)] font-semibold">nombre del vendedor, fecha del snapshot, total de deuda</span> y una tabla con todos sus clientes deudores (cliente · días · deuda). Se adjuntará junto al mensaje en el grupo Telegram.
              </div>
            </div>

            {/* Confirmación modo todos */}
            {modo === "todos" && !confirmando && !mutation.isPending && (
              <Alert className="border-amber-500/30 bg-amber-500/8 text-amber-800">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <AlertTitle className="text-xs font-bold">Envío masivo</AlertTitle>
                <AlertDescription className="text-xs">
                  Se enviará un PDF a <strong>{vendedoresConTelegram.length}</strong> grupos de Telegram. Esta acción no se puede deshacer.
                </AlertDescription>
              </Alert>
            )}

            {/* Botón */}
            <div className="flex gap-3">
              {modo === "todos" && !confirmando && !mutation.isPending ? (
                <Button
                  className="flex-1 gap-2"
                  variant="outline"
                  disabled={!canSend}
                  onClick={() => setConfirmando(true)}
                >
                  <Send className="w-4 h-4" />
                  Confirmar envío masivo
                </Button>
              ) : (
                <Button
                  className="flex-1 gap-2"
                  disabled={!canSend || mutation.isPending}
                  onClick={() => { setResult(null); mutation.mutate(); }}
                >
                  {mutation.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                  ) : (
                    <><Send className="w-4 h-4" /> Enviar{modo === "todos" ? " a todos" : ""}</>
                  )}
                </Button>
              )}
              {confirmando && (
                <Button variant="outline" onClick={() => setConfirmando(false)}>Cancelar</Button>
              )}
            </div>

            {/* Resultado */}
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

          </div>
        </main>
      </div>
    </div>
  );
}
