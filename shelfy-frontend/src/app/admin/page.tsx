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
  fetchUsuarios, crearUsuario, editarUsuario, eliminarUsuario, type UsuarioPortal,
  fetchDistribuidoras, crearDistribuidora, toggleDistribuidora, type Distribuidora,
  fetchIntegrantes, setRolIntegrante, editarIntegranteAdmin, type Integrante,
  fetchLocations, crearLocation, editarLocation, type Location,
  uploadERPFile, fetchERPMappings, saveERPMapping, deleteERPMapping,
  fetchUnknownCompanies, mapUnknownCompany
} from "@/lib/api";
import { ChevronLeft, ChevronRight, Lock, Unlock, Plus, Trash2, Edit2, Shield, Search, RefreshCw, Building2, MapPin, Users, Copy, UserPlus, ToggleRight, ToggleLeft, FileSpreadsheet, UploadCloud, AlertTriangle, Network, Check } from "lucide-react";

import dynamic from "next/dynamic";
const TabSucursales = dynamic(() => import("./TabSucursales"), { ssr: false });
const InteractiveHierarchy = dynamic(() => import("./InteractiveHierarchy"), { ssr: false });


const ROL_LABEL: Record<string, string> = {
  superadmin: "Super Admin",
  admin: "Admin",
  supervisor: "Supervisor",
};

// Roles del grupo de Telegram (distintos a los roles del portal)
const ROLES_TELEGRAM = ["vendedor", "observador"];
const ROL_TELEGRAM_LABEL: Record<string, string> = {
  vendedor: "Vendedor",
  observador: "Observador"
};

const INPUT_CLS = "rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--shelfy-primary)]";

// ── Tab: Usuarios ─────────────────────────────────────────────────────────────

