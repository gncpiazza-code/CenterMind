"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import type { Variants } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  X,
  ChevronLeft,
  ChevronRight,
  MapPin,
  ShoppingBag,
  Star,
  Users,
  Package,
  Target,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Loader2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Cell,
} from "recharts";
import { fetchEstadisticasVendedorDetalle } from "@/lib/api";
import type { VendorCartaResumen, VendorDetalle } from "@/lib/api";
import { VendorCardRadar } from "./VendorCardRadar";
import { useEstadisticasStore } from "@/store/useEstadisticasStore";
import { KpiHelpTip } from "./KpiHelpTip";
import {
  ESTADISTICAS_KPI_HELP,
  VENDEDOR_IDEAL_HELP,
  OVERLAY_IDEAL_HELP,
  OVERLAY_MODE_HELP,
} from "@/lib/estadisticas-kpi-help";

type TabKey = "pdvs" | "altas" | "exhibiciones" | "bultos" | "compradores";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "pdvs",          label: "PDVs",         icon: <MapPin size={13} /> },
  { key: "altas",         label: "Altas",        icon: <Star size={13} /> },
  { key: "exhibiciones",  label: "Exhibiciones", icon: <ShoppingBag size={13} /> },
  { key: "bultos",        label: "Bultos",       icon: <Package size={13} /> },
  { key: "compradores",   label: "Compradores",  icon: <Users size={13} /> },
];

const containerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show:   { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 340, damping: 28 } },
};

