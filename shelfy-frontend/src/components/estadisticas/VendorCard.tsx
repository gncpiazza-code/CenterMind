"use client";

import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import { VendorCardRadar } from "./VendorCardRadar";
import { useEstadisticasStore } from "@/store/useEstadisticasStore";
import type { VendorCartaResumen } from "@/lib/api";

interface VendorCardProps {
  vendor: VendorCartaResumen;
  isActive: boolean;
  overlayMode: "none" | "compania" | "distribuidor" | "ambos";
  variants?: Variants;
}

export function VendorCard({ vendor, isActive, overlayMode, variants }: VendorCardProps) {
  const setActiveVendorId = useEstadisticasStore((s) => s.setActiveVendorId);

  const scoreColor =
    vendor.score >= 80
      ? "#10B981"
      : vendor.score >= 50
      ? "#F59E0B"
      : "#EF4444";

  // When this card is the active one, render a dimmed placeholder
  if (isActive) {
    return (
      <motion.div
        style={{
          width: 180,
          height: 250,
          borderRadius: 16,
          background: "rgba(168,85,247,0.08)",
          border: "2px dashed rgba(168,85,247,0.25)",
          flexShrink: 0,
        }}
        aria-hidden="true"
      />
    );
  }

  return (
    <motion.div
      layout
      layoutId={`vendor-card-${vendor.id_vendedor}`}
      variants={variants}
      whileHover={{ y: -6, scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      onClick={() => setActiveVendorId(vendor.id_vendedor)}
      style={{
        width: 180,
        height: 250,
        flexShrink: 0,
        cursor: "pointer",
        borderRadius: 16,
        overflow: "hidden",
        position: "relative",
        background: "var(--shelfy-panel)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        border: "1px solid rgba(168,85,247,0.18)",
        boxShadow: "0 4px 16px rgba(168,85,247,0.12), 0 1px 4px rgba(0,0,0,0.06)",
        display: "flex",
        flexDirection: "column",
        scrollSnapAlign: "start",
      }}
      className="vendor-card-hover"
    >
      {/* Top gradient band */}
      <div
        style={{
          height: 30,
          background: "linear-gradient(135deg, #a855f7 0%, #7C3AED 100%)",
          flexShrink: 0,
          position: "relative",
        }}
      >
        {/* Score badge */}
        <div
          style={{
            position: "absolute",
            top: 6,
            left: 8,
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: scoreColor,
            border: "2.5px solid white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
            zIndex: 2,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: "white",
              lineHeight: 1,
              letterSpacing: "-0.5px",
            }}
          >
            {Math.round(vendor.score)}
          </span>
        </div>

        {/* Sucursal chip */}
        {vendor.sucursal && (
          <div
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              background: "rgba(255,255,255,0.2)",
              borderRadius: 6,
              padding: "2px 6px",
              fontSize: 8,
              color: "white",
              fontWeight: 600,
              maxWidth: 90,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {vendor.sucursal}
          </div>
        )}
      </div>

      {/* Radar chart center */}
      <div style={{ flex: 1, padding: "4px 8px 2px" }}>
        <VendorCardRadar
          radar={vendor.radar}
          radarCompania={vendor.radar_ideal_compania}
          radarDist={vendor.radar_ideal_dist}
          size="sm"
          showOverlayCompania={overlayMode === "compania" || overlayMode === "ambos"}
          showOverlayDist={overlayMode === "distribuidor" || overlayMode === "ambos"}
        />
      </div>

      {/* Bottom strip */}
      <div
        style={{
          padding: "6px 10px 10px",
          borderTop: "1px solid rgba(168,85,247,0.1)",
          background: "rgba(248,250,252,0.9)",
        }}
      >
        <p
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--shelfy-text)",
            lineHeight: 1.3,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 1,
            WebkitBoxOrient: "vertical",
            margin: 0,
          }}
          title={vendor.nombre}
        >
          {vendor.nombre}
        </p>
        <p
          style={{
            fontSize: 10,
            color: "var(--shelfy-muted)",
            margin: "2px 0 0",
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {vendor.id_vendedor}
        </p>
      </div>

      {/* Hover glow overlay — CSS-only via inline box-shadow in whileHover */}
      <style>{`
        .vendor-card-hover:hover {
          box-shadow: 0 8px 30px rgba(168,85,247,0.40), 0 2px 8px rgba(0,0,0,0.08) !important;
        }
      `}</style>
    </motion.div>
  );
}
