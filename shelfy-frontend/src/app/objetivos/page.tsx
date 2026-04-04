"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { useObjetivosStore } from "@/store/useObjetivosStore";
import {
  fetchObjetivos,
  fetchResumenSupervisorObjetivos,
  createObjetivo,
  updateObjetivo,
  deleteObjetivo,
  fetchVendedoresSupervision,
  type Objetivo,
  type ObjetivoCreate,
  type ObjetivoTipo,
  type ResumenVendedorObjetivos,
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
} from "lucide-react";

// ── Tipo / actividad config ───────────────────────────────────────────────────

const TIPO_CONFIG: Record<ObjetivoTipo, { label: string; color: string; bg: string }> = {
  conversion_estado: { label: "Activación", color: "text-blue-400",    bg: "bg-blue-500/15 border-blue-500/25" },
  cobranza:          { label: "Cobranza",   color: "text-orange-400",  bg: "bg-orange-500/15 border-orange-500/25" },
  ruteo_alteo:       { label: "Visita",     color: "text-violet-400",  bg: "bg-violet-500/15 border-violet-500/25" },
  exhibicion:        { label: "Exhibición", color: "text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/25" },
  general:           { label: "General",    color: "text-slate-400",   bg: "bg-slate-500/15 border-slate-500/25" },
};

// Actividades que tienen sentido para el phrase builder (PDV-based)
const ACTIVIDADES_FRASE: { tipo: ObjetivoTipo; label: string }[] = [
  { tipo: "ruteo_alteo",       label: "visitar" },
  { tipo: "exhibicion",        label: "exhibir en" },
  { tipo: "conversion_estado", label: "activar" },
];

const TIEMPO_UNIDADES = [
  { value: "dias",    label: "días" },
  { value: "semanas", label: "semanas" },
  { value: "mes",     label: "el mes" },
];

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
  const color = pct >= 100 ? "bg-emerald-500" : pct >= 50 ? "bg-orange-400" : "bg-red-500";
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
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
      isOverdue ? "text-red-400" : isSoon ? "text-orange-400" : "text-[var(--shelfy-muted)]"
    }`}>
      <Calendar className="w-3 h-3" />
      {formatDate(date)}
      {isOverdue && ` (vencido)`}
      {isSoon && !isOverdue && ` (${days}d)`}
    </span>
  );
}

// ── Phrase rendering ──────────────────────────────────────────────────────────
// Reconstructs the human-readable phrase from stored fields

function ObjetivoPhrase({ obj }: { obj: Objetivo }) {
  const tiempoValor  = obj.estado_inicial;   // e.g. "2"
  const tiempoUnidad = obj.estado_objetivo;  // e.g. "semanas"
  const cantidad     = obj.valor_objetivo;

  // Cobranza: show $cobrado / $meta display
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
        <span className="text-emerald-500 font-medium">
          ${obj.valor_actual.toLocaleString("es-AR")}
        </span>
        {" "}
        <span className="text-[var(--shelfy-muted)]">({pct}%)</span>
      </p>
    );
  }

  // If it has the phrase-builder fields, show the phrase
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

  // Fallback: show description or tipo label
  if (obj.descripcion) {
    return <p className="text-xs text-[var(--shelfy-muted)] leading-snug">{obj.descripcion}</p>;
  }
  return null;
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
    <tr className={`border-b border-[var(--shelfy-border)]/50 transition-colors hover:bg-white/[0.02] ${obj.cumplido ? "opacity-50" : ""}`}>
      <td className="px-4 py-3">
        <button
          onClick={onToggle}
          className={`w-4 h-4 rounded border flex items-center justify-center transition-all shrink-0 ${
            obj.cumplido
              ? "bg-emerald-500 border-emerald-500 text-white"
              : "border-white/20 hover:border-emerald-500/50"
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
          <span className={`text-xs ${obj.cumplido ? "text-emerald-400" : "text-[var(--shelfy-muted)]"}`}>
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
          className="w-6 h-6 flex items-center justify-center rounded text-[var(--shelfy-muted)] hover:text-red-400 hover:bg-red-500/10 transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
}

