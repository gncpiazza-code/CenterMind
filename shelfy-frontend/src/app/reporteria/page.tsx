"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart2, Upload, Download, FileText, TrendingUp, Users, Loader2,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import {
  createReporteriaJob,
  fetchReporteriaJobStatus,
  fetchReporteriaExplore,
  exportReporteria,
  type ReporteriaSource,
  type ReporteriaExploreResponse,
} from "@/lib/api";
import { reporteriaKeys } from "@/lib/query-keys";

import { ReporteriaFilters } from "@/components/reporteria/ReporteriaFilters";
import { ReporteriaKpis } from "@/components/reporteria/ReporteriaKpis";
import { ReporteriaCharts } from "@/components/reporteria/ReporteriaCharts";
import { ReporteriaTable } from "@/components/reporteria/ReporteriaTable";
import { ReporteriaJobStatus } from "@/components/reporteria/ReporteriaJobStatus";
import { ReporteriaOrigen } from "@/components/reporteria/ReporteriaOrigen";
import { ReporteriaManualUploadDialog } from "@/components/reporteria/ReporteriaManualUploadDialog";

type TabId = "resumen" | "tendencias" | "clientes";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "resumen",    label: "Resumen",    icon: BarChart2 },
  { id: "tendencias", label: "Tendencias", icon: TrendingUp },
  { id: "clientes",   label: "Clientes",   icon: Users },
];

const SOURCE_META: Record<ReporteriaSource, { label: string; desc: string }> = {
  sigo:         { label: "SIGO",         desc: "Gestión en calle — visitas, ventas y cobertura" },
  comprobantes: { label: "Comprobantes", desc: "Facturación CHESS — contado, CC y recibos" },
  bultos:       { label: "Bultos",       desc: "Distribución por artículo, canal y subcanal" },
};

