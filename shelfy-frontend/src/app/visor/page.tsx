"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { PageSpinner } from "@/components/ui/Spinner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  fetchPendientes, fetchStatsHoy, fetchVendedores,
  evaluar, revertir,
  extractDriveId, getImageUrl,
  type GrupoPendiente, type StatsHoy,
} from "@/lib/api";
import { CheckCircle, XCircle, Star, RotateCcw, RefreshCw, ChevronLeft, ChevronRight, ImageOff } from "lucide-react";

// ── Componente foto ─────────────────────────────────────────────────────────

function FotoViewer({ driveUrl }: { driveUrl: string }) {
  const [err, setErr] = useState(false);
  const fileId = extractDriveId(driveUrl);
  const src = fileId ? getImageUrl(fileId) : null;

  if (!src || err) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[280px] text-[var(--shelfy-muted)] gap-2">
        <ImageOff size={40} className="opacity-40" />
        <span className="text-xs">Sin imagen disponible</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Exhibición"
      className="w-full h-full object-contain max-h-[420px] rounded-lg"
      onError={() => setErr(true)}
    />
  );
}

// ── Stats pills ─────────────────────────────────────────────────────────────

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)]">
      <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
      {label}: <strong>{value}</strong>
    </span>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────

export default function VisorPage() {
  const { user } = useAuth();
  const [grupos, setGrupos] = useState<GrupoPendiente[]>([]);
  const [stats, setStats] = useState<StatsHoy | null>(null);
  const [vendedores, setVendedores] = useState<string[]>([]);
  const [filtroVendedor, setFiltroVendedor] = useState("Todos");
  const [idx, setIdx] = useState(0);         // índice en la lista filtrada
  const [fotoIdx, setFotoIdx] = useState(0); // índice dentro del grupo (fotos múltiples)
  const [comentario, setComentario] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const lastEvalIds = useRef<number[]>([]);

  // Grupos filtrados por vendedor
  const filtrados = filtroVendedor === "Todos"
    ? grupos
    : grupos.filter((g) => g.vendedor === filtroVendedor);

  const grupo = filtrados[idx] ?? null;
  const totalGrupos = filtrados.length;

  const cargar = useCallback(async () => {
    if (!user) return;
    try {
      const [pend, st, vend] = await Promise.all([
        fetchPendientes(user.id_distribuidor),
        fetchStatsHoy(user.id_distribuidor),
        fetchVendedores(user.id_distribuidor),
      ]);
      setGrupos(pend);
      setStats(st);
      setVendedores(vend);
      setIdx(0);
      setFotoIdx(0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { cargar(); }, [cargar]);

  // Auto-refresh cada 30 segundos
  useEffect(() => {
    const t = setInterval(cargar, 30_000);
    return () => clearInterval(t);
  }, [cargar]);

  // Reset foto al cambiar de grupo
  useEffect(() => { setFotoIdx(0); setComentario(""); }, [idx, filtroVendedor]);

  function showFlash(msg: string, type: "ok" | "err") {
    setFlash({ msg, type });
    setTimeout(() => setFlash(null), 2500);
  }

  async function handleEvaluar(estado: "Aprobado" | "Destacado" | "Rechazado") {
    if (!grupo || !user || actionLoading) return;
    const ids = grupo.fotos.map((f) => f.id_exhibicion);
    setActionLoading(true);
    try {
      await evaluar(ids, estado, user.usuario, comentario);
      lastEvalIds.current = ids;
      // Actualiza stats optimistamente
      setStats((s) => s ? {
        ...s,
        pendientes: Math.max(0, s.pendientes - 1),
        aprobadas:  estado === "Aprobado"  ? s.aprobadas  + 1 : s.aprobadas,
        destacadas: estado === "Destacado" ? s.destacadas + 1 : s.destacadas,
        rechazadas: estado === "Rechazado" ? s.rechazadas + 1 : s.rechazadas,
      } : s);
      // Elimina el grupo de la lista local
      setGrupos((g) => g.filter((_, i) => {
        const fi = filtroVendedor === "Todos" ? i : grupos.indexOf(g[i]);
        return g[i] !== grupo;
      }));
      setIdx((i) => Math.max(0, Math.min(i, filtrados.length - 2)));
      showFlash(`${estado}`, "ok");
    } catch (e: unknown) {
      showFlash(e instanceof Error ? e.message : "Error", "err");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRevertir() {
    if (!lastEvalIds.current.length || actionLoading) return;
    setActionLoading(true);
    try {
      await revertir(lastEvalIds.current);
      lastEvalIds.current = [];
      showFlash("Revertido", "ok");
      cargar();
    } catch (e: unknown) {
      showFlash(e instanceof Error ? e.message : "Error", "err");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
        <Sidebar />
        <div className="flex flex-col flex-1">
          <Topbar title="Visor de exhibiciones" />
          <div className="flex-1 flex items-center justify-center"><PageSpinner /></div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar title="Visor de exhibiciones" />

        <main className="flex-1 p-4 md:p-6 overflow-auto">
          {/* ── Stats + controles ── */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            {stats && (
              <>
                <StatPill label="Pendientes" value={stats.pendientes} color="var(--shelfy-warning)" />
                <StatPill label="Aprobadas"  value={stats.aprobadas}  color="var(--shelfy-success)" />
                <StatPill label="Destacadas" value={stats.destacadas} color="var(--shelfy-primary)" />
                <StatPill label="Rechazadas" value={stats.rechazadas} color="var(--shelfy-error)"   />
              </>
            )}
            <div className="ml-auto flex gap-2 items-center">
              {/* Filtro vendedor */}
              <select
                value={filtroVendedor}
                onChange={(e) => { setFiltroVendedor(e.target.value); setIdx(0); }}
                className="rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] text-[var(--shelfy-text)] px-3 py-1.5 text-sm focus:outline-none focus:border-[var(--shelfy-primary)]"
              >
                <option value="Todos">Todos los vendedores</option>
                {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <Button variant="ghost" size="sm" onClick={cargar} title="Recargar">
                <RefreshCw size={14} />
              </Button>
            </div>
          </div>

          {/* ── Flash ── */}
          {flash && (
            <div className={`mb-4 px-4 py-2 rounded-lg text-sm font-medium
              ${flash.type === "ok" ? "bg-green-900/40 text-green-300 border border-green-700/40" : "bg-red-900/40 text-red-300 border border-red-700/40"}`}>
              {flash.msg}
            </div>
          )}

          {error && <p className="text-[var(--shelfy-error)] text-sm mb-4">{error}</p>}

          {/* ── Sin pendientes ── */}
          {totalGrupos === 0 ? (
            <Card className="text-center py-16">
              <p className="text-2xl mb-2">Todo al día</p>
              <p className="text-[var(--shelfy-muted)] text-sm mb-6">No hay exhibiciones pendientes</p>
              <Button onClick={cargar} variant="secondary">
                <RefreshCw size={14} /> Buscar nuevas
              </Button>
            </Card>
          ) : (
            <>
              {/* ── Navegación principal ── */}
              <div className="flex items-center justify-between mb-3">
                <Button variant="ghost" size="sm" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}>
                  <ChevronLeft size={16} /> Anterior
                </Button>
                <span className="text-[var(--shelfy-muted)] text-sm">
                  {idx + 1} / {totalGrupos}
                </span>
                <Button variant="ghost" size="sm" onClick={() => setIdx((i) => Math.min(totalGrupos - 1, i + 1))} disabled={idx >= totalGrupos - 1}>
                  Siguiente <ChevronRight size={16} />
                </Button>
              </div>

              {grupo && (
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
                  {/* ── Visor de foto ── */}
                  <Card className="flex flex-col gap-3">
                    {/* Tabs de fotos cuando hay burst */}
                    {grupo.fotos.length > 1 && (
                      <div className="flex gap-2 flex-wrap">
                        {grupo.fotos.map((_, i) => (
                          <button
                            key={i}
                            onClick={() => setFotoIdx(i)}
                            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors
                              ${fotoIdx === i
                                ? "bg-[var(--shelfy-primary)] text-white"
                                : "bg-[var(--shelfy-bg)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] border border-[var(--shelfy-border)]"
                              }`}
                          >
                            F{i + 1}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex-1 min-h-[280px] flex items-center justify-center">
                      <FotoViewer driveUrl={grupo.fotos[fotoIdx]?.drive_link ?? ""} />
                    </div>
                    {/* Flechas de foto si hay múltiples */}
                    {grupo.fotos.length > 1 && (
                      <div className="flex justify-center gap-4">
                        <button onClick={() => setFotoIdx((i) => Math.max(0, i - 1))} disabled={fotoIdx === 0}
                          className="p-1 text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] disabled:opacity-30">
                          <ChevronLeft size={20} />
                        </button>
                        <span className="text-xs text-[var(--shelfy-muted)] self-center">
                          {fotoIdx + 1} / {grupo.fotos.length}
                        </span>
                        <button onClick={() => setFotoIdx((i) => Math.min(grupo.fotos.length - 1, i + 1))} disabled={fotoIdx >= grupo.fotos.length - 1}
                          className="p-1 text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] disabled:opacity-30">
                          <ChevronRight size={20} />
                        </button>
                      </div>
                    )}
                  </Card>

                  {/* ── Panel de evaluación ── */}
                  <div className="flex flex-col gap-3">
                    {/* Info */}
                    <Card>
                      <div className="space-y-2 text-sm">
                        <InfoRow icon="👤" label="Vendedor" value={grupo.vendedor ?? "—"} />
                        <InfoRow icon="🏪" label="Cliente"  value={grupo.nro_cliente ?? "—"} />
                        <InfoRow icon="📍" label="PDV"      value={grupo.tipo_pdv ?? "—"} />
                        <InfoRow icon="🕐" label="Fecha"    value={grupo.fecha_hora?.slice(0, 16) ?? "—"} />
                      </div>
                    </Card>

                    {/* Comentario */}
                    <Card>
                      <label className="block text-xs text-[var(--shelfy-muted)] mb-1.5">Comentario (opcional)</label>
                      <textarea
                        value={comentario}
                        onChange={(e) => setComentario(e.target.value)}
                        rows={3}
                        placeholder="Agregar nota..."
                        className="w-full rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-3 py-2 text-sm resize-none focus:outline-none focus:border-[var(--shelfy-primary)] placeholder:text-[var(--shelfy-muted)]"
                      />
                    </Card>

                    {/* Botones de evaluación */}
                    <div className="flex flex-col gap-2">
                      <Button
                        size="lg" loading={actionLoading}
                        onClick={() => handleEvaluar("Aprobado")}
                        className="w-full bg-[var(--shelfy-success)] hover:opacity-90 text-white"
                      >
                        <CheckCircle size={18} /> APROBAR
                      </Button>
                      <Button
                        size="lg" loading={actionLoading}
                        onClick={() => handleEvaluar("Destacado")}
                        className="w-full bg-[var(--shelfy-primary)] hover:bg-[var(--shelfy-primary-2)] text-white"
                      >
                        <Star size={18} /> DESTACAR
                      </Button>
                      <Button
                        size="lg" loading={actionLoading}
                        onClick={() => handleEvaluar("Rechazado")}
                        className="w-full bg-[var(--shelfy-error)] hover:opacity-90 text-white"
                      >
                        <XCircle size={18} /> RECHAZAR
                      </Button>
                    </div>

                    {/* Revertir */}
                    {lastEvalIds.current.length > 0 && (
                      <Button variant="ghost" size="sm" loading={actionLoading} onClick={handleRevertir} className="w-full">
                        <RotateCcw size={14} /> Revertir última evaluación
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-5 text-center flex-shrink-0">{icon}</span>
      <span className="text-[var(--shelfy-muted)] flex-shrink-0">{label}:</span>
      <span className="text-[var(--shelfy-text)] font-medium truncate">{value}</span>
    </div>
  );
}