function CountUp({ target, duration = 1.2 }: { target: number; duration?: number }) {
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 80, damping: 18 });
  const display = useTransform(spring, (v) => String(Math.round(v)));
  const [val, setVal] = useState("0");

  useEffect(() => {
    mv.set(target);
    const unsub = display.on("change", setVal);
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return <span>{val}</span>;
}

interface VendorCardExpandedProps {
  vendor: VendorCartaResumen;
  vendors: VendorCartaResumen[];
  distId: number;
  meses: string[];
  onClose: () => void;
}

export function VendorCardExpanded({
  vendor,
  vendors,
  distId,
  meses,
  onClose,
}: VendorCardExpandedProps) {
  const { overlayMode, setActiveVendorId } = useEstadisticasStore();
  const [activeTab, setActiveTab] = useState<TabKey>("pdvs");
  const [searchCompradores, setSearchCompradores] = useState("");
  const backdropRef = useRef<HTMLDivElement>(null);

  const vendorIdx = vendors.findIndex((v) => v.id_vendedor === vendor.id_vendedor);
  const prevVendor = vendors[vendorIdx - 1] ?? null;
  const nextVendor = vendors[vendorIdx + 1] ?? null;

  const { data: detalle, isLoading, isError, refetch } = useQuery({
    queryKey: ["estadisticas-detalle", distId, vendor.id_vendedor, meses],
    queryFn: () => fetchEstadisticasVendedorDetalle(distId, vendor.id_vendedor, meses),
    enabled: !!vendor,
    staleTime: 1000 * 60 * 5,
  });

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => { if (e.target === backdropRef.current) onClose(); },
    [onClose]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && prevVendor) setActiveVendorId(prevVendor.id_vendedor);
      if (e.key === "ArrowRight" && nextVendor) setActiveVendorId(nextVendor.id_vendedor);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, prevVendor, nextVendor, setActiveVendorId]);

  const scoreColor =
    vendor.score >= 80 ? "#10B981" : vendor.score >= 50 ? "#F59E0B" : "#EF4444";

  const filteredCompradores =
    detalle?.compradores.filter(
      (c) =>
        !searchCompradores ||
        c.razon_social.toLowerCase().includes(searchCompradores.toLowerCase()) ||
        c.id_cliente_erp.toLowerCase().includes(searchCompradores.toLowerCase())
    ) ?? [];

  return (
    <>
      {/* Backdrop */}
      <motion.div
        ref={backdropRef}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={handleBackdropClick}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15,23,42,0.65)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          zIndex: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
        }}
      >
        {/* Card */}
        <motion.div
          layoutId={`vendor-card-${vendor.id_vendedor}`}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          style={{
            width: "min(90vw, 860px)",
            maxHeight: "88vh",
            borderRadius: 20,
            overflow: "hidden",
            background: "white",
            boxShadow:
              "0 24px 64px rgba(168,85,247,0.25), 0 4px 16px rgba(0,0,0,0.12)",
            display: "flex",
            flexDirection: "column",
            zIndex: 201,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top gradient bar */}
          <div
            style={{
              height: 6,
              background: "linear-gradient(90deg, #a855f7 0%, #7C3AED 50%, #5B21B6 100%)",
              flexShrink: 0,
            }}
          />

          {/* Main layout */}
          <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
            {/* Left column */}
            <div
              style={{
                width: 260,
                flexShrink: 0,
                padding: "20px 16px 20px 20px",
                borderRight: "1px solid rgba(168,85,247,0.12)",
                background: "linear-gradient(180deg, #faf5ff 0%, white 100%)",
                display: "flex",
                flexDirection: "column",
                gap: 16,
                overflowY: "auto",
              }}
            >
              {/* Score */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    background: scoreColor,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: `0 4px 16px ${scoreColor}55`,
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: 20, fontWeight: 900, color: "white" }}>
                    <CountUp target={Math.round(vendor.score)} />
                  </span>
                </div>
                <div>
                  <p style={{ fontSize: 9, fontWeight: 700, color: "var(--shelfy-muted)", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>Score</p>
                  <p style={{ fontSize: 18, fontWeight: 800, color: "var(--shelfy-text)", margin: 0, lineHeight: 1.2 }}>
                    {vendor.nombre}
                  </p>
                  {vendor.sucursal && (
                    <p style={{ fontSize: 11, color: "var(--shelfy-muted)", margin: "2px 0 0", fontWeight: 500 }}>
                      {vendor.sucursal}
                    </p>
                  )}
                </div>
              </div>

              {/* Radar */}
              <VendorCardRadar
                radar={vendor.radar}
                radarCompania={vendor.radar_ideal_compania}
                radarDist={vendor.radar_ideal_dist}
                size="lg"
                showOverlayCompania={overlayMode === "compania" || overlayMode === "ambos"}
                showOverlayDist={overlayMode === "distribuidor" || overlayMode === "ambos"}
              />

              {/* Overlay toggles */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <p style={{ fontSize: 9, fontWeight: 700, color: "var(--shelfy-muted)", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>
                    Overlay ideal
                  </p>
                  <KpiHelpTip text={OVERLAY_IDEAL_HELP} side="top" size={12} />
                </div>
                <div
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: "rgba(168,85,247,0.06)",
                    border: "1px solid rgba(168,85,247,0.12)",
                    fontSize: 10,
                    lineHeight: 1.45,
                    color: "var(--shelfy-muted)",
                  }}
                >
                  <span style={{ fontWeight: 700, color: "#7C3AED" }}>Vendedor ideal: </span>
                  {VENDEDOR_IDEAL_HELP}
                </div>
                <OverlayToggle />
              </div>

              {/* Raw KPIs */}
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="show"
                style={{ display: "flex", flexDirection: "column", gap: 8 }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <p style={{ fontSize: 9, fontWeight: 700, color: "var(--shelfy-muted)", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>
                    KPIs
                  </p>
                  <KpiHelpTip
                    text="Valores reales del vendedor en el período. Pasá el cursor sobre cada ícono para ver qué mide."
                    side="top"
                    size={12}
                  />
                </div>
                {ESTADISTICAS_KPI_HELP.map(({ key, label, description }) => {
                  const raw = vendor.raw_kpis;
                  const value =
                    key === "cobertura"
                      ? `${raw.cobertura_pct.toFixed(1)}%`
                      : key === "objetivos"
                        ? `${raw.objetivos_pct.toFixed(1)}%`
                        : raw[key];
                  return (
                    <motion.div
                      key={key}
                      variants={itemVariants}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 11,
                          color: "var(--shelfy-muted)",
                        }}
                      >
                        {label}
                        <KpiHelpTip text={description} side="right" size={11} />
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--shelfy-text)" }}>{value}</span>
                    </motion.div>
                  );
                })}
              </motion.div>
            </div>

            {/* Right column */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
              {/* Tab bar */}
              <div
                style={{
                  display: "flex",
                  borderBottom: "1px solid rgba(168,85,247,0.12)",
                  padding: "0 20px",
                  flexShrink: 0,
                  background: "white",
                }}
              >
                {TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "12px 14px",
                      fontSize: 12,
                      fontWeight: activeTab === tab.key ? 700 : 500,
                      color: activeTab === tab.key ? "#a855f7" : "var(--shelfy-muted)",
                      borderBottom: activeTab === tab.key ? "2px solid #a855f7" : "2px solid transparent",
                      background: "none",
                      border: "none",
                      borderBottomWidth: 2,
                      borderBottomStyle: "solid",
                      borderBottomColor: activeTab === tab.key ? "#a855f7" : "transparent",
                      cursor: "pointer",
                      transition: "all 0.18s ease",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
                {isLoading ? (
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 200 }}>
                    <Loader2 size={28} className="animate-spin" style={{ color: "#a855f7" }} />
                  </div>
                ) : isError ? (
                  <div style={{ textAlign: "center", padding: "48px 16px" }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: "var(--shelfy-text)", margin: "0 0 8px" }}>
                      No se pudo cargar el detalle
                    </p>
                    <button
                      type="button"
                      onClick={() => refetch()}
                      style={{
                        padding: "8px 16px",
                        borderRadius: 8,
                        border: "1px solid rgba(168,85,247,0.3)",
                        background: "rgba(168,85,247,0.08)",
                        color: "#7C3AED",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Reintentar
                    </button>
                  </div>
                ) : (
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={activeTab}
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      transition={{ duration: 0.18 }}
                    >
                      {activeTab === "pdvs" && detalle && (
                        <TabPDVs detalle={detalle} />
                      )}
                      {activeTab === "altas" && detalle && (
                        <TabAltas detalle={detalle} />
                      )}
                      {activeTab === "exhibiciones" && detalle && (
                        <TabExhibiciones detalle={detalle} />
                      )}
                      {activeTab === "bultos" && detalle && (
                        <TabBultos detalle={detalle} />
                      )}
                      {activeTab === "compradores" && detalle && (
                        <TabCompradores
                          detalle={detalle}
                          search={searchCompradores}
                          setSearch={setSearchCompradores}
                          filtered={filteredCompradores}
                        />
                      )}
                    </motion.div>
                  </AnimatePresence>
                )}
              </div>
            </div>
          </div>

          {/* Footer nav */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 20px",
              borderTop: "1px solid rgba(168,85,247,0.1)",
              background: "#faf5ff",
              flexShrink: 0,
            }}
          >
            <button
              onClick={() => prevVendor && setActiveVendorId(prevVendor.id_vendedor)}
              disabled={!prevVendor}
              style={{
                display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
                color: prevVendor ? "#a855f7" : "var(--shelfy-muted)",
                background: "none", border: "none", cursor: prevVendor ? "pointer" : "default",
                opacity: prevVendor ? 1 : 0.4,
              }}
            >
              <ChevronLeft size={16} />
              {prevVendor?.nombre ?? "Anterior"}
            </button>
            <button
              onClick={onClose}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "6px 14px", borderRadius: 8,
                background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.2)",
                fontSize: 12, fontWeight: 600, color: "#a855f7", cursor: "pointer",
              }}
            >
              <X size={14} />
              Cerrar
            </button>
            <button
              onClick={() => nextVendor && setActiveVendorId(nextVendor.id_vendedor)}
              disabled={!nextVendor}
              style={{
                display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
                color: nextVendor ? "#a855f7" : "var(--shelfy-muted)",
                background: "none", border: "none", cursor: nextVendor ? "pointer" : "default",
                opacity: nextVendor ? 1 : 0.4,
              }}
            >
              {nextVendor?.nombre ?? "Siguiente"}
              <ChevronRight size={16} />
            </button>
          </div>
        </motion.div>
      </motion.div>
    </>
  );
}

