"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { useAuth } from "@/hooks/useAuth";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { useObjetivosStore } from "@/store/useObjetivosStore";
import {
  fetchObjetivos,
  fetchObjetivosTimeline,
  fetchResumenSupervisorObjetivos,
  createObjetivo,
  updateObjetivo,
  deleteObjetivo,
  fetchVendedoresSupervision,
  fetchRutasSupervision,
  fetchClientesSupervision,
  fetchCuentasSupervision,
  getWSUrl,
  type Objetivo,
  type ObjetivoCreate,
  type ObjetivoTipo,
  type ResumenVendedorObjetivos,
  type RutaSupervision,
  type ClienteSupervision,
  type CuentasSupervision,
  type ObjetivoTimeline,
} from "@/lib/api";
import {
  Target,
  Plus,
  Check,
  Trash2,
  ChevronDown,
  Search,
  LayoutList,
  LayoutGrid,
  TrendingUp,
  Clock,
  CheckCircle2,
  Loader2,
  AlertCircle,
  X,
  Calendar,
  User,
  MapPin,
  Users,
  BarChart3,
  Printer,
  RefreshCw,
  FileDown,
  GitBranch,
  Activity,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";

// ── Tipo / actividad config ───────────────────────────────────────────────────

const TIPO_CONFIG: Record<ObjetivoTipo, { label: string; color: string; bg: string }> = {
  conversion_estado: { label: "Activación", color: "text-blue-500",    bg: "bg-blue-500/10 border-blue-500/20" },
  cobranza:          { label: "Cobranza",   color: "text-orange-500",  bg: "bg-orange-500/10 border-orange-500/20" },
  ruteo_alteo:       { label: "Alteo",      color: "text-violet-600",  bg: "bg-violet-500/10 border-violet-500/20" },
  exhibicion:        { label: "Exhibición", color: "text-emerald-600", bg: "bg-emerald-500/10 border-emerald-500/20" },
  general:           { label: "General",    color: "text-slate-500",   bg: "bg-slate-500/10 border-slate-500/20" },
};

const DIA_ORDER: Record<string, number> = {
  "lunes": 0, "martes": 1, "miercoles": 2, "miércoles": 2, "jueves": 3,
  "viernes": 4, "sabado": 5, "sábado": 5, "domingo": 6,
};

const ACTIVIDADES_FRASE: { tipo: ObjetivoTipo; label: string }[] = [
  { tipo: "ruteo_alteo",       label: "altear" },
  { tipo: "exhibicion",        label: "exhibir en" },
  { tipo: "conversion_estado", label: "activar" },
];

const TIEMPO_UNIDADES = [
  { value: "dias",    label: "días" },
  { value: "semanas", label: "semanas" },
  { value: "mes",     label: "el mes" },
];

// Timeline event color map
const TIMELINE_EVENT_COLORS: Record<string, string> = {
  exhibicion_pendiente: "bg-yellow-400",
  exhibicion:           "bg-emerald-500",
  alteo:                "bg-blue-500",
  cumplido:             "bg-violet-600",
  creado:               "bg-slate-400",
  falla:                "bg-red-500",
};

function TipoBadge({ tipo }: { tipo: ObjetivoTipo }) {
  const cfg = TIPO_CONFIG[tipo] ?? TIPO_CONFIG.general;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${cfg.bg} ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ actual, objetivo, className }: { actual: number; objetivo: number | null; className?: string }) {
  if (!objetivo || objetivo === 0) return null;
  const pct = Math.min(100, Math.round((actual / objetivo) * 100));
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <Progress value={pct} className="flex-1 h-1.5" />
      <span className="text-[10px] text-[var(--shelfy-muted)] tabular-nums">{pct}%</span>
    </div>
  );
}

// ── Fecha helpers ─────────────────────────────────────────────────────────────

