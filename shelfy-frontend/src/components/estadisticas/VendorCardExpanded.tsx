"use client";

import "./vendor-card-fusion.css";
import "./vendor-detalle-sidebar.css";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
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
  Package,
  Loader2,
} from "lucide-react";
import type { VendorCartaResumen, VendorDetalle } from "@/lib/api";
import { fetchPatronCuentas } from "@/lib/api";
import { fmtBultos, fmtBultosUnidadesDesglose } from "@/lib/estadisticas-format";
import { VendorCardRadar } from "./VendorCardRadar";
import {
  effectiveRawKpisForRadar,
  mergeFusionRadarFromRaw,
} from "@/lib/vendor-radar-fusion";
import { VENDOR_CARD_LAYOUT_TRANSITION } from "./VendorCardFusion";
import { useEstadisticasStore } from "@/store/useEstadisticasStore";
import {
  detalleQueryOptions,
  useEstadisticasWarmCache,
} from "@/hooks/useEstadisticasQueries";
import {
  PatronCuentaSelector,
  isPatronIvanSoto,
} from "./PatronCuentaSelector";
import {
  ESTADISTICAS_FIFA,
  detalleThemeForScore,
} from "@/lib/vendor-card-detalle-theme";
import { KpiHelpTip } from "./KpiHelpTip";
import {
  VENDEDOR_IDEAL_HELP,
  OVERLAY_IDEAL_HELP,
  OVERLAY_MODE_HELP,
} from "@/lib/estadisticas-kpi-help";
import {
  VENDOR_DETALLE_SIDEBAR_KPIS,
  formatVendorDetalleSidebarKpiValue,
} from "@/lib/vendor-detalle-sidebar-kpis";
import { groupRutasByDia, formatFechaAR } from "@/lib/estadisticas-utils";
import { RecapEvolucionButton } from "./recap/RecapEvolucionModal";
import { mesForRecapEvolucion } from "@/lib/recap-utils";
import { TabCarteraEstado } from "./TabCarteraEstado";
import {
  VendorDetalleLayoutTuner,
  VendorDetalleLayoutTunerFab,
  useVendorDetalleLayoutTuning,
} from "./VendorDetalleLayoutTuner";
import { tuningToCssVars } from "@/lib/vendor-detalle-layout-tuning";

type TabKey = "pdvs" | "cartera" | "bultos";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "pdvs",    label: "PDVs",    icon: <MapPin size={13} /> },
  { key: "cartera", label: "Cartera", icon: <ShoppingBag size={13} /> },
  { key: "bultos",  label: "Bultos",  icon: <Package size={13} /> },
];

function buildAltaMaps(detalle: VendorDetalle) {
  const altaIds = new Set<string>();
  const altasByRuta = new Map<number, number>();
  const altaMeta = new Map<string, { fecha_alta: string }>();

  for (const alta of detalle.altas) {
    altaIds.add(alta.id_cliente_erp);
    altasByRuta.set(alta.id_ruta, (altasByRuta.get(alta.id_ruta) ?? 0) + 1);
    altaMeta.set(alta.id_cliente_erp, { fecha_alta: alta.fecha_alta });
  }

  return { altaIds, altasByRuta, altaMeta };
}

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

function useElementHeight(fallback = 260) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(fallback);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setHeight(Math.max(220, el.clientHeight));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, height };
}

function SidebarKpiRow({
  items,
  className,
}: {
  items: { key: string; label: string; description: string; value: string }[];
  className?: string;
}) {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className={`vendor-detalle-kpi-row ${className ?? ""}`.trim()}
    >
      {items.map(({ key, label, description, value }) => (
        <motion.div key={key} variants={itemVariants} className="vendor-detalle-kpi-cell">
          <span className="vendor-detalle-kpi-cell__label">
            {label}
            <KpiHelpTip text={description} side="top" size={10} />
          </span>
          <span className="vendor-detalle-kpi-cell__value">{value}</span>
        </motion.div>
      ))}
    </motion.div>
  );
}

