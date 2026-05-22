"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { useObjetivosStore } from "@/store/useObjetivosStore";
import {
  fetchObjetivos,
  fetchObjetivosTimeline,
  fetchResumenSupervisorObjetivos,
  regenerateObjetivoRuteoPDF,
  createObjetivo,
  updateObjetivo,
  deleteObjetivo,
  lanzarObjetivo,
  fetchVendedoresSupervision,
  fetchRutasSupervision,
  fetchCuentasSupervision,
  fetchPDVCatalog,
  previewObjetivoTelegram,
  getWSUrl,
  type Objetivo,
  type ObjetivoCreate,
  type ObjetivoTipo,
  type ResumenVendedorObjetivos,
  type RutaSupervision,
  type CuentasSupervision,
  type ObjetivoTimeline,
  type PDVCatalogItem,
} from "@/lib/api";
import { LanzarObjetivoDialog } from "@/components/objetivos/LanzarObjetivoDialog";
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
  Crown,
  Rocket,
  CalendarDays,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "sonner";

// ── Tipo / actividad config ───────────────────────────────────────────────────

const TIPO_CONFIG: Record<ObjetivoTipo, { label: string; color: string; bg: string }> = {
  conversion_estado: { label: "Activación",                color: "text-blue-500",    bg: "bg-blue-500/10 border-blue-500/20" },
  cobranza:          { label: "Cobranza",                  color: "text-orange-500",  bg: "bg-orange-500/10 border-orange-500/20" },
  ruteo_alteo:       { label: "Alteo",                     color: "text-violet-600",  bg: "bg-violet-500/10 border-violet-500/20" },
  exhibicion:        { label: "Exhibición",                color: "text-emerald-600", bg: "bg-emerald-500/10 border-emerald-500/20" },
  ruteo:             { label: "Guía de cambio de ruta",    color: "text-purple-600",  bg: "bg-purple-500/10 border-purple-500/20" },
  compradores:       { label: "Compradores",               color: "text-teal-600",    bg: "bg-teal-500/10 border-teal-500/20" },
};

// Descripciones educativas por tipo (mostradas en wizard lateral)
const TIPO_EDUCATIVO: Partial<Record<ObjetivoTipo, string>> = {
  ruteo_alteo:       "Alta de nuevo PDV en tu ruta. Meta: incorporar PDVs nuevos que nunca compraron.",
  conversion_estado: "Reactivar PDVs inactivos (sin compra hace más de 30 días). Meta: volver a comprar.",
  exhibicion:        "Registrar foto de exhibición en PDV. Meta: cobertura de exhibiciones por ruta.",
  compradores:       "En el período, el vendedor debe registrar ventas a N clientes distintos. Cada cliente cuenta una sola vez sin importar cuántas facturas emita.",
};

const DIA_ORDER: Record<string, number> = {
  "lunes": 0, "martes": 1, "miercoles": 2, "miércoles": 2, "jueves": 3,
  "viernes": 4, "sabado": 5, "sábado": 5, "domingo": 6,
};

