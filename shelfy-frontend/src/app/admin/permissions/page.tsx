"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Check, Loader2, Save, RotateCcw, ShieldCheck, AlertCircle } from "lucide-react";
import { fetchAllPermissions, updatePermissionsBatch, type PermissionEntry } from "@/lib/api";

const ROLES = ["superadmin", "directorio", "admin", "supervisor", "evaluador"] as const;
type Role = (typeof ROLES)[number];

const ROLE_LABELS: Record<Role, string> = {
  superadmin: "Super Admin",
  directorio: "Directorio",
  admin: "Admin",
  supervisor: "Supervisor",
  evaluador: "Evaluador",
};

const PERMISSION_KEYS: { key: string; label: string; group: string }[] = [
  { key: "menu_dashboard",    label: "Dashboard",            group: "Menú" },
  { key: "menu_supervision",  label: "Supervisión",          group: "Menú" },
  { key: "menu_objetivos",    label: "Objetivos",            group: "Menú" },
  { key: "menu_reportes",     label: "Reportes",             group: "Menú" },
  { key: "menu_erp",          label: "ERP",                  group: "Menú" },
  { key: "menu_admin",        label: "Administrar",          group: "Menú" },
  { key: "menu_bonos",        label: "Bonos",                group: "Menú" },
  { key: "menu_academy",      label: "Academy",              group: "Menú" },
  { key: "action_edit_objetivos",       label: "Editar Objetivos",         group: "Acciones" },
  { key: "action_toggle_vendedores",    label: "Activar/Desactivar Vend.", group: "Acciones" },
  { key: "action_evaluar_exhibiciones", label: "Evaluar Exhibiciones",     group: "Acciones" },
];

