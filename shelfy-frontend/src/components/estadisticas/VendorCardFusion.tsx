"use client";

import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import { VendorCardRadar } from "./VendorCardRadar";
import { VendorCardFusionStats } from "./VendorCardFusionStats";
import { useEstadisticasStore } from "@/store/useEstadisticasStore";
import type { VendorCartaResumen } from "@/lib/api";
import {
  scoreToTier,
  VENDOR_CARD_TIER_THEME,
  VENDOR_CARD_FACE_H,
  VENDOR_CARD_W,
  VENDOR_CARD_RADAR_H,
} from "@/lib/vendor-card-tier";
import type { VendorStatLeaderKey } from "@/lib/vendor-card-fusion-kpi";

export interface VendorCardFusionProps {
  vendor: VendorCartaResumen;
  isActive: boolean;
  overlayMode: "none" | "compania" | "distribuidor" | "ambos";
  variants?: Variants;
  compact?: boolean;
  nombreDistribuidora?: string | null;
  previewMode?: boolean;
  animationPaused?: boolean;
  statLeaders?: VendorStatLeaderKey[];
}

export function VendorCardFusion({
  vendor,
  isActive,
  overlayMode,
  variants,
  compact = false,
  nombreDistribuidora,
  previewMode = false,
  animationPaused = false,
  statLeaders = [],
}: VendorCardFusionProps) {
  const setActiveVendorId = useEstadisticasStore((s) => s.setActiveVendorId);
  const tier = scoreToTier(vendor.score);
  const theme = VENDOR_CARD_TIER_THEME[tier];
  const k = vendor.raw_kpis;
  const sucursalLabel = (vendor.sucursal || "—").toUpperCase();
  const distLabel = (nombreDistribuidora || "Distribuidora").toUpperCase();

  const openDetail = () => {
    if (previewMode) return;
    setActiveVendorId(vendor.id_vendedor);
  };

  if (isActive) {
    return (
      <div style={{ width: compact ? VENDOR_CARD_W : "100%", flexShrink: 0 }} aria-hidden>
        <div
          style={{
            height: VENDOR_CARD_FACE_H,
            borderRadius: 16,
            border: "2px dashed rgba(168,85,247,0.35)",
            background: "rgba(15,23,42,0.04)",
          }}
        />
        <div style={{ height: 40 }} />
      </div>
    );
  }

  return (
    <motion.div
      layout={!previewMode}
      layoutId={previewMode ? undefined : `vendor-card-${vendor.id_vendedor}`}
      variants={variants}
      style={{
        width: compact ? VENDOR_CARD_W : "100%",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <motion.div
        className={`vendor-fifa-card vendor-fifa-card--${tier}${animationPaused ? " vendor-fifa-card--paused" : ""}`}
        whileHover={{ y: -4, scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
        onClick={openDetail}
        style={{
          width: "100%",
          height: VENDOR_CARD_FACE_H,
          cursor: previewMode ? "default" : "pointer",
          borderRadius: 16,
          position: "relative",
          overflow: "hidden",
          background: theme.faceGradient,
          boxShadow: theme.shadow,
          display: "grid",
          gridTemplateRows: `auto ${VENDOR_CARD_RADAR_H}px auto auto`,
          padding: "14px 10px 10px",
          rowGap: 8,
          boxSizing: "border-box",
        }}
      >
        <div className="vendor-fifa-shimmer" aria-hidden>
          <div className="vendor-fifa-shimmer-beam" />
        </div>

        {/* Header — Figma */}
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            zIndex: 2,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 40,
                fontWeight: 900,
                lineHeight: 0.9,
                color: theme.text,
              }}
            >
              {vendor.score || "—"}
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: theme.text,
                marginTop: 4,
                letterSpacing: "0.03em",
              }}
            >
              {sucursalLabel}
            </div>
          </div>
          <div
            style={{
              padding: "5px 10px",
              borderRadius: 999,
              background: theme.distBadgeBg,
              fontSize: 8,
              fontWeight: 800,
              color: theme.distBadgeText,
              textAlign: "center",
              lineHeight: 1.15,
              maxWidth: 112,
            }}
          >
            {distLabel}
          </div>
        </header>

        {/* Radar — un solo panel oliva */}
        <div
          style={{
            borderRadius: 12,
            background: theme.radarPanel,
            overflow: "hidden",
            zIndex: 2,
          }}
        >
          <VendorCardRadar
            radar={vendor.radar}
            radarCompania={vendor.radar_ideal_compania}
            radarDist={vendor.radar_ideal_dist}
            size="fusion"
            axesMode="fusion"
            onDarkPanel
            showOverlayCompania={
              overlayMode === "compania" || overlayMode === "ambos"
            }
            showOverlayDist={
              overlayMode === "distribuidor" || overlayMode === "ambos"
            }
          />
        </div>

        {/* Stats 2×3 — Figma */}
        <div style={{ zIndex: 2 }}>
          <VendorCardFusionStats kpis={k} theme={theme} statLeaders={statLeaders} />
        </div>

        {/* Nameplate — Figma */}
        <div
          style={{
            borderRadius: 10,
            background: theme.nameBar,
            padding: "9px 8px",
            textAlign: "center",
            zIndex: 2,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 12,
              fontWeight: 900,
              color: theme.text,
              textTransform: "uppercase",
              letterSpacing: "0.02em",
              lineHeight: 1.2,
            }}
          >
            {vendor.nombre}
          </p>
        </div>
      </motion.div>

      <button
        type="button"
        className="vendor-fifa-ver-detalle"
        onClick={openDetail}
        disabled={previewMode}
        style={{
          marginTop: 8,
          width: "100%",
          padding: "9px 12px",
          borderRadius: 10,
          border: "none",
          background: "#0f172a",
          color: "#c4b5fd",
          fontSize: 11,
          fontWeight: 800,
          cursor: previewMode ? "not-allowed" : "pointer",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          opacity: previewMode ? 0.65 : 1,
        }}
      >
        Ver detalle
      </button>

      <style>{`
        .vendor-fifa-card--gold { --fifa-glow: ${VENDOR_CARD_TIER_THEME.gold.glow}; }
        .vendor-fifa-card--silver { --fifa-glow: ${VENDOR_CARD_TIER_THEME.silver.glow}; }
        .vendor-fifa-card--bronze { --fifa-glow: ${VENDOR_CARD_TIER_THEME.bronze.glow}; }
        .vendor-fifa-shimmer {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
          z-index: 1;
          border-radius: inherit;
        }
        .vendor-fifa-shimmer-beam {
          position: absolute;
          top: -50%;
          left: 0;
          width: 42%;
          height: 200%;
          background: linear-gradient(
            105deg,
            transparent 32%,
            rgba(255,255,255,0.05) 40%,
            rgba(255,255,255,0.42) 50%,
            rgba(255,255,255,0.05) 60%,
            transparent 68%
          );
          animation: vendor-fifa-sweep 3.6s ease-in-out infinite;
          transform: translateX(-130%) skewX(-14deg);
        }
        .vendor-fifa-card--paused .vendor-fifa-shimmer-beam {
          animation-play-state: paused;
        }
        @keyframes vendor-fifa-sweep {
          0%, 6% { transform: translateX(-130%) skewX(-14deg); opacity: 0; }
          14% { opacity: 0.85; }
          50% { opacity: 1; }
          88% { transform: translateX(320%) skewX(-14deg); opacity: 0.9; }
          96%, 100% { transform: translateX(320%) skewX(-14deg); opacity: 0; }
        }
        .vendor-fifa-ver-detalle:hover:not(:disabled) {
          background: #1e293b;
          color: #e9d5ff;
        }
      `}</style>
    </motion.div>
  );
}
