"use client";

import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import { Crown } from "lucide-react";
import { VendorCardRadar } from "./VendorCardRadar";
import { useEstadisticasStore } from "@/store/useEstadisticasStore";
import type { VendorCartaResumen } from "@/lib/api";

interface VendorCardProps {
  vendor: VendorCartaResumen;
  isActive: boolean;
  overlayMode: "none" | "compania" | "distribuidor" | "ambos";
  variants?: Variants;
}

function fmtKpi(n: number, pct = false) {
  if (pct) return `${n.toFixed(0)}%`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

export function VendorCard({ vendor, isActive, overlayMode, variants }: VendorCardProps) {
  const setActiveVendorId = useEstadisticasStore((s) => s.setActiveVendorId);

  const scoreColor =
    vendor.score >= 80 ? "#10B981" : vendor.score >= 50 ? "#F59E0B" : "#EF4444";

  const tier =
    vendor.score >= 85 ? "gold" : vendor.score >= 60 ? "silver" : "bronze";

  const tierBorder =
    tier === "gold"
      ? "linear-gradient(145deg, #fcd34d 0%, #f59e0b 45%, #b45309 100%)"
      : tier === "silver"
        ? "linear-gradient(145deg, #e2e8f0 0%, #94a3b8 50%, #64748b 100%)"
        : "linear-gradient(145deg, #d97706 0%, #92400e 100%)";

  if (isActive) {
    return (
      <motion.div
        style={{
          width: 188,
          height: 268,
          borderRadius: 18,
          background: "rgba(15,23,42,0.04)",
          border: "2px dashed rgba(168,85,247,0.35)",
          flexShrink: 0,
        }}
        aria-hidden="true"
      />
    );
  }

  const k = vendor.raw_kpis;

  return (
    <motion.div
      layout
      layoutId={`vendor-card-${vendor.id_vendedor}`}
      variants={variants}
      whileHover={{ y: -8, scale: 1.04 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 420, damping: 26 }}
      onClick={() => setActiveVendorId(vendor.id_vendedor)}
      style={{
        width: 188,
        height: 268,
        flexShrink: 0,
        cursor: "pointer",
        borderRadius: 18,
        padding: 3,
        background: tierBorder,
        boxShadow:
          tier === "gold"
            ? "0 12px 32px rgba(245,158,11,0.35), 0 4px 12px rgba(0,0,0,0.15)"
            : "0 8px 24px rgba(124,58,237,0.22), 0 2px 8px rgba(0,0,0,0.1)",
        scrollSnapAlign: "start",
      }}
    >
      <div
        style={{
          height: "100%",
          borderRadius: 15,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(180deg, #1e1b4b 0%, #312e81 38%, #0f172a 100%)",
          position: "relative",
        }}
      >
        {/* Shine */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(125deg, rgba(255,255,255,0.14) 0%, transparent 42%, transparent 100%)",
            pointerEvents: "none",
          }}
        />

        {/* Header */}
        <div
          style={{
            padding: "8px 10px 4px",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 6,
            position: "relative",
            zIndex: 1,
          }}
        >
          <div
            style={{
              minWidth: 40,
              height: 40,
              borderRadius: 10,
              background: scoreColor,
              border: "2px solid rgba(255,255,255,0.9)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
            }}
          >
            <span style={{ fontSize: 8, fontWeight: 800, color: "rgba(255,255,255,0.85)", lineHeight: 1 }}>
              OVR
            </span>
            <span style={{ fontSize: 14, fontWeight: 900, color: "#fff", lineHeight: 1 }}>
              {vendor.score || "—"}
            </span>
          </div>
          {vendor.sucursal && (
            <span
              style={{
                fontSize: 8,
                fontWeight: 700,
                color: "#fde68a",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                maxWidth: 72,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                paddingTop: 4,
              }}
            >
              {vendor.sucursal}
            </span>
          )}
        </div>

        {/* Radar */}
        <div style={{ flex: 1, padding: "0 4px", minHeight: 0, position: "relative", zIndex: 1 }}>
          <VendorCardRadar
            radar={vendor.radar}
            radarCompania={vendor.radar_ideal_compania}
            radarDist={vendor.radar_ideal_dist}
            size="sm"
            showOverlayCompania={overlayMode === "compania" || overlayMode === "ambos"}
            showOverlayDist={overlayMode === "distribuidor" || overlayMode === "ambos"}
          />
        </div>

        {/* Mini stats */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 3,
            padding: "4px 8px 6px",
            position: "relative",
            zIndex: 1,
          }}
        >
          {[
            { l: "Exh", v: k.exhibiciones },
            { l: "Cmp", v: k.compradores },
            { l: "Blt", v: k.bultos },
          ].map(({ l, v }) => (
            <div
              key={l}
              style={{
                textAlign: "center",
                background: "rgba(0,0,0,0.35)",
                borderRadius: 6,
                padding: "3px 2px",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div style={{ fontSize: 7, color: "#94a3b8", fontWeight: 700 }}>{l}</div>
              <div style={{ fontSize: 11, color: "#f8fafc", fontWeight: 800 }}>{fmtKpi(v)}</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "8px 10px 10px",
            borderTop: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(0,0,0,0.45)",
            position: "relative",
            zIndex: 1,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 12,
              fontWeight: 800,
              color: "#f8fafc",
              textAlign: "center",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              lineHeight: 1.2,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
            title={vendor.nombre}
          >
            {vendor.nombre}
          </p>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 9,
              color: "#94a3b8",
              textAlign: "center",
              fontWeight: 600,
            }}
          >
            {k.pdvs} PDV · {k.altas} altas
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setActiveVendorId(vendor.id_vendedor);
            }}
            style={{
              marginTop: 6,
              width: "100%",
              padding: "5px 0",
              borderRadius: 8,
              border: "1px solid rgba(168,85,247,0.5)",
              background: "rgba(124,58,237,0.35)",
              color: "#e9d5ff",
              fontSize: 9,
              fontWeight: 700,
              cursor: "pointer",
              letterSpacing: "0.06em",
            }}
          >
            VER DETALLE
          </button>
        </div>

        {(vendor.has_ideal_compania || vendor.has_ideal_distribuidora) && (
          <Crown
            size={12}
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              color: "#fbbf24",
              filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5))",
              zIndex: 2,
            }}
          />
        )}
      </div>
    </motion.div>
  );
}
