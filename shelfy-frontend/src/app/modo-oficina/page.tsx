"use client";

import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  fetchRanking,
  fetchKPIs,
  fetchLiveMapEvents,
  type VendedorRanking,
  type KPIs,
  type LiveMapEvent,
} from "@/lib/api";
import dynamic from "next/dynamic";
import {
  Monitor,
  X,
  Star,
  TrendingUp,
  CheckCircle,
  XCircle,
  Award,
  RotateCcw,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";

const MapaExhibiciones = dynamic(
  () => import("@/app/admin/components/MapaExhibiciones"),
  { ssr: false }
);

// ── Constants ──────────────────────────────────────────────────────────────────
const KPI_DURATION = 10_000; // 10s per KPI slide
const EVENT_SHOW_DURATION = 8_000; // 8s map after new exhibit
const POLL_INTERVAL = 30_000; // 30s poll

// ── Helpers ────────────────────────────────────────────────────────────────────
function medal(i: number) {
  if (i === 0) return "🥇";
  if (i === 1) return "🥈";
  if (i === 2) return "🥉";
  return null;
}

function approval(v: VendedorRanking) {
  const total = v.aprobadas + v.rechazadas;
  return total ? Math.round((v.aprobadas / total) * 100) : 0;
}

function semaforo(pct: number) {
  if (pct >= 75) return "#10b981";
  if (pct >= 50) return "#f59e0b";
  return "#ef4444";
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function ModoOficinaPage() {
  const { user } = useAuth();
  const router = useRouter();
  const distId = user?.id_distribuidor || 0;

  const [ranking, setRanking] = useState<VendedorRanking[]>([]);
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [events, setEvents] = useState<LiveMapEvent[]>([]);
  const [newEvent, setNewEvent] = useState<LiveMapEvent | null>(null);
  const [mode, setMode] = useState<"kpi" | "map">("kpi");
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [kpiIndex, setKpiIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const seenIdsRef = useRef<Set<number>>(new Set());
  const mapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Data loading ─────────────────────────────────────────────────────────────
  const loadData = useCallback(
    async (isFirst = false) => {
      if (!distId) return;
      const today = new Date();
      const offset = today.getTimezoneOffset();
      const local = new Date(today.getTime() - offset * 60 * 1000);
      const dateStr = local.toISOString().split("T")[0];

      const [r, k, ev] = await Promise.allSettled([
        fetchRanking(distId, "mes", undefined, 999),
        fetchKPIs(distId, "mes"),
        fetchLiveMapEvents(undefined, dateStr),
      ]);

      if (r.status === "fulfilled") setRanking(r.value);
      if (k.status === "fulfilled") setKpis(k.value);
      if (ev.status === "fulfilled") {
        const valid = ev.value.filter(
          (e) => e.lat && e.lon && e.lat !== 0 && e.lon !== 0
        );
        setEvents(valid);

        if (!isFirst) {
          const fresh = valid.filter((e) => !seenIdsRef.current.has(e.id_ex));
          if (fresh.length > 0) {
            triggerEvent(fresh[fresh.length - 1]);
          }
        }

        seenIdsRef.current = new Set(valid.map((e) => e.id_ex));
      }

      setLastCheck(new Date());
      if (isFirst) setLoaded(true);
    },
    [distId]
  );

  function triggerEvent(event: LiveMapEvent) {
    setNewEvent(event);
    setMode("map");
    setSelectedEventId(event.id_ex);
    if (mapTimerRef.current) clearTimeout(mapTimerRef.current);
    mapTimerRef.current = setTimeout(() => {
      setMode("kpi");
      setNewEvent(null);
      setSelectedEventId(null);
    }, EVENT_SHOW_DURATION);
  }

  // Initial + polling
  useEffect(() => {
    if (distId) loadData(true);
  }, [distId]);

  useEffect(() => {
    const interval = setInterval(() => loadData(false), POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [loadData]);

  // ── KPI carousel ─────────────────────────────────────────────────────────────
  const totalDestacadas = ranking.reduce((s, v) => s + (v.destacadas || 0), 0);

  const kpiSlides = kpis
    ? [
        {
          label: "Total Enviadas",
          value: kpis.total.toLocaleString("es-AR"),
          color: "#f59e0b",
          accent: "rgba(245,158,11,0.15)",
          icon: <TrendingUp size={36} />,
        },
        {
          label: "Aprobadas",
          value: kpis.aprobadas.toLocaleString("es-AR"),
          color: "#10b981",
          accent: "rgba(16,185,129,0.15)",
          icon: <CheckCircle size={36} />,
        },
        {
          label: "Rechazadas",
          value: kpis.rechazadas.toLocaleString("es-AR"),
          color: "#ef4444",
          accent: "rgba(239,68,68,0.15)",
          icon: <XCircle size={36} />,
        },
        {
          label: "% Aprobación",
          value:
            kpis.total > 0
              ? `${Math.round((kpis.aprobadas / kpis.total) * 100)}%`
              : "0%",
          color: "#7c3aed",
          accent: "rgba(124,58,237,0.15)",
          icon: <Award size={36} />,
        },
        {
          label: "Destacadas",
          value: totalDestacadas.toLocaleString("es-AR"),
          color: "#a78bfa",
          accent: "rgba(167,139,250,0.15)",
          icon: <Star size={36} />,
        },
      ]
    : [];

  useEffect(() => {
    if (mode !== "kpi" || kpiSlides.length === 0) return;
    const interval = setInterval(
      () => setKpiIndex((i) => (i + 1) % kpiSlides.length),
      KPI_DURATION
    );
    return () => clearInterval(interval);
  }, [mode, kpiSlides.length]);

  // ── Render ────────────────────────────────────────────────────────────────────
  const slide = kpiSlides[kpiIndex];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#060d1a",
        color: "#e2e8f0",
        display: "flex",
        flexDirection: "column",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        overflow: "hidden",
        zIndex: 9999,
      }}
    >
      {/* ── Top bar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(6,13,26,0.9)",
          backdropFilter: "blur(12px)",
          flexShrink: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Monitor size={18} color="#7c3aed" />
          <span style={{ fontWeight: 900, fontSize: 13, letterSpacing: "0.18em", textTransform: "uppercase", color: "#94a3b8" }}>
            Modo Oficina
          </span>
          {lastCheck && (
            <span style={{ fontSize: 10, color: "#334155", marginLeft: 8 }}>
              Actualizado {lastCheck.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {mode === "map" && newEvent && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(124,58,237,0.2)",
                border: "1px solid rgba(124,58,237,0.4)",
                borderRadius: 999,
                padding: "3px 12px",
                marginLeft: 12,
              }}
            >
              <Zap size={12} color="#a78bfa" />
              <span style={{ fontSize: 11, fontWeight: 800, color: "#a78bfa", letterSpacing: "0.1em" }}>
                Nueva exhibición en vivo
              </span>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => loadData(false)}
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              padding: "6px 12px",
              color: "#94a3b8",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            <RotateCcw size={12} />
            Actualizar
          </button>
          <button
            onClick={() => router.back()}
            style={{
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: 8,
              padding: "6px 12px",
              color: "#f87171",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            <X size={12} />
            Salir
          </button>
        </div>
      </div>

      {/* ── Main split ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── LEFT: Ranking ── */}
        <div
          style={{
            width: "50%",
            borderRight: "1px solid rgba(255,255,255,0.05)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Ranking header */}
          <div
            style={{
              padding: "16px 24px 12px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              flexShrink: 0,
              background: "rgba(124,58,237,0.06)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Star size={16} color="#f59e0b" />
              <span style={{ fontWeight: 900, fontSize: 13, letterSpacing: "0.15em", textTransform: "uppercase", color: "#64748b" }}>
                Ranking del Mes
              </span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: "#475569", fontWeight: 700 }}>
                {ranking.length} vendedores
              </span>
            </div>
            {/* Column headers */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "40px 1fr 50px 60px 60px 70px",
                gap: 8,
                marginTop: 10,
                padding: "0 4px",
              }}
            >
              {["#", "Vendedor", "Aprob", "★ Dest", "% Ok", "Puntos"].map((h) => (
                <span
                  key={h}
                  style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.15em", textTransform: "uppercase", color: "#334155", textAlign: h === "Vendedor" ? "left" : "right" }}
                >
                  {h}
                </span>
              ))}
            </div>
          </div>

          {/* Scrolling ranking list */}
          <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
            <RankingScroller ranking={ranking} loaded={loaded} />
          </div>
        </div>

        {/* ── RIGHT: KPI carousel / Map ── */}
        <div
          style={{
            width: "50%",
            display: "flex",
            flexDirection: "column",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* KPI Carousel */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: mode === "kpi" ? 1 : 0,
              transition: "opacity 0.5s ease",
              pointerEvents: mode === "kpi" ? "auto" : "none",
              padding: 40,
            }}
          >
            {slide && <KpiDisplay slide={slide} index={kpiIndex} />}
          </div>

          {/* Map overlay */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: mode === "map" ? 1 : 0,
              transition: "opacity 0.5s ease",
              pointerEvents: mode === "map" ? "auto" : "none",
            }}
          >
            <MapaExhibiciones
              events={events}
              height="100%"
              theme="dark"
              selectedEventId={selectedEventId}
              showRoutes={false}
            />

            {/* Event card overlay */}
            {newEvent && mode === "map" && (
              <EventCard event={newEvent} />
            )}
          </div>
        </div>
      </div>

      {/* ── KPI dot indicators ── */}
      {mode === "kpi" && kpiSlides.length > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: 16,
            right: 24,
            display: "flex",
            gap: 6,
          }}
        >
          {kpiSlides.map((_, i) => (
            <button
              key={i}
              onClick={() => setKpiIndex(i)}
              style={{
                width: i === kpiIndex ? 20 : 8,
                height: 8,
                borderRadius: 4,
                background: i === kpiIndex ? "#7c3aed" : "rgba(255,255,255,0.15)",
                border: "none",
                cursor: "pointer",
                transition: "all 0.3s ease",
                padding: 0,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── KPI Display ────────────────────────────────────────────────────────────────
function KpiDisplay({ slide, index }: { slide: any; index: number }) {
  return (
    <div
      key={index}
      style={{
        textAlign: "center",
        animation: "kpiFadeIn 0.6s ease both",
        width: "100%",
        maxWidth: 400,
      }}
    >
      <style>{`
        @keyframes kpiFadeIn {
          from { opacity: 0; transform: translateY(24px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: slide.accent,
          color: slide.color,
          marginBottom: 24,
        }}
      >
        {slide.icon}
      </div>
      <div
        style={{
          fontSize: "clamp(60px, 10vw, 100px)",
          fontWeight: 900,
          letterSpacing: "-0.04em",
          color: slide.color,
          lineHeight: 1,
          textShadow: `0 0 60px ${slide.accent}`,
        }}
      >
        {slide.value}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 800,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "#475569",
          marginTop: 12,
        }}
      >
        {slide.label}
      </div>
    </div>
  );
}

// ── Event Card ────────────────────────────────────────────────────────────────
function EventCard({ event }: { event: LiveMapEvent }) {
  const imgUrl = event.drive_link || null;
  return (
    <div
      style={{
        position: "absolute",
        bottom: 24,
        left: 24,
        right: 24,
        background: "rgba(6,13,26,0.92)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(124,58,237,0.4)",
        borderRadius: 20,
        padding: "16px 20px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        animation: "cardSlideUp 0.5s ease both",
        boxShadow: "0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,58,237,0.2)",
        zIndex: 20,
      }}
    >
      <style>{`
        @keyframes cardSlideUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes cardPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(124,58,237,0.4); }
          50% { box-shadow: 0 0 0 8px rgba(124,58,237,0); }
        }
      `}</style>

      {/* Photo thumbnail */}
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 12,
          overflow: "hidden",
          flexShrink: 0,
          background: "rgba(124,58,237,0.1)",
          border: "1px solid rgba(124,58,237,0.3)",
          animation: "cardPulse 2s ease infinite",
        }}
      >
        {imgUrl ? (
          <img
            src={imgUrl}
            alt="Exhibición"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#7c3aed" }}>
            <Zap size={24} />
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 900,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#a78bfa",
              background: "rgba(124,58,237,0.15)",
              border: "1px solid rgba(124,58,237,0.3)",
              borderRadius: 6,
              padding: "2px 8px",
            }}
          >
            ⚡ En Vivo
          </div>
          <span style={{ fontSize: 10, color: "#475569", fontWeight: 700 }}>
            {new Date(event.timestamp_evento).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <div style={{ fontWeight: 900, fontSize: 15, color: "#f1f5f9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {event.vendedor_nombre}
        </div>
        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {event.cliente_nombre || `Cliente #${event.nro_cliente}`}
          {event.nombre_dist && (
            <span style={{ color: "#334155", marginLeft: 6 }}>· {event.nombre_dist}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Ranking Scroller ──────────────────────────────────────────────────────────
function RankingScroller({ ranking, loaded }: { ranking: VendedorRanking[]; loaded: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const posRef = useRef(0);
  const SPEED = 0.5; // px per frame (~30px/s at 60fps)

  useEffect(() => {
    if (!loaded || ranking.length === 0) return;
    const container = containerRef.current;
    if (!container) return;

    const half = container.scrollHeight / 2;
    if (half <= 0) return;

    function animate() {
      posRef.current += SPEED;
      if (posRef.current >= half) posRef.current -= half;
      if (container) container.style.transform = `translateY(-${posRef.current}px)`;
      frameRef.current = requestAnimationFrame(animate);
    }

    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [loaded, ranking.length]);

  if (!loaded) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#334155", fontSize: 12 }}>
        Cargando ranking...
      </div>
    );
  }

  const rows = ranking.length < 8 ? [...ranking, ...ranking] : ranking;

  return (
    <div style={{ height: "100%", overflow: "hidden" }}>
      <div ref={containerRef}>
        {/* Render twice for seamless loop */}
        {[...rows, ...rows].map((v, i) => {
          const realIdx = i % ranking.length;
          const pct = approval(v);
          const color = semaforo(pct);
          return (
            <div
              key={`${i}-${v.vendedor}`}
              style={{
                display: "grid",
                gridTemplateColumns: "40px 1fr 50px 60px 60px 70px",
                gap: 8,
                padding: "10px 24px 10px 20px",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                alignItems: "center",
                background:
                  realIdx === 0
                    ? "rgba(245,158,11,0.05)"
                    : realIdx === 1
                    ? "rgba(148,163,184,0.03)"
                    : realIdx === 2
                    ? "rgba(234,88,12,0.03)"
                    : "transparent",
              }}
            >
              {/* Position */}
              <div
                style={{
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 8,
                  background:
                    realIdx === 0
                      ? "rgba(245,158,11,0.2)"
                      : realIdx === 1
                      ? "rgba(148,163,184,0.15)"
                      : realIdx === 2
                      ? "rgba(234,88,12,0.15)"
                      : "rgba(255,255,255,0.04)",
                  fontSize: realIdx < 3 ? 16 : 11,
                  fontWeight: 900,
                  color:
                    realIdx === 0 ? "#f59e0b" : realIdx === 1 ? "#94a3b8" : realIdx === 2 ? "#ea580c" : "#475569",
                }}
              >
                {medal(realIdx) ?? realIdx + 1}
              </div>

              {/* Vendor name */}
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: 13,
                    color: realIdx < 3 ? "#f1f5f9" : "#94a3b8",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {v.vendedor}
                </div>
                {v.sucursal && (
                  <div style={{ fontSize: 9, color: "#334155", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 1 }}>
                    {v.sucursal}
                  </div>
                )}
              </div>

              {/* Aprobadas */}
              <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: "#10b981" }}>
                {v.aprobadas}
              </div>

              {/* Destacadas */}
              <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: "#a78bfa" }}>
                {v.destacadas > 0 ? (
                  <span>
                    <Star size={10} color="#a78bfa" style={{ display: "inline", verticalAlign: "middle", marginRight: 2 }} />
                    {v.destacadas}
                  </span>
                ) : (
                  <span style={{ color: "#1e293b" }}>—</span>
                )}
              </div>

              {/* % Aprobación */}
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: 12, fontWeight: 900, color }}>
                  {pct}%
                </span>
              </div>

              {/* Puntos */}
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: 15, fontWeight: 900, color: realIdx < 3 ? "#f1f5f9" : "#64748b" }}>
                  {v.puntos}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
