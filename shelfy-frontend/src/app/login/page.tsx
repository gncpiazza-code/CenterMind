"use client";

import { useState, FormEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  const router = useRouter();
  const { login, loading, error, isAuthenticated } = useAuth();
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");

  // Si ya está autenticado, redirige explícitamente
  useEffect(() => {
    if (isAuthenticated) router.replace("/dashboard");
  }, [isAuthenticated, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await login(usuario, password);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--shelfy-bg)] px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <img
            src="/shelfy_logo_clean.svg"
            alt="Shelfy"
            className="h-14 w-auto"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>

        {/* Card */}
        <div className="bg-[var(--shelfy-panel)] rounded-2xl border border-[var(--shelfy-border)] p-8 shadow-lg">
          <h2 className="text-[var(--shelfy-text)] text-xl font-semibold mb-1">Iniciar sesión</h2>
          <p className="text-[var(--shelfy-muted)] text-sm mb-6">Ingresá tus credenciales para continuar</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs text-[var(--shelfy-muted)] mb-1.5">Usuario</label>
              <input
                type="text"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                required
                autoComplete="username"
                className="w-full rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-3 py-2 text-sm placeholder:text-[var(--shelfy-muted)] focus:outline-none focus:border-[var(--shelfy-primary)] focus:ring-1 focus:ring-[var(--shelfy-primary)] transition-colors"
                placeholder="tu_usuario"
              />
            </div>

            <div>
              <label className="block text-xs text-[var(--shelfy-muted)] mb-1.5">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-3 py-2 text-sm placeholder:text-[var(--shelfy-muted)] focus:outline-none focus:border-[var(--shelfy-primary)] focus:ring-1 focus:ring-[var(--shelfy-primary)] transition-colors"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-red-700 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" loading={loading} size="lg" className="mt-1 w-full">
              {loading ? "Ingresando..." : "Ingresar"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
