"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { PageSpinner } from "@/components/ui/Spinner";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchMotorRuns,
  fetchRunCCMotor,
  type MotorRun,
} from "@/lib/api";
import { useEffect, useState, useCallback } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Play,
  Loader2,
  RefreshCw,
  FileText,
  DollarSign,
  Users,
  X,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────────

type MotorConfig = {
  tipo: string;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  canRun: boolean;
};

const MOTORS: MotorConfig[] = [
  {
    tipo: "cuentas",
    label: "Cuentas Corrientes",
    description: "Sincroniza deudas y comprobantes desde CHESS ERP.",
    icon: DollarSign,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    canRun: true,
  },
  {
    tipo: "ventas",
    label: "Informe de Ventas",
    description: "Procesa ventas_v2 desde el Excel de informe CHESS.",
    icon: FileText,
    color: "text-violet-400",
    bgColor: "bg-violet-500/10",
    canRun: false,
  },
  {
    tipo: "padron",
    label: "Padrón de Clientes",
    description: "Actualiza clientes_pdv_v2, rutas_v2 y vendedores_v2.",
    icon: Users,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    canRun: false,
  },
];

// ── Status helpers ─────────────────────────────────────────────────────────

function getStatus(runs: MotorRun[]): "idle" | "running" | "error" | "ok" {
  if (!runs.length) return "idle";
  const latest = runs[0];
  const estado = (latest.estado || "").toLowerCase();
  if (estado.includes("ejecutando") || estado.includes("running")) return "running";
  if (estado.includes("error") || estado.includes("fallo")) return "error";
  if (estado.includes("ok") || estado.includes("completado") || estado.includes("success")) return "ok";
  return "idle";
}

