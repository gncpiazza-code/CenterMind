"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchEstadisticasIdeal,
  updateEstadisticasIdeal,
  fetchEstadisticasIdealHistorial,
} from "@/lib/api";
import type {
  VendorIdeal,
  VendorIdealInput,
  KpisMensualesIdeal,
  PesosIdeal,
  IdealHistorialEntry,
} from "@/lib/api";
import { VENDEDOR_IDEAL_HELP } from "@/lib/estadisticas-kpi-help";
import {
  IDEAL_OVR_PESO_LABELS,
  IDEAL_RADAR_META_BOTTOM,
  IDEAL_RADAR_META_TOP,
  type IdealRadarMetaField,
} from "@/lib/ideal-radar-config";
import {
  ChevronDown,
  Loader2,
  Save,
  History,
  Shuffle,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

type SectionKey = "compania" | "distribuidora";
type UserRol = "superadmin" | "directorio" | "admin" | "supervisor" | "evaluador" | string;

interface IdealConfigModalProps {
  open: boolean;
  onClose: () => void;
  distId: number;
  userRol: UserRol;
}

const PESO_KEYS: (keyof PesosIdeal)[] = [
  "pdvs", "altas", "exhibiciones", "compradores", "bultos", "cobertura", "objetivos",
];

const EMPTY_IDEAL_INPUT: VendorIdealInput = {
  meta_pdvs_total: 0,
  kpis_mensuales: {
    exhibiciones: 0,
    pdvs_compradores: 0,
    bultos: 0,
    cobertura_exhibicion_pct: 0,
    cobertura_pct: 0,
    objetivos_pct: 0,
  },
  pesos: { pdvs: 14, altas: 14, exhibiciones: 15, compradores: 14, bultos: 14, cobertura: 15, objetivos: 14 },
};

function normalizeKpisMensuales(km: KpisMensualesIdeal | undefined): KpisMensualesIdeal {
  return {
    exhibiciones: km?.exhibiciones ?? 0,
    pdvs_compradores: km?.pdvs_compradores ?? 0,
    bultos: km?.bultos ?? 0,
    cobertura_exhibicion_pct: km?.cobertura_exhibicion_pct ?? 0,
    cobertura_pct: km?.cobertura_pct ?? 0,
    objetivos_pct: km?.objetivos_pct ?? 0,
  };
}

function canEditSection(section: SectionKey, rol: UserRol): boolean {
  const r = rol?.toLowerCase?.() ?? "";
  if (r === "superadmin") return true;
  if (section === "compania") return r === "directorio";
  return ["admin", "supervisor"].includes(r);
}

function idealToInput(ideal: VendorIdeal | null): VendorIdealInput {
  if (!ideal) return { ...EMPTY_IDEAL_INPUT, kpis_mensuales: { ...EMPTY_IDEAL_INPUT.kpis_mensuales }, pesos: { ...EMPTY_IDEAL_INPUT.pesos } };
  return {
    meta_pdvs_total: ideal.meta_pdvs_total,
    kpis_mensuales: normalizeKpisMensuales(ideal.kpis_mensuales),
    pesos: { ...ideal.pesos },
  };
}

function sumPesos(pesos: PesosIdeal): number {
  return Object.values(pesos).reduce((a, b) => a + b, 0);
}

function repartirPesos(
  pesos: PesosIdeal,
  lockedKeys: Set<keyof PesosIdeal>
): PesosIdeal {
  const lockedSum = PESO_KEYS.filter((k) => lockedKeys.has(k))
    .reduce((a, k) => a + pesos[k], 0);
  const remaining = Math.max(0, 100 - lockedSum);
  const freeKeys = PESO_KEYS.filter((k) => !lockedKeys.has(k));
  if (!freeKeys.length) return pesos;
  const share = Math.floor(remaining / freeKeys.length);
  const extra = remaining - share * freeKeys.length;
  const out = { ...pesos };
  freeKeys.forEach((k, i) => {
    out[k] = share + (i === 0 ? extra : 0);
  });
  return out;
}

export function IdealConfigModal({
  open,
  onClose,
  distId,
  userRol,
}: IdealConfigModalProps) {
  const qc = useQueryClient();
  const [activeSection, setActiveSection] = useState<SectionKey>("distribuidora");
  const [historialOpen, setHistorialOpen] = useState(false);
  const [formComp, setFormComp] = useState<VendorIdealInput>(idealToInput(null));
  const [formDist, setFormDist] = useState<VendorIdealInput>(idealToInput(null));
  const [lockedComp, setLockedComp] = useState<Set<keyof PesosIdeal>>(new Set());
  const [lockedDist, setLockedDist] = useState<Set<keyof PesosIdeal>>(new Set());
  const [saved, setSaved] = useState(false);

  // Fetch ideals
  const { data: idealComp, isLoading: loadComp } = useQuery({
    queryKey: ["ideal", "compania"],
    queryFn: () => fetchEstadisticasIdeal("compania"),
    enabled: open,
  });
  const { data: idealDist, isLoading: loadDist } = useQuery({
    queryKey: ["ideal", distId],
    queryFn: () => fetchEstadisticasIdeal(distId),
    enabled: open && !!distId,
  });

  // Sync form when data loads
  useEffect(() => { if (idealComp !== undefined) setFormComp(idealToInput(idealComp ?? null)); }, [idealComp]);
  useEffect(() => { if (idealDist !== undefined) setFormDist(idealToInput(idealDist ?? null)); }, [idealDist]);

  // Historial
  const activeIdeal = activeSection === "compania" ? idealComp : idealDist;
  const { data: historial } = useQuery({
    queryKey: ["ideal-historial", activeIdeal?.id],
    queryFn: () => fetchEstadisticasIdealHistorial(activeIdeal!.id),
    enabled: historialOpen && !!activeIdeal?.id,
  });

  // Mutations
  const mutation = useMutation({
    mutationFn: ({ scope, body }: { scope: number | "compania"; body: VendorIdealInput }) =>
      updateEstadisticasIdeal(scope, body),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["ideal"] });
      qc.invalidateQueries({ queryKey: ["bundle", "estadisticas"] });
      if (data.origen === "compania") setFormComp(idealToInput(data));
      else setFormDist(idealToInput(data));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const handleSave = () => {
    const scope = activeSection === "compania" ? ("compania" as const) : distId;
    const form  = activeSection === "compania" ? formComp : formDist;
    mutation.mutate({ scope, body: form });
  };

  const form    = activeSection === "compania" ? formComp : formDist;
  const setForm = activeSection === "compania" ? setFormComp : setFormDist;
  const locked  = activeSection === "compania" ? lockedComp : lockedDist;
  const setLocked = activeSection === "compania" ? setLockedComp : setLockedDist;
  const canEdit = canEditSection(activeSection, userRol);
  const pesoSum = sumPesos(form.pesos);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        style={{
          maxWidth: 720,
          borderRadius: 18,
          border: "1px solid rgba(168,85,247,0.18)",
          overflow: "hidden",
          padding: 0,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px 16px",
            borderBottom: "1px solid rgba(168,85,247,0.1)",
            background: "linear-gradient(135deg, #faf5ff 0%, white 100%)",
          }}
        >
          <DialogHeader>
            <DialogTitle
              style={{ fontSize: 18, fontWeight: 800, color: "var(--shelfy-text)" }}
            >
              Configurar Vendedor Ideal
            </DialogTitle>
            <DialogDescription
              style={{ fontSize: 12, lineHeight: 1.5, color: "var(--shelfy-muted)", marginTop: 6 }}
            >
              {VENDEDOR_IDEAL_HELP}
            </DialogDescription>
          </DialogHeader>

          {/* Section tabs */}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            {(["distribuidora", "compania"] as SectionKey[]).map((s) => (
              <button
                key={s}
                onClick={() => setActiveSection(s)}
                style={{
                  padding: "6px 16px", borderRadius: 8,
                  fontSize: 13, fontWeight: 700, cursor: "pointer",
                  border: `1px solid ${activeSection === s ? "#a855f7" : "rgba(168,85,247,0.2)"}`,
                  background: activeSection === s ? "#a855f7" : "transparent",
                  color: activeSection === s ? "white" : "#7C3AED",
                  transition: "all 0.15s ease",
                }}
              >
                {s === "compania" ? "Compañía" : "Distribuidora"}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px", maxHeight: "60vh", overflowY: "auto" }}>
          {(activeSection === "compania" ? loadComp : loadDist) ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
              <Loader2 size={24} style={{ color: "#a855f7", animation: "spin 1s linear infinite" }} />
            </div>
          ) : (
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              style={{ display: "flex", flexDirection: "column", gap: 24 }}
            >
              {!canEdit && (
                <div
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "10px 14px", borderRadius: 10,
                    background: "rgba(100,116,139,0.08)",
                    border: "1px solid rgba(100,116,139,0.15)",
                    fontSize: 12, color: "var(--shelfy-muted)",
                  }}
                >
                  <AlertCircle size={14} />
                  Vista de solo lectura — no tienes permisos para editar esta sección
                </div>
              )}

              {/* Metas radar expandido (6 KPIs) */}
              <FormSection
                title="Metas del radar expandido"
                subtitle="Mismos 6 KPIs del sidebar: fila superior (PDVs · Exhibiciones · % exhibida) y fila inferior (Compradores · Cobertura compra · Bultos)."
              >
                <RadarMetaGrid
                  title="Fila superior"
                  fields={IDEAL_RADAR_META_TOP}
                  form={form}
                  setForm={setForm}
                  canEdit={canEdit}
                />
                <RadarMetaGrid
                  title="Fila inferior"
                  fields={IDEAL_RADAR_META_BOTTOM}
                  form={form}
                  setForm={setForm}
                  canEdit={canEdit}
                  style={{ marginTop: 14 }}
                />
              </FormSection>

              {/* Score OVR */}
              <FormSection
                title="Score OVR (tarjeta FIFA)"
                subtitle="Metas y pesos adicionales del puntaje global. Altas se calculan como faltante hacia la meta de PDVs."
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                  <label style={labelStyle}>Objetivos cumplidos %</label>
                  <PercentInput
                    value={form.kpis_mensuales.objetivos_pct}
                    disabled={!canEdit}
                    onChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        kpis_mensuales: { ...f.kpis_mensuales, objetivos_pct: v },
                      }))
                    }
                  />
                </div>
              </FormSection>

              {/* Pesos OVR */}
              <FormSection title="Pesos del score OVR">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span
                    style={{
                      fontSize: 12, fontWeight: 700,
                      color: Math.abs(pesoSum - 100) < 1 ? "#10B981" : "#EF4444",
                    }}
                  >
                    Suma: {pesoSum} / 100
                  </span>
                  {canEdit && (
                    <button
                      onClick={() => setForm((f) => ({ ...f, pesos: repartirPesos(f.pesos, locked) }))}
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        padding: "5px 12px", borderRadius: 7,
                        fontSize: 12, fontWeight: 600, color: "#7C3AED",
                        background: "rgba(168,85,247,0.08)",
                        border: "1px solid rgba(168,85,247,0.2)",
                        cursor: "pointer",
                      }}
                    >
                      <Shuffle size={12} />
                      Repartir pesos
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {PESO_KEYS.map((k) => (
                    <div key={k} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <label style={labelStyle}>{IDEAL_OVR_PESO_LABELS[k] ?? k}</label>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#7C3AED", minWidth: 28, textAlign: "right" }}>
                            {form.pesos[k]}
                          </span>
                          {canEdit && (
                            <button
                              onClick={() =>
                                setLocked((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(k)) next.delete(k); else next.add(k);
                                  return next;
                                })
                              }
                              title={locked.has(k) ? "Desbloquear" : "Bloquear"}
                              style={{
                                width: 20, height: 20, borderRadius: 4,
                                border: `1px solid ${locked.has(k) ? "#a855f7" : "rgba(100,116,139,0.3)"}`,
                                background: locked.has(k) ? "rgba(168,85,247,0.12)" : "transparent",
                                cursor: "pointer", fontSize: 10,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                color: locked.has(k) ? "#a855f7" : "var(--shelfy-muted)",
                              }}
                            >
                              {locked.has(k) ? "🔒" : "🔓"}
                            </button>
                          )}
                        </div>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={form.pesos[k]}
                        disabled={!canEdit}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, pesos: { ...f.pesos, [k]: Number(e.target.value) } }))
                        }
                        style={{
                          width: "100%", accentColor: "#a855f7",
                          cursor: canEdit ? "pointer" : "default",
                          opacity: canEdit ? 1 : 0.5,
                        }}
                      />
                    </div>
                  ))}
                </div>
              </FormSection>
            </motion.div>
          )}

          {/* Historial accordion */}
          <div style={{ marginTop: 24 }}>
            <button
              onClick={() => setHistorialOpen((v) => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                fontSize: 12, fontWeight: 700, color: "var(--shelfy-muted)",
                background: "none", border: "none", cursor: "pointer",
              }}
            >
              <History size={13} />
              Historial de cambios
              <ChevronDown
                size={13}
                style={{
                  transform: historialOpen ? "rotate(180deg)" : "rotate(0)",
                  transition: "transform 0.18s",
                }}
              />
            </button>
            <AnimatePresence>
              {historialOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22 }}
                  style={{ overflow: "hidden" }}
                >
                  <div style={{ paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                    {!historial ? (
                      <p style={{ fontSize: 12, color: "var(--shelfy-muted)", margin: 0 }}>Cargando…</p>
                    ) : historial.length === 0 ? (
                      <p style={{ fontSize: 12, color: "var(--shelfy-muted)", margin: 0 }}>Sin cambios registrados</p>
                    ) : (
                      historial.slice(0, 10).map((h) => (
                        <HistorialRow key={h.id} entry={h} />
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Footer */}
        {canEdit && (
          <div
            style={{
              padding: "14px 24px",
              borderTop: "1px solid rgba(168,85,247,0.1)",
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              background: "white",
            }}
          >
            <button
              onClick={onClose}
              style={{
                padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: "1px solid rgba(100,116,139,0.25)", background: "transparent",
                color: "var(--shelfy-muted)", cursor: "pointer",
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={mutation.isPending || Math.abs(pesoSum - 100) > 1}
              style={{
                padding: "8px 20px", borderRadius: 8, fontSize: 13, fontWeight: 700,
                border: "none",
                background: saved ? "#10B981" : "linear-gradient(135deg, #a855f7 0%, #7C3AED 100%)",
                color: "white", cursor: mutation.isPending ? "wait" : "pointer",
                display: "flex", alignItems: "center", gap: 6,
                opacity: Math.abs(pesoSum - 100) > 1 ? 0.55 : 1,
                transition: "background 0.2s ease",
              }}
            >
              {mutation.isPending ? (
                <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
              ) : saved ? (
                <CheckCircle2 size={14} />
              ) : (
                <Save size={14} />
              )}
              {saved ? "Guardado" : "Guardar"}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FormSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p
        style={{
          fontSize: 10, fontWeight: 700, color: "var(--shelfy-muted)",
          textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 4px",
        }}
      >
        {title}
      </p>
      {subtitle && (
        <p style={{ fontSize: 11, color: "var(--shelfy-muted)", margin: "0 0 12px", lineHeight: 1.45 }}>
          {subtitle}
        </p>
      )}
      {!subtitle && <div style={{ marginBottom: 12 }} />}
      {children}
    </div>
  );
}

function RadarMetaGrid({
  title,
  fields,
  form,
  setForm,
  canEdit,
  style,
}: {
  title: string;
  fields: IdealRadarMetaField[];
  form: VendorIdealInput;
  setForm: React.Dispatch<React.SetStateAction<VendorIdealInput>>;
  canEdit: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div style={style}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "#7C3AED", margin: "0 0 8px" }}>{title}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
        {fields.map((field) => (
          <RadarMetaCell key={field.key} field={field} form={form} setForm={setForm} canEdit={canEdit} />
        ))}
      </div>
    </div>
  );
}

function RadarMetaCell({
  field,
  form,
  setForm,
  canEdit,
}: {
  field: IdealRadarMetaField;
  form: VendorIdealInput;
  setForm: React.Dispatch<React.SetStateAction<VendorIdealInput>>;
  canEdit: boolean;
}) {
  const value = field.root
    ? form.meta_pdvs_total
    : form.kpis_mensuales[field.key as keyof KpisMensualesIdeal];

  const onChange = (n: number) => {
    if (field.root) {
      setForm((f) => ({ ...f, meta_pdvs_total: n }));
      return;
    }
    const k = field.key as keyof KpisMensualesIdeal;
    setForm((f) => ({
      ...f,
      kpis_mensuales: { ...f.kpis_mensuales, [k]: n },
    }));
  };

  return (
    <div
      title={field.hint}
      style={{
        padding: "10px 10px",
        borderRadius: 10,
        border: "1px solid rgba(168,85,247,0.15)",
        background: "rgba(168,85,247,0.04)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minWidth: 0,
      }}
    >
      <label style={{ ...labelStyle, minWidth: 0, fontSize: 10, lineHeight: 1.3 }}>
        {field.label}
      </label>
      {field.isPercent ? (
        <PercentInput value={Number(value)} disabled={!canEdit} onChange={onChange} />
      ) : (
        <input
          type="number"
          min={0}
          value={Number(value)}
          disabled={!canEdit}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ ...inputStyle(!canEdit), width: "100%" }}
        />
      )}
      {field.monthly && (
        <span style={{ fontSize: 9, color: "var(--shelfy-muted)" }}>× meses del período</span>
      )}
    </div>
  );
}

function PercentInput({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <input
        type="number"
        min={0}
        max={100}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Math.min(100, Math.max(0, Number(e.target.value))))}
        style={{ ...inputStyle(disabled), width: "100%", flex: 1 }}
      />
      <span style={{ fontSize: 12, fontWeight: 700, color: "#7C3AED" }}>%</span>
    </div>
  );
}

function HistorialRow({ entry }: { entry: IdealHistorialEntry }) {
  const date = new Date(entry.created_at).toLocaleDateString("es-AR", {
    day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  const diffKeys = Object.keys(entry.diff);
  return (
    <div
      style={{
        padding: "8px 12px", borderRadius: 8,
        border: "1px solid rgba(168,85,247,0.1)",
        background: "rgba(168,85,247,0.03)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--shelfy-text)" }}>{entry.updated_by_nombre}</span>
        <span style={{ fontSize: 10, color: "var(--shelfy-muted)" }}>{date}</span>
      </div>
      <span style={{ fontSize: 10, color: "var(--shelfy-muted)" }}>
        {entry.updated_by_rol} · {diffKeys.length} campo{diffKeys.length !== 1 ? "s" : ""} modificado{diffKeys.length !== 1 ? "s" : ""}
      </span>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: "var(--shelfy-muted)",
  minWidth: 160, flexShrink: 0,
};

const inputStyle = (disabled: boolean): React.CSSProperties => ({
  padding: "6px 10px", borderRadius: 7, fontSize: 13, fontWeight: 600,
  border: "1px solid rgba(168,85,247,0.2)",
  background: disabled ? "rgba(100,116,139,0.06)" : "white",
  color: "var(--shelfy-text)",
  outline: "none", width: 120, textAlign: "right",
  opacity: disabled ? 0.7 : 1,
  cursor: disabled ? "default" : "auto",
});
