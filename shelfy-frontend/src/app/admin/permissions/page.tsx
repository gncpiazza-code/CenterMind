"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Save, RotateCcw, ShieldCheck, AlertCircle } from "lucide-react";
import { fetchAllPermissions, updatePermissionsBatch, type PermissionEntry } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
  { key: "action_switch_tenant",        label: "Cambiar de Entorno (Tenant)", group: "Acciones" },
];

const PERMISSION_GROUPS = Array.from(new Set(PERMISSION_KEYS.map(p => p.group)));
const PERMISSIONS_BY_GROUP = PERMISSION_KEYS.reduce<Record<string, typeof PERMISSION_KEYS>>(
  (acc, p) => { (acc[p.group] ??= []).push(p); return acc; },
  {}
);

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
    if (user && !user.is_superadmin) {
      router.replace("/dashboard");
      return;
    }
    loadData();
  }, [user?.is_superadmin, router, loadData]);

  const togglePermission = (role: string, key: string) => {
    if (role === "superadmin") return;
    setMatrix(prev => ({
      ...prev,
      [role]: {
        ...(prev[role] || {}),
        [key]: !prev[role]?.[key],
      },
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
      alert("Permisos actualizados correctamente. Los cambios se aplicarán en el próximo inicio de sesión o recarga.");
    } catch (err) {
      setError("Error al guardar los cambios.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (!user || !user.is_superadmin) return null;

  return (
    <div className="min-h-screen p-6 md:p-10" style={{ background: "var(--shelfy-bg)", color: "var(--shelfy-text)" }}>
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-xl bg-violet-100 text-violet-600">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h1 className="text-3xl font-black tracking-tight" style={{ color: "var(--shelfy-text)" }}>
                Gestión de Accesos
              </h1>
            </div>
            <p className="text-sm" style={{ color: "var(--shelfy-muted)" }}>
              Define qué secciones y acciones puede realizar cada perfil del sistema.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {hasChanges && (
              <Button
                variant="outline"
                size="sm"
                onClick={loadData}
                disabled={saving}
              >
                <RotateCcw className="w-4 h-4" />
                Descartar
              </Button>
            )}
            <Button
              variant="default"
              size="sm"
              onClick={saveChanges}
              disabled={!hasChanges || saving}
              loading={saving}
            >
              <Save className="w-4 h-4" />
              {saving ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 flex items-center gap-3 text-red-600 text-sm font-medium animate-in fade-in slide-in-from-top-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            {error}
          </div>
        )}

        {/* Table Container */}
        <div
          className="rounded-2xl overflow-hidden border shadow-sm relative"
          style={{ borderColor: "var(--shelfy-border)", background: "var(--shelfy-panel)" }}
        >
          {loading && (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl"
              style={{ background: "rgba(248,250,252,0.8)", backdropFilter: "blur(4px)" }}
            >
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-10 h-10 text-violet-500 animate-spin" />
                <span className="text-xs font-black uppercase tracking-widest text-violet-500">
                  Sincronizando Matriz...
                </span>
              </div>
            </div>
          )}

          <div className="overflow-x-auto min-h-[400px]">
            <Table>
              <TableHeader>
                <TableRow className="border-b" style={{ borderColor: "var(--shelfy-border)", background: "rgba(168,85,247,0.03)" }}>
                  <TableHead className="py-5 px-8 w-64">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: "var(--shelfy-muted)" }}>
                      Permiso / Módulo
                    </span>
                  </TableHead>
                  {ROLES.map(role => (
                    <TableHead key={role} className="text-center py-5 px-4 min-w-[120px]">
                      <span className="text-[10px] font-black uppercase tracking-[0.15em]" style={{ color: "var(--shelfy-muted)" }}>
                        {ROLE_LABELS[role]}
                      </span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>

              <TableBody>
                {PERMISSION_GROUPS.map(group => (
                  <Fragment key={group}>
                    <TableRow
                      className="border-b"
                      style={{ borderColor: "var(--shelfy-border)", background: "rgba(168,85,247,0.02)" }}
                    >
                      <TableCell colSpan={ROLES.length + 1} className="py-3 px-8">
                        <span className="text-[9px] font-black uppercase tracking-[0.25em] text-violet-500">
                          {group}
                        </span>
                      </TableCell>
                    </TableRow>

                    {PERMISSIONS_BY_GROUP[group].map(perm => (
                      <TableRow
                        key={perm.key}
                        className="border-b transition-colors hover:bg-violet-50/40"
                        style={{ borderColor: "var(--shelfy-border)" }}
                      >
                        <TableCell className="py-4 px-8">
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold" style={{ color: "var(--shelfy-text)" }}>
                              {perm.label}
                            </span>
                            <span className="text-[10px] font-mono mt-0.5" style={{ color: "var(--shelfy-muted)" }}>
                              {perm.key}
                            </span>
                          </div>
                        </TableCell>

                        {ROLES.map(role => {
                          const isEnabled = matrix[role]?.[perm.key] ?? false;
                          const isSuper = role === "superadmin";

                          return (
                            <TableCell key={role} className="p-2 text-center align-middle">
                              <Checkbox
                                checked={isSuper ? true : isEnabled}
                                disabled={isSuper || saving}
                                onCheckedChange={() => togglePermission(role, perm.key)}
                                className={isSuper ? "mx-auto opacity-60 cursor-default" : "mx-auto cursor-pointer"}
                                aria-label={`${perm.label} para ${ROLE_LABELS[role]}`}
                              />
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Legend */}
        <div
          className="mt-6 flex items-center justify-center gap-6 text-[10px] font-bold uppercase tracking-widest"
          style={{ color: "var(--shelfy-muted)" }}
        >
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-violet-600" />
            <span>Habilitado</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm border" style={{ borderColor: "var(--shelfy-border)" }} />
            <span>Sin Acceso</span>
          </div>
          <span className="mx-2 opacity-30">|</span>
          <span className="normal-case font-medium italic opacity-60">
            * Perfil Super Admin siempre posee acceso total por defecto.
          </span>
        </div>
      </div>
    </div>
  );
}
