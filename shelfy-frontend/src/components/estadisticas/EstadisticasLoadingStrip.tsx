"use client";

import { motion } from "framer-motion";
import { VENDOR_CARD_FACE_H, VENDOR_CARD_W } from "@/lib/vendor-card-tier";

function ShimmerCard() {
  return (
    <div style={{ width: VENDOR_CARD_W, flexShrink: 0 }}>
      <div
        style={{
          height: VENDOR_CARD_FACE_H,
          borderRadius: 16,
          background: "linear-gradient(145deg, #fff176 0%, #d4a017 55%, #c6a600 100%)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div className="estad-fifa-shimmer-beam" style={{ position: "absolute", inset: 0 }} />
        <div
          style={{
            height: "100%",
            padding: 12,
            display: "grid",
            gridTemplateRows: "auto 162px auto auto",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ width: 44, height: 44, borderRadius: 8, background: "rgba(0,0,0,0.08)" }} />
            <div style={{ width: 72, height: 20, borderRadius: 99, background: "rgba(93,84,38,0.5)" }} />
          </div>
          <div style={{ borderRadius: 12, background: "rgba(93,84,38,0.55)" }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 5 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ height: 36, borderRadius: 8, background: "rgba(93,84,38,0.45)" }} />
            ))}
          </div>
          <div style={{ height: 32, borderRadius: 10, background: "rgba(255,255,255,0.35)" }} />
        </div>
      </div>
      <div style={{ marginTop: 8, height: 36, borderRadius: 10, background: "#0f172a", opacity: 0.7 }} />
    </div>
  );
}

interface EstadisticasLoadingStripProps {
  label?: string;
}

export function EstadisticasLoadingStrip({
  label = "Armando cartas de vendedores…",
}: EstadisticasLoadingStripProps) {
  return (
    <div style={{ padding: "8px 0 4px" }}>
      <div
        style={{
          padding: "10px 24px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          alignItems: "center",
        }}
      >
        <motion.p
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.6, repeat: Infinity }}
          style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 700,
            color: "#7C3AED",
            letterSpacing: "0.04em",
          }}
        >
          {label}
        </motion.p>
        <div
          style={{
            width: "min(320px, 80%)",
            height: 6,
            borderRadius: 99,
            background: "rgba(168,85,247,0.15)",
            overflow: "hidden",
          }}
        >
          <motion.div
            style={{
              height: "100%",
              width: "40%",
              borderRadius: 99,
              background: "linear-gradient(90deg, #a855f7, #22d3ee)",
            }}
            animate={{ x: ["-100%", "350%"] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
        <p style={{ margin: 0, fontSize: 11, color: "var(--shelfy-muted)" }}>
          Consultando padrón, exhibiciones y ventas del período
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{
          display: "flex",
          gap: 16,
          padding: "4px 24px 20px",
          overflowX: "hidden",
        }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.35 }}
          >
            <ShimmerCard />
          </motion.div>
        ))}
      </motion.div>

      <style>{`
        .estad-fifa-shimmer-beam::after {
          content: "";
          position: absolute;
          top: -40%;
          left: -80%;
          width: 55%;
          height: 180%;
          background: linear-gradient(
            105deg,
            transparent 38%,
            rgba(255,255,255,0.08) 44%,
            rgba(255,255,255,0.35) 50%,
            rgba(255,255,255,0.08) 56%,
            transparent 62%
          );
          animation: estad-fifa-sweep 2.2s ease-in-out infinite;
          transform: skewX(-14deg);
        }
        @keyframes estad-fifa-sweep {
          0%, 12% { transform: translateX(0) skewX(-14deg); opacity: 0; }
          40% { opacity: 1; }
          70% { transform: translateX(280%) skewX(-14deg); opacity: 1; }
          88%, 100% { transform: translateX(280%) skewX(-14deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
