"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { PageSpinner } from "@/components/ui/Spinner";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState, Suspense } from "react";
import { fetchDistribuidoras, type Distribuidora } from "@/lib/api";
import { SwitchCamera, AlertTriangle, Activity } from "lucide-react";

import SupervisionDashboard from "./components/SupervisionDashboard";

function ReportesContent() {
  const { user } = useAuth();

  const [selectedDistId, setSelectedDistId] = useState<number>(user?.id_distribuidor || 0);
  const [distribuidoras, setDistribuidoras] = useState<Distribuidora[]>([]);

  useEffect(() => {
    if (user?.id_distribuidor && selectedDistId === 0) {
      setSelectedDistId(user.id_distribuidor);
    }
    if (user?.rol === "superadmin") {
      fetchDistribuidoras(true).then(d => setDistribuidoras(d)).catch(console.error);
    }
  }, [user]);

  return (
    <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <BottomNav />
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar title="Panel de Supervisión" />

        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 overflow-auto w-full max-w-7xl mx-auto">

          {/* Header */}
          <div className="mb-6 flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-[var(--shelfy-text)] tracking-tight">
                Panel de Supervisión
              </h1>
              <p className="text-sm text-[var(--shelfy-muted)] mt-1">
                Supervisa el rendimiento de ventas, clientes y exhibiciones corporativas en tiempo real.
              </p>
            </div>

            {/* Context Switcher SuperAdmin */}
            {user?.rol === "superadmin" && distribuidoras.length > 0 && (
              <div className="bg-[var(--shelfy-panel)] p-2 rounded-xl border border-[var(--shelfy-border)] shadow-sm flex items-center gap-3">
                <SwitchCamera size={16} className="text-[var(--shelfy-muted)] ml-2" />
                <div>
                  <label className="block text-[10px] text-[var(--shelfy-muted)] font-medium mb-0.5 uppercase tracking-wider">Contexto Global</label>
                  <select
                    value={selectedDistId}
                    onChange={(e) => setSelectedDistId(Number(e.target.value))}
                    className="bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] text-sm font-semibold text-[var(--shelfy-text)] rounded-lg px-2 py-1 focus:outline-none focus:border-[var(--shelfy-primary)] cursor-pointer"
                  >
                    <option value={0} disabled>Seleccione distribuidor...</option>
                    {distribuidoras.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.nombre} (ID: {d.id})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Dashboard */}
          {user?.rol === 'superadmin' ? (
            selectedDistId ? (
              <SupervisionDashboard distId={selectedDistId} />
            ) : (
              <div className="flex items-center justify-center p-12 bg-white rounded-3xl border border-slate-100 shadow-sm text-center">
                <div>
                  <Activity size={48} className="text-slate-200 mx-auto mb-4" />
                  <h3 className="text-lg font-black text-slate-900 mb-1">Seleccione un contexto</h3>
                  <p className="text-sm font-medium text-slate-500">
                    Por favor elija una sucursal o centro de distribución arriba para cargar el panel.
                  </p>
                </div>
              </div>
            )
          ) : (
            <div className="flex items-center justify-center p-12 bg-white rounded-3xl border border-slate-100 shadow-sm text-center">
              <div>
                <AlertTriangle size={48} className="text-amber-400 mx-auto mb-4" />
                <h3 className="text-lg font-black text-slate-900 mb-1">Acceso Restringido</h3>
                <p className="text-sm font-medium text-slate-500">
                  El Panel de Supervisión está en fase de implementación y pruebas exclusivas. Pronto estará disponible.
                </p>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}

export default function HerramientasReportePage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <ReportesContent />
    </Suspense>
  );
}
