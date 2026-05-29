"use client";

/**
 * Mockup local — diseño final carta FIFA (animación brillo + glow).
 * Producción (/estadisticas) NO se modifica hasta aprobar este preview.
 *
 * Ver: npm run dev → http://localhost:3000/estadisticas/preview-fusion
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { VendorCardFusion } from "@/components/estadisticas/VendorCardFusion";
import type { VendorCartaResumen } from "@/lib/api";
import { computeStatLeadersByVendor } from "@/lib/vendor-card-fusion-kpi";

const MOCK_GOLD: VendorCartaResumen = {
  id_vendedor: "preview-gold",
  nombre: "FABRICIO VIDAL",
  sucursal: "Cordoba",
  score: 84,
  radar: {
    pdvs: 88,
    altas: 72,
    exhibiciones: 91,
    compradores: 76,
    bultos: 65,
    cobertura: 82,
    objetivos: 70,
  },
  radar_ideal_compania: {
    pdvs: 95,
    altas: 80,
    exhibiciones: 92,
    compradores: 85,
    bultos: 75,
    cobertura: 90,
    objetivos: 85,
  },
  radar_ideal_dist: {
    pdvs: 82,
    altas: 68,
    exhibiciones: 80,
    compradores: 72,
    bultos: 62,
    cobertura: 75,
    objetivos: 70,
  },
  raw_kpis: {
    pdvs: 288,
    altas: 47,
    exhibiciones: 288,
    compradores: 197,
    bultos: 47,
    cobertura_pct: 78,
    objetivos_pct: 65,
  },
  has_ideal_compania: true,
};

const MOCK_SILVER: VendorCartaResumen = {
  id_vendedor: "preview-silver",
  nombre: "MARIA LOPEZ",
  sucursal: "Resistencia",
  score: 72,
  radar: {
    pdvs: 70,
    altas: 55,
    exhibiciones: 68,
    compradores: 62,
    bultos: 58,
    cobertura: 65,
    objetivos: 60,
  },
  radar_ideal_compania: {
    pdvs: 78,
    altas: 70,
    exhibiciones: 75,
    compradores: 72,
    bultos: 68,
    cobertura: 74,
    objetivos: 70,
  },
  radar_ideal_dist: {
    pdvs: 65,
    altas: 58,
    exhibiciones: 62,
    compradores: 60,
    bultos: 55,
    cobertura: 58,
    objetivos: 55,
  },
  raw_kpis: {
    pdvs: 210,
    altas: 12,
    exhibiciones: 156,
    compradores: 98,
    bultos: 31,
    cobertura_pct: 62,
    objetivos_pct: 55,
  },
};

const MOCK_BRONZE: VendorCartaResumen = {
  id_vendedor: "preview-bronze",
  nombre: "JUAN PEREZ",
  sucursal: "Posadas",
  score: 58,
  radar: {
    pdvs: 52,
    altas: 40,
    exhibiciones: 48,
    compradores: 45,
    bultos: 38,
    cobertura: 42,
    objetivos: 35,
  },
  raw_kpis: {
    pdvs: 142,
    altas: 5,
    exhibiciones: 82,
    compradores: 54,
    bultos: 18,
    cobertura_pct: 41,
    objetivos_pct: 30,
  },
};

type OverlayMode = "none" | "compania" | "distribuidor" | "ambos";

const OVERLAY_OPTIONS: { value: OverlayMode; label: string }[] = [
  { value: "none", label: "Sin overlay" },
  { value: "compania", label: "Ideal compañía" },
  { value: "distribuidor", label: "Ideal distribuidora" },
  { value: "ambos", label: "Ambos" },
];

const ALL_MOCKS = [MOCK_GOLD, MOCK_SILVER, MOCK_BRONZE];

export default function PreviewFusionCardsPage() {
  const [overlayMode, setOverlayMode] = useState<OverlayMode>("compania");
  const [animationOn, setAnimationOn] = useState(true);
  const leadersByVendor = useMemo(
    () => computeStatLeadersByVendor(ALL_MOCKS),
    [],
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f172a",
        color: "#e2e8f0",
        padding: "28px 32px 48px",
        overflowX: "clip",
        overflowY: "visible",
      }}
    >
      <div style={{ maxWidth: 920, margin: "0 auto", overflow: "visible" }}>
        <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>
          Solo mockup local —{" "}
          <Link href="/estadisticas" style={{ color: "#a78bfa", textDecoration: "underline" }}>
            /estadisticas
          </Link>{" "}
          sigue con el diseño actual en producción.
        </p>
        <h1 style={{ margin: "8px 0 6px", fontSize: 24, fontWeight: 900, color: "#f8fafc" }}>
          Carta vendedor — diseño final (animada)
        </h1>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "#94a3b8", lineHeight: 1.5 }}>
          Tiers: Oro 75+ · Plata 66–74 · Bronce 0–65. Barrido de luz ~3.4s y pulso de borde ~2.8s.
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
            marginBottom: 28,
            padding: "14px 16px",
            borderRadius: 12,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(148,163,184,0.2)",
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: "#cbd5e1" }}>Overlay radar:</span>
          {OVERLAY_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setOverlayMode(o.value)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                border:
                  overlayMode === o.value
                    ? "1px solid #a78bfa"
                    : "1px solid rgba(148,163,184,0.35)",
                background:
                  overlayMode === o.value ? "rgba(167,139,250,0.2)" : "transparent",
                color: overlayMode === o.value ? "#e9d5ff" : "#94a3b8",
              }}
            >
              {o.label}
            </button>
          ))}
          <span style={{ width: 1, height: 24, background: "rgba(148,163,184,0.3)" }} />
          <button
            type="button"
            onClick={() => setAnimationOn((v) => !v)}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              border: "1px solid rgba(148,163,184,0.35)",
              background: animationOn ? "rgba(34,211,238,0.15)" : "transparent",
              color: animationOn ? "#67e8f9" : "#94a3b8",
            }}
          >
            Animación: {animationOn ? "ON" : "OFF"}
          </button>
        </div>

        <section
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginBottom: 40,
            padding: "32px 20px",
            borderRadius: 16,
            background: "linear-gradient(180deg, rgba(30,41,59,0.8) 0%, rgba(15,23,42,0.4) 100%)",
          }}
        >
          <p style={{ margin: "0 0 16px", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "#fbbf24" }}>
            HERO — ORO (como Figma)
          </p>
          <VendorCardFusion
            vendor={MOCK_GOLD}
            isActive={false}
            overlayMode={overlayMode}
            compact
            previewMode
            animationPaused={!animationOn}
            nombreDistribuidora="Tabaco & Hnos"
            statLeaders={leadersByVendor.get(MOCK_GOLD.id_vendedor) ?? []}
          />
        </section>

        <p style={{ margin: "0 0 16px", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#94a3b8" }}>
          LAS TRES VARIANTES
        </p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 28,
            justifyContent: "center",
          }}
        >
          {ALL_MOCKS.map((v) => (
            <div key={v.id_vendedor} style={{ textAlign: "center", overflow: "visible" }}>
              <VendorCardFusion
                vendor={v}
                isActive={false}
                overlayMode={overlayMode}
                compact
                previewMode
                animationPaused={!animationOn}
                nombreDistribuidora="Tabaco & Hnos"
                statLeaders={leadersByVendor.get(v.id_vendedor) ?? []}
              />
              <p style={{ margin: "10px 0 0", fontSize: 10, color: "#64748b" }}>
                {v.score} OVR
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
