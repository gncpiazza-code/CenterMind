"use client";

import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  fetchRanking,
  fetchKPIs,
  fetchLiveMapEvents,
  fetchEvolucionTiempo,
  getWSUrl,
} from "@/lib/api";
import type { VendedorRanking, KPIs, LiveMapEvent, EvolucionTiempo } from "@/lib/api";
import type { MapRef } from "@/components/ui/map";
import dynamic from "next/dynamic";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
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
import { format } from "date-fns";
import { es } from "date-fns/locale";

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
  const [evolucion, setEvolucion] = useState<EvolucionTiempo[]>([]);
  const [newEvent, setNewEvent] = useState<LiveMapEvent | null>(null);
  const [mode, setMode] = useState<"kpi" | "map">("kpi");
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [kpiIndex, setKpiIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [isImmersive, setIsImmersive] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const seenIdsRef = useRef<Set<number>>(new Set());
  const mapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapRef = useRef<MapRef>(null);

  const getCurrentPeriodo = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  };

  const isFullscreen = typeof window !== 'undefined' && !!document.fullscreenElement;

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(e => {
        console.error(`Error attempting to enable full-screen mode: ${e.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  // ── Data loading ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async (isInitial = false) => {
    if (!distId) return;
    try {
      const periodo = getCurrentPeriodo();
      const [r, k, e, ev] = await Promise.all([
        fetchRanking(distId, periodo),
        fetchKPIs(distId, periodo),
        fetchLiveMapEvents(distId),
        fetchEvolucionTiempo(distId),
      ]);
      setRanking(r);
      setKpis(k);
      setEvents(e);
      setEvolucion(ev);
      setLastCheck(new Date());

      // Initialize seenIds on first load
      if (isInitial && e.length > 0) {
        e.forEach(evnt => seenIdsRef.current.add(evnt.id_ex));
      }
    } catch (err) {
      console.error("Error loading office mode data:", err);
    } finally {
      if (isInitial) setLoaded(true);
    }
  }, [distId]);

  useEffect(() => {
    loadData(true);
    const intv = setInterval(() => loadData(false), POLL_INTERVAL);
    return () => clearInterval(intv);
  }, [loadData]);

  // ── WebSocket ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!distId || !loaded) {
      console.log("⏳ Modo Oficina: Esperando distId o carga inicial para conectar WS...", { distId, loaded });
      return;
    }

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      const wsUrl = getWSUrl(distId);
      console.log("🔌 Modo Oficina: Intentando conectar a:", wsUrl);
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        console.log("✅ Modo Oficina: WebSocket CONECTADO correctamente");
      };

      socket.onerror = (err) => {
        console.error("❌ Modo Oficina: ERROR en WebSocket:", err);
      };

      socket.onmessage = (event) => {
        console.log("📥 WS Raw Data recibida:", event.data);
        try {
          const data = JSON.parse(event.data);
          if (data.type === "new_exhibition") {
            const payload = data.payload;

            // Mapping backend payload to LiveMapEvent interface
            const evnt: LiveMapEvent = {
              ...payload,
              id_ex:           payload.id_ex,
              id_dist:         payload.id_dist,
              vendedor_nombre: payload.vendedor_nombre,
              lat:             payload.lat || 0,
              lng:             payload.lng || 0,
              timestamp:       payload.timestamp_evento || new Date().toISOString(),
              id_cliente_erp:  payload.nro_cliente || "",
              cliente_nombre:  payload.nombre_fantasia || "Punto de Venta",
              drive_link:      payload.drive_link || "",
              domicilio:       payload.domicilio || "",
              localidad:       payload.localidad || "",
              telefono:        payload.telefono || "",
              fecha_alta:      payload.fecha_alta || "",
            };

            // Avoid duplicates
            if (seenIdsRef.current.has(evnt.id_ex)) return;
            seenIdsRef.current.add(evnt.id_ex);

            console.log("✨ Nueva exhibición mapeada:", evnt);

            // 1. Show notification
            setNewEvent(evnt);
            setShowNotification(true);
            setTimeout(() => setShowNotification(false), 5000);

            // 2. Add to event list
            setEvents(prev => [evnt, ...prev].slice(0, 50));

            // 3. Switch to Map mode + Immersive
            setMode("map");
            setSelectedEventId(evnt.id_ex);
            setIsImmersive(true);

            // 4. Update data (ranking/kpis) to reflect the new exhibition
            loadData(false);

            // 5. Auto-revert after duration
            if (mapTimerRef.current) clearTimeout(mapTimerRef.current);
            mapTimerRef.current = setTimeout(() => {
              setMode("kpi");
              setSelectedEventId(null);
              setIsImmersive(false);
            }, EVENT_SHOW_DURATION);
            }
        } catch (err) {
          console.error("❌ Error parseando mensaje WS:", err, "Raw data:", event.data);
        }
      };

      socket.onclose = () => {
        console.log("🔌 WS desconectado. Reintentando...");
        reconnectTimer = setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      if (socket) socket.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [distId, loaded]);

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
      id="modo-oficina-root"
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
      {!isImmersive && (
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
                <Zap size={12} color="#a78bfa" className="animate-pulse" />
                <span style={{ fontSize: 11, fontWeight: 800, color: "#a78bfa", letterSpacing: "0.1em" }}>
                  Viaje al PDV: {newEvent.vendedor_nombre}
                </span>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={toggleFullscreen}
              style={{
                background: isFullscreen ? "rgba(124,58,237,0.2)" : "rgba(255,255,255,0.05)",
                border: "1px solid rgba(124,58,237,0.4)",
                borderRadius: 8,
                padding: "6px 12px",
                color: isFullscreen ? "#a78bfa" : "#94a3b8",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              <Monitor size={12} />
              {isFullscreen ? "Salir Fullscreen" : "Pantalla Completa"}
            </button>
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
      )}

      {/* ── Notification Overlay ── */}
      {showNotification && newEvent && (
        <div
          style={{
            position: "fixed",
            top: 40,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10000,
            background: "rgba(124,58,237,0.9)",
            color: "white",
            padding: "12px 32px",
            borderRadius: 999,
            fontWeight: 900,
            fontSize: 24,
            letterSpacing: "0.05em",
            boxShadow: "0 0 50px rgba(124,58,237,0.6)",
            animation: "notificationPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) both",
            whiteSpace: "nowrap",
            border: "2px solid rgba(255,255,255,0.2)",
          }}
        >
          <style>{`
            @keyframes notificationPop {
              0% { opacity: 0; transform: translateX(-50%) scale(0.5); }
              100% { opacity: 1; transform: translateX(-50%) scale(1); }
            }
          `}</style>
          ✨ ¡Nueva Exhibición de {newEvent.vendedor_nombre}!
        </div>
      )}

      {/* ── Main split ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── LEFT: Ranking ── */}
        <div
          style={{
            width: isImmersive ? "0%" : "50%",
            borderRight: isImmersive ? "none" : "1px solid rgba(255,255,255,0.05)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            transition: "width 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
            opacity: isImmersive ? 0 : 1,
            pointerEvents: isImmersive ? "none" : "auto",
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
            width: isImmersive ? "100%" : "50%",
            display: "flex",
            flexDirection: "column",
            position: "relative",
            overflow: "hidden",
            transition: "width 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
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
            {slide && <KpiDisplay slide={slide} index={kpiIndex} evolucion={evolucion} />}
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
              ref={mapRef}
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
function KpiDisplay({ slide, index, evolucion }: { slide: any; index: number; evolucion: EvolucionTiempo[] }) {
  return (
    <div
      key={index}
      style={{
        width: "100%",
        maxWidth: 600,
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.05)",
        borderRadius: 40,
        padding: "60px 40px",
        textAlign: "center",
        animation: "slideIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) both",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <style>{`
        @keyframes slideIn {
          0% { opacity: 0; transform: translateY(40px) scale(0.95); filter: blur(10px); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
      `}</style>

      {/* Background glow */}
      <div
        style={{
          position: "absolute",
          top: "-20%",
          left: "-20%",
          width: "140%",
          height: "140%",
          background: "radial-gradient(circle at 50% 50%, " + slide.accent + " 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative", zIndex: 1 }}>
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 24,
            background: "rgba(255,255,255,0.03)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 32px",
            color: slide.color,
            boxShadow: "0 20px 40px " + slide.accent,
          }}
        >
          {slide.icon}
        </div>

        <h2 style={{ fontSize: 16, fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4em", marginBottom: 12 }}>
          {slide.label}
        </h2>

        <div style={{ fontSize: 110, fontWeight: 950, color: "white", letterSpacing: "-0.04em", lineHeight: 1, textShadow: "0 10px 30px rgba(0,0,0,0.3)" }}>
          {slide.value}
        </div>

        {evolucion.length > 0 && (
          <div style={{ marginTop: 40, height: 100, width: "100%", opacity: 0.6 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={evolucion}>
                <defs>
                  <linearGradient id={"grad-" + index} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={slide.color} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={slide.color} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <Area 
                  type="monotone" 
                  dataKey="total" 
                  stroke={slide.color} 
                  strokeWidth={3}
                  fill={"url(#grad-" + index + ")"} 
                  animationDuration={2000}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
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
        bottom: 40,
        right: 40,
        width: 400,
        background: "rgba(15, 23, 42, 0.9)",
        backdropFilter: "blur(20px)",
        borderRadius: 24,
        padding: 24,
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
        animation: "cardFlyIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) both",
      }}
    >
      <style>{`
        @keyframes cardFlyIn {
          0% { opacity: 0; transform: translateX(100px); }
          100% { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      <div style={{ display: "flex", gap: 20 }}>
        {/* Photo Thumbnail */}
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: 16,
            overflow: "hidden",
            background: "#1e293b",
            flexShrink: 0,
            border: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          {imgUrl ? (
            <img 
              src={imgUrl.includes('supabase.co') ? imgUrl : "https://api.shelfycenter.com/api/proxy-image?url=" + encodeURIComponent(imgUrl)} 
              alt="Preview" 
              style={{ width: "100%", height: "100%", objectFit: "cover" }} 
              onError={(e) => {
                // Fallback to proxy if direct fails, or vice versa
                const target = e.currentTarget;
                if (!target.src.includes('proxy-image')) {
                  target.src = "https://api.shelfycenter.com/api/proxy-image?url=" + encodeURIComponent(imgUrl);
                } else {
                  target.src = "/placeholder-image.png"; // or just empty
                }
              }}
            />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#334155" }}>
              <Zap size={32} />
            </div>
          )}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 900, color: "#7c3aed", textTransform: "uppercase", letterSpacing: "0.2em", marginBottom: 6 }}>
            Nueva Exhibición
          </div>
          <div style={{ fontSize: 18, fontWeight: 900, color: "white", marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {event.cliente_nombre}
          </div>
          <div style={{ fontSize: 13, color: "#94a3b8", fontWeight: 700 }}>
            {event.vendedor_nombre}
          </div>
          
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: 999, background: "#10b981", animation: "pulse 2s infinite" }} />
            <span style={{ fontSize: 11, fontWeight: 800, color: "#10b981", textTransform: "uppercase" }}>En Tiempo Real</span>
          </div>
          
          {/* Enriched PDV Info */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 20px", marginTop: 15, borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 12 }}>
            <div>
              <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", fontWeight: 900 }}>Dirección</div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>{event.domicilio || "—"}</div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", fontWeight: 900 }}>Localidad</div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>{event.localidad || "—"}</div>
            </div>
            {(event.lat === 0 || event.lng === 0) && (
              <div style={{ gridColumn: "span 2", marginTop: 4 }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(239,68,68,0.1)", color: "#ef4444", padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 700, textTransform: "uppercase" }}>
                  ⚠️ PDV sin geolocalización (viaje cancelado)
                </div>
              </div>
            )}
            <div>
              <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", fontWeight: 900 }}>Teléfono</div>
              <div style={{ fontSize: 11, color: "#10b981", fontWeight: 700 }}>{event.telefono || "—"}</div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", fontWeight: 900 }}>Alta</div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>{event.fecha_alta ? format(new Date(event.fecha_alta), "dd/MM/yyyy") : "—"}</div>
            </div>
          </div>
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
      if (container) container.style.transform = "translateY(-" + posRef.current + "px)";
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
              key={i + "-" + v.vendedor}
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
                <span style={{ fontSize: 12, fontWeight: 900, color: color }}>
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
