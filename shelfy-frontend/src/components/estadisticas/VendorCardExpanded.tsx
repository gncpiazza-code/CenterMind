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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
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
import type { VendorCartaResumen, VendorDetalle } from "@/lib/api";
import { fmtBultos, fmtUnidades } from "@/lib/estadisticas-format";
import { VendorCardRadar } from "./VendorCardRadar";
import { VENDOR_CARD_LAYOUT_TRANSITION } from "./VendorCardFusion";
import { useEstadisticasStore } from "@/store/useEstadisticasStore";
import {
  detalleQueryOptions,
  useEstadisticasWarmCache,
} from "@/hooks/useEstadisticasQueries";
import {
  ESTADISTICAS_FIFA,
  detalleThemeForScore,
} from "@/lib/vendor-card-detalle-theme";
import { KpiHelpTip } from "./KpiHelpTip";
import {
  ESTADISTICAS_KPI_HELP,
  VENDEDOR_IDEAL_HELP,
  OVERLAY_IDEAL_HELP,
  OVERLAY_MODE_HELP,
} from "@/lib/estadisticas-kpi-help";
import { groupRutasByDia, formatFechaAR } from "@/lib/estadisticas-utils";

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
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>("pdvs");
  const [searchCompradores, setSearchCompradores] = useState("");
  const backdropRef = useRef<HTMLDivElement>(null);

  const tierTheme = detalleThemeForScore(vendor.score);
  const F = ESTADISTICAS_FIFA;

  const vendorIdx = vendors.findIndex((v) => v.id_vendedor === vendor.id_vendedor);
  const prevVendor = vendors[vendorIdx - 1] ?? null;
  const nextVendor = vendors[vendorIdx + 1] ?? null;

  const neighborIds = [
    prevVendor?.id_vendedor,
    nextVendor?.id_vendedor,
  ].filter(Boolean) as string[];
  useEstadisticasWarmCache(queryClient, distId, meses, null, neighborIds);

  const { data: detalle, isLoading, isError, refetch } = useQuery(
    detalleQueryOptions(distId, vendor.id_vendedor, meses),
  );

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
        transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
        onClick={handleBackdropClick}
        style={{
          position: "fixed",
          inset: 0,
          background: F.backdrop,
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
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            opacity: { duration: 0.22, ease: [0.4, 0, 0.2, 1] },
            ...VENDOR_CARD_LAYOUT_TRANSITION,
          }}
          style={{
            width: "min(90vw, 860px)",
            maxHeight: "88vh",
            borderRadius: 20,
            overflow: "hidden",
            background: "#fffef8",
            boxShadow: F.shadow,
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
              background: tierTheme.faceGradient,
              flexShrink: 0,
            }}
          />

          {/* Vendedor ideal — fuera del panel lateral */}
          <div
            style={{
              flexShrink: 0,
              padding: "8px 20px",
              borderBottom: `1px solid ${F.idealBannerBorder}`,
              background: F.idealBannerBg,
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
            }}
          >
            <KpiHelpTip text={VENDEDOR_IDEAL_HELP} side="bottom" size={14} />
            <p style={{ margin: 0, fontSize: 11, lineHeight: 1.45, color: "var(--shelfy-muted)" }}>
              <span style={{ fontWeight: 700, color: F.accentDark }}>Vendedor ideal: </span>
              {VENDEDOR_IDEAL_HELP}
            </p>
          </div>

          {/* Main layout */}
          <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
            {/* Left column */}
            <div
              style={{
                width: 260,
                flexShrink: 0,
                padding: "20px 16px 20px 20px",
                borderRight: `1px solid ${F.panelBorderLight}`,
                background: tierTheme.nameBar,
                display: "flex",
                flexDirection: "column",
                gap: 12,
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
                    background: tierTheme.faceGradient,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: tierTheme.shadow,
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: 20, fontWeight: 900, color: tierTheme.text }}>
                    <CountUp target={Math.round(vendor.score)} />
                  </span>
                </div>
                <div>
                  <p style={{ fontSize: 9, fontWeight: 700, color: "var(--shelfy-muted)", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>Score</p>
                  <p style={{ fontSize: 18, fontWeight: 800, color: F.textOnLight, margin: 0, lineHeight: 1.2 }}>
                    {vendor.nombre}
                  </p>
                  {vendor.sucursal && (
                    <p style={{ fontSize: 11, color: "var(--shelfy-muted)", margin: "2px 0 0", fontWeight: 500 }}>
                      {vendor.sucursal}
                    </p>
                  )}
                </div>
              </div>

              {/* Overlay toggles — arriba del radar */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <p style={{ fontSize: 9, fontWeight: 700, color: "var(--shelfy-muted)", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>
                    Overlay ideal
                  </p>
                  <KpiHelpTip text={OVERLAY_IDEAL_HELP} side="top" size={12} />
                </div>
                <OverlayToggle />
              </div>

              {/* Radar */}
              <div style={{ flexShrink: 0, width: "100%", minHeight: 210 }}>
                <VendorCardRadar
                  radar={vendor.radar}
                  radarCompania={vendor.radar_ideal_compania}
                  radarDist={vendor.radar_ideal_dist}
                  idealMetaCompania={vendor.ideal_meta_compania}
                  idealMetaDist={vendor.ideal_meta_dist}
                  size="fusion"
                  axesMode="fusion"
                  showOverlayCompania={overlayMode === "compania" || overlayMode === "ambos"}
                  showOverlayDist={overlayMode === "distribuidor" || overlayMode === "ambos"}
                />
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
                  borderBottom: `1px solid ${F.panelBorderLight}`,
                  padding: "0 20px",
                  flexShrink: 0,
                  background: "#fffef8",
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
                      color: activeTab === tab.key ? F.accent : "var(--shelfy-muted)",
                      borderBottom: activeTab === tab.key ? `2px solid ${F.accent}` : "2px solid transparent",
                      background: "none",
                      border: "none",
                      borderBottomWidth: 2,
                      borderBottomStyle: "solid",
                      borderBottomColor: activeTab === tab.key ? F.accent : "transparent",
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
                {isLoading && !detalle ? (
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 200 }}>
                    <Loader2 size={28} className="animate-spin" style={{ color: F.accent }} />
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
                        border: `1px solid ${F.panelBorder}`,
                        background: F.panelBg,
                        color: F.accentDark,
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
              borderTop: `1px solid ${F.panelBorderLight}`,
              background: F.footerBg,
              flexShrink: 0,
            }}
          >
            <button
              onClick={() => prevVendor && setActiveVendorId(prevVendor.id_vendedor)}
              disabled={!prevVendor}
              style={{
                display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
                color: prevVendor ? F.accent : "var(--shelfy-muted)",
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
                background: F.panelBg, border: `1px solid ${F.panelBorder}`,
                fontSize: 12, fontWeight: 600, color: F.accentDark, cursor: "pointer",
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
                color: nextVendor ? F.accent : "var(--shelfy-muted)",
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
    { label: "Distribuidora",value: "distribuidor",color: ESTADISTICAS_FIFA.panel },
    { label: "Ambos",        value: "ambos",       color: ESTADISTICAS_FIFA.accent },
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
  const [openRutaId, setOpenRutaId] = useState<number | null>(null);

  if (!detalle.rutas.length) {
    return (
      <p style={{ color: "var(--shelfy-muted)", fontSize: 13, textAlign: "center", marginTop: 32 }}>
        Sin rutas asignadas
      </p>
    );
  }

  const grupos = groupRutasByDia(detalle.rutas);
  const totalPdvs = detalle.rutas.reduce((n, r) => n + (r.total_pdvs ?? r.pdvs?.length ?? 0), 0);

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ fontSize: 11, color: "var(--shelfy-muted)", margin: 0 }}>
        {detalle.rutas.length} ruta{detalle.rutas.length !== 1 ? "s" : ""} · {totalPdvs} PDVs
      </p>

      {grupos.map(({ dia, rutas, totalPdvs: pdvsDia }) => (
        <div key={dia} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 8,
              padding: "0 2px",
            }}
          >
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: ESTADISTICAS_FIFA.accentDark, textTransform: "capitalize" }}>
              {dia}
            </h3>
            <span style={{ fontSize: 10, color: "var(--shelfy-muted)", fontWeight: 600 }}>
              {rutas.length} ruta{rutas.length !== 1 ? "s" : ""} · {pdvsDia} PDVs
            </span>
          </div>

          {rutas.map((r) => {
            const pdvs = r.pdvs ?? [];
            const isOpen = openRutaId === r.id_ruta;
            return (
              <motion.div
                key={r.id_ruta}
                variants={itemVariants}
                style={{
                  borderRadius: 10,
                  background: ESTADISTICAS_FIFA.panelBg,
                  border: `1px solid ${ESTADISTICAS_FIFA.panelBorderLight}`,
                  overflow: "hidden",
                }}
              >
                <button
                  type="button"
                  onClick={() => setOpenRutaId(isOpen ? null : r.id_ruta)}
                  style={{
                    width: "100%",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 12px",
                    background: isOpen ? ESTADISTICAS_FIFA.panelBgHover : "transparent",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <MapPin size={14} color={ESTADISTICAS_FIFA.accent} style={{ flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--shelfy-text)" }}>
                        Ruta {r.nombre}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--shelfy-muted)", marginTop: 2 }}>
                        {pdvs.length} PDV{pdvs.length !== 1 ? "s" : ""}
                      </div>
                    </div>
                  </div>
                  <ChevronDown
                    size={16}
                    color={ESTADISTICAS_FIFA.accentDark}
                    style={{
                      flexShrink: 0,
                      transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 0.2s ease",
                    }}
                  />
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{ overflow: "hidden" }}
                    >
                      <div
                        style={{
                          padding: "0 10px 10px",
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                          borderTop: `1px solid ${ESTADISTICAS_FIFA.panelBorderLight}`,
                        }}
                      >
                        {pdvs.length === 0 ? (
                          <p style={{ fontSize: 12, color: "var(--shelfy-muted)", margin: "8px 4px 4px" }}>
                            Sin PDVs en esta ruta
                          </p>
                        ) : (
                          pdvs.map((pdv) => {
                            const nombre = pdv.razon_social || pdv.nombre_fantasia || "Sin nombre";
                            const tel = [pdv.telefono, pdv.celular].filter(Boolean).join(" · ");
                            return (
                              <div
                                key={pdv.id_cliente_erp || nombre}
                                style={{
                                  padding: "10px 12px",
                                  borderRadius: 8,
                                  background: "white",
                                  border: `1px solid ${ESTADISTICAS_FIFA.panelBorderLight}`,
                                  fontSize: 11,
                                  lineHeight: 1.45,
                                }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                                  <span style={{ fontWeight: 700, color: "var(--shelfy-text)" }}>{nombre}</span>
                                  <span style={{ fontFamily: "monospace", color: "var(--shelfy-muted)", fontSize: 10 }}>
                                    ERP {pdv.id_cliente_erp || "—"}
                                  </span>
                                </div>
                                {pdv.nombre_fantasia && pdv.razon_social && pdv.nombre_fantasia !== pdv.razon_social && (
                                  <div style={{ color: "var(--shelfy-muted)", marginTop: 4 }}>
                                    Fantasía: {pdv.nombre_fantasia}
                                  </div>
                                )}
                                {tel && (
                                  <div style={{ color: "var(--shelfy-muted)", marginTop: 4 }}>Tel: {tel}</div>
                                )}
                                {(pdv.direccion || pdv.domicilio) && (
                                  <div style={{ color: "var(--shelfy-muted)", marginTop: 4 }}>
                                    Dir: {pdv.direccion || pdv.domicilio}
                                  </div>
                                )}
                                {pdv.fecha_alta && (
                                  <div style={{ color: "var(--shelfy-muted)", marginTop: 4 }}>
                                    Alta: {formatFechaAR(pdv.fecha_alta)}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
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
          border: `1px solid ${ESTADISTICAS_FIFA.panelBorderLight}`,
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: ESTADISTICAS_FIFA.panelBg }}>
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
                  borderTop: `1px solid ${ESTADISTICAS_FIFA.panelBorderLight}`,
                }}
              >
                <td style={{ padding: "7px 12px", color: "var(--shelfy-muted)", whiteSpace: "nowrap" }}>
                  {formatFechaAR(a.fecha_alta)}
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
    { label: "Total Lógicas", value: r.total_logicas, icon: <Target size={16} />, color: ESTADISTICAS_FIFA.accent, bg: ESTADISTICAS_FIFA.panelBg },
    { label: "Destacadas",    value: r.destacadas,    icon: <Star size={16} />,   color: "#F59E0B", bg: "rgba(245,158,11,0.1)" },
    { label: "Aprobadas",     value: r.aprobadas,     icon: <CheckCircle2 size={16} />, color: "#10B981", bg: "rgba(16,185,129,0.1)" },
    { label: "Pendientes",    value: r.pendientes,    icon: <Clock size={16} />,  color: "#64748B", bg: "rgba(100,116,139,0.1)" },
    { label: "Rechazadas",    value: r.rechazadas,    icon: <XCircle size={16} />, color: "#EF4444", bg: "rgba(239,68,68,0.1)" },
    { label: "Puntos",        value: r.puntos,        icon: <Star size={16} />,   color: ESTADISTICAS_FIFA.accentDark, bg: ESTADISTICAS_FIFA.panelBgHover },
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
  const top = detalle.bultos_top.slice(0, 20);
  const maxBultos = Math.max(...top.map((b) => b.bultos), 1);

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ fontSize: 11, color: "var(--shelfy-muted)", margin: 0 }}>
        Top {top.length} artículos — bultos (2 dec.) y unidades en líneas convertidas
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {top.map((item, i) => (
          <motion.div
            key={`${item.articulo}-${i}`}
            variants={itemVariants}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: "10px 12px",
              borderRadius: 10,
              background: ESTADISTICAS_FIFA.panelBg,
              border: `1px solid ${ESTADISTICAS_FIFA.panelBorderLight}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div style={{ display: "flex", gap: 10, minWidth: 0, flex: 1 }}>
                <span
                  style={{
                    flexShrink: 0,
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    background: ESTADISTICAS_FIFA.panelBgHover,
                    color: ESTADISTICAS_FIFA.accentDark,
                    fontSize: 11,
                    fontWeight: 800,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {i + 1}
                </span>
                <p
                  style={{
                    margin: 0,
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--shelfy-text)",
                    lineHeight: 1.45,
                    wordBreak: "break-word",
                  }}
                >
                  {item.articulo}
                </p>
              </div>
              <div style={{ flexShrink: 0, textAlign: "right" }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 800, color: ESTADISTICAS_FIFA.accentDark }}>
                  {fmtBultos(item.bultos)} blt
                </span>
                {(item.unidades ?? 0) > 0 && (
                  <span style={{ display: "block", fontSize: 10, fontWeight: 600, color: "var(--shelfy-muted)" }}>
                    {fmtUnidades(item.unidades ?? 0)} un
                  </span>
                )}
              </div>
            </div>
            <div
              style={{
                height: 6,
                borderRadius: 99,
                background: ESTADISTICAS_FIFA.panelBgHover,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.max(8, (item.bultos / maxBultos) * 100)}%`,
                  borderRadius: 99,
                  background: `linear-gradient(90deg, ${ESTADISTICAS_FIFA.accent}, ${ESTADISTICAS_FIFA.accentDark})`,
                }}
              />
            </div>
          </motion.div>
        ))}
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
            border: `1px solid ${ESTADISTICAS_FIFA.panelBorder}`, borderRadius: 8,
            padding: "6px 10px", background: ESTADISTICAS_FIFA.panelBg,
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
                background: ESTADISTICAS_FIFA.panelBg,
                border: `1px solid ${ESTADISTICAS_FIFA.panelBorderLight}`,
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
