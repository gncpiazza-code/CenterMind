"use client";

import { useEffect, useState } from "react";
import { Building2, ToggleRight, ToggleLeft } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageSpinner } from "@/components/ui/Spinner";
import { fetchDistribuidoras, crearDistribuidora, toggleDistribuidora, type Distribuidora } from "@/lib/api";

const INPUT_CLS = "rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--shelfy-primary)]";

export default function TabDistribuidoras() {
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
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-400">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <p className="text-[var(--shelfy-muted)] text-sm">{distribuidoras.length} distribuidoras registradas</p>
          <label className="flex items-center gap-2 text-xs text-[var(--shelfy-muted)] cursor-pointer select-none group">
            <div className={`relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${soloActivas ? "bg-[var(--shelfy-primary)]" : "bg-slate-300"}`}>
              <input type="checkbox" checked={soloActivas} onChange={(e) => setSoloActivas(e.target.checked)} className="sr-only" />
              <span className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${soloActivas ? "translate-x-4" : "translate-x-0"}`} />
            </div>
            <span>Solo activas</span>
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
        <Card className="border-t-4 border-t-[var(--shelfy-primary)] shadow-lg animate-in slide-in-from-top-2 duration-300">
          <h3 className="text-[var(--shelfy-text)] font-semibold mb-4 flex items-center gap-2">
            <Building2 size={16} className="text-[var(--shelfy-primary)]" />
            Configurar nueva distribuidora
          </h3>
          <form onSubmit={handleCrear} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase font-bold text-[var(--shelfy-muted)] ml-1">Nombre de la Empresa</label>
              <input required placeholder="Ej: Distribuidora Norte SA" value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                className={INPUT_CLS + " w-full"} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase font-bold text-[var(--shelfy-muted)] ml-1">Token de Bot Telegram</label>
              <input required placeholder="1234567890:ABC..." value={form.token}
                onChange={(e) => setForm((f) => ({ ...f, token: e.target.value }))}
                className={INPUT_CLS + " w-full"} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase font-bold text-[var(--shelfy-muted)] ml-1">ID Carpeta Google Drive</label>
              <input placeholder="ID de la carpeta para fotos" value={form.carpeta_drive}
                onChange={(e) => setForm((f) => ({ ...f, carpeta_drive: e.target.value }))}
                className={INPUT_CLS + " w-full"} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase font-bold text-[var(--shelfy-muted)] ml-1">Ruta Credencial JSON</label>
              <input placeholder="C:/ruta/a/credencial.json" value={form.ruta_cred}
                onChange={(e) => setForm((f) => ({ ...f, ruta_cred: e.target.value }))}
                className={INPUT_CLS + " w-full"} />
            </div>
            <div className="md:col-span-2 flex gap-2 mt-2">
              <Button type="submit" loading={saving} size="sm">Registrar Distribuidora</Button>
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
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px] w-12">ID</th>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Nombre / Empresa</th>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Estado</th>
                  <th className="py-3 px-4 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--shelfy-border)]">
                {distribuidoras.map((d) => (
                  <tr key={d.id} className="hover:bg-[var(--shelfy-panel)]/30 transition-colors">
                    <td className="py-4 px-4 text-[var(--shelfy-muted)] tabular-nums font-mono text-xs">{d.id}</td>
                    <td className="py-4 px-4 text-[var(--shelfy-text)] font-semibold">{d.nombre}</td>
                    <td className="py-4 px-4">
                      <span className={`text-[10px] px-2.5 py-1 rounded-full font-black uppercase tracking-wider ${d.estado === "activo" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                        {d.estado}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <button
                        onClick={() => handleToggle(d.id, d.estado)}
                        title={d.estado === "activo" ? "Desactivar" : "Activar"}
                        className="text-[var(--shelfy-muted)] hover:text-[var(--shelfy-primary)] transition-all p-1.5 rounded-lg hover:bg-[var(--shelfy-primary)]/10"
                      >
                        {d.estado === "activo"
                          ? <ToggleRight size={22} className="text-green-500" />
                          : <ToggleLeft size={22} />}
                      </button>
                    </td>
                  </tr>
                ))}
                {distribuidoras.length === 0 && (
                  <tr><td colSpan={4} className="py-20 text-center text-[var(--shelfy-muted)] italic">No hay distribuidoras registradas</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
