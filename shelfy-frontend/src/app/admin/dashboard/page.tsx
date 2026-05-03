"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  AlertCircle,
  CalendarClock,
  ClipboardCopy,
  Clock3,
  Loader2,
  Play,
  RefreshCw,
  Siren,
} from "lucide-react";
import { toast } from "sonner";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/Button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchCCLogs,
  fetchEmpresaMotorSnapshot,
  fetchMotorRunsDetail,
  fetchRunCCMotor,
  type EmpresaMotorSnapshot,
  type EmpresaMotorSnapshotResponse,
  type MotorRun,
} from "@/lib/api";

type MotorKey = "padron" | "ventas" | "cuentas";
type RunStatus = "ok" | "error" | "running" | "idle";

const MOTOR_LABEL: Record<MotorKey, string> = {
  padron: "Padron",
  ventas: "Ventas",
  cuentas: "Cuentas",
};

const MOTOR_SLOTS: Record<MotorKey, Array<[number, number]>> = {
  padron: [[7, 0]],
  ventas: [[8, 0], [12, 0], [17, 0], [23, 0]],
  cuentas: [[8, 20], [12, 20], [17, 20], [23, 20]],
};

function parseStatus(raw?: string | null): RunStatus {
  const s = (raw || "").toLowerCase();
  if (s.includes("en_curso") || s.includes("running") || s.includes("ejecut")) return "running";
  if (s.includes("error") || s.includes("fallo") || s.includes("failed")) return "error";
  if (s.includes("ok") || s.includes("success") || s.includes("completado")) return "ok";
  return "idle";
}

function fmtTs(ts?: string | null): string {
  if (!ts) return "Sin datos";
  try {
    return format(new Date(ts), "dd/MM HH:mm", { locale: es });
  } catch {
    return "Sin datos";
  }
}

function nextRun(motor: MotorKey): { at: Date; etaLabel: string } {
  const now = new Date();
  const candidates = MOTOR_SLOTS[motor].map(([h, m]) => {
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
    return d;
  });
  const at = candidates.sort((a, b) => a.getTime() - b.getTime())[0];
  const mins = Math.max(0, Math.floor((at.getTime() - now.getTime()) / 60000));
  const hh = String(Math.floor(mins / 60)).padStart(2, "0");
  const mm = String(mins % 60).padStart(2, "0");
  return { at, etaLabel: `${hh}:${mm}` };
}

function statusBadge(status: RunStatus) {
  if (status === "ok") return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">OK</Badge>;
  if (status === "error") return <Badge className="bg-rose-100 text-rose-700 border-rose-200">Error</Badge>;
  if (status === "running") return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Corriendo</Badge>;
  return <Badge variant="outline">Sin corrida</Badge>;
}

function runSummary(run?: MotorRun): string {
  if (!run) return "Todavia no corrio.";
  const st = parseStatus(run.estado);
  if (st === "ok") return "Ultima corrida termino bien.";
  if (st === "error") return `Ultima corrida fallo: ${run.error_msg || "sin detalle"}`;
  if (st === "running") return "Hay una corrida en curso ahora.";
  return "Sin estado claro.";
}

function toCriolloLine(run: MotorRun): string {
  const st = parseStatus(run.estado);
  const ini = fmtTs(run.iniciado_en);
  const fin = fmtTs(run.finalizado_en);
  const reg = run.registros ? JSON.stringify(run.registros) : "sin registros";
  if (st === "ok") return `[${ini}] OK - termino ${fin} - ${reg}`;
  if (st === "error") return `[${ini}] ERROR - ${run.error_msg || "sin detalle"}`;
  if (st === "running") return `[${ini}] CORRIENDO - aun en proceso`;
  return `[${ini}] SIN ESTADO - ${reg}`;
}

