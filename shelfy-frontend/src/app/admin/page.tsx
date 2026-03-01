"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { PageSpinner } from "@/components/ui/Spinner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { fetchUsuarios, crearUsuario, editarUsuario, eliminarUsuario, type UsuarioPortal } from "@/lib/api";
import { Trash2, Pencil, UserPlus } from "lucide-react";

export default function AdminPage() {
  const { user } = useAuth();
  const [usuarios, setUsuarios] = useState<UsuarioPortal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ login: "", password: "", rol: "admin", dist_id: 0 });
  const [saving, setSaving] = useState(false);

  const load = () => {
    if (!user) return;
    setLoading(true);
    const distId = user.rol === "superadmin" ? undefined : user.id_distribuidor;
    fetchUsuarios(distId)
      .then(setUsuarios)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    if (user) setForm((f) => ({ ...f, dist_id: user.id_distribuidor }));
  }, [user]);

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await crearUsuario(form);
      setShowForm(false);
      setForm((f) => ({ ...f, login: "", password: "" }));
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
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
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  return (
    <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar title="Administración de usuarios" />
        <main className="flex-1 p-6 overflow-auto">
          <div className="flex items-center justify-between mb-6">
            <p className="text-[var(--shelfy-muted)] text-sm">{usuarios.length} usuarios</p>
            <Button size="sm" onClick={() => setShowForm(!showForm)}>
              <UserPlus size={14} /> Nuevo usuario
            </Button>
          </div>

          {error && <p className="text-[var(--shelfy-error)] text-sm mb-4">{error}</p>}

          {/* Formulario crear */}
          {showForm && (
            <Card className="mb-6">
              <h3 className="text-[var(--shelfy-text)] font-medium mb-4">Crear usuario</h3>
              <form onSubmit={handleCrear} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input
                  required placeholder="Usuario"
                  value={form.login}
                  onChange={(e) => setForm((f) => ({ ...f, login: e.target.value }))}
                  className="rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--shelfy-primary)]"
                />
                <input
                  required placeholder="Contraseña" type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--shelfy-primary)]"
                />
                <select
                  value={form.rol}
                  onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value }))}
                  className="rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--shelfy-primary)]"
                >
                  <option value="admin">admin</option>
                  <option value="supervisor">supervisor</option>
                  <option value="superadmin">superadmin</option>
                </select>
                <div className="md:col-span-3 flex gap-2">
                  <Button type="submit" loading={saving} size="sm">Crear</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
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
                      <th className="pb-2 pr-4">Usuario</th>
                      <th className="pb-2 pr-4">Rol</th>
                      <th className="pb-2 pr-4">Distribuidora</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {usuarios.map((u) => (
                      <tr key={u.id_usuario} className="border-b border-[var(--shelfy-border)]/40 hover:bg-[var(--shelfy-bg)]/40">
                        <td className="py-2 pr-4 text-[var(--shelfy-text)]">{u.usuario_login}</td>
                        <td className="py-2 pr-4">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--shelfy-primary)]/20 text-[var(--shelfy-primary)]">
                            {u.rol}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-[var(--shelfy-muted)]">{u.nombre_empresa}</td>
                        <td className="py-2">
                          <button
                            onClick={() => handleEliminar(u.id_usuario)}
                            className="text-[var(--shelfy-muted)] hover:text-[var(--shelfy-error)] transition-colors p-1"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
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
