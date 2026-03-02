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
import {
  fetchUsuarios, crearUsuario, eliminarUsuario, type UsuarioPortal,
  fetchDistribuidoras, crearDistribuidora, toggleDistribuidora, type Distribuidora,
  fetchIntegrantes, setRolIntegrante, type Integrante,
} from "@/lib/api";
import { Trash2, UserPlus, Shield, Building2, Users, ToggleLeft, ToggleRight, RefreshCw } from "lucide-react";

const ROL_LABEL: Record<string, string> = {
  superadmin: "Super Admin",
  admin: "Admin",
  supervisor: "Supervisor",
};

const ROLES_TELEGRAM = ["supervisor", "admin", "inactivo"];

const INPUT_CLS = "rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--shelfy-primary)]";

// ── Tab: Usuarios ─────────────────────────────────────────────────────────────

function TabUsuarios({ isSuperadmin, distId }: { isSuperadmin: boolean; distId: number }) {
  const [usuarios, setUsuarios] = useState<UsuarioPortal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ login: "", password: "", rol: "supervisor", dist_id: distId });
  const [saving, setSaving] = useState(false);

  const rolesDisponibles = isSuperadmin ? ["supervisor", "admin", "superadmin"] : ["supervisor"];

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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-[var(--shelfy-muted)] text-sm">{usuarios.length} usuarios</p>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <UserPlus size={14} /> Nuevo usuario
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {showForm && (
        <Card>
          <h3 className="text-[var(--shelfy-text)] font-semibold mb-4 flex items-center gap-2">
            <Shield size={16} className="text-[var(--shelfy-primary)]" />
            Crear usuario
          </h3>
          <form onSubmit={handleCrear} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <input required placeholder="Nombre de usuario" value={form.login}
              onChange={(e) => setForm((f) => ({ ...f, login: e.target.value }))}
              className={INPUT_CLS} />
            <input required placeholder="Contraseña" type="password" value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className={INPUT_CLS} />
            <select value={form.rol} onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value }))}
              className={INPUT_CLS}>
              {rolesDisponibles.map((r) => (
                <option key={r} value={r}>{ROL_LABEL[r] ?? r}</option>
              ))}
            </select>
            {isSuperadmin && (
              <input type="number" placeholder="ID Distribuidora" value={form.dist_id || ""}
                onChange={(e) => setForm((f) => ({ ...f, dist_id: Number(e.target.value) }))}
                className={INPUT_CLS} />
            )}
            <div className="md:col-span-2 lg:col-span-3 flex gap-2">
              <Button type="submit" loading={saving} size="sm">Crear</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? <PageSpinner /> : (
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
                    <td className="py-3 pr-4"><RolBadge rol={u.rol} /></td>
                    <td className="py-3 pr-4 text-[var(--shelfy-muted)]">{u.nombre_empresa}</td>
                    <td className="py-3">
                      {(isSuperadmin || u.rol === "supervisor") && (
                        <button onClick={() => handleEliminar(u.id_usuario)}
                          className="text-[var(--shelfy-muted)] hover:text-[var(--shelfy-error)] transition-colors p-1 rounded hover:bg-red-50">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {usuarios.length === 0 && (
                  <tr><td colSpan={4} className="py-8 text-center text-[var(--shelfy-muted)]">No hay usuarios</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Tab: Distribuidoras (superadmin only) ─────────────────────────────────────

function TabDistribuidoras() {
  const [distribuidoras, setDistribuidoras] = useState<Distribuidora[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nombre: "", token: "", carpeta_drive: "", ruta_cred: "" });
  const [saving, setSaving] = useState(false);
  const [soloActivas, setSoloActivas] = useState(false);

  const load = () => {
    setLoading(true);
    fetchDistribuidoras(soloActivas)
      .then(setDistribuidoras)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [soloActivas]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await crearDistribuidora(form);
      setShowForm(false);
      setForm({ nombre: "", token: "", carpeta_drive: "", ruta_cred: "" });
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al crear");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(id: number, estadoActual: string) {
    const nuevoEstado = estadoActual === "activo" ? "inactivo" : "activo";
    try {
      await toggleDistribuidora(id, nuevoEstado as "activo" | "inactivo");
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <p className="text-[var(--shelfy-muted)] text-sm">{distribuidoras.length} distribuidoras</p>
          <label className="flex items-center gap-1.5 text-xs text-[var(--shelfy-muted)] cursor-pointer select-none">
            <input type="checkbox" checked={soloActivas} onChange={(e) => setSoloActivas(e.target.checked)}
              className="rounded" />
            Solo activas
          </label>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Building2 size={14} /> Nueva distribuidora
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {showForm && (
        <Card>
          <h3 className="text-[var(--shelfy-text)] font-semibold mb-4 flex items-center gap-2">
            <Building2 size={16} className="text-[var(--shelfy-primary)]" />
            Nueva distribuidora
          </h3>
          <form onSubmit={handleCrear} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[var(--shelfy-muted)] mb-1">Nombre *</label>
              <input required placeholder="Ej: Distribuidora Norte" value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                className={INPUT_CLS + " w-full"} />
            </div>
            <div>
              <label className="block text-xs text-[var(--shelfy-muted)] mb-1">Token bot Telegram *</label>
              <input required placeholder="Bot token" value={form.token}
                onChange={(e) => setForm((f) => ({ ...f, token: e.target.value }))}
                className={INPUT_CLS + " w-full"} />
            </div>
            <div>
              <label className="block text-xs text-[var(--shelfy-muted)] mb-1">ID Carpeta Drive</label>
              <input placeholder="ID de carpeta Google Drive" value={form.carpeta_drive}
                onChange={(e) => setForm((f) => ({ ...f, carpeta_drive: e.target.value }))}
                className={INPUT_CLS + " w-full"} />
            </div>
            <div>
              <label className="block text-xs text-[var(--shelfy-muted)] mb-1">Ruta credencial Drive</label>
              <input placeholder="Ruta al JSON de credencial" value={form.ruta_cred}
                onChange={(e) => setForm((f) => ({ ...f, ruta_cred: e.target.value }))}
                className={INPUT_CLS + " w-full"} />
            </div>
            <div className="md:col-span-2 flex gap-2">
              <Button type="submit" loading={saving} size="sm">Crear</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? <PageSpinner /> : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--shelfy-muted)] text-left border-b border-[var(--shelfy-border)]">
                  <th className="pb-3 pr-4 w-8">ID</th>
                  <th className="pb-3 pr-4">Nombre</th>
                  <th className="pb-3 pr-4">Estado</th>
                  <th className="pb-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {distribuidoras.map((d) => (
                  <tr key={d.id} className="border-b border-[var(--shelfy-border)] last:border-0 hover:bg-[var(--shelfy-bg)] transition-colors">
                    <td className="py-3 pr-4 text-[var(--shelfy-muted)] tabular-nums">{d.id}</td>
                    <td className="py-3 pr-4 text-[var(--shelfy-text)] font-medium">{d.nombre}</td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${d.estado === "activo" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {d.estado}
                      </span>
                    </td>
                    <td className="py-3">
                      <button
                        onClick={() => handleToggle(d.id, d.estado)}
                        title={d.estado === "activo" ? "Desactivar" : "Activar"}
                        className="text-[var(--shelfy-muted)] hover:text-[var(--shelfy-primary)] transition-colors p-1 rounded"
                      >
                        {d.estado === "activo"
                          ? <ToggleRight size={18} className="text-green-500" />
                          : <ToggleLeft size={18} />}
                      </button>
                    </td>
                  </tr>
                ))}
                {distribuidoras.length === 0 && (
                  <tr><td colSpan={4} className="py-8 text-center text-[var(--shelfy-muted)]">No hay distribuidoras</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Tab: Integrantes Telegram ─────────────────────────────────────────────────

function TabIntegrantes({ isSuperadmin, distId }: { isSuperadmin: boolean; distId: number }) {
  const [integrantes, setIntegrantes] = useState<Integrante[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [changingId, setChangingId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    fetchIntegrantes(isSuperadmin ? undefined : distId)
      .then(setIntegrantes)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCambiarRol(id: number, nuevoRol: string, distribuidorId: number) {
    setChangingId(id);
    setError(null);
    try {
      await setRolIntegrante(id, nuevoRol, isSuperadmin ? undefined : distribuidorId);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al cambiar rol");
    } finally {
      setChangingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-[var(--shelfy-muted)] text-sm">{integrantes.length} integrantes de Telegram</p>
        <button onClick={load} className="p-2 text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] border border-[var(--shelfy-border)] rounded-lg bg-[var(--shelfy-panel)] transition-colors">
          <RefreshCw size={13} />
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {loading ? <PageSpinner /> : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--shelfy-muted)] text-left border-b border-[var(--shelfy-border)]">
                  <th className="pb-3 pr-4">Nombre</th>
                  {isSuperadmin && <th className="pb-3 pr-4">Distribuidora</th>}
                  <th className="pb-3 pr-4">Telegram ID</th>
                  <th className="pb-3 pr-4">Rol</th>
                </tr>
              </thead>
              <tbody>
                {integrantes.map((ig) => (
                  <tr key={ig.id_integrante} className="border-b border-[var(--shelfy-border)] last:border-0 hover:bg-[var(--shelfy-bg)] transition-colors">
                    <td className="py-3 pr-4 text-[var(--shelfy-text)] font-medium">{ig.nombre_integrante}</td>
                    {isSuperadmin && <td className="py-3 pr-4 text-[var(--shelfy-muted)] text-xs">{ig.nombre_empresa}</td>}
                    <td className="py-3 pr-4 text-[var(--shelfy-muted)] tabular-nums text-xs">{ig.telegram_user_id || "—"}</td>
                    <td className="py-3 pr-4">
                      <select
                        value={ig.rol_telegram ?? "supervisor"}
                        disabled={changingId === ig.id_integrante}
                        onChange={(e) => handleCambiarRol(ig.id_integrante, e.target.value, ig.telegram_group_id)}
                        className="rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-2 py-1 text-xs focus:outline-none focus:border-[var(--shelfy-primary)]"
                      >
                        {ROLES_TELEGRAM.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
                {integrantes.length === 0 && (
                  <tr>
                    <td colSpan={isSuperadmin ? 4 : 3} className="py-8 text-center text-[var(--shelfy-muted)]">
                      No hay integrantes registrados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function AdminPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isSuperadmin = user?.rol === "superadmin";

  const TABS = [
    { id: "usuarios",       label: "Usuarios",       icon: Shield    },
    { id: "integrantes",    label: "Integrantes",    icon: Users     },
    ...(isSuperadmin ? [{ id: "distribuidoras", label: "Distribuidoras", icon: Building2 }] : []),
  ];

  const [tab, setTab] = useState("usuarios");

  useEffect(() => {
    if (user && user.rol === "supervisor") {
      router.replace("/dashboard");
    }
  }, [user, router]);

  if (user?.rol === "supervisor") return null;
  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <BottomNav />
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar title="Administración" />
        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 overflow-auto">

          {/* Tabs */}
          <div className="flex gap-1 bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] rounded-xl p-1 mb-6 w-fit">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setTab(id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all
                  ${tab === id
                    ? "bg-[var(--shelfy-primary)] text-white shadow-sm"
                    : "text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"
                  }`}>
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>

          {tab === "usuarios" && (
            <TabUsuarios isSuperadmin={isSuperadmin} distId={user.id_distribuidor} />
          )}
          {tab === "distribuidoras" && isSuperadmin && (
            <TabDistribuidoras />
          )}
          {tab === "integrantes" && (
            <TabIntegrantes isSuperadmin={isSuperadmin} distId={user.id_distribuidor} />
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
