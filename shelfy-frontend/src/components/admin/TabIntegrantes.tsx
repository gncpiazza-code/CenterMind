"use client";

import { useEffect, useState } from "react";
import { Search, RefreshCw, Edit2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageSpinner } from "@/components/ui/Spinner";
import { fetchIntegrantes, setRolIntegrante, editarIntegranteAdmin, type Integrante } from "@/lib/api";

const ROLES_TELEGRAM = ["vendedor", "observador"];
const ROL_TELEGRAM_LABEL: Record<string, string> = {
  vendedor: "Vendedor",
  observador: "Observador"
};

const INPUT_CLS = "rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--shelfy-primary)]";

interface TabIntegrantesProps {
  isSuperadmin: boolean;
  distId: number;
}

export default function TabIntegrantes({ isSuperadmin, distId }: TabIntegrantesProps) {
  const [integrantes, setIntegrantes] = useState<Integrante[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [changingId, setChangingId] = useState<number | null>(null);

  // Edición Inline
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const load = () => {
    setLoading(true);
    fetchIntegrantes(isSuperadmin ? undefined : distId)
      .then((ints) => {
        setIntegrantes(ints);
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

  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-400">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-[var(--shelfy-muted)] text-sm">{integrantes.length} integrantes vinculados al bot</p>
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
          <button onClick={load} className="p-2 text-[var(--shelfy-muted)] hover:text-[var(--shelfy-primary)] border border-[var(--shelfy-border)] rounded-lg bg-[var(--shelfy-panel)] transition-all hover:bg-[var(--shelfy-panel)]/50">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-20 flex justify-center"><PageSpinner /></div>
      ) : (
        <Card className="overflow-hidden p-0 border-[var(--shelfy-border)]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--shelfy-panel)]/50 text-[var(--shelfy-muted)] text-left border-b border-[var(--shelfy-border)]">
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Nombre / Alias Telegram</th>
                  {isSuperadmin && <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Distribuidora</th>}
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Grupo / Sucursal</th>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Rol Asignado</th>
                  <th className="py-3 px-4 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--shelfy-border)]">
                {integrantes.filter(ig => {
                  const q = searchQuery.toLowerCase();
                  return (ig.nombre_integrante || "").toLowerCase().includes(q) ||
                    (ig.nombre_empresa || "").toLowerCase().includes(q) ||
                    (ig.nombre_grupo || "").toLowerCase().includes(q) ||
                    (ig.rol_telegram || "").toLowerCase().includes(q);
                }).map((ig) => (
                  <tr key={ig.id_integrante} className="hover:bg-[var(--shelfy-panel)]/30 transition-colors">
                    <td className="py-4 px-4">
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
                        <div className="text-[var(--shelfy-text)] font-semibold flex items-center gap-2">
                          {ig.nombre_integrante}
                          {isSuperadmin && (
                            <button onClick={() => { setEditingId(ig.id_integrante); setEditName(ig.nombre_integrante || ""); }} 
                              className="text-[var(--shelfy-muted)] hover:text-[var(--shelfy-primary)] transition-colors p-1 rounded-md hover:bg-[var(--shelfy-primary)]/10">
                              <Edit2 size={12} />
                            </button>
                          )}
                        </div>
                      )}
                    </td>

                    {isSuperadmin && <td className="py-4 px-4 text-[var(--shelfy-muted)] text-xs font-medium">{ig.nombre_empresa}</td>}

                    <td className="py-4 px-4 text-[var(--shelfy-muted)] text-xs italic">{ig.nombre_grupo || ig.telegram_group_id || "—"}</td>

                    <td className="py-4 px-4">
                      <select
                        value={ig.rol_telegram ?? "supervisor"}
                        disabled={changingId === ig.id_integrante || (!isSuperadmin && ig.rol_telegram === 'superadmin')}
                        onChange={(e) => handleCambiarRol(ig.id_integrante, e.target.value, Number(ig.telegram_group_id))}
                        className="rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-2 py-1 text-xs font-bold focus:outline-none focus:border-[var(--shelfy-primary)] appearance-none cursor-pointer hover:border-[var(--shelfy-primary)] transition-colors"
                      >
                        {ROLES_TELEGRAM.map((r) => (
                          <option key={r} value={r}>{ROL_TELEGRAM_LABEL[r] ?? r}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-4 px-4"></td>
                  </tr>
                ))}
                {integrantes.length === 0 && (
                  <tr>
                    <td colSpan={isSuperadmin ? 5 : 4} className="py-20 text-center text-[var(--shelfy-muted)] italic">
                      No se encontraron integrantes
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
