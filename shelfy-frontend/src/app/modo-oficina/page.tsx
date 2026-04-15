"use client";

import { useAuth } from "@/hooks/useAuth";
import { useEffect, useMemo, useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  fetchRanking,
  fetchKPIs,
  fetchLiveMapEvents,
  fetchEvolucionTiempo,
  getWSUrl,
} from "@/lib/api";
import { modoOficinaKeys } from "@/lib/query-keys";
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
  MapPin,
  User,
} from "lucide-react";
import { useRouter } from "next/navigation";
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
  const { user, hasPermiso } = useAuth();
  const router = useRouter();
  const distId = user?.id_distribuidor || 0;
  const canAccessModoOficina = !!user && hasPermiso("menu_modo_oficina");
  const queryClient = useQueryClient();

  const [newEvent, setNewEvent] = useState<LiveMapEvent | null>(null);
  // WS-pushed events (immediate display before query refetches)
  const [wsEvents, setWsEvents] = useState<LiveMapEvent[]>([]);
  const [mode, setMode] = useState<"kpi" | "map">("kpi");
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [kpiIndex, setKpiIndex] = useState(0);
  const [isImmersive, setIsImmersive] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [showPDVCard, setShowPDVCard] = useState(false);
  const [pointsAnim, setPointsAnim] = useState<{ points: number; vendedor: string } | null>(null);
  const seenIdsRef = useRef<Set<number>>(new Set());
  const mapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapRef = useRef<MapRef>(null);
  const prevRankingRef = useRef<VendedorRanking[]>([]);

  useEffect(() => {
    if (!user) return;
    if (canAccessModoOficina) return;
    router.replace("/dashboard");
  }, [user, canAccessModoOficina, router]);

  if (user && !canAccessModoOficina) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--shelfy-bg)] text-[var(--shelfy-text)]">
        <p className="text-sm text-[var(--shelfy-muted)]">Sin acceso a Modo Oficina.</p>
      </div>
    );
  }

  const getCurrentPeriodo = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  };
  const periodo = getCurrentPeriodo();

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

  // ── Data loading via TanStack Query ──────────────────────────────────────────
  const { data: ranking = [], isSuccess: rankingReady } = useQuery<VendedorRanking[]>({
    queryKey: modoOficinaKeys.ranking(distId, periodo),
    queryFn: () => fetchRanking(distId, periodo),
    enabled: !!distId,
    staleTime: 20 * 1000,
    refetchInterval: POLL_INTERVAL,
    placeholderData: (prev) => prev,
  });

  const { data: kpis = null } = useQuery<KPIs | null>({
    queryKey: modoOficinaKeys.kpis(distId, periodo),
    queryFn: () => fetchKPIs(distId, periodo),
    enabled: !!distId,
    staleTime: 20 * 1000,
    refetchInterval: POLL_INTERVAL,
    placeholderData: (prev) => prev,
  });

  const { data: events = [], isSuccess: eventsReady } = useQuery<LiveMapEvent[]>({
    queryKey: modoOficinaKeys.liveEvents(distId),
    queryFn: () => fetchLiveMapEvents(),
    enabled: !!distId,
    staleTime: 20 * 1000,
    refetchInterval: POLL_INTERVAL,
    placeholderData: (prev) => prev,
  });

  const { data: evolucion = [] } = useQuery<EvolucionTiempo[]>({
    queryKey: modoOficinaKeys.evolucion(distId, periodo),
    queryFn: () => fetchEvolucionTiempo(distId),
    enabled: !!distId,
    staleTime: 20 * 1000,
    refetchInterval: POLL_INTERVAL,
    placeholderData: (prev) => prev,
  });

  const loaded = rankingReady && eventsReady;
  const lastCheck = loaded ? new Date() : null;

  // Merge query events with WS-pushed events (deduplicated)
  const allEvents = useMemo(() => {
    const seen = new Set(events.map(e => e.id_ex));
    const extras = wsEvents.filter(e => !seen.has(e.id_ex));
    return [...extras, ...events];
  }, [events, wsEvents]);

  // NBA points-gain animation on ranking updates
  useEffect(() => {
    if (!rankingReady || prevRankingRef.current.length === 0) {
      prevRankingRef.current = ranking;
      return;
    }
    for (const newV of ranking) {
      const oldV = prevRankingRef.current.find(p => p.vendedor === newV.vendedor);
      if (oldV && newV.puntos > oldV.puntos) {
        setPointsAnim({ points: newV.puntos - oldV.puntos, vendedor: newV.vendedor });
        break;
      }
    }
    prevRankingRef.current = ranking;
  }, [ranking, rankingReady]);

  // Seed seenIds once after initial load
  useEffect(() => {
    if (eventsReady && seenIdsRef.current.size === 0 && events.length > 0) {
      events.forEach(evnt => seenIdsRef.current.add(evnt.id_ex));
    }
  }, [eventsReady, events]);

  // ── WebSocket ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!distId || !loaded) {
      console.log("⏳ Modo Oficina: Esperando distId o carga inicial para conectar WS...", { distId, loaded });
      return;
    }

    let socket: WebSocket | null = null;
    let alive = true;
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
              timestamp_evento: payload.timestamp_evento || new Date().toISOString(),
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

            // 1. Set event data FIRST (before triggering map mode)
            setNewEvent(evnt);
            setShowNotification(true);
            setTimeout(() => setShowNotification(false), 5000);

            // 2. Add to event list immediately (query will catch up on next refetch)
            setWsEvents(prev => [evnt, ...prev].slice(0, 50));
            queryClient.invalidateQueries({ queryKey: modoOficinaKeys.liveEvents(distId) });

            // 3. Show floating PDV profile card
            setShowPDVCard(true);

            // 4. Switch to Map mode + Immersive (AFTER data is set)
            setMode("map");
            setSelectedEventId(evnt.id_ex);
            setIsImmersive(true);

            // 5. Snapshot ranking for points diff detection
            prevRankingRef.current = ranking;

            // 6. Invalidate ranking/kpis so they refetch with the new exhibition
            queryClient.invalidateQueries({ queryKey: modoOficinaKeys.ranking(distId, periodo) });
            queryClient.invalidateQueries({ queryKey: modoOficinaKeys.kpis(distId, periodo) });

            // 7. Auto-revert after duration
            if (mapTimerRef.current) clearTimeout(mapTimerRef.current);
            mapTimerRef.current = setTimeout(() => {
              setMode("kpi");
              setSelectedEventId(null);
              setIsImmersive(false);
              setShowPDVCard(false);
            }, EVENT_SHOW_DURATION);
            }
        } catch (err) {
          console.error("❌ Error parseando mensaje WS:", err, "Raw data:", event.data);
        }
      };

      socket.onclose = () => {
        console.log("🔌 WS desconectado. Reintentando...");
        if (!alive) return;
        reconnectTimer = setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      alive = false;
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
              onClick={() => queryClient.invalidateQueries({ queryKey: ['dashboard'] })}
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
              highlightedEvent={mode === "map" ? newEvent : null}
            />

            {/* Floating PDV Profile Card */}
            <AnimatePresence>
              {showPDVCard && newEvent && mode === "map" && (
                <FloatingPDVCard
                  event={newEvent}
                  rankingEntry={ranking.find(r => r.vendedor === newEvent.vendedor_nombre) ?? null}
                  todayCount={events.filter(e => e.vendedor_nombre === newEvent.vendedor_nombre).length}
                />
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* NBA Points Animation */}
      <AnimatePresence>
        {pointsAnim && (
          <NBAPointsAnimation
            points={pointsAnim.points}
            vendedor={pointsAnim.vendedor}
            onComplete={() => setPointsAnim(null)}
          />
        )}
      </AnimatePresence>

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

// ── Floating PDV Profile Card ─────────────────────────────────────────────────
function FloatingPDVCard({
  event,
  rankingEntry,
  todayCount,
}: {
  event: LiveMapEvent;
  rankingEntry: VendedorRanking | null;
  todayCount: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -60, scale: 0.92 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -60, scale: 0.92 }}
      transition={{ type: "spring", stiffness: 280, damping: 24 }}
      style={{
        position: "absolute",
        top: 20,
        left: 20,
        zIndex: 100,
        background: "rgba(6, 13, 26, 0.82)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        border: "1px solid rgba(124,58,237,0.35)",
        borderRadius: 20,
        padding: "18px 22px",
        minWidth: 240,
        boxShadow: "0 8px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(124,58,237,0.15)",
      }}
    >
      {/* Live pulse */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: "#10b981", display: "inline-block", animation: "pulse 2s infinite" }} />
        <span style={{ fontSize: 10, fontWeight: 900, color: "#10b981", textTransform: "uppercase", letterSpacing: "0.18em" }}>
          En Camino
        </span>
      </div>

      {/* Seller */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(124,58,237,0.18)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(124,58,237,0.3)", flexShrink: 0 }}>
          <User size={20} color="#a78bfa" />
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 900, color: "#f1f5f9", lineHeight: 1.2 }}>{event.vendedor_nombre}</div>
          {rankingEntry?.sucursal && (
            <div style={{ fontSize: 10, color: "#7c3aed", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 2 }}>
              {rankingEntry.sucursal}
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <div style={{ flex: 1, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#10b981" }}>{todayCount}</div>
          <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.1em" }}>Exhib. hoy</div>
        </div>
        {rankingEntry && (
          <>
            <div style={{ flex: 1, background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#a78bfa" }}>{rankingEntry.puntos}</div>
              <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.1em" }}>Pts mes</div>
            </div>
            {rankingEntry.destacadas > 0 && (
              <div style={{ flex: 1, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#f59e0b" }}>{rankingEntry.destacadas}</div>
                <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.1em" }}>Dest.</div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Destination */}
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
          <MapPin size={12} color="#7c3aed" style={{ marginTop: 1, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>{event.cliente_nombre}</div>
            {event.localidad && (
              <div style={{ fontSize: 10, color: "#64748b", marginTop: 1 }}>{event.localidad}</div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── NBA Points Animation ───────────────────────────────────────────────────────
function NBAPointsAnimation({ points, vendedor, onComplete }: { points: number; vendedor: string; onComplete: () => void }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let frame: number;
    const duration = 1500;
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * points));
      if (progress < 1) {
        frame = requestAnimationFrame(animate);
      }
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [points]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.3 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.4 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      onAnimationComplete={() => setTimeout(onComplete, 1500)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 20000,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        background: "radial-gradient(ellipse at center, rgba(245,158,11,0.12) 0%, transparent 70%)",
      }}
    >
      <style>{`
        @keyframes goldGlow {
          0%, 100% { text-shadow: 0 0 20px rgba(245,158,11,0.8), 0 0 40px rgba(245,158,11,0.5), 0 0 80px rgba(245,158,11,0.3); }
          50% { text-shadow: 0 0 30px rgba(245,158,11,1), 0 0 60px rgba(245,158,11,0.7), 0 0 120px rgba(245,158,11,0.4); }
        }
        @keyframes particleBurst {
          0% { opacity: 1; transform: translate(0, 0) scale(1); }
          100% { opacity: 0; transform: translate(var(--tx), var(--ty)) scale(0); }
        }
      `}</style>

      {/* Particles */}
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = (i / 12) * 360;
        const dist = 80 + Math.random() * 60;
        const tx = Math.cos((angle * Math.PI) / 180) * dist;
        const ty = Math.sin((angle * Math.PI) / 180) * dist;
        return (
          <div key={i} style={{
            position: "absolute",
            width: 8, height: 8,
            borderRadius: 999,
            background: i % 3 === 0 ? "#f59e0b" : i % 3 === 1 ? "#fbbf24" : "#ffffff",
            ["--tx" as string]: `${tx}px`,
            ["--ty" as string]: `${ty}px`,
            animation: `particleBurst 1.2s ease-out ${i * 0.05}s both`,
          } as React.CSSProperties} />
        );
      })}

      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.5em", color: "#f59e0b", textTransform: "uppercase", marginBottom: 4, opacity: 0.8 }}>
        MVP
      </div>
      <div style={{ fontSize: 120, fontWeight: 950, color: "#f59e0b", lineHeight: 1, animation: "goldGlow 1s ease-in-out infinite", letterSpacing: "-0.03em" }}>
        +{count}
      </div>
      <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: "0.3em", color: "#fbbf24", textTransform: "uppercase", marginTop: 8, opacity: 0.85 }}>
        PTS
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#94a3b8", marginTop: 16, textTransform: "uppercase", letterSpacing: "0.15em" }}>
        {vendedor}
      </div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        style={{ marginTop: 12, background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.4)", borderRadius: 999, padding: "4px 20px", fontSize: 11, fontWeight: 900, color: "#f59e0b", letterSpacing: "0.3em", textTransform: "uppercase" }}
      >
        NIVEL ARRIBA
      </motion.div>
    </motion.div>
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
