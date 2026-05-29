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
  compact?: boolean;
}

function fmtKpi(n: number, pct = false) {
  if (pct) return `${n.toFixed(0)}%`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

export function VendorCard({ vendor, isActive, overlayMode, variants, compact = false }: VendorCardProps) {
  const setActiveVendorId = useEstadisticasStore((s) => s.setActiveVendorId);

  const cardW = compact ? 260 : undefined;
  const cardH = compact ? 368 : undefined;

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
          width: cardW ?? "100%",
          height: cardH ?? undefined,
          aspectRatio: cardH ? undefined : "260 / 368",
          borderRadius: 20,
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
        width: cardW ?? "100%",
        height: cardH ?? undefined,
        aspectRatio: cardH ? undefined : "260 / 368",
        flexShrink: 0,
        cursor: "pointer",
        borderRadius: 20,
        padding: 4,
        background: tierBorder,
        boxShadow:
          tier === "gold"
            ? "0 14px 36px rgba(245,158,11,0.35), 0 4px 12px rgba(0,0,0,0.15)"
            : "0 10px 28px rgba(124,58,237,0.24), 0 2px 8px rgba(0,0,0,0.1)",
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
            padding: "10px 12px 6px",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 8,
            position: "relative",
            zIndex: 1,
          }}
        >
          <div
            style={{
              minWidth: 48,
              height: 48,
              borderRadius: 12,
              background: scoreColor,
              border: "2px solid rgba(255,255,255,0.9)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
            }}
          >
            <span style={{ fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,0.85)", lineHeight: 1 }}>
              OVR
            </span>
            <span style={{ fontSize: 17, fontWeight: 900, color: "#fff", lineHeight: 1 }}>
              {vendor.score || "—"}
            </span>
          </div>
          {vendor.sucursal && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: "#fde68a",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                maxWidth: 96,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                paddingTop: 6,
              }}
            >
              {vendor.sucursal}
            </span>
          )}
        </div>

        {/* Radar */}
        <div style={{ flex: 1, padding: "0 6px", minHeight: 0, position: "relative", zIndex: 1 }}>
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
            gap: 5,
            padding: "6px 10px 8px",
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
                borderRadius: 8,
                padding: "5px 3px",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div style={{ fontSize: 8, color: "#94a3b8", fontWeight: 700 }}>{l}</div>
              <div style={{ fontSize: 13, color: "#f8fafc", fontWeight: 800 }}>{fmtKpi(v)}</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "10px 12px 12px",
            borderTop: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(0,0,0,0.45)",
            position: "relative",
            zIndex: 1,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 800,
              color: "#f8fafc",
              textAlign: "center",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              lineHeight: 1.25,
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
              margin: "5px 0 0",
              fontSize: 10,
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
              marginTop: 8,
              width: "100%",
              padding: "7px 0",
              borderRadius: 9,
              border: "1px solid rgba(168,85,247,0.5)",
              background: "rgba(124,58,237,0.35)",
              color: "#e9d5ff",
              fontSize: 10,
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
