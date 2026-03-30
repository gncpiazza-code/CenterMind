"use client";
import { useEffect, useState } from "react";

const SLIDES = [
  {
    title: "Video Tutorial",
    subtitle: "¡Novedades de la actualización! Conocé las nuevas herramientas de Shelfy en 1 minuto.",
  },
  {
    title: "Panel de Supervisión",
    subtitle: "Tu herramienta completa para gestionar rutas, clientes y cartera.",
  },
  {
    title: "El mapa interactivo",
    subtitle: "Visualizá el estado de cada PDV en tiempo real.",
  },
  {
    title: "Vendedores y rutas",
    subtitle: "Navegá la jerarquía de sucursales, vendedores y rutas.",
  },
  {
    title: "ShelfyMaps ★ Nuevo",
    subtitle: "Mapa de pantalla completa pensado para el celular.",
  },
  {
    title: "Cuentas corrientes",
    subtitle: "Deuda actualizada automáticamente cada día a las 7am.",
  },
  {
    title: "Desde el celular",
    subtitle: "Diseñado para supervisores en movimiento.",
  },
];

const PIN_COLORS = {
  green: "#22c55e",
  blue: "#3b82f6",
  amber: "#f59e0b",
  red: "#ef4444",
};

export default function TutorialModal({ onComplete }: { onComplete?: () => void }) {
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState(0);
  const [dir, setDir] = useState<"forward" | "back">("forward");
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    // Show immediately
    setVisible(true);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!visible) return;
      if (e.key === "ArrowRight" || e.key === "Enter") handleNext();
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  });

  const handleClose = () => {
    setVisible(false);
    onComplete?.();
  };

  const handleNext = () => {
    if (animating) return;
    if (current === SLIDES.length - 1) { handleClose(); return; }
    setDir("forward");
    setAnimating(true);
    setTimeout(() => { setCurrent(c => c + 1); setAnimating(false); }, 220);
  };

  const handlePrev = () => {
    if (animating || current === 0) return;
    setDir("back");
    setAnimating(true);
    setTimeout(() => { setCurrent(c => c - 1); setAnimating(false); }, 220);
  };

  const goTo = (i: number) => {
    if (animating || i === current) return;
    setDir(i > current ? "forward" : "back");
    setAnimating(true);
    setTimeout(() => { setCurrent(i); setAnimating(false); }, 220);
  };

  if (!visible) return null;

  const slideStyle: React.CSSProperties = {
    transition: "opacity 0.22s ease, transform 0.22s ease",
    opacity: animating ? 0 : 1,
    transform: animating
      ? `translateX(${dir === "forward" ? "24px" : "-24px"})`
      : "translateX(0)",
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 10001,
        background: "rgba(17,24,39,0.6)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: "#fff", borderRadius: 20, width: "100%", maxWidth: 760,
          overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,0.22)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          background: "linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)",
          padding: "24px 28px 20px", position: "relative", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", top: -40, right: -40, width: 180, height: 180,
            background: "rgba(255,255,255,0.07)", borderRadius: "50%",
          }} />
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.28)",
            color: "#fff", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em",
            padding: "3px 10px", borderRadius: 20, marginBottom: 8,
          }}>
            <span style={{ width: 6, height: 6, background: "#4ade80", borderRadius: "50%", display: "inline-block" }} />
            NUEVO EN SHELFY
          </div>
          <div style={{ color: "#fff", fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", position: "relative" }}>
            {SLIDES[current].title}
          </div>
          <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 13, marginTop: 3, position: "relative" }}>
            {SLIDES[current].subtitle}
          </div>
          <div style={{ position: "absolute", top: 22, right: 24, color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: 500 }}>
            Paso <strong style={{ color: "#fff" }}>{current + 1}</strong> de {SLIDES.length}
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ height: 3, background: "rgba(124,58,237,0.15)" }}>
          <div style={{
            height: "100%", background: "#4ade80", borderRadius: "0 2px 2px 0",
            width: `${((current + 1) / SLIDES.length) * 100}%`,
            transition: "width 0.35s cubic-bezier(.4,0,.2,1)",
          }} />
        </div>

        {/* Body */}
        <div style={{ padding: "24px 28px 16px", minHeight: 300, maxHeight: "calc(100vh - 220px)", overflowY: "auto" }}>
          <div style={slideStyle}>
            {current === 0 && <SlideVideo />}
            {current === 1 && <Slide1 />}
            {current === 2 && <Slide2 />}
            {current === 3 && <Slide3 />}
            {current === 4 && <Slide4 />}
            {current === 5 && <Slide5 />}
            {current === 6 && <Slide6 />}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "14px 28px 20px",
          borderTop: "1px solid #f3f4f6",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          {/* Dots */}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {SLIDES.map((_, i) => (
              <button key={i} onClick={() => goTo(i)} style={{
                width: i === current ? 20 : 7, height: 7,
                borderRadius: i === current ? 4 : "50%",
                background: i === current ? "#7C3AED" : "#e5e7eb",
                border: "none", cursor: "pointer", padding: 0,
                transition: "all 0.2s",
              }} />
            ))}
          </div>
          {/* Buttons */}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button onClick={handleClose} style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: "#9ca3af", fontSize: 13.5, fontWeight: 500, padding: "8px 12px",
            }}>
              Omitir
            </button>
            {current > 0 && (
              <button onClick={handlePrev} style={{
                background: "#f3f4f6", border: "none", cursor: "pointer",
                color: "#374151", fontSize: 13.5, fontWeight: 600,
                padding: "9px 18px", borderRadius: 10,
              }}>
                ← Anterior
              </button>
            )}
            <button onClick={handleNext} style={{
              background: current === SLIDES.length - 1
                ? "linear-gradient(135deg, #10B981 0%, #059669 100%)"
                : "linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)",
              border: "none", cursor: "pointer",
              color: "#fff", fontSize: 13.5, fontWeight: 600,
              padding: "9px 20px", borderRadius: 10,
              boxShadow: current === SLIDES.length - 1
                ? "0 2px 10px rgba(16,185,129,0.35)"
                : "0 2px 10px rgba(124,58,237,0.35)",
            }}>
              {current === SLIDES.length - 1 ? "¡Listo, explorar! 🚀" : "Siguiente →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Slide components ──────────────────────────────────────────────────────── */

function Callout({ children, color = "purple" }: { children: React.ReactNode; color?: "purple" | "green" | "amber" }) {
  const colors = {
    purple: { bg: "rgba(124,58,237,0.06)", border: "rgba(124,58,237,0.15)" },
    green:  { bg: "rgba(16,185,129,0.06)",  border: "rgba(16,185,129,0.2)" },
    amber:  { bg: "rgba(245,158,11,0.06)",  border: "rgba(245,158,11,0.2)" },
  };
  return (
    <div style={{
      display: "flex", gap: 10, padding: "9px 12px", borderRadius: 8, marginTop: 12,
      background: colors[color].bg, border: `1px solid ${colors[color].border}`,
      fontSize: 12, color: "#4B5563", lineHeight: 1.55,
    }}>
      {children}
    </div>
  );
}

function TwoCol({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}
      className="tutorial-two-col">
      <style>{`@media(max-width:580px){.tutorial-two-col{grid-template-columns:1fr!important}}`}</style>
      {left}
      {right}
    </div>
  );
}