// ── Kanban card ───────────────────────────────────────────────────────────────

function KanbanCard({ obj, onToggle, onDelete }: {
  obj: Objetivo;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="p-3 rounded-xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] space-y-2 group">
      <div className="flex items-start justify-between gap-2">
        <TipoBadge tipo={obj.tipo} />
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-[var(--shelfy-muted)] hover:text-red-400 transition-all"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        <User className="w-3 h-3 text-[var(--shelfy-muted)] shrink-0" />
        <span className="text-xs font-medium text-[var(--shelfy-text)]">{obj.nombre_vendedor ?? `ID ${obj.id_vendedor}`}</span>
      </div>
      {obj.nombre_pdv && (
        <div className="flex items-center gap-1.5">
          <MapPin className="w-3 h-3 text-[var(--shelfy-muted)] shrink-0" />
          <span className="text-xs text-[var(--shelfy-muted)]">{obj.nombre_pdv}</span>
        </div>
      )}
      <ObjetivoPhrase obj={obj} />
      {obj.valor_objetivo ? (
        <ProgressBar actual={obj.valor_actual} objetivo={obj.valor_objetivo} />
      ) : null}
      <div className="flex items-center justify-between pt-1">
        <DateChip date={obj.fecha_objetivo} />
        <button
          onClick={onToggle}
          className={`text-[10px] px-2 py-0.5 rounded border transition-all ${
            obj.cumplido
              ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
              : "border-white/10 text-[var(--shelfy-muted)] hover:border-emerald-500/30"
          }`}
        >
          {obj.cumplido ? "Completado" : "Marcar listo"}
        </button>
      </div>
    </div>
  );
}

// ── Vista Supervisor — tabla de agregación ────────────────────────────────────