export default function SuperAdminDashboardPage() {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<EmpresaMotorSnapshotResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{ dist: EmpresaMotorSnapshot; motor: MotorKey } | null>(null);
  const [detailRuns, setDetailRuns] = useState<MotorRun[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [ccLogs, setCcLogs] = useState<string>("");
  const [runningCC, setRunningCC] = useState(false);
  const [search, setSearch] = useState("");
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const loadSnapshot = useCallback(async () => {
    try {
      const s = await fetchEmpresaMotorSnapshot();
      setSnapshot(s);
      setLastRefresh(new Date());
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error cargando snapshot";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.rol !== "superadmin") return;
    loadSnapshot();
    const iv = setInterval(loadSnapshot, 45_000);
    return () => clearInterval(iv);
  }, [user, loadSnapshot]);

  useEffect(() => {
    if (!selected) return;
    setDetailLoading(true);
    fetchMotorRunsDetail(selected.dist.dist_id, selected.motor, 60)
      .then((rows) => setDetailRuns(rows))
      .finally(() => setDetailLoading(false));
    fetchCCLogs(140)
      .then((r) => setCcLogs(r.logs || "Sin logs de CC"))
      .catch(() => setCcLogs("No se pudieron cargar logs de CC."));
  }, [selected]);

  const filtered = useMemo(() => {
    const rows = snapshot?.distribuidores || [];
    if (!search.trim()) return rows;
    return rows.filter((d) => d.nombre_empresa.toLowerCase().includes(search.toLowerCase()));
  }, [snapshot, search]);

  const kpis = useMemo(() => {
    const rows = snapshot?.distribuidores || [];
    let ok = 0;
    let err = 0;
    let run = 0;
    for (const d of rows) {
      (["padron", "ventas", "cuentas"] as MotorKey[]).forEach((m) => {
        const st = parseStatus(d.last_runs[m]?.estado);
        if (st === "ok") ok++;
        if (st === "error") err++;
        if (st === "running") run++;
      });
    }
    return { ok, err, run };
  }, [snapshot]);

  async function triggerCuentas() {
    const yes = confirm("Querés disparar ahora el motor de Cuentas Corrientes?");
    if (!yes) return;
    setRunningCC(true);
    try {
      const res = await fetchRunCCMotor();
      if (res.ok) toast.success("Motor de cuentas disparado");
      setTimeout(loadSnapshot, 3000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "No se pudo disparar motor";
      toast.error(msg);
    } finally {
      setRunningCC(false);
    }
  }

  function copyText(value: string) {
    navigator.clipboard.writeText(value);
    toast.success("Copiado");
  }

  if (user?.rol !== "superadmin") {
    return (
      <div className="min-h-screen grid place-items-center bg-[var(--shelfy-bg)]">
        <div className="text-center">
          <AlertCircle className="mx-auto mb-3 text-rose-500" />
          <p className="font-semibold">Acceso solo superadmin.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar title="Corridas RPA" />
        <main className="p-4 md:p-6 pb-24 space-y-4">
          <section className="rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-black text-[var(--shelfy-text)]">Motores RPA</h1>
                <p className="text-xs text-muted-foreground">Ultima actualizacion {format(lastRefresh, "HH:mm:ss")} · vista operativa en criollo</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">OK {kpis.ok}</div>
                <div className="px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">Error {kpis.err}</div>
                <div className="px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold">Corriendo {kpis.run}</div>
                <Button size="sm" variant="outline" onClick={() => { setLoading(true); loadSnapshot(); }}>
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] p-4 md:p-5">
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar distribuidora"
                className="h-9 px-3 rounded-lg border border-[var(--shelfy-border)] bg-white text-xs min-w-[220px]"
              />
              <Button size="sm" onClick={triggerCuentas} disabled={runningCC} className="gap-1.5">
                {runningCC ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                Correr Cuentas ahora
              </Button>
            </div>

            <div className="mt-4 overflow-auto">
              <table className="w-full text-xs min-w-[820px]">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-[var(--shelfy-border)]">
                    <th className="py-2 pr-3">Distribuidora</th>
                    <th className="py-2 pr-3">Padron</th>
                    <th className="py-2 pr-3">Ventas</th>
                    <th className="py-2 pr-3">Cuentas</th>
                  </tr>
                </thead>
                <tbody>
                  {!loading && filtered.length === 0 && (
                    <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">Sin resultados</td></tr>
                  )}
                  {filtered.map((d) => (
                    <tr key={d.dist_id} className="border-b border-[var(--shelfy-border)]/40 align-top">
                      <td className="py-3 pr-3">
                        <p className="font-semibold">{d.nombre_empresa}</p>
                        <p className="text-[10px] text-muted-foreground">{d.mapping_erp.slice(0, 2).join(" · ") || "sin mapping ERP"}</p>
                      </td>
                      {(["padron", "ventas", "cuentas"] as MotorKey[]).map((m) => {
                        const run = d.last_runs[m];
                        const st = parseStatus(run?.estado);
                        const nx = nextRun(m);
                        return (
                          <td key={m} className="py-3 pr-3">
                            <button
                              onClick={() => setSelected({ dist: d, motor: m })}
                              className="w-full text-left rounded-xl border border-[var(--shelfy-border)] bg-white/70 hover:bg-white p-2.5 transition-colors"
                            >
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="font-bold">{MOTOR_LABEL[m]}</span>
                                {statusBadge(st)}
                              </div>
                              <p className="text-[10px] text-muted-foreground">Ult: {fmtTs(run?.iniciado_en || null)}</p>
                              <p className="text-[10px] text-blue-700 flex items-center gap-1 mt-0.5">
                                <CalendarClock className="w-3 h-3" />
                                Prox: {format(nx.at, "HH:mm")} (faltan {nx.etaLabel})
                              </p>
                              <p className="text-[10px] text-muted-foreground mt-1 truncate">{runSummary(run)}</p>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>
              {selected ? `${selected.dist.nombre_empresa} · ${MOTOR_LABEL[selected.motor]}` : "Detalle"}
            </SheetTitle>
          </SheetHeader>
          {!selected ? null : (
            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] p-3">
                <p className="text-xs font-semibold mb-2 flex items-center gap-1.5"><Siren className="w-3.5 h-3.5" /> Resumen operativo</p>
                <p className="text-xs text-muted-foreground">{runSummary(detailRuns[0])}</p>
                {detailRuns[0] && (
                  <div className="mt-2 text-[11px] grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-white p-2 border border-[var(--shelfy-border)]">
                      <p className="text-muted-foreground">Ultima corrida</p>
                      <p className="font-semibold">{fmtTs(detailRuns[0].iniciado_en)}</p>
                    </div>
                    <div className="rounded-lg bg-white p-2 border border-[var(--shelfy-border)]">
                      <p className="text-muted-foreground">Proxima estimada</p>
                      <p className="font-semibold">
                        {format(nextRun(selected.motor).at, "HH:mm")} · faltan {nextRun(selected.motor).etaLabel}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold flex items-center gap-1.5"><Clock3 className="w-3.5 h-3.5" /> Logs en criollo</p>
                  <Button size="sm" variant="outline" onClick={() => copyText(detailRuns.map(toCriolloLine).join("\n"))} className="h-7 text-[11px]">
                    <ClipboardCopy className="w-3.5 h-3.5 mr-1" /> Copiar
                  </Button>
                </div>
                <pre className="text-[11px] leading-relaxed whitespace-pre-wrap rounded-lg bg-white p-3 border border-[var(--shelfy-border)] max-h-56 overflow-auto">
                  {detailLoading ? "Cargando..." : (detailRuns.length ? detailRuns.map(toCriolloLine).join("\n") : "Sin corridas registradas.")}
                </pre>
              </div>

              {selected.motor === "cuentas" && (
                <div className="rounded-xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold">Logs Railway (cuentas)</p>
                    <Button size="sm" variant="outline" onClick={() => copyText(ccLogs)} className="h-7 text-[11px]">
                      <ClipboardCopy className="w-3.5 h-3.5 mr-1" /> Copiar
                    </Button>
                  </div>
                  <pre className="text-[11px] whitespace-pre-wrap rounded-lg bg-white p-3 border border-[var(--shelfy-border)] max-h-56 overflow-auto">
                    {ccLogs || "Sin logs disponibles."}
                  </pre>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
