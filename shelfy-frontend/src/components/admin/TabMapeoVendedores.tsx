"use client";

import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Users,
  Link2,
  Link2Off,
  Loader2,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  fetchMapeoData,
  setMapeoVendedor,
  type IntegranteMapeo,
  type VendedorMapeo,
  type MapeoData,
} from "@/lib/api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROL_LABEL: Record<string, string> = {
  vendedor:   "Vendedor",
  observador: "Observador",
};

function nombreSucursal(v: VendedorMapeo): string {
  return v.sucursales?.nombre_erp ?? `Sucursal #${v.id_sucursal}`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface TabMapeoVendedoresProps {
  distId: number;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function TabMapeoVendedores({ distId }: TabMapeoVendedoresProps) {
  const [data, setData]         = useState<MapeoData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState<number | null>(null); // id_integrante en proceso
  const [flash, setFlash]       = useState<{ id: number; ok: boolean } | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [search, setSearch]     = useState("");

  // vendedores agrupados por sucursal para el dropdown
  const sucursales = data
    ? [...new Map(
        data.vendedores.map(v => [v.id_sucursal, nombreSucursal(v)])
      ).entries()]
        .sort((a, b) => a[1].localeCompare(b[1]))
    : [];

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await fetchMapeoData(distId);
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error cargando datos");
    } finally {
      setLoading(false);
    }
  }, [distId]);

  useEffect(() => { load(); }, [load]);

  // ── Guardar mapeo ─────────────────────────────────────────────────────────

  async function handleMap(ig: IntegranteMapeo, idVendedor: number | null) {
    setSaving(ig.id_integrante);
    setFlash(null);
    try {
      await setMapeoVendedor(ig.id_integrante, idVendedor);
      setFlash({ id: ig.id_integrante, ok: true });
      // Actualizar local sin refetch completo
      setData(prev => prev ? {
        ...prev,
        integrantes: prev.integrantes.map(i =>
          i.id_integrante === ig.id_integrante ? { ...i, id_vendedor: idVendedor } : i
        ),
        stats: {
          ...prev.stats,
          mapeados: prev.integrantes.filter(i =>
            i.id_integrante === ig.id_integrante ? idVendedor !== null : i.id_vendedor !== null
          ).length,
          sin_mapear: prev.integrantes.filter(i =>
            i.id_integrante === ig.id_integrante ? idVendedor === null : i.id_vendedor === null
          ).length,
        },
      } : prev);
      setTimeout(() => setFlash(null), 2000);
    } catch (e) {
      setFlash({ id: ig.id_integrante, ok: false });
      setTimeout(() => setFlash(null), 3000);
    } finally {
      setSaving(null);
    }
  }

  // ── Filtro de búsqueda ────────────────────────────────────────────────────

  const integrantes = (data?.integrantes ?? []).filter(ig => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      ig.nombre_integrante?.toLowerCase().includes(q) ||
      (data?.vendedores.find(v => v.id_vendedor === ig.id_vendedor)?.nombre_erp ?? "")
        .toLowerCase().includes(q)
    );
  });

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-3 text-[var(--shelfy-muted)]">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Cargando integrantes...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Stats + header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-3">
          {[
            { label: "Total",       value: data?.stats.total      ?? 0, color: "text-[var(--shelfy-text)]" },
            { label: "Mapeados",    value: data?.stats.mapeados   ?? 0, color: "text-green-400" },
            { label: "Sin mapear",  value: data?.stats.sin_mapear ?? 0, color: data?.stats.sin_mapear ? "text-yellow-400" : "text-[var(--shelfy-muted)]" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] px-4 py-2 text-center min-w-[72px]">
              <p className={`text-xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-[var(--shelfy-muted)]">{label}</p>
            </div>
          ))}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] transition-colors"
          title="Actualizar"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 rounded-lg px-4 py-2 border border-red-500/20">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Búsqueda */}
      <input
        type="text"
        placeholder="Buscar integrante o vendedor..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full max-w-sm rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--shelfy-primary)]"
      />

      {/* Tabla de mapeo */}
      <Card>
        {integrantes.length === 0 ? (
          <p className="text-[var(--shelfy-muted)] text-sm py-6 text-center">
            {search ? "Sin resultados para esta búsqueda." : "No hay integrantes para mapear."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--shelfy-border)] text-[var(--shelfy-muted)] text-xs uppercase tracking-wide">
                  <th className="text-left py-2 pr-4 font-medium">Integrante</th>
                  <th className="text-left py-2 pr-4 font-medium hidden sm:table-cell">Rol</th>
                  <th className="text-left py-2 font-medium">Vendedor ERP asignado</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {integrantes.map(ig => {
                  const vendedorActual = data?.vendedores.find(v => v.id_vendedor === ig.id_vendedor);
                  const isSaving = saving === ig.id_integrante;
                  const isFlash  = flash?.id === ig.id_integrante;

                  return (
                    <tr
                      key={ig.id_integrante}
                      className={`border-b border-[var(--shelfy-border)] last:border-0 transition-colors ${
                        isFlash ? (flash?.ok ? "bg-green-500/5" : "bg-red-500/5") : ""
                      }`}
                    >
                      {/* Nombre integrante */}
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${ig.id_vendedor ? "bg-green-400" : "bg-yellow-400"}`} />
                          <span className="text-[var(--shelfy-text)] font-medium truncate max-w-[160px]">
                            {ig.nombre_integrante || <span className="text-[var(--shelfy-muted)] italic">Sin nombre</span>}
                          </span>
                        </div>
                      </td>

                      {/* Rol */}
                      <td className="py-3 pr-4 hidden sm:table-cell">
                        <span className="text-xs text-[var(--shelfy-muted)]">
                          {ROL_LABEL[ig.rol_telegram] ?? ig.rol_telegram}
                        </span>
                      </td>

                      {/* Dropdown vendedor */}
                      <td className="py-3">
                        <select
                          disabled={isSaving}
                          value={ig.id_vendedor ?? ""}
                          onChange={e => {
                            const val = e.target.value;
                            handleMap(ig, val === "" ? null : Number(val));
                          }}
                          className="rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-2 py-1.5 text-xs focus:outline-none focus:border-[var(--shelfy-primary)] max-w-[260px] w-full disabled:opacity-50"
                        >
                          <option value="">— sin asignar —</option>
                          {sucursales.map(([sucId, sucNombre]) => (
                            <optgroup key={sucId} label={sucNombre}>
                              {(data?.vendedores ?? [])
                                .filter(v => v.id_sucursal === sucId)
                                .map(v => (
                                  <option key={v.id_vendedor} value={v.id_vendedor}>
                                    {v.nombre_erp}
                                  </option>
                                ))}
                            </optgroup>
                          ))}
                        </select>
                      </td>

                      {/* Indicador de estado */}
                      <td className="py-3 pl-2 w-8">
                        {isSaving ? (
                          <Loader2 className="w-4 h-4 text-[var(--shelfy-muted)] animate-spin" />
                        ) : isFlash ? (
                          flash?.ok
                            ? <CheckCircle2 className="w-4 h-4 text-green-400" />
                            : <AlertCircle  className="w-4 h-4 text-red-400"   />
                        ) : ig.id_vendedor ? (
                          <Link2    className="w-3.5 h-3.5 text-green-400 opacity-60" />
                        ) : (
                          <Link2Off className="w-3.5 h-3.5 text-yellow-400 opacity-60" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Info limbo */}
      <p className="text-xs text-[var(--shelfy-muted)] leading-relaxed">
        <span className="text-yellow-400">●</span>{" "}
        Los vendedores sin mapear pueden seguir subiendo exhibiciones — si aparece un cliente nuevo entre
        actualizaciones del padrón, el sistema lo registra como <em>limbo</em> y lo adopta
        automáticamente la próxima vez que se suba el padrón.
      </p>
    </div>
  );
}