function VendedorResumenRow({ v }: { v: ResumenVendedorObjetivos }) {
  const allCobranza = v.tipos?.length > 0 && v.tipos.every((t: string) => t === "cobranza");
  const unitLabel = allCobranza ? "$" : "PDVs";
  const formatVal = (n: number) =>
    allCobranza ? n.toLocaleString("es-AR") : String(Math.round(n));

  return (
    <tr className="border-b border-[var(--shelfy-border)]/50 hover:bg-white/[0.02] transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-[var(--shelfy-accent)]/15 flex items-center justify-center shrink-0">
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

// ── Modal nuevo objetivo — Phrase Builder ─────────────────────────────────────

interface NuevoObjetivoModalProps {
  distId: number;
  vendedores: { id_vendedor: number; nombre_erp: string }[];
  onClose: () => void;
  onCreate: (data: ObjetivoCreate) => void;
  loading: boolean;
}

type ModoCreacion = "frase" | "libre";

function NuevoObjetivoModal({ distId, vendedores, onClose, onCreate, loading }: NuevoObjetivoModalProps) {
  const [modo, setModo] = useState<ModoCreacion>("frase");

  // Phrase builder state
  const [fraseVendedor, setFraseVendedor] = useState<number | "">("");
  const [fraseActividad, setFraseActividad] = useState<ObjetivoTipo>("ruteo_alteo");
  const [fraseCantidad, setFraseCantidad] = useState<string>("10");
  const [fraseTiempoValor, setFraseTiempoValor] = useState<string>("1");
  const [fraseTiempoUnidad, setFraseTiempoUnidad] = useState<string>("semanas");
  const [fraseFecha, setFraseFecha] = useState<string>("");

  // Free mode state
  const [libreForm, setLibreForm] = useState<Partial<ObjetivoCreate>>({
    id_distribuidor: distId,
    tipo: "general",
  });
  const setL = (k: keyof ObjetivoCreate, v: unknown) =>
    setLibreForm(p => ({ ...p, [k]: v }));

  const nombreVendedorFrase = vendedores.find(v => v.id_vendedor === fraseVendedor)?.nombre_erp ?? "";
  const actividadLabel = ACTIVIDADES_FRASE.find(a => a.tipo === fraseActividad)?.label ?? "hacer algo en";
  const unidadLabel = TIEMPO_UNIDADES.find(u => u.value === fraseTiempoUnidad)?.label ?? fraseTiempoUnidad;

  const handleSubmitFrase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fraseVendedor || !fraseCantidad) return;
    const cantidad = Number(fraseCantidad);
    const descrip = `Debe ${actividadLabel} ${cantidad} PDVs en ${fraseTiempoValor} ${unidadLabel}`;
    onCreate({
      id_distribuidor: distId,
      id_vendedor: Number(fraseVendedor),
      nombre_vendedor: nombreVendedorFrase,
      tipo: fraseActividad,
      descripcion: descrip,
      valor_objetivo: cantidad,
      estado_inicial: fraseTiempoValor,   // tiempo_valor
      estado_objetivo: fraseTiempoUnidad, // tiempo_unidad
      ...(fraseFecha ? { fecha_objetivo: fraseFecha } : {}),
    });
  };

  const handleSubmitLibre = (e: React.FormEvent) => {
    e.preventDefault();
    if (!libreForm.id_vendedor || !libreForm.tipo) return;
    onCreate(libreForm as ObjetivoCreate);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-[var(--shelfy-accent)]" />
            <h2 className="text-sm font-semibold text-[var(--shelfy-text)]">Nuevo objetivo</h2>
          </div>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modo tabs */}
        <div className="flex gap-1 bg-[var(--shelfy-bg)] rounded-lg p-1 mb-5">
          {(["frase", "libre"] as ModoCreacion[]).map(m => (
            <button
              key={m}
              onClick={() => setModo(m)}
              className={`flex-1 py-1.5 text-xs rounded-md transition-all font-medium ${
                modo === m
                  ? "bg-[var(--shelfy-panel)] text-[var(--shelfy-text)] shadow-sm"
                  : "text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"
              }`}
            >
              {m === "frase" ? "Constructor de frase" : "Libre"}
            </button>
          ))}
        </div>

        {modo === "frase" ? (
          /* ── Phrase Builder ── */
          <form onSubmit={handleSubmitFrase} className="space-y-4">
            {/* Preview phrase */}
            <div className="rounded-xl bg-[var(--shelfy-bg)] border border-[var(--shelfy-accent)]/20 p-3">
              <p className="text-[11px] text-[var(--shelfy-muted)] mb-1 uppercase tracking-wider font-medium">
                Objetivo generado
              </p>
              <p className="text-sm text-[var(--shelfy-text)] leading-relaxed">
                <span className="text-[var(--shelfy-accent)] font-semibold">
                  {nombreVendedorFrase || "[ Vendedor ]"}
                </span>
                {" "}debe{" "}
                <span className="text-emerald-500 font-medium">{actividadLabel}</span>
                {" "}
                <span className="text-[var(--shelfy-text)] font-semibold">{fraseCantidad || "?"} PDVs</span>
                {" "}en{" "}
                <span className="text-[var(--shelfy-muted)]">{fraseTiempoValor} {unidadLabel}</span>
              </p>
            </div>

            {/* Vendedor */}
            <div>
              <label className="text-[11px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1.5">
                Vendedor
              </label>
              <div className="relative">
                <select
                  required
                  className="w-full appearance-none bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-3 py-2 text-sm text-[var(--shelfy-text)] focus:outline-none focus:border-[var(--shelfy-accent)]/60"
                  value={fraseVendedor}
                  onChange={e => setFraseVendedor(Number(e.target.value) || "")}
                >
                  <option value="">Seleccionar...</option>
                  {vendedores.map(v => (
                    <option key={v.id_vendedor} value={v.id_vendedor}>{v.nombre_erp}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--shelfy-muted)] pointer-events-none" />
              </div>
            </div>

            {/* Actividad */}
            <div>
              <label className="text-[11px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1.5">
                Actividad
              </label>
              <div className="flex gap-2 flex-wrap">
                {ACTIVIDADES_FRASE.map(a => (
                  <button
                    key={a.tipo}
                    type="button"
                    onClick={() => setFraseActividad(a.tipo)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      fraseActividad === a.tipo
                        ? "border-[var(--shelfy-accent)] bg-[var(--shelfy-accent)]/15 text-[var(--shelfy-accent)]"
                        : "border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"
                    }`}
                  >
                    {TIPO_CONFIG[a.tipo].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Cantidad + Tiempo */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1.5">
                  Cantidad (PDVs)
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  step={1}
                  placeholder="10"
                  className="w-full bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-3 py-2 text-sm text-[var(--shelfy-text)] placeholder-[var(--shelfy-muted)]/60 focus:outline-none focus:border-[var(--shelfy-accent)]/60"
                  value={fraseCantidad}
                  onChange={e => setFraseCantidad(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1.5">
                  Tiempo
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    className="w-16 bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-2 py-2 text-sm text-[var(--shelfy-text)] focus:outline-none focus:border-[var(--shelfy-accent)]/60"
                    value={fraseTiempoValor}
                    onChange={e => setFraseTiempoValor(e.target.value)}
                  />
                  <div className="relative flex-1">
                    <select
                      className="w-full appearance-none bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-2 py-2 text-sm text-[var(--shelfy-text)] focus:outline-none focus:border-[var(--shelfy-accent)]/60"
                      value={fraseTiempoUnidad}
                      onChange={e => setFraseTiempoUnidad(e.target.value)}
                    >
                      {TIEMPO_UNIDADES.map(u => (
                        <option key={u.value} value={u.value}>{u.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--shelfy-muted)] pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>

            {/* Fecha límite */}
            <div>
              <label className="text-[11px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1.5">
                Fecha límite <span className="text-[var(--shelfy-muted)] normal-case">(opcional)</span>
              </label>
              <input
                type="date"
                className="w-full bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-3 py-2 text-sm text-[var(--shelfy-text)] focus:outline-none focus:border-[var(--shelfy-accent)]/60"
                value={fraseFecha}
                onChange={e => setFraseFecha(e.target.value)}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={onClose}
                className="flex-1 py-2 rounded-lg border border-[var(--shelfy-border)] text-sm text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={loading}
                className="flex-1 py-2 rounded-lg bg-[var(--shelfy-accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Crear objetivo
              </button>
            </div>
          </form>
        ) : (
          /* ── Modo libre ── */
          <form onSubmit={handleSubmitLibre} className="space-y-4">
            {/* Vendedor */}
            <div>
              <label className="text-[11px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1.5">Vendedor</label>
              <div className="relative">
                <select required
                  className="w-full appearance-none bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-3 py-2 text-sm text-[var(--shelfy-text)] focus:outline-none focus:border-[var(--shelfy-accent)]/60"
                  value={libreForm.id_vendedor ?? ""}
                  onChange={e => {
                    const v = vendedores.find(x => x.id_vendedor === Number(e.target.value));
                    setL("id_vendedor", Number(e.target.value));
                    if (v) setL("nombre_vendedor", v.nombre_erp);
                  }}>
                  <option value="">Seleccionar...</option>
                  {vendedores.map(v => <option key={v.id_vendedor} value={v.id_vendedor}>{v.nombre_erp}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--shelfy-muted)] pointer-events-none" />
              </div>
            </div>

            {/* Tipo */}
            <div>
              <label className="text-[11px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1.5">Tipo</label>
              <div className="relative">
                <select
                  className="w-full appearance-none bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-3 py-2 text-sm text-[var(--shelfy-text)] focus:outline-none focus:border-[var(--shelfy-accent)]/60"
                  value={libreForm.tipo ?? "general"}
                  onChange={e => setL("tipo", e.target.value as ObjetivoTipo)}>
                  {Object.entries(TIPO_CONFIG).map(([k, cfg]) => <option key={k} value={k}>{cfg.label}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--shelfy-muted)] pointer-events-none" />
              </div>
            </div>

            {/* Descripción */}
            <div>
              <label className="text-[11px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1.5">Descripción</label>
              <textarea rows={2} placeholder="Qué debe lograr el vendedor..."
                className="w-full bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-3 py-2 text-sm text-[var(--shelfy-text)] placeholder-[var(--shelfy-muted)]/60 focus:outline-none focus:border-[var(--shelfy-accent)]/60 resize-none"
                value={libreForm.descripcion ?? ""}
                onChange={e => setL("descripcion", e.target.value || undefined)} />
            </div>

            {/* Valor objetivo */}
            {libreForm.tipo === "cobranza" && (
              <div>
                <label className="text-[11px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1.5">Meta ($)</label>
                <input type="number" min={0} step={0.01} placeholder="0.00"
                  className="w-full bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-3 py-2 text-sm text-[var(--shelfy-text)] placeholder-[var(--shelfy-muted)]/60 focus:outline-none focus:border-[var(--shelfy-accent)]/60"
                  value={libreForm.valor_objetivo ?? ""}
                  onChange={e => setL("valor_objetivo", e.target.value ? Number(e.target.value) : undefined)} />
              </div>
            )}

            {/* Fecha */}
            <div>
              <label className="text-[11px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1.5">
                Fecha límite <span className="text-[var(--shelfy-muted)] normal-case">(opcional)</span>
              </label>
              <input type="date"
                className="w-full bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-3 py-2 text-sm text-[var(--shelfy-text)] focus:outline-none focus:border-[var(--shelfy-accent)]/60"
                value={libreForm.fecha_objetivo ?? ""}
                onChange={e => setL("fecha_objetivo", e.target.value || undefined)} />
            </div>

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={onClose}
                className="flex-1 py-2 rounded-lg border border-[var(--shelfy-border)] text-sm text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={loading}
                className="flex-1 py-2 rounded-lg bg-[var(--shelfy-accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Crear objetivo
              </button>
            </div>
          </form>
        )}
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
      <div className="flex items-center justify-center h-32 text-[var(--shelfy-muted)]">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        <span className="text-sm">Calculando resumen...</span>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-32 text-red-400 gap-2">
        <AlertCircle className="w-4 h-4" />
        <span className="text-sm">Error al cargar el resumen</span>
      </div>
    );
  }

  const { totales, vendedores } = data;

  if (vendedores.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-[var(--shelfy-muted)]">
        <Users className="w-8 h-8 opacity-15 mb-2" />
        <p className="text-sm">No hay objetivos activos para agregar</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Grand total bar */}
      <div className="rounded-xl border border-[var(--shelfy-accent)]/20 bg-[var(--shelfy-accent)]/5 p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-xs text-[var(--shelfy-muted)] uppercase tracking-wider font-medium mb-0.5">
              Meta agregada del equipo
            </p>
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

      {/* Per-vendedor table */}
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

// ── Main page ─────────────────────────────────────────────────────────────────

type PageTab = "objetivos" | "supervisor";

export default function ObjetivosPage() {
  const { user } = useAuth();
  const distId = user?.id_distribuidor ?? 0;
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [pageTab, setPageTab] = useState<PageTab>("objetivos");

  const {
    filterVendedor, filterTipo, filterCumplido, searchText, viewMode,
    setFilterTipo, setFilterCumplido, setSearchText, setViewMode,
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
    queryKey: ["objetivos", distId, filterCumplido, filterTipo, filterVendedor],
    queryFn: () => fetchObjetivos(distId, {
      ...(filterCumplido !== null && { cumplido: filterCumplido }),
      ...(filterTipo && { tipo: filterTipo }),
      ...(filterVendedor && { vendedor_id: filterVendedor }),
    }),
    enabled: !!distId && pageTab === "objetivos",
    staleTime: 30 * 1000,
  });

  const createMut = useMutation({
    mutationFn: createObjetivo,
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

  // Names for client-side sucursal filter
  const vendedorNamesEnSucursal = useMemo(
    () => new Set(vendedoresEnSucursal.map(v => v.nombre_erp.toLowerCase())),
    [vendedoresEnSucursal],
  );

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = objetivos;

    // Text search
    if (searchText) {
      const q = searchText.toLowerCase();
      list = list.filter(o =>
        (o.nombre_vendedor ?? "").toLowerCase().includes(q) ||
        (o.nombre_pdv ?? "").toLowerCase().includes(q) ||
        (o.descripcion ?? "").toLowerCase().includes(q)
      );
    }

    // Sucursal filter (client-side: match nombre_vendedor against vendedores in that sucursal)
    if (selectedSucursal) {
      list = list.filter(o =>
        vendedorNamesEnSucursal.has((o.nombre_vendedor ?? "").toLowerCase())
      );
    }

    // Specific vendedor filter
    if (selectedVendedorId !== null) {
      const target = vendedores.find(v => v.id_vendedor === selectedVendedorId);
      if (target) {
        const name = target.nombre_erp.toLowerCase();
        list = list.filter(o => (o.nombre_vendedor ?? "").toLowerCase() === name);
      }
    }

    return list;
  }, [objetivos, searchText, selectedSucursal, selectedVendedorId, vendedorNamesEnSucursal, vendedores]);

  // ── Stats ─────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const total = objetivos.length;
    const cumplidos = objetivos.filter(o => o.cumplido).length;
    const pendientes = total - cumplidos;
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const completadosSemana = objetivos.filter(o => o.cumplido && o.completed_at && o.completed_at > weekAgo).length;
    const pct = total > 0 ? Math.round((cumplidos / total) * 100) : 0;
    return { total, cumplidos, pendientes, completadosSemana, pct };
  }, [objetivos]);

  // ── Kanban groups ─────────────────────────────────────────────────────────

  const kanbanGroups = useMemo(() => ({
    pendiente:   filtered.filter(o => !o.cumplido && (!o.valor_objetivo || o.valor_actual < o.valor_objetivo)),
    en_progreso: filtered.filter(o => !o.cumplido && o.valor_objetivo && o.valor_actual > 0 && o.valor_actual < o.valor_objetivo),
    completado:  filtered.filter(o => o.cumplido),
  }), [filtered]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="Objetivos" />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6">

          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-xl font-semibold text-[var(--shelfy-text)]">Objetivos</h1>
              <p className="text-sm text-[var(--shelfy-muted)] mt-0.5">
                Seguimiento de metas por vendedor
              </p>
            </div>
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--shelfy-accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              Nuevo objetivo
            </button>
          </div>

          {/* Stats (only on objetivos tab) */}
          {pageTab === "objetivos" && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <StatCard icon={Target}       label="Total"          value={stats.total}             color="bg-white/5" />
              <StatCard icon={Clock}        label="Pendientes"     value={stats.pendientes}         color="bg-orange-500/10 text-orange-400" />
              <StatCard icon={CheckCircle2} label="Esta semana"    value={stats.completadosSemana}  sub="completados" color="bg-emerald-500/10 text-emerald-400" />
              <StatCard icon={TrendingUp}   label="% Cumplimiento" value={`${stats.pct}%`}          sub={`${stats.cumplidos} de ${stats.total}`} color="bg-[var(--shelfy-accent)]/10 text-[var(--shelfy-accent)]" />
            </div>
          )}

          {/* Page tabs */}
          <div className="flex gap-1 bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] rounded-lg p-1 mb-4 w-fit">
            <button
              onClick={() => setPageTab("objetivos")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                pageTab === "objetivos" ? "bg-white/10 text-[var(--shelfy-text)]" : "text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"
              }`}
            >
              <Target className="w-3.5 h-3.5" />
              Por objetivo
            </button>
            <button
              onClick={() => setPageTab("supervisor")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                pageTab === "supervisor" ? "bg-white/10 text-[var(--shelfy-text)]" : "text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Vista supervisor
            </button>
          </div>

          {pageTab === "supervisor" ? (
            <VistaSupervisor distId={distId} />
          ) : (
            <>
              {/* Filtros */}
              <div className="flex flex-wrap gap-2 mb-4">
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

                {/* View toggle */}
                <div className="flex gap-1 bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] rounded-lg p-1">
                  <button
                    onClick={() => setViewMode("lista")}
                    className={`p-1.5 rounded transition-colors ${viewMode === "lista" ? "bg-white/10 text-[var(--shelfy-text)]" : "text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"}`}
                  >
                    <LayoutList className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setViewMode("tablero")}
                    className={`p-1.5 rounded transition-colors ${viewMode === "tablero" ? "bg-white/10 text-[var(--shelfy-text)]" : "text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"}`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Cascading sucursal → vendedor filter */}
              {sucursales.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
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
                      <X className="w-3 h-3" />
                      Limpiar
                    </button>
                  )}
                </div>
              )}

              {/* Content */}
              {isLoading ? (
                <div className="flex items-center justify-center h-48 text-[var(--shelfy-muted)]">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  <span className="text-sm">Cargando objetivos...</span>
                </div>
              ) : isError ? (
                <div className="flex items-center justify-center h-48 text-red-400 gap-2">
                  <AlertCircle className="w-5 h-5" />
                  <span className="text-sm">Error al cargar objetivos</span>
                </div>
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
              ) : viewMode === "lista" ? (
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
                          onToggle={() => toggleMut.mutate({ id: obj.id, cumplido: !obj.cumplido })}
                          onDelete={() => deleteMut.mutate(obj.id)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* ── Tablero Kanban ── */
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { key: "pendiente" as const,   label: "Pendiente",   color: "text-[var(--shelfy-muted)]" },
                    { key: "en_progreso" as const, label: "En progreso", color: "text-orange-400" },
                    { key: "completado" as const,  label: "Completado",  color: "text-emerald-400" },
                  ].map(col => (
                    <div key={col.key} className="rounded-xl border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] overflow-hidden">
                      <div className="px-4 py-3 border-b border-[var(--shelfy-border)] flex items-center justify-between">
                        <span className={`text-xs font-semibold ${col.color}`}>{col.label}</span>
                        <span className="text-xs text-[var(--shelfy-muted)] bg-white/5 px-1.5 py-0.5 rounded">
                          {kanbanGroups[col.key].length}
                        </span>
                      </div>
                      <div className="p-3 space-y-2 min-h-24">
                        {kanbanGroups[col.key].map(obj => (
                          <KanbanCard
                            key={obj.id}
                            obj={obj}
                            onToggle={() => toggleMut.mutate({ id: obj.id, cumplido: !obj.cumplido })}
                            onDelete={() => deleteMut.mutate(obj.id)}
                          />
                        ))}
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
            </>
          )}

        </main>
      </div>
      <BottomNav />

      {/* Modal */}
      {modalOpen && (
        <NuevoObjetivoModal
          distId={distId}
          vendedores={vendedores}
          onClose={() => setModalOpen(false)}
          onCreate={data => createMut.mutate(data)}
          loading={createMut.isPending}
        />
      )}
    </div>
  );
}
