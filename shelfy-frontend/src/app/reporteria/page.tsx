"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart2, Download, FileText, TrendingUp, Users, Loader2, Plus,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import {
  fetchReporteriaJobStatus,
  fetchReporteriaExplore,
  exportReporteria,
  uploadReporteriaManualFile,
  type ReporteriaSource,
  type ReporteriaExploreResponse,
} from "@/lib/api";
import { reporteriaKeys } from "@/lib/query-keys";

import { ReporteriaWizardLayout } from "@/components/reporteria/ReporteriaWizardLayout";
import { ReporteriaReportPicker } from "@/components/reporteria/ReporteriaReportPicker";
import { ReporteriaSourceGuide } from "@/components/reporteria/ReporteriaSourceGuide";
import { ReporteriaDropzone } from "@/components/reporteria/ReporteriaDropzone";
import { ReporteriaProcessingState } from "@/components/reporteria/ReporteriaProcessingState";
import { ReporteriaKpis } from "@/components/reporteria/ReporteriaKpis";
import { ReporteriaCharts } from "@/components/reporteria/ReporteriaCharts";
import { ReporteriaTable } from "@/components/reporteria/ReporteriaTable";
import { ReporteriaOrigen } from "@/components/reporteria/ReporteriaOrigen";

type WizardStep = "pick" | "guide" | "upload" | "processing" | "panel";
type TabId = "resumen" | "tendencias" | "clientes";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "resumen",    label: "Resumen",    icon: BarChart2 },
  { id: "tendencias", label: "Tendencias", icon: TrendingUp },
  { id: "clientes",   label: "Clientes",   icon: Users },
];

const SOURCE_META: Record<ReporteriaSource, { label: string }> = {
  sigo:         { label: "SIGO" },
  comprobantes: { label: "Comprobantes" },
  bultos:       { label: "Bultos" },
};

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
      { label: "Bultos Totales",    value: 8_412 },
      { label: "Artículos únicos",  value: 94 },
      { label: "Bultos / Día",      value: 284 },
      { label: "Vendedores activos",value: 18 },
      { label: "Top artículo",      value: 312,  unit: " unds." },
      { label: "Cobertura SKU",     value: 67,  unit: "%" },
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
      { nombre_cliente: "SUPERMERCADO EL PROGRESO",   vendedor_nombre: "GARCIA ROBERTO",   sucursal_nombre: "CENTRAL", importe_total: 420_000, cantidad_facturas: 12, ultimo_comprobante: "2026-05-01" },
      { nombre_cliente: "ALMACEN DEL SOL",            vendedor_nombre: "LOPEZ MARIA",       sucursal_nombre: "NORTE",   importe_total: 310_000, cantidad_facturas: 9,  ultimo_comprobante: "2026-04-29" },
      { nombre_cliente: "DISTRIBUIDORA HNOS. PEREZ",  vendedor_nombre: "FERNANDEZ CARLOS",  sucursal_nombre: "SUR",     importe_total: 284_000, cantidad_facturas: 8,  ultimo_comprobante: "2026-04-30" },
      { nombre_cliente: "KIOSCO LA ESQUINA",          vendedor_nombre: "GARCIA ROBERTO",    sucursal_nombre: "CENTRAL", importe_total: 198_000, cantidad_facturas: 15, ultimo_comprobante: "2026-05-02" },
      { nombre_cliente: "FERRETERIA MARTIN",          vendedor_nombre: "TORRES ANA",        sucursal_nombre: "ESTE",    importe_total: 175_000, cantidad_facturas: 6,  ultimo_comprobante: "2026-04-28" },
      { nombre_cliente: "CARNICERIA DON JUAN",        vendedor_nombre: "LOPEZ MARIA",       sucursal_nombre: "NORTE",   importe_total: 142_000, cantidad_facturas: 11, ultimo_comprobante: "2026-05-01" },
      { nombre_cliente: "VERDULERIA EL CAMPO",        vendedor_nombre: "DIAZ PEDRO",        sucursal_nombre: "OESTE",   importe_total: 128_000, cantidad_facturas: 7,  ultimo_comprobante: "2026-04-27" },
      { nombre_cliente: "BODEGA Y VINOTECA LUNA",     vendedor_nombre: "FERNANDEZ CARLOS",  sucursal_nombre: "SUR",     importe_total: 119_000, cantidad_facturas: 5,  ultimo_comprobante: "2026-04-30" },
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

