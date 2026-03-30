"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { loginApi, type AuthResponse } from "@/lib/api";
import { TOKEN_KEY, JWT_EXPIRE_HOURS } from "@/lib/constants";

function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  document.cookie = `${TOKEN_KEY}=${token}; path=/; max-age=${JWT_EXPIRE_HOURS * 3600}; SameSite=Lax`;
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`;
}

function parseStoredUser(): AuthResponse | null {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      clearToken();
      return null;
    }
    return {
      access_token: token,
      token_type: "bearer",
      usuario: payload.sub,
      rol: payload.rol,
      id_usuario: payload.id_usuario,
      id_distribuidor: payload.id_distribuidor ?? null,
      nombre_empresa: payload.nombre_empresa ?? null,
      is_superadmin: payload.is_superadmin,
      usa_quarentena: payload.usa_quarentena,
      usa_contexto_erp: payload.usa_contexto_erp,
      usa_mapeo_vendedores: payload.usa_mapeo_vendedores,
      show_tutorial: payload.show_tutorial,
    };
  } catch {
    return null;
  }
}

export function useAuth() {
  const router = useRouter();
  // Siempre arranca en null (SSR y primera renderización del cliente son iguales)
  // useEffect popula el user solo en el cliente tras montar → sin hydration mismatch
  const [user, setUser] = useState<AuthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setUser(parseStoredUser());
  }, []);

  const login = useCallback(async (usuario: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await loginApi(usuario, password);
      setToken(data.access_token);
      setUser(data);
      router.push(data.show_tutorial ? "/tutorial" : "/dashboard");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  }, [router]);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    localStorage.removeItem("shelfy_active_dist");
    router.push("/login");
  }, [router]);

  const switchDistributor = useCallback((id: number, nombre: string) => {
    if (user?.rol !== "superadmin") return;
    setUser(prev => prev ? { ...prev, id_distribuidor: id, nombre_empresa: nombre } : null);
    localStorage.setItem("shelfy_active_dist", JSON.stringify({ id, nombre }));
    window.location.reload();
  }, [user?.rol]);

  useEffect(() => {
    const stored = localStorage.getItem("shelfy_active_dist");
    if (stored && user?.rol === "superadmin") {
      try {
        const { id, nombre } = JSON.parse(stored);
        if (user.id_distribuidor !== id) {
          setUser(prev => prev ? { ...prev, id_distribuidor: id, nombre_empresa: nombre } : null);
        }
      } catch { }
    }
  }, [user?.rol, user?.id_distribuidor]);

  return {
    user,
    login,
    logout,
    switchDistributor,
    loading,
    error,
    isAuthenticated: !!user,
  };
}
