"use client";

import "./vendor-card-fusion.css";
import { AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
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
import { RecapEvolucionButton } from "./recap/RecapEvolucionModal";

/** Morph carta ↔ modal (compartido con VendorCardExpanded). */
export const VENDOR_CARD_LAYOUT_TRANSITION = {
  layout: {
    type: "spring" as const,
    stiffness: 200,
    damping: 30,
    mass: 0.85,
  },
};

export interface VendorCardFusionProps {
  vendor: VendorCartaResumen;
  isActive: boolean;
  overlayMode: "none" | "compania" | "distribuidor" | "ambos";
  compact?: boolean;
  nombreDistribuidora?: string | null;
  previewMode?: boolean;
  animationPaused?: boolean;
  /** Estira la carta al alto del contenedor (repaso comercial). */
  fillHeight?: boolean;
  statLeaders?: VendorStatLeaderKey[];
  onPrefetchDetalle?: () => void;
  /** Si se pasan, muestra botón "Ver evolución" del repaso comercial. */
  evolucionDistId?: number;
  evolucionMes?: string | null;
  evolucionVendorName?: string;
}

export function VendorCardFusion({
  vendor,
  isActive,
  overlayMode,
  compact = false,
  nombreDistribuidora,
  previewMode = false,
  animationPaused = false,
  fillHeight = false,
  statLeaders = [],
  onPrefetchDetalle,
  evolucionDistId,
  evolucionMes,
  evolucionVendorName,
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

  if (isActive && !previewMode) {
    return (
      <motion.div
        layoutId={`vendor-card-${vendor.id_vendedor}`}
        transition={VENDOR_CARD_LAYOUT_TRANSITION}
        aria-hidden
        style={{
          width: compact ? VENDOR_CARD_W : "100%",
          flexShrink: 0,
          height: VENDOR_CARD_FACE_H + 48,
          opacity: 0,
          pointerEvents: "none",
        }}
      />
    );
  }

  return (
    <motion.div
      layout={!previewMode}
      layoutId={previewMode ? undefined : `vendor-card-${vendor.id_vendedor}`}
      transition={VENDOR_CARD_LAYOUT_TRANSITION}
      style={{
        width: compact ? VENDOR_CARD_W : "100%",
        flexShrink: 0,
        height: fillHeight ? "100%" : undefined,
        minHeight: fillHeight ? 0 : undefined,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        className="vendor-fifa-card-shell"
        style={{ width: "100%", height: fillHeight ? "100%" : undefined, minHeight: fillHeight ? 0 : undefined, flex: fillHeight ? 1 : undefined, display: fillHeight ? "flex" : undefined, flexDirection: fillHeight ? "column" : undefined }}
      >
      <motion.div
        className={`vendor-fifa-card vendor-fifa-card--${tier}${animationPaused ? " vendor-fifa-card--paused" : ""}`}
        whileHover={fillHeight ? undefined : { y: -4, scale: 1.01 }}
        whileTap={fillHeight ? undefined : { scale: 0.99 }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
        onClick={openDetail}
        onPointerEnter={onPrefetchDetalle}
        style={{
          width: "100%",
          height: fillHeight ? "100%" : VENDOR_CARD_FACE_H,
          flex: fillHeight ? 1 : undefined,
          minHeight: fillHeight ? 0 : undefined,
          cursor: previewMode ? "default" : "pointer",
          position: "relative",
          background: theme.faceGradient,
          boxShadow: theme.shadow,
          ["--fifa-card-shadow" as string]: theme.shadow,
          ["--fifa-glow" as string]: theme.glow,
          display: "grid",
          gridTemplateRows: fillHeight
            ? "auto minmax(0, 1fr) auto auto"
            : `auto ${VENDOR_CARD_RADAR_H}px auto auto`,
          padding: fillHeight ? "16px 12px 12px" : "14px 10px 10px",
          rowGap: fillHeight ? 10 : 8,
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
            overflow: "visible",
            zIndex: 2,
            minHeight: fillHeight ? 0 : undefined,
            display: fillHeight ? "flex" : undefined,
            flexDirection: fillHeight ? "column" : undefined,
          }}
        >
          <VendorCardRadar
            radar={vendor.radar}
            radarCompania={vendor.radar_ideal_compania}
            radarDist={vendor.radar_ideal_dist}
            idealMetaCompania={vendor.ideal_meta_compania}
            idealMetaDist={vendor.ideal_meta_dist}
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
          {vendor.top_localidades ? (
            <p
              style={{
                margin: "3px 0 0",
                fontSize: 9,
                fontWeight: 600,
                color: "rgba(0,0,0,0.45)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                lineHeight: 1.2,
              }}
            >
              {vendor.top_localidades}
            </p>
          ) : null}
        </div>
      </motion.div>
      </div>

      {vendor.erp_sync_alert && (
        <div
          title={`${vendor.erp_sync_unmatched_pct ?? 0}% de ventas sin match ERP. Comunicate con desarrollo.`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 8px",
            background: "rgba(234,88,12,0.12)",
            border: "1px solid rgba(234,88,12,0.28)",
            borderRadius: 7,
            marginTop: 6,
          }}
        >
          <AlertTriangle size={12} color="#ea580c" strokeWidth={2.5} />
          <span style={{ fontSize: 10, fontWeight: 700, color: "#ea580c", lineHeight: 1.3 }}>
            Error de sincronización con ERP
            <br />
            <span style={{ fontWeight: 500 }}>Comunicate con desarrollo.</span>
          </span>
        </div>
      )}

      {!previewMode && evolucionDistId && evolucionMes && (
        <RecapEvolucionButton
          distId={evolucionDistId}
          vendedorId={vendor.id_vendedor}
          mes={evolucionMes}
          vendorName={evolucionVendorName ?? vendor.nombre}
          nombreDistribuidora={nombreDistribuidora}
          variant="card"
        />
      )}
    </motion.div>
  );
}
