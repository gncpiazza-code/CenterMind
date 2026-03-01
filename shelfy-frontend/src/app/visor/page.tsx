"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { PageSpinner } from "@/components/ui/Spinner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { fetchPendientes, evaluar, revertir } from "@/lib/api";
import { CheckCircle, XCircle, Star, RotateCcw, ExternalLink } from "lucide-react";

interface Foto { id_exhibicion: number; drive_link: string; }
interface Grupo {
  vendedor: string;
  nro_cliente: string;
  tipo_pdv: string;
  fecha_hora: string;
  fotos: Foto[];
}

export default function VisorPage() {
  const { user } = useAuth();
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!user) return;
    setLoading(true);
    fetchPendientes(user.id_distribuidor)
      .then((data) => setGrupos(data as Grupo[]))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [user]);

  async function handleEvaluar(ids: number[], estado: string) {
    const key = ids.join(",") + estado;
    setActionId(key);
    try {
      await evaluar(ids, estado, user?.usuario ?? "admin");
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar title="Visor de exhibiciones" />
        <main className="flex-1 p-6 overflow-auto">
          <div className="flex items-center justify-between mb-6">
            <p className="text-[var(--shelfy-muted)] text-sm">
              {loading ? "Cargando..." : `${grupos.length} exhibiciones pendientes`}
            </p>
            <Button variant="secondary" size="sm" onClick={load}>Actualizar</Button>
          </div>

          {error && <p className="text-[var(--shelfy-error)] text-sm mb-4">{error}</p>}
          {loading && <PageSpinner />}

          {!loading && grupos.length === 0 && (
            <Card className="text-center py-12">
              <p className="text-[var(--shelfy-muted)]">No hay exhibiciones pendientes</p>
            </Card>
          )}

          <div className="flex flex-col gap-4">
            {grupos.map((g, i) => {
              const ids = g.fotos.map((f) => f.id_exhibicion);
              const key = ids.join(",");
              return (
                <Card key={i}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-[var(--shelfy-text)] font-medium">{g.vendedor ?? "Sin nombre"}</p>
                      <p className="text-xs text-[var(--shelfy-muted)] mt-0.5">
                        Cliente: {g.nro_cliente ?? "—"} · PDV: {g.tipo_pdv ?? "—"} · {g.fecha_hora?.slice(0, 16) ?? ""}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        size="sm" variant="ghost"
                        loading={actionId === key + "Aprobado"}
                        onClick={() => handleEvaluar(ids, "Aprobado")}
                        className="text-[var(--shelfy-success)] hover:text-[var(--shelfy-success)]"
                      >
                        <CheckCircle size={14} /> Aprobar
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        loading={actionId === key + "Destacado"}
                        onClick={() => handleEvaluar(ids, "Destacado")}
                        className="text-[var(--shelfy-primary)] hover:text-[var(--shelfy-primary)]"
                      >
                        <Star size={14} /> Destacar
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        loading={actionId === key + "Rechazado"}
                        onClick={() => handleEvaluar(ids, "Rechazado")}
                        className="text-[var(--shelfy-error)] hover:text-[var(--shelfy-error)]"
                      >
                        <XCircle size={14} /> Rechazar
                      </Button>
                    </div>
                  </div>

                  {g.fotos.length > 0 && (
                    <div className="flex flex-wrap gap-3 mt-4">
                      {g.fotos.map((f) => (
                        <a
                          key={f.id_exhibicion}
                          href={f.drive_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs text-[var(--shelfy-primary)] hover:underline"
                        >
                          <ExternalLink size={12} /> Foto {f.id_exhibicion}
                        </a>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}
