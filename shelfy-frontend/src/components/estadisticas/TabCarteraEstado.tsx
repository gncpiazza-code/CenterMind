"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import {
  Target,
  Star,
  CheckCircle2,
  XCircle,
  Clock,
  Users,
  ShoppingBag,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  UserPlus,
  Camera,
  RefreshCw,
  Phone,
  MapPin,
  UserX,
} from "lucide-react";
import type { VendorDetalle, VendorDetalleCrrCliente } from "@/lib/api";
import { ESTADISTICAS_FIFA } from "@/lib/vendor-card-detalle-theme";
import { formatFechaAR } from "@/lib/estadisticas-utils";

const F = ESTADISTICAS_FIFA;

const containerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 340, damping: 28 } },
};

type CrrListKey = "reactivados" | "perdidos" | "proximos_caer" | "inactivos";

const CRR_LIST_LABELS: Record<CrrListKey, { label: string; color: string; bg: string }> = {
  reactivados: { label: "Reactivados", color: "#10B981", bg: "rgba(16,185,129,0.1)" },
  perdidos: { label: "Perdidos", color: "#EF4444", bg: "rgba(239,68,68,0.1)" },
  proximos_caer: { label: "Próximos a caer", color: "#F59E0B", bg: "rgba(245,158,11,0.12)" },
  inactivos: { label: "Inactivos", color: "#64748B", bg: "rgba(100,116,139,0.12)" },
};

const CRR_TOTAL_BY_KEY: Record<CrrListKey, keyof NonNullable<VendorDetalle["cartera"]>["crr"]> = {
  reactivados: "reactivados",
  perdidos: "perdidos",
  proximos_caer: "proximos_caer",
  inactivos: "inactivos",
};

function StatMini({
  label,
  value,
  icon,
  color,
  bg,
  hint,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  hint?: string;
}) {
  return (
    <div
      title={hint}
      style={{
        borderRadius: 12,
        padding: "10px 12px",
        background: bg,
        border: `1px solid ${color}22`,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 0,
      }}
    >
      <div style={{ color, opacity: 0.9 }}>{icon}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 9, fontWeight: 700, color: "var(--shelfy-muted)", textTransform: "uppercase", letterSpacing: "0.06em", lineHeight: 1.25 }}>
        {label}
      </div>
    </div>
  );
}

function SectionTitle({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
      {icon && <span style={{ color: F.accentDark, marginTop: 1 }}>{icon}</span>}
      <div>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: F.accentDark }}>{title}</p>
        {subtitle && (
          <p style={{ margin: "3px 0 0", fontSize: 10, color: "var(--shelfy-muted)", lineHeight: 1.45 }}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

function CompositionBar({
  soloExhibidos,
  ambos,
  soloCompradores,
}: {
  soloExhibidos: number;
  ambos: number;
  soloCompradores: number;
}) {
  const total = Math.max(soloExhibidos + ambos + soloCompradores, 1);
  const segments = [
    { n: soloExhibidos, color: "#6366F1", label: "Solo exhibidos" },
    { n: ambos, color: F.accent, label: "Exhibidos + compradores" },
    { n: soloCompradores, color: "#10B981", label: "Solo compradores" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", height: 10, borderRadius: 99, overflow: "hidden", background: F.panelBgHover }}>
        {segments.map((s) =>
          s.n > 0 ? (
            <div
              key={s.label}
              title={`${s.label}: ${s.n}`}
              style={{ width: `${(s.n / total) * 100}%`, background: s.color, minWidth: s.n ? 4 : 0 }}
            />
          ) : null,
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {segments.map((s) => (
          <span key={s.label} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--shelfy-muted)", fontWeight: 600 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: s.color, flexShrink: 0 }} />
            {s.label}: {s.n}
          </span>
        ))}
      </div>
    </div>
  );
}

function parseFechaIso(fecha: string | undefined | null): Date | null {
  if (!fecha) return null;
  const iso = fecha.slice(0, 10);
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function diasDesdeFecha(fecha: string | undefined | null, ref = new Date()): number | null {
  const d = parseFechaIso(fecha);
  if (!d) return null;
  const refDay = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const diff = Math.floor((refDay.getTime() - d.getTime()) / 86400000);
  return diff >= 0 ? diff : null;
}

function fmtHaceDias(dias: number | null | undefined): string | null {
  if (dias == null) return null;
  if (dias === 0) return "Hace hoy";
  if (dias === 1) return "Hace 1 día";
  return `Hace ${dias} días`;
}
function fmtDias(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n === 0) return "hoy";
  if (n === 1) return "1 día";
  return `${n} días`;
}

function fmtFechaConAntiguedad(fecha: string | undefined | null, dias: number | null | undefined): string {
  if (!fecha) return "Sin fecha";
  const resolved = dias ?? diasDesdeFecha(fecha);
  const antiguedad = resolved != null ? ` · hace ${fmtDias(resolved)}` : "";
  return `${formatFechaAR(fecha)}${antiguedad}`;
}

function ClienteContacto({ c }: { c: VendorDetalleCrrCliente }) {
  const contacto = c.contacto || c.celular || c.telefono;
  const ruta = c.ruta_nombre;
  const dia = c.dia_visita;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 5 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: contacto ? "var(--shelfy-muted)" : "#94A3B8" }}>
        <Phone size={11} />
        {contacto || "Sin teléfono"}
      </span>
      {ruta ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--shelfy-muted)" }}>
          <MapPin size={11} />
          {ruta}
        </span>
      ) : (
        <span style={{ fontSize: 10, color: "#94A3B8" }}>Sin ruta</span>
      )}
      {dia ? (
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: F.accentDark,
            background: F.panelBg,
            padding: "2px 6px",
            borderRadius: 4,
            border: `1px solid ${F.panelBorderLight}`,
          }}
        >
          {dia}
        </span>
      ) : (
        <span style={{ fontSize: 10, color: "#94A3B8" }}>Sin día</span>
      )}
    </div>
  );
}

