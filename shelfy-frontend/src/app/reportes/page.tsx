"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { PageSpinner } from "@/components/ui/Spinner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";
import { fetchReporteExhibiciones } from "@/lib/api";
import { Download } from "lucide-react";

interface Fila {
  id_exhibicion: number;
  vendedor: string;
  cliente: string;
  tipo_pdv: string;
  estado: string;
  supervisor: string;
  comentario: string;
  fecha_carga: string;
  fecha_evaluacion: string;
  link_foto: string;
}

function hoy() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
function inicioMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default function ReportesPage() {
  const { user } = useAuth();
  const [desde, setDesde] = useState(inicioMes());
  const [hasta, setHasta] = useState(hoy());
  const [filas, setFilas] = useState<Fila[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleBuscar() {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchReporteExhibiciones(user.id_distribuidor, {
        fecha_desde: desde,
        fecha_hasta: hasta,
      });
      setFilas(data as Fila[]);
      setSearched(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  function handleExportCSV() {
    if (filas.length === 0) return;
    const headers = ["ID", "Vendedor", "Cliente", "Tipo PDV", "Estado", "Supervisor", "Comentario", "Fecha carga", "Fecha evaluación"];
    const rows = filas.map((f) => [
      f.id_exhibicion, f.vendedor, f.cliente, f.tipo_pdv, f.estado,
      f.supervisor, f.comentario, f.fecha_carga, f.fecha_evaluacion,
    ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte_${desde}_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <BottomNav />
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar title="Reportes" />
        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 overflow-auto">

          {/* Filtros */}
          <Card className="mb-6">
            <h3 className="text-[var(--shelfy-text)] font-semibold text-sm mb-4">Filtros de búsqueda</h3>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs text-[var(--shelfy-muted)] mb-1.5 font-medium">Desde</label>
                <input
                  type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
                  className="rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--shelfy-primary)]"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--shelfy-muted)] mb-1.5 font-medium">Hasta</label>
                <input
                  type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
                  className="rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--shelfy-primary)]"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleBuscar} loading={loading}>Buscar</Button>
                {filas.length > 0 && (
                  <Button variant="secondary" onClick={handleExportCSV}>
                    <Download size={14} /> Exportar CSV
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
              {error}
            </div>
          )}
          {loading && <PageSpinner />}

          {!loading && searched && filas.length === 0 && (
            <p className="text-[var(--shelfy-muted)] text-sm">Sin resultados para el período seleccionado.</p>
          )}

          {!loading && filas.length > 0 && (
            <Card>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-[var(--shelfy-muted)]">{filas.length} registros encontrados</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[var(--shelfy-muted)] text-left border-b border-[var(--shelfy-border)]">
                      {["ID", "Vendedor", "Cliente", "PDV", "Estado", "Fecha carga"].map((h) => (
                        <th key={h} className="pb-3 pr-4 whitespace-nowrap font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f) => (
                      <tr key={f.id_exhibicion} className="border-b border-[var(--shelfy-border)] last:border-0 hover:bg-[var(--shelfy-bg)] transition-colors">
                        <td className="py-2.5 pr-4 text-[var(--shelfy-muted)]">{f.id_exhibicion}</td>
                        <td className="py-2.5 pr-4 text-[var(--shelfy-text)] font-medium">{f.vendedor}</td>
                        <td className="py-2.5 pr-4 text-[var(--shelfy-muted)]">{f.cliente}</td>
                        <td className="py-2.5 pr-4 text-[var(--shelfy-muted)]">{f.tipo_pdv}</td>
                        <td className="py-2.5 pr-4">
                          <EstadoBadge estado={f.estado} />
                        </td>
                        <td className="py-2.5 text-[var(--shelfy-muted)] whitespace-nowrap">{f.fecha_carga?.slice(0, 16)}</td>
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

function EstadoBadge({ estado }: { estado: string }) {
  const colors: Record<string, string> = {
    Aprobado:  "bg-green-100 text-green-700",
    Destacado: "bg-purple-100 text-purple-700",
    Rechazado: "bg-red-100 text-red-700",
    Pendiente: "bg-yellow-100 text-yellow-700",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[estado] ?? "bg-gray-100 text-gray-700"}`}>
      {estado}
    </span>
  );
}
