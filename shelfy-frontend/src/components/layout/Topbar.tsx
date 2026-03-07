"use client";

import { useAuth } from "@/hooks/useAuth";
import { LogOut, ChevronDown, Globe } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchDistribuidores } from "@/lib/api";

interface TopbarProps {
  title: string;
}

export function Topbar({ title }: TopbarProps) {
  const { user, logout, switchDistributor } = useAuth();
  const [dists, setDists] = useState<{ id_distribuidor: number; nombre_dist: string }[]>([]);
  const [showSwitch, setShowSwitch] = useState(false);

  useEffect(() => {
    if (user?.rol === "superadmin") {
      fetchDistribuidores().then(setDists).catch(console.error);
    }
  }, [user?.rol]);

  return (
    <header className="h-14 flex items-center justify-between px-4 md:px-6 border-b border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] shrink-0 z-50">
      <div className="flex items-center gap-4">
        <h1 className="text-[var(--shelfy-text)] font-semibold text-base">{title}</h1>

        {/* Switcher para SuperAdmin */}
        {user?.rol === "superadmin" && (
          <div className="relative">
            <button
              onClick={() => setShowSwitch(!showSwitch)}
              className="flex items-center gap-2 px-3 py-1 rounded-lg bg-violet-50 text-violet-700 text-xs font-black border border-violet-100 hover:bg-violet-100 transition-all uppercase tracking-tight"
            >
              <Globe size={14} />
              <span className="max-w-[120px] truncate">{user.nombre_empresa || "Global"}</span>
              <ChevronDown size={14} />
            </button>

            {showSwitch && (
              <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-slate-100 shadow-2xl rounded-2xl overflow-hidden z-[100] animate-in fade-in slide-in-from-top-2">
                <div className="p-3 bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Cambiar Contexto Operativo
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {dists.map(d => (
                    <button
                      key={d.id_distribuidor}
                      onClick={() => {
                        switchDistributor(d.id_distribuidor, d.nombre_dist);
                        setShowSwitch(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-violet-50 transition-colors flex items-center justify-between ${user.id_distribuidor === d.id_distribuidor ? 'text-violet-600 bg-violet-50/50' : 'text-slate-600'}`}
                    >
                      {d.nombre_dist}
                      {user.id_distribuidor === d.id_distribuidor && <div className="w-1.5 h-1.5 rounded-full bg-violet-500" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {user && (
        <div className="flex items-center gap-2">
          <div className="hidden sm:block text-right">
            <p className="text-xs font-medium text-[var(--shelfy-text)]">{user.usuario}</p>
            <p className="text-[10px] text-[var(--shelfy-muted)]">{user.nombre_empresa}</p>
          </div>
          <div className="w-8 h-8 rounded-full bg-[var(--shelfy-primary)] flex items-center justify-center text-white text-xs font-bold shrink-0">
            {user.usuario.charAt(0).toUpperCase()}
          </div>
          {/* Logout — visible en mobile (en desktop también está en el Sidebar) */}
          <button
            onClick={logout}
            title="Cerrar sesión"
            className="md:hidden p-2 rounded-xl text-[var(--shelfy-muted)] hover:text-[var(--shelfy-error)] hover:bg-red-50 transition-colors"
          >
            <LogOut size={18} />
          </button>
        </div>
      )}
    </header>
  );
}
