"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { loginApi, type AuthResponse } from "@/lib/api";
import { TOKEN_KEY, JWT_EXPIRE_HOURS } from "@/lib/constants";

interface AuthContextType {
  user: AuthResponse | null;
  login: (usuario: string, password: string) => Promise<void>;
  logout: () => void;
  switchDistributor: (id: number, nombre: string) => void;
  setTutorialSeen: () => void;
  hasPermiso: (key: string) => boolean;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  document.cookie = `${TOKEN_KEY}=${token}; path=/; max-age=${JWT_EXPIRE_HOURS * 3600}; SameSite=Lax`;
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`;
}

function parseStoredUser(): AuthResponse | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      clearToken();
      return null;
    }
    const showTutorialFromToken = payload.show_tutorial;
    // Overriden if locally marked as seen (to fix JWT staleness)
    const locallySeen = localStorage.getItem("shelfy_tutorial_v2_seen") === "true";

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
      show_tutorial: locallySeen ? false : showTutorialFromToken,
      permisos: payload.permisos ?? {},
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
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
    localStorage.removeItem("shelfy_active_dist");
    router.push("/login");
  }, [router]);

  // Superadmin bypasses all permission checks (always true).
  // If permisos dict is empty (old tokens without permisos), default to true for backward compat.
  const hasPermiso = useCallback((key: string): boolean => {
    if (!user) return false;
    if (user.is_superadmin) return true;
    const permisos = user.permisos ?? {};
    if (Object.keys(permisos).length === 0) return true;
    return permisos[key] ?? true;
  }, [user]);

  const switchDistributor = useCallback((id: number, nombre: string) => {
    if (!user?.is_superadmin && !hasPermiso("action_switch_tenant")) return;
    setUser(prev => prev ? { ...prev, id_distribuidor: id, nombre_empresa: nombre } : null);
    localStorage.setItem("shelfy_active_dist", JSON.stringify({ id, nombre }));
    window.location.reload();
  }, [user?.is_superadmin, hasPermiso]);

  const setTutorialSeen = useCallback(() => {
    localStorage.setItem("shelfy_tutorial_v2_seen", "true");
    setUser(prev => prev ? { ...prev, show_tutorial: false } : null);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("shelfy_active_dist");
    const canSwitch = user?.is_superadmin || hasPermiso("action_switch_tenant");
    
    if (stored && canSwitch) {
      try {
        const { id, nombre } = JSON.parse(stored);
        if (user && user.id_distribuidor !== id) {
          setUser(prev => prev ? { ...prev, id_distribuidor: id, nombre_empresa: nombre } : null);
        }
      } catch { }
    }
  }, [user?.is_superadmin, user?.id_distribuidor, hasPermiso]);

  return (
    <AuthContext.Provider value={{
      user,
      login,
      logout,
      switchDistributor,
      setTutorialSeen,
      hasPermiso,
      loading,
      error,
      isAuthenticated: !!user
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return context;
}