export default function PermissionsPage() {
  const router = useRouter();
  const { user } = useAuth();
  
  const [matrix, setMatrix] = useState<Record<string, Record<string, boolean>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchAllPermissions();
      
      const newMatrix: Record<string, Record<string, boolean>> = {};
      ROLES.forEach(r => { newMatrix[r] = {}; });
      
      data.forEach((p: PermissionEntry) => {
        if (!newMatrix[p.rol]) newMatrix[p.rol] = {};
        newMatrix[p.rol][p.permiso_key] = p.valor;
      });
      
      setMatrix(newMatrix);
      setHasChanges(false);
    } catch (err) {
      setError("Error al cargar la matriz de permisos.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && !user.is_superadmin && user.rol !== "superadmin") {
      router.replace("/dashboard");
      return;
    }
    loadData();
  }, [user, router, loadData]);

  const togglePermission = (role: string, key: string) => {
    // Superadmin is holy and cannot be edited (logic usually bypasses it anyway)
    if (role === "superadmin") return;

    setMatrix(prev => ({
      ...prev,
      [role]: {
        ...(prev[role] || {}),
        [key]: !prev[role]?.[key]
      }
    }));
    setHasChanges(true);
  };

  const saveChanges = async () => {
    try {
      setSaving(true);
      setError(null);
      
      const payload: PermissionEntry[] = [];
      Object.entries(matrix).forEach(([rol, perms]) => {
        Object.entries(perms).forEach(([key, val]) => {
          payload.push({ rol, permiso_key: key, valor: val });
        });
      });
      
      await updatePermissionsBatch(payload);
      setHasChanges(false);
      // Optional: replace current view or alert
      alert("Permisos actualizados correctamente. Los cambios se aplicarán en el próximo inicio de sesión o recarga.");
    } catch (err) {
      setError("Error al guardar los cambios.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (!user || (!user.is_superadmin && user.rol !== "superadmin")) return null;

  const groups = Array.from(new Set(PERMISSION_KEYS.map(p => p.group)));

  return (
    <div className="min-h-screen p-6 md:p-10" style={{ background: "var(--shelfy-bg)", color: "var(--shelfy-text)" }}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-xl bg-violet-600/20 text-violet-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h1 className="text-3xl font-black text-white tracking-tight">Gestión de Accesos</h1>
            </div>
            <p className="text-sm" style={{ color: "var(--shelfy-muted)" }}>
              Define qué secciones y acciones puede realizar cada perfil del sistema.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {hasChanges && (
              <button
                onClick={loadData}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-white/5 hover:bg-white/10 text-white transition-all border border-white/10"
              >
                <RotateCcw className="w-4 h-4" />
                Descartar
              </button>
            )}
            <button
              onClick={saveChanges}
              disabled={!hasChanges || saving}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all shadow-lg
                ${hasChanges 
                  ? "bg-violet-600 hover:bg-violet-500 text-white shadow-violet-600/20" 
                  : "bg-white/5 text-white/40 cursor-not-allowed border border-white/5"}`}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Guardando..." : "Guardar Cambios"}
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center gap-3 text-red-500 text-sm font-medium animate-in fade-in slide-in-from-top-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            {error}
          </div>
        )}

        {/* Table Container */}
        <div className="rounded-3xl overflow-hidden border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] backdrop-blur-xl shadow-2xl relative">
          {loading && (
            <div className="absolute inset-0 z-10 bg-[var(--shelfy-bg)]/60 backdrop-blur-sm flex items-center justify-center">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-10 h-10 text-violet-500 animate-spin" />
                <span className="text-xs font-black uppercase tracking-widest text-violet-400">Sincronizando Matriz...</span>
              </div>
            </div>
          )}

          <div className="overflow-x-auto min-h-[400px]">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[var(--shelfy-border)] bg-white/[0.02]">
                  <th className="py-6 px-8 w-60">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--shelfy-muted)]">Permiso / Módulo</span>
                  </th>
                  {ROLES.map(role => (
                    <th key={role} className="text-center py-6 px-4 min-w-[120px]">
                      <span className="text-[10px] font-black uppercase tracking-[0.15em] text-[var(--shelfy-muted)]">
                        {ROLE_LABELS[role]}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--shelfy-border)]/50">
                {groups.map((group, gi) => (
                  <div key={group} className="contents shadow-inner">
                    <tr className="bg-white/[0.01]">
                      <td colSpan={ROLES.length + 1} className="py-3 px-8">
                        <span className="text-[9px] font-black uppercase tracking-[0.25em] text-violet-400/80">
                          {group}
                        </span>
                      </td>
                    </tr>
                    
                    {PERMISSION_KEYS.filter(p => p.group === group).map((perm) => (
                      <tr 
                        key={perm.key} 
                        className="group border-b border-[var(--shelfy-border)] transition-colors hover:bg-white/[0.02]"
                      >
                        <td className="py-5 px-8">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-white/90 group-hover:text-white transition-colors">
                              {perm.label}
                            </span>
                            <span className="text-[10px] font-mono text-[var(--shelfy-muted)] mt-0.5">
                              {perm.key}
                            </span>
                          </div>
                        </td>
                        
                        {ROLES.map(role => {
                          const isEnabled = matrix[role]?.[perm.key] ?? false;
                          const isSuper = role === "superadmin";
                          
                          return (
                            <td key={role} className="p-2 text-center">
                              <button
                                onClick={() => togglePermission(role, perm.key)}
                                disabled={isSuper || saving}
                                className={`w-10 h-10 rounded-2xl mx-auto flex items-center justify-center transition-all duration-200 border-2
                                  ${isSuper 
                                    ? "bg-violet-600/30 border-violet-500/30 text-white cursor-default" 
                                    : isEnabled 
                                      ? "bg-violet-600/20 border-violet-600/50 text-violet-400 hover:bg-violet-600/30 hover:scale-110 active:scale-95" 
                                      : "bg-white/[0.03] border-white/[0.08] text-white/10 hover:border-white/20 hover:bg-white/[0.05] hover:scale-110 active:scale-95"
                                  }`}
                              >
                                {(isSuper || isEnabled) && <Check className="w-5 h-5 stroke-[3px]" />}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </div>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Info */}
        <div className="mt-8 flex items-center justify-center gap-4 text-[10px] font-bold uppercase tracking-widest text-[var(--shelfy-muted)]">
          <div className="flex items-center gap-1.5 grayscale opacity-50">
             <div className="w-3 h-3 rounded bg-violet-600" />
             <span>Habilitado</span>
          </div>
          <div className="flex items-center gap-1.5 grayscale opacity-50">
             <div className="w-3 h-3 rounded border border-white/20" />
             <span>Sin Acceso</span>
          </div>
          <span className="mx-2 opacity-20">|</span>
          <span className="normal-case font-medium italic opacity-60">* Perfil Super Admin siempre posee acceso total por defecto.</span>
        </div>
      </div>
    </div>
  );
}
