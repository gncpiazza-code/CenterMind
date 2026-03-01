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
      id_distribuidor: payload.id_distribuidor,
      nombre_empresa: payload.nombre_empresa,
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
      router.push("/dashboard");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  }, [router]);

  const logout = useCallback(() => {
    clearToken();
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