function normDia(dia?: string | null): string {
  return (dia ?? "Sin día").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function groupRoutesByDay(rutas: RutaSupervision[]) {
  const byDay = new Map<string, RutaSupervision[]>();
  for (const r of rutas) {
    const day = r.dia_semana || "Sin día";
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(r);
  }
  return Array.from(byDay.entries())
    .sort((a, b) => (DIA_ORDER[normDia(a[0])] ?? 9) - (DIA_ORDER[normDia(b[0])] ?? 9))
    .map(([day, routes]) => ({
      day,
      routes,
      totalPdvs: routes.reduce((acc, r) => acc + (r.total_pdv ?? 0), 0),
    }));
}

const ACTIVIDADES_FRASE: { tipo: ObjetivoTipo; label: string }[] = [
  { tipo: "ruteo_alteo",       label: "altear" },
  { tipo: "exhibicion",        label: "exhibir en" },
  { tipo: "conversion_estado", label: "activar" },
  { tipo: "ruteo",             label: "reasignar" },
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
  const cfg = TIPO_CONFIG[tipo] ?? { label: tipo, color: "text-slate-500", bg: "bg-slate-500/10 border-slate-500/20" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${cfg.bg} ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function OrigenBadge({ origen }: { origen?: string | null }) {
  if (origen !== "compania") return null;
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-600">
      <Crown className="w-3 h-3" />
      Cía
    </span>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ actual, objetivo, tasaPendientes, className, visualActual }: {
  actual: number;
  objetivo: number | null;
  tasaPendientes?: number | null;
  className?: string;
  visualActual?: number;
}) {
  if (!objetivo || objetivo === 0) return null;
  const umbral = (tasaPendientes != null && tasaPendientes > 0)
    ? Math.max(0, objetivo - tasaPendientes)
    : objetivo;
  const shownActual = Math.max(actual, visualActual ?? actual);
  const pct = Math.min(100, Math.round((shownActual / umbral) * 100));
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
  try {
    const dateOnly = d.split("T")[0];
    const [y, m, day] = dateOnly.split("-");
    return `${day}/${m}/${y}`;
  } catch (e) {
    return d;
  }
}

function daysUntil(d: string | null | undefined): number | null {
  if (!d) return null;
  const diff = new Date(d).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

function monthEndISO(monthRef: string): string {
  const [y, m] = monthRef.split("-").map(Number);
  if (!y || !m) return "";
  const dt = new Date(y, m, 0);
  return dt.toISOString().split("T")[0];
}

function DateBadge({ date, label, type }: { date: string | null | undefined, label: string, type: 'start' | 'end' | 'done' }) {
  if (!date) return null;
  const colors = {
    start: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    end: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
    done: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
  };
  return (
    <div className={`flex flex-col gap-0.5 px-2 py-1 rounded border ${colors[type]}`}>
      <span className="text-[9px] font-semibold uppercase tracking-wider opacity-80">{label}</span>
      <span className="text-[10px] font-medium flex items-center gap-1">
        <Calendar className="w-3 h-3" />
        {formatDate(date)}
      </span>
    </div>
  );
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

function CompaniaProrrateo({ obj, visualActual }: { obj: Objetivo; visualActual?: number }) {
  if (obj.origen !== "compania" || !obj.mes_referencia || !obj.valor_objetivo) return null;
  const mesRefDate = new Date(`${obj.mes_referencia}T00:00:00`);
  if (Number.isNaN(mesRefDate.getTime())) return null;
  
  let base = mesRefDate;
  if (obj.tipo === "ruteo_alteo" || obj.tipo === "conversion_estado") {
    // No retroactivity for Alteo/Activacion: start prorating from creation/objective date
    const startStr = obj.created_at || obj.fecha_objetivo || obj.mes_referencia;
    if (startStr) {
      base = new Date(startStr.substring(0, 10) + "T00:00:00");
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const y = mesRefDate.getFullYear();
  const m = mesRefDate.getMonth();
  const monthEnd = new Date(y, m + 1, 0);
  
  // For Alteo/Activacion, prorating only happens on days AFTER the objective was created
  const startDay = new Date(Math.max(base.getTime(), new Date(y, m, 1).getTime()));
  
  // We need to know ALL possible business days in the month to build the week grid properly
  const allBusinessDaysInMonth: Date[] = [];
  for (let d = 1; d <= monthEnd.getDate(); d++) {
    const dt = new Date(y, m, d);
    const wd = dt.getDay();
    if (wd >= 1 && wd <= 6) allBusinessDaysInMonth.push(dt);
  }
  
  const remainingBusinessDays = allBusinessDaysInMonth.filter(d => d.getTime() >= startDay.getTime());
  
  if (allBusinessDaysInMonth.length === 0) return null;

  const isNoRetro = obj.tipo === "ruteo_alteo" || obj.tipo === "conversion_estado";
  const validBusinessDays = isNoRetro ? remainingBusinessDays : allBusinessDaysInMonth;
  
  const pastDays = validBusinessDays.filter(d => d <= today); // Include today in past/current evaluation
  const futureDays = validBusinessDays.filter(d => d > today);
  
  const shownActual = Math.max(obj.valor_actual ?? 0, visualActual ?? obj.valor_actual ?? 0);
  
  // Obtain exact daily progress from backend tracking if available
  const progresoDiarioReal = (obj.desglose_cache as any)?.progreso_diario || {};
  
  // Check if we have real tracking data. If not, fallback to average.
  const hasRealTracking = Object.keys(progresoDiarioReal).length > 0;
  
  // Calculate how much was already done in the past days to deduce what's left for the future
  let totalPastDoneEst = 0;
  if (hasRealTracking) {
    pastDays.forEach(d => {
      totalPastDoneEst += progresoDiarioReal[d.toISOString().split('T')[0]] || 0;
    });
  } else {
    totalPastDoneEst = shownActual; // fallback
  }
  
  // Safe bounds: don't let it be negative or exceed shownActual drastically
  const remainingMeta = Math.max(0, (obj.valor_objetivo ?? 0) - shownActual);
  
  const originalDailyTarget = validBusinessDays.length > 0 ? (obj.valor_objetivo ?? 0) / validBusinessDays.length : 0;
  const futureDailyTarget = futureDays.length > 0 ? remainingMeta / futureDays.length : remainingMeta;
  const avgPastPerDay = pastDays.length > 0 ? shownActual / pastDays.length : shownActual;

  const allWeeks = new Map<string, Date[]>();
  for (const dt of allBusinessDaysInMonth) {
    const weekIdx = Math.floor((dt.getDate() - 1) / 7) + 1;
    const key = `Semana ${weekIdx}`;
    if (!allWeeks.has(key)) allWeeks.set(key, []);
    allWeeks.get(key)!.push(dt);
  }
  const weekEntries = Array.from(allWeeks.entries());
  
  const remainingFutureBusinessDays = remainingBusinessDays.filter(d => d >= today).length;
  const diasRestantesStr = remainingFutureBusinessDays;

  return (
    <div
      className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-2 space-y-2"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-amber-700">Prorrateo mensual (lun-sáb)</p>
        <span className="text-[10px] text-amber-700/80">{diasRestantesStr} días restantes</span>
      </div>
      <div className="space-y-1.5">
        {weekEntries.map(([weekLabel, days], weekIndex) => {
          const applicableDaysInWeek = isNoRetro ? days.filter(d => d.getTime() >= startDay.getTime()) : days;
          
          if (isNoRetro && applicableDaysInWeek.length === 0) {
            return (
              <details
                key={weekLabel}
                className="rounded border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] px-2 py-1 opacity-50"
                onClick={(e) => e.stopPropagation()}
              >
                <summary className="cursor-pointer text-[11px] text-[var(--shelfy-text)] flex items-center justify-between gap-2">
                  <span>{weekLabel}</span>
                  <span className="text-[10px] text-[var(--shelfy-muted)] tabular-nums">
                    No aplicable
                  </span>
                </summary>
                <div className="mt-1.5 space-y-1.5">
                  <div className="text-[10px] text-[var(--shelfy-muted)]">
                    El objetivo no existía en esta semana.
                  </div>
                </div>
              </details>
            );
          }
          
          let weeklyTarget = 0;
          let weekDoneEst = 0;
          
          applicableDaysInWeek.forEach(dt => {
            const isPast = dt <= today;
            if (isPast) {
              weeklyTarget += originalDailyTarget;
              const dayStr = dt.toISOString().split('T')[0];
              weekDoneEst += hasRealTracking ? (progresoDiarioReal[dayStr] || 0) : avgPastPerDay;
            } else {
              weeklyTarget += futureDailyTarget;
            }
          });
          
          const weekPct = weeklyTarget > 0 ? Math.min(100, Math.round((weekDoneEst / weeklyTarget) * 100)) : (weekDoneEst > 0 ? 100 : 0);
          
          return (
            <details
              key={weekLabel}
              className="rounded border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] px-2 py-1"
              onClick={(e) => e.stopPropagation()}
            >
              <summary className="cursor-pointer text-[11px] text-[var(--shelfy-text)] flex items-center justify-between gap-2">
                <span>{weekLabel}</span>
                <span className="text-[10px] text-[var(--shelfy-muted)] tabular-nums">
                  Meta: {Math.round(weeklyTarget)}
                </span>
              </summary>
              <div className="mt-1.5 space-y-1.5">
                <div className="text-[10px] text-[var(--shelfy-muted)] flex items-center justify-between tabular-nums">
                  <span>Avance semanal</span>
                  <span>{Math.round(weekDoneEst)} / {Math.round(weeklyTarget)}</span>
                </div>
                <Progress value={weekPct} className="h-1.5" />
                
                {futureDailyTarget > 0 && remainingMeta > 0 && (
                  <div className="text-[10px] text-amber-700">
                    Debe avanzar {Math.ceil(futureDailyTarget)} por día (lun-sáb) para cumplir la meta.
                  </div>
                )}
                {remainingMeta === 0 && (
                  <div className="text-[10px] text-emerald-600 font-medium">
                    ¡Objetivo cumplido!
                  </div>
                )}
                {futureDays.length === 0 && remainingMeta > 0 && (
                  <div className="text-[10px] text-red-500 font-medium">
                    Sin días restantes. Faltaron {Math.round(remainingMeta)}.
                  </div>
                )}

                {days.map((dt) => {
                  const isBeforeCreation = isNoRetro && dt.getTime() < startDay.getTime();
                  if (isBeforeCreation) return null;
                  
                  const isPast = dt <= today;
                  const dayTarget = isPast ? originalDailyTarget : futureDailyTarget;
                  const dayStr = dt.toISOString().split('T')[0];
                  const dayDoneEst = isPast ? (hasRealTracking ? (progresoDiarioReal[dayStr] || 0) : avgPastPerDay) : 0;
                  const dayPct = dayTarget > 0 ? Math.min(100, Math.round((dayDoneEst / dayTarget) * 100)) : (dayDoneEst > 0 ? 100 : 0);
                  
                  return (
                    <details
                      key={`${weekIndex}-${dt.toISOString()}`}
                      className="rounded border border-[var(--shelfy-border)]/80 px-2 py-1 bg-white/60"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <summary className="cursor-pointer text-[10px] text-[var(--shelfy-text)] flex items-center justify-between gap-2 capitalize">
                        <span>{dt.toLocaleDateString("es-AR", { weekday: "long" })} {String(dt.getDate()).padStart(2, "0")}</span>
                        <span className="text-[10px] text-[var(--shelfy-muted)] tabular-nums">Meta diaria: {Math.ceil(dayTarget)}</span>
                      </summary>
                      <div className="mt-1 space-y-1">
                        <div className="text-[10px] text-[var(--shelfy-muted)] tabular-nums flex items-center justify-between">
                          <span>Progreso diario</span>
                          <span>{Math.round(dayDoneEst)} / {Math.round(dayTarget)}</span>
                        </div>
                        <Progress value={dayPct} className="h-1" />
                        {dayTarget > 0 && !isPast && (
                          <p className="text-[10px] text-emerald-700">
                            Objetivo del día: avanzar al menos {Math.ceil(dayTarget)} para llegar a la meta.
                          </p>
                        )}
                      </div>
                    </details>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}

function getObjetivoItemClientCode(it: NonNullable<Objetivo["items"]>[number]): string | null {
  if (it.id_cliente_erp) return it.id_cliente_erp;
  const md = (it.metadata_ruteo ?? {}) as Record<string, unknown>;
  const erp = md["id_cliente_erp"];
  return typeof erp === "string" && erp.trim() ? erp : null;
}

function getObjetivoItemDisplayName(it: NonNullable<Objetivo["items"]>[number]): string {
  const md = (it.metadata_ruteo ?? {}) as Record<string, unknown>;
  const fantasia = md["nombre_fantasia"];
  if (typeof fantasia === "string" && fantasia.trim()) return fantasia.trim();
  if (it.nombre_pdv && it.nombre_pdv.trim()) return it.nombre_pdv.trim();
  return "Cliente sin nombre";
}

function getObjetivoItemSecondaryName(it: NonNullable<Objetivo["items"]>[number]): string | null {
  const md = (it.metadata_ruteo ?? {}) as Record<string, unknown>;
  const razon = md["nombre_razon_social"];
  if (typeof razon !== "string" || !razon.trim()) return null;
  const trimmed = razon.trim();
  return trimmed === getObjetivoItemDisplayName(it) ? null : trimmed;
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

function getObjectiveKanbanPhase(obj: Objetivo): 'planificado' | 'pendiente' | 'en_progreso' | 'terminado' {
  // Planificado solo si: sin lanzar AND fecha_inicio en el futuro AND no cumplido
  if (!obj.lanzado_at && !obj.cumplido) {
    const hoyAR = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const fechaInicio = obj.fecha_inicio ? String(obj.fecha_inicio).slice(0, 10) : null;
    if (fechaInicio && fechaInicio > hoyAR) return 'planificado';
    // sin fecha_inicio o ya pasada → tratar como activo (caen abajo)
  }
  if (obj.cumplido) return 'terminado';
  if (obj.kanban_phase === "terminado") return "terminado";
  if (obj.kanban_phase === "en_progreso") return "en_progreso";
  if (obj.kanban_phase === "pendiente") return "pendiente";
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

function ObjetivoRow({ obj, onDelete }: {
  obj: Objetivo;
  onDelete: () => void;
}) {
  return (
    <tr className={`border-b border-[var(--shelfy-border)]/50 transition-colors hover:bg-black/[0.02] ${obj.cumplido ? "opacity-50" : ""}`}>
      <td className="px-4 py-3">
        <div
          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
            obj.cumplido
              ? "bg-emerald-500 border-emerald-500 text-white"
              : "border-[var(--shelfy-border)]"
          }`}
        >
          {obj.cumplido && <Check className="w-2.5 h-2.5" />}
        </div>
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
            {obj.id_cliente_erp && (
              <span className="text-[10px] text-[var(--shelfy-muted)]/80 font-mono shrink-0">#{obj.id_cliente_erp}</span>
            )}
            <span className="text-xs text-[var(--shelfy-text)] truncate">{obj.nombre_pdv}</span>
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

function downloadCertificado(obj: Objetivo, sucursalNombre?: string) {
  import("jspdf").then(({ jsPDF }) => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const accent = "#7C3AED";
    const W = 210;
    const L = 20;
    const R = W - 20;
    const textWidth = R - L;

    // Header
    doc.setFillColor(accent);
    doc.rect(0, 0, W, 32, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("SHELFY", L, 14);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text("CERTIFICADO DE OBJETIVO", L, 24);

    doc.setTextColor(30, 41, 59);
    doc.setFontSize(10);
    let y = 46;

    const line = (label: string, value: string) => {
      doc.setFont("helvetica", "bold");
      doc.text(`${label}:`, L, y);
      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(value, textWidth - 48);
      doc.text(lines, 68, y);
      y += Math.max(8, lines.length * 6);
    };

    const tipoLabel = TIPO_CONFIG[obj.tipo]?.label ?? obj.tipo;
    const resultado =
      obj.resultado_final === "exito"
        ? "Éxito ✓"
        : obj.resultado_final === "falla"
        ? "No cumplido"
        : "—";
    const pct =
      obj.valor_objetivo && obj.valor_objetivo > 0
        ? `${Math.min(100, Math.round((obj.valor_actual / obj.valor_objetivo) * 100))}%`
        : "—";
    const progreso = obj.valor_objetivo
      ? `${obj.valor_actual} / ${Math.round(obj.valor_objetivo)} (${pct})`
      : obj.cumplido
      ? "Completado"
      : "Pendiente";

    line("Vendedor", obj.nombre_vendedor ?? `ID ${obj.id_vendedor}`);
    if (sucursalNombre) line("Sucursal", sucursalNombre);
    line("Tipo", tipoLabel);
    if (obj.descripcion) line("Descripción", obj.descripcion);
    line("Fecha objetivo", obj.fecha_objetivo ?? "—");
    line("Resultado", resultado);
    line("Progreso", progreso);

    // Items / PDVs section
    if (obj.items && obj.items.length > 0) {
      y += 4;
      doc.setDrawColor(200, 200, 220);
      doc.line(L, y, R, y);
      y += 8;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text(`PDVs OBJETIVO (${obj.items.length})`, L, y);
      y += 7;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(9);
      for (const item of obj.items.slice(0, 15)) {
        const nombre = item.nombre_pdv ?? `Cliente ERP #${getObjetivoItemClientCode(item) ?? "S/D"}`;
        const estado = item.estado_item ?? "pendiente";
        const estadoIcon = estado === "cumplido" ? "✓" : estado === "falla" ? "✗" : "·";
        const lineas = doc.splitTextToSize(`${estadoIcon} ${nombre}`, textWidth - 8);
        if (y + lineas.length * 5 > 270) {
          const restantes = obj.items.length - obj.items.indexOf(item);
          doc.text(`  ...y ${restantes} PDVs más`, L + 4, y);
          y += 5;
          break;
        }
        doc.text(lineas, L + 4, y);
        y += lineas.length * 5 + 1;
      }
      doc.setFontSize(10);
    }

    // Historial
    y += 4;
    doc.setDrawColor(200, 200, 220);
    doc.line(L, y, R, y);
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text("HISTORIAL DE INTENTOS", L, y);
    y += 7;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 41, 59);
    if (obj.id_objetivo_padre) {
      doc.text("· Intento anterior registrado", L + 4, y);
      y += 6;
      doc.text(`· Este intento (actual) — ID: ${obj.id}`, L + 4, y);
    } else {
      doc.text("· Primer intento", L + 4, y);
    }

    doc.save(
      `certificado-${(obj.nombre_vendedor ?? "vendedor").replace(/\s+/g, "_")}-${obj.id}.pdf`
    );
  });
}

// ── Ruteo Alteo — jerarquía día → rutas ──────────────────────────────────────

function RuteoAlteoItemsTree({ obj }: { obj: Objetivo }) {
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  // Group items by day (from metadata_ruteo.dia_semana, else obj.estado_inicial)
  const byDay = useMemo(() => {
    const map = new Map<string, { rutaLabel: string; items: Objetivo["items"] }[]>();
    for (const it of obj.items ?? []) {
      const md = (it.metadata_ruteo ?? {}) as Record<string, unknown>;
      const dia = (typeof md["dia_semana"] === "string" ? md["dia_semana"] : obj.estado_inicial ?? "Sin día").toUpperCase();
      const rutaLabel = typeof md["nombre_ruta"] === "string" ? md["nombre_ruta"] : `Ruta ${it.id_ruta_destino ?? ""}`;
      if (!map.has(dia)) map.set(dia, []);
      const dayGroups = map.get(dia)!;
      const existing = dayGroups.find(g => g.rutaLabel === rutaLabel);
      if (existing) {
        existing.items!.push(it);
      } else {
        dayGroups.push({ rutaLabel, items: [it] });
      }
    }
    return Array.from(map.entries()).sort((a, b) => {
      const da = DIA_ORDER[a[0].toLowerCase()] ?? 9;
      const db = DIA_ORDER[b[0].toLowerCase()] ?? 9;
      return da - db;
    });
  }, [obj.items, obj.estado_inicial]);

  const toggleDay = (dia: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(dia)) next.delete(dia);
      else next.add(dia);
      return next;
    });
  };

  return (
    <div className="space-y-1 max-h-48 overflow-y-auto">
      {byDay.map(([dia, rutaGroups]) => {
        const totalPdvs = rutaGroups.reduce((acc, g) => acc + (g.items?.length ?? 0), 0);
        const isExpanded = expandedDays.has(dia);
        return (
          <div key={dia} className="rounded-lg border border-[var(--shelfy-border)] overflow-hidden">
            <button
              type="button"
              onClick={() => toggleDay(dia)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 bg-[var(--shelfy-bg)] hover:bg-black/5 transition-colors text-left"
            >
              <span className="text-[11px] font-semibold text-[var(--shelfy-text)] capitalize">{dia}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-[var(--shelfy-accent)] font-semibold tabular-nums">{totalPdvs} PDVs</span>
                <ChevronDown className={`w-3 h-3 text-[var(--shelfy-muted)] transition-transform ${isExpanded ? "rotate-180" : ""}`} />
              </div>
            </button>
            {isExpanded && (
              <div className="px-2 pb-1.5 pt-1 space-y-1.5 bg-[var(--shelfy-panel)]">
                {rutaGroups.map(({ rutaLabel, items }) => (
                  <div key={rutaLabel} className="space-y-0.5">
                    <p className="text-[10px] font-medium text-[var(--shelfy-muted)] flex items-center gap-1">
                      <GitBranch className="w-2.5 h-2.5" />
                      {rutaLabel}
                      <span className="ml-auto text-[var(--shelfy-muted)]/70 tabular-nums">{items?.length ?? 0} PDVs</span>
                    </p>
                    {(items ?? []).map(it => (
                      <div key={it.id_cliente_pdv} className="flex items-center gap-1.5 pl-3 text-[10px]">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          it.estado_item === 'cumplido' ? 'bg-emerald-500' :
                          it.estado_item === 'foto_subida' ? 'bg-yellow-400' :
                          it.estado_item === 'falla' ? 'bg-red-500' :
                          'bg-[var(--shelfy-muted)]/30'
                        }`} />
                        {getObjetivoItemClientCode(it) && (
                          <span className="text-[var(--shelfy-muted)]/60 font-mono shrink-0">#{getObjetivoItemClientCode(it)}</span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-[var(--shelfy-text)] truncate">{getObjetivoItemDisplayName(it)}</p>
                          {getObjetivoItemSecondaryName(it) && (
                            <p className="text-[10px] text-[var(--shelfy-muted)] truncate">{getObjetivoItemSecondaryName(it)}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Kanban card ───────────────────────────────────────────────────────────────

function KanbanCard({ obj, onDelete, onReagendar, onDownloadCertificado, onOpenRuteoPdf, onLanzar }: {
  obj: Objetivo;
  onDelete: () => void;
  onReagendar: (obj: Objetivo) => void;
  onDownloadCertificado: (obj: Objetivo) => void;
  onOpenRuteoPdf: (obj: Objetivo) => void;
  onLanzar?: (obj: Objetivo) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const daysLeft = daysUntil(obj.fecha_objetivo);
  const pendingEvidenceCount = useMemo(() => {
    const itemPending = (obj.items ?? []).filter((it) => it.estado_item === "foto_subida").length;
    if (itemPending > 0) return itemPending;
    return obj.tiene_exhibicion_pendiente ? 1 : 0;
  }, [obj.items, obj.tiene_exhibicion_pendiente]);
  const shownActual = obj.tipo === "exhibicion"
    ? (obj.valor_actual ?? 0) + pendingEvidenceCount
    : (obj.valor_actual ?? 0);

  const phase = getObjectiveKanbanPhase(obj);
  const leftBorderClass =
    obj.resultado_final === "exito"
      ? "border-l-4 border-l-emerald-500"
      : obj.resultado_final === "falla"
        ? "border-l-4 border-l-red-500"
        : phase === "planificado"
          ? "border-l-4 border-l-slate-400"
          : phase === "en_progreso"
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
            <OrigenBadge origen={obj.origen} />
            {daysLeft !== null && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-700 font-semibold border border-violet-500/20">
                {daysLeft < 0 ? "Vencido" : `${daysLeft} días restantes`}
              </span>
            )}
            {obj.resultado_final === "exito" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-semibold border border-emerald-500/20">
                Exito
              </span>
            )}
            {obj.resultado_final === "falla" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 font-semibold border border-red-500/20">
                Sin completar
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
            {obj.id_cliente_erp && <span className="text-[10px] text-[var(--shelfy-muted)]/80 font-mono">#{obj.id_cliente_erp}</span>}
            <span className="text-xs text-[var(--shelfy-text)]">{obj.nombre_pdv}</span>
          </div>
        )}

        {/* Progress bar */}
        {obj.valor_objetivo ? (
          <div onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between text-[10px] text-[var(--shelfy-muted)] mb-1 tabular-nums">
              <span>{shownActual} / {Math.round(obj.valor_objetivo)}</span>
              {obj.tasa_pendientes != null && (
                <span className="text-[var(--shelfy-muted)]/70">
                  Tasa pendientes: {obj.tasa_pendientes}
                  {obj.desglose_cache != null
                    ? (obj.desglose_cache.pendientes_count ?? 0) > 0
                      ? <span className="ml-1">· {obj.desglose_cache.pendientes_count} pendiente{obj.desglose_cache.pendientes_count !== 1 ? "s" : ""}</span>
                      : null
                    : <span className="ml-1">· –</span>
                  }
                </span>
              )}
            </div>
            <ProgressBar
              actual={obj.valor_actual}
              visualActual={shownActual}
              objetivo={obj.valor_objetivo}
              tasaPendientes={obj.tasa_pendientes}
            />
          </div>
        ) : null}

        {/* Items checklist (compact dots) */}
        {!!obj.items_count && obj.items_count > 1 && (
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
                      it.estado_item === 'falla' ? 'bg-red-500' :
                      'bg-[var(--shelfy-border)]'
                    }`}
                    title={`${getObjetivoItemClientCode(it) ? `ERP ${getObjetivoItemClientCode(it)} · ` : ""}${it.nombre_pdv ?? "Cliente sin nombre"}`}
                  />
                ))}
                {obj.items.length > 6 && <span>+{obj.items.length - 6}</span>}
              </div>
            )}
          </div>
        )}

        {/* ERP quick IDs para reconocimiento rápido en Kanban */}
        {!!obj.items && obj.items.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap text-[10px]">
            {obj.items
              .map((it) => getObjetivoItemClientCode(it))
              .filter((v): v is string => Boolean(v))
              .slice(0, 4)
              .map((erp) => (
                <span
                  key={erp}
                  className="px-1.5 py-0.5 rounded border border-[var(--shelfy-border)] text-[var(--shelfy-muted)] font-mono"
                >
                  ERP #{erp}
                </span>
              ))}
            {obj.items.length > 4 && (
              <span className="text-[var(--shelfy-muted)]/70">+{obj.items.length - 4}</span>
            )}
          </div>
        )}

        {/* Prorrateo mensual siempre visible (solo compañía) */}
        <CompaniaProrrateo obj={obj} visualActual={shownActual} />

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
                {obj.items && obj.items.length > 0 && obj.tipo === "ruteo_alteo" && obj.items[0].id_ruta_destino ? (
                  <RuteoAlteoItemsTree obj={obj} />
                ) : obj.items && obj.items.length > 0 ? (
                  <div className="space-y-0.5 max-h-32 overflow-y-auto">
                    {obj.items.map(it => (
                      <div key={it.id_cliente_pdv} className="flex items-center gap-2 text-[11px]">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          it.estado_item === 'cumplido' ? 'bg-emerald-500' :
                          it.estado_item === 'foto_subida' ? 'bg-yellow-400' :
                          it.estado_item === 'falla' ? 'bg-red-500' :
                          'bg-[var(--shelfy-muted)]/30'
                        }`} />
                        {getObjetivoItemClientCode(it) && (
                          <span className="text-[10px] text-[var(--shelfy-muted)]/70 font-mono shrink-0">
                            ERP #{getObjetivoItemClientCode(it)}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-[var(--shelfy-text)] truncate">{getObjetivoItemDisplayName(it)}</p>
                          {getObjetivoItemSecondaryName(it) && (
                            <p className="text-[10px] text-[var(--shelfy-muted)] truncate">{getObjetivoItemSecondaryName(it)}</p>
                          )}
                        </div>
                        <span className="text-[var(--shelfy-muted)] shrink-0 capitalize">{it.estado_item.replace('_', ' ')}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1 gap-1.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1.5 flex-wrap">
            <DateBadge date={obj.created_at} label="Inicio" type="start" />
            <DateBadge date={obj.fecha_objetivo} label="Fin" type="end" />
            {obj.cumplido && <DateBadge date={obj.completed_at || obj.updated_at} label="Cumplido" type="done" />}
          </div>
          <div className="flex items-center gap-1 print-hidden">
            {obj.tipo === "ruteo" && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onOpenRuteoPdf(obj); }}
                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-purple-500/30 text-purple-600 hover:bg-purple-500/10 transition-all"
              >
                <FileDown className="w-3 h-3" /> PDF Ruteo
              </button>
            )}
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
            {onLanzar && !obj.lanzado_at && !obj.cumplido && (
              <button
                onClick={(e) => { e.stopPropagation(); onLanzar(obj); }}
                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-violet-500/30 text-violet-600 hover:bg-violet-500/10 transition-all"
              >
                <Rocket className="w-3 h-3" /> Lanzar ahora
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
  vendedores: { id_vendedor: number; nombre_erp: string; sucursal_nombre?: string }[];
  onClose: () => void;
  onCreate: (data: ObjetivoCreate[]) => void;
  loading: boolean;
  userRol?: string;
  isSuperadmin?: boolean;
}

function NuevoObjetivoModal({ distId, vendedores, onClose, onCreate, loading, userRol, isSuperadmin }: NuevoObjetivoModalProps) {
  const canCrearCompania = isSuperadmin || userRol === "directorio" || userRol === "superadmin";
  const [origenMode, setOrigenMode] = useState<"distribuidora" | "compania">("distribuidora");
  const [mesReferencia, setMesReferencia] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [tasaPendientes, setTasaPendientes] = useState<number | "">("");

  const [vendedorId, setVendedorId] = useState<number | "">("");
  const [paraTodosFDV, setParaTodosFDV] = useState(false);
  const [tipo, setTipo] = useState<ObjetivoTipo>("ruteo_alteo");
  const [fecha, setFecha] = useState<string>("");
  const [fechaInicio, setFechaInicio] = useState<string>("");
  const [desc, setDesc] = useState<string>("");

  const [rutas, setRutas] = useState<RutaSupervision[]>([]);
  const [alteoMode, setAlteoMode] = useState<"por_dia" | "general">("por_dia");
  const [selectedDias, setSelectedDias] = useState<Set<string>>(new Set());
  const [cantidadAlteo, setCantidadAlteo] = useState<number | "">("");

  const [deudores, setDeudores] = useState<{ cliente_nombre: string; deuda_total: number }[]>([]);
  const [selectedDeudor, setSelectedDeudor] = useState<{ cliente_nombre: string; deuda_total: number } | null>(null);
  const [cobranzaMode, setCobranzaMode] = useState<"total" | "parcial">("total");
  const [cobranzaMonto, setCobranzaMonto] = useState<number | "">("");

  const [activacionPdvs, setActivacionPdvs] = useState<{ id: number; nombre: string; idClienteErp: string | null; razonSocial: string | null; fechaCompra: string | null; diasSinCompra: number | null; estado: string | null }[]>([]);
  const [selectedPdvIds, setSelectedPdvIds] = useState<Set<number>>(new Set());
  const [activacionMode, setActivacionMode] = useState<"general" | "por_pdv">("general");
  const [cantidadActivacion, setCantidadActivacion] = useState<number | "">("");

  // Sucursal filter inside modal
  const [modalSucursal, setModalSucursal] = useState<string>("");
  const modalSucursales = useMemo(() => {
    const seen = new Set<string>();
    return vendedores
      .map(v => v.sucursal_nombre ?? "")
      .filter(s => s && !seen.has(s) && seen.add(s) !== undefined)
      .sort((a, b) => a.localeCompare(b, "es"));
  }, [vendedores]);

  // Auto-seleccionar si hay una sola sucursal (mono-tenant) para no bloquear el vendedor
  useEffect(() => {
    if (modalSucursales.length === 1 && !modalSucursal) {
      setModalSucursal(modalSucursales[0]);
    }
  }, [modalSucursales, modalSucursal]);

  const isVendedorBucket = (nombre: string) => {
    const n = nombre.toLowerCase();
    return n.includes("sin vendedor") || n.includes("supervisor");
  };

  const vendedoresFiltrados = (modalSucursal
    ? vendedores.filter(v => v.sucursal_nombre === modalSucursal)
    : vendedores
  ).filter(v => !isVendedorBucket(v.nombre_erp));
  const mustSelectSucursalFirst = modalSucursales.length > 1 && !modalSucursal;
  const vendedoresCascada = mustSelectSucursalFirst ? [] : vendedoresFiltrados;

  // PDV Catalog for exhibición (paginated via API)
  const [pdvCatalogAll, setPdvCatalogAll] = useState<PDVCatalogItem[]>([]);
  const [pdvCatalogPage, setPdvCatalogPage] = useState(0);
  const [pdvCatalogHasMore, setPdvCatalogHasMore] = useState(false);
  const [loadingMorePdv, setLoadingMorePdv] = useState(false);

  // Exhibición mode: general (quantity only) or por_pdv (select specific PDVs)
  const [exhibicionMode, setExhibicionMode] = useState<"general" | "por_pdv">("general");
  const [cantidadExhibicion, setCantidadExhibicion] = useState<number | "">("");

  // Compradores: cantidad de PDVs distintos (N)
  const [cantidadCompradores, setCantidadCompradores] = useState<number | "">("");

  // Ruteo per-PDV actions
  type RuteoAccion = 'cambio_ruta' | 'baja';
  const [ruteoAccionGlobal, setRuteoAccionGlobal] = useState<RuteoAccion>('cambio_ruta');
  const [ruteoItemsMap, setRuteoItemsMap] = useState<Record<number, { accion: RuteoAccion; id_ruta_destino?: number; motivo_baja?: string }>>({});

  const [loadingCtx, setLoadingCtx] = useState(false);

  const vendedorNombre = vendedores.find(v => v.id_vendedor === vendedorId)?.nombre_erp ?? "";
  const rutasPorDia = useMemo(
    () => groupRoutesByDay(rutas).map((g) => ({ ...g, dayKey: normDia(g.day) })),
    [rutas]
  );
  const selectedDayGroups = rutasPorDia.filter((g) => selectedDias.has(g.dayKey));

  const showTasaPendientes =
    !paraTodosFDV &&
    (
      (tipo === "conversion_estado" && activacionMode === "por_pdv" && selectedPdvIds.size > 0) ||
      (tipo === "exhibicion" && exhibicionMode === "por_pdv" && selectedPdvIds.size > 0) ||
      (tipo === "ruteo" && selectedPdvIds.size > 0) ||
      (tipo === "ruteo_alteo" && alteoMode === "por_dia" && selectedDias.size > 0)
    );

  useEffect(() => {
    if (!showTasaPendientes) setTasaPendientes("");
  }, [showTasaPendientes]); // eslint-disable-line react-hooks/exhaustive-deps

  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descWasAutoFilled = useRef(false);

  function stripTelegramHtml(htmlStr: string): string {
    return htmlStr
      .replace(/<b>(.*?)<\/b>/gi, '$1')
      .replace(/<i>(.*?)<\/i>/gi, '$1')
      .replace(/<code>(.*?)<\/code>/gi, '$1')
      .replace(/<a[^>]*>(.*?)<\/a>/gi, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  function resetCtx() {
    setRutas([]);
    setAlteoMode("por_dia");
    setSelectedDias(new Set());
    setCantidadAlteo("");
    setDeudores([]);
    setSelectedDeudor(null);
    setCobranzaMode("total");
    setCobranzaMonto("");
    setActivacionPdvs([]);
    setSelectedPdvIds(new Set());
    setActivacionMode("general");
    setCantidadActivacion("");
    setPdvCatalogAll([]);
    setPdvCatalogPage(0);
    setPdvCatalogHasMore(false);
    setExhibicionMode("general");
    setCantidadExhibicion("");
    setCantidadCompradores("");
    setRuteoAccionGlobal('cambio_ruta');
    setRuteoItemsMap({});
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
                .sort((a, b) => (b.antiguedad ?? 0) - (a.antiguedad ?? 0))
                .slice(0, 10)
                .map(c => ({ cliente_nombre: c.cliente ?? "–", deuda_total: c.deuda_total ?? 0 }))
            );
          }
        })
        .catch(() => setDeudores([]))
        .finally(() => setLoadingCtx(false));
    } else if (tipo === "exhibicion" || tipo === "ruteo") {
      fetchPDVCatalog(distId, { vendedorId: Number(vendedorId), limit: 35, offset: 0 })
        .then(data => {
          setPdvCatalogAll(data);
          setPdvCatalogHasMore(data.length === 35);
          setPdvCatalogPage(0);
        })
        .catch(() => setPdvCatalogAll([]))
        .finally(() => setLoadingCtx(false));
    } else if (tipo === "conversion_estado") {
      fetchPDVCatalog(distId, { vendedorId: Number(vendedorId), limit: 35, offset: 0 })
        .then(data => {
          setPdvCatalogAll(data);
          setPdvCatalogHasMore(data.length === 35);
          setPdvCatalogPage(0);
          const now = Date.now();
          const filtered = data
            .map((pdv) => {
              const fechaCompra = pdv.fecha_ultima_compra ?? null;
              const diasSinCompra = fechaCompra
                ? Math.floor((now - new Date(fechaCompra).getTime()) / 86_400_000)
                : null;
              return {
                id: pdv.id_cliente,
                nombre: pdv.nombre_cliente ?? "S/N",
                idClienteErp: pdv.id_cliente_erp ?? null,
                razonSocial: pdv.nombre_razon_social ?? null,
                fechaCompra,
                diasSinCompra,
                estado: pdv.estado ?? null,
              };
            })
            .filter((pdv) => (pdv.estado ?? "").toLowerCase() === "inactivo" || pdv.diasSinCompra === null || (pdv.diasSinCompra ?? 0) > 30)
            .sort((a, b) => {
              if (a.diasSinCompra === null) return -1;
              if (b.diasSinCompra === null) return 1;
              return b.diasSinCompra - a.diasSinCompra;
            });
          setActivacionPdvs(filtered);
        })
        .catch(() => setActivacionPdvs([]))
        .finally(() => setLoadingCtx(false));
    } else {
      setLoadingCtx(false);
    }
  }, [vendedorId, tipo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill description textarea with Telegram preview message
  useEffect(() => {
    if (!vendedorId || !distId) return;
    if (tipo === 'ruteo') return; // ruteo never notified via Telegram

    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    previewDebounceRef.current = setTimeout(async () => {
      try {
        const vendedor = vendedores.find(v => v.id_vendedor === vendedorId);
        const preview = await previewObjetivoTelegram({
          id_distribuidor: distId,
          id_vendedor: Number(vendedorId),
          tipo,
          fecha_objetivo: fecha || undefined,
          fecha_inicio: fechaInicio || undefined,
          origen: origenMode,
          mes_referencia: origenMode === 'compania' ? mesReferencia || undefined : undefined,
          nombre_vendedor: vendedor?.nombre_erp,
        });
        if (preview?.preview_html) {
          const stripped = stripTelegramHtml(preview.preview_html);
          setDesc(stripped);
          descWasAutoFilled.current = true;
        }
      } catch {
        // silently fail — user can type manually
      }
    }, 600);
    return () => {
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    };
  }, [vendedorId, tipo, fecha, fechaInicio, distId, origenMode, mesReferencia]); // eslint-disable-line react-hooks/exhaustive-deps

  function buildPhrase(overrideVendorName?: string): string {
    const name = overrideVendorName ?? (paraTodosFDV ? "Cada vendedor de la FDV" : vendedorNombre);
    if (!name) return "[ Vendedor ] …";
    let diasCalendario: number | null = null;
    if (fecha) {
      const parts = fecha.slice(0, 10).split("-").map(Number);
      if (parts.length === 3 && parts.every((n) => !Number.isNaN(n))) {
        const [yy, mm, dd] = parts;
        const target = new Date(yy, mm - 1, dd);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        target.setHours(0, 0, 0, 0);
        diasCalendario = Math.round((target.getTime() - today.getTime()) / 86_400_000);
      }
    }
    const fechaLabel = fecha ? ` antes del ${fecha}` : "";
    const diasLabel =
      diasCalendario === null
        ? ""
        : diasCalendario <= 0
          ? " El plazo vence hoy."
          : ` Tenés ${diasCalendario} día${diasCalendario !== 1 ? "s" : ""} para cumplir el objetivo.`;

    if (tipo === "ruteo_alteo") {
      const qty = cantidadAlteo ? Number(cantidadAlteo) : null;
      if (alteoMode === "por_dia" && selectedDayGroups.length > 0) {
        const defaultQty = selectedDayGroups.reduce((acc, g) => acc + g.totalPdvs, 0);
        const meta = qty ?? defaultQty;
        const diasTxt = selectedDayGroups.map((g) => g.day).join(", ");
        return `${name} debe altear en sus días asignados (${diasTxt}) y sumar ${meta} PDVs nuevos ${fechaLabel}. Progreso esperado: ${meta} altas válidas en el período.${diasLabel}`;
      }
      if (qty) {
        return `${name} debe altear ${qty} PDVs nuevos ${fechaLabel}. Progreso esperado: ${qty} altas válidas.${diasLabel}`;
      }
      return `${name} debe altear nuevos PDVs ${fechaLabel}.`;
    }
    if (tipo === "cobranza" && selectedDeudor) {
      const monto = cobranzaMode === "parcial" && cobranzaMonto ? cobranzaMonto : selectedDeudor.deuda_total;
      return `${name} deberá cobrar $${Number(monto).toLocaleString("es-AR")} del cliente ${selectedDeudor.cliente_nombre} ${fechaLabel}. Progreso esperado: registrar ese monto cobrado.`;
    }
    if (tipo === "conversion_estado") {
      if (activacionMode === "general" && cantidadActivacion) {
        return `${name} deberá activar ${cantidadActivacion} PDV${Number(cantidadActivacion) !== 1 ? "s" : ""} inactivos ${fechaLabel}. Progreso esperado: ${cantidadActivacion} reactivaciones.${diasLabel}`;
      }
      if (selectedPdvIds.size > 0) {
        const metaN = cantidadActivacion !== "" ? Number(cantidadActivacion) : selectedPdvIds.size;
        const total = selectedPdvIds.size;
        if (metaN < total) {
          return `${name} deberá activar ${metaN} de ${total} PDVs seleccionados ${fechaLabel}. Progreso esperado: ${metaN} activaciones válidas.${diasLabel}`;
        }
        return `${name} deberá activar ${total} PDV${total !== 1 ? "s" : ""} seleccionados ${fechaLabel}. Progreso esperado: completar todos los PDVs asignados.${diasLabel}`;
      }
      return `${name} debe activar clientes inactivos ${fechaLabel}.`;
    }
    if (tipo === "exhibicion") {
      const qty = exhibicionMode === "general" && cantidadExhibicion ? cantidadExhibicion : selectedPdvIds.size || null;
      return qty
        ? `${name} debe realizar ${qty} exhibición${Number(qty) !== 1 ? "es" : ""} ${fechaLabel}. Progreso esperado: ${qty} exhibiciones aprobadas.${diasLabel}`
        : `${name} debe exhibir en PDVs ${fechaLabel}.`;
    }
    if (tipo === "ruteo") {
      const total = selectedPdvIds.size;
      if (total > 0) {
        return `${name} debe ejecutar acciones de ruteo sobre ${total} PDV${total !== 1 ? "s" : ""} ${fechaLabel}. Progreso esperado: completar cambios de ruta y/o bajas definidas.`;
      }
      return `${name} debe reasignar PDVs ${fechaLabel}.`;
    }
    return `${name} — objetivo ${TIPO_CONFIG[tipo]?.label ?? tipo} ${fechaLabel}.`;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paraTodosFDV && !vendedorId) return;
    if (origenMode !== "compania" && !fecha) {
      toast.error("La fecha límite es obligatoria.");
      return;
    }
    if (!desc || desc.trim().length < 5) {
      toast.error("La descripción del objetivo es obligatoria (mínimo 5 caracteres).");
      return;
    }
    if (fechaInicio && fecha && fechaInicio > fecha) {
      toast.error("La fecha de inicio no puede ser posterior a la fecha límite.");
      return;
    }

    const creates: ObjetivoCreate[] = [];
    const targets = paraTodosFDV ? vendedoresFiltrados : [{ id_vendedor: Number(vendedorId), nombre_erp: vendedorNombre }];

    for (const target of targets) {
      const base: ObjetivoCreate = {
        id_distribuidor: distId,
        id_vendedor: target.id_vendedor,
        nombre_vendedor: target.nombre_erp,
        tipo,
        ...(origenMode === "compania"
          ? { fecha_objetivo: monthEndISO(mesReferencia) }
          : (fecha ? { fecha_objetivo: fecha } : {})),
        origen: origenMode,
        ...(origenMode === "compania" && mesReferencia ? { mes_referencia: `${mesReferencia}-01` } : {}),
        ...(tasaPendientes !== "" ? { tasa_pendientes: Number(tasaPendientes) } : {}),
        ...(fechaInicio ? { fecha_inicio: fechaInicio } : {}),
      };

      if (tipo === "ruteo_alteo") {
        if (alteoMode === "general" || paraTodosFDV) {
          base.valor_objetivo = cantidadAlteo ? Number(cantidadAlteo) : undefined;
        } else {
          const defaultQty = selectedDayGroups.reduce((acc, g) => acc + g.totalPdvs, 0);
          base.valor_objetivo = cantidadAlteo ? Number(cantidadAlteo) : (defaultQty || undefined);
          if (selectedDayGroups.length > 0 && !paraTodosFDV) {
            base.estado_inicial = selectedDayGroups.map((g) => g.day.toUpperCase()).join(", ");
          }
        }
        base.descripcion = desc;
        creates.push(base);
        continue;
      }

      if (tipo === "cobranza") {
        if (selectedDeudor) {
          base.valor_objetivo = cobranzaMode === "parcial" && cobranzaMonto
            ? Number(cobranzaMonto)
            : selectedDeudor.deuda_total;
        }
        base.descripcion = desc;
        creates.push(base);
        continue;
      }

      if (tipo === "conversion_estado") {
        if (activacionMode === "general" || paraTodosFDV) {
          base.valor_objetivo = cantidadActivacion !== "" ? Number(cantidadActivacion) : undefined;
          base.descripcion = desc;
          creates.push(base);
          continue;
        }
        if (selectedPdvIds.size > 0 && !paraTodosFDV) {
          const pdvItems = Array.from(selectedPdvIds).map((pdvId) => {
            const pdv = pdvCatalogAll.find((p) => p.id_cliente === pdvId);
            return {
              id_cliente_pdv: pdvId,
              id_cliente_erp: pdv?.id_cliente_erp ?? undefined,
              nombre_pdv: pdv?.nombre_cliente,
              metadata_ruteo: {
                nombre_fantasia: pdv?.nombre_cliente ?? null,
                nombre_razon_social: pdv?.nombre_razon_social ?? null,
              },
            };
          });
          base.pdv_items = pdvItems;
          base.valor_objetivo = cantidadActivacion !== "" ? Number(cantidadActivacion) : pdvItems.length;
          base.descripcion = desc;
          creates.push(base);
          continue;
        }
        base.descripcion = desc;
        creates.push(base);
        continue;
      }

      if (tipo === "exhibicion") {
        if (exhibicionMode === "general" || paraTodosFDV) {
          const qty = cantidadExhibicion ? Number(cantidadExhibicion) : undefined;
          base.valor_objetivo = qty;
          base.descripcion = desc;
          creates.push(base);
          continue;
        }
        if (selectedPdvIds.size > 0 && !paraTodosFDV) {
          const pdvItems = Array.from(selectedPdvIds).map(pdvId => {
            const pdv = pdvCatalogAll.find(p => p.id_cliente === pdvId);
            return {
              id_cliente_pdv: pdvId,
              id_cliente_erp: pdv?.id_cliente_erp ?? undefined,
              nombre_pdv: pdv?.nombre_cliente,
              metadata_ruteo: {
                nombre_fantasia: pdv?.nombre_cliente ?? null,
                nombre_razon_social: pdv?.nombre_razon_social ?? null,
              },
            };
          });
          const count = pdvItems.length;
          base.pdv_items = pdvItems;
          base.valor_objetivo = count;
          base.descripcion = desc || `Exhibición en ${count} PDV${count > 1 ? 's' : ''}`;
          creates.push(base);
          continue;
        }
        // por_pdv with nothing selected or paraTodosFDV — fallthrough to generic
        const qty = cantidadExhibicion ? Number(cantidadExhibicion) : undefined;
        base.valor_objetivo = qty;
        base.descripcion = desc;
        creates.push(base);
        continue;
      }

      if (tipo === "compradores") {
        if (!cantidadCompradores || Number(cantidadCompradores) < 1) {
          toast.error("Ingresá la cantidad de compradores objetivo (mínimo 1).");
          return;
        }
        base.valor_objetivo = Number(cantidadCompradores);
        base.descripcion = desc || `${cantidadCompradores} comprador${Number(cantidadCompradores) !== 1 ? "es" : ""} distintos`;
        creates.push(base);
        continue;
      }

      if (tipo === "ruteo") {
        const selected = Array.from(selectedPdvIds);
        if (selected.length === 0 || paraTodosFDV) {
          base.descripcion = desc;
          creates.push(base);
          continue;
        }
        // Validate: every selected PDV must have an action + required field
        for (const pdvId of selected) {
          const item = ruteoItemsMap[pdvId] ?? { accion: ruteoAccionGlobal };
          if (item.accion === 'cambio_ruta' && !item.id_ruta_destino) {
            // allow submit without ruta destino — supervisor can add later
          }
          if (item.accion === 'baja' && !item.motivo_baja?.trim()) {
            // allow submit without motivo — supervisor can add later
          }
        }
        const pdvItems = selected.map((pdvId, idx) => {
          const pdv = pdvCatalogAll.find(p => p.id_cliente === pdvId);
          const item = ruteoItemsMap[pdvId] ?? { accion: ruteoAccionGlobal };
          return {
            id_cliente_pdv: pdvId,
            id_cliente_erp: pdv?.id_cliente_erp ?? undefined,
            nombre_pdv: pdv?.nombre_cliente,
            accion_ruteo: item.accion,
            ...(item.accion === 'cambio_ruta' && item.id_ruta_destino ? { id_ruta_destino: item.id_ruta_destino } : {}),
            ...(item.accion === 'baja' && item.motivo_baja ? { motivo_baja: item.motivo_baja } : {}),
            orden_sugerido: idx + 1,
            metadata_ruteo: {
              nombre_fantasia: pdv?.nombre_cliente ?? null,
              nombre_razon_social: pdv?.nombre_razon_social ?? null,
            },
          };
        });
        base.pdv_items = pdvItems;
        base.valor_objetivo = selected.length;
        base.descripcion = desc;
        creates.push(base);
        continue;
      }

      base.descripcion = desc || buildPhrase(target.nombre_erp);
      creates.push(base);
    }
    if (creates.length > 0) {
      onCreate(creates);
    }
  };

  // cobranza oculto en UI — no se crea desde el formulario
  const TIPOS_DISPONIBLES: ObjetivoTipo[] = origenMode === "compania"
    ? ["ruteo_alteo", "conversion_estado", "exhibicion", "compradores"]
    : ["ruteo_alteo", "conversion_estado", "exhibicion", "compradores", "ruteo"];

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
          {/* Origen selector — solo visible para directorio/superadmin */}
          {canCrearCompania && (
            <div className="flex gap-1.5 p-1 bg-[var(--shelfy-bg)] rounded-xl border border-[var(--shelfy-border)]">
              {(["distribuidora", "compania"] as const).map(o => (
                <button
                  key={o}
                  type="button"
                  onClick={() => { setOrigenMode(o); if (tipo === "cobranza") setTipo("ruteo_alteo"); }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    origenMode === o
                      ? "bg-[var(--shelfy-accent)] text-white shadow-sm"
                      : "text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"
                  }`}
                >
                  {o === "distribuidora" ? "Distribuidora" : "Compañía"}
                </button>
              ))}
            </div>
          )}

          {/* Campos compañía */}
          {origenMode === "compania" && (
            <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3 space-y-2">
              <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider">Objetivo de Compañía</p>
              <div>
                <label className="text-[10px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1">Mes de referencia</label>
                <select
                  required={origenMode === "compania"}
                  value={mesReferencia}
                  onChange={e => setMesReferencia(e.target.value)}
                  className="h-9 text-sm bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-3 text-[var(--shelfy-text)] w-full focus:outline-none focus:border-amber-500/60"
                >
                  <option value="">Seleccioná el mes</option>
                  {Array.from({ length: 4 }, (_, i) => {
                    const d = new Date();
                    d.setDate(1);
                    d.setMonth(d.getMonth() + i);
                    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                    const label = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
                    return { value, label: label.charAt(0).toUpperCase() + label.slice(1) };
                  }).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Sucursal → Vendedor cascade */}
          {modalSucursales.length > 1 && (
            <div>
              <label className="text-[11px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1.5">Sucursal</label>
              <div className="relative">
                <select
                  className="w-full appearance-none bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-3 py-2 text-sm text-[var(--shelfy-text)] focus:outline-none focus:border-[var(--shelfy-accent)]/60"
                  value={modalSucursal}
                  onChange={e => { setModalSucursal(e.target.value); setVendedorId(""); resetCtx(); }}
                >
                  <option value="">Seleccionar sucursal...</option>
                  {modalSucursales.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--shelfy-muted)] pointer-events-none" />
              </div>
            </div>
          )}

          {/* Vendedor */}
          <div>
            <label className="text-[11px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1.5">Vendedor</label>
            <div className="relative">
              <select
                required={!paraTodosFDV}
                className="w-full appearance-none bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-3 py-2 text-sm text-[var(--shelfy-text)] focus:outline-none focus:border-[var(--shelfy-accent)]/60 disabled:opacity-50"
                value={paraTodosFDV ? "" : vendedorId}
                disabled={mustSelectSucursalFirst || paraTodosFDV}
                onChange={e => { setVendedorId(Number(e.target.value) || ""); resetCtx(); }}
              >
                <option value="">
                  {mustSelectSucursalFirst
                    ? "Seleccionar sucursal primero..."
                    : "Seleccionar vendedor..."}
                </option>
                {vendedoresCascada.map(v => (
                  <option key={v.id_vendedor} value={v.id_vendedor}>{v.nombre_erp}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--shelfy-muted)] pointer-events-none" />
            </div>
            {vendedoresFiltrados.length > 0 && (
              <div className="flex gap-1 mt-2 p-0.5 bg-[var(--shelfy-bg)] rounded-lg border border-[var(--shelfy-border)]">
                <button
                  type="button"
                  onClick={() => setParaTodosFDV(false)}
                  className={`flex-1 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                    !paraTodosFDV
                      ? "bg-[var(--shelfy-accent)] text-white shadow-sm"
                      : "text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"
                  }`}
                >
                  Por vendedor
                </button>
                <button
                  type="button"
                  onClick={() => { setParaTodosFDV(true); setVendedorId(""); }}
                  className={`flex-1 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                    paraTodosFDV
                      ? "bg-[var(--shelfy-accent)] text-white shadow-sm"
                      : "text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"
                  }`}
                >
                  Toda la FDV · {vendedoresFiltrados.length}
                </button>
              </div>
            )}
          </div>

          {/* Tipo — bloqueado hasta que el vendedor esté seleccionado o sea para todos */}
          <div className={(!vendedorId && !paraTodosFDV) ? "opacity-40 pointer-events-none select-none" : ""}>
            <label className="text-[11px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
              Tipo
              {(!vendedorId && !paraTodosFDV) && <span className="text-[9px] font-normal normal-case text-[var(--shelfy-muted)]/60">(seleccioná un vendedor primero)</span>}
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {TIPOS_DISPONIBLES.map(t => (
                <button
                  key={t}
                  type="button"
                  disabled={!vendedorId && !paraTodosFDV}
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

            {/* Panel educativo por tipo */}
            {TIPO_EDUCATIVO[tipo] && (
              <div className="mt-2 rounded-lg bg-[var(--shelfy-accent)]/5 border border-[var(--shelfy-accent)]/15 px-3 py-2">
                <p className="text-[10px] text-[var(--shelfy-accent)] leading-relaxed">{TIPO_EDUCATIVO[tipo]}</p>
              </div>
            )}
          </div>

          {/* Contextual: Alteo */}
          {tipo === "ruteo_alteo" && (
            <div className="space-y-2 rounded-xl bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] p-3">
              {!paraTodosFDV && (
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAlteoMode("por_dia")}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      alteoMode === "por_dia"
                        ? "border-[var(--shelfy-accent)] bg-[var(--shelfy-accent)]/10 text-[var(--shelfy-accent)]"
                        : "border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"
                    }`}
                  >
                    Por días asignados
                  </button>
                  <button
                    type="button"
                    onClick={() => setAlteoMode("general")}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      alteoMode === "general"
                        ? "border-[var(--shelfy-accent)] bg-[var(--shelfy-accent)]/10 text-[var(--shelfy-accent)]"
                        : "border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"
                    }`}
                  >
                    Meta general por cantidad
                  </button>
                </div>
              )}
              {!paraTodosFDV && (
                <p className="text-[10px] text-[var(--shelfy-muted)]">
                  <strong>Por días asignados:</strong> elegís los días del vendedor y definís cuántos PDVs nuevos debe sumar.
                </p>
              )}
              {!paraTodosFDV && alteoMode === "por_dia" && (
                <p className="text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider">Días asignados del vendedor</p>
              )}
              {!paraTodosFDV && !vendedorId ? (
                <p className="text-xs text-[var(--shelfy-muted)]">Seleccioná un vendedor para ver sus rutas</p>
              ) : !paraTodosFDV && loadingCtx ? (
                <div className="flex items-center gap-1.5 text-xs text-[var(--shelfy-muted)]">
                  <Loader2 className="w-3 h-3 animate-spin" /> Cargando rutas...
                </div>
              ) : !paraTodosFDV && alteoMode === "por_dia" && rutas.length === 0 ? (
                <p className="text-xs text-[var(--shelfy-muted)]">Sin rutas registradas</p>
              ) : !paraTodosFDV && alteoMode === "por_dia" ? (
                <div className="space-y-1">
                  {rutasPorDia.map(({ day, dayKey, routes: dayRoutes, totalPdvs }) => (
                    <div key={dayKey} className="rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] p-2">
                      <button
                        type="button"
                        onClick={() => setSelectedDias((prev) => {
                          const next = new Set(prev);
                          if (next.has(dayKey)) next.delete(dayKey);
                          else next.add(dayKey);
                          return next;
                        })}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors border ${
                          selectedDias.has(dayKey)
                            ? "border-[var(--shelfy-accent)]/60 bg-[var(--shelfy-accent)]/10 text-[var(--shelfy-text)]"
                            : "border-transparent hover:bg-black/5 text-[var(--shelfy-muted)]"
                        }`}
                      >
                        <span className="font-semibold uppercase">{day}</span>
                        <span className="text-[10px] text-[var(--shelfy-accent)] font-semibold">{totalPdvs} PDVs</span>
                      </button>
                      <div className="mt-1 pl-1 space-y-0.5">
                        {dayRoutes.map((r) => (
                          <div key={r.id_ruta} className="text-[10px] text-[var(--shelfy-muted)] flex items-center justify-between">
                            <span>Ruta {r.nombre_ruta}</span>
                            <span>{r.total_pdv} PDVs</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[var(--shelfy-muted)]">Modo general activo: definí cuántos PDVs nuevos debe altear.</p>
              )}
              <div>
                <div>
                  <label className="text-[10px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1">
                    Cantidad a altear
                  </label>
                  <input
                    type="number"
                    min={1}
                    placeholder={
                      alteoMode === "por_dia"
                        ? String(selectedDayGroups.reduce((acc, g) => acc + g.totalPdvs, 0) || "Total días")
                        : "Ej: 12"
                    }
                    className="w-full bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--shelfy-text)] focus:outline-none focus:border-[var(--shelfy-accent)]/60"
                    value={cantidadAlteo}
                    onChange={e => setCantidadAlteo(e.target.value ? Number(e.target.value) : "")}
                  />
                </div>
              </div>
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

          {/* Contextual: Compradores */}
          {tipo === "compradores" && (
            <div className="space-y-2 rounded-xl bg-[var(--shelfy-bg)] border border-teal-500/20 p-3">
              <p className="text-[10px] font-semibold text-teal-600 uppercase tracking-wider">Meta de compradores</p>
              <div>
                <label className="text-[10px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1">
                  Compradores objetivo (N PDVs distintos)
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  placeholder="Ej: 10"
                  className="w-full bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--shelfy-text)] focus:outline-none focus:border-teal-500/60"
                  value={cantidadCompradores}
                  onChange={e => setCantidadCompradores(e.target.value ? Number(e.target.value) : "")}
                />
                <p className="text-[10px] text-[var(--shelfy-muted)] mt-1">
                  Cada cliente distinto con al menos una venta en el período cuenta como 1 comprador.
                </p>
              </div>
            </div>
          )}

          {/* Contextual: Activación (conversion_estado) */}
          {tipo === "conversion_estado" && (vendedorId || paraTodosFDV) && (
            <div className="space-y-2 rounded-xl bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] p-3">
              {!paraTodosFDV && (
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setActivacionMode("por_pdv")}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      activacionMode === "por_pdv"
                        ? "border-[var(--shelfy-accent)] bg-[var(--shelfy-accent)]/10 text-[var(--shelfy-accent)]"
                        : "border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"
                    }`}
                  >
                    Seleccionar PDVs
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivacionMode("general")}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      activacionMode === "general"
                        ? "border-[var(--shelfy-accent)] bg-[var(--shelfy-accent)]/10 text-[var(--shelfy-accent)]"
                        : "border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"
                    }`}
                  >
                    Meta general por cantidad
                  </button>
                </div>
              )}
              {(activacionMode === "general" || paraTodosFDV) && (
                <div>
                  <label className="text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1.5">
                    Cantidad de PDVs a activar
                  </label>
                  <input
                    type="number"
                    min={1}
                    placeholder="Ej: 10"
                    className="w-full bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] rounded-lg px-3 py-2 text-sm text-[var(--shelfy-text)] focus:outline-none focus:border-[var(--shelfy-accent)]/60"
                    value={cantidadActivacion}
                    onChange={e => setCantidadActivacion(e.target.value ? Number(e.target.value) : "")}
                  />
                </div>
              )}
              {!paraTodosFDV && (
                <p className="text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider">
                  PDVs sin compra +30 días
                </p>
              )}
              {!paraTodosFDV && activacionMode === "por_pdv" && loadingCtx ? (
                <div className="flex items-center gap-1.5 text-xs text-[var(--shelfy-muted)]">
                  <Loader2 className="w-3 h-3 animate-spin" /> Cargando PDVs...
                </div>
              ) : !paraTodosFDV && activacionMode === "por_pdv" && activacionPdvs.length === 0 ? (
                <p className="text-xs text-[var(--shelfy-muted)]">Sin PDVs en esa condición</p>
              ) : !paraTodosFDV && activacionMode === "por_pdv" ? (
                <div className="max-h-40 overflow-y-auto space-y-0.5">
                  {activacionPdvs.map((pdv) => (
                    <button
                      key={pdv.id}
                      type="button"
                      onClick={() =>
                        setSelectedPdvIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(pdv.id)) next.delete(pdv.id);
                          else next.add(pdv.id);
                          return next;
                        })
                      }
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors border ${
                        selectedPdvIds.has(pdv.id)
                          ? "bg-[var(--shelfy-accent)]/10 border-[var(--shelfy-accent)]/40"
                          : "bg-black/[0.02] border-transparent hover:bg-[var(--shelfy-accent)]/10 hover:border-[var(--shelfy-accent)]/20"
                      }`}
                    >
                      <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        selectedPdvIds.has(pdv.id) ? "bg-[var(--shelfy-accent)] border-[var(--shelfy-accent)]" : "border-[var(--shelfy-border)]"
                      }`}>
                        {selectedPdvIds.has(pdv.id) && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-[var(--shelfy-muted)]/80 font-mono shrink-0">#{pdv.idClienteErp ?? "—"}</span>
                          <span className="text-[var(--shelfy-text)] truncate">{pdv.nombre}</span>
                        </div>
                        {pdv.razonSocial && (
                          <p className="text-[10px] text-[var(--shelfy-muted)] truncate">{pdv.razonSocial}</p>
                        )}
                      </div>
                      {pdv.diasSinCompra !== null ? (
                        <span className={`font-medium tabular-nums shrink-0 ${pdv.diasSinCompra > 60 ? "text-red-500" : "text-orange-500"}`}>
                          {pdv.diasSinCompra}d
                        </span>
                      ) : (
                        <span className="text-[var(--shelfy-muted)] shrink-0">S/C</span>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[var(--shelfy-muted)]">Modo general activo: meta por cantidad, sin lista fija de PDVs.</p>
              )}
              {activacionMode === "por_pdv" && selectedPdvIds.size > 0 && (
                <p className="text-[10px] font-semibold text-[var(--shelfy-accent)]">
                  {selectedPdvIds.size} seleccionado{selectedPdvIds.size > 1 ? "s" : ""} para objetivo de activación
                </p>
              )}
              {activacionMode === "por_pdv" && selectedPdvIds.size > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-muted/50 rounded-lg p-3 space-y-2"
                >
                  <Label htmlFor="cantidadActivacion" className="text-xs text-[var(--shelfy-muted)]">
                    Activar al menos N PDVs
                  </Label>
                  <Input
                    id="cantidadActivacion"
                    type="number"
                    min={1}
                    max={selectedPdvIds.size}
                    value={cantidadActivacion}
                    onChange={(e) => {
                      const v = e.target.value === "" ? "" : Math.min(selectedPdvIds.size, Math.max(1, Number(e.target.value)));
                      setCantidadActivacion(v === "" ? "" : v);
                    }}
                    placeholder={String(selectedPdvIds.size)}
                    className="h-8 text-xs"
                  />
                  <p className="text-[10px] text-[var(--shelfy-muted)]">
                    Meta:{" "}
                    <span className="text-[var(--shelfy-accent)] font-semibold">
                      {cantidadActivacion !== "" ? Number(cantidadActivacion) : selectedPdvIds.size}
                    </span>
                    {" "}de{" "}
                    <span className="font-medium">{selectedPdvIds.size}</span>
                    {" "}PDVs seleccionados
                  </p>
                </motion.div>
              )}
              {activacionMode === "por_pdv" && pdvCatalogHasMore && (
                <button
                  type="button"
                  disabled={loadingMorePdv}
                  onClick={() => {
                    const nextOffset = (pdvCatalogPage + 1) * 35;
                    setLoadingMorePdv(true);
                    fetchPDVCatalog(distId, { vendedorId: Number(vendedorId), limit: 35, offset: nextOffset })
                      .then((more) => {
                        setPdvCatalogAll((prev) => [...prev, ...more]);
                        setPdvCatalogHasMore(more.length === 35);
                        setPdvCatalogPage((p) => p + 1);
                        const now = Date.now();
                        setActivacionPdvs((prev) => {
                          const next = [...prev];
                          const seen = new Set(next.map((x) => x.id));
                          for (const pdv of more) {
                            const fechaCompra = pdv.fecha_ultima_compra ?? null;
                            const diasSinCompra = fechaCompra
                              ? Math.floor((now - new Date(fechaCompra).getTime()) / 86_400_000)
                              : null;
                            const isTarget =
                              (pdv.estado ?? "").toLowerCase() === "inactivo" ||
                              diasSinCompra === null ||
                              (diasSinCompra ?? 0) > 30;
                            if (!isTarget || seen.has(pdv.id_cliente)) continue;
                            seen.add(pdv.id_cliente);
                            next.push({
                              id: pdv.id_cliente,
                              nombre: pdv.nombre_cliente ?? "S/N",
                              idClienteErp: pdv.id_cliente_erp ?? null,
                              razonSocial: pdv.nombre_razon_social ?? null,
                              fechaCompra,
                              diasSinCompra,
                              estado: pdv.estado ?? null,
                            });
                          }
                          next.sort((a, b) => {
                            if (a.diasSinCompra === null) return -1;
                            if (b.diasSinCompra === null) return 1;
                            return b.diasSinCompra - a.diasSinCompra;
                          });
                          return next;
                        });
                      })
                      .finally(() => setLoadingMorePdv(false));
                  }}
                  className="w-full py-1.5 text-xs text-[var(--shelfy-accent)] hover:text-[var(--shelfy-accent)]/80 border border-[var(--shelfy-border)] rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  {loadingMorePdv && <Loader2 className="w-3 h-3 animate-spin" />}
                  Cargar más PDVs
                </button>
              )}
            </div>
          )}

          {/* Contextual: Exhibición */}
          {tipo === "exhibicion" && (vendedorId || paraTodosFDV) && (
            <div className="space-y-3 rounded-xl bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] p-3">
              {/* Mode toggle */}
              {!paraTodosFDV && (
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setExhibicionMode("general")}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      exhibicionMode === "general"
                        ? "border-[var(--shelfy-accent)] bg-[var(--shelfy-accent)]/10 text-[var(--shelfy-accent)]"
                        : "border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"
                    }`}
                  >
                    Meta general por cantidad
                  </button>
                  <button
                    type="button"
                    onClick={() => setExhibicionMode("por_pdv")}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      exhibicionMode === "por_pdv"
                        ? "border-[var(--shelfy-accent)] bg-[var(--shelfy-accent)]/10 text-[var(--shelfy-accent)]"
                        : "border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"
                    }`}
                  >
                    Seleccionar PDVs
                  </button>
                </div>
              )}

              {exhibicionMode === "general" || paraTodosFDV ? (
                /* ── General: just set a quantity ── */
                <div>
                  <label className="text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1.5">
                    Cantidad de exhibiciones
                  </label>
                  <input
                    type="number"
                    min={1}
                    placeholder="Ej: 5"
                    className="w-full bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] rounded-lg px-3 py-2 text-sm text-[var(--shelfy-text)] focus:outline-none focus:border-[var(--shelfy-accent)]/60"
                    value={cantidadExhibicion}
                    onChange={e => setCantidadExhibicion(e.target.value ? Number(e.target.value) : "")}
                  />
                  <p className="text-[10px] text-[var(--shelfy-muted)] mt-1">
                    El vendedor debe completar X exhibiciones sin restricción de PDV específico.
                  </p>
                </div>
              ) : (
                /* ── Por PDV: catalog ordered by exhibition age ── */
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider">
                      PDVs — por antigüedad de exhibición
                    </p>
                    {selectedPdvIds.size > 0 && (
                      <span className="text-[10px] font-semibold text-[var(--shelfy-accent)]">
                        {selectedPdvIds.size} seleccionado{selectedPdvIds.size > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  {loadingCtx ? (
                    <div className="flex items-center gap-1.5 text-xs text-[var(--shelfy-muted)]">
                      <Loader2 className="w-3 h-3 animate-spin" /> Cargando PDVs...
                    </div>
                  ) : pdvCatalogAll.length === 0 ? (
                    <p className="text-xs text-[var(--shelfy-muted)]">Sin PDVs registrados</p>
                  ) : (
                    <>
                      <ScrollArea className="max-h-48">
                        <div className="space-y-0.5 pr-2">
                          {pdvCatalogAll.map((pdv) => {
                            const sel = selectedPdvIds.has(pdv.id_cliente);
                            const diasSinExhib = pdv.fecha_ultima_exhibicion
                              ? Math.floor((Date.now() - new Date(pdv.fecha_ultima_exhibicion).getTime()) / 86400000)
                              : null;
                            return (
                              <button
                                key={pdv.id_cliente}
                                type="button"
                                onClick={() => setSelectedPdvIds(prev => {
                                  const next = new Set(prev);
                                  if (next.has(pdv.id_cliente)) next.delete(pdv.id_cliente);
                                  else next.add(pdv.id_cliente);
                                  return next;
                                })}
                                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors border ${
                                  sel
                                    ? "bg-[var(--shelfy-accent)]/10 border-[var(--shelfy-accent)]/40"
                                    : "bg-black/[0.02] border-transparent hover:bg-[var(--shelfy-accent)]/10 hover:border-[var(--shelfy-accent)]/20"
                                }`}
                              >
                                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                  sel ? "bg-[var(--shelfy-accent)] border-[var(--shelfy-accent)]" : "border-[var(--shelfy-border)]"
                                }`}>
                                  {sel && <Check className="w-2.5 h-2.5 text-white" />}
                                </div>
                                <div className="min-w-0 flex-1 text-left">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] text-[var(--shelfy-muted)]/80 font-mono shrink-0">#{pdv.id_cliente_erp ?? "—"}</span>
                                    <span className="text-[var(--shelfy-text)] truncate">{pdv.nombre_cliente}</span>
                                  </div>
                                  {pdv.nombre_razon_social && (
                                    <p className="text-[10px] text-[var(--shelfy-muted)] truncate">{pdv.nombre_razon_social}</p>
                                  )}
                                </div>
                                {diasSinExhib === null ? (
                                  <span className="text-red-500 font-semibold shrink-0 text-[10px]">Nunca</span>
                                ) : (
                                  <span className={`font-medium tabular-nums shrink-0 ${diasSinExhib > 30 ? "text-orange-500" : "text-[var(--shelfy-muted)]"}`}>
                                    {diasSinExhib}d
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </ScrollArea>
                      {pdvCatalogHasMore && (
                        <button
                          type="button"
                          disabled={loadingMorePdv}
                          onClick={() => {
                            const nextOffset = (pdvCatalogPage + 1) * 35;
                            setLoadingMorePdv(true);
                            fetchPDVCatalog(distId, { vendedorId: Number(vendedorId), limit: 35, offset: nextOffset })
                              .then(more => {
                                setPdvCatalogAll(prev => [...prev, ...more]);
                                setPdvCatalogHasMore(more.length === 35);
                                setPdvCatalogPage(p => p + 1);
                              })
                              .catch(() => {})
                              .finally(() => setLoadingMorePdv(false));
                          }}
                          className="w-full py-1.5 text-xs text-[var(--shelfy-accent)] hover:text-[var(--shelfy-accent)]/80 border border-[var(--shelfy-border)] rounded-lg transition-colors flex items-center justify-center gap-1.5"
                        >
                          {loadingMorePdv && <Loader2 className="w-3 h-3 animate-spin" />}
                          Cargar más
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* Contextual: Ruteo */}
          {tipo === "ruteo" && vendedorId && (
            <div className="space-y-3 rounded-xl bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] p-3">
              {/* Acción global */}
              <div>
                <p className="text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider mb-1.5">Acción por defecto</p>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setRuteoAccionGlobal('cambio_ruta')}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      ruteoAccionGlobal === 'cambio_ruta'
                        ? "border-purple-500/60 bg-purple-500/10 text-purple-600"
                        : "border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"
                    }`}
                  >
                    Cambio de ruta
                  </button>
                  <button
                    type="button"
                    onClick={() => setRuteoAccionGlobal('baja')}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      ruteoAccionGlobal === 'baja'
                        ? "border-red-500/60 bg-red-500/10 text-red-500"
                        : "border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"
                    }`}
                  >
                    Baja
                  </button>
                </div>
              </div>

              {/* PDV selector */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider">
                    PDVs a reasignar
                  </p>
                  {selectedPdvIds.size > 0 && (
                    <span className="text-[10px] font-semibold text-purple-600">
                      {selectedPdvIds.size} seleccionado{selectedPdvIds.size > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                {loadingCtx ? (
                  <div className="flex items-center gap-1.5 text-xs text-[var(--shelfy-muted)]">
                    <Loader2 className="w-3 h-3 animate-spin" /> Cargando PDVs...
                  </div>
                ) : pdvCatalogAll.length === 0 ? (
                  <p className="text-xs text-[var(--shelfy-muted)]">Sin PDVs registrados</p>
                ) : (
                  <ScrollArea className="max-h-48">
                    <div className="space-y-0.5 pr-2">
                      {pdvCatalogAll.map((pdv) => {
                        const sel = selectedPdvIds.has(pdv.id_cliente);
                        const itemData = ruteoItemsMap[pdv.id_cliente] ?? { accion: ruteoAccionGlobal };
                        return (
                          <div key={pdv.id_cliente} className={`rounded-lg border transition-colors ${
                            sel
                              ? "bg-purple-500/10 border-purple-500/40"
                              : "bg-black/[0.02] border-transparent hover:border-[var(--shelfy-border)]"
                          }`}>
                            <button
                              type="button"
                              onClick={() => setSelectedPdvIds(prev => {
                                const next = new Set(prev);
                                if (next.has(pdv.id_cliente)) {
                                  next.delete(pdv.id_cliente);
                                  setRuteoItemsMap(m => { const n = { ...m }; delete n[pdv.id_cliente]; return n; });
                                } else {
                                  next.add(pdv.id_cliente);
                                }
                                return next;
                              })}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs"
                            >
                              <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                sel ? "bg-purple-500 border-purple-500" : "border-[var(--shelfy-border)]"
                              }`}>
                                {sel && <Check className="w-2.5 h-2.5 text-white" />}
                              </div>
                              <div className="min-w-0 flex-1 text-left">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-[var(--shelfy-muted)]/80 font-mono shrink-0">#{pdv.id_cliente_erp ?? "—"}</span>
                                  <span className="text-[var(--shelfy-text)] truncate">{pdv.nombre_cliente}</span>
                                </div>
                                {pdv.nombre_razon_social && (
                                  <p className="text-[10px] text-[var(--shelfy-muted)] truncate">{pdv.nombre_razon_social}</p>
                                )}
                              </div>
                            </button>

                            {/* Per-item action (only when selected) */}
                            {sel && (
                              <div className="px-2.5 pb-2 space-y-1.5">
                                <div className="flex gap-1.5">
                                  {(['cambio_ruta', 'baja'] as RuteoAccion[]).map(accion => (
                                    <button
                                      key={accion}
                                      type="button"
                                      onClick={() => setRuteoItemsMap(m => ({
                                        ...m,
                                        [pdv.id_cliente]: { ...(m[pdv.id_cliente] ?? {}), accion },
                                      }))}
                                      className={`flex-1 py-1 rounded text-[10px] font-medium border transition-all ${
                                        itemData.accion === accion
                                          ? accion === 'cambio_ruta'
                                            ? "border-purple-500/60 bg-purple-500/10 text-purple-600"
                                            : "border-red-500/60 bg-red-500/10 text-red-500"
                                          : "border-[var(--shelfy-border)] text-[var(--shelfy-muted)]"
                                      }`}
                                    >
                                      {accion === 'cambio_ruta' ? 'Cambio ruta' : 'Baja'}
                                    </button>
                                  ))}
                                </div>
                                {itemData.accion === 'cambio_ruta' && (
                                  <input
                                    type="number"
                                    min={1}
                                    placeholder="ID ruta destino..."
                                    className="w-full bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] rounded px-2.5 py-1 text-xs text-[var(--shelfy-text)] focus:outline-none focus:border-purple-500/60"
                                    value={itemData.id_ruta_destino ?? ""}
                                    onClick={e => e.stopPropagation()}
                                    onChange={e => setRuteoItemsMap(m => ({
                                      ...m,
                                      [pdv.id_cliente]: { ...(m[pdv.id_cliente] ?? { accion: ruteoAccionGlobal }), id_ruta_destino: e.target.value ? Number(e.target.value) : undefined },
                                    }))}
                                  />
                                )}
                                {itemData.accion === 'baja' && (
                                  <input
                                    type="text"
                                    placeholder="Motivo de baja..."
                                    className="w-full bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] rounded px-2.5 py-1 text-xs text-[var(--shelfy-text)] focus:outline-none focus:border-red-500/60"
                                    value={itemData.motivo_baja ?? ""}
                                    onClick={e => e.stopPropagation()}
                                    onChange={e => setRuteoItemsMap(m => ({
                                      ...m,
                                      [pdv.id_cliente]: { ...(m[pdv.id_cliente] ?? { accion: ruteoAccionGlobal }), motivo_baja: e.target.value },
                                    }))}
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </div>
          )}

          {/* Tasa de pendientes — solo cuando hay PDVs asignados y no es FDV bulk */}
          {showTasaPendientes && (
            <div>
              <label className="text-[11px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1">
                Tasa de pendientes <span className="normal-case font-normal">(opcional)</span>
              </label>
              <input
                type="number"
                min={0}
                placeholder="0"
                className="h-9 w-full bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-3 text-sm text-[var(--shelfy-text)] focus:outline-none focus:border-[var(--shelfy-accent)]/60"
                value={tasaPendientes}
                onChange={e => setTasaPendientes(e.target.value !== "" ? Number(e.target.value) : "")}
              />
              <p className="text-[10px] text-[var(--shelfy-muted)] mt-1">
                Aplica cuando el objetivo tiene PDVs asignados: podés cerrar la meta dejando hasta N ítems pendientes.
              </p>
            </div>
          )}

          {/* Fecha límite — bloqueada hasta que vendedor Y tipo estén seleccionados. Oculta en modo compañía (el mes define el período) */}
          {origenMode !== "compania" && (
            <div className={(!vendedorId && !paraTodosFDV) ? "opacity-40 pointer-events-none select-none" : ""}>
              <label className="text-[11px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1.5">
                Fecha límite
              </label>
              <div className="flex gap-1.5 flex-wrap items-center">
                {([{ label: "Hoy", days: 0 }, { label: "+7d", days: 7 }, { label: "+15d", days: 15 }, { label: "+30d", days: 30 }] as const).map(({ label, days }) => {
                  const d = new Date();
                  d.setDate(d.getDate() + days);
                  const iso = d.toISOString().split("T")[0];
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setFecha(iso)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                        fecha === iso
                          ? "border-[var(--shelfy-accent)] bg-[var(--shelfy-accent)]/10 text-[var(--shelfy-accent)]"
                          : "border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
                <div className="flex-1 min-w-0">
                  <DatePicker
                    value={fecha}
                    onChange={setFecha}
                    placeholder="Fecha límite"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Descripción */}
          {/* Fecha de inicio (planificación) */}
          {origenMode !== "compania" && (
            <div>
              <label className="text-[11px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1.5">
                Fecha de inicio <span className="normal-case font-normal">(opcional — deja vacío para lanzar hoy)</span>
              </label>
              <DatePicker
                value={fechaInicio}
                onChange={(v) => setFechaInicio(v)}
                placeholder="Seleccionar fecha de inicio..."
              />
              {fechaInicio && (
                <p className="text-[10px] text-slate-500 mt-1">
                  El objetivo quedará en <b>Planificados</b> hasta el {fechaInicio} a las 08:00 AR.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="text-[11px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1.5">
              Mensaje para el vendedor <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              placeholder="Describí el objetivo y la acción requerida (mínimo 5 caracteres)..."
              className="w-full bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-3 py-2 text-sm text-[var(--shelfy-text)] placeholder-[var(--shelfy-muted)]/60 focus:outline-none focus:border-[var(--shelfy-accent)]/60 resize-none"
              value={desc}
              onChange={e => setDesc(e.target.value)}
            />
            {desc && desc.trim().length < 5 && (
              <p className="text-[10px] text-red-500 mt-1">Mínimo 5 caracteres</p>
            )}
            <p className="text-[10px] text-[var(--shelfy-muted)]/70 mt-0.5">
              Previsualización del mensaje Telegram — podés editarlo antes de crear.
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-[var(--shelfy-border)] text-sm text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={loading || (!vendedorId && !paraTodosFDV)}
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
                    <span style={{ color: "#334155" }}>
                      {it.nombre_pdv ?? "Cliente sin nombre"}
                      {" · "}
                      <span style={{ fontFamily: "monospace", color: "#64748b" }}>
                        ERP #{getObjetivoItemClientCode(it) ?? "—"}
                      </span>
                    </span>
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
  ruteo:             "#c084fc",
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
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
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
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
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

// PageTab type kept for legacy refs — replaced by viewMode
type PageTab = "objetivos";

export default function ObjetivosPage() {
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const pageTab: PageTab = "objetivos"; // legacy — view routing now uses viewMode

  const {
    filterTipo, filterCumplido, searchText, viewMode,
    setFilterTipo, setFilterCumplido, setSearchText, setViewMode,
    filterVendedores, filterKanbanPhase, setFilterKanbanPhase,
    filterMes, setFilterMes,
  } = useObjetivosStore();

  const distId = user?.id_distribuidor ?? 0;
  const canAccessObjetivos = user?.is_superadmin || !!(user && (user.permisos?.menu_objetivos ?? true));

  const [selectedSucursal, setSelectedSucursal] = useState<string>("");
  const [selectedVendedorId, setSelectedVendedorId] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    if (canAccessObjetivos) return;
    router.replace("/dashboard");
  }, [user, canAccessObjetivos, router]);

  if (user && !canAccessObjetivos) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--shelfy-bg)] text-[var(--shelfy-text)]">
        <p className="text-sm text-[var(--shelfy-muted)]">Sin acceso a Objetivos.</p>
      </div>
    );
  }

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
    enabled: !!distId && viewMode !== "supervisor",
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
      toast.success("Objetivo creado correctamente");
    },
    onError: (err: unknown) => {
      // Manejar 409 duplicado con mensaje accionable
      const apiErr = err as { status?: number; detail?: { code?: string; mensaje?: string } | string };
      const detail = typeof apiErr.detail === "object" ? apiErr.detail : null;
      if (apiErr.status === 409 && detail?.code === "OBJETIVO_DUPLICADO") {
        toast.warning(detail.mensaje ?? "Ya existe un objetivo activo similar. Editá el existente.");
      } else {
        toast.error("Error al crear el objetivo");
      }
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
      socket.onerror = () => {};
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

    list = list.filter(o => o.tipo !== "cobranza");

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

    // Filtro por mes (YYYY-MM) — usa mes_referencia para compañía, fecha_inicio o fecha_objetivo para distribuidora
    if (filterMes) {
      list = list.filter(o => {
        const ref = (o as any).mes_referencia
          ? String((o as any).mes_referencia).slice(0, 7)
          : o.fecha_inicio
            ? String(o.fecha_inicio).slice(0, 7)
            : o.fecha_objetivo
              ? String(o.fecha_objetivo).slice(0, 7)
              : o.created_at
                ? String(o.created_at).slice(0, 7)
                : null;
        return ref === filterMes;
      });
    }

    // Nota: filterKanbanPhase NO se aplica al `filtered` global.
    // Lo aplica internamente KanbanOrListaView por columna para preservar los conteos reales.

    return list;
  }, [objetivos, searchText, selectedSucursal, selectedVendedorId, vendedorNamesEnSucursal, vendedores, user?.is_superadmin, filterMes]);

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
    planificado: filtered.filter(o => getObjectiveKanbanPhase(o) === 'planificado'),
    pendiente:   filtered.filter(o => getObjectiveKanbanPhase(o) === 'pendiente'),
    en_progreso: filtered.filter(o => getObjectiveKanbanPhase(o) === 'en_progreso'),
    terminado:   filtered.filter(o => getObjectiveKanbanPhase(o) === 'terminado'),
  }), [filtered]);

  // ── Lanzar objetivo state ─────────────────────────────────────────────────

  const [lanzarObj, setLanzarObj] = useState<Objetivo | null>(null);
  const [lanzandoLoading, setLanzandoLoading] = useState(false);

  const handleLanzarConfirm = async () => {
    if (!lanzarObj) return;
    setLanzandoLoading(true);
    try {
      await lanzarObjetivo(lanzarObj.id);
      toast.success("Objetivo lanzado — Telegram enviado.");
      qc.invalidateQueries({ queryKey: ["objetivos", distId] });
      setLanzarObj(null);
    } catch (err) {
      toast.error("Error al lanzar el objetivo. Revisá los logs.");
      console.error(err);
    } finally {
      setLanzandoLoading(false);
    }
  };

  // ── Re-agendar state ──────────────────────────────────────────────────────

  const [reagendarObj, setReagendarObj] = useState<Objetivo | null>(null);
  const [fechaReagendar, setFechaReagendar] = useState<string>("");
  const [observacionReagendar, setObservacionReagendar] = useState<string>("");

  // ── View mode helpers ─────────────────────────────────────────────────────

  type ViewModeKey = 'kanban' | 'lista' | 'timeline' | 'stats' | 'supervisor' | 'print';
  const VIEW_BUTTONS: { key: ViewModeKey; label: string; Icon: React.ElementType }[] = [
    { key: "kanban",     label: "Kanban",      Icon: LayoutGrid },
    { key: "lista",      label: "Lista",       Icon: LayoutList },
    { key: "timeline",   label: "Timeline",    Icon: GitBranch },
    { key: "stats",      label: "Stats",       Icon: BarChart3 },
    { key: "supervisor", label: "Supervisor",  Icon: Users },
    { key: "print",      label: "Imprimir",    Icon: Printer },
  ];

  // ── Certificado wrapper ───────────────────────────────────────────────────

  const handleDownloadCertificado = useCallback((obj: Objetivo) => {
    const vend = vendedores.find(v => v.id_vendedor === obj.id_vendedor);
    downloadCertificado(obj, vend?.sucursal_nombre ?? undefined);
  }, [vendedores]);

  const handleOpenRuteoPdf = useCallback(async (obj: Objetivo) => {
    try {
      const res = await regenerateObjetivoRuteoPDF(obj.id);
      if (res?.url) {
        qc.invalidateQueries({ queryKey: ["objetivos", distId] });
        window.open(res.url, "_blank", "noopener,noreferrer");
      } else {
        throw new Error("No se recibió URL del PDF");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo regenerar el PDF de ruteo";
      toast.error(msg);
    }
  }, [qc, distId]);

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

          {/* Stats (hidden on dedicated stats/timeline/supervisor views) */}
          {viewMode !== "stats" && viewMode !== "timeline" && viewMode !== "supervisor" && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 print-hidden">
              <StatCard icon={Target}       label="Total"          value={stats.total}             color="bg-[var(--shelfy-border)]" />
              <StatCard icon={Clock}        label="Pendientes"     value={stats.pendientes}         color="bg-orange-500/10 text-orange-500" />
              <StatCard icon={CheckCircle2} label="Esta semana"    value={stats.completadosSemana}  sub="completados" color="bg-emerald-500/10 text-emerald-600" />
              <StatCard icon={TrendingUp}   label="% Cumplimiento" value={`${stats.pct}%`}          sub={`${stats.cumplidos} de ${stats.total}`} color="bg-[var(--shelfy-accent)]/10 text-[var(--shelfy-accent)]" />
            </div>
          )}

          {viewMode === "supervisor" ? (
            <VistaSupervisor distId={distId} />
          ) : (
            <>
              {/* Filtros — barra principal */}
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

                {/* Fase kanban */}
                <div className="relative">
                  <select
                    className="appearance-none bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] rounded-lg pl-3 pr-8 py-2 text-sm text-[var(--shelfy-text)] focus:outline-none focus:border-[var(--shelfy-accent)]/60"
                    value={filterKanbanPhase ?? ""}
                    onChange={e => {
                      const v = e.target.value as typeof filterKanbanPhase;
                      setFilterKanbanPhase(v || null);
                    }}
                  >
                    <option value="">Todas las fases</option>
                    <option value="planificado">Planificados</option>
                    <option value="pendiente">Pendiente</option>
                    <option value="en_progreso">En progreso</option>
                    <option value="terminado">Terminado</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--shelfy-muted)] pointer-events-none" />
                </div>

                {/* Filtro por mes */}
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[var(--shelfy-muted)] shrink-0" />
                  <input
                    type="month"
                    title="Filtrar por mes"
                    value={filterMes ?? ""}
                    onChange={e => setFilterMes(e.target.value || null)}
                    className="bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] rounded-lg px-2 py-2 text-sm text-[var(--shelfy-text)] focus:outline-none focus:border-[var(--shelfy-accent)]/60"
                  />
                  {filterMes && (
                    <button
                      type="button"
                      onClick={() => setFilterMes(null)}
                      className="w-6 h-6 flex items-center justify-center rounded text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

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
              ) : viewMode === "lista" ? (
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
                          onDelete={() => deleteMut.mutate(obj.id)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
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
                /* ── Kanban ── */
                <KanbanOrListaView
                  kanbanGroups={kanbanGroups}
                  onDelete={(id) => deleteMut.mutate(id)}
                  onReagendar={(o) => { setReagendarObj(o); setFechaReagendar(""); setObservacionReagendar(""); }}
                  onDownloadCertificado={handleDownloadCertificado}
                  onOpenRuteoPdf={handleOpenRuteoPdf}
                  onLanzar={(o) => setLanzarObj(o)}
                  filterKanbanPhase={filterKanbanPhase}
                  setFilterKanbanPhase={setFilterKanbanPhase}
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
          userRol={user?.rol}
          isSuperadmin={user?.is_superadmin}
        />
      )}

      {/* Dialog Lanzar objetivo */}
      <LanzarObjetivoDialog
        objetivo={lanzarObj}
        open={!!lanzarObj}
        loading={lanzandoLoading}
        onConfirm={handleLanzarConfirm}
        onCancel={() => setLanzarObj(null)}
      />

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
                <DatePicker
                  value={fechaReagendar}
                  onChange={setFechaReagendar}
                  minDate={new Date().toISOString().split("T")[0]}
                  placeholder="Nueva fecha límite"
                  contentClassName="z-[200]"
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
  kanbanGroups,
  onDelete,
  onReagendar,
  onDownloadCertificado,
  onOpenRuteoPdf,
  onLanzar,
  filterKanbanPhase,
  setFilterKanbanPhase,
}: {
  kanbanGroups: { planificado: Objetivo[]; pendiente: Objetivo[]; en_progreso: Objetivo[]; terminado: Objetivo[] };
  onDelete: (id: string) => void;
  onReagendar: (obj: Objetivo) => void;
  onDownloadCertificado: (obj: Objetivo) => void;
  onOpenRuteoPdf: (obj: Objetivo) => void;
  onLanzar: (obj: Objetivo) => void;
  filterKanbanPhase: 'planificado' | 'pendiente' | 'en_progreso' | 'terminado' | null;
  setFilterKanbanPhase: (phase: 'planificado' | 'pendiente' | 'en_progreso' | 'terminado' | null) => void;
}) {
  const COLUMNS = [
    { key: "planificado" as const, label: "Planificados", Icon: CalendarDays, headerClass: "text-slate-500",              borderClass: "border-t-2 border-t-slate-400" },
    { key: "pendiente" as const,   label: "Pendiente",    Icon: Clock,        headerClass: "text-[var(--shelfy-muted)]",  borderClass: "border-t-2 border-t-slate-300" },
    { key: "en_progreso" as const, label: "En progreso",  Icon: TrendingUp,   headerClass: "text-violet-600",              borderClass: "border-t-2 border-t-violet-500" },
    { key: "terminado" as const,   label: "Terminado",    Icon: CheckCircle2, headerClass: "text-emerald-600",             borderClass: "border-t-2 border-t-emerald-500" },
  ];

  return (
    <div className="flex gap-4 overflow-x-auto pb-3 -mx-1 px-1">
      {COLUMNS.map(col => {
        const isActive = filterKanbanPhase === col.key;
        const isDimmed = filterKanbanPhase !== null && !isActive;
        const isPlanificado = col.key === "planificado";
        return (
        <div
          key={col.key}
          className={`flex-none w-[min(calc(100vw-2rem),320px)] sm:w-[min(calc(50vw-1.5rem),320px)] xl:w-72 rounded-xl border bg-[var(--shelfy-bg)] overflow-hidden transition-opacity duration-200 ${col.borderClass} ${isActive ? "border-[var(--shelfy-accent)]/40" : "border-[var(--shelfy-border)]"} ${isDimmed ? "opacity-50" : "opacity-100"}`}
        >
          <button
            type="button"
            onClick={() => setFilterKanbanPhase(isActive ? null : col.key)}
            className={`w-full px-4 py-3 border-b border-[var(--shelfy-border)] flex items-center justify-between transition-colors ${isActive ? "bg-[var(--shelfy-accent)]/10" : "bg-[var(--shelfy-panel)] hover:bg-[var(--shelfy-accent)]/5"}`}
            title={isActive ? `Quitar filtro "${col.label}"` : `Filtrar por "${col.label}"`}
          >
            <span className={`flex items-center gap-1.5 text-xs font-semibold ${isActive ? "text-[var(--shelfy-accent)]" : col.headerClass}`}>
              <col.Icon className="w-3.5 h-3.5" />
              {col.label}
            </span>
            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full border ${isActive ? "bg-[var(--shelfy-accent)]/10 text-[var(--shelfy-accent)] border-[var(--shelfy-accent)]/30" : "text-[var(--shelfy-muted)] bg-[var(--shelfy-bg)] border-[var(--shelfy-border)]"}`}>
              {kanbanGroups[col.key].length}
            </span>
          </button>
          <div className="p-3 space-y-2 min-h-24">
            {(() => {
              const items = kanbanGroups[col.key];
              const compania = items.filter(o => o.origen === "compania");
              const distribuidora = items.filter(o => o.origen !== "compania");
              if (items.length === 0) {
                return (
                  <p className="text-[11px] text-[var(--shelfy-muted)] text-center py-4 opacity-50">
                    Sin objetivos
                  </p>
                );
              }
              const renderCard = (obj: Objetivo) => (
                <KanbanCard
                  key={obj.id}
                  obj={obj}
                  onDelete={() => onDelete(obj.id)}
                  onReagendar={onReagendar}
                  onDownloadCertificado={onDownloadCertificado}
                  onOpenRuteoPdf={onOpenRuteoPdf}
                  onLanzar={isPlanificado ? onLanzar : undefined}
                />
              );
              return (
                <>
                  {compania.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-amber-600/80 px-1 pt-1">
                        Objetivos de Compañía
                      </p>
                      <AnimatePresence mode="popLayout">
                        {compania.map(renderCard)}
                      </AnimatePresence>
                    </div>
                  )}
                  {compania.length > 0 && distribuidora.length > 0 && (
                    <div className="border-t border-[var(--shelfy-border)]/50 my-2" />
                  )}
                  {distribuidora.length > 0 && (
                    <div className="space-y-2">
                      {compania.length > 0 && (
                        <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--shelfy-muted)]/70 px-1">
                          Objetivos de Distribuidora
                        </p>
                      )}
                      <AnimatePresence mode="popLayout">
                        {distribuidora.map(renderCard)}
                      </AnimatePresence>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
        );
      })}
    </div>
  );
}