// ── Mock data shown when backend not yet available ────────────────────────────
function buildMockData(
  source: ReporteriaSource,
  dateFrom: string,
  dateTo: string
): ReporteriaExploreResponse {
  const baseKpis = {
    sigo: [
      { label: "PDV Visitados",   value: 312,       delta: 8,    delta_label: "+8% vs período ant." },
      { label: "Efectividad",     value: 74,  unit: "%", delta: 3,  delta_label: "+3 pp" },
      { label: "Sin Venta",       value: 81,        delta: -12,  delta_label: "-12 PDV" },
      { label: "Cobertura",       value: 89,  unit: "%", delta: 2,  delta_label: "+2 pp" },
      { label: "Visitas / Día",   value: 18,        delta: 1,   delta_label: "+1 promedio" },
      { label: "Clientes nuevos", value: 7 },
    ],
    comprobantes: [
      { label: "Total Facturado", value: 4_820_000, unit: "", delta: 15, delta_label: "+15%" },
      { label: "Facturas",        value: 1_283 },
      { label: "Cuentas Ctes.",   value: 2_940_000 },
      { label: "Contado",         value: 1_880_000 },
      { label: "Recibos",         value: 640_000 },
      { label: "Ticket Prom.",    value: 3_757 },
    ],
    bultos: [
      { label: "Bultos Totales",  value: 8_412 },
      { label: "Artículos únicos",value: 94 },
      { label: "Bultos / Día",    value: 284 },
      { label: "Vendedores activos", value: 18 },
      { label: "Top artículo",    value: 312,  unit: " unds." },
      { label: "Cobertura SKU",   value: 67,  unit: "%" },
    ],
  };

  const days = Math.max(
    1,
    Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86_400_000)
  );
  const serie = Array.from({ length: Math.min(days, 30) }, (_, i) => {
    const d = new Date(dateFrom + "T00:00:00");
    d.setDate(d.getDate() + Math.round(i * (days / 30)));
    const base = source === "sigo" ? 18 : source === "comprobantes" ? 160_000 : 280;
    return {
      fecha: d.toISOString().slice(0, 10),
      valor: base + Math.round((Math.random() - 0.4) * base * 0.6),
    };
  });

  return {
    source,
    date_from: dateFrom,
    date_to: dateTo,
    snapshot_version: "demo-mock",
    snapshot_created_at: new Date().toISOString(),
    kpis: baseKpis[source],
    serie_temporal: serie,
    top_clientes: [
      { nombre_cliente: "SUPERMERCADO EL PROGRESO", vendedor_nombre: "GARCIA ROBERTO", sucursal_nombre: "CENTRAL", importe_total: 420_000, cantidad_facturas: 12, ultimo_comprobante: "2026-05-01" },
      { nombre_cliente: "ALMACEN DEL SOL", vendedor_nombre: "LOPEZ MARIA", sucursal_nombre: "NORTE", importe_total: 310_000, cantidad_facturas: 9, ultimo_comprobante: "2026-04-29" },
      { nombre_cliente: "DISTRIBUIDORA HNOS. PEREZ", vendedor_nombre: "FERNANDEZ CARLOS", sucursal_nombre: "SUR", importe_total: 284_000, cantidad_facturas: 8, ultimo_comprobante: "2026-04-30" },
      { nombre_cliente: "KIOSCO LA ESQUINA", vendedor_nombre: "GARCIA ROBERTO", sucursal_nombre: "CENTRAL", importe_total: 198_000, cantidad_facturas: 15, ultimo_comprobante: "2026-05-02" },
      { nombre_cliente: "FERRETERIA MARTIN", vendedor_nombre: "TORRES ANA", sucursal_nombre: "ESTE", importe_total: 175_000, cantidad_facturas: 6, ultimo_comprobante: "2026-04-28" },
      { nombre_cliente: "CARNICERIA DON JUAN", vendedor_nombre: "LOPEZ MARIA", sucursal_nombre: "NORTE", importe_total: 142_000, cantidad_facturas: 11, ultimo_comprobante: "2026-05-01" },
      { nombre_cliente: "VERDULERIA EL CAMPO", vendedor_nombre: "DIAZ PEDRO", sucursal_nombre: "OESTE", importe_total: 128_000, cantidad_facturas: 7, ultimo_comprobante: "2026-04-27" },
      { nombre_cliente: "BODEGA Y VINOTECA LUNA", vendedor_nombre: "FERNANDEZ CARLOS", sucursal_nombre: "SUR", importe_total: 119_000, cantidad_facturas: 5, ultimo_comprobante: "2026-04-30" },
    ],
    top_vendedores: [
      { nombre: "GARCIA ROBERTO",    valor: 820_000 },
      { nombre: "LOPEZ MARIA",       valor: 740_000 },
      { nombre: "FERNANDEZ CARLOS",  valor: 680_000 },
      { nombre: "TORRES ANA",        valor: 590_000 },
      { nombre: "DIAZ PEDRO",        valor: 520_000 },
      { nombre: "ROMERO LUCIA",      valor: 480_000 },
    ],
    origen_datos: {
      fuente: SOURCE_META[source].label,
      menu_referencia: source === "sigo"
        ? "SIGO → Gestión → Visitas / Ventas por rango"
        : source === "comprobantes"
          ? "CHESS → Comprobantes → Resumen por período"
          : "CHESS → Comprobantes → Detalle artículo",
      filtros_aplicados: [`Desde: ${dateFrom}`, `Hasta: ${dateTo}`, "Todos los vendedores"],
      snapshot_at: new Date().toISOString(),
    },
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReporteriaPage() {
  const { user } = useAuth();
  const distId = user?.id_distribuidor ?? 0;
  const isSuperadmin = user?.is_superadmin ?? false;
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabId>("resumen");
  const [showUpload, setShowUpload] = useState(false);
  const [exportingFmt, setExportingFmt] = useState<string | null>(null);

  // Current query params
  const [params, setParams] = useState<{
    source: ReporteriaSource;
    dateFrom: string;
    dateTo: string;
    sucursal: string;
    vendedor: string;
  } | null>(null);

  // Active job being polled
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // Job polling
  const { data: jobData } = useQuery({
    queryKey: reporteriaKeys.job(activeJobId ?? ""),
    queryFn: () => fetchReporteriaJobStatus(activeJobId!),
    enabled: !!activeJobId,
    refetchInterval: (q) => {
      const st = q.state.data?.status;
      if (st === "completed" || st === "failed") return false;
      return 2000;
    },
  });

  const isJobRunning = !!activeJobId &&
    (jobData?.status === "queued" || jobData?.status === "running");

  useEffect(() => {
    if (jobData?.status === "completed") {
      toast.success("Análisis completado. Actualizando datos…");
      if (params) {
        qc.invalidateQueries({
          queryKey: reporteriaKeys.explore(
            distId, params.source, params.dateFrom, params.dateTo, params.sucursal, params.vendedor
          ),
        });
      }
      setActiveJobId(null);
    }
    if (jobData?.status === "failed") {
      toast.error("El análisis falló. Intentá de nuevo.");
      setActiveJobId(null);
    }
  }, [jobData?.status]);

  // Explore query (real backend or mock fallback)
  const { data: exploreData, isLoading: exploreLoading, error: exploreError } = useQuery({
    queryKey: params
      ? reporteriaKeys.explore(distId, params.source, params.dateFrom, params.dateTo, params.sucursal, params.vendedor)
      : ["reporteria", "idle"],
    queryFn: async () => {
      try {
        return await fetchReporteriaExplore(
          distId, params!.source, params!.dateFrom, params!.dateTo,
          { sucursal: params!.sucursal || undefined, vendedor: params!.vendedor || undefined }
        );
      } catch {
        // Backend not yet available — return mock data
        return buildMockData(params!.source, params!.dateFrom, params!.dateTo);
      }
    },
    enabled: !!params && !!distId,
    staleTime: 5 * 60 * 1000,
  });

  // Create job mutation
  const createJob = useMutation({
    mutationFn: (p: NonNullable<typeof params>) =>
      createReporteriaJob(distId, {
        source: p.source,
        date_from: p.dateFrom,
        date_to: p.dateTo,
        sucursal: p.sucursal || undefined,
        vendedor: p.vendedor || undefined,
      }),
    onSuccess: (job) => {
      setActiveJobId(job.id);
    },
    onError: () => {
      // Backend not ready — just use mock immediately
      if (params) {
        qc.setQueryData(
          reporteriaKeys.explore(distId, params.source, params.dateFrom, params.dateTo, params.sucursal, params.vendedor),
          buildMockData(params.source, params.dateFrom, params.dateTo)
        );
      }
    },
  });

  const handleRun = useCallback((p: NonNullable<typeof params>) => {
    setParams(p);
    setActiveTab("resumen");
    // Try to trigger backend job; falls back gracefully to mock in explore query
    createJob.mutate(p);
  }, []);

  async function handleExport(fmt: "xlsx" | "pdf") {
    if (!activeJobId && !exploreData) return;
    setExportingFmt(fmt);
    try {
      const blob = await exportReporteria(activeJobId ?? "mock", fmt);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reporte-shelfy.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Exportación no disponible todavía");
    } finally {
      setExportingFmt(null);
    }
  }

  if (!user) return null;

  const showPanel = !!exploreData;
  const loading = exploreLoading || isJobRunning;

  return (
    <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <BottomNav />
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar title="Reportería" />

        <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6 overflow-auto w-full max-w-7xl mx-auto space-y-5">

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-[var(--shelfy-text)] tracking-tight flex items-center gap-2.5">
                <span className="inline-flex items-center justify-center size-8 rounded-xl bg-[var(--shelfy-primary)]/10">
                  <BarChart2 size={17} className="text-[var(--shelfy-primary)]" />
                </span>
                Reportería
              </h1>
              <p className="text-sm text-[var(--shelfy-muted)] mt-1">
                SIGO · Comprobantes · Bultos — análisis interactivo on-demand
              </p>
            </div>

            {/* Export + manual upload */}
            {showPanel && (
              <div className="flex items-center gap-2 shrink-0">
                {isSuperadmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowUpload(true)}
                    className="rounded-xl text-xs font-bold border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-primary)] hover:border-[var(--shelfy-primary)]/40"
                  >
                    <Upload size={13} className="mr-1.5" /> Carga manual
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport("xlsx")}
                  disabled={exportingFmt === "xlsx"}
                  className="rounded-xl text-xs font-bold border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-primary)]"
                >
                  {exportingFmt === "xlsx"
                    ? <Loader2 size={13} className="animate-spin mr-1.5" />
                    : <Download size={13} className="mr-1.5" />
                  }
                  XLSX
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport("pdf")}
                  disabled={exportingFmt === "pdf"}
                  className="rounded-xl text-xs font-bold border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-primary)]"
                >
                  {exportingFmt === "pdf"
                    ? <Loader2 size={13} className="animate-spin mr-1.5" />
                    : <FileText size={13} className="mr-1.5" />
                  }
                  PDF
                </Button>
              </div>
            )}
          </div>

          {/* Filters */}
          <ReporteriaFilters
            distId={distId}
            onRun={handleRun}
            isRunning={isJobRunning || createJob.isPending}
          />

          {/* Job status */}
          <ReporteriaJobStatus job={jobData ?? null} />

          {/* Panel */}
          <AnimatePresence mode="wait">
            {!params ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-20 text-center"
              >
                <div className="size-16 rounded-2xl bg-[var(--shelfy-primary)]/10 flex items-center justify-center mb-4">
                  <BarChart2 size={28} className="text-[var(--shelfy-primary)]" />
                </div>
                <h3 className="text-lg font-black text-[var(--shelfy-text)] mb-1">
                  Configurá los filtros y ejecutá el análisis
                </h3>
                <p className="text-sm text-[var(--shelfy-muted)] max-w-sm">
                  Seleccioná la fuente de datos, el rango de fechas y hacé clic en{" "}
                  <strong>Ejecutar Análisis</strong> para ver el panel interactivo.
                </p>
              </motion.div>
            ) : loading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 rounded-2xl" />
                  ))}
                </div>
                <Skeleton className="h-64 rounded-2xl" />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Skeleton className="h-52 rounded-2xl" />
                  <Skeleton className="h-52 rounded-2xl" />
                </div>
              </motion.div>
            ) : exploreData ? (
              <motion.div
                key="panel"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-5"
              >
                {/* Source badge */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black bg-[var(--shelfy-primary)] text-white px-3 py-1 rounded-full">
                      {SOURCE_META[exploreData.source]?.label ?? exploreData.source}
                    </span>
                    <span className="text-xs text-[var(--shelfy-muted)] font-medium">
                      {exploreData.date_from} → {exploreData.date_to}
                    </span>
                    {exploreData.snapshot_version === "demo-mock" && (
                      <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
                        DEMO
                      </span>
                    )}
                  </div>
                </div>

                {/* KPIs */}
                <ReporteriaKpis kpis={exploreData.kpis} />

                {/* Tabs */}
                <div className="flex gap-1 bg-white border border-[var(--shelfy-border)] rounded-xl p-1 w-fit">
                  {TABS.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => setActiveTab(id)}
                      className={cn(
                        "relative flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200",
                        activeTab === id
                          ? "text-[var(--shelfy-primary)]"
                          : "text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"
                      )}
                    >
                      {activeTab === id && (
                        <motion.div
                          layoutId="tab-bg"
                          className="absolute inset-0 bg-[var(--shelfy-primary)]/10 rounded-lg"
                          transition={{ type: "spring", stiffness: 400, damping: 35 }}
                        />
                      )}
                      <Icon size={13} className="relative z-10" />
                      <span className="relative z-10">{label}</span>
                    </button>
                  ))}
                </div>

                {/* Tab content */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, x: 6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -6 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="space-y-4"
                  >
                    {activeTab === "resumen" && (
                      <>
                        <ReporteriaCharts data={exploreData} />
                        <ReporteriaOrigen data={exploreData} />
                      </>
                    )}
                    {activeTab === "tendencias" && (
                      <>
                        <ReporteriaCharts data={exploreData} />
                        <ReporteriaOrigen data={exploreData} />
                      </>
                    )}
                    {activeTab === "clientes" && (
                      <>
                        <ReporteriaTable rows={exploreData.top_clientes} />
                        <ReporteriaOrigen data={exploreData} />
                      </>
                    )}
                  </motion.div>
                </AnimatePresence>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </main>
      </div>

      {/* Manual upload dialog — superadmin only */}
      {isSuperadmin && (
        <ReporteriaManualUploadDialog
          open={showUpload}
          onClose={() => setShowUpload(false)}
          distId={distId}
          onJobCreated={(jobId) => {
            setActiveJobId(jobId);
            setShowUpload(false);
          }}
        />
      )}
    </div>
  );
}