// ── Overlay toggle ────────────────────────────────────────────────────────────

function OverlayToggle() {
  const { overlayMode, setOverlayMode } = useEstadisticasStore();

  const options: { label: string; value: "none" | "compania" | "distribuidor" | "ambos"; color: string }[] = [
    { label: "Ninguno",      value: "none",        color: "#64748B" },
    { label: "Compañía",     value: "compania",    color: "#F59E0B" },
    { label: "Distribuidora",value: "distribuidor",color: "#7C3AED" },
    { label: "Ambos",        value: "ambos",       color: "#a855f7" },
  ];

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setOverlayMode(opt.value)}
          title={OVERLAY_MODE_HELP[opt.value]}
          style={{
            padding: "3px 8px",
            borderRadius: 6,
            fontSize: 10,
            fontWeight: 600,
            cursor: "pointer",
            border: `1px solid ${opt.color}`,
            background: overlayMode === opt.value ? opt.color : "transparent",
            color: overlayMode === opt.value ? "white" : opt.color,
            transition: "all 0.15s ease",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Tab components ────────────────────────────────────────────────────────────

function TabPDVs({ detalle }: { detalle: VendorDetalle }) {
  if (!detalle.rutas.length) {
    return (
      <p style={{ color: "var(--shelfy-muted)", fontSize: 13, textAlign: "center", marginTop: 32 }}>
        Sin rutas asignadas
      </p>
    );
  }
  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ fontSize: 11, color: "var(--shelfy-muted)", margin: "0 0 8px" }}>
        {detalle.rutas.length} ruta{detalle.rutas.length !== 1 ? "s" : ""}
      </p>
      {detalle.rutas.map((r) => (
        <motion.div
          key={r.id_ruta}
          variants={itemVariants}
          style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "8px 12px", borderRadius: 10,
            background: "rgba(168,85,247,0.05)",
            border: "1px solid rgba(168,85,247,0.1)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <MapPin size={14} color="#a855f7" />
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--shelfy-text)" }}>{r.nombre}</span>
          </div>
          <span
            style={{
              fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
              background: "rgba(168,85,247,0.12)", color: "#7C3AED",
            }}
          >
            {r.dia}
          </span>
        </motion.div>
      ))}
    </motion.div>
  );
}

