"use client";

import "./estadisticas-page.css";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { PeriodSelector } from "@/components/estadisticas/PeriodSelector";
import { SucursalSelector } from "@/components/estadisticas/SucursalSelector";
import { VendorCollection } from "@/components/estadisticas/VendorCollection";
import { EstadisticasLoadingStrip } from "@/components/estadisticas/EstadisticasLoadingStrip";
import { IdealConfigModal } from "@/components/estadisticas/IdealConfigModal";
import { KpiHelpTip } from "@/components/estadisticas/KpiHelpTip";
import { useEstadisticasStore } from "@/store/useEstadisticasStore";
import type { VendorCartaResumen } from "@/lib/api";
import {
  useEstadisticasCartasBundle,
  useEstadisticasMeses,
  useEstadisticasSucursales,
} from "@/hooks/useEstadisticasQueries";
import { mesActual } from "@/lib/estadisticas-period";
import { VENDEDOR_IDEAL_HELP } from "@/lib/estadisticas-kpi-help";
import { loadDashboardTheme, saveDashboardTheme } from "@/lib/dashboard-theme";
import { DashboardThemeToggle } from "@/components/dashboard/DashboardThemeToggle";
import {
  Settings2,
  TrendingUp,
  ChevronDown,
  AlertTriangle,
  Users,
  Loader2,
} from "lucide-react";
// ── Animation variants ──────────────────────────────────────────────────────

const pageVariants = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

// ── Main page ───────────────────────────────────────────────────────────────

