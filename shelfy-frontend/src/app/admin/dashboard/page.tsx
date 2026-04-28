"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchEmpresaMotorSnapshot,
  fetchMotorRunsDetail,
  fetchRunCCMotor,
  type EmpresaMotorSnapshot,
  type EmpresaMotorSnapshotResponse,
  type MotorRun,
} from "@/lib/api";
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Copy,
  Loader2,
  Play,
  RefreshCw,
  Search,
  X,
  ChevronDown,
  ChevronRight,
  Activity,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

// ── Constants ──────────────────────────────────────────────────────────────

const MOTORS = ["padron", "ventas", "cuentas"] as const;
type Motor = (typeof MOTORS)[number];

const MOTOR_LABEL: Record<string, string> = {
  padron: "Padrón",
  ventas: "Ventas",
  cuentas: "Cuentas CC",
  padron_global: "Padrón Global",
  sigo: "SIGO",
};

const MOTOR_COLOR: Record<string, string> = {
  padron: "emerald",
  ventas: "violet",
  cuentas: "blue",
  padron_global: "amber",
  sigo: "orange",
};

// ── Helpers ────────────────────────────────────────────────────────────────

type RunStatus = "idle" | "running" | "error" | "ok";

function parseStatus(estado: string | null | undefined): RunStatus {
  const s = (estado || "").toLowerCase();
  if (s.includes("en_curso") || s.includes("ejecutando") || s.includes("running")) return "running";
  if (s.includes("error") || s.includes("fallo") || s.includes("failed")) return "error";
  if (s.includes("ok") || s.includes("completado") || s.includes("success") || s.includes("exitoso")) return "ok";
  return "idle";
}

function duration(run: MotorRun): string {
  if (!run.iniciado_en || !run.finalizado_en) return "–";
  const ms = new Date(run.finalizado_en).getTime() - new Date(run.iniciado_en).getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function timeAgo(ts: string | null): string {
  if (!ts) return "–";
  try {
    return formatDistanceToNow(new Date(ts), { addSuffix: true, locale: es });
  } catch {
    return "–";
  }
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(() => toast.success("Copiado"));
}

// ── StatusDot ──────────────────────────────────────────────────────────────

function StatusDot({ status, size = 8 }: { status: RunStatus; size?: number }) {
  const cls = {
    idle: "bg-slate-500",
    running: "bg-blue-400 animate-pulse",
    error: "bg-red-500",
    ok: "bg-emerald-500",
  }[status];
  return <span className={`inline-block rounded-full ${cls}`} style={{ width: size, height: size }} />;
}

// ── KPI Header ─────────────────────────────────────────────────────────────

function KpiHeader({
  data,
  lastRefresh,
  loading,
  onRefresh,
}: {
  data: EmpresaMotorSnapshotResponse | null;
  lastRefresh: Date;
  loading: boolean;
  onRefresh: () => void;
}) {
  const today = new Date().toDateString();
  let okHoy = 0;
  let errorHoy = 0;
  let running = 0;

  if (data) {
    const allRuns = [
      ...data.distribuidores.flatMap((d) => Object.values(d.last_runs)),
      ...Object.values(data.global),
    ];
    for (const r of allRuns) {
      const st = parseStatus(r.estado);
      if (st === "running") { running++; continue; }
      if (!r.iniciado_en) continue;
      const isToday = new Date(r.iniciado_en).toDateString() === today;
      if (!isToday) continue;
      if (st === "ok") okHoy++;
      if (st === "error") errorHoy++;
    }
  }

  const kpis = [
    { label: "OK hoy", value: okHoy, icon: CheckCircle2, color: "text-emerald-400" },
    { label: "Error hoy", value: errorHoy, icon: AlertCircle, color: "text-red-400" },
    { label: "En curso", value: running, icon: Activity, color: "text-blue-400" },
  ];

  return (
    <div className="flex items-center justify-between flex-wrap gap-4">
      <div>
        <h1 className="text-2xl font-black text-white">Corridas y Mapeo</h1>
        <p className="text-xs text-white/40 mt-0.5">
          Última actualización: {format(lastRefresh, "HH:mm:ss")}
          <span className="ml-2 italic">· Auto cada 30s</span>
        </p>
      </div>

      <div className="flex items-center gap-3">
        {kpis.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="flex items-center gap-2 bg-white/5 rounded-xl px-4 py-2">
            <Icon size={14} className={color} />
            <span className="text-white font-black text-base">{value}</span>
            <span className="text-white/40 text-xs">{label}</span>
          </div>
        ))}
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-xs font-bold transition-all"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Actualizar
        </button>
      </div>
    </div>
  );
}

