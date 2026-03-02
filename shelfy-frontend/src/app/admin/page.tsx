"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { PageSpinner } from "@/components/ui/Spinner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchUsuarios, crearUsuario, eliminarUsuario, type UsuarioPortal } from "@/lib/api";
import { Trash2, UserPlus, Shield } from "lucide-react";

const ROL_LABEL: Record<string, string> = {
  superadmin: "Super Admin",
  admin: "Admin",
  supervisor: "Supervisor",
};

export default function AdminPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [usuarios, setUsuarios] = useState<UsuarioPortal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ login: "", password: "", rol: "supervisor", dist_id: 0 });
  const [saving, setSaving] = useState(false);

  // Roles disponibles según el rol del usuario actual
  // admin solo puede crear supervisores; superadmin puede crear cualquiera
  const rolesDisponibles = user?.rol === "superadmin"
    ? ["supervisor", "admin", "superadmin"]
    : ["supervisor"];

  useEffect(() => {
    // Guard: supervisores no tienen acceso a esta página
    if (user && user.rol === "supervisor") {
      router.replace("/dashboard");
    }
  }, [user, router]);

  const load = () => {
    if (!user || user.rol === "supervisor") return;
    setLoading(true);
    // superadmin ve todos; admin solo ve su distribuidora
    const distId = user.rol === "superadmin" ? undefined : user.id_distribuidor;
    fetchUsuarios(distId)
      .then(setUsuarios)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (user) {
      load();
      setForm((f) => ({ ...f, dist_id: user.id_distribuidor }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await crearUsuario(form);
      setShowForm(false);
      setForm((f) => ({ ...f, login: "", password: "", rol: "supervisor" }));
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al crear usuario");
    } finally {
      setSaving(false);
    }
  }

  async function handleEliminar(id: number) {
    if (!confirm("¿Eliminar este usuario?")) return;
    try {
      await eliminarUsuario(id);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al eliminar");
    }
  }

  // No renderizar nada mientras redirige al supervisor
  if (user?.rol === "supervisor") return null;

  return (
    <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <BottomNav />
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar title="Administración de usuarios" />
        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 overflow-auto">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-[var(--shelfy-muted)] text-sm">{usuarios.length} usuarios</p>
              {user?.rol === "admin" && (
                <p className="text-xs text-[var(--shelfy-muted)] mt-0.5">
                  Puedes crear y gestionar supervisores de tu distribuidora
                </p>
              )}
            </div>
            <Button size="sm" onClick={() => setShowForm(!showForm)}>
              <UserPlus size={14} /> Nuevo usuario
            </Button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
              {error}
            </div>
          )}

          {/* Formulario crear */}
          {showForm && (
            <Card className="mb-6">
              <h3 className="text-[var(--shelfy-text)] font-semibold mb-4 flex items-center gap-2">
                <Shield size={16} className="text-[var(--shelfy-primary)]" />
                Crear usuario
              </h3>
              <form onSubmit={handleCrear} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <input
                  required
                  placeholder="Nombre de usuario"
                  value={form.login}
                  onChange={(e) => setForm((f) => ({ ...f, login: e.target.value }))}
                  className="rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--shelfy-primary)]"
                />
                <input
                  required
                  placeholder="Contraseña"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--shelfy-primary)]"
                />
                <select
                  value={form.rol}
                  onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value }))}
                  className="rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--shelfy-primary)]"
                >
                  {rolesDisponibles.map((r) => (
                    <option key={r} value={r}>{ROL_LABEL[r] ?? r}</option>
                  ))}
                </select>
                {/* Superadmin puede asignar cualquier distribuidora */}
                {user?.rol === "superadmin" && (
                  <input
                    type="number"
                    placeholder="ID Distribuidora"
                    value={form.dist_id || ""}
                    onChange={(e) => setForm((f) => ({ ...f, dist_id: Number(e.target.value) }))}
                    className="rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--shelfy-primary)]"
                  />
                )}
                <div className="md:col-span-2 lg:col-span-3 flex gap-2">
                  <Button type="submit" loading={saving} size="sm">Crear</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                    Cancelar
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {loading && <PageSpinner />}

          {!loading && (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[var(--shelfy-muted)] text-left border-b border-[var(--shelfy-border)]">
                      <th className="pb-3 pr-4">Usuario</th>
                      <th className="pb-3 pr-4">Rol</th>
                      <th className="pb-3 pr-4">Distribuidora</th>
                      <th className="pb-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {usuarios.map((u) => (
                      <tr key={u.id_usuario} className="border-b border-[var(--shelfy-border)] last:border-0 hover:bg-[var(--shelfy-bg)] transition-colors">
                        <td className="py-3 pr-4 text-[var(--shelfy-text)] font-medium">{u.usuario_login}</td>
                        <td className="py-3 pr-4">
                          <RolBadge rol={u.rol} />
                        </td>
                        <td className="py-3 pr-4 text-[var(--shelfy-muted)]">{u.nombre_empresa}</td>
                        <td className="py-3">
                          {/* admin solo puede eliminar supervisores; superadmin puede eliminar cualquiera */}
                          {(user?.rol === "superadmin" || u.rol === "supervisor") && (
                            <button
                              onClick={() => handleEliminar(u.id_usuario)}
                              className="text-[var(--shelfy-muted)] hover:text-[var(--shelfy-error)] transition-colors p-1 rounded hover:bg-red-50"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {usuarios.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-[var(--shelfy-muted)]">
                          No hay usuarios
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}

function RolBadge({ rol }: { rol: string }) {
  const colors: Record<string, string> = {
    superadmin: "bg-purple-100 text-purple-700",
    admin:      "bg-blue-100 text-blue-700",
    supervisor: "bg-green-100 text-green-700",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[rol] ?? "bg-gray-100 text-gray-700"}`}>
      {ROL_LABEL[rol] ?? rol}
    </span>
  );
}