function CompraMeta({ c, listKey }: { c: VendorDetalleCrrCliente; listKey: CrrListKey }) {
  const fuc = c.fecha_ultima_compra;
  const fca = c.fecha_compra_anterior;
  const ultEx = c.ultima_exhibicion;
  const diasSin = c.dias_sin_compra ?? diasDesdeFecha(fuc);
  const haceLabel = fmtHaceDias(diasSin);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-end", flexShrink: 0, maxWidth: "52%" }}>
      {c.compro_en_periodo && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "#059669",
            background: "rgba(16,185,129,0.12)",
            padding: "2px 6px",
            borderRadius: 4,
          }}
        >
          Compró en período
        </span>
      )}
      {listKey === "proximos_caer" && c.dias_para_caer != null && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "#B45309",
            background: "rgba(245,158,11,0.16)",
            padding: "2px 6px",
            borderRadius: 4,
          }}
        >
          Cae en {fmtDias(c.dias_para_caer)}
        </span>
      )}
      {listKey === "inactivos" && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "#475569",
            background: "rgba(100,116,139,0.16)",
            padding: "2px 6px",
            borderRadius: 4,
          }}
        >
          Inactivo
        </span>
      )}
      {haceLabel && fuc && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "#334155",
            background: "rgba(148,163,184,0.18)",
            padding: "2px 6px",
            borderRadius: 4,
          }}
        >
          {haceLabel}
        </span>
      )}
      <span style={{ fontSize: 10, color: "var(--shelfy-muted)", textAlign: "right", lineHeight: 1.35 }}>
        Últ. compra: {fuc ? formatFechaAR(fuc) : "Sin compra registrada"}
      </span>
      {fca ? (
        <span style={{ fontSize: 10, color: "var(--shelfy-muted)", textAlign: "right", lineHeight: 1.35 }}>
          Penúltima: {fmtFechaConAntiguedad(fca, c.dias_desde_penultima_compra)}
        </span>
      ) : listKey === "reactivados" ? (
        <span style={{ fontSize: 10, color: "#DC2626", textAlign: "right" }}>
          Sin penúltima compra en DB
        </span>
      ) : null}
      {ultEx && (
        <span style={{ fontSize: 10, color: "#7C3AED", textAlign: "right", fontWeight: 600, lineHeight: 1.35 }}>
          Exhibición: {fmtFechaConAntiguedad(ultEx, c.dias_desde_exhibicion)}
        </span>
      )}
    </div>
  );
}