function SlideText({ title, body }: { title: string; body: React.ReactNode }) {
  return (
    <div>
      <h2 style={{ fontSize: 17, fontWeight: 700, color: "#111827", letterSpacing: "-0.02em", marginBottom: 8 }}>{title}</h2>
      {body}
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return <span style={{ width: 18, height: 18, borderRadius: "50%", background: color + "22", color, fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>●</span>;
}

function BulletList({ items }: { items: { dot: React.ReactNode; text: React.ReactNode }[] }) {
  return (
    <ul style={{ listStyle: "none", padding: 0, marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "#4B5563", lineHeight: 1.5 }}>
          {item.dot}
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

/* ── Mockup shell ── */
function Mockup({ children, height }: { children: React.ReactNode; height?: number }) {
  return (
    <div style={{
      background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 12,
      overflow: "hidden", fontSize: 11, boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
      height: height ? height : undefined,
    }}>
      {children}
    </div>
  );
}

/* ── Slide 0: Video Tutorial ── */
function SlideVideo() {
  return (
    <div style={{ borderRadius: 16, overflow: "hidden", position: "relative", background: "#000", boxShadow: "0 20px 50px rgba(0,0,0,0.3)" }}>
      <video 
        src="/VideoProject1.mp4" 
        controls 
        autoPlay 
        className="w-full h-auto aspect-video"
        style={{ display: "block" }}
      />
      <div style={{ 
        position: "absolute", bottom: 0, left: 0, right: 0, 
        padding: "10px 15px", background: "linear-gradient(transparent, rgba(0,0,0,0.7))",
        fontSize: 11, color: "#fff", fontWeight: 500
      }}>
        Video de la nueva actualización v2
      </div>
    </div>
  );
}

/* ── Slide 1: Bienvenida ── */
function Slide1() {
  return (
    <div>
      <p style={{ fontSize: 13.5, color: "#4B5563", lineHeight: 1.65, marginBottom: 4 }}>
        Incorporamos el <strong style={{ color: "#111827" }}>Panel de Supervisión</strong> — vista en tiempo real del trabajo de campo: rutas, puntos de venta y cuentas corrientes de tu distribuidora, todo en un solo lugar.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 16 }}
        className="tutorial-feature-grid">
        <style>{`@media(max-width:580px){.tutorial-feature-grid{grid-template-columns:1fr!important}}`}</style>
        {[
          { icon: "🗺️", title: "Mapa interactivo", desc: "Visualizá cada PDV con su estado de compra y exhibición." },
          { icon: "📋", title: "Rutas y vendedores", desc: "Navegá la jerarquía sucursal → vendedor → ruta → cliente." },
          { icon: "💳", title: "Cuentas corrientes", desc: "Deuda actualizada automáticamente cada día a las 7am." },
        ].map((f, i) => (
          <div key={i} style={{
            background: "#FAFAFA", border: "1px solid #E5E7EB", borderRadius: 10, padding: 12,
            animation: `fadeUp 0.4s ease ${i * 120}ms both`,
          }}>
            <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>
            <div style={{ fontSize: 20, marginBottom: 6 }}>{f.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#111827", marginBottom: 3 }}>{f.title}</div>
            <div style={{ fontSize: 11, color: "#6B7280", lineHeight: 1.4 }}>{f.desc}</div>
          </div>
        ))}
      </div>
      <Callout color="purple">
        <span>📱</span>
        <div>La plataforma tiene una <strong>versión mobile optimizada</strong> con <strong>ShelfyMaps</strong> — mapa de pantalla completa pensado para supervisores en el campo.</div>
      </Callout>
    </div>
  );
}

/* ── Slide 2: Mapa ── */
function Slide2() {
  return (
    <TwoCol
      left={
        <SlideText
          title="El mapa de rutas"
          body={
            <>
              <p style={{ fontSize: 13, color: "#4B5563", lineHeight: 1.6 }}>Cada punto en el mapa es un PDV. El color indica el estado actual del cliente.</p>
              <BulletList items={[
                { dot: <Dot color={PIN_COLORS.green} />,  text: <><strong style={{ color: "#111" }}>Verde</strong> — compró recientemente y tiene exhibición activa.</> },
                { dot: <Dot color={PIN_COLORS.blue} />,   text: <><strong style={{ color: "#111" }}>Azul</strong> — activo, sin exhibición cargada.</> },
                { dot: <Dot color={PIN_COLORS.amber} />,  text: <><strong style={{ color: "#111" }}>Naranja</strong> — inactivo con exhibición registrada.</> },
                { dot: <Dot color={PIN_COLORS.red} />,    text: <><strong style={{ color: "#111" }}>Rojo</strong> — sin compras recientes ni exhibición.</> },
              ]} />
              <Callout>
                <span>💡</span>
                <div>Hacé clic en cualquier pin para ver nombre, última compra, días sin actividad y foto de la exhibición.</div>
              </Callout>
            </>
          }
        />
      }
      right={
        <MapMockup />
      }
    />
  );
}

function MapMockup() {
  const [showPopup, setShowPopup] = useState(false);
  const [cursorPos, setCursorPos] = useState({ x: 80, y: 100 });
  const [clicking, setClicking] = useState(false);

  useEffect(() => {
    let t1: ReturnType<typeof setTimeout>, t2: ReturnType<typeof setTimeout>,
        t3: ReturnType<typeof setTimeout>, t4: ReturnType<typeof setTimeout>;

    const run = () => {
      setShowPopup(false);
      setCursorPos({ x: 80, y: 100 });
      t1 = setTimeout(() => setCursorPos({ x: 95, y: 70 }), 400);
      t2 = setTimeout(() => { setClicking(true); setTimeout(() => setClicking(false), 300); }, 900);
      t3 = setTimeout(() => setShowPopup(true), 1100);
      t4 = setTimeout(run, 4000);
    };
    run();
    return () => { [t1, t2, t3, t4].forEach(clearTimeout); };
  }, []);

  const pins = [
    { x: 95, y: 70, color: PIN_COLORS.green },
    { x: 60, y: 50, color: PIN_COLORS.green },
    { x: 135, y: 90, color: PIN_COLORS.blue },
    { x: 50, y: 100, color: PIN_COLORS.blue },
    { x: 155, y: 55, color: PIN_COLORS.amber },
    { x: 120, y: 130, color: PIN_COLORS.red },
    { x: 80, y: 140, color: PIN_COLORS.green },
    { x: 170, y: 115, color: PIN_COLORS.blue },
  ];

  return (
    <Mockup>
      <div style={{ position: "relative", height: 210, background: "#e8edf2", overflow: "hidden" }}>
        {/* Grid */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: "linear-gradient(rgba(200,210,220,0.4) 1px,transparent 1px),linear-gradient(90deg,rgba(200,210,220,0.4) 1px,transparent 1px)",
          backgroundSize: "26px 26px",
        }} />
        {/* Streets */}
        {[30, 55, 78].map(p => (
          <div key={p} style={{ position: "absolute", height: 2, background: "rgba(255,255,255,0.65)", left: 0, right: 0, top: `${p}%` }} />
        ))}
        {[25, 55, 80].map(p => (
          <div key={p} style={{ position: "absolute", width: 2, background: "rgba(255,255,255,0.65)", top: 0, bottom: 0, left: `${p}%` }} />
        ))}
        {/* Pins */}
        {pins.map((pin, i) => (
          <div key={i} style={{
            position: "absolute", width: 11, height: 11, borderRadius: "50%",
            background: pin.color, border: "2px solid #fff",
            boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
            left: pin.x, top: pin.y, transform: "translate(-50%,-50%)",
          }} />
        ))}
        {/* Popup */}
        {showPopup && (
          <div style={{
            position: "absolute", top: 20, left: 100, minWidth: 135,
            background: "#fff", borderRadius: 8, padding: "7px 9px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.15)", border: "1px solid #e5e7eb",
            fontSize: 10, animation: "popIn 0.15s ease",
          }}>
            <style>{`@keyframes popIn{from{opacity:0;transform:scale(0.9)}to{opacity:1;transform:scale(1)}}`}</style>
            <div style={{ fontWeight: 700, color: "#111", fontSize: 11, marginBottom: 3 }}>Almacén El Sol</div>
            <div style={{ color: "#6b7280", marginBottom: 2 }}>Nº cliente: 1042 · Ruta: Lunes</div>
            <div style={{ color: PIN_COLORS.green }}>Últ. compra: hace 3 días</div>
            <div style={{ color: "#d97706", marginTop: 2 }}>Exhibición: hace 5 días</div>
            <span style={{ display: "inline-block", background: "#d1fae5", color: "#065f46", padding: "1px 5px", borderRadius: 4, fontSize: 9, fontWeight: 600, marginTop: 3 }}>Activo + Exhibición</span>
          </div>
        )}
        {/* Animated cursor */}
        <div style={{
          position: "absolute", width: 12, height: 12, borderRadius: "50%",
          background: "#7C3AED", border: "2px solid #fff",
          boxShadow: "0 0 0 3px rgba(124,58,237,0.3)",
          left: cursorPos.x, top: cursorPos.y, transform: "translate(-50%,-50%)",
          transition: "left 0.5s ease, top 0.5s ease",
          scale: clicking ? "1.5" : "1",
          zIndex: 10,
          pointerEvents: "none",
        }} />
        {/* Controls */}
        <div style={{ position: "absolute", top: 8, right: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          {["⛶", "🖨️"].map(icon => (
            <div key={icon} style={{ width: 24, height: 24, background: "rgba(255,255,255,0.92)", border: "1px solid #e5e7eb", borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>{icon}</div>
          ))}
        </div>
        {/* PDV badge */}
        <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(17,24,39,0.75)", color: "#fff", fontSize: 9.5, fontWeight: 500, padding: "2px 7px", borderRadius: 20 }}>
          18 PDV visibles
        </div>
        {/* Legend */}
        <div style={{ position: "absolute", bottom: 7, left: 7, display: "flex", flexDirection: "column", gap: 2 }}>
          {Object.entries({ "Activo + Exhibición": PIN_COLORS.green, "Activo": PIN_COLORS.blue, "Inactivo + Exhibición": PIN_COLORS.amber, "Inactivo": PIN_COLORS.red }).map(([label, color]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.88)", padding: "2px 6px", borderRadius: 4, fontSize: 9, fontWeight: 500, color: "#374151" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
              {label}
            </div>
          ))}
        </div>
      </div>
    </Mockup>
  );
}

/* ── Slide 3: Vendedores y rutas ── */
function Slide3() {
  const [expanded, setExpanded] = useState(false);
  const [routeExpanded, setRouteExpanded] = useState(false);

  useEffect(() => {
    let t1: ReturnType<typeof setTimeout>, t2: ReturnType<typeof setTimeout>,
        t3: ReturnType<typeof setTimeout>;

    const run = () => {
      setExpanded(false);
      setRouteExpanded(false);
      t1 = setTimeout(() => setExpanded(true), 800);
      t2 = setTimeout(() => setRouteExpanded(true), 1600);
      t3 = setTimeout(run, 5500);
    };
    run();
    return () => { [t1, t2, t3].forEach(clearTimeout); };
  }, []);

  const dayBadge = (label: string, color: string) => (
    <span style={{ padding: "1px 5px", borderRadius: 4, fontSize: 9, fontWeight: 600, background: color + "18", color, border: `1px solid ${color}33` }}>{label}</span>
  );

  return (
    <TwoCol
      left={
        <SlideText
          title="Vendedores y rutas"
          body={
            <>
              <p style={{ fontSize: 13, color: "#4B5563", lineHeight: 1.6 }}>El panel lateral muestra la jerarquía completa. Expandí cada nivel para ver el detalle.</p>
              <BulletList items={[
                { dot: <NumberDot>1</NumberDot>, text: <>Elegí una <strong style={{ color: "#111" }}>sucursal</strong> en el selector superior.</> },
                { dot: <NumberDot>2</NumberDot>, text: <>Expandí un <strong style={{ color: "#111" }}>vendedor</strong> para ver sus rutas y % de clientes activos.</> },
                { dot: <NumberDot>3</NumberDot>, text: <>Expandí una <strong style={{ color: "#111" }}>ruta</strong> (por día) para ver los clientes asignados.</> },
                { dot: <NumberDot>4</NumberDot>, text: <>Usá el ojo 👁 para mostrar/ocultar pins en el mapa.</> },
              ]} />
            </>
          }
        />
      }
      right={
        <Mockup>
          {/* Sucursal selector */}
          <div style={{ padding: "7px 10px", background: "#fff", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#374151", fontWeight: 500 }}>
            🏢 <span style={{ flex: 1 }}>Sucursal Centro</span> <span style={{ color: "#9ca3af" }}>▾</span>
          </div>
          {/* Vendor 1 — animated highlight */}
          <div style={{
            padding: "7px 10px", borderBottom: "1px solid #f9fafb", display: "flex", alignItems: "center", gap: 7,
            background: expanded ? "#faf5ff" : "#fff", transition: "background 0.3s",
          }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: "#22d3ee", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 700, color: "#fff", flexShrink: 0 }}>MG</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#111" }}>Martínez, Gabriel</div>
              <div style={{ fontSize: 9.5, color: "#9ca3af", marginTop: 1 }}>3 rutas · 18 PDV</div>
              <div style={{ height: 3, background: "#f3f4f6", borderRadius: 2, marginTop: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: "78%", background: "#22c55e", borderRadius: 2 }} />
              </div>
            </div>
            <span style={{ fontSize: 10, color: "#10b981", fontWeight: 700 }}>78%</span>
          </div>
          {/* Routes accordion */}
          <div style={{
            overflow: "hidden", maxHeight: expanded ? 200 : 0,
            transition: "max-height 0.4s ease",
          }}>
            {[
              { day: "Lunes", color: "#3b82f6", clients: "8 clientes" },
              { day: "Miércoles", color: "#7C3AED", clients: "6 clientes" },
              { day: "Viernes", color: "#f43f5e", clients: "4 clientes" },
            ].map((r, i) => (
              <div key={i}>
                <div style={{ padding: "5px 10px 5px 20px", display: "flex", alignItems: "center", gap: 5, background: "#fafafa", borderBottom: "1px solid #f3f4f6" }}>
                  {dayBadge(r.day, r.color)}
                  <span style={{ fontSize: 10, color: "#374151", flex: 1 }}>Ruta {String.fromCharCode(65 + i)}</span>
                  <span style={{ fontSize: 9.5, color: "#9ca3af" }}>{r.clients}</span>
                </div>
                {/* Clients under first route */}
                {i === 0 && (
                  <div style={{ overflow: "hidden", maxHeight: routeExpanded ? 80 : 0, transition: "max-height 0.4s ease" }}>
                    {["Almacén El Sol", "Quiosco Central"].map(c => (
                      <div key={c} style={{ padding: "3px 10px 3px 32px", fontSize: 10, color: "#374151", borderBottom: "1px solid #f3f4f6", background: "#fff" }}>
                        • {c}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          {/* Other vendors */}
          {[
            { initials: "LR", color: "#4ade80", textColor: "#064e3b", name: "López, Rodrigo", pct: "58%", pctColor: "#f59e0b", barColor: "#f59e0b", barW: "58%" },
            { initials: "FG", color: "#a78bfa", textColor: "#fff", name: "Fernández, Graciela", pct: "91%", pctColor: "#10b981", barColor: "#22c55e", barW: "91%" },
          ].map((v, i) => (
            <div key={i} style={{ padding: "7px 10px", borderBottom: "1px solid #f9fafb", display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: v.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 700, color: v.textColor, flexShrink: 0 }}>{v.initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#111" }}>{v.name}</div>
                <div style={{ height: 3, background: "#f3f4f6", borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: v.barW, background: v.barColor, borderRadius: 2 }} />
                </div>
              </div>
              <span style={{ fontSize: 10, color: v.pctColor, fontWeight: 700 }}>{v.pct}</span>
            </div>
          ))}
        </Mockup>
      }
    />
  );
}

function NumberDot({ children }: { children: React.ReactNode }) {
  return <span style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(124,58,237,0.1)", color: "#7C3AED", fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{children}</span>;
}

/* ── Slide 4: ShelfyMaps ── */
function Slide4() {
  const [panelOpen, setPanelOpen] = useState(false);
  const [vendor3off, setVendor3off] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [menuPulse, setMenuPulse] = useState(false);

  useEffect(() => {
    let timers: ReturnType<typeof setTimeout>[] = [];
    const run = () => {
      setPanelOpen(false); setVendor3off(false); setShowPopup(false); setMenuPulse(false);
      timers.push(setTimeout(() => setMenuPulse(true), 600));
      timers.push(setTimeout(() => setMenuPulse(false), 1200));
      timers.push(setTimeout(() => setPanelOpen(true), 1400));
      timers.push(setTimeout(() => setVendor3off(true), 2400));
      timers.push(setTimeout(() => setPanelOpen(false), 3400));
      timers.push(setTimeout(() => setShowPopup(true), 4200));
      timers.push(setTimeout(run, 7500));
    };
    run();
    return () => timers.forEach(clearTimeout);
  }, []);

  const vendors = [
    { initials: "MG", color: "#22d3ee", name: "Martínez, Gabriel", on: true },
    { initials: "LR", color: "#4ade80", name: "López, Rodrigo",    on: true },
    { initials: "FG", color: "#a78bfa", name: "Fernández, Graciela", on: !vendor3off },
  ];

  return (
    <TwoCol
      left={
        <SlideText
          title="ShelfyMaps"
          body={
            <>
              <p style={{ fontSize: 13, color: "#4B5563", lineHeight: 1.6 }}>
                Mapa de pantalla completa pensado para el celular. Filtrá vendedores con el menú ☰ y tocá cualquier PDV para ver deuda, compras y exhibiciones.
              </p>
              <BulletList items={[
                { dot: <span style={{ fontSize: 14, flexShrink: 0 }}>📍</span>, text: "El mapa ocupa toda la pantalla con los pins de cada vendedor." },
                { dot: <span style={{ fontSize: 14, flexShrink: 0 }}>☰</span>,  text: <>Menú desplegable para <strong style={{ color: "#111" }}>prender/apagar vendedores</strong> individualmente.</> },
                { dot: <span style={{ fontSize: 14, flexShrink: 0 }}>💳</span>, text: <>Cada pin muestra <strong style={{ color: "#111" }}>deuda, última compra y exhibición</strong> al tocarlo.</> },
              ]} />
              <Callout color="green">
                <span>📡</span>
                <div>ShelfyMaps solicita tu <strong>GPS</strong> para mostrarte los PDVs cercanos a tu posición actual.</div>
              </Callout>
            </>
          }
        />
      }
      right={
        <div style={{ display: "flex", justifyContent: "center" }}>
          {/* Phone frame */}
          <div style={{ width: 148, height: 272, border: "3px solid #374151", borderRadius: 20, overflow: "hidden", background: "#0a0e1a", boxShadow: "0 8px 32px rgba(0,0,0,0.22)", position: "relative", flexShrink: 0 }}>
            {/* Notch */}
            <div style={{ width: 44, height: 11, background: "#374151", borderRadius: "0 0 7px 7px", margin: "0 auto" }} />
            {/* Topbar */}
            <div style={{ height: 38, background: "#0f172a", display: "flex", alignItems: "center", padding: "0 8px", gap: 6, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>←</span>
              <span style={{ flex: 1, textAlign: "center", color: "#fff", fontSize: 9.5, fontWeight: 700 }}>🗺️ ShelfyMaps</span>
              <button
                style={{
                  background: menuPulse ? "rgba(124,58,237,0.4)" : "rgba(255,255,255,0.1)",
                  border: "none", borderRadius: 5, color: "#fff", fontSize: 11, width: 22, height: 22,
                  display: "flex", alignItems: "center", justifyContent: "center", cursor: "default",
                  transition: "background 0.2s",
                }}
              >☰</button>
            </div>
            {/* Map area */}
            <div style={{ position: "relative", flex: 1, height: 170, background: "#e8edf2", overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(200,210,220,0.4)1px,transparent 1px),linear-gradient(90deg,rgba(200,210,220,0.4)1px,transparent 1px)", backgroundSize: "16px 16px" }} />
              {/* Pins — vendor 3 fades out */}
              {[
                { x: 40, y: 50, c: "#22d3ee", v: 0 },
                { x: 80, y: 40, c: "#22d3ee", v: 0 },
                { x: 60, y: 90, c: "#4ade80", v: 1 },
                { x: 110, y: 60, c: "#4ade80", v: 1 },
                { x: 30, y: 110, c: "#a78bfa", v: 2 },
                { x: 90, y: 120, c: "#a78bfa", v: 2 },
              ].map((p, i) => (
                <div key={i} style={{
                  position: "absolute", width: 8, height: 8, borderRadius: "50%",
                  background: p.c, border: "1.5px solid #fff", boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                  left: p.x, top: p.y, transform: "translate(-50%,-50%)",
                  opacity: p.v === 2 && vendor3off ? 0 : 1,
                  transition: "opacity 0.4s ease",
                }} />
              ))}
              {/* Popup */}
              {showPopup && (
                <div style={{
                  position: "absolute", bottom: 8, left: 6, right: 6,
                  background: "#fff", borderRadius: 7, padding: "6px 8px",
                  fontSize: 9, boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                  animation: "slideUp 0.2s ease",
                }}>
                  <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
                  <div style={{ fontWeight: 700, color: "#111", marginBottom: 2 }}>Quiosco Central</div>
                  <div style={{ color: "#ef4444", fontWeight: 600, marginBottom: 1 }}>💳 Deuda: $28.450 · 22d</div>
                  <div style={{ color: "#16a34a" }}>Últ. compra: hace 4 días</div>
                  <span style={{ display: "inline-block", background: "#d1fae5", color: "#065f46", padding: "1px 4px", borderRadius: 3, fontSize: 8, fontWeight: 600, marginTop: 2 }}>Activo</span>
                </div>
              )}
            </div>
            {/* Vendor filter panel */}
            <div style={{
              position: "absolute", top: 49, right: 0, bottom: 0, width: 110,
              background: "rgba(10,14,24,0.97)", borderLeft: "1px solid rgba(255,255,255,0.1)",
              padding: 8, overflowY: "auto",
              transform: panelOpen ? "translateX(0)" : "translateX(100%)",
              transition: "transform 0.3s ease",
              zIndex: 5,
            }}>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 8, fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Vendedores</div>
              {vendors.map((v, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: v.color, flexShrink: 0, opacity: v.on ? 1 : 0.3 }} />
                  <span style={{ fontSize: 8, color: v.on ? "#fff" : "rgba(255,255,255,0.3)", flex: 1, lineHeight: 1.2 }}>{v.initials}</span>
                  {/* Toggle */}
                  <div style={{
                    width: 22, height: 12, borderRadius: 6,
                    background: v.on ? "#7C3AED" : "rgba(255,255,255,0.15)",
                    position: "relative", transition: "background 0.2s", flexShrink: 0,
                  }}>
                    <div style={{
                      position: "absolute", width: 9, height: 9, borderRadius: "50%", background: "#fff",
                      top: 1.5, left: v.on ? 11 : 1.5, transition: "left 0.2s",
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      }
    />
  );
}

/* ── Slide 5: Cuentas corrientes ── */
function Slide5() {
  const [syncing, setSyncing] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [showContact, setShowContact] = useState(false);

  useEffect(() => {
    let timers: ReturnType<typeof setTimeout>[] = [];
    const run = () => {
      setSyncing(false); setUpdated(false); setShowContact(false);
      timers.push(setTimeout(() => setSyncing(true), 800));
      timers.push(setTimeout(() => { setSyncing(false); setUpdated(true); }, 2000));
      timers.push(setTimeout(() => setShowContact(true), 3200));
      timers.push(setTimeout(run, 7000));
    };
    run();
    return () => timers.forEach(clearTimeout);
  }, []);

  const ageBadge = (label: string, color: string) => (
    <span style={{ padding: "1px 5px", borderRadius: 4, fontSize: 9, fontWeight: 600, background: color + "18", color }}>{label}</span>
  );

  return (
    <TwoCol
      left={
        <SlideText
          title="Cuentas corrientes"
          body={
            <>
              <p style={{ fontSize: 13, color: "#4B5563", lineHeight: 1.6 }}>Deuda agrupada por vendedor, actualizada automáticamente desde el ERP.</p>
              <BulletList items={[
                { dot: <span style={{ fontSize: 14, flexShrink: 0 }}>🕖</span>, text: <>Se sincroniza <strong style={{ color: "#111" }}>todos los días a las 7am</strong> sin intervención manual.</> },
                { dot: <span style={{ fontSize: 14, flexShrink: 0 }}>🏷️</span>, text: <>Badges de colores indican la <strong style={{ color: "#111" }}>antigüedad de la deuda</strong>: verde &lt;8d, amarillo 8-15d, naranja 16-21d, rojo +22d.</> },
                { dot: <span style={{ fontSize: 14, flexShrink: 0 }}>👆</span>, text: <>Tocá un cliente para ver sus <strong style={{ color: "#111" }}>datos de contacto</strong>: dirección, canal y N° ERP.</> },
              ]} />
            </>
          }
        />
      }
      right={
        <div style={{ position: "relative" }}>
          <Mockup>
            {/* Header */}
            <div style={{ padding: "7px 10px", background: "#fff", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>💳 Cuentas corrientes</span>
              <span style={{ fontSize: 9.5, color: updated ? "#10b981" : (syncing ? "#f59e0b" : "#9ca3af"), display: "flex", alignItems: "center", gap: 3, transition: "color 0.4s" }}>
                {syncing && <span style={{ display: "inline-block", animation: "spin 0.8s linear infinite", fontSize: 9 }}>↻</span>}
                <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
                {syncing ? "Sincronizando..." : (updated ? "● Actualizado hoy 07:00" : "● Ayer 07:00")}
              </span>
            </div>
            {/* Vendor row expanded */}
            <div style={{ padding: "6px 10px", borderBottom: "1px solid #f9fafb", display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22d3ee", flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: "#111", flex: 1 }}>Martínez, Gabriel</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#ef4444" }}>{updated ? "$84.200" : "$91.500"}</span>
            </div>
            {[
              { name: "Almacén Don Pedro", debt: updated ? "$32.100" : "$35.200", age: "+30d", color: "#ef4444", highlight: showContact },
              { name: "Minimarket La Esquina", debt: "$28.450", age: "22d", color: "#f59e0b", highlight: false },
              { name: "Quiosco Central", debt: "$23.650", age: "16d", color: "#f97316", highlight: false },
            ].map((c, i) => (
              <div key={i} style={{
                padding: "5px 10px 5px 18px", borderBottom: "1px solid #f3f4f6",
                display: "flex", alignItems: "center", gap: 5, background: "#fafafa",
                transition: "background 0.2s",
                ...(c.highlight ? { background: "#faf5ff" } : {}),
              }}>
                <span style={{ fontSize: 10, color: "#374151", flex: 1 }}>{c.name}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: "#ef4444" }}>{c.debt}</span>
                {ageBadge(c.age, c.color)}
              </div>
            ))}
            {/* Other vendors */}
            {[
              { dot: "#4ade80", name: "López, Rodrigo", debt: "$41.800" },
              { dot: "#a78bfa", name: "Fernández, Graciela", debt: "$19.300" },
            ].map((v, i) => (
              <div key={i} style={{ padding: "6px 10px", borderBottom: "1px solid #f9fafb", display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: v.dot, flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: "#111", flex: 1 }}>{v.name}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#ef4444" }}>{v.debt}</span>
              </div>
            ))}
          </Mockup>
          {/* Contact popup */}
          {showContact && (
            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
              padding: "10px 12px", boxShadow: "0 -4px 20px rgba(0,0,0,0.1)",
              animation: "slideUp 0.2s ease", fontSize: 11,
            }}>
              <div style={{ fontWeight: 700, color: "#111", marginBottom: 6, fontSize: 12 }}>Almacén Don Pedro</div>
              {[["Razón social", "Don Pedro S.R.L."], ["N° Cliente ERP", "1042"], ["Dirección", "Av. San Martín 456"], ["Canal", "Almacén"]].map(([k, v]) => (
                <div key={k} style={{ display: "flex", gap: 6, marginBottom: 3 }}>
                  <span style={{ color: "#9ca3af", minWidth: 80 }}>{k}</span>
                  <span style={{ color: "#111", fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      }
    />
  );
}

/* ── Slide 6: Mobile ── */
function Slide6() {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const run = () => {
      setScrollY(0);
      t = setTimeout(() => setScrollY(60), 600);
    };
    run();
    const interval = setInterval(run, 3000);
    return () => { clearInterval(interval); clearTimeout(t); };
  }, []);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 24, alignItems: "start" }}
        className="tutorial-mobile-grid">
        <style>{`@media(max-width:580px){.tutorial-mobile-grid{grid-template-columns:1fr!important}}`}</style>
        {/* Phone */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div style={{ width: 120, height: 230, border: "2.5px solid #374151", borderRadius: 18, overflow: "hidden", background: "#f9fafb", boxShadow: "0 8px 24px rgba(0,0,0,0.15)", position: "relative", flexShrink: 0 }}>
            <div style={{ width: 36, height: 9, background: "#374151", borderRadius: "0 0 5px 5px", margin: "0 auto" }} />
            {/* Topbar */}
            <div style={{ background: "#7C3AED", padding: "5px 7px 4px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ color: "#fff", fontSize: 7.5, fontWeight: 700 }}>Supervisión</span>
              <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 9 }}>≡</span>
            </div>
            {/* Scrollable content */}
            <div style={{ overflow: "hidden", height: 195 }}>
              <div style={{ transform: `translateY(-${scrollY}px)`, transition: "transform 0.8s ease" }}>
                {/* Map */}
                <div style={{ height: 80, background: "#e8edf2", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(200,210,220,0.4)1px,transparent 1px),linear-gradient(90deg,rgba(200,210,220,0.4)1px,transparent 1px)", backgroundSize: "13px 13px" }} />
                  {[{ x: 30, y: 30, c: PIN_COLORS.green }, { x: 55, y: 45, c: PIN_COLORS.blue }, { x: 80, y: 25, c: PIN_COLORS.green }, { x: 95, y: 50, c: PIN_COLORS.red }].map((p, i) => (
                    <div key={i} style={{ position: "absolute", width: 7, height: 7, borderRadius: "50%", background: p.c, border: "1.5px solid #fff", left: p.x, top: p.y, transform: "translate(-50%,-50%)" }} />
                  ))}
                </div>
                {/* ShelfyMaps button */}
                <div style={{ margin: 5 }}>
                  <div style={{ background: "linear-gradient(135deg,#7C3AED,#4F46E5)", color: "#fff", borderRadius: 8, padding: "5px 0", textAlign: "center", fontSize: 7.5, fontWeight: 700 }}>🗺️ Entrar a ShelfyMaps</div>
                </div>
                {/* CC card */}
                <div style={{ margin: "0 5px 5px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, padding: "5px 6px" }}>
                  <div style={{ fontSize: 7.5, fontWeight: 700, color: "#374151", marginBottom: 3 }}>💳 Cuentas corrientes</div>
                  {[{ dot: "#22d3ee", name: "Martínez, G.", debt: "$84.200" }, { dot: "#4ade80", name: "López, R.", debt: "$41.800" }].map((v, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                      <div style={{ width: 5, height: 5, borderRadius: "50%", background: v.dot }} />
                      <span style={{ fontSize: 7, color: "#374151", flex: 1 }}>{v.name}</span>
                      <span style={{ fontSize: 7, fontWeight: 700, color: "#ef4444" }}>{v.debt}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* Scroll indicator */}
            <div style={{ position: "absolute", right: 4, top: 50, bottom: 8, width: 3, background: "#f3f4f6", borderRadius: 2 }}>
              <div style={{ width: "100%", height: "40%", background: "#7C3AED", borderRadius: 2, transition: "transform 0.8s ease", transform: `translateY(${scrollY}%)` }} />
            </div>
            {/* Bottom nav */}
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 22, background: "#fff", borderTop: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-around", fontSize: 6.5, color: "#9ca3af" }}>
              {[["👁", "Evaluar"], ["📊", "Dashboard"], ["🗺️", "Supervisión"], ["📈", "Reportes"]].map(([icon, label], i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5, color: i === 2 ? "#7C3AED" : undefined }}>
                  <span style={{ fontSize: 8 }}>{icon}</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Text */}
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: "#111827", letterSpacing: "-0.02em", marginBottom: 8 }}>Pensado para el campo</h2>
          <p style={{ fontSize: 13, color: "#4B5563", lineHeight: 1.65 }}>
            El Panel de Supervisión tiene una interfaz adaptada para celular. El supervisor puede consultar rutas, ver deudores y revisar el mapa desde su teléfono mientras recorre la zona.
          </p>
          <BulletList items={[
            { dot: <span style={{ fontSize: 14, flexShrink: 0 }}>🗺️</span>, text: <>Botón <strong style={{ color: "#111" }}>"Entrar a ShelfyMaps"</strong> para el mapa fullscreen con GPS.</> },
            { dot: <span style={{ fontSize: 14, flexShrink: 0 }}>💳</span>, text: "Las cuentas corrientes se muestran como tarjetas debajo del mapa." },
            { dot: <span style={{ fontSize: 14, flexShrink: 0 }}>📱</span>, text: "Navegación inferior para acceder rápido a todas las secciones." },
          ]} />
          <Callout color="amber">
            <span>🌐</span>
            <div>No necesitás instalar nada — entrá desde el navegador del celular a <strong>shelfycenter.com</strong>.</div>
          </Callout>
        </div>
      </div>
    </div>
  );
}