export default function EstadisticasPage() {
  const { user, loading: authLoading, effectiveDistribuidorId } = useAuth();
  const router = useRouter();

  const {
    mesesSeleccionados,
    setMesesSeleccionados,
    filterSucursal,
    setFilterSucursal,
    overlayMode,
    setOverlayMode,
  } = useEstadisticasStore();

  const [showIdealModal, setShowIdealModal] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(loadDashboardTheme() === "dark");
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      saveDashboardTheme(next ? "dark" : "light");
      return next;
    });
  }, []);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  const distId: number = effectiveDistribuidorId ?? user?.id_distribuidor ?? 0;

  const { data: mesesDisponibles = [], isLoading: loadingMeses } =
    useEstadisticasMeses(distId);

  const { data: sucursales = [] } = useEstadisticasSucursales(distId);

  const mesesParaQuery = useMemo(() => {
    if (loadingMeses || mesesDisponibles.length === 0) return [];
    return mesesSeleccionados.filter((m) => mesesDisponibles.includes(m));
  }, [loadingMeses, mesesDisponibles, mesesSeleccionados]);

  // Alinear meses persistidos con los disponibles para la distribuidora activa
  useEffect(() => {
    if (loadingMeses) return;
    if (mesesDisponibles.length === 0) {
      if (mesesSeleccionados.length > 0) setMesesSeleccionados([]);
      return;
    }
    const valid = mesesSeleccionados.filter((m) => mesesDisponibles.includes(m));
    if (valid.length === 0) {
      const current = mesActual();
      setMesesSeleccionados(
        mesesDisponibles.includes(current)
          ? [current]
          : [mesesDisponibles[0]],
      );
    } else if (valid.length !== mesesSeleccionados.length) {
      setMesesSeleccionados(valid);
    }
  }, [loadingMeses, mesesDisponibles, mesesSeleccionados, setMesesSeleccionados]);

  const {
    data: cartasBundle,
    isLoading: loadingCards,
    isError: cartasError,
    refetch: refetchCartas,
  } = useEstadisticasCartasBundle(distId, mesesParaQuery, filterSucursal);

  const vendors: VendorCartaResumen[] = cartasBundle?.cartas ?? [];

  // Período persistido sin cartas (p. ej. mes con datos crudos pero sin KPIs) → mes más reciente con cartas
  useEffect(() => {
    if (loadingMeses || loadingCards || cartasError) return;
    if (vendors.length > 0 || mesesDisponibles.length === 0) return;
    if (mesesParaQuery.length === 0) return;
    const best = mesesDisponibles[0];
    if (!best) return;
    const same =
      mesesSeleccionados.length === 1 && mesesSeleccionados[0] === best;
    if (!same) setMesesSeleccionados([best]);
  }, [
    loadingMeses,
    loadingCards,
    cartasError,
    vendors.length,
    mesesDisponibles,
    mesesParaQuery.length,
    mesesSeleccionados,
    setMesesSeleccionados,
  ]);

  const showLoadingStrip =
    mesesParaQuery.length > 0 && loadingCards && vendors.length === 0 && !cartasError;

  // Activar overlay ideal por defecto la primera vez que hay config
  const overlayInitRef = useRef(false);
  useEffect(() => {
    if (overlayInitRef.current || vendors.length === 0 || overlayMode !== "none") return;
    const hasComp = vendors.some((v) => v.has_ideal_compania);
    const hasDist = vendors.some((v) => v.has_ideal_distribuidora);
    if (hasComp && hasDist) setOverlayMode("ambos");
    else if (hasComp) setOverlayMode("compania");
    else if (hasDist) setOverlayMode("distribuidor");
    overlayInitRef.current = true;
  }, [vendors, overlayMode, setOverlayMode]);

  useEffect(() => {
    if (filterSucursal && sucursales.length > 0 && !sucursales.includes(filterSucursal)) {
      setFilterSucursal(null);
    }
  }, [filterSucursal, sucursales, setFilterSucursal]);

  // Detect potentially empty data
  const hasVendors = vendors.length > 0;
  const isLoading = loadingMeses || showLoadingStrip;

  if (authLoading || !user) {
    return (
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          minHeight: "100vh", background: "var(--shelfy-bg)",
        }}
      >
        <Loader2 size={28} style={{ color: "#a855f7", animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  return (
    <div
      className={isDark ? "estadisticas-page estadisticas-page--dark" : "estadisticas-page"}
      style={{
        display: "flex",
        minHeight: "100vh",
        background: isDark ? "#0f172a" : "var(--shelfy-bg)",
        color: "var(--shelfy-text)",
      }}
    >
      <Sidebar />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          paddingBottom: 64,
        }}
      >
        <Topbar title="Estadísticas" />

        <motion.main
          variants={pageVariants}
          initial="hidden"
          animate="show"
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            background: "var(--shelfy-bg)",
          }}
        >
          {/* ── Page header ── */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 12,
              padding: "20px 24px 0",
            }}
          >
            {/* Title */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: "linear-gradient(135deg, #a855f7 0%, #7C3AED 100%)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 4px 14px rgba(168,85,247,0.35)",
                  flexShrink: 0,
                }}
              >
                <TrendingUp size={20} color="white" />
              </div>
              <div>
                <h1
                  style={{
                    fontSize: 22, fontWeight: 900, margin: 0,
                    background: "linear-gradient(135deg, #a855f7 0%, #5B21B6 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  Estadísticas
                </h1>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--shelfy-muted)",
                    margin: 0,
                    fontWeight: 500,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  Rendimiento por vendedor vs. ideal
                  <KpiHelpTip text={VENDEDOR_IDEAL_HELP} side="bottom" size={13} />
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <DashboardThemeToggle isDark={isDark} onToggle={toggleTheme} />
              {/* Overlay mode */}
              <OverlayPill mode={overlayMode} onChange={setOverlayMode} isDark={isDark} />

              {/* Config ideal button */}
              <button
                type="button"
                className="estadisticas-control-btn"
                onClick={() => setShowIdealModal(true)}
                title="Configurar metas y pesos del vendedor ideal"
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 14px", borderRadius: 10,
                  border: "1px solid rgba(168,85,247,0.25)",
                  background: "white",
                  fontSize: 13, fontWeight: 600, color: "#7C3AED",
                  cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(168,85,247,0.1)",
                }}
              >
                <Settings2 size={14} />
                <span className="hidden sm:inline">Ideal</span>
              </button>
            </div>
          </div>

          {/* ── Controls row ── */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: 12,
              padding: "16px 24px 0",
            }}
          >
            <PeriodSelector mesesDisponibles={mesesDisponibles} isLoading={loadingMeses} />
            <SucursalSelector sucursales={sucursales} />
          </div>

          {/* ── Vendor count summary ── */}
          {!isLoading && hasVendors && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "10px 24px 0",
              }}
            >
              <Users size={13} color="#a855f7" />
              <span style={{ fontSize: 12, color: "var(--shelfy-muted)", fontWeight: 500 }}>
                <strong style={{ color: "#7C3AED" }}>{vendors.length}</strong> vendedor{vendors.length !== 1 ? "es" : ""}
                {filterSucursal && ` · ${filterSucursal}`}
              </span>
            </motion.div>
          )}

          {/* ── Main content area ── */}
          <div style={{ flex: 1, marginTop: 12 }}>
            <AnimatePresence mode="wait">
              {showLoadingStrip && (
                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <EstadisticasLoadingStrip />
                </motion.div>
              )}

              {/* Error loading cartas */}
              {!loadingCards && cartasError && mesesParaQuery.length > 0 && (
                <motion.div
                  key="cartas-error"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  style={{ padding: "48px 24px", textAlign: "center" }}
                >
                  <div
                    style={{
                      width: 56, height: 56, borderRadius: 16, margin: "0 auto 16px",
                      background: "rgba(239,68,68,0.08)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <AlertTriangle size={26} color="#EF4444" />
                  </div>
                  <p style={{ fontSize: 16, fontWeight: 700, color: "var(--shelfy-text)", margin: "0 0 6px" }}>
                    No se pudieron cargar las cartas
                  </p>
                  <p style={{ fontSize: 13, color: "var(--shelfy-muted)", margin: "0 0 16px" }}>
                    El servidor tardó demasiado o no está disponible. Reintentá en unos segundos.
                  </p>
                  <button
                    type="button"
                    onClick={() => void refetchCartas()}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 8,
                      border: "1px solid rgba(168,85,247,0.25)",
                      background: "rgba(168,85,247,0.08)",
                      color: "#7C3AED",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Reintentar
                  </button>
                </motion.div>
              )}

              {/* Sin meses en esta distribuidora */}
              {!isLoading && mesesParaQuery.length === 0 && mesesDisponibles.length === 0 && !loadingMeses && (
                <motion.div
                  key="no-data-dist"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  style={{ padding: "48px 24px", textAlign: "center" }}
                >
                  <div
                    style={{
                      width: 56, height: 56, borderRadius: 16, margin: "0 auto 16px",
                      background: "rgba(100,116,139,0.08)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <TrendingUp size={26} color="var(--shelfy-muted)" />
                  </div>
                  <p style={{ fontSize: 16, fontWeight: 700, color: "var(--shelfy-text)", margin: "0 0 6px" }}>
                    Sin datos para esta distribuidora
                  </p>
                  <p style={{ fontSize: 13, color: "var(--shelfy-muted)", margin: 0 }}>
                    Todavía no hay meses con actividad registrada en Estadísticas
                  </p>
                </motion.div>
              )}

              {/* Elegir período */}
              {!isLoading && mesesParaQuery.length === 0 && mesesDisponibles.length > 0 && (
                <motion.div
                  key="no-period"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  style={{ padding: "48px 24px", textAlign: "center" }}
                >
                  <div
                    style={{
                      width: 56, height: 56, borderRadius: 16, margin: "0 auto 16px",
                      background: "rgba(168,85,247,0.08)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <TrendingUp size={26} color="#a855f7" />
                  </div>
                  <p style={{ fontSize: 16, fontWeight: 700, color: "var(--shelfy-text)", margin: "0 0 6px" }}>
                    Selecciona un período
                  </p>
                  <p style={{ fontSize: 13, color: "var(--shelfy-muted)", margin: 0 }}>
                    Elige uno o varios meses para ver las estadísticas de los vendedores
                  </p>
                </motion.div>
              )}

              {/* No vendors */}
              {!isLoading && !cartasError && mesesParaQuery.length > 0 && !hasVendors && !loadingCards && (
                <motion.div
                  key="no-vendors"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  style={{ padding: "48px 24px", textAlign: "center" }}
                >
                  <div
                    style={{
                      width: 56, height: 56, borderRadius: 16, margin: "0 auto 16px",
                      background: "rgba(100,116,139,0.08)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <Users size={26} color="var(--shelfy-muted)" />
                  </div>
                  <p style={{ fontSize: 16, fontWeight: 700, color: "var(--shelfy-text)", margin: "0 0 6px" }}>
                    Sin actividad en este período
                  </p>
                  <p style={{ fontSize: 13, color: "var(--shelfy-muted)", margin: 0 }}>
                    No hay vendedores con actividad registrada en los meses seleccionados
                  </p>
                </motion.div>
              )}

              {/* Vendor collection */}
              {!showLoadingStrip && hasVendors && (
                <motion.div
                  key="collection"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  style={{ position: "relative" }}
                >
                  <MissingIdealBanner onConfigure={() => setShowIdealModal(true)} vendors={vendors} />

                  <VendorCollection
                    vendors={vendors}
                    distId={distId}
                    meses={mesesParaQuery}
                    nombreDistribuidora={user?.nombre_empresa}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.main>
      </div>

      <BottomNav />

      {/* Ideal config modal */}
      <IdealConfigModal
        open={showIdealModal}
        onClose={() => setShowIdealModal(false)}
        distId={distId}
        userRol={user?.rol ?? ""}
      />
    </div>
  );
}

// ── Overlay pill ────────────────────────────────────────────────────────────

type OverlayMode = "none" | "compania" | "distribuidor" | "ambos";

function OverlayPill({
  mode,
  onChange,
  isDark = false,
}: {
  mode: OverlayMode;
  onChange: (m: OverlayMode) => void;
  isDark?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const OPTIONS: { value: OverlayMode; label: string; color: string }[] = [
    { value: "none",         label: "Sin overlay", color: "#64748B" },
    { value: "compania",     label: "Compañía",    color: "#F59E0B" },
    { value: "distribuidor", label: "Distribuidora", color: "#7C3AED" },
    { value: "ambos",        label: "Ambos",       color: "#a855f7" },
  ];

  const active = OPTIONS.find((o) => o.value === mode) ?? OPTIONS[0];

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="estadisticas-control-btn"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "8px 12px", borderRadius: 10,
          border: `1px solid ${active.color}33`,
          background: mode !== "none" ? `${active.color}12` : isDark ? "var(--est-chip-bg)" : "white",
          fontSize: 12, fontWeight: 600, color: active.color,
          cursor: "pointer",
        }}
      >
        <div
          style={{
            width: 8, height: 8, borderRadius: "50%",
            background: active.color,
          }}
        />
        {active.label}
        <ChevronDown size={12} style={{ transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.15s" }} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="estadisticas-overlay-dropdown"
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.14 }}
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              right: 0,
              background: "white",
              border: "1px solid rgba(168,85,247,0.15)",
              borderRadius: 12,
              padding: 8,
              boxShadow: "0 8px 24px rgba(168,85,247,0.12), 0 2px 8px rgba(0,0,0,0.06)",
              zIndex: 50,
              minWidth: 160,
            }}
            onMouseLeave={() => setOpen(false)}
          >
            {OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  width: "100%", padding: "7px 10px", borderRadius: 8,
                  border: "none", background: mode === opt.value ? `${opt.color}10` : "transparent",
                  fontSize: 12, fontWeight: mode === opt.value ? 700 : 500,
                  color: mode === opt.value ? opt.color : "var(--shelfy-text)",
                  cursor: "pointer",
                  transition: "background 0.12s",
                }}
              >
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: opt.color, flexShrink: 0 }} />
                {opt.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Missing ideal banner ─────────────────────────────────────────────────────

function MissingIdealBanner({
  vendors,
  onConfigure,
}: {
  vendors: VendorCartaResumen[];
  onConfigure: () => void;
}) {
  const [dismissed, setDismissed] = useState(false);

  // Show if most vendors have score = 0 (likely no ideal config)
  const zeroScoreRatio = vendors.length > 0
    ? vendors.filter((v) => v.score === 0).length / vendors.length
    : 0;

  if (dismissed || zeroScoreRatio < 0.6) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      style={{
        margin: "0 24px 12px",
        padding: "10px 16px",
        borderRadius: 12,
        background: "rgba(245,158,11,0.06)",
        border: "1px solid rgba(245,158,11,0.25)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <AlertTriangle size={15} color="#F59E0B" />
        <span style={{ fontSize: 12, fontWeight: 600, color: "#92400E" }}>
          Configura el vendedor ideal para ver scores precisos
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <button
          onClick={onConfigure}
          style={{
            padding: "5px 12px", borderRadius: 7, fontSize: 11, fontWeight: 700,
            background: "#F59E0B", color: "white", border: "none", cursor: "pointer",
          }}
        >
          Configurar
        </button>
        <button
          onClick={() => setDismissed(true)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "#92400E", opacity: 0.6,
          }}
        >
          <X size={14} />
        </button>
      </div>
    </motion.div>
  );
}
