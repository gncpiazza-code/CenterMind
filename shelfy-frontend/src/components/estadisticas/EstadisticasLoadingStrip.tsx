"use client";

import { motion } from "framer-motion";

function ShimmerCard() {
  return (
    <div
      style={{
        width: 188,
        height: 268,
        flexShrink: 0,
        borderRadius: 18,
        padding: 3,
        background: "linear-gradient(145deg, #4c1d95 0%, #312e81 50%, #1e1b4b 100%)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.12) 50%, transparent 70%)",
          animation: "estad-shimmer 1.4s ease-in-out infinite",
        }}
      />
      <div
        style={{
          height: "100%",
          borderRadius: 15,
          background: "linear-gradient(180deg, #1e1b4b 0%, #0f172a 100%)",
          display: "flex",
          flexDirection: "column",
          padding: 10,
          gap: 8,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "rgba(255,255,255,0.08)",
            }}
          />
          <div
            style={{
              width: 56,
              height: 14,
              borderRadius: 6,
              background: "rgba(255,255,255,0.06)",
            }}
          />
        </div>
        <div
          style={{
            flex: 1,
            borderRadius: 12,
            background: "rgba(255,255,255,0.05)",
            border: "1px dashed rgba(168,85,247,0.25)",
          }}
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 4 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                height: 28,
                borderRadius: 6,
                background: "rgba(255,255,255,0.06)",
              }}
            />
          ))}
        </div>
        <div
          style={{
            height: 36,
            borderRadius: 8,
            background: "rgba(255,255,255,0.06)",
          }}
        />
      </div>
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
          gap: 12,
          padding: "4px 20px 20px",
          overflowX: "hidden",
        }}
      >
        {Array.from({ length: 8 }).map((_, i) => (
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
        @keyframes estad-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
