"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { PeriodSelector } from "@/components/estadisticas/PeriodSelector";
import { VendorCollection } from "@/components/estadisticas/VendorCollection";
import { IdealConfigModal } from "@/components/estadisticas/IdealConfigModal";
import { useEstadisticasStore } from "@/store/useEstadisticasStore";
import {
  fetchEstadisticasMeses,
  fetchEstadisticasCartas,
  fetchDistribuidoras,
  type Distribuidora,
  type VendorCartaResumen,
} from "@/lib/api";
import { mesActual } from "@/lib/estadisticas-period";
import {
  Settings2,
  TrendingUp,
  ChevronDown,
  AlertTriangle,
  Users,
  Loader2,
  Building2,
  Layers,
  X,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

// ── Animation variants ──────────────────────────────────────────────────────

const pageVariants = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

const skeletonVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};
const skeletonCard = {
  hidden: { opacity: 0, scale: 0.88 },
  show:   { opacity: 1, scale: 1, transition: { type: "spring" as const, stiffness: 260, damping: 24 } },
};

// ── Skeleton cards ──────────────────────────────────────────────────────────

function SkeletonCards() {
  return (
    <motion.div
      variants={skeletonVariants}
      initial="hidden"
      animate="show"
      style={{ display: "flex", gap: 12, padding: "12px 20px", overflowX: "auto" }}
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <motion.div key={i} variants={skeletonCard} style={{ flexShrink: 0 }}>
          <Skeleton
            style={{
              width: 180, height: 250, borderRadius: 16,
              background: "linear-gradient(135deg, rgba(168,85,247,0.08) 0%, rgba(168,85,247,0.04) 100%)",
            }}
          />
        </motion.div>
      ))}
    </motion.div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function EstadisticasPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const {
    mesesSeleccionados,
    setMesesSeleccionados,
    filterSucursal,
    setFilterSucursal,
    selectedTenantId,
    setSelectedTenantId,
    overlayMode,
    setOverlayMode,
  } = useEstadisticasStore();

  const [showIdealModal, setShowIdealModal] = useState(false);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  const isSuperadminOrDir =
    user?.is_superadmin || user?.rol?.toLowerCase() === "directorio";

  const distId: number = (selectedTenantId ?? user?.id_distribuidor ?? 0) as number;

  // Cross-tenant: fetch distribuidoras list for superadmin/directorio
  const { data: distribuidoras } = useQuery<Distribuidora[]>({
    queryKey: ["distribuidoras"],
    queryFn: () => fetchDistribuidoras(true),
    enabled: !!isSuperadminOrDir,
    staleTime: 1000 * 60 * 5,
  });

  // Init selectedTenantId if needed
  useEffect(() => {
    if (isSuperadminOrDir && !selectedTenantId && distribuidoras?.length) {
      setSelectedTenantId(distribuidoras[0].id);
    }
  }, [isSuperadminOrDir, selectedTenantId, distribuidoras, setSelectedTenantId]);

  // Meses disponibles
  const { data: mesesDisponibles = [], isLoading: loadingMeses } = useQuery<string[]>({
    queryKey: ["estadisticas-meses", distId],
    queryFn: () => fetchEstadisticasMeses(distId),
    enabled: !!distId,
    staleTime: 1000 * 60 * 5,
  });

  // Auto-select current month on first load
  useEffect(() => {
    if (mesesSeleccionados.length === 0 && mesesDisponibles.length > 0) {
      const current = mesActual();
      const toSelect = mesesDisponibles.includes(current)
        ? [current]
        : [mesesDisponibles[mesesDisponibles.length - 1]];
      setMesesSeleccionados(toSelect);
    }
  }, [mesesDisponibles, mesesSeleccionados, setMesesSeleccionados]);

  // Vendor cards
  const { data: vendors = [], isLoading: loadingCards, isFetching } = useQuery({
    queryKey: ["estadisticas-cartas", distId, mesesSeleccionados, filterSucursal],
    queryFn: () => fetchEstadisticasCartas(distId, mesesSeleccionados, filterSucursal),
    enabled: !!distId && mesesSeleccionados.length > 0,
    staleTime: 1000 * 60 * 3,
  });

  // Derive sucursales list for filter chips
  const sucursales = useMemo<string[]>(() => {
    const all = vendors.map((v) => v.sucursal).filter(Boolean) as string[];
    return Array.from(new Set(all)).sort();
  }, [vendors]);

  // Detect potentially empty data
  const hasVendors = vendors.length > 0;
  const isLoading = loadingMeses || loadingCards;

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
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--shelfy-bg)",
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
          style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}
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
                <p style={{ fontSize: 12, color: "var(--shelfy-muted)", margin: 0, fontWeight: 500 }}>
                  Rendimiento por vendedor
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* Overlay mode */}
              <OverlayPill mode={overlayMode} onChange={setOverlayMode} />

              {/* Config ideal button */}
              <button
                onClick={() => setShowIdealModal(true)}
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
            {/* Cross-tenant selector */}
            {isSuperadminOrDir && distribuidoras && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Building2 size={14} color="var(--shelfy-muted)" />
                <Select
                  value={String(selectedTenantId ?? "")}
                  onValueChange={(v) => {
                    setSelectedTenantId(Number(v));
                    setMesesSeleccionados([]);
                    setFilterSucursal(null);
                  }}
                >
                  <SelectTrigger
                    style={{
                      width: 200, height: 36, fontSize: 13, fontWeight: 600,
                      border: "1px solid rgba(168,85,247,0.25)",
                      borderRadius: 10, background: "white",
                    }}
                  >
                    <SelectValue placeholder="Distribuidora…" />
                  </SelectTrigger>
                  <SelectContent>
                    {distribuidoras.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Period selector */}
            <PeriodSelector mesesDisponibles={mesesDisponibles} />

            {/* Fetching indicator */}
            {isFetching && !isLoading && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 8 }}>
                <Loader2 size={13} style={{ color: "#a855f7", animation: "spin 1s linear infinite" }} />
                <span style={{ fontSize: 11, color: "var(--shelfy-muted)" }}>Actualizando…</span>
              </div>
            )}
          </div>

          {/* ── Sucursal filter chips ── */}
          {sucursales.length > 1 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 6,
                padding: "10px 24px 0",
              }}
            >
              <Layers size={13} color="var(--shelfy-muted)" />
              <button
                onClick={() => setFilterSucursal(null)}
                style={{
                  padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700,
                  cursor: "pointer",
                  border: `1px solid ${!filterSucursal ? "#a855f7" : "rgba(168,85,247,0.2)"}`,
                  background: !filterSucursal ? "rgba(168,85,247,0.1)" : "transparent",
                  color: !filterSucursal ? "#7C3AED" : "var(--shelfy-muted)",
                }}
              >
                Todas
              </button>
              {sucursales.map((suc) => (
                <button
                  key={suc}
                  onClick={() => setFilterSucursal(suc === filterSucursal ? null : suc)}
                  style={{
                    padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 600,
                    cursor: "pointer",
                    border: `1px solid ${filterSucursal === suc ? "#a855f7" : "rgba(168,85,247,0.2)"}`,
                    background: filterSucursal === suc ? "rgba(168,85,247,0.1)" : "transparent",
                    color: filterSucursal === suc ? "#7C3AED" : "var(--shelfy-muted)",
                    transition: "all 0.14s ease",
                  }}
                >
                  {suc}
                  {filterSucursal === suc && (
                    <X size={10} style={{ marginLeft: 4, display: "inline", verticalAlign: "middle" }} />
                  )}
                </button>
              ))}
            </div>
          )}

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
              {/* Loading skeleton */}
              {isLoading && (
                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <SkeletonCards />
                </motion.div>
              )}

              {/* No period selected */}
              {!isLoading && mesesSeleccionados.length === 0 && (
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
              {!isLoading && mesesSeleccionados.length > 0 && !hasVendors && (
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
              {!isLoading && hasVendors && (
                <motion.div
                  key="collection"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {/* Missing ideal config banner */}
                  <MissingIdealBanner onConfigure={() => setShowIdealModal(true)} vendors={vendors} />

                  <VendorCollection
                    vendors={vendors}
                    distId={distId}
                    meses={mesesSeleccionados}
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
}: {
  mode: OverlayMode;
  onChange: (m: OverlayMode) => void;
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
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "8px 12px", borderRadius: 10,
          border: `1px solid ${active.color}33`,
          background: mode !== "none" ? `${active.color}12` : "white",
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