function TabAltas({ detalle }: { detalle: VendorDetalle }) {
  if (!detalle.altas.length) {
    return (
      <p style={{ color: "var(--shelfy-muted)", fontSize: 13, textAlign: "center", marginTop: 32 }}>
        Sin altas en el período
      </p>
    );
  }
  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show">
      <p style={{ fontSize: 11, color: "var(--shelfy-muted)", margin: "0 0 12px" }}>
        {detalle.altas.length} alta{detalle.altas.length !== 1 ? "s" : ""}
      </p>
      <div
        style={{
          overflowX: "auto",
          borderRadius: 10,
          border: "1px solid rgba(168,85,247,0.1)",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "rgba(168,85,247,0.06)" }}>
              {["Fecha", "Razón Social", "ID ERP", "Localidad"].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "8px 12px", textAlign: "left",
                    fontWeight: 700, color: "var(--shelfy-muted)",
                    fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {detalle.altas.map((a, i) => (
              <motion.tr
                key={i}
                variants={itemVariants}
                style={{
                  borderTop: "1px solid rgba(168,85,247,0.06)",
                }}
              >
                <td style={{ padding: "7px 12px", color: "var(--shelfy-muted)", whiteSpace: "nowrap" }}>
                  {a.fecha_alta?.slice(0, 10) ?? "-"}
                </td>
                <td style={{ padding: "7px 12px", fontWeight: 600, color: "var(--shelfy-text)" }}>
                  {a.razon_social || a.nombre_fantasia || "-"}
                </td>
                <td style={{ padding: "7px 12px", color: "var(--shelfy-muted)", fontFamily: "monospace", fontSize: 11 }}>
                  {a.id_cliente_erp}
                </td>
                <td style={{ padding: "7px 12px", color: "var(--shelfy-muted)" }}>
                  {a.localidad ?? "-"}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}

function TabExhibiciones({ detalle }: { detalle: VendorDetalle }) {
  const r = detalle.exhibiciones_resumen;
  const stats = [
    { label: "Total Lógicas", value: r.total_logicas, icon: <Target size={16} />, color: "#a855f7", bg: "rgba(168,85,247,0.1)" },
    { label: "Destacadas",    value: r.destacadas,    icon: <Star size={16} />,   color: "#F59E0B", bg: "rgba(245,158,11,0.1)" },
    { label: "Aprobadas",     value: r.aprobadas,     icon: <CheckCircle2 size={16} />, color: "#10B981", bg: "rgba(16,185,129,0.1)" },
    { label: "Pendientes",    value: r.pendientes,    icon: <Clock size={16} />,  color: "#64748B", bg: "rgba(100,116,139,0.1)" },
    { label: "Rechazadas",    value: r.rechazadas,    icon: <XCircle size={16} />, color: "#EF4444", bg: "rgba(239,68,68,0.1)" },
    { label: "Puntos",        value: r.puntos,        icon: <Star size={16} />,   color: "#7C3AED", bg: "rgba(124,58,237,0.1)" },
  ];

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {stats.map(({ label, value, icon, color, bg }) => (
          <motion.div
            key={label}
            variants={itemVariants}
            style={{
              borderRadius: 12, padding: "12px 14px",
              background: bg, border: `1px solid ${color}22`,
              display: "flex", flexDirection: "column", gap: 6,
            }}
          >
            <div style={{ color, opacity: 0.85 }}>{icon}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color }}>
              <CountUp target={value} />
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--shelfy-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {label}
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function TabBultos({ detalle }: { detalle: VendorDetalle }) {
  if (!detalle.bultos_top.length) {
    return (
      <p style={{ color: "var(--shelfy-muted)", fontSize: 13, textAlign: "center", marginTop: 32 }}>
        Sin datos de bultos
      </p>
    );
  }
  const top20 = detalle.bultos_top.slice(0, 20);
  const maxBultos = Math.max(...top20.map((b) => b.bultos));

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <p style={{ fontSize: 11, color: "var(--shelfy-muted)", margin: "0 0 8px" }}>
        Top {top20.length} artículos
      </p>
      <div style={{ height: Math.min(top20.length * 28 + 40, 360) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={top20} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 4 }}>
            <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis
              type="category" dataKey="articulo" width={140}
              tick={{ fontSize: 10, fill: "var(--shelfy-muted)" }}
              axisLine={false} tickLine={false}
            />
            <Tooltip
              formatter={(v: number | undefined) => [`${v ?? 0} bultos`, "Cantidad"]}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid rgba(168,85,247,0.2)" }}
            />
            <Bar dataKey="bultos" radius={[0, 4, 4, 0]} isAnimationActive={true} animationDuration={600}>
              {top20.map((entry, i) => (
                <Cell
                  key={entry.articulo}
                  fill={`hsl(${270 - i * (60 / top20.length)}, 70%, ${55 + (entry.bultos / maxBultos) * 10}%)`}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}

function TabCompradores({
  detalle,
  search,
  setSearch,
  filtered,
}: {
  detalle: VendorDetalle;
  search: string;
  setSearch: (v: string) => void;
  filtered: { id_cliente_erp: string; razon_social: string }[];
}) {
  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            display: "flex", alignItems: "center", gap: 6, flex: 1,
            border: "1px solid rgba(168,85,247,0.2)", borderRadius: 8,
            padding: "6px 10px", background: "rgba(168,85,247,0.03)",
          }}
        >
          <Search size={13} color="var(--shelfy-muted)" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar comprador…"
            style={{
              border: "none", background: "none", outline: "none", fontSize: 12,
              color: "var(--shelfy-text)", width: "100%",
            }}
          />
        </div>
        <span style={{ fontSize: 11, color: "var(--shelfy-muted)", whiteSpace: "nowrap" }}>
          {filtered.length} de {detalle.compradores.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: "var(--shelfy-muted)", fontSize: 13, textAlign: "center", marginTop: 24 }}>
          {search ? "Sin resultados" : "Sin compradores"}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {filtered.map((c) => (
            <motion.div
              key={c.id_cliente_erp}
              variants={itemVariants}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "7px 12px", borderRadius: 8,
                background: "rgba(168,85,247,0.04)",
                border: "1px solid rgba(168,85,247,0.08)",
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--shelfy-text)" }}>
                {c.razon_social || "-"}
              </span>
              <span style={{ fontSize: 10, color: "var(--shelfy-muted)", fontFamily: "monospace" }}>
                {c.id_cliente_erp}
              </span>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
