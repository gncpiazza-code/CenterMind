"use client";

import { useEffect, useState } from "react";
import { Search, Shield, UserPlus, Edit2, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageSpinner } from "@/components/ui/Spinner";
import { fetchUsuarios, crearUsuario, editarUsuario, eliminarUsuario, type UsuarioPortal } from "@/lib/api";

const ROL_LABEL: Record<string, string> = {
  superadmin: "Super Admin",
  admin: "Admin",
  supervisor: "Supervisor",
  directorio: "Directorio",
  evaluador: "Evaluador",
};

const INPUT_CLS = "rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--shelfy-primary)]";

export function RolBadge({ rol }: { rol: string }) {
  const colors: Record<string, string> = {
    superadmin: "bg-purple-100 text-purple-700",
    admin: "bg-blue-100 text-blue-700",
    supervisor: "bg-green-100 text-green-700",
    directorio: "bg-slate-100 text-slate-700",
    evaluador: "bg-amber-100 text-amber-700",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[rol] ?? "bg-gray-100 text-gray-700"}`}>
      {ROL_LABEL[rol] ?? rol}
    </span>
  );
}

interface TabUsuariosProps {
  isSuperadmin: boolean;
  distId: number;
}

export default function TabUsuarios({ isSuperadmin, distId }: TabUsuariosProps) {
  const [usuarios, setUsuarios] = useState<UsuarioPortal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ login: "", password: "", rol: "supervisor", dist_id: distId });
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [editUserForm, setEditUserForm] = useState({ login: "", password: "", rol: "supervisor" });
  const [changingUserId, setChangingUserId] = useState<number | null>(null);

  const rolesDisponibles = isSuperadmin 
    ? ["supervisor", "admin", "superadmin", "directorio", "evaluador"] 
    : ["supervisor", "admin", "evaluador"];

  const load = () => {
    setLoading(true);
    fetchUsuarios(isSuperadmin ? undefined : distId)
      .then(setUsuarios)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
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

  async function handleGuardarEdicion(id: number) {
    if (!editUserForm.login.trim()) return;
    setChangingUserId(id);
    setError(null);
    try {
      await editarUsuario(id, {
        login: editUserForm.login.trim(),
        rol: editUserForm.rol,
        password: editUserForm.password || undefined
      });
      setEditingUserId(null);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al editar usuario");
    } finally {
      setChangingUserId(null);
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

  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-400">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-[var(--shelfy-muted)] text-sm">{usuarios.length} usuarios registrados</p>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--shelfy-muted)]" size={14} />
            <input
              type="text"
              placeholder="Buscar usuario..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-3 py-1.5 text-sm focus:outline-none focus:border-[var(--shelfy-primary)] w-[200px]"
            />
          </div>
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <UserPlus size={14} /> Nuevo usuario
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {showForm && (
        <Card className="border-t-4 border-t-[var(--shelfy-primary)] shadow-lg animate-in slide-in-from-top-2 duration-300">
          <h3 className="text-[var(--shelfy-text)] font-semibold mb-4 flex items-center gap-2">
            <Shield size={16} className="text-[var(--shelfy-primary)]" />
            Crear nuevo administrador
          </h3>
          <form onSubmit={handleCrear} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase font-bold text-[var(--shelfy-muted)] ml-1">Usuario</label>
              <input required placeholder="Nombre de usuario" value={form.login}
                onChange={(e) => setForm((f) => ({ ...f, login: e.target.value }))}
                className={INPUT_CLS} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase font-bold text-[var(--shelfy-muted)] ml-1">Contraseña</label>
              <input required placeholder="Contraseña" type="password" value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className={INPUT_CLS} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase font-bold text-[var(--shelfy-muted)] ml-1">Rol</label>
              <select value={form.rol} onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value }))}
                className={INPUT_CLS}>
                {rolesDisponibles.map((r) => (
                  <option key={r} value={r}>{ROL_LABEL[r] ?? r}</option>
                ))}
              </select>
            </div>
            {isSuperadmin && (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-bold text-[var(--shelfy-muted)] ml-1">ID Distribuidora</label>
                <input type="number" placeholder="ID Distribuidora" value={form.dist_id || ""}
                  onChange={(e) => setForm((f) => ({ ...f, dist_id: Number(e.target.value) }))}
                  className={INPUT_CLS} />
              </div>
            )}
            <div className="md:col-span-2 lg:col-span-3 flex gap-2 mt-2">
              <Button type="submit" loading={saving} size="sm">Confirmar y Crear</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <div className="py-20 flex justify-center"><PageSpinner /></div>
      ) : (
        <Card className="overflow-hidden p-0 border-[var(--shelfy-border)]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--shelfy-panel)]/50 text-[var(--shelfy-muted)] text-left border-b border-[var(--shelfy-border)]">
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Usuario</th>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Rol</th>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Distribuidora</th>
                  <th className="py-3 px-4 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--shelfy-border)]">
                {usuarios.filter(u =>
                  u.usuario_login.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  (u.nombre_empresa && u.nombre_empresa.toLowerCase().includes(searchQuery.toLowerCase())) ||
                  u.rol.toLowerCase().includes(searchQuery.toLowerCase())
                ).map((u) => (
                  <tr key={u.id_usuario} className="hover:bg-[var(--shelfy-panel)]/30 transition-colors">
                    {editingUserId === u.id_usuario ? (
                      <>
                        <td className="py-3 px-4">
                          <input
                            value={editUserForm.login}
                            onChange={e => setEditUserForm(f => ({ ...f, login: e.target.value }))}
                            className={INPUT_CLS + " !py-1 w-full"}
                          />
                          <input
                            value={editUserForm.password}
                            onChange={e => setEditUserForm(f => ({ ...f, password: e.target.value }))}
                            className={INPUT_CLS + " !py-1 mt-1 w-full"}
                            placeholder="Nueva contraseña"
                            type="password"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <select
                            value={editUserForm.rol}
                            onChange={e => setEditUserForm(f => ({ ...f, rol: e.target.value }))}
                            className={INPUT_CLS + " !py-1"}
                          >
                            {rolesDisponibles.map((r) => (
                              <option key={r} value={r}>{ROL_LABEL[r] ?? r}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 px-4 text-[var(--shelfy-muted)]">{u.nombre_empresa}</td>
                        <td className="py-3 px-4 flex gap-1 items-center justify-end">
                          <Button size="sm" loading={changingUserId === u.id_usuario} onClick={() => handleGuardarEdicion(u.id_usuario)}>OK</Button>
                          <Button size="sm" variant="ghost" className="px-2" onClick={() => setEditingUserId(null)}>X</Button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-4 px-4 text-[var(--shelfy-text)] font-semibold">
                          {u.usuario_login}
                        </td>
                        <td className="py-4 px-4"><RolBadge rol={u.rol} /></td>
                        <td className="py-4 px-4 text-[var(--shelfy-muted)] text-xs font-medium">{u.nombre_empresa}</td>
                        <td className="py-4 px-4 flex gap-3 justify-end">
                          {(isSuperadmin || u.rol === "supervisor" || u.rol === "admin") && (
                            <>
                              <button onClick={() => {
                                setEditingUserId(u.id_usuario);
                                setEditUserForm({ login: u.usuario_login, password: "", rol: u.rol });
                              }}
                                className="text-[var(--shelfy-muted)] hover:text-[var(--shelfy-primary)] transition-all p-1.5 rounded-lg hover:bg-[var(--shelfy-primary)]/10">
                                <Edit2 size={15} />
                              </button>
                              <button onClick={() => handleEliminar(u.id_usuario)}
                                className="text-[var(--shelfy-muted)] hover:text-red-500 transition-all p-1.5 rounded-lg hover:bg-red-500/10">
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {usuarios.length === 0 && (
                  <tr><td colSpan={4} className="py-20 text-center text-[var(--shelfy-muted)] italic">No se encontraron usuarios</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
