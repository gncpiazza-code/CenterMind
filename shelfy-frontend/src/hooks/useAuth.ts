"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { loginApi, type AuthResponse } from "@/lib/api";
import { TOKEN_KEY } from "@/lib/constants";

function getStoredUser(): AuthResponse | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  try {
    // Decodifica el payload del JWT (no verifica firma — eso es del backend)
    const payload = JSON.parse(atob(token.split(".")[1]));
    // Verifica expiración
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return {
      access_token: token,
      token_type: "bearer",
      usuario: payload.sub,
      rol: payload.rol,
      id_usuario: payload.id_usuario,
      id_distribuidor: payload.id_distribuidor,
      nombre_empresa: payload.nombre_empresa,
    };
  } catch {
    return null;
  }
}

export function useAuth() {
  const router = useRouter();
  const [user, setUser] = useState<AuthResponse | null>(() => getStoredUser());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (usuario: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await loginApi(usuario, password);
      localStorage.setItem(TOKEN_KEY, data.access_token);
      setUser(data);
      router.push("/dashboard");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  }, [router]);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    router.push("/login");
  }, [router]);

  return {
    user,
    login,
    logout,
    loading,
    error,
    isAuthenticated: !!user,
  };
}
