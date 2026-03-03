"use client";

import { useState, FormEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { User, Lock, Eye, EyeOff, ArrowRight, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { login, loading, error, isAuthenticated } = useAuth();
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [slotIdx, setSlotIdx] = useState(0);
  const [slotAnim, setSlotAnim] = useState<"in" | "out">("in");

  const SLOTS = [
    { word: "CONQUISTAR", color: "#ef4444", icon: "⚔️" },
    { word: "MANTENER", color: "#22c55e", icon: "🛡️" },
  ];

  useEffect(() => {
    setMounted(true);
    if (isAuthenticated) router.replace("/dashboard");
  }, [isAuthenticated, router]);

  // Slot machine cycle
  useEffect(() => {
    const interval = setInterval(() => {
      setSlotAnim("out");
      setTimeout(() => {
        setSlotIdx(i => (i + 1) % SLOTS.length);
        setSlotAnim("in");
      }, 350);
    }, 2800);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await login(usuario, password);
  }

  return (
    <>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-8px); }
        }
        @keyframes slotIn {
          from { transform: translateY(-28px); opacity: 0; }
          to   { transform: translateY(0);     opacity: 1; }
        }
        @keyframes slotOut {
          from { transform: translateY(0);    opacity: 1; }
          to   { transform: translateY(28px); opacity: 0; }
        }
        .slot-in  { animation: slotIn  0.35s cubic-bezier(0.22,1,0.36,1) both; }
        .slot-out { animation: slotOut 0.35s ease-in both; }
        @keyframes pulse-ring {
          0%   { transform: scale(1);    opacity: 0.4; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        .anim-fade-in  { animation: fadeIn  0.6s ease both; }
        .anim-fade-up  { animation: fadeUp  0.6s ease both; }
        .anim-float    { animation: float   3s ease-in-out infinite; }
        .delay-100 { animation-delay: 0.10s; }
        .delay-200 { animation-delay: 0.20s; }
        .delay-300 { animation-delay: 0.30s; }
        .delay-400 { animation-delay: 0.40s; }
        .delay-500 { animation-delay: 0.50s; }

        .login-input {
          width: 100%;
          background: rgba(255,255,255,0.7);
          border: 1.5px solid #ddd6fe;
          border-radius: 12px;
          padding: 12px 12px 12px 42px;
          font-size: 14px;
          color: #1e1b4b;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
        }
        .login-input::placeholder { color: #a5b4fc; }
        .login-input:focus {
          border-color: #7c3aed;
          box-shadow: 0 0 0 3px rgba(124,58,237,0.12);
          background: rgba(255,255,255,0.95);
        }
        .login-btn {
          width: 100%;
          background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
          color: white;
          font-weight: 700;
          font-size: 15px;
          border: none;
          border-radius: 14px;
          padding: 14px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;
          box-shadow: 0 4px 20px rgba(124,58,237,0.35);
          letter-spacing: 0.01em;
        }
        .login-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 28px rgba(124,58,237,0.45);
        }
        .login-btn:active:not(:disabled) { transform: translateY(0); }
        .login-btn:disabled { opacity: 0.7; cursor: not-allowed; }

        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(50px);
          pointer-events: none;
        }
      `}</style>

      <div
        className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden"
        style={{ background: "linear-gradient(145deg, #f0eeff 0%, #ede9ff 40%, #e8f0fe 100%)" }}
      >
        {/* Decorative orbs */}
        <div className="orb anim-fade-in" style={{ width: 360, height: 360, background: "rgba(124,58,237,0.12)", top: "-80px", right: "-80px" }} />
        <div className="orb anim-fade-in delay-200" style={{ width: 280, height: 280, background: "rgba(79,70,229,0.10)", bottom: "-60px", left: "-60px" }} />
        <div className="orb anim-fade-in delay-400" style={{ width: 160, height: 160, background: "rgba(167,139,250,0.15)", top: "40%", left: "10%" }} />

        <div className="w-full max-w-sm relative z-10">

          {/* Logo area */}
          <div className={`flex flex-col items-center mb-8 ${mounted ? "anim-fade-up" : "opacity-0"}`}>
            <div className="anim-float mb-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/LOGO_NUEVO.svg"
                alt="Shelfy"
                className="h-20 w-auto"
                style={{ filter: "drop-shadow(0 8px 24px rgba(124,58,237,0.25))" }}
              />
            </div>
            <h1 className="text-2xl font-bold text-center" style={{ color: "#1e1b4b", letterSpacing: "-0.02em" }}>
              Acceso al Portal
            </h1>
            <div className="flex flex-wrap items-center justify-center gap-x-1.5 text-sm mt-1" style={{ color: "#6d28d9" }}>
              <span>Mentalidad enfocada en</span>
              <span
                className="inline-flex items-center gap-1 font-black overflow-hidden"
                style={{ minWidth: 180, justifyContent: "center" }}
              >
                <span
                  key={slotIdx}
                  className={slotAnim === "in" ? "slot-in" : "slot-out"}
                  style={{ color: SLOTS[slotIdx].color, display: "inline-flex", alignItems: "center", gap: 4 }}
                >
                  <span>{SLOTS[slotIdx].icon}</span>
                  {SLOTS[slotIdx].word}
                </span>
              </span>
              <span>la góndola</span>
            </div>
          </div>

          {/* Card */}
          <div
            className={`rounded-2xl p-7 ${mounted ? "anim-fade-up delay-200" : "opacity-0"}`}
            style={{
              background: "rgba(255,255,255,0.75)",
              backdropFilter: "blur(16px)",
              border: "1.5px solid rgba(167,139,250,0.35)",
              boxShadow: "0 8px 40px rgba(124,58,237,0.10), 0 2px 8px rgba(0,0,0,0.05)",
            }}
          >
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {/* Usuario */}
              <div className={`${mounted ? "anim-fade-up delay-300" : "opacity-0"}`}>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "#5b21b6" }}>
                  Usuario
                </label>
                <div className="relative">
                  <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#a78bfa" }} />
                  <input
                    type="text"
                    value={usuario}
                    onChange={(e) => setUsuario(e.target.value)}
                    required
                    autoComplete="username"
                    placeholder="Tu nombre de usuario"
                    className="login-input"
                  />
                </div>
              </div>

              {/* Contraseña */}
              <div className={`${mounted ? "anim-fade-up delay-400" : "opacity-0"}`}>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "#5b21b6" }}>
                  Contraseña
                </label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#a78bfa" }} />
                  <input
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="login-input"
                    style={{ paddingRight: "42px" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: "#a78bfa", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                    tabIndex={-1}
                  >
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="anim-fade-up rounded-xl px-4 py-3 text-sm font-medium" style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fca5a5" }}>
                  {error}
                </div>
              )}

              {/* Submit */}
              <div className={`pt-1 ${mounted ? "anim-fade-up delay-500" : "opacity-0"}`}>
                <button type="submit" disabled={loading} className="login-btn">
                  {loading
                    ? <><Loader2 size={16} className="animate-spin" /> Ingresando...</>
                    : <> Iniciar Sesión <ArrowRight size={16} /></>
                  }
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Footer */}
        <p className={`absolute bottom-6 text-xs ${mounted ? "anim-fade-in delay-500" : "opacity-0"}`}
          style={{ color: "#8b7cf6", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          © {new Date().getFullYear()} Shelfy Digital Storage S.A.
        </p>
      </div>
    </>
  );
}