// ── Motor Cell ─────────────────────────────────────────────────────────────

function MotorCell({
  run,
  motor,
  onClick,
}: {
  run: MotorRun | undefined;
  motor: string;
  onClick: () => void;
}) {
  if (!run) {
    return (
      <button
        onClick={onClick}
        className="w-full h-full flex items-center justify-center text-white/15 hover:bg-white/5 transition-colors rounded text-[10px]"
      >
        –
      </button>
    );
  }

  const st = parseStatus(run.estado);
  const color = MOTOR_COLOR[motor] || "slate";

  const stateCls = {
    idle: "text-white/40",
    running: "text-blue-300",
    error: "text-red-400",
    ok: "text-emerald-400",
  }[st];

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-2 py-1.5 rounded hover:bg-white/8 transition-colors group"
    >
      <div className="flex items-center gap-1.5">
        <StatusDot status={st} size={6} />
        <span className={`text-[10px] font-bold uppercase tracking-wide ${stateCls}`}>
          {st === "running" ? "Corriendo" : st === "error" ? "Error" : st === "ok" ? "OK" : "–"}
        </span>
      </div>
      <div className="text-[9px] text-white/30 mt-0.5 truncate">
        {run.iniciado_en ? format(new Date(run.iniciado_en), "dd/MM HH:mm") : "–"}
      </div>
      {st === "ok" && (
        <div className="text-[9px] text-white/20 truncate">{duration(run)}</div>
      )}
      {st === "error" && run.error_msg && (
        <div className="text-[9px] text-red-400/60 truncate max-w-[100px]" title={run.error_msg}>
          {run.error_msg.slice(0, 40)}…
        </div>
      )}
    </button>
  );
}

// ── Detail Sheet ───────────────────────────────────────────────────────────