function StatusBadge({ status }: { status: ReturnType<typeof getStatus> }) {
  const map = {
    idle:    { label: "Idle",       cls: "bg-slate-700 text-slate-300" },
    running: { label: "Running",    cls: "bg-blue-500/20 text-blue-300 animate-pulse" },
    error:   { label: "Error",      cls: "bg-red-500/20 text-red-400" },
    ok:      { label: "Completado", cls: "bg-emerald-500/20 text-emerald-400" },
  };
  const { label, cls } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${cls}`}>
      {status === "running" && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />}
      {status === "error" && <AlertCircle size={10} />}
      {status === "ok" && <CheckCircle2 size={10} />}
      {status === "idle" && <Clock size={10} />}
      {label}
    </span>
  );
}

// ── Logs Modal ─────────────────────────────────────────────────────────────

function LogsModal({
  motor,
  runs,
  onClose,
}: {
  motor: MotorConfig;
  runs: MotorRun[];
  onClose: () => void;
}) {
  function duration(run: MotorRun) {
    if (!run.iniciado_en || !run.finalizado_en) return "–";
    const ms = new Date(run.finalizado_en).getTime() - new Date(run.iniciado_en).getTime();
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-slate-900 border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${motor.bgColor} ${motor.color}`}>
              <motor.icon size={18} />
            </div>
            <div>
              <h2 className="font-black text-white text-sm">{motor.label}</h2>
              <p className="text-[10px] text-white/40">Últimas {runs.length} ejecuciones</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Table */}
        <div className="overflow-y-auto flex-1">
          {runs.length === 0 ? (
            <div className="py-16 text-center text-white/30 text-sm">Sin registros disponibles</div>
          ) : (
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-slate-900/95 backdrop-blur">
                <tr className="border-b border-white/5">
                  {["Fecha", "Estado", "Distribuidor", "Duración", "Mensaje"].map((h) => (
                    <th key={h} className="px-4 py-3 text-[10px] font-black text-white/30 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                    <td className="px-4 py-3 text-[11px] text-white/60 whitespace-nowrap font-mono">
                      {r.iniciado_en ? format(new Date(r.iniciado_en), "dd/MM HH:mm", { locale: es }) : "–"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={getStatus([r])} />
                    </td>
                    <td className="px-4 py-3 text-[11px] text-white/60">{r.dist_id ?? "–"}</td>
                    <td className="px-4 py-3 text-[11px] text-white/60 font-mono">{duration(r)}</td>
                    <td className="px-4 py-3 text-[11px] text-white/60 text-white/50 max-w-[200px] truncate">{r.error_msg || "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Motor Card ─────────────────────────────────────────────────────────────

function MotorCard({
  motor,
  runs,
  onRun,
  onViewLogs,
  running,
}: {
  motor: MotorConfig;
  runs: MotorRun[];
  onRun: () => void;
  onViewLogs: () => void;
  running: boolean;
}) {
  const status = getStatus(runs);
  const latest = runs[0];

  return (
    <Card className="p-5 border-none shadow-xl bg-slate-900 text-white flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${motor.bgColor}`}>
            <motor.icon size={20} className={motor.color} />
          </div>
          <div>
            <h3 className="font-black text-white text-sm leading-tight">{motor.label}</h3>
            <p className="text-[10px] text-white/40 mt-0.5 leading-tight max-w-[180px]">{motor.description}</p>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Last run info */}
      <div className="flex items-center gap-2 text-[11px] text-white/40">
        <Clock size={12} />
        {latest ? (
          <span>
            Última ejecución:{" "}
            <span className="text-white/60 font-semibold">
              {latest.iniciado_en ? formatDistanceToNow(new Date(latest.iniciado_en), { addSuffix: true, locale: es }) : "–"}
            </span>
          </span>
        ) : (
          <span>Sin ejecuciones registradas</span>
        )}
      </div>

      {/* Run history dots */}
      {runs.length > 0 && (
        <div className="flex items-center gap-1">
          {runs.slice(0, 10).reverse().map((r) => {
            const s = getStatus([r]);
            const dot = s === "ok" ? "bg-emerald-500" : s === "error" ? "bg-red-500" : s === "running" ? "bg-blue-400 animate-pulse" : "bg-slate-600";
            return <span key={r.id} className={`w-2 h-2 rounded-full ${dot}`} title={r.estado || "?"} />;
          })}
          <span className="text-[9px] text-white/20 ml-1">últimas {Math.min(runs.length, 10)}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-auto pt-2 border-t border-white/5">
        <button
          onClick={onViewLogs}
          className="flex-1 py-2 px-3 rounded-xl text-[11px] font-bold bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all flex items-center justify-center gap-1.5"
        >
          <FileText size={12} />
          Ver Logs
        </button>
        {motor.canRun && (
          <button
            onClick={onRun}
            disabled={running || status === "running"}
            className={`flex-1 py-2 px-3 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all ${
              running || status === "running"
                ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                : `${motor.bgColor} ${motor.color} hover:opacity-80 active:scale-95`
            }`}
          >
            {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} fill="currentColor" />}
            {running ? "Ejecutando..." : "Correr"}
          </button>
        )}
      </div>
    </Card>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function SuperAdminDashboard() {
  const { user } = useAuth();
  const [runsByMotor, setRunsByMotor] = useState<Record<string, MotorRun[]>>({});
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [runningMotor, setRunningMotor] = useState<string | null>(null);
  const [logsModal, setLogsModal] = useState<MotorConfig | null>(null);

  const loadRuns = useCallback(async () => {
    const results = await Promise.all(
      MOTORS.map((m) => fetchMotorRuns(m.tipo, 20).then((runs) => ({ tipo: m.tipo, runs })))
    );
    const map: Record<string, MotorRun[]> = {};
    for (const { tipo, runs } of results) map[tipo] = runs;
    setRunsByMotor(map);
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user?.rol !== "superadmin") return;
    loadRuns();
    const interval = setInterval(loadRuns, 30000);
    return () => clearInterval(interval);
  }, [user, loadRuns]);

  if (user?.rol !== "superadmin") {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950">
        <Card className="max-w-md text-center p-8 bg-slate-900 border-none text-white">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">Acceso Denegado</h1>
          <p className="text-slate-400">Esta sección es exclusiva para SuperAdmins.</p>
        </Card>
      </div>
    );
  }

  async function handleRun(motor: MotorConfig) {
    if (!confirm(`¿Ejecutar motor "${motor.label}" para todos los distribuidores?`)) return;
    setRunningMotor(motor.tipo);
    try {
      if (motor.tipo === "cuentas") {
        const res = await fetchRunCCMotor();
        if (res.ok) toast.success("Motor iniciado correctamente");
      }
    } catch (e: any) {
      toast.error("Error al iniciar motor: " + e.message);
    } finally {
      setRunningMotor(null);
      setTimeout(loadRuns, 3000);
    }
  }

  return (
    <div className="flex min-h-screen bg-slate-950">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar title="Gestión de Motores" />

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-5xl mx-auto space-y-8">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-black text-white">Motores RPA</h1>
                <p className="text-sm text-white/40 mt-1">
                  Ejecución y monitoreo de los motores de sincronización de datos.
                </p>
              </div>
              <button
                onClick={() => { setLoading(true); loadRuns(); }}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-xs font-bold transition-all"
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                Actualizar
              </button>
            </div>

            <div className="text-[11px] text-white/20 -mt-4">
              Último refresh: {format(lastRefresh, "HH:mm:ss")}
              <span className="ml-2 italic">· Auto cada 30s</span>
            </div>

            {/* Motor Cards */}
            {loading ? (
              <div className="py-20 flex justify-center"><PageSpinner /></div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {MOTORS.map((motor) => (
                  <MotorCard
                    key={motor.tipo}
                    motor={motor}
                    runs={runsByMotor[motor.tipo] || []}
                    onRun={() => handleRun(motor)}
                    onViewLogs={() => setLogsModal(motor)}
                    running={runningMotor === motor.tipo}
                  />
                ))}
              </div>
            )}

          </div>
        </main>
      </div>

      {/* Logs Modal */}
      {logsModal && (
        <LogsModal
          motor={logsModal}
          runs={runsByMotor[logsModal.tipo] || []}
          onClose={() => setLogsModal(null)}
        />
      )}
    </div>
  );
}