function useSidebarKpis(vendor: VendorCartaResumen, pdvsExhibidosOverride?: number) {
  const raw = vendor.raw_kpis;
  return useMemo(() => {
    const rawEffective = effectiveRawKpisForRadar(raw, {
      pdvsExhibidos: pdvsExhibidosOverride,
    });
    const items = VENDOR_DETALLE_SIDEBAR_KPIS.map(({ key, label, description }) => ({
      key,
      label,
      description,
      value: formatVendorDetalleSidebarKpiValue(key, rawEffective),
    }));
    return {
      top: items.slice(0, 3),
      bottom: items.slice(3, 6),
    };
  }, [raw, pdvsExhibidosOverride]);
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
  const backdropRef = useRef<HTMLDivElement>(null);

  const tierTheme = detalleThemeForScore(vendor.score);
  const F = ESTADISTICAS_FIFA;
  const { tuning, setTuning, tunerOpen, setTunerOpen } = useVendorDetalleLayoutTuning();
  const layoutVars = tuningToCssVars(tuning);
  const { ref: radarWrapRef, height: radarHeight } = useElementHeight(tuning.radarMinHeight);

  const patronMode = isPatronIvanSoto(distId, vendor.id_vendedor);
  const [patronCuenta, setPatronCuenta] = useState<string | null>(null);
  const { data: patronMeta } = useQuery({
    queryKey: ["patron-cuentas", distId, vendor.id_vendedor],
    queryFn: () => fetchPatronCuentas(distId, Number(vendor.id_vendedor)),
    enabled: patronMode,
    staleTime: 5 * 60_000,
  });
  const cuentaActiva = patronMode
    ? patronCuenta ?? patronMeta?.cuenta_default ?? null
    : null;

  const vendorIdx = vendors.findIndex((v) => v.id_vendedor === vendor.id_vendedor);
  const prevVendor = vendors[vendorIdx - 1] ?? null;
  const nextVendor = vendors[vendorIdx + 1] ?? null;

  const neighborIds = [
    prevVendor?.id_vendedor,
    nextVendor?.id_vendedor,
  ].filter(Boolean) as string[];
  useEstadisticasWarmCache(queryClient, distId, meses, neighborIds);

  const { data: detalle, isLoading, isError, refetch } = useQuery(
    detalleQueryOptions(distId, vendor.id_vendedor, meses, cuentaActiva),
  );

  const sidebarKpis = useSidebarKpis(
    vendor,
    detalle?.cartera?.composicion?.total_exhibidos,
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => { if (e.target === backdropRef.current) onClose(); },
    [onClose]
  );

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && prevVendor) setActiveVendorId(prevVendor.id_vendedor);
      if (e.key === "ArrowRight" && nextVendor) setActiveVendorId(nextVendor.id_vendedor);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, prevVendor, nextVendor, setActiveVendorId]);

  return (
    <>
      {tunerOpen ? (
        <VendorDetalleLayoutTuner tuning={tuning} onChange={setTuning} onClose={() => setTunerOpen(false)} />
      ) : (
        <VendorDetalleLayoutTunerFab visible onOpen={() => setTunerOpen(true)} />
      )}
      {/* Backdrop */}
      <motion.div
        ref={backdropRef}
        className="vendor-detalle-backdrop"
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
          className="vendor-detalle-shell"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            opacity: { duration: 0.22, ease: [0.4, 0, 0.2, 1] },
            ...VENDOR_CARD_LAYOUT_TRANSITION,
          }}
          style={{
            overflow: "hidden",
            background: "var(--est-modal-bg, #fffef8)",
            boxShadow: F.shadow,
            display: "flex",
            flexDirection: "column",
            zIndex: 201,
            borderRadius: tuning.shellRadius,
            isolation: "isolate",
            ...layoutVars,
          } as React.CSSProperties}
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

          <div className="vendor-detalle-layout">
            {/* Sidebar — perfil + radar + KPIs */}
            <div
              className="vendor-detalle-sidebar"
              style={{ background: tierTheme.nameBar }}
            >
              <div className="vendor-detalle-sidebar-head">
                <div className="vendor-detalle-sidebar-profile">
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      style={{
                        width: tuning.scoreSize,
                        height: tuning.scoreSize,
                        borderRadius: "50%",
                        background: tierTheme.faceGradient,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: tierTheme.shadow,
                        flexShrink: 0,
                      }}
                    >
                      <span style={{ fontSize: tuning.scoreFontSize, fontWeight: 900, color: tierTheme.text }}>
                        <CountUp target={Math.round(vendor.score)} />
                      </span>
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: 9, fontWeight: 700, color: "var(--shelfy-muted)", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>Score</p>
                      <p style={{ fontSize: tuning.nameFontSize, fontWeight: 800, color: F.textOnLight, margin: 0, lineHeight: 1.2, wordBreak: "break-word" }}>
                        {vendor.nombre}
                      </p>
                      {vendor.sucursal && (
                        <p style={{ fontSize: 11, color: "var(--shelfy-muted)", margin: "3px 0 0", fontWeight: 500 }}>
                          {vendor.sucursal}
                        </p>
                      )}
                      {patronMode && (
                        <div style={{ marginTop: 8 }}>
                          <PatronCuentaSelector
                            distId={distId}
                            vendedorId={vendor.id_vendedor}
                            value={patronCuenta}
                            onChange={setPatronCuenta}
                          />
                        </div>
                      )}
                      {detalle?.asignacion_cartera && (
                        <p style={{ fontSize: 10, color: "var(--shelfy-muted)", margin: "6px 0 0", lineHeight: 1.35 }}>
                          Cartera{" "}
                          {detalle.asignacion_cartera.pdv_count_monchi != null
                            ? "equipo"
                            : "inferida"}
                          : {detalle.asignacion_cartera.pdv_count} PDVs
                          {detalle.asignacion_cartera.pdv_count_monchi != null && (
                            <>
                              {" "}
                              (Monchi {detalle.asignacion_cartera.pdv_count_monchi} + Jorge{" "}
                              {detalle.asignacion_cartera.pdv_count_jorge_coronel})
                            </>
                          )}
                          {detalle.asignacion_cartera.ruta_count != null && (
                            <> · {detalle.asignacion_cartera.ruta_count} rutas</>
                          )}{" "}
                          · ventana {detalle.asignacion_cartera.lookback_dias}d
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="vendor-detalle-sidebar-overlay">
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
                    <p style={{ fontSize: 9, fontWeight: 700, color: "var(--shelfy-muted)", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>
                      Overlay ideal
                    </p>
                    <KpiHelpTip text={OVERLAY_IDEAL_HELP} side="top" size={12} />
                  </div>
                  <OverlayToggle />
                </div>
              </div>

              {tuning.showKpisBlock && (
                <SidebarKpiRow items={sidebarKpis.top} className="vendor-detalle-kpi-row--top" />
              )}

              <div className="vendor-detalle-sidebar-radar">
                <div ref={radarWrapRef} className="vendor-detalle-sidebar-radar-chart">
                  <VendorCardRadar
                    radar={mergeFusionRadarFromRaw(
                      vendor.radar,
                      vendor.raw_kpis,
                      vendor.ideal_meta_dist,
                      vendor.ideal_meta_compania,
                      {
                        pdvsExhibidos:
                          detalle?.cartera?.composicion?.total_exhibidos,
                      },
                    )}
                    radarCompania={vendor.radar_ideal_compania}
                    radarDist={vendor.radar_ideal_dist}
                    idealMetaCompania={vendor.ideal_meta_compania}
                    idealMetaDist={vendor.ideal_meta_dist}
                    size="detalle"
                    chartHeight={radarHeight}
                    axesMode="fusion"
                    showOverlayCompania={overlayMode === "compania" || overlayMode === "ambos"}
                    showOverlayDist={overlayMode === "distribuidor" || overlayMode === "ambos"}
                  />
                </div>
              </div>

              {tuning.showKpisBlock && (
                <SidebarKpiRow items={sidebarKpis.bottom} className="vendor-detalle-kpi-row--bottom" />
              )}

              <div className="vendor-detalle-sidebar-foot">
                {tuning.showEvolucionBtn && (
                  <div className="vendor-detalle-sidebar-evolucion">
                    <RecapEvolucionButton
                      distId={distId}
                      vendedorId={vendor.id_vendedor}
                      mes={mesForRecapEvolucion(meses)}
                      vendorName={vendor.nombre}
                      cartaReferencia={vendor}
                      variant="panel"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Panel principal — banner, tabs, contenido, footer */}
            <div className="vendor-detalle-main">
              {tuning.showIdealBanner && (
              <div
                className="vendor-detalle-ideal-banner"
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
              )}

              {/* Tab bar */}
              <div
                className="vendor-detalle-tabs"
                style={{
                  display: "flex",
                  borderBottom: `1px solid ${F.panelBorderLight}`,
                  padding: "0 20px",
                  flexShrink: 0,
                  background: "var(--est-modal-bg, #fffef8)",
                }}
              >
                {TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={
                      activeTab === tab.key
                        ? "vendor-detalle-tab-btn vendor-detalle-tab-btn--active"
                        : "vendor-detalle-tab-btn"
                    }
                    onClick={() => setActiveTab(tab.key)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "12px 14px",
                      fontSize: 12,
                      fontWeight: activeTab === tab.key ? 700 : 500,
                      color: activeTab === tab.key ? F.accent : "var(--shelfy-muted)",
                      background: "none",
                      borderTop: "none",
                      borderLeft: "none",
                      borderRight: "none",
                      borderBottomWidth: 2,
                      borderBottomStyle: "solid",
                      borderBottomColor: activeTab === tab.key ? F.accent : "transparent",
                      cursor: "pointer",
                      transition: "color 0.18s ease, border-bottom-color 0.18s ease",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="vendor-detalle-main-scroll">
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
                      {activeTab === "cartera" && detalle && (
                        <TabCarteraEstado detalle={detalle} />
                      )}
                      {activeTab === "bultos" && detalle && (
                        <TabBultos detalle={detalle} />
                      )}
                    </motion.div>
                  </AnimatePresence>
                )}
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
            </div>
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
  const { altaIds, altasByRuta, altaMeta } = useMemo(() => buildAltaMaps(detalle), [detalle]);

  if (!detalle.rutas.length) {
    return (
      <p style={{ color: "var(--shelfy-muted)", fontSize: 13, textAlign: "center", marginTop: 32 }}>
        Sin rutas asignadas
      </p>
    );
  }

  const grupos = groupRutasByDia(detalle.rutas);
  const totalPdvs = detalle.rutas.reduce((n, r) => n + (r.total_pdvs ?? r.pdvs?.length ?? 0), 0);
  const totalAltas = detalle.altas.length;

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ fontSize: 11, color: "var(--shelfy-muted)", margin: 0 }}>
        {detalle.rutas.length} ruta{detalle.rutas.length !== 1 ? "s" : ""} · {totalPdvs} PDVs
        {totalAltas > 0 && (
          <>
            {" · "}
            <span style={{ color: "#b45309", fontWeight: 700 }}>
              {totalAltas} alta{totalAltas !== 1 ? "s" : ""} en el período
            </span>
          </>
        )}
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
            const altasEnRuta = altasByRuta.get(r.id_ruta) ?? 0;
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
                      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
                        <span style={{ fontSize: 10, color: "var(--shelfy-muted)" }}>
                          {pdvs.length} PDV{pdvs.length !== 1 ? "s" : ""}
                        </span>
                        {altasEnRuta > 0 && (
                          <span className="vendor-detalle-ruta-alta-badge">
                            <Star size={10} />
                            {altasEnRuta} alta{altasEnRuta !== 1 ? "s" : ""}
                          </span>
                        )}
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
                            const isAlta = altaIds.has(pdv.id_cliente_erp);
                            const altaFecha = altaMeta.get(pdv.id_cliente_erp)?.fecha_alta ?? pdv.fecha_alta;
                            return (
                              <div
                                key={pdv.id_cliente_erp || nombre}
                                className={isAlta ? "vendor-detalle-pdv-alta" : undefined}
                                style={{
                                  padding: "10px 12px",
                                  borderRadius: 8,
                                  background: "white",
                                  border: `1px solid ${ESTADISTICAS_FIFA.panelBorderLight}`,
                                  fontSize: 11,
                                  lineHeight: 1.45,
                                }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", minWidth: 0 }}>
                                    <span style={{ fontWeight: 700, color: isAlta ? "#b45309" : "var(--shelfy-text)" }}>
                                      {nombre}
                                    </span>
                                    {isAlta && (
                                      <span className="vendor-detalle-pdv-alta-badge">
                                        <Star size={9} />
                                        Alta
                                      </span>
                                    )}
                                  </div>
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
                                {isAlta && altaFecha && (
                                  <div style={{ color: "#b45309", marginTop: 4, fontWeight: 600 }}>
                                    Alta del período: {formatFechaAR(altaFecha)}
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

function TabBultos({ detalle }: { detalle: VendorDetalle }) {
  if (!detalle.bultos_top.length) {
    return (
      <p style={{ color: "var(--shelfy-muted)", fontSize: 13, textAlign: "center", marginTop: 32 }}>
        Sin datos de bultos
      </p>
    );
  }
  const items = detalle.bultos_top;
  const sumDisplay = items.reduce((acc, item) => acc + item.bultos, 0);
  const totalLabel =
    detalle.bultos_desglose_total != null
      ? fmtBultos(detalle.bultos_desglose_total)
      : fmtBultos(sumDisplay);
  const maxBultos = Math.max(...items.map((b) => b.bultos), 1);

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <p style={{ fontSize: 11, color: "var(--shelfy-muted)", margin: 0 }}>
          {detalle.bultos_desglose_count ?? items.length} artículos — bultos con 2 dec.; debajo, entero + unidades del decimal
        </p>
        <p style={{ fontSize: 12, fontWeight: 800, color: ESTADISTICAS_FIFA.accentDark, margin: 0 }}>
          Total desglose: {totalLabel} bultos
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((item, i) => (
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
                  {item.cod_articulo ? (
                    <span style={{ fontFamily: "monospace", fontSize: 10, color: "var(--shelfy-muted)", marginRight: 6 }}>
                      {item.cod_articulo}
                    </span>
                  ) : null}
                  {item.articulo}
                </p>
              </div>
              <div style={{ flexShrink: 0, textAlign: "right" }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 800, color: ESTADISTICAS_FIFA.accentDark }}>
                  {fmtBultos(item.bultos)} bultos
                </span>
                {item.bultos_enteros != null && item.unidades_resto != null && (
                  <span style={{ display: "block", fontSize: 10, fontWeight: 600, color: "var(--shelfy-muted)", lineHeight: 1.35 }}>
                    {fmtBultosUnidadesDesglose(item.bultos_enteros, item.unidades_resto)}
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
