"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { CheckCircle2, XCircle } from "lucide-react";

// ── Static permission defaults (Phase 1 SQL) ──────────────────────────────────
const ROLES = ["superadmin", "directorio", "admin", "supervisor", "evaluador"] as const;
type Role = (typeof ROLES)[number];

const PERMISSION_KEYS: { key: string; label: string; group: string }[] = [
  // Menu access
  { key: "menu_dashboard",    label: "Dashboard",            group: "Menú" },
  { key: "menu_supervision",  label: "Supervisión",          group: "Menú" },
  { key: "menu_objetivos",    label: "Objetivos",            group: "Menú" },
  { key: "menu_reportes",     label: "Reportes",             group: "Menú" },
  { key: "menu_erp",          label: "ERP",                  group: "Menú" },
  { key: "menu_admin",        label: "Administrar",          group: "Menú" },
  { key: "menu_bonos",        label: "Bonos",                group: "Menú" },
  { key: "menu_academy",      label: "Academy",              group: "Menú" },
  // Actions
  { key: "action_edit_objetivos",       label: "Editar Objetivos",         group: "Acciones" },
  { key: "action_toggle_vendedores",    label: "Activar/Desactivar Vend.", group: "Acciones" },
  { key: "action_evaluar_exhibiciones", label: "Evaluar Exhibiciones",     group: "Acciones" },
];

// Defaults matching Phase 1 SQL INSERT for roles_permisos
const MATRIX: Record<Role, Record<string, boolean>> = {
  superadmin: {
    menu_dashboard: true, menu_supervision: true, menu_objetivos: true,
    menu_reportes: true, menu_erp: true, menu_admin: true, menu_bonos: true,
    menu_academy: true, action_edit_objetivos: true,
    action_toggle_vendedores: true, action_evaluar_exhibiciones: true,
  },
  directorio: {
    menu_dashboard: true, menu_supervision: true, menu_objetivos: true,
    menu_reportes: true, menu_erp: false, menu_admin: false, menu_bonos: true,
    menu_academy: false, action_edit_objetivos: false,
    action_toggle_vendedores: false, action_evaluar_exhibiciones: false,
  },
  admin: {
    menu_dashboard: true, menu_supervision: true, menu_objetivos: true,
    menu_reportes: true, menu_erp: true, menu_admin: true, menu_bonos: true,
    menu_academy: true, action_edit_objetivos: true,
    action_toggle_vendedores: true, action_evaluar_exhibiciones: true,
  },
  supervisor: {
    menu_dashboard: true, menu_supervision: true, menu_objetivos: true,
    menu_reportes: false, menu_erp: false, menu_admin: false, menu_bonos: false,
    menu_academy: false, action_edit_objetivos: true,
    action_toggle_vendedores: false, action_evaluar_exhibiciones: false,
  },
  evaluador: {
    menu_dashboard: true, menu_supervision: false, menu_objetivos: false,
    menu_reportes: false, menu_erp: false, menu_admin: false, menu_bonos: false,
    menu_academy: false, action_edit_objetivos: false,
    action_toggle_vendedores: false, action_evaluar_exhibiciones: true,
  },
};

const ROLE_LABELS: Record<Role, string> = {
  superadmin: "Super Admin",
  directorio: "Directorio",
  admin: "Admin",
  supervisor: "Supervisor",
  evaluador: "Evaluador",
};

function PermCell({ allowed }: { allowed: boolean }) {
  return (
    <td className="text-center py-3 px-2">
      {allowed
        ? <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto" />
        : <XCircle className="w-4 h-4 text-red-500/50 mx-auto" />
      }
    </td>
  );
}

export default function PermissionsPage() {
  const router = useRouter();
  const { user } = useAuth();

  // Guard: only superadmin or admin can see this page
  useEffect(() => {
    if (user && user.rol !== "superadmin" && user.rol !== "admin" && !user.is_superadmin) {
      router.replace("/dashboard");
    }
  }, [user, router]);

  if (!user) return null;
  if (user.rol !== "superadmin" && user.rol !== "admin" && !user.is_superadmin) return null;

  // Group permission rows
  const groups = Array.from(new Set(PERMISSION_KEYS.map(p => p.group)));

  return (
    <div
      className="min-h-screen p-6 md:p-10"
      style={{ background: "var(--shelfy-bg)", color: "var(--shelfy-text)" }}
    >
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-black text-white tracking-tight">Matriz de Permisos</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--shelfy-muted)" }}>
            Permisos por rol. Esta vista es de solo lectura — los valores reflejan la configuración base del sistema.
          </p>
        </div>

        {/* Table */}
        <div
          className="rounded-2xl overflow-hidden border"
          style={{
            background: "var(--shelfy-panel)",
            borderColor: "var(--shelfy-border)",
          }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="border-b text-[11px] font-black uppercase tracking-widest"
                  style={{ borderColor: "var(--shelfy-border)", color: "var(--shelfy-muted)" }}
                >
                  <th className="text-left py-4 px-5 w-48">Permiso</th>
                  {ROLES.map(role => (
                    <th key={role} className="text-center py-4 px-3 min-w-[110px]">
                      {ROLE_LABELS[role]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((group, gi) => (
                  <>
                    {/* Group header row */}
                    <tr
                      key={`group-${gi}`}
                      className="border-t"
                      style={{ borderColor: "var(--shelfy-border)", background: "rgba(255,255,255,0.02)" }}
                    >
                      <td
                        colSpan={ROLES.length + 1}
                        className="py-2 px-5 text-[10px] font-black uppercase tracking-widest"
                        style={{ color: "var(--shelfy-primary, #7C3AED)" }}
                      >
                        {group}
                      </td>
                    </tr>

                    {/* Permission rows for this group */}
                    {PERMISSION_KEYS.filter(p => p.group === group).map((perm, i) => (
                      <tr
                        key={perm.key}
                        className="border-t transition-colors hover:bg-white/[0.02]"
                        style={{ borderColor: "var(--shelfy-border)" }}
                      >
                        <td className="py-3 px-5 font-medium text-white/80 whitespace-nowrap">
                          {perm.label}
                          <div className="text-[10px] font-mono mt-0.5" style={{ color: "var(--shelfy-muted)" }}>
                            {perm.key}
                          </div>
                        </td>
                        {ROLES.map(role => (
                          <PermCell key={role} allowed={MATRIX[role][perm.key] ?? false} />
                        ))}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer note */}
        <p className="mt-4 text-xs text-center" style={{ color: "var(--shelfy-muted)" }}>
          Los superadmins siempre tienen acceso completo, independientemente de la tabla de permisos.
        </p>
      </div>
    </div>
  );
}