function ClienteList({
  items,
  emptyLabel,
  listKey,
}: {
  items: VendorDetalleCrrCliente[];
  emptyLabel: string;
  listKey: CrrListKey;
}) {
  if (!items.length) {
    return <p style={{ fontSize: 12, color: "var(--shelfy-muted)", margin: "8px 0 0" }}>{emptyLabel}</p>;
  }

  const hintByList: Partial<Record<CrrListKey, string>> = {
    perdidos: "Activos al inicio del período que quedaron inactivos sin recompra. Fechas con antigüedad respecto al cierre del período.",
    proximos_caer: "Compra activa (<30 días) pero cerca del umbral de inactividad. «Cae en N días» = días restantes antes de quedar inactivo.",
    reactivados: "Solo clientes con compra actual activa y penúltima compra en DB que demuestre inactividad previa (>30 días sin comprar).",
    inactivos: "PDVs de la cartera sin compra en los últimos 30 días o sin fecha de última compra. Ordenados por mayor antigüedad sin comprar.",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
      {hintByList[listKey] && (
        <p style={{ fontSize: 10, color: "var(--shelfy-muted)", margin: 0, lineHeight: 1.45 }}>
          {hintByList[listKey]}
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: listKey === "inactivos" ? 320 : 240, overflowY: "auto", overscrollBehavior: "contain" }}>
        {items.map((c) => (
          <div
            key={c.id_cliente_erp}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 12,
              padding: "8px 10px",
              borderRadius: 10,
              background: listKey === "inactivos" ? "rgba(100,116,139,0.06)" : "white",
              border: `1px solid ${listKey === "inactivos" ? "rgba(100,116,139,0.22)" : F.panelBorderLight}`,
              fontSize: 11,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: "var(--shelfy-text)", wordBreak: "break-word", lineHeight: 1.3 }}>
                {c.razon_social || c.nombre_fantasia || c.id_cliente_erp}
              </div>
              {c.localidad && (
                <div style={{ fontSize: 10, color: "var(--shelfy-muted)", marginTop: 2 }}>{c.localidad}</div>
              )}
              <div style={{ fontSize: 9, color: "var(--shelfy-muted)", fontFamily: "monospace", marginTop: 3 }}>
                {c.id_cliente_erp}
              </div>
              <ClienteContacto c={c} />
            </div>
            <CompraMeta c={c} listKey={listKey} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TabCarteraEstado({ detalle }: { detalle: VendorDetalle }) {
  const [crrList, setCrrList] = useState<CrrListKey>("reactivados");
  const ex = detalle.exhibiciones_resumen;
  const cartera = detalle.cartera;
  const comp = cartera?.composicion;
  const crr = cartera?.crr;

  const exStats = useMemo(
    () => [
      {
        label: "Exhibiciones lógicas",
        value: ex.total_logicas,
        icon: <Target size={15} />,
        color: F.accent,
        bg: F.panelBg,
        hint: "Visitas deduplicadas: máx. 1 por cliente y día (mejor estado gana)",
      },
      {
        label: "Destacadas",
        value: ex.destacadas,
        icon: <Star size={15} />,
        color: "#F59E0B",
        bg: "rgba(245,158,11,0.1)",
        hint: "Exhibiciones lógicas con estado Destacado",
      },
      {
        label: "Aprobadas",
        value: ex.aprobadas,
        icon: <CheckCircle2 size={15} />,
        color: "#10B981",
        bg: "rgba(16,185,129,0.1)",
        hint: "Exhibiciones lógicas aprobadas",
      },
      {
        label: "Pendientes",
        value: ex.pendientes,
        icon: <Clock size={15} />,
        color: "#64748B",
        bg: "rgba(100,116,139,0.1)",
        hint: "Exhibiciones lógicas pendientes de evaluación",
      },
      {
        label: "Rechazadas",
        value: ex.rechazadas,
        icon: <XCircle size={15} />,
        color: "#EF4444",
        bg: "rgba(239,68,68,0.1)",
        hint: "Exhibiciones lógicas rechazadas",
      },
      {
        label: "Puntos ranking",
        value: ex.puntos,
        icon: <Star size={15} />,
        color: F.accentDark,
        bg: F.panelBgHover,
        hint: "Puntos de exhibición para ranking (Destacado 3, Aprobado 2, etc.)",
      },
    ],
    [ex],
  );

  const balancePositive = (crr?.balance ?? 0) >= 0;
  const clientesExhibidos = comp?.total_exhibidos ?? 0;
  const compradoresCartera = comp?.total_compradores ?? detalle.compradores.length;

  const listKeys = Object.keys(CRR_LIST_LABELS) as CrrListKey[];

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <motion.div variants={itemVariants}>
        <SectionTitle
          icon={<Camera size={16} />}
          title="Exhibiciones en el período"
          subtitle="Las métricas de abajo miden fotos de exhibición (visitas lógicas), no compras. Una visita = 1 cliente en 1 día."
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 10 }}>
          {exStats.map((s) => (
            <StatMini key={s.label} {...s} />
          ))}
        </div>
      </motion.div>

      <motion.div
        variants={itemVariants}
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          padding: "12px 14px",
          borderRadius: 12,
          background: F.panelBg,
          border: `1px solid ${F.panelBorderLight}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ShoppingBag size={18} color={F.accent} />
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: F.accentDark }}>{compradoresCartera}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--shelfy-muted)", textTransform: "uppercase", lineHeight: 1.3 }}>
              Compradores en cartera
            </div>
            <div style={{ fontSize: 9, color: "var(--shelfy-muted)", marginTop: 2, lineHeight: 1.35 }}>
              PDVs de tus rutas con al menos 1 compra
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Users size={18} color="#6366F1" />
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#4338CA" }}>{clientesExhibidos}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--shelfy-muted)", textTransform: "uppercase", lineHeight: 1.3 }}>
              Clientes únicos exhibidos
            </div>
            <div style={{ fontSize: 9, color: "var(--shelfy-muted)", marginTop: 2, lineHeight: 1.35 }}>
              Distinto de visitas lógicas ({ex.total_logicas})
            </div>
          </div>
        </div>
      </motion.div>

      {comp && (
        <motion.div variants={itemVariants} style={{ padding: "12px 14px", borderRadius: 12, background: F.panelBg, border: `1px solid ${F.panelBorderLight}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: F.accentDark }}>Composición exhibidos vs compradores</p>
            <span style={{ fontSize: 11, fontWeight: 700, color: F.accent }}>
              Cobertura: {comp.cobertura_exhibicion_pct.toFixed(1)}%
            </span>
          </div>
          <p style={{ margin: "0 0 10px", fontSize: 10, color: "var(--shelfy-muted)", lineHeight: 1.45 }}>
            Solo clientes de tu cartera. {comp.ambos} exhibieron y compraron · {comp.solo_exhibidos} solo exhibieron · {comp.solo_compradores} solo compraron.
          </p>
          <CompositionBar
            soloExhibidos={comp.solo_exhibidos}
            ambos={comp.ambos}
            soloCompradores={comp.solo_compradores}
          />
        </motion.div>
      )}

      {crr && (
        <motion.div variants={itemVariants} style={{ padding: "12px 14px", borderRadius: 12, background: F.panelBg, border: `1px solid ${F.panelBorderLight}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: F.accentDark }}>CRR — Estado de cartera</p>
              <p style={{ margin: "4px 0 0", fontSize: 10, color: "var(--shelfy-muted)", lineHeight: 1.45 }}>
                Balance = (Nuevos + Reactivados) − Perdidos · Reactivados requieren penúltima compra en DB
              </p>
            </div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 10,
                background: balancePositive ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.1)",
                border: `1px solid ${balancePositive ? "rgba(16,185,129,0.35)" : "rgba(239,68,68,0.3)"}`,
              }}
            >
              {balancePositive ? <TrendingUp size={16} color="#10B981" /> : <TrendingDown size={16} color="#EF4444" />}
              <span style={{ fontSize: 18, fontWeight: 900, color: balancePositive ? "#059669" : "#DC2626" }}>
                {crr.balance > 0 ? "+" : ""}{crr.balance}
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--shelfy-muted)" }}>Balance</span>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 8 }}>
            <StatMini label="Nuevos" value={crr.nuevos} icon={<UserPlus size={14} />} color="#6366F1" bg="rgba(99,102,241,0.1)" />
            <StatMini label="Reactivados" value={crr.reactivados} icon={<RefreshCw size={14} />} color="#10B981" bg="rgba(16,185,129,0.1)" hint="Con penúltima compra en DB" />
            <StatMini label="Perdidos" value={crr.perdidos} icon={<TrendingDown size={14} />} color="#EF4444" bg="rgba(239,68,68,0.1)" />
            <StatMini label="Próx. a caer" value={crr.proximos_caer} icon={<AlertTriangle size={14} />} color="#F59E0B" bg="rgba(245,158,11,0.12)" />
            <StatMini label="Inactivos" value={crr.inactivos} icon={<UserX size={14} />} color="#64748B" bg="rgba(100,116,139,0.12)" hint="Sin compra +30d o sin fecha" />
            <StatMini label="Activos" value={crr.activos} icon={<Users size={14} />} color={F.accentDark} bg={F.panelBgHover} hint="Compra en últimos 30 días" />
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
            {listKeys.map((key) => {
              const meta = CRR_LIST_LABELS[key];
              const totalKey = CRR_TOTAL_BY_KEY[key];
              const count = Number(crr[totalKey] ?? 0);
              const active = crrList === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCrrList(key)}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                    border: `1px solid ${active ? meta.color : F.panelBorderLight}`,
                    background: active ? meta.bg : "transparent",
                    color: active ? meta.color : "var(--shelfy-muted)",
                  }}
                >
                  {meta.label} ({count})
                </button>
              );
            })}
          </div>

          <ClienteList
            items={(crr.clientes[crrList] ?? []).filter(
              (c) => crrList !== "reactivados" || Boolean(c.fecha_compra_anterior),
            )}
            listKey={crrList}
            emptyLabel={`Sin clientes en ${CRR_LIST_LABELS[crrList].label.toLowerCase()}`}
          />
        </motion.div>
      )}

      {!cartera && (
        <p style={{ fontSize: 12, color: "var(--shelfy-muted)", textAlign: "center", margin: 0 }}>
          Datos de cartera no disponibles — actualizá el backend
        </p>
      )}
    </motion.div>
  );
}