export default function ReporteriaPage() {
  const { user } = useAuth();
  const distId = user?.id_distribuidor ?? 0;

  const [step, setStep]               = useState<WizardStep>("pick");
  const [reportType, setReportType]   = useState<ReporteriaSource | null>(null);
  const [file, setFile]               = useState<File | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [exploreData, setExploreData] = useState<ReporteriaExploreResponse | null>(null);
  const [activeTab, setActiveTab]     = useState<TabId>("resumen");
  const [exportingFmt, setExportingFmt] = useState<string | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);

  const [pendingDates, setPendingDates] = useState<{ from: string; to: string } | null>(null);

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

  useEffect(() => {
    if (jobData?.status === "completed" && reportType && pendingDates) {
      toast.success("Análisis completado. Cargando datos…");
      fetchReporteriaExplore(distId, reportType, pendingDates.from, pendingDates.to)
        .then((data) => {
          setExploreData(data);
          setStep("panel");
          setActiveTab("resumen");
        })
        .catch(() => {
          const mock = buildMockData(reportType, pendingDates.from, pendingDates.to);
          setExploreData(mock);
          setStep("panel");
          setActiveTab("resumen");
        });
      setActiveJobId(null);
    }
    if (jobData?.status === "failed") {
      toast.error("El análisis falló. Intentá de nuevo.");
    }
  }, [jobData?.status]);

  const handlePickReport = useCallback((source: ReporteriaSource) => {
    setReportType(source);
    setStep("guide");
  }, []);

  const handleGuideBack = useCallback(() => {
    setStep("pick");
  }, []);

  const handleGuideContinue = useCallback(() => {
    setStep("upload");
  }, []);

  const handleUploadBack = useCallback(() => {
    setStep("guide");
  }, []);

  const handleFileReady = useCallback(async (f: File, dateFrom: string, dateTo: string) => {
    if (!reportType) return;
    setFile(f);
    setPendingDates({ from: dateFrom, to: dateTo });
    setUploadLoading(true);

    try {
      const job = await uploadReporteriaManualFile(distId, reportType, f, dateFrom, dateTo);
      setActiveJobId(job.id);
      setStep("processing");
    } catch {
      // Backend not available — go straight to mock panel
      const mock = buildMockData(reportType, dateFrom, dateTo);
      setExploreData(mock);
      setStep("processing");
      // Short delay to show the processing step, then move to panel
      setTimeout(() => {
        setStep("panel");
        setActiveTab("resumen");
      }, 1800);
    } finally {
      setUploadLoading(false);
    }
  }, [reportType, distId]);

  const handleRetry = useCallback(() => {
    setActiveJobId(null);
    setStep("upload");
  }, []);

  const handleNewAnalysis = useCallback(() => {
    setStep("pick");
    setReportType(null);
    setFile(null);
    setActiveJobId(null);
    setExploreData(null);
    setPendingDates(null);
  }, []);

  async function handleExport(fmt: "xlsx" | "pdf") {
    if (!exploreData) return;
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

  return (
    <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <BottomNav />
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar title="Reportería" />

        <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6 overflow-auto w-full max-w-4xl mx-auto">

          {/* Page header */}
          <div className="flex items-start justify-between gap-4 mb-7">
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

            {step === "panel" && (
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNewAnalysis}
                  className="rounded-xl text-xs font-bold border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-primary)] hover:border-[var(--shelfy-primary)]/40"
                >
                  <Plus size={13} className="mr-1.5" />
                  Nuevo análisis
                </Button>
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

          {/* Wizard */}
          <ReporteriaWizardLayout step={step} reportType={reportType}>
            {step === "pick" && (
              <ReporteriaReportPicker onSelect={handlePickReport} />
            )}

            {step === "guide" && reportType && (
              <ReporteriaSourceGuide
                source={reportType}
                onContinue={handleGuideContinue}
                onBack={handleGuideBack}
              />
            )}

            {step === "upload" && reportType && (
              <ReporteriaDropzone
                source={reportType}
                onFileReady={handleFileReady}
                onBack={handleUploadBack}
                isLoading={uploadLoading}
              />
            )}

            {step === "processing" && reportType && (
              <ReporteriaProcessingState
                job={jobData ?? null}
                source={reportType}
                filename={file?.name ?? ""}
                onRetry={jobData?.status === "failed" ? handleRetry : undefined}
              />
            )}

            {step === "panel" && exploreData && (
              <PanelView
                data={exploreData}
                activeTab={activeTab}
                onTabChange={setActiveTab}
              />
            )}
          </ReporteriaWizardLayout>
        </main>
      </div>
    </div>
  );
}

// ── Panel view (step 5) ───────────────────────────────────────────────────────

interface PanelViewProps {
  data: ReporteriaExploreResponse;
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

function PanelView({ data, activeTab, onTabChange }: PanelViewProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-5"
    >
      {/* Source badge */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="text-xs font-black bg-[var(--shelfy-primary)] text-white px-3 py-1 rounded-full">
          {SOURCE_META[data.source]?.label ?? data.source}
        </span>
        <span className="text-xs text-[var(--shelfy-muted)] font-medium">
          {data.date_from} → {data.date_to}
        </span>
        {data.snapshot_version === "demo-mock" && (
          <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
            DEMO
          </span>
        )}
      </div>

      {/* KPIs */}
      <ReporteriaKpis kpis={data.kpis} />

      {/* Tab bar */}
      <div className="flex gap-1 bg-white border border-[var(--shelfy-border)] rounded-xl p-1 w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={cn(
              "relative flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200",
              activeTab === id
                ? "text-[var(--shelfy-primary)]"
                : "text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"
            )}
          >
            {activeTab === id && (
              <motion.div
                layoutId="tab-panel-bg"
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
          {(activeTab === "resumen" || activeTab === "tendencias") && (
            <>
              <ReporteriaCharts data={data} />
              <ReporteriaOrigen data={data} />
            </>
          )}
          {activeTab === "clientes" && (
            <>
              <ReporteriaTable rows={data.top_clientes} />
              <ReporteriaOrigen data={data} />
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