function formatDate(d: string | null | undefined) {
  if (!d) return null;
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function daysUntil(d: string | null | undefined): number | null {
  if (!d) return null;
  const diff = new Date(d).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

function DateChip({ date }: { date: string | null | undefined }) {
  const days = daysUntil(date);
  if (days === null) return null;
  const isOverdue = days < 0;
  const isSoon    = days >= 0 && days <= 3;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] ${
      isOverdue ? "text-red-500" : isSoon ? "text-orange-500" : "text-[var(--shelfy-muted)]"
    }`}>
      <Calendar className="w-3 h-3" />
      {formatDate(date)}
      {isOverdue && ` (vencido)`}
      {isSoon && !isOverdue && ` (${days}d)`}
    </span>
  );
}

// ── Phrase rendering ──────────────────────────────────────────────────────────

function ObjetivoPhrase({ obj }: { obj: Objetivo }) {
  const tiempoValor  = obj.estado_inicial;
  const tiempoUnidad = obj.estado_objetivo;
  const cantidad     = obj.valor_objetivo;

  if (obj.tipo === "cobranza" && obj.valor_objetivo) {
    const pct = obj.valor_objetivo > 0
      ? Math.min(100, Math.round((obj.valor_actual / obj.valor_objetivo) * 100))
      : 0;
    return (
      <p className="text-xs text-[var(--shelfy-muted)] leading-snug">
        Meta: cobrar{" "}
        <span className="text-[var(--shelfy-text)] font-semibold">
          ${obj.valor_objetivo.toLocaleString("es-AR")}
        </span>
        {" "}— Cobrado:{" "}
        <span className="text-emerald-600 font-medium">
          ${obj.valor_actual.toLocaleString("es-AR")}
        </span>
        {" "}
        <span className="text-[var(--shelfy-muted)]">({pct}%)</span>
      </p>
    );
  }

  if (cantidad && tiempoValor && tiempoUnidad) {
    const unidadLabel = TIEMPO_UNIDADES.find(u => u.value === tiempoUnidad)?.label ?? tiempoUnidad;
    return (
      <p className="text-xs text-[var(--shelfy-muted)] leading-snug">
        Debe{" "}
        <span className="text-[var(--shelfy-text)] font-medium">
          {ACTIVIDADES_FRASE.find(a => a.tipo === obj.tipo)?.label ?? obj.tipo}
        </span>{" "}
        <span className="text-[var(--shelfy-accent)] font-semibold">{Math.round(cantidad)} PDVs</span>
        {" "}en{" "}
        <span className="text-[var(--shelfy-muted)]">{tiempoValor} {unidadLabel}</span>
      </p>
    );
  }

  if (obj.descripcion) {
    return <p className="text-xs text-[var(--shelfy-muted)] leading-snug">{obj.descripcion}</p>;
  }
  return null;
}

// ── Kanban phase resolver ─────────────────────────────────────────────────────

function getObjectiveKanbanPhase(obj: Objetivo): 'pendiente' | 'en_progreso' | 'terminado' {
  if (obj.kanban_phase) return obj.kanban_phase;
  if (obj.cumplido) return 'terminado';
  const actual = obj.valor_actual ?? 0;
  const objetivo = obj.valor_objetivo;
  if (obj.tipo === 'exhibicion') {
    if (obj.tiene_exhibicion_pendiente || actual > 0) return 'en_progreso';
    return 'pendiente';
  }
  if (actual > 0) {
    if (objetivo && actual >= objetivo) return 'terminado';
    return 'en_progreso';
  }
  return 'pendiente';
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)]">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-xs text-[var(--shelfy-muted)]">{label}</p>
        <p className="text-xl font-semibold text-[var(--shelfy-text)] leading-tight">{value}</p>
        {sub && <p className="text-[10px] text-[var(--shelfy-muted)] mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Objetivo row (lista) ──────────────────────────────────────────────────────

function ObjetivoRow({ obj, onToggle, onDelete }: {
  obj: Objetivo;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <tr className={`border-b border-[var(--shelfy-border)]/50 transition-colors hover:bg-black/[0.02] ${obj.cumplido ? "opacity-50" : ""}`}>
      <td className="px-4 py-3">
        <button
          onClick={onToggle}
          className={`w-4 h-4 rounded border flex items-center justify-center transition-all shrink-0 ${
            obj.cumplido
              ? "bg-emerald-500 border-emerald-500 text-white"
              : "border-[var(--shelfy-border)] hover:border-emerald-500/50"
          }`}
        >
          {obj.cumplido && <Check className="w-2.5 h-2.5" />}
        </button>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <User className="w-3 h-3 text-[var(--shelfy-muted)] shrink-0" />
          <span className="text-xs text-[var(--shelfy-text)]">{obj.nombre_vendedor ?? `ID ${obj.id_vendedor}`}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <TipoBadge tipo={obj.tipo} />
      </td>
      <td className="px-4 py-3 max-w-[220px]">
        {obj.nombre_pdv && (
          <div className="flex items-center gap-1.5 mb-0.5">
            <MapPin className="w-3 h-3 text-[var(--shelfy-muted)] shrink-0" />
            <span className="text-xs text-[var(--shelfy-muted)] truncate">{obj.nombre_pdv}</span>
            {obj.id_cliente_erp && (
              <span className="text-[10px] text-[var(--shelfy-muted)]/60 font-mono shrink-0">#{obj.id_cliente_erp}</span>
            )}
          </div>
        )}
        <ObjetivoPhrase obj={obj} />
      </td>
      <td className="px-4 py-3 w-36">
        {obj.valor_objetivo ? (
          <div>
            <div className="text-xs text-[var(--shelfy-muted)] mb-1 tabular-nums">
              {obj.valor_actual} / {Math.round(obj.valor_objetivo)}
            </div>
            <ProgressBar actual={obj.valor_actual} objetivo={obj.valor_objetivo} />
          </div>
        ) : (
          <span className={`text-xs ${obj.cumplido ? "text-emerald-600" : "text-[var(--shelfy-muted)]"}`}>
            {obj.cumplido ? "Completado" : "Pendiente"}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <DateChip date={obj.fecha_objetivo} />
      </td>
      <td className="px-4 py-3">
        <button
          onClick={onDelete}
          className="w-6 h-6 flex items-center justify-center rounded text-[var(--shelfy-muted)] hover:text-red-500 hover:bg-red-500/10 transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
}

// ── PDF Certificate ───────────────────────────────────────────────────────────

function downloadCertificado(obj: Objetivo) {
  import("jspdf").then(({ jsPDF }) => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const accent = "#7C3AED";
    const W = 210;

    doc.setFillColor(accent);
    doc.rect(0, 0, W, 32, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("SHELFY", 20, 14);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text("CERTIFICADO DE OBJETIVO", 20, 24);

    doc.setTextColor(30, 41, 59);
    doc.setFontSize(10);
    let y = 50;
    const line = (label: string, value: string) => {
      doc.setFont("helvetica", "bold");
      doc.text(`${label}:`, 20, y);
      doc.setFont("helvetica", "normal");
      doc.text(value, 65, y);
      y += 10;
    };

    const tipoLabel = TIPO_CONFIG[obj.tipo]?.label ?? obj.tipo;
    const resultado = obj.resultado_final === "exito" ? "EXITO" : obj.resultado_final === "falla" ? "FALLÓ" : "—";
    const pct = obj.valor_objetivo && obj.valor_objetivo > 0
      ? `${Math.min(100, Math.round((obj.valor_actual / obj.valor_objetivo) * 100))}%`
      : "—";
    const progreso = obj.valor_objetivo
      ? `${obj.valor_actual} / ${Math.round(obj.valor_objetivo)} (${pct})`
      : obj.cumplido ? "Completado" : "Pendiente";

    line("Vendedor", obj.nombre_vendedor ?? `ID ${obj.id_vendedor}`);
    line("Tipo", tipoLabel);
    line("Descripción", obj.descripcion ?? "—");
    line("Fecha objetivo", obj.fecha_objetivo ?? "—");
    line("Resultado", resultado);
    line("Progreso", progreso);

    y += 4;
    doc.setDrawColor(200, 200, 220);
    doc.line(20, y, W - 20, y);
    y += 10;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text("HISTORIAL DE INTENTOS", 20, y);
    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 41, 59);
    if (obj.id_objetivo_padre) {
      doc.text("· Intento anterior registrado", 24, y);
      y += 7;
      doc.text(`· Este intento (actual) — ID: ${obj.id}`, 24, y);
    } else {
      doc.text("· Primer intento", 24, y);
    }

    doc.save(`certificado-${(obj.nombre_vendedor ?? "vendedor").replace(/\s+/g, "_")}-${obj.id}.pdf`);
  });
}

// ── Kanban card ───────────────────────────────────────────────────────────────

function KanbanCard({ obj, onDelete, onReagendar, onDownloadCertificado }: {
  obj: Objetivo;
  onDelete: () => void;
  onReagendar: (obj: Objetivo) => void;
  onDownloadCertificado: (obj: Objetivo) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const leftBorderClass =
    obj.resultado_final === "exito"
      ? "border-l-4 border-l-emerald-500"
      : obj.resultado_final === "falla"
        ? "border-l-4 border-l-red-500"
        : getObjectiveKanbanPhase(obj) === "en_progreso"
          ? "border-l-4 border-l-violet-500"
          : "border-l-4 border-l-[var(--shelfy-border)]";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`rounded-xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] group cursor-pointer ${leftBorderClass}`}
      onClick={() => setExpanded(e => !e)}
    >
      <div className="p-3 space-y-2">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <TipoBadge tipo={obj.tipo} />
            {obj.resultado_final === "exito" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-semibold border border-emerald-500/20">
                Exito
              </span>
            )}
            {obj.resultado_final === "falla" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 font-semibold border border-red-500/20">
                Falla
              </span>
            )}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-[var(--shelfy-muted)] hover:text-red-500 transition-all print-hidden"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>

        {/* Vendedor */}
        <div className="flex items-center gap-1.5">
          <User className="w-3 h-3 text-[var(--shelfy-muted)] shrink-0" />
          <span className="text-xs font-medium text-[var(--shelfy-text)]">{obj.nombre_vendedor ?? `ID ${obj.id_vendedor}`}</span>
        </div>

        {/* PDV */}
        {obj.nombre_pdv && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <MapPin className="w-3 h-3 text-[var(--shelfy-muted)] shrink-0" />
            <span className="text-xs text-[var(--shelfy-muted)]">{obj.nombre_pdv}</span>
            {obj.id_cliente_erp && (
              <span className="text-[10px] text-[var(--shelfy-muted)]/60 font-mono">#{obj.id_cliente_erp}</span>
            )}
          </div>
        )}

        {/* Progress bar */}
        {obj.valor_objetivo ? (
          <div onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between text-[10px] text-[var(--shelfy-muted)] mb-1 tabular-nums">
              <span>{obj.valor_actual} / {Math.round(obj.valor_objetivo)}</span>
            </div>
            <ProgressBar actual={obj.valor_actual} objetivo={obj.valor_objetivo} />
          </div>
        ) : null}

        {/* Items checklist (compact dots) */}
        {obj.items_count && obj.items_count > 1 && (
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--shelfy-muted)]">
            <span className="tabular-nums">
              <span className="text-[var(--shelfy-text)] font-medium">{obj.items_cumplidos ?? 0}</span>
              {' / '}{obj.items_count} PDVs
            </span>
            {obj.items && obj.items.length > 0 && (
              <div className="flex gap-0.5 flex-wrap">
                {obj.items.slice(0, 6).map(it => (
                  <span
                    key={it.id_cliente_pdv}
                    className={`w-2 h-2 rounded-full ${
                      it.estado_item === 'cumplido' ? 'bg-emerald-500' :
                      it.estado_item === 'foto_subida' ? 'bg-yellow-400' :
                      'bg-[var(--shelfy-border)]'
                    }`}
                    title={it.nombre_pdv ?? String(it.id_cliente_pdv)}
                  />
                ))}
                {obj.items.length > 6 && <span>+{obj.items.length - 6}</span>}
              </div>
            )}
          </div>
        )}

        {/* Expandable: descripcion + items list */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="pt-1 border-t border-[var(--shelfy-border)] space-y-2">
                {obj.descripcion && (
                  <p className="text-xs text-[var(--shelfy-muted)] leading-relaxed">{obj.descripcion}</p>
                )}
                {obj.items && obj.items.length > 0 && (
                  <div className="space-y-0.5 max-h-32 overflow-y-auto">
                    {obj.items.map(it => (
                      <div key={it.id_cliente_pdv} className="flex items-center gap-2 text-[11px]">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          it.estado_item === 'cumplido' ? 'bg-emerald-500' :
                          it.estado_item === 'foto_subida' ? 'bg-yellow-400' :
                          'bg-[var(--shelfy-muted)]/30'
                        }`} />
                        <span className="text-[var(--shelfy-text)] truncate">{it.nombre_pdv ?? `PDV ${it.id_cliente_pdv}`}</span>
                        <span className="text-[var(--shelfy-muted)] shrink-0 capitalize">{it.estado_item.replace('_', ' ')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1 gap-1.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
          <DateChip date={obj.fecha_objetivo} />
          <div className="flex items-center gap-1 print-hidden">
            {obj.cumplido && (
              <button
                onClick={() => onDownloadCertificado(obj)}
                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-accent)] hover:border-[var(--shelfy-accent)]/40 transition-all"
              >
                <FileDown className="w-3 h-3" /> PDF
              </button>
            )}
            {obj.resultado_final === "falla" && (
              <button
                onClick={() => onReagendar(obj)}
                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-orange-500/30 text-orange-500 hover:bg-orange-500/10 transition-all"
              >
                <RefreshCw className="w-3 h-3" /> Re-agendar
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Vista Supervisor — tabla de agregación ────────────────────────────────────

function VendedorResumenRow({ v }: { v: ResumenVendedorObjetivos }) {
  const allCobranza = v.tipos?.length > 0 && v.tipos.every((t: string) => t === "cobranza");
  const unitLabel = allCobranza ? "$" : "PDVs";
  const formatVal = (n: number) =>
    allCobranza ? n.toLocaleString("es-AR") : String(Math.round(n));

  return (
    <tr className="border-b border-[var(--shelfy-border)]/50 hover:bg-black/[0.02] transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-[var(--shelfy-accent)]/10 flex items-center justify-center shrink-0">
            <User className="w-3 h-3 text-[var(--shelfy-accent)]" />
          </div>
          <span className="text-xs font-medium text-[var(--shelfy-text)]">{v.nombre_vendedor}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-xs text-[var(--shelfy-muted)] tabular-nums">{v.objetivos_count}</span>
      </td>
      <td className="px-4 py-3 text-center">
        {allCobranza && <span className="text-xs font-semibold text-[var(--shelfy-accent)] tabular-nums">$</span>}
        <span className="text-xs font-semibold text-[var(--shelfy-accent)] tabular-nums">
          {formatVal(v.cantidad_objetivo_total)}
        </span>
        {!allCobranza && <span className="text-[10px] text-[var(--shelfy-muted)] ml-1">{unitLabel}</span>}
      </td>
      <td className="px-4 py-3 w-40">
        <div className="text-[10px] text-[var(--shelfy-muted)] mb-1 tabular-nums">
          {formatVal(v.cantidad_actual_total)} / {formatVal(v.cantidad_objetivo_total)}
        </div>
        <ProgressBar actual={v.cantidad_actual_total} objetivo={v.cantidad_objetivo_total} />
      </td>
      <td className="px-4 py-3">
        <DateChip date={v.proxima_fecha} />
      </td>
    </tr>
  );
}

// ── Modal nuevo objetivo — Smart Unified Form ─────────────────────────────────

interface NuevoObjetivoModalProps {
  distId: number;
  vendedores: { id_vendedor: number; nombre_erp: string }[];
  onClose: () => void;
  onCreate: (data: ObjetivoCreate[]) => void;
  loading: boolean;
}

function NuevoObjetivoModal({ distId, vendedores, onClose, onCreate, loading }: NuevoObjetivoModalProps) {
  const [vendedorId, setVendedorId] = useState<number | "">("");
  const [tipo, setTipo] = useState<ObjetivoTipo>("ruteo_alteo");
  const [fecha, setFecha] = useState<string>("");
  const [desc, setDesc] = useState<string>("");

  const [rutas, setRutas] = useState<RutaSupervision[]>([]);
  const [selectedRutaId, setSelectedRutaId] = useState<number | null>(null);
  const [cantidadAlteo, setCantidadAlteo] = useState<number | "">("");

  const [deudores, setDeudores] = useState<{ cliente_nombre: string; deuda_total: number }[]>([]);
  const [selectedDeudor, setSelectedDeudor] = useState<{ cliente_nombre: string; deuda_total: number } | null>(null);
  const [cobranzaMode, setCobranzaMode] = useState<"total" | "parcial">("total");
  const [cobranzaMonto, setCobranzaMonto] = useState<number | "">("");

  const [inactivePdvCount, setInactivePdvCount] = useState<number>(0);
  const [activacionPdvs, setActivacionPdvs] = useState<{ id: number; idErp: string; nombre: string; fechaCompra: string | null; diasSinCompra: number | null }[]>([]);
  const [selectedPdvIds, setSelectedPdvIds] = useState<Set<number>>(new Set());

  const [loadingCtx, setLoadingCtx] = useState(false);

  const vendedorNombre = vendedores.find(v => v.id_vendedor === vendedorId)?.nombre_erp ?? "";
  const selectedRuta = rutas.find(r => r.id_ruta === selectedRutaId) ?? null;

  function resetCtx() {
    setRutas([]);
    setSelectedRutaId(null);
    setCantidadAlteo("");
    setDeudores([]);
    setSelectedDeudor(null);
    setCobranzaMode("total");
    setCobranzaMonto("");
    setInactivePdvCount(0);
    setActivacionPdvs([]);
    setSelectedPdvIds(new Set());
  }

  useEffect(() => {
    if (!vendedorId) return;
    resetCtx();
    setLoadingCtx(true);
    const nombre = vendedores.find(v => v.id_vendedor === vendedorId)?.nombre_erp ?? "";

    if (tipo === "ruteo_alteo") {
      fetchRutasSupervision(Number(vendedorId))
        .then(data => {
          const sorted = [...data].sort((a, b) => {
            const oa = DIA_ORDER[a.dia_semana.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")] ?? 9;
            const ob = DIA_ORDER[b.dia_semana.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")] ?? 9;
            return oa - ob;
          });
          setRutas(sorted);
        })
        .catch(() => setRutas([]))
        .finally(() => setLoadingCtx(false));
    } else if (tipo === "cobranza") {
      fetchCuentasSupervision(distId)
        .then((data: CuentasSupervision) => {
          const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
          const targetNorm = norm(nombre);

          let vend = data.vendedores.find(v => norm(v.vendedor) === targetNorm);
          if (!vend) vend = data.vendedores.find(v => norm(v.vendedor).includes(targetNorm) || targetNorm.includes(norm(v.vendedor)));

          if (vend) {
            setDeudores(
              (vend.clientes ?? [])
                .filter(c => (c.deuda_total ?? 0) > 0)
                .sort((a, b) => (b.deuda_total ?? 0) - (a.deuda_total ?? 0))
                .slice(0, 10)
                .map(c => ({ cliente_nombre: c.cliente ?? "–", deuda_total: c.deuda_total ?? 0 }))
            );
          }
        })
        .catch(() => setDeudores([]))
        .finally(() => setLoadingCtx(false));
    } else if (tipo === "conversion_estado" || tipo === "exhibicion") {
      fetchRutasSupervision(Number(vendedorId))
        .then(async (rutasData) => {
          const allClients: { id: number; idErp: string; nombre: string; fechaCompra: string | null; diasSinCompra: number | null; tieneExhibicion: boolean }[] = [];
          const now = Date.now();
          for (const ruta of rutasData) {
            const clientes = await fetchClientesSupervision(ruta.id_ruta).catch(() => [] as ClienteSupervision[]);
            for (const c of clientes) {
              const nombreCliente = c.nombre_fantasia || c.nombre_razon_social || "S/N";
              const fechaCompra = c.fecha_ultima_compra ?? null;
              const diasSinCompra = fechaCompra
                ? Math.floor((now - new Date(fechaCompra).getTime()) / 86_400_000)
                : null;
              allClients.push({ id: c.id_cliente, idErp: c.id_cliente_erp, nombre: nombreCliente, fechaCompra, diasSinCompra, tieneExhibicion: c.tiene_exhibicion_reciente ?? false });
            }
          }
          const seen = new Set<number>();
          const filtered = allClients.filter(c => {
            if (seen.has(c.id)) return false;
            seen.add(c.id);
            if (tipo === "conversion_estado") {
              return c.diasSinCompra === null || (c.diasSinCompra ?? 0) > 30;
            } else {
              return !c.tieneExhibicion;
            }
          });
          filtered.sort((a, b) => {
            if (a.diasSinCompra === null) return 1;
            if (b.diasSinCompra === null) return -1;
            return b.diasSinCompra - a.diasSinCompra;
          });
          setActivacionPdvs(filtered.map(c => ({ id: c.id, idErp: c.idErp, nombre: c.nombre, fechaCompra: c.fechaCompra, diasSinCompra: c.diasSinCompra })));
        })
        .catch(() => setActivacionPdvs([]))
        .finally(() => setLoadingCtx(false));
    } else {
      setLoadingCtx(false);
    }
  }, [vendedorId, tipo]); // eslint-disable-line react-hooks/exhaustive-deps

  function buildPhrase(): string {
    if (!vendedorNombre) return "[ Vendedor ] …";
    const diasDisponibles = fecha
      ? Math.max(0, Math.ceil((new Date(fecha).getTime() - Date.now()) / 86400000))
      : null;
    const fechaLabel = fecha ? ` para el día ${fecha}` : "";
    const diasLabel = diasDisponibles !== null ? ` Tenés ${diasDisponibles} días para cumplir el objetivo.` : "";

    if (tipo === "ruteo_alteo" && selectedRuta) {
      const qty = cantidadAlteo || selectedRuta.total_pdv;
      return `${vendedorNombre} debe Altear ${qty} PDVs en la ruta ${selectedRuta.nombre_ruta} de los días ${selectedRuta.dia_semana}${fechaLabel}.${diasLabel}`;
    }
    if (tipo === "cobranza" && selectedDeudor) {
      const monto = cobranzaMode === "parcial" && cobranzaMonto ? cobranzaMonto : selectedDeudor.deuda_total;
      return `${vendedorNombre} deberá cobrarle $${Number(monto).toLocaleString("es-AR")} a ${selectedDeudor.cliente_nombre}${fechaLabel}.`;
    }
    if (tipo === "conversion_estado") return `${vendedorNombre} debe activar clientes inactivos${fechaLabel}.`;
    if (tipo === "exhibicion") return `${vendedorNombre} debe exhibir en PDVs${fechaLabel}.`;
    return `${vendedorNombre} — objetivo ${TIPO_CONFIG[tipo]?.label ?? tipo}${fechaLabel}.`;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendedorId) return;

    const base: ObjetivoCreate = {
      id_distribuidor: distId,
      id_vendedor: Number(vendedorId),
      nombre_vendedor: vendedorNombre,
      tipo,
      ...(fecha ? { fecha_objetivo: fecha } : {}),
    };

    if (tipo === "ruteo_alteo") {
      base.valor_objetivo = cantidadAlteo ? Number(cantidadAlteo) : (selectedRuta?.total_pdv ?? undefined);
      if (selectedRuta) { base.estado_inicial = selectedRuta.dia_semana; base.id_target_ruta = selectedRuta.id_ruta; }
      base.descripcion = desc || buildPhrase();
      onCreate([base]);
      return;
    }

    if (tipo === "cobranza") {
      if (selectedDeudor) {
        base.valor_objetivo = cobranzaMode === "parcial" && cobranzaMonto
          ? Number(cobranzaMonto)
          : selectedDeudor.deuda_total;
      }
      base.descripcion = desc || buildPhrase();
      onCreate([base]);
      return;
    }

    if (tipo === "exhibicion" && selectedPdvIds.size > 0) {
      const pdvItems = Array.from(selectedPdvIds).map(pdvId => {
        const pdv = activacionPdvs.find(p => p.id === pdvId);
        return { id_cliente_pdv: pdvId, nombre_pdv: pdv?.nombre };
      });
      const count = pdvItems.length;
      base.pdv_items = pdvItems;
      base.valor_objetivo = count;
      base.descripcion = desc || `Lograr exhibición en ${count} PDV${count > 1 ? 's' : ''}`;
      onCreate([base]);
      return;
    }

    base.descripcion = desc || buildPhrase();
    onCreate([base]);
  };

  const TIPOS_DISPONIBLES: ObjetivoTipo[] = ["ruteo_alteo", "conversion_estado", "exhibicion", "cobranza", "general"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-[var(--shelfy-accent)]" />
            <h2 className="text-sm font-semibold text-[var(--shelfy-text)]">Nuevo objetivo</h2>
          </div>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Live phrase preview */}
          <div className="rounded-xl bg-[var(--shelfy-bg)] border border-[var(--shelfy-accent)]/20 p-3">
            <p className="text-[11px] text-[var(--shelfy-muted)] mb-1 uppercase tracking-wider font-medium">Objetivo generado</p>
            <p className="text-sm text-[var(--shelfy-text)] leading-relaxed">{buildPhrase()}</p>
          </div>

          {/* Vendedor */}
          <div>
            <label className="text-[11px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1.5">Vendedor</label>
            <div className="relative">
              <select
                required
                className="w-full appearance-none bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-3 py-2 text-sm text-[var(--shelfy-text)] focus:outline-none focus:border-[var(--shelfy-accent)]/60"
                value={vendedorId}
                onChange={e => setVendedorId(Number(e.target.value) || "")}
              >
                <option value="">Seleccionar...</option>
                {vendedores.map(v => (
                  <option key={v.id_vendedor} value={v.id_vendedor}>{v.nombre_erp}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--shelfy-muted)] pointer-events-none" />
            </div>
          </div>

          {/* Tipo */}
          <div>
            <label className="text-[11px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1.5">Tipo</label>
            <div className="flex gap-1.5 flex-wrap">
              {TIPOS_DISPONIBLES.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipo(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    tipo === t
                      ? "border-[var(--shelfy-accent)] bg-[var(--shelfy-accent)]/10 text-[var(--shelfy-accent)]"
                      : "border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"
                  }`}
                >
                  {TIPO_CONFIG[t].label}
                </button>
              ))}
            </div>
          </div>

          {/* Contextual: Alteo */}
          {tipo === "ruteo_alteo" && (
            <div className="space-y-2 rounded-xl bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] p-3">
              <p className="text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider">Ruta del vendedor</p>
              {!vendedorId ? (
                <p className="text-xs text-[var(--shelfy-muted)]">Seleccioná un vendedor para ver sus rutas</p>
              ) : loadingCtx ? (
                <div className="flex items-center gap-1.5 text-xs text-[var(--shelfy-muted)]">
                  <Loader2 className="w-3 h-3 animate-spin" /> Cargando rutas...
                </div>
              ) : rutas.length === 0 ? (
                <p className="text-xs text-[var(--shelfy-muted)]">Sin rutas registradas</p>
              ) : (
                <div className="space-y-1">
                  {rutas.map(r => (
                    <button
                      key={r.id_ruta}
                      type="button"
                      onClick={() => setSelectedRutaId(selectedRutaId === r.id_ruta ? null : r.id_ruta)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors border ${
                        selectedRutaId === r.id_ruta
                          ? "border-[var(--shelfy-accent)]/60 bg-[var(--shelfy-accent)]/10 text-[var(--shelfy-text)]"
                          : "border-transparent hover:bg-black/5 text-[var(--shelfy-muted)]"
                      }`}
                    >
                      <span className="font-medium">{r.nombre_ruta}</span>
                      <span className="flex items-center gap-2 text-[10px]">
                        <span className="opacity-70">{r.dia_semana}</span>
                        <span className="text-[var(--shelfy-accent)] font-semibold">{r.total_pdv} PDVs</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {selectedRutaId && (
                <div>
                  <label className="text-[10px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1">
                    Cantidad a altear
                  </label>
                  <input
                    type="number"
                    min={1}
                    placeholder={String(selectedRuta?.total_pdv ?? "Todos")}
                    className="w-full bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--shelfy-text)] focus:outline-none focus:border-[var(--shelfy-accent)]/60"
                    value={cantidadAlteo}
                    onChange={e => setCantidadAlteo(e.target.value ? Number(e.target.value) : "")}
                  />
                </div>
              )}
            </div>
          )}

          {/* Contextual: Cobranza */}
          {tipo === "cobranza" && (
            <div className="space-y-2 rounded-xl bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] p-3">
              <p className="text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider">Deudores del vendedor</p>
              {!vendedorId ? (
                <p className="text-xs text-[var(--shelfy-muted)]">Seleccioná un vendedor para ver sus deudores</p>
              ) : loadingCtx ? (
                <div className="flex items-center gap-1.5 text-xs text-[var(--shelfy-muted)]">
                  <Loader2 className="w-3 h-3 animate-spin" /> Cargando deudores...
                </div>
              ) : deudores.length === 0 ? (
                <p className="text-xs text-[var(--shelfy-muted)]">Sin deuda registrada</p>
              ) : (
                <div className="max-h-36 overflow-y-auto space-y-0.5">
                  {deudores.map((d, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedDeudor(selectedDeudor?.cliente_nombre === d.cliente_nombre ? null : d)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors border ${
                        selectedDeudor?.cliente_nombre === d.cliente_nombre
                          ? "border-orange-500/40 bg-orange-500/10"
                          : "border-transparent hover:bg-black/5"
                      }`}
                    >
                      <span className="text-[var(--shelfy-text)] truncate max-w-[65%] text-left">{d.cliente_nombre}</span>
                      <span className="text-orange-500 font-medium tabular-nums">${d.deuda_total.toLocaleString("es-AR")}</span>
                    </button>
                  ))}
                </div>
              )}
              {selectedDeudor && (
                <div className="space-y-1.5 pt-1 border-t border-[var(--shelfy-border)]">
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => setCobranzaMode("total")}
                      className={`flex-1 py-1 rounded-lg text-xs font-medium transition-colors border ${
                        cobranzaMode === "total"
                          ? "border-orange-500/40 bg-orange-500/10 text-orange-500"
                          : "border-[var(--shelfy-border)] text-[var(--shelfy-muted)]"
                      }`}>
                      Total (${selectedDeudor.deuda_total.toLocaleString("es-AR")})
                    </button>
                    <button type="button" onClick={() => setCobranzaMode("parcial")}
                      className={`flex-1 py-1 rounded-lg text-xs font-medium transition-colors border ${
                        cobranzaMode === "parcial"
                          ? "border-orange-500/40 bg-orange-500/10 text-orange-500"
                          : "border-[var(--shelfy-border)] text-[var(--shelfy-muted)]"
                      }`}>
                      Parcial
                    </button>
                  </div>
                  {cobranzaMode === "parcial" && (
                    <input
                      type="number"
                      min={1}
                      max={selectedDeudor.deuda_total}
                      placeholder="Monto a cobrar..."
                      className="w-full bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--shelfy-text)] focus:outline-none focus:border-[var(--shelfy-accent)]/60"
                      value={cobranzaMonto}
                      onChange={e => setCobranzaMonto(e.target.value ? Number(e.target.value) : "")}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Contextual: Activación / Exhibición */}
          {(tipo === "conversion_estado" || tipo === "exhibicion") && vendedorId && (
            <div className="space-y-2 rounded-xl bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] p-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider">
                  {tipo === "conversion_estado" ? "PDVs sin compra +30 días" : "PDVs sin exhibición reciente"}
                </p>
                {tipo === "exhibicion" && selectedPdvIds.size > 0 && (
                  <span className="text-[10px] font-semibold text-[var(--shelfy-accent)]">
                    {selectedPdvIds.size} seleccionado{selectedPdvIds.size > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              {loadingCtx ? (
                <div className="flex items-center gap-1.5 text-xs text-[var(--shelfy-muted)]">
                  <Loader2 className="w-3 h-3 animate-spin" /> Cargando PDVs...
                </div>
              ) : activacionPdvs.length === 0 ? (
                <p className="text-xs text-[var(--shelfy-muted)]">Sin PDVs en esa condición</p>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-0.5">
                  {activacionPdvs.slice(0, 25).map((pdv) => {
                    const isSelected = tipo === "exhibicion" && selectedPdvIds.has(pdv.id);
                    return (
                      <button
                        key={pdv.id}
                        type="button"
                        onClick={() => {
                          if (tipo === "exhibicion") {
                            setSelectedPdvIds(prev => {
                              const next = new Set(prev);
                              if (next.has(pdv.id)) next.delete(pdv.id); else next.add(pdv.id);
                              return next;
                            });
                          } else {
                            setDesc(`Activar a ${pdv.nombre} (sin compra hace ${pdv.diasSinCompra ?? "N"} días)`);
                          }
                        }}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors border ${
                          isSelected
                            ? "bg-[var(--shelfy-accent)]/10 border-[var(--shelfy-accent)]/40"
                            : "bg-black/[0.02] border-transparent hover:bg-[var(--shelfy-accent)]/10 hover:border-[var(--shelfy-accent)]/20"
                        }`}
                      >
                        {tipo === "exhibicion" && (
                          <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                            isSelected ? "bg-[var(--shelfy-accent)] border-[var(--shelfy-accent)]" : "border-[var(--shelfy-border)]"
                          }`}>
                            {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                          </div>
                        )}
                        <span className="text-[var(--shelfy-text)] truncate flex-1 text-left">{pdv.nombre}</span>
                        {pdv.diasSinCompra !== null ? (
                          <span className={`font-medium tabular-nums shrink-0 ${pdv.diasSinCompra > 60 ? "text-red-500" : "text-orange-500"}`}>
                            {pdv.diasSinCompra}d
                          </span>
                        ) : (
                          <span className="text-[var(--shelfy-muted)] shrink-0">S/C</span>
                        )}
                      </button>
                    );
                  })}
                  {activacionPdvs.length > 25 && (
                    <p className="text-[10px] text-[var(--shelfy-muted)] text-center pt-1">+{activacionPdvs.length - 25} más</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Fecha límite */}
          <div>
            <label className="text-[11px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1.5">
              Fecha límite <span className="normal-case font-normal">(opcional)</span>
            </label>
            <input
              type="date"
              className="w-full bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-3 py-2 text-sm text-[var(--shelfy-text)] focus:outline-none focus:border-[var(--shelfy-accent)]/60"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
            />
          </div>

          {/* Descripción */}
          <div>
            <label className="text-[11px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1.5">
              Descripción <span className="normal-case font-normal">(deja vacío para usar la frase generada)</span>
            </label>
            <textarea
              rows={2}
              placeholder="Descripción personalizada..."
              className="w-full bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-3 py-2 text-sm text-[var(--shelfy-text)] placeholder-[var(--shelfy-muted)]/60 focus:outline-none focus:border-[var(--shelfy-accent)]/60 resize-none"
              value={desc}
              onChange={e => setDesc(e.target.value)}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-[var(--shelfy-border)] text-sm text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={loading || !vendedorId}
              className="flex-1 py-2 rounded-lg bg-[var(--shelfy-accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Crear objetivo
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Vista Supervisor ──────────────────────────────────────────────────────────

function VistaSupervisor({ distId }: { distId: number }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["objetivos-resumen-supervisor", distId],
    queryFn: () => fetchResumenSupervisorObjetivos(distId),
    enabled: !!distId,
    staleTime: 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
      </div>
    );
  }
  if (isError || !data) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Error al cargar el resumen de supervisor</AlertDescription>
      </Alert>
    );
  }

  const { totales, vendedores } = data;

  if (vendedores.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-[var(--shelfy-muted)]">
        <Users className="w-8 h-8 opacity-15 mb-2" />
        <p className="text-sm">No hay objetivos activos</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--shelfy-accent)]/20 bg-[var(--shelfy-accent)]/5 p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-xs text-[var(--shelfy-muted)] uppercase tracking-wider font-medium mb-0.5">Meta agregada del equipo</p>
            <p className="text-2xl font-bold text-[var(--shelfy-text)] tabular-nums">
              {Math.round(totales.cantidad_objetivo_total)}
              <span className="text-sm font-normal text-[var(--shelfy-muted)] ml-1.5">PDVs</span>
            </p>
            <p className="text-xs text-[var(--shelfy-muted)] mt-0.5">
              {totales.vendedores_count} vendedores · {Math.round(totales.cantidad_actual_total)} completados
            </p>
          </div>
          <div className="flex items-center gap-1.5 bg-[var(--shelfy-bg)] rounded-lg px-3 py-2">
            <BarChart3 className="w-4 h-4 text-[var(--shelfy-accent)]" />
            <span className="text-lg font-bold text-[var(--shelfy-accent)]">{totales.pct_progreso}%</span>
          </div>
        </div>
        <ProgressBar actual={totales.cantidad_actual_total} objetivo={totales.cantidad_objetivo_total} />
      </div>

      <div className="rounded-xl border border-[var(--shelfy-border)] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--shelfy-border)] bg-[var(--shelfy-panel)]">
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider">Vendedor</th>
              <th className="px-4 py-2.5 text-center text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider">Objetivos</th>
              <th className="px-4 py-2.5 text-center text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider">Meta PDVs</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider w-40">Progreso</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider">Fecha</th>
            </tr>
          </thead>
          <tbody className="bg-[var(--shelfy-bg)]">
            {vendedores.map(v => (
              <VendedorResumenRow key={v.id_vendedor} v={v} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Vista Timeline ────────────────────────────────────────────────────────────

function VistaTimeline({ distId, vendedores }: { distId: number; vendedores: { id_vendedor: number; nombre_erp: string }[] }) {
  const { filterVendedores, filterSucursal, toggleFilterVendedor, setFilterSucursal } = useObjetivosStore();

  const { data: timelines = [], isLoading, isError } = useQuery({
    queryKey: ["objetivos-timeline", distId, filterVendedores, filterSucursal],
    queryFn: () => fetchObjetivosTimeline(
      distId,
      filterVendedores.length === 1 ? filterVendedores[0] : undefined,
      filterSucursal ?? undefined
    ),
    enabled: !!distId,
    staleTime: 30 * 1000,
  });

  const formatTs = (ts?: string) => {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }) + " " +
      d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="space-y-4">
      {/* Filter pills for vendedores */}
      {vendedores.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {vendedores.slice(0, 12).map(v => (
            <button
              key={v.id_vendedor}
              onClick={() => toggleFilterVendedor(v.id_vendedor)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                filterVendedores.includes(v.id_vendedor)
                  ? "bg-[var(--shelfy-accent)] text-white border-[var(--shelfy-accent)]"
                  : "border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"
              }`}
            >
              {v.nombre_erp}
            </button>
          ))}
          {filterVendedores.length > 0 && (
            <button
              onClick={() => useObjetivosStore.getState().setFilterVendedores([])}
              className="px-2.5 py-1 rounded-full text-xs border border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-red-500 transition-all"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {isLoading && (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
        </div>
      )}

      {isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Error al cargar el timeline</AlertDescription>
        </Alert>
      )}

      {!isLoading && !isError && timelines.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-[var(--shelfy-muted)]">
          <Activity className="w-8 h-8 opacity-15 mb-2" />
          <p className="text-sm">No hay eventos de timeline disponibles</p>
          <p className="text-xs mt-1">Los eventos se generan conforme avancen los objetivos</p>
        </div>
      )}

      <ScrollArea className="h-[60vh]">
        <div className="space-y-6 pr-4">
          {timelines.map(tl => (
            <div key={tl.id_objetivo} className="rounded-xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] overflow-hidden">
              {/* Header */}
              <div className="px-4 py-3 border-b border-[var(--shelfy-border)] flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-[var(--shelfy-text)] truncate">
                      {tl.nombre_vendedor ?? "Vendedor desconocido"}
                    </span>
                    {tl.tipo && (
                      <TipoBadge tipo={tl.tipo as ObjetivoTipo} />
                    )}
                    {tl.resultado_final === "exito" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-semibold">Exito</span>
                    )}
                    {tl.resultado_final === "falla" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 font-semibold">Falla</span>
                    )}
                  </div>
                  {tl.descripcion && (
                    <p className="text-xs text-[var(--shelfy-muted)] mt-0.5 truncate">{tl.descripcion}</p>
                  )}
                </div>
                {tl.fecha_objetivo && (
                  <DateChip date={tl.fecha_objetivo} />
                )}
              </div>

              {/* Events */}
              <div className="px-4 py-3">
                {tl.eventos.length === 0 ? (
                  <p className="text-xs text-[var(--shelfy-muted)]">Sin eventos registrados</p>
                ) : (
                  <div className="relative pl-5 space-y-3">
                    {/* Vertical line */}
                    <div className="absolute left-1.5 top-2 bottom-2 w-px bg-[var(--shelfy-border)]" />
                    {tl.eventos.map((ev, idx) => {
                      const dotColor = TIMELINE_EVENT_COLORS[ev.tipo_evento] ?? "bg-slate-400";
                      return (
                        <div key={ev.id ?? idx} className="relative flex items-start gap-3">
                          <span className={`absolute -left-[15px] w-2.5 h-2.5 rounded-full border-2 border-white ${dotColor} shrink-0 mt-0.5`} />
                          <div className="min-w-0">
                            <span className="text-xs font-medium text-[var(--shelfy-text)] capitalize">
                              {ev.tipo_evento.replace(/_/g, " ")}
                            </span>
                            {ev.created_at && (
                              <span className="text-[10px] text-[var(--shelfy-muted)] ml-2 tabular-nums">{formatTs(ev.created_at)}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Print Module ──────────────────────────────────────────────────────────────

function ObjectivePrintOut({ objetivos }: { objetivos: Objetivo[] }) {
  return (
    <div className="shelfy-objetivos-print hidden">
      {objetivos.map(obj => (
        <div key={obj.id} className="print-page-break" style={{
          border: "1px solid #e2e8f0",
          padding: 32,
          marginBottom: 0,
          background: "white",
          color: "#0f172a",
        }}>
          <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>
            Objetivo de venta
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>
            {obj.nombre_vendedor ?? `Vendedor ${obj.id_vendedor}`}
          </div>
          <div style={{ fontSize: 13, color: "#334155", marginBottom: 16, lineHeight: 1.6, borderLeft: "3px solid #7C3AED", paddingLeft: 12 }}>
            {obj.descripcion || `${TIPO_CONFIG[obj.tipo]?.label ?? obj.tipo} — Meta: ${obj.valor_objetivo ?? "–"}`}
          </div>
          {obj.fecha_objetivo && (
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
              Fecha límite: <strong>{formatDate(obj.fecha_objetivo)}</strong>
            </div>
          )}
          {obj.items && obj.items.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>PDVs</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {obj.items.map(it => (
                  <div key={it.id_cliente_pdv} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                    <div style={{ width: 14, height: 14, border: "1.5px solid #64748b", borderRadius: 3, flexShrink: 0 }} />
                    <span style={{ color: "#334155" }}>{it.nombre_pdv ?? `PDV ${it.id_cliente_pdv}`}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {obj.valor_objetivo && (
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
              Progreso: {obj.valor_actual} / {Math.round(obj.valor_objetivo)}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 24, paddingTop: 12, borderTop: "1px solid #e2e8f0" }}>
            <div style={{ width: 18, height: 18, border: "2px solid #64748b", borderRadius: 3 }} />
            <span style={{ fontSize: 12, color: "#64748b" }}>Completado</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Vista Estadísticas ────────────────────────────────────────────────────────

const PIE_COLORS: Record<string, string> = {
  conversion_estado: "#60a5fa",
  cobranza:          "#fb923c",
  ruteo_alteo:       "#a78bfa",
  exhibicion:        "#34d399",
  general:           "#94a3b8",
};

function VistaEstadisticas({ objetivos }: { objetivos: Objetivo[] }) {
  const total      = objetivos.length;
  const cumplidos  = objetivos.filter(o => o.cumplido).length;
  const pendientes = total - cumplidos;
  const eficiencia = total > 0 ? Math.round((cumplidos / total) * 100) : 0;

  const rankingMap: Record<string, { nombre: string; completados: number; total: number }> = {};
  for (const o of objetivos) {
    const key = String(o.id_vendedor);
    if (!rankingMap[key]) rankingMap[key] = { nombre: o.nombre_vendedor ?? `Vendedor ${o.id_vendedor}`, completados: 0, total: 0 };
    rankingMap[key].total++;
    if (o.cumplido) rankingMap[key].completados++;
  }
  const ranking = Object.values(rankingMap)
    .sort((a, b) => b.completados - a.completados || b.total - a.total)
    .slice(0, 8);

  const tipoCount: Record<string, number> = {};
  for (const o of objetivos) {
    tipoCount[o.tipo] = (tipoCount[o.tipo] || 0) + 1;
  }
  const pieData = Object.entries(tipoCount).map(([tipo, count]) => ({
    name: TIPO_CONFIG[tipo as ObjetivoTipo]?.label ?? tipo,
    value: count,
    tipo,
  }));

  const barData = Object.entries(tipoCount).map(([tipo, count]) => ({
    name: TIPO_CONFIG[tipo as ObjetivoTipo]?.label ?? tipo,
    cantidad: count,
    fill: PIE_COLORS[tipo] ?? "#94a3b8",
  }));

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-[var(--shelfy-muted)]">
        <BarChart3 className="w-8 h-8 opacity-15 mb-2" />
        <p className="text-sm">Sin objetivos para analizar</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Target}       label="Total objetivos"  value={total}       color="bg-[var(--shelfy-border)]" />
        <StatCard icon={CheckCircle2} label="Completados"       value={cumplidos}   color="bg-emerald-500/10 text-emerald-600" />
        <StatCard icon={Clock}        label="En curso"          value={pendientes}  color="bg-orange-500/10 text-orange-500" />
        <StatCard
          icon={TrendingUp}
          label="Eficiencia"
          value={`${eficiencia}%`}
          sub={`${cumplidos} de ${total}`}
          color="bg-[var(--shelfy-accent)]/10 text-[var(--shelfy-accent)]"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Ranking vendedores */}
        <div className="rounded-xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--shelfy-border)]">
            <p className="text-xs font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider">Ranking vendedores</p>
          </div>
          <div className="divide-y divide-[var(--shelfy-border)]/50">
            {ranking.map((v, i) => {
              const pct = v.total > 0 ? Math.round((v.completados / v.total) * 100) : 0;
              return (
                <div key={v.nombre} className="flex items-center gap-3 px-4 py-2.5">
                  <span className={`w-5 text-center text-xs font-bold tabular-nums ${
                    i === 0 ? "text-yellow-500" : i === 1 ? "text-slate-400" : i === 2 ? "text-amber-600" : "text-[var(--shelfy-muted)]"
                  }`}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[var(--shelfy-text)] truncate">{v.nombre}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className="flex-1 h-1 rounded-full bg-[var(--shelfy-border)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[var(--shelfy-accent)] transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-[var(--shelfy-muted)] tabular-nums">{pct}%</span>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-emerald-600 tabular-nums">{v.completados}</span>
                  <span className="text-[10px] text-[var(--shelfy-muted)] tabular-nums">/ {v.total}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Distribución por tipo (pie + bar) */}
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--shelfy-border)]">
              <p className="text-xs font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider">Distribución por tipo</p>
            </div>
            <div className="p-4" style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.tipo} fill={PIE_COLORS[entry.tipo] ?? "#94a3b8"} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--shelfy-panel)",
                      border: "0.5px solid var(--shelfy-border)",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "var(--shelfy-text)",
                    }}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => (
                      <span style={{ fontSize: 11, color: "var(--shelfy-text)" }}>{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--shelfy-border)]">
              <p className="text-xs font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider">Cantidad por tipo</p>
            </div>
            <div className="p-4" style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--shelfy-border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--shelfy-muted)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--shelfy-muted)" }} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--shelfy-panel)",
                      border: "0.5px solid var(--shelfy-border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="cantidad" radius={[3, 3, 0, 0]}>
                    {barData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type PageTab = "objetivos" | "supervisor" | "estadisticas";

export default function ObjetivosPage() {
  const { user } = useAuth();
  const distId = user?.id_distribuidor ?? 0;
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [pageTab, setPageTab] = useState<PageTab>("objetivos");

  const {
    filterTipo, filterCumplido, searchText, viewMode,
    setFilterTipo, setFilterCumplido, setSearchText, setViewMode,
    filterVendedores,
  } = useObjetivosStore();

  const [selectedSucursal, setSelectedSucursal] = useState<string>("");
  const [selectedVendedorId, setSelectedVendedorId] = useState<number | null>(null);

  // ── Data ──────────────────────────────────────────────────────────────────

  const { data: vendedoresData } = useQuery({
    queryKey: ["vendedores-supervision", distId],
    queryFn: () => fetchVendedoresSupervision(distId),
    enabled: !!distId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: objetivos = [], isLoading, isError } = useQuery({
    queryKey: ["objetivos", distId, filterCumplido, filterTipo],
    queryFn: () => fetchObjetivos(distId, {
      ...(filterCumplido !== null && { cumplido: filterCumplido }),
      ...(filterTipo && { tipo: filterTipo }),
    }),
    enabled: !!distId && pageTab !== "supervisor",
    staleTime: 30 * 1000,
  });

  const createMut = useMutation({
    mutationFn: async (items: ObjetivoCreate[]) => {
      for (const d of items) await createObjetivo(d);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["objetivos", distId] });
      qc.invalidateQueries({ queryKey: ["objetivos-resumen-supervisor", distId] });
      setModalOpen(false);
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, cumplido }: { id: string; cumplido: boolean }) =>
      updateObjetivo(id, { cumplido }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["objetivos", distId] });
      qc.invalidateQueries({ queryKey: ["objetivos-resumen-supervisor", distId] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: deleteObjetivo,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["objetivos", distId] });
      qc.invalidateQueries({ queryKey: ["objetivos-resumen-supervisor", distId] });
    },
  });

  // ── WebSocket — auto-refresh on objetivo_evento ───────────────────────────
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!distId) return;

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;

    const invalidate = () => {
      if (debounceRef.current) return;
      qc.invalidateQueries({ queryKey: ["objetivos", distId] });
      qc.invalidateQueries({ queryKey: ["objetivos-resumen-supervisor", distId] });
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
      }, 500);
    };

    const connect = () => {
      if (!alive) return;
      socket = new WebSocket(getWSUrl(distId));

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "objetivo_evento") {
            invalidate();
          }
        } catch {
          // malformed frame — ignore
        }
      };

      socket.onclose = () => {
        if (!alive) return;
        reconnectTimer = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      alive = false;
      if (socket) socket.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [distId, qc]);

  // ── Derived vendedores + sucursales ──────────────────────────────────────

  const vendedores = (vendedoresData ?? []).map(v => ({
    id_vendedor: v.id_vendedor,
    nombre_erp: v.nombre_vendedor,
    sucursal_nombre: v.sucursal_nombre,
  }));

  const sucursales = useMemo(() => {
    const seen = new Set<string>();
    return vendedores
      .map(v => v.sucursal_nombre)
      .filter((s): s is string => !!s && !seen.has(s) && seen.add(s) !== undefined)
      .sort((a, b) => a.localeCompare(b, "es"));
  }, [vendedores]);

  const vendedoresEnSucursal = useMemo(() => {
    if (!selectedSucursal) return vendedores;
    return vendedores.filter(v => v.sucursal_nombre === selectedSucursal);
  }, [vendedores, selectedSucursal]);

  const vendedorNamesEnSucursal = useMemo(
    () => new Set(vendedoresEnSucursal.map(v => v.nombre_erp.toLowerCase())),
    [vendedoresEnSucursal],
  );

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = objetivos;

    // Privacy Filter
    if (!user?.is_superadmin) {
      list = list.filter(o =>
        !(o.nombre_vendedor ?? "").toLowerCase().includes("nacho piazza") &&
        !(o.nombre_vendedor ?? "").toLowerCase().includes("test") &&
        !(o.id_cliente_erp ?? "").startsWith("999")
      );
    }

    if (searchText) {
      const q = searchText.toLowerCase();
      list = list.filter(o =>
        (o.nombre_vendedor ?? "").toLowerCase().includes(q) ||
        (o.nombre_pdv ?? "").toLowerCase().includes(q) ||
        (o.descripcion ?? "").toLowerCase().includes(q)
      );
    }

    if (selectedSucursal) {
      list = list.filter(o =>
        vendedorNamesEnSucursal.has((o.nombre_vendedor ?? "").toLowerCase())
      );
    }

    if (selectedVendedorId !== null) {
      const target = vendedores.find(v => v.id_vendedor === selectedVendedorId);
      if (target) {
        const name = target.nombre_erp.toLowerCase();
        list = list.filter(o => (o.nombre_vendedor ?? "").toLowerCase() === name);
      }
    }

    return list;
  }, [objetivos, searchText, selectedSucursal, selectedVendedorId, vendedorNamesEnSucursal, vendedores, user?.is_superadmin]);

  // ── Stats ─────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const total = filtered.length;
    const cumplidos = filtered.filter(o => o.cumplido).length;
    const pendientes = total - cumplidos;
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const completadosSemana = filtered.filter(o => o.cumplido && o.completed_at && o.completed_at > weekAgo).length;
    const pct = total > 0 ? Math.round((cumplidos / total) * 100) : 0;
    return { total, cumplidos, pendientes, completadosSemana, pct };
  }, [filtered]);

  // ── Kanban groups ─────────────────────────────────────────────────────────

  const kanbanGroups = useMemo(() => ({
    pendiente:   filtered.filter(o => getObjectiveKanbanPhase(o) === 'pendiente'),
    en_progreso: filtered.filter(o => getObjectiveKanbanPhase(o) === 'en_progreso'),
    terminado:   filtered.filter(o => getObjectiveKanbanPhase(o) === 'terminado'),
  }), [filtered]);

  // ── Re-agendar state ──────────────────────────────────────────────────────

  const [reagendarObj, setReagendarObj] = useState<Objetivo | null>(null);
  const [fechaReagendar, setFechaReagendar] = useState<string>("");
  const [observacionReagendar, setObservacionReagendar] = useState<string>("");

  // ── View mode helpers ─────────────────────────────────────────────────────

  const VIEW_BUTTONS: { key: typeof viewMode; label: string; Icon: React.ElementType }[] = [
    { key: "kanban",   label: "Kanban",   Icon: LayoutGrid },
    { key: "timeline", label: "Timeline", Icon: GitBranch },
    { key: "stats",    label: "Stats",    Icon: BarChart3 },
    { key: "print",    label: "Imprimir", Icon: Printer },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="Objetivos" />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6">

          {/* Header */}
          <div className="flex items-start justify-between mb-6 print-hidden">
            <div>
              <h1 className="text-xl font-semibold text-[var(--shelfy-text)]">Objetivos</h1>
              <p className="text-sm text-[var(--shelfy-muted)] mt-0.5">Seguimiento de metas por vendedor</p>
            </div>
            <div className="flex items-center gap-2">
              {/* View mode switcher */}
              <div className="flex gap-1 bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] rounded-lg p-1">
                {VIEW_BUTTONS.map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    onClick={() => {
                      setViewMode(key);
                      if (key === "print") window.print();
                    }}
                    title={label}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                      viewMode === key
                        ? "bg-[var(--shelfy-accent)] text-white"
                        : "text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setModalOpen(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--shelfy-accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Nuevo</span>
              </button>
            </div>
          </div>

          {/* Stats (only on objetivos / kanban view) */}
          {pageTab === "objetivos" && viewMode !== "stats" && viewMode !== "timeline" && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 print-hidden">
              <StatCard icon={Target}       label="Total"          value={stats.total}             color="bg-[var(--shelfy-border)]" />
              <StatCard icon={Clock}        label="Pendientes"     value={stats.pendientes}         color="bg-orange-500/10 text-orange-500" />
              <StatCard icon={CheckCircle2} label="Esta semana"    value={stats.completadosSemana}  sub="completados" color="bg-emerald-500/10 text-emerald-600" />
              <StatCard icon={TrendingUp}   label="% Cumplimiento" value={`${stats.pct}%`}          sub={`${stats.cumplidos} de ${stats.total}`} color="bg-[var(--shelfy-accent)]/10 text-[var(--shelfy-accent)]" />
            </div>
          )}

          {/* Page tabs */}
          <div className="flex gap-1 bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] rounded-lg p-1 mb-4 w-fit print-hidden">
            {[
              { key: "objetivos" as const,    label: "Por objetivo",     Icon: Target },
              { key: "supervisor" as const,   label: "Vista supervisor",  Icon: Users },
              { key: "estadisticas" as const, label: "Estadísticas",     Icon: BarChart3 },
            ].map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setPageTab(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  pageTab === key ? "bg-[var(--shelfy-accent)]/10 text-[var(--shelfy-accent)]" : "text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {pageTab === "supervisor" ? (
            <VistaSupervisor distId={distId} />
          ) : pageTab === "estadisticas" ? (
            <VistaEstadisticas objetivos={filtered} />
          ) : (
            <>
              {/* Filtros */}
              <div className="flex flex-wrap gap-2 mb-3 print-hidden">
                {/* Search */}
                <div className="relative flex-1 min-w-48">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--shelfy-muted)] pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Buscar vendedor, PDV..."
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] rounded-lg text-sm text-[var(--shelfy-text)] placeholder-[var(--shelfy-muted)]/60 focus:outline-none focus:border-[var(--shelfy-accent)]/60"
                  />
                </div>

                {/* Tipo */}
                <div className="relative">
                  <select
                    className="appearance-none bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] rounded-lg pl-3 pr-8 py-2 text-sm text-[var(--shelfy-text)] focus:outline-none focus:border-[var(--shelfy-accent)]/60"
                    value={filterTipo ?? ""}
                    onChange={e => setFilterTipo((e.target.value || null) as ObjetivoTipo | null)}
                  >
                    <option value="">Todos los tipos</option>
                    {Object.entries(TIPO_CONFIG).map(([k, cfg]) => (
                      <option key={k} value={k}>{cfg.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--shelfy-muted)] pointer-events-none" />
                </div>

                {/* Estado */}
                <div className="relative">
                  <select
                    className="appearance-none bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] rounded-lg pl-3 pr-8 py-2 text-sm text-[var(--shelfy-text)] focus:outline-none focus:border-[var(--shelfy-accent)]/60"
                    value={filterCumplido === null ? "" : String(filterCumplido)}
                    onChange={e => {
                      const v = e.target.value;
                      setFilterCumplido(v === "" ? null : v === "true");
                    }}
                  >
                    <option value="">Todos</option>
                    <option value="false">Pendientes</option>
                    <option value="true">Completados</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--shelfy-muted)] pointer-events-none" />
                </div>

                {/* Lista view toggle (only visible on kanban tab) */}
                {viewMode === "kanban" && (
                  <div className="flex gap-1 bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] rounded-lg p-1">
                    <button
                      onClick={() => setViewMode("kanban")}
                      className="p-1.5 rounded bg-white/10 text-[var(--shelfy-text)]"
                      title="Kanban"
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        // Switch to lista within the objetivos tab context using a local toggle
                        // since "lista" was the old mode name, we repurpose the viewMode switcher
                        // to indicate lista via a local flag
                        setViewMode("kanban"); // stays kanban — lista is toggled via alt param
                      }}
                      className="p-1.5 rounded text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"
                      title="Lista"
                      onClick={() => (document.querySelector('[data-lista-toggle]') as HTMLElement)?.click()}
                    >
                      <LayoutList className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Cascading sucursal → vendedor filter */}
              {sucursales.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4 print-hidden">
                  <div className="relative">
                    <select
                      className="appearance-none bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] rounded-lg pl-3 pr-8 py-2 text-sm text-[var(--shelfy-text)] focus:outline-none focus:border-[var(--shelfy-accent)]/60"
                      value={selectedSucursal}
                      onChange={e => {
                        setSelectedSucursal(e.target.value);
                        setSelectedVendedorId(null);
                      }}
                    >
                      <option value="">Sucursal: Todas</option>
                      {sucursales.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--shelfy-muted)] pointer-events-none" />
                  </div>
                  <div className="relative">
                    <select
                      className="appearance-none bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] rounded-lg pl-3 pr-8 py-2 text-sm text-[var(--shelfy-text)] focus:outline-none focus:border-[var(--shelfy-accent)]/60"
                      value={selectedVendedorId ?? ""}
                      onChange={e => setSelectedVendedorId(e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">Vendedor: Todos</option>
                      {vendedoresEnSucursal.map(v => (
                        <option key={v.id_vendedor} value={v.id_vendedor}>{v.nombre_erp}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--shelfy-muted)] pointer-events-none" />
                  </div>
                  {(selectedSucursal || selectedVendedorId !== null) && (
                    <button
                      onClick={() => { setSelectedSucursal(""); setSelectedVendedorId(null); }}
                      className="flex items-center gap-1 px-2.5 py-2 rounded-lg border border-[var(--shelfy-border)] text-xs text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] transition-colors"
                    >
                      <X className="w-3 h-3" /> Limpiar
                    </button>
                  )}
                </div>
              )}

              {/* Content */}
              {viewMode === "timeline" ? (
                <VistaTimeline distId={distId} vendedores={vendedores} />
              ) : viewMode === "stats" ? (
                <VistaEstadisticas objetivos={filtered} />
              ) : isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
                </div>
              ) : isError ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>Error al cargar objetivos</AlertDescription>
                </Alert>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-[var(--shelfy-muted)]">
                  <Target className="w-10 h-10 opacity-15 mb-2" />
                  <p className="text-sm">No hay objetivos que coincidan</p>
                  <button
                    onClick={() => setModalOpen(true)}
                    className="mt-3 text-xs text-[var(--shelfy-accent)] hover:underline"
                  >
                    Crear el primero
                  </button>
                </div>
              ) : (
                /* ── Kanban + Lista toggle ── */
                <KanbanOrListaView
                  filtered={filtered}
                  kanbanGroups={kanbanGroups}
                  onToggle={(id, cumplido) => toggleMut.mutate({ id, cumplido })}
                  onDelete={(id) => deleteMut.mutate(id)}
                  onReagendar={(o) => { setReagendarObj(o); setFechaReagendar(""); setObservacionReagendar(""); }}
                  onDownloadCertificado={downloadCertificado}
                />
              )}
            </>
          )}

          {/* Print zone */}
          <ObjectivePrintOut objetivos={filtered} />
        </main>
      </div>
      <BottomNav />

      {/* Modal nuevo objetivo */}
      {modalOpen && (
        <NuevoObjetivoModal
          distId={distId}
          vendedores={vendedores}
          onClose={() => setModalOpen(false)}
          onCreate={items => createMut.mutate(items)}
          loading={createMut.isPending}
        />
      )}

      {/* Dialog Re-agendar */}
      <Dialog open={!!reagendarObj} onOpenChange={(open) => { if (!open) setReagendarObj(null); }}>
        <DialogContent className="bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-[var(--shelfy-text)]">
              Re-agendar objetivo fallido
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--shelfy-muted)]">
              Se creará un nuevo objetivo vinculado al anterior.
            </DialogDescription>
          </DialogHeader>

          {reagendarObj && (
            <div className="space-y-4 pt-1">
              <div className="rounded-lg bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] p-3 space-y-1">
                <p className="text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider">Objetivo anterior</p>
                <div className="flex items-center gap-1.5">
                  <User className="w-3 h-3 text-[var(--shelfy-muted)] shrink-0" />
                  <span className="text-xs text-[var(--shelfy-text)]">{reagendarObj.nombre_vendedor ?? `ID ${reagendarObj.id_vendedor}`}</span>
                </div>
                <TipoBadge tipo={reagendarObj.tipo} />
                {reagendarObj.descripcion && (
                  <p className="text-xs text-[var(--shelfy-muted)] line-clamp-2">{reagendarObj.descripcion}</p>
                )}
              </div>

              <div>
                <label className="text-[11px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1.5">
                  Nueva fecha límite
                </label>
                <input
                  type="date"
                  min={new Date().toISOString().split("T")[0]}
                  value={fechaReagendar}
                  onChange={e => setFechaReagendar(e.target.value)}
                  className="w-full bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-3 py-2 text-sm text-[var(--shelfy-text)] focus:outline-none focus:border-[var(--shelfy-accent)]/60"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1.5">
                  Observación <span className="normal-case font-normal">(opcional)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Motivo del re-agendamiento..."
                  value={observacionReagendar}
                  onChange={e => setObservacionReagendar(e.target.value)}
                  className="w-full bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-3 py-2 text-sm text-[var(--shelfy-text)] placeholder-[var(--shelfy-muted)]/60 focus:outline-none focus:border-[var(--shelfy-accent)]/60 resize-none"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setReagendarObj(null)}
                  className="flex-1 py-2 rounded-lg border border-[var(--shelfy-border)] text-sm text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!fechaReagendar || createMut.isPending}
                  onClick={() => {
                    if (!reagendarObj || !fechaReagendar) return;
                    createMut.mutate([{
                      id_distribuidor: distId,
                      id_vendedor: reagendarObj.id_vendedor,
                      tipo: reagendarObj.tipo,
                      nombre_pdv: reagendarObj.nombre_pdv ?? undefined,
                      nombre_vendedor: reagendarObj.nombre_vendedor ?? undefined,
                      id_target_pdv: reagendarObj.id_target_pdv ?? undefined,
                      id_target_ruta: reagendarObj.id_target_ruta ?? undefined,
                      estado_inicial: reagendarObj.estado_inicial ?? undefined,
                      estado_objetivo: reagendarObj.estado_objetivo ?? undefined,
                      valor_objetivo: reagendarObj.valor_objetivo ?? undefined,
                      fecha_objetivo: fechaReagendar,
                      descripcion: observacionReagendar || reagendarObj.descripcion || undefined,
                      id_objetivo_padre: reagendarObj.id,
                    }], {
                      onSuccess: () => {
                        setReagendarObj(null);
                        qc.invalidateQueries({ queryKey: ["objetivos", distId] });
                      },
                    });
                  }}
                  className="flex-1 py-2 rounded-lg bg-[var(--shelfy-accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {createMut.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  Crear nuevo objetivo
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Kanban / Lista split view ─────────────────────────────────────────────────

function KanbanOrListaView({
  filtered,
  kanbanGroups,
  onToggle,
  onDelete,
  onReagendar,
  onDownloadCertificado,
}: {
  filtered: Objetivo[];
  kanbanGroups: { pendiente: Objetivo[]; en_progreso: Objetivo[]; terminado: Objetivo[] };
  onToggle: (id: string, cumplido: boolean) => void;
  onDelete: (id: string) => void;
  onReagendar: (obj: Objetivo) => void;
  onDownloadCertificado: (obj: Objetivo) => void;
}) {
  const [listaMode, setListaMode] = useState(false);

  const COLUMNS = [
    { key: "pendiente" as const,   label: "Pendiente",   Icon: Clock,        headerClass: "text-[var(--shelfy-muted)]",  borderClass: "border-t-2 border-t-slate-300" },
    { key: "en_progreso" as const, label: "En progreso", Icon: TrendingUp,   headerClass: "text-violet-600",              borderClass: "border-t-2 border-t-violet-500" },
    { key: "terminado" as const,   label: "Terminado",   Icon: CheckCircle2, headerClass: "text-emerald-600",             borderClass: "border-t-2 border-t-emerald-500" },
  ];

  return (
    <div>
      {/* Local lista/kanban toggle */}
      <div className="flex items-center gap-2 mb-3 print-hidden">
        <div className="flex gap-1 bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] rounded-lg p-1">
          <button
            onClick={() => setListaMode(false)}
            className={`p-1.5 rounded transition-colors ${!listaMode ? "bg-[var(--shelfy-accent)]/10 text-[var(--shelfy-accent)]" : "text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"}`}
            title="Kanban"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setListaMode(true)}
            data-lista-toggle
            className={`p-1.5 rounded transition-colors ${listaMode ? "bg-[var(--shelfy-accent)]/10 text-[var(--shelfy-accent)]" : "text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"}`}
            title="Lista"
          >
            <LayoutList className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {listaMode ? (
        /* ── Lista ── */
        <div className="rounded-xl border border-[var(--shelfy-border)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--shelfy-border)] bg-[var(--shelfy-panel)]">
                <th className="w-8 px-4 py-2.5" />
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider">Vendedor</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider">Tipo</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider">Objetivo</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider w-36">Progreso</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider">Fecha</th>
                <th className="w-10 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="bg-[var(--shelfy-bg)]">
              {filtered.map(obj => (
                <ObjetivoRow
                  key={obj.id}
                  obj={obj}
                  onToggle={() => onToggle(obj.id, !obj.cumplido)}
                  onDelete={() => onDelete(obj.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── Kanban ── */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COLUMNS.map(col => (
            <div key={col.key} className={`rounded-xl border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] overflow-hidden ${col.borderClass}`}>
              <div className="px-4 py-3 border-b border-[var(--shelfy-border)] flex items-center justify-between bg-[var(--shelfy-panel)]">
                <span className={`flex items-center gap-1.5 text-xs font-semibold ${col.headerClass}`}>
                  <col.Icon className="w-3.5 h-3.5" />
                  {col.label}
                </span>
                <span className="text-xs font-semibold text-[var(--shelfy-muted)] bg-[var(--shelfy-bg)] px-1.5 py-0.5 rounded-full border border-[var(--shelfy-border)]">
                  {kanbanGroups[col.key].length}
                </span>
              </div>
              <div className="p-3 space-y-2 min-h-24">
                <AnimatePresence mode="popLayout">
                  {kanbanGroups[col.key].map(obj => (
                    <KanbanCard
                      key={obj.id}
                      obj={obj}
                      onDelete={() => onDelete(obj.id)}
                      onReagendar={onReagendar}
                      onDownloadCertificado={onDownloadCertificado}
                    />
                  ))}
                </AnimatePresence>
                {kanbanGroups[col.key].length === 0 && (
                  <p className="text-[11px] text-[var(--shelfy-muted)] text-center py-4 opacity-50">
                    Sin objetivos
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