function TabUsuarios({ isSuperadmin, distId }: { isSuperadmin: boolean; distId: number }) {
  const [usuarios, setUsuarios] = useState<UsuarioPortal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ login: "", password: "", rol: "supervisor", dist_id: distId });
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // States para edición inline de usuario portal
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [editUserForm, setEditUserForm] = useState({ login: "", password: "", rol: "supervisor" });
  const [changingUserId, setChangingUserId] = useState<number | null>(null);

  const rolesDisponibles = isSuperadmin ? ["supervisor", "admin", "superadmin"] : ["supervisor", "admin"];

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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-[var(--shelfy-muted)] text-sm">{usuarios.length} usuarios</p>
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
                {usuarios.filter(u =>
                  u.usuario_login.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  (u.nombre_empresa && u.nombre_empresa.toLowerCase().includes(searchQuery.toLowerCase())) ||
                  u.rol.toLowerCase().includes(searchQuery.toLowerCase())
                ).map((u) => (
                  <tr key={u.id_usuario} className="border-b border-[var(--shelfy-border)] last:border-0 hover:bg-[var(--shelfy-bg)] transition-colors">
                    {editingUserId === u.id_usuario ? (
                      <>
                        <td className="py-2 pr-4">
                          <input
                            value={editUserForm.login}
                            onChange={e => setEditUserForm(f => ({ ...f, login: e.target.value }))}
                            className={INPUT_CLS + " !py-1 w-full"}
                            placeholder="Usuario"
                          />
                          <input
                            value={editUserForm.password}
                            onChange={e => setEditUserForm(f => ({ ...f, password: e.target.value }))}
                            className={INPUT_CLS + " !py-1 mt-1 w-full"}
                            placeholder="Nueva contraseña (opcional)"
                            type="password"
                          />
                        </td>
                        <td className="py-2 pr-4">
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
                        <td className="py-2 pr-4 text-[var(--shelfy-muted)]">{u.nombre_empresa}</td>
                        <td className="py-2 flex gap-1 items-center justify-end h-full">
                          <Button size="sm" loading={changingUserId === u.id_usuario} onClick={() => handleGuardarEdicion(u.id_usuario)}>OK</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingUserId(null)}>X</Button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-3 pr-4 text-[var(--shelfy-text)] font-medium">
                          {u.usuario_login}
                        </td>
                        <td className="py-3 pr-4"><RolBadge rol={u.rol} /></td>
                        <td className="py-3 pr-4 text-[var(--shelfy-muted)]">{u.nombre_empresa}</td>
                        <td className="py-3 flex gap-2 justify-end">
                          {(isSuperadmin || u.rol === "supervisor" || u.rol === "admin") && (
                            <>
                              <button onClick={() => {
                                setEditingUserId(u.id_usuario);
                                setEditUserForm({ login: u.usuario_login, password: "", rol: u.rol });
                              }}
                                className="text-[var(--shelfy-muted)] hover:text-[var(--shelfy-primary)] transition-colors p-1 rounded hover:bg-slate-50">
                                <Edit2 size={14} />
                              </button>
                              <button onClick={() => handleEliminar(u.id_usuario)}
                                className="text-[var(--shelfy-muted)] hover:text-[var(--shelfy-error)] transition-colors p-1 rounded hover:bg-red-50">
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </td>
                      </>
                    )}
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
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [changingId, setChangingId] = useState<number | null>(null);

  // Edición Inline
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([
      fetchIntegrantes(isSuperadmin ? undefined : distId),
      fetchLocations(isSuperadmin ? 0 : distId)
    ])
      .then(([ints, locs]) => {
        setIntegrantes(ints);
        setLocations(locs);
      })
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

  async function handleGuardarNombre(ig: Integrante) {
    if (!editName.trim() || editName === ig.nombre_integrante) {
      setEditingId(null);
      return;
    }
    setChangingId(ig.id_integrante);
    setError(null);
    try {
      await editarIntegranteAdmin(ig.id_integrante, { nombre_integrante: editName.trim() });
      setEditingId(null);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al editar nombre");
    } finally {
      setChangingId(null);
    }
  }

  async function handleAsignarSucursal(id: number, locationIdStr: string) {
    setChangingId(id);
    setError(null);
    const location_id = locationIdStr ? parseInt(locationIdStr, 10) : null;
    try {
      await editarIntegranteAdmin(id, { nombre_integrante: integrantes.find(i => i.id_integrante === id)!.nombre_integrante, location_id });
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al asignar sucursal");
    } finally {
      setChangingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-[var(--shelfy-muted)] text-sm">{integrantes.length} integrantes de Telegram</p>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--shelfy-muted)]" size={14} />
            <input
              type="text"
              placeholder="Buscar integrante..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-3 py-1.5 text-sm focus:outline-none focus:border-[var(--shelfy-primary)] w-[200px]"
            />
          </div>
          <button onClick={load} className="p-2 text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] border border-[var(--shelfy-border)] rounded-lg bg-[var(--shelfy-panel)] transition-colors">
            <RefreshCw size={13} />
          </button>
        </div>
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
                  <th className="pb-3 pr-4">Nombre / Alias</th>
                  {isSuperadmin && <th className="pb-3 pr-4">Distribuidora</th>}
                  <th className="pb-3 pr-4">Sucursal</th>
                  <th className="pb-3 pr-4">ID ERP (Vendedor)</th>
                  <th className="pb-3 pr-4">Grupo Tel.</th>
                  <th className="pb-3 pr-4">Rol en App</th>
                  <th className="pb-3 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {integrantes.filter(ig => {
                  const q = searchQuery.toLowerCase();
                  return (ig.nombre_integrante || "").toLowerCase().includes(q) ||
                    (ig.nombre_empresa || "").toLowerCase().includes(q) ||
                    (ig.sucursal_label || "").toLowerCase().includes(q) ||
                    (ig.id_vendedor_erp || "").toLowerCase().includes(q) ||
                    (ig.nombre_grupo || "").toLowerCase().includes(q) ||
                    (ig.rol_telegram || "").toLowerCase().includes(q);
                }).map((ig) => (
                  <tr key={ig.id_integrante} className="border-b border-[var(--shelfy-border)] last:border-0 hover:bg-[var(--shelfy-bg)] transition-colors">

                    <td className="py-3 pr-4">
                      {editingId === ig.id_integrante ? (
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleGuardarNombre(ig);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            className={INPUT_CLS + " max-w-[150px] !py-1"}
                          />
                          <Button size="sm" loading={changingId === ig.id_integrante} onClick={() => handleGuardarNombre(ig)}>OK</Button>
                        </div>
                      ) : (
                        <div className="text-[var(--shelfy-text)] font-medium flex items-center gap-2">
                          {ig.nombre_integrante}
                          {isSuperadmin && (
                            <button onClick={() => { setEditingId(ig.id_integrante); setEditName(ig.nombre_integrante); }} className="text-[var(--shelfy-muted)] hover:text-[var(--shelfy-primary)]">
                              <Edit2 size={12} />
                            </button>
                          )}
                        </div>
                      )}
                    </td>

                    {isSuperadmin && <td className="py-3 pr-4 text-[var(--shelfy-muted)] text-xs">{ig.nombre_empresa}</td>}

                    <td className="py-3 pr-4">
                      <select
                        value={ig.sucursal_label ? locations.find(l => l.label === ig.sucursal_label)?.location_id || "" : ""}
                        disabled={changingId === ig.id_integrante}
                        onChange={(e) => handleAsignarSucursal(ig.id_integrante, e.target.value)}
                        className="rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-2 py-1 text-xs focus:outline-none focus:border-[var(--shelfy-primary)] max-w-[140px]"
                      >
                        <option value="">-- Sin sucursal --</option>
                        {locations.map((loc) => (
                          <option key={loc.location_id} value={loc.location_id}>{loc.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-600 w-fit">
                        {ig.id_vendedor_erp || "—"}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-[var(--shelfy-muted)] text-xs">{ig.nombre_grupo || ig.telegram_group_id || "—"}</td>

                    <td className="py-3 pr-4">
                      <select
                        value={ig.rol_telegram ?? "supervisor"}
                        disabled={changingId === ig.id_integrante || (!isSuperadmin && ig.rol_telegram === 'superadmin')}
                        onChange={(e) => handleCambiarRol(ig.id_integrante, e.target.value, ig.telegram_group_id)}
                        className="rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-2 py-1 text-xs focus:outline-none focus:border-[var(--shelfy-primary)]"
                      >
                        {ROLES_TELEGRAM.map((r) => (
                          <option key={r} value={r}>{ROL_TELEGRAM_LABEL[r] ?? r}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3"></td>
                  </tr>
                ))}
                {integrantes.length === 0 && (
                  <tr>
                    <td colSpan={isSuperadmin ? 6 : 5} className="py-8 text-center text-[var(--shelfy-muted)]">
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

// ── Tab: ERP ──────────────────────────────────────────────────────────────────

function TabERP({ distId, isSuperadmin }: { distId: number, isSuperadmin: boolean }) {
  const [fileVentas, setFileVentas] = useState<File | null>(null);
  const [fileClientes, setFileClientes] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const [mappings, setMappings] = useState<any[]>([]);
  const [showMapForm, setShowMapForm] = useState(false);
  const [mapForm, setMapForm] = useState({ nombre_erp: "", id_distribuidor: distId });

  const [unknownCompanies, setUnknownCompanies] = useState<any[]>([]);
  const [loadingUnknown, setLoadingUnknown] = useState(false);

  useEffect(() => {
    loadMappings();
    if (isSuperadmin) loadUnknown();
  }, [isSuperadmin]);

  async function loadUnknown() {
    setLoadingUnknown(true);
    try {
      const data = await fetchUnknownCompanies();
      setUnknownCompanies(data);
    } catch (e) { console.error(e); }
    finally { setLoadingUnknown(false); }
  }

  async function handleMapUnknown(nombre_erp: string, id_dist: number) {
    if (!id_dist) return;
    setLoading(true);
    try {
      await mapUnknownCompany({ nombre_erp, id_distribuidor: id_dist });
      setResult({ msg: `✅ Empresa ${nombre_erp} mapeada correctamente`, type: "ok" });
      loadMappings();
      loadUnknown();
    } catch (e: any) {
      setResult({ msg: `❌ Error: ${e.message}`, type: "err" });
    } finally {
      setLoading(false);
    }
  }

  async function loadMappings() {
    try {
      const data = await fetchERPMappings();
      setMappings(data);
    } catch (e) { console.error(e); }
  }

  async function handleSaveMapping(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await saveERPMapping(mapForm);
      setShowMapForm(false);
      setMapForm({ nombre_erp: "", id_distribuidor: distId });
      loadMappings();
    } catch (e: any) {
      setResult({ msg: `❌ Error: ${e.message}`, type: "err" });
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteMapping(nombre: string) {
    if (!confirm("¿Eliminar este mapeo?")) return;
    try {
      await deleteERPMapping(nombre);
      loadMappings();
    } catch (e: any) {
      setResult({ msg: `❌ Error: ${e.message}`, type: "err" });
    }
  }

  async function handleUpload(tipo: "ventas" | "clientes") {
    const file = tipo === "ventas" ? fileVentas : fileClientes;
    if (!file) return;

    setLoading(true);
    setResult(null);
    try {
      const res = await uploadERPFile(tipo, file);
      setResult({ msg: `✅ ${res.message} (${res.count} registros)`, type: "ok" });
      if (tipo === "ventas") setFileVentas(null);
      else setFileClientes(null);
    } catch (e: any) {
      setResult({ msg: `❌ Error: ${e.message}`, type: "err" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <Card>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
            <FileSpreadsheet size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Importación Manual ERP</h1>
            <p className="text-sm text-slate-500">Sube los archivos globales para actualizar la base de datos.</p>
          </div>
        </div>

        {result && (
          <div className={`mb-6 p-4 rounded-xl text-sm font-medium border ${result.type === "ok" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"
            }`}>
            {result.msg}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Ventas */}
          <div className="p-6 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 flex flex-col items-center text-center gap-4">
            <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400">
              <UploadCloud size={24} />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm">Informe de Ventas</p>
              <p className="text-xs text-slate-500">Excel (.xlsx)</p>
            </div>
            <input
              type="file"
              accept=".xlsx"
              onChange={e => setFileVentas(e.target.files?.[0] || null)}
              className="text-xs w-full file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
            />
            <Button
              size="sm"
              disabled={!fileVentas || loading}
              loading={loading && !!fileVentas}
              onClick={() => handleUpload("ventas")}
              className="w-full mt-2"
            >
              Procesar Ventas
            </Button>
          </div>

          {/* Clientes */}
          <div className="p-6 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 flex flex-col items-center text-center gap-4">
            <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400">
              <UploadCloud size={24} />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm">Padrón de Clientes</p>
              <p className="text-xs text-slate-500">Excel (.xlsx)</p>
            </div>
            <input
              type="file"
              accept=".xlsx"
              onChange={e => setFileClientes(e.target.files?.[0] || null)}
              className="text-xs w-full file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
            />
            <Button
              size="sm"
              disabled={!fileClientes || loading}
              loading={loading && !!fileClientes}
              onClick={() => handleUpload("clientes")}
              className="w-full mt-2"
            >
              Procesar Clientes
            </Button>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-[var(--shelfy-border)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Building2 size={16} className="text-blue-500" /> Mapeo de Empresas
            </h3>
            <Button size="sm" onClick={() => setShowMapForm(!showMapForm)}>
              <Plus size={14} /> Nuevo Mapeo
            </Button>
          </div>

          {showMapForm && (
            <Card className="mb-4 bg-slate-50/50">
              <form onSubmit={handleSaveMapping} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Nombre en Excel (dsempresa)</label>
                  <input required placeholder="Ej: REAL DISTRIBUCION - T&H" value={mapForm.nombre_erp}
                    onChange={(e) => setMapForm(f => ({ ...f, nombre_erp: e.target.value }))}
                    className={INPUT_CLS + " w-full"} />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">ID Distribuidora Shelfy</label>
                  <input required type="number" value={mapForm.id_distribuidor}
                    onChange={(e) => setMapForm(f => ({ ...f, id_distribuidor: Number(e.target.value) }))}
                    className={INPUT_CLS + " w-full"} />
                </div>
                <div className="lg:pt-5">
                  <Button type="submit" size="sm" loading={loading} className="w-full">Guardar Mapeo</Button>
                </div>
              </form>
            </Card>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-[var(--shelfy-border)]">
                  <th className="py-2 text-left">Nombre ERP (Excel)</th>
                  <th className="py-2 text-left">Distribuidora Shelfy</th>
                  <th className="py-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((m, i) => (
                  <tr key={i} className="border-b border-[var(--shelfy-border)] last:border-0">
                    <td className="py-2 font-medium">{m.nombre_erp}</td>
                    <td className="py-2">
                      <span className="text-blue-600 font-bold">#{m.id_distribuidor}</span>
                      <span className="ml-2 text-slate-400">({m.distribuidores?.nombre_empresa})</span>
                    </td>
                    <td className="py-2">
                      <button onClick={() => handleDeleteMapping(m.nombre_erp)} className="text-slate-300 hover:text-red-500 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {mappings.length === 0 && (
                  <tr><td colSpan={3} className="py-4 text-center text-slate-400 italic">No hay mapeos configurados</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-8 p-4 bg-amber-50 rounded-xl border border-amber-200 flex gap-3">
          <AlertTriangle className="text-amber-600 shrink-0" size={18} />
          <div className="text-[11px] text-amber-800 leading-relaxed font-medium">
            <strong>IMPORTANTE:</strong> El "Nombre en Excel" debe coincidir EXACTAMENTE con el texto de la columna <strong>dsempresa</strong>.
            Si un archivo contiene datos de múltiples empresas, solo se procesarán aquellas que tengan un mapeo configurado aquí.
          </div>
        </div>
      </Card>

      {isSuperadmin && (
        <Card className="mt-6 border-red-100 bg-red-50/10">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-red-600">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Anomalías de Ingesta (God Mode)</h2>
                <p className="text-sm text-slate-500">Empresas desconocidas detectadas durante el ETL.</p>
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={loadUnknown} disabled={loadingUnknown}>
              <RefreshCw size={14} className={loadingUnknown ? "animate-spin" : ""} />
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-red-100">
                  <th className="py-2 text-left">Empresa Detectada (ERP)</th>
                  <th className="py-2 text-left">Fecha Detección</th>
                  <th className="py-2 text-left">Asignar a ID Distribuidor</th>
                  <th className="py-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {unknownCompanies.map((u, i) => (
                  <tr key={i} className="border-b border-red-50 last:border-0 hover:bg-white/50 transition-colors">
                    <td className="py-3 font-bold text-red-700">{u.nombre_erp}</td>
                    <td className="py-3 text-slate-500">{new Date(u.fecha).toLocaleString()}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          placeholder="ID"
                          className={INPUT_CLS + " w-20 !py-1"}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleMapUnknown(u.nombre_erp, Number((e.target as HTMLInputElement).value));
                            }
                          }}
                        />
                        <span className="text-[10px] text-slate-400 italic font-medium">Press Enter to Map</span>
                      </div>
                    </td>
                    <td className="py-3"></td>
                  </tr>
                ))}
                {unknownCompanies.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-slate-400">
                      <div className="flex flex-col items-center gap-2 opacity-50">
                        <Check className="text-green-500" size={32} />
                        <span className="font-bold">No hay anomalías pendientes</span>
                      </div>
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
    { id: "usuarios", label: "Usuarios", icon: Shield },
    { id: "hierarchy", label: "Jerarquía", icon: Network },
    { id: "integrantes", label: "Integrantes", icon: Users },
    { id: "sucursales", label: "Sucursales", icon: MapPin },
    { id: "erp", label: "ERP", icon: FileSpreadsheet },
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
            <TabUsuarios isSuperadmin={isSuperadmin} distId={user?.id_distribuidor || 0} />
          )}
          {tab === "distribuidoras" && isSuperadmin && (
            <TabDistribuidoras />
          )}
          {tab === "hierarchy" && (
            <InteractiveHierarchy distId={user?.id_distribuidor || 0} />
          )}
          {tab === "integrantes" && (
            <TabIntegrantes isSuperadmin={isSuperadmin} distId={user?.id_distribuidor || 0} />
          )}
          {tab === "sucursales" && (
            <TabSucursales isSuperadmin={isSuperadmin} distId={user?.id_distribuidor || 0} role={user?.rol || ""} />
          )}
          {tab === "erp" && (
            <TabERP distId={user?.id_distribuidor || 0} isSuperadmin={isSuperadmin} />
          )}

        </main>
      </div>
    </div>
  );
}

function RolBadge({ rol }: { rol: string }) {
  const colors: Record<string, string> = {
    superadmin: "bg-purple-100 text-purple-700",
    admin: "bg-blue-100 text-blue-700",
    supervisor: "bg-green-100 text-green-700",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[rol] ?? "bg-gray-100 text-gray-700"}`}>
      {ROL_LABEL[rol] ?? rol}
    </span>
  );
}