function DetailSheet({
  open,
  onClose,
  dist,
  motor,
}: {
  open: boolean;
  onClose: () => void;
  dist: EmpresaMotorSnapshot | null;
  motor: string | null;
}) {
  const [runs, setRuns] = useState<MotorRun[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !dist || !motor) return;
    setLoadingDetail(true);
    fetchMotorRunsDetail(dist.dist_id, motor, 50)
      .then(setRuns)
      .finally(() => setLoadingDetail(false));
  }, [open, dist, motor]);

  const motorLabel = motor ? (MOTOR_LABEL[motor] || motor) : "";

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-full max-w-[640px] bg-slate-900 border-white/10 text-white p-0 flex flex-col"
      >
        <SheetHeader className="px-6 py-4 border-b border-white/10 flex-shrink-0">
          <SheetTitle className="text-white font-black text-base flex items-center gap-2">
            <StatusDot
              status={dist && motor ? parseStatus(dist.last_runs[motor]?.estado) : "idle"}
              size={8}
            />
            {dist?.nombre_empresa || "–"}
            <span className="text-white/30 font-normal">·</span>
            <span className="text-white/60 font-normal">{motorLabel}</span>
          </SheetTitle>
          {dist && (
            <div className="flex flex-wrap gap-1 mt-1">
              {dist.mapping_erp.slice(0, 4).map((m) => (
                <Badge key={m} variant="outline" className="text-[9px] border-white/20 text-white/40 py-0">
                  {m}
                </Badge>
              ))}
              {dist.mapping_erp.length > 4 && (
                <Badge variant="outline" className="text-[9px] border-white/20 text-white/40 py-0">
                  +{dist.mapping_erp.length - 4}
                </Badge>
              )}
            </div>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {loadingDetail ? (
            <div className="py-16 flex justify-center">
              <Loader2 size={20} className="animate-spin text-white/30" />
            </div>
          ) : runs.length === 0 ? (
            <div className="py-16 text-center text-white/30 text-sm">Sin ejecuciones registradas</div>
          ) : (
            runs.map((r) => {
              const st = parseStatus(r.estado);
              const isExp = expanded === r.id;
              const regStr = r.registros
                ? typeof r.registros === "object"
                  ? JSON.stringify(r.registros, null, 2)
                  : String(r.registros)
                : null;

              return (
                <div
                  key={r.id}
                  className="border border-white/8 rounded-xl overflow-hidden"
                >
                  <button
                    onClick={() => setExpanded(isExp ? null : r.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
                  >
                    <StatusDot status={st} size={8} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-white/80">
                          {r.iniciado_en ? format(new Date(r.iniciado_en), "dd/MM/yyyy HH:mm:ss") : "–"}
                        </span>
                        <span className="text-[10px] text-white/30">{duration(r)}</span>
                      </div>
                      {st === "error" && r.error_msg && (
                        <p className="text-[10px] text-red-400/70 truncate mt-0.5">{r.error_msg}</p>
                      )}
                      {st === "ok" && regStr && (
                        <p className="text-[10px] text-white/30 truncate mt-0.5">{regStr}</p>
                      )}
                    </div>
                    {isExp ? (
                      <ChevronDown size={12} className="text-white/30 flex-shrink-0" />
                    ) : (
                      <ChevronRight size={12} className="text-white/30 flex-shrink-0" />
                    )}
                  </button>

                  {isExp && (
                    <div className="px-4 pb-4 border-t border-white/8 pt-3 space-y-3">
                      {r.error_msg && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Error</span>
                            <button
                              onClick={() => copyToClipboard(r.error_msg!)}
                              className="text-white/30 hover:text-white transition-colors"
                            >
                              <Copy size={11} />
                            </button>
                          </div>
                          <pre className="text-[10px] text-red-400/80 bg-red-500/8 rounded p-3 whitespace-pre-wrap break-all font-mono max-h-48 overflow-y-auto">
                            {r.error_msg}
                          </pre>
                        </div>
                      )}
                      {regStr && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Registros</span>
                            <button
                              onClick={() => copyToClipboard(regStr)}
                              className="text-white/30 hover:text-white transition-colors"
                            >
                              <Copy size={11} />
                            </button>
                          </div>
                          <pre className="text-[10px] text-emerald-400/80 bg-emerald-500/8 rounded p-3 whitespace-pre-wrap font-mono">
                            {regStr}
                          </pre>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div className="bg-white/5 rounded p-2">
                          <span className="text-white/30 block">Inicio</span>
                          <span className="text-white/60 font-mono">
                            {r.iniciado_en ? format(new Date(r.iniciado_en), "dd/MM/yyyy HH:mm:ss") : "–"}
                          </span>
                        </div>
                        <div className="bg-white/5 rounded p-2">
                          <span className="text-white/30 block">Fin</span>
                          <span className="text-white/60 font-mono">
                            {r.finalizado_en ? format(new Date(r.finalizado_en), "dd/MM/yyyy HH:mm:ss") : "–"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function SuperAdminDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<EmpresaMotorSnapshotResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [runningCC, setRunningCC] = useState(false);
  const [search, setSearch] = useState("");
  const [motorFilter, setMotorFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<RunStatus | null>(null);
  const [detail, setDetail] = useState<{ dist: EmpresaMotorSnapshot; motor: string } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const snap = await fetchEmpresaMotorSnapshot();
      setData(snap);
      setLastRefresh(new Date());
    } catch (e: any) {
      toast.error("Error cargando snapshot: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.rol !== "superadmin") return;
    loadData();
    const iv = setInterval(loadData, 30_000);
    return () => clearInterval(iv);
  }, [user, loadData]);

  if (user?.rol !== "superadmin") {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950">
        <div className="max-w-md text-center p-8 bg-slate-900 border border-white/10 rounded-2xl text-white">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">Acceso Denegado</h1>
          <p className="text-slate-400 text-sm">Esta sección es exclusiva para SuperAdmins.</p>
        </div>
      </div>
    );
  }

  // Apply filters
  const filtered = (data?.distribuidores || []).filter((d) => {
    if (search && !d.nombre_empresa.toLowerCase().includes(search.toLowerCase())) return false;
    if (motorFilter && statusFilter) {
      const run = d.last_runs[motorFilter];
      if (!run) return statusFilter === "idle";
      return parseStatus(run.estado) === statusFilter;
    }
    return true;
  });

  const visibleMotors = motorFilter ? [motorFilter] : [...MOTORS];

  async function handleRunCC() {
    if (!confirm("¿Ejecutar motor de Cuentas Corrientes para todos los distribuidores?")) return;
    setRunningCC(true);
    try {
      const res = await fetchRunCCMotor();
      if (res.ok) toast.success("Motor CC iniciado correctamente");
    } catch (e: any) {
      toast.error("Error al iniciar motor: " + e.message);
    } finally {
      setRunningCC(false);
      setTimeout(loadData, 3000);
    }
  }

  return (
    <div className="flex min-h-screen bg-slate-950">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar title="Corridas y Mapeo" />

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* KPIs + refresh */}
            <KpiHeader
              data={data}
              lastRefresh={lastRefresh}
              loading={loading}
              onRefresh={() => { setLoading(true); loadData(); }}
            />

            {/* Filters */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Search */}
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar distribuidora…"
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs placeholder:text-white/30 outline-none focus:border-white/30 transition-colors"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white">
                    <X size={11} />
                  </button>
                )}
              </div>

              {/* Motor filter chips */}
              <div className="flex items-center gap-1.5">
                {[null, ...MOTORS].map((m) => (
                  <button
                    key={m ?? "all"}
                    onClick={() => setMotorFilter(m)}
                    className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all ${
                      motorFilter === m
                        ? "bg-white/20 text-white"
                        : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/70"
                    }`}
                  >
                    {m ? MOTOR_LABEL[m] : "Todos"}
                  </button>
                ))}
              </div>

              {/* Status filter */}
              <div className="flex items-center gap-1.5">
                {([null, "ok", "error", "running"] as const).map((s) => (
                  <button
                    key={s ?? "all"}
                    onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 transition-all ${
                      statusFilter === s
                        ? "bg-white/20 text-white"
                        : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/70"
                    }`}
                  >
                    {s && <StatusDot status={s} size={5} />}
                    {s === null ? "Estado" : s === "ok" ? "OK" : s === "error" ? "Error" : "En curso"}
                  </button>
                ))}
              </div>

              {/* Run CC button */}
              <button
                onClick={handleRunCC}
                disabled={runningCC}
                className="ml-auto flex items-center gap-2 px-4 py-1.5 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 text-[11px] font-bold transition-all disabled:opacity-40"
              >
                {runningCC ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} fill="currentColor" />}
                Correr CC
              </button>
            </div>

            {/* Main table */}
            {loading && !data ? (
              <div className="py-24 flex justify-center">
                <Loader2 size={24} className="animate-spin text-white/30" />
              </div>
            ) : (
              <div className="rounded-2xl border border-white/8 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[640px]">
                    <thead>
                      <tr className="bg-slate-900/80 border-b border-white/8">
                        <th className="px-4 py-3 text-[10px] font-black text-white/30 uppercase tracking-widest w-[240px]">
                          Distribuidora
                        </th>
                        <th className="px-3 py-3 text-[10px] font-black text-white/30 uppercase tracking-widest w-[120px]">
                          Mapeo ERP
                        </th>
                        {visibleMotors.map((m) => (
                          <th
                            key={m}
                            className="px-2 py-3 text-[10px] font-black text-white/30 uppercase tracking-widest min-w-[120px]"
                          >
                            {MOTOR_LABEL[m] || m}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td
                            colSpan={2 + visibleMotors.length}
                            className="px-4 py-16 text-center text-white/30 text-sm"
                          >
                            Sin resultados con los filtros aplicados
                          </td>
                        </tr>
                      ) : (
                        filtered.map((dist) => (
                          <tr
                            key={dist.dist_id}
                            className="border-b border-white/5 hover:bg-white/3 transition-colors"
                          >
                            {/* Empresa */}
                            <td className="px-4 py-2.5">
                              <div className="font-bold text-[11px] text-white leading-tight">
                                {dist.nombre_empresa}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {dist.id_erp && (
                                  <span className="text-[9px] text-white/30 font-mono">ERP#{dist.id_erp}</span>
                                )}
                                <span
                                  className={`text-[9px] font-bold ${
                                    dist.estado === "activo" ? "text-emerald-400/60" : "text-red-400/60"
                                  }`}
                                >
                                  {dist.estado || "–"}
                                </span>
                              </div>
                            </td>

                            {/* Mapeo ERP */}
                            <td className="px-3 py-2.5">
                              <div className="flex flex-col gap-0.5">
                                {dist.mapping_erp.slice(0, 2).map((m) => (
                                  <span key={m} className="text-[9px] text-white/40 truncate max-w-[110px]" title={m}>
                                    {m}
                                  </span>
                                ))}
                                {dist.mapping_erp.length > 2 && (
                                  <span className="text-[9px] text-white/20">+{dist.mapping_erp.length - 2}</span>
                                )}
                                {dist.mapping_erp.length === 0 && (
                                  <span className="text-[9px] text-white/15 italic">sin mapeo</span>
                                )}
                              </div>
                            </td>

                            {/* Motor cells */}
                            {visibleMotors.map((motor) => (
                              <td key={motor} className="px-1 py-1.5">
                                <MotorCell
                                  run={dist.last_runs[motor]}
                                  motor={motor}
                                  onClick={() => setDetail({ dist, motor })}
                                />
                              </td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Global runs footer */}
                {data?.global && Object.keys(data.global).length > 0 && (
                  <div className="border-t border-white/8 bg-slate-900/60 px-4 py-3 flex items-center gap-4 flex-wrap">
                    <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">Global</span>
                    {Object.entries(data.global).map(([motor, run]) => {
                      const st = parseStatus(run.estado);
                      return (
                        <button
                          key={motor}
                          onClick={() =>
                            setDetail({
                              dist: {
                                dist_id: 0,
                                nombre_empresa: "Global",
                                id_erp: null,
                                estado: null,
                                mapping_erp: [],
                                last_runs: data.global,
                              },
                              motor,
                            })
                          }
                          className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 rounded-lg px-3 py-1.5 transition-colors"
                        >
                          <StatusDot status={st} size={6} />
                          <span className="text-[10px] font-bold text-white/50">{MOTOR_LABEL[motor] || motor}</span>
                          {run.iniciado_en && (
                            <span className="text-[9px] text-white/25">
                              {format(new Date(run.iniciado_en), "dd/MM HH:mm")}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

          </div>
        </main>
      </div>

      {/* Detail Sheet */}
      <DetailSheet
        open={!!detail}
        onClose={() => setDetail(null)}
        dist={detail?.dist ?? null}
        motor={detail?.motor ?? null}
      />
    </div>
  );
}
