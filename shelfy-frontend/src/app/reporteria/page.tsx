"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  BarChart2, Download, FileText, Loader2, Plus, Package, Package2,
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
  fetchReporteriaExploreByJob,
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
import { SigoPanel } from "@/components/reporteria/panels/SigoPanel";
import { ComprobantesPanel } from "@/components/reporteria/panels/ComprobantesPanel";
import { DetalladoPanel } from "@/components/reporteria/panels/DetalladoPanel";
import { BultosPanel } from "@/components/reporteria/panels/BultosPanel";

type WizardStep = "pick" | "guide" | "upload" | "processing" | "panel";

const SOURCE_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  sigo:                   { label: "SIGO",                   icon: BarChart2,  color: "text-violet-600" },
  comprobantes:           { label: "Comprobantes",           icon: FileText,   color: "text-blue-600" },
  comprobantes_detallado: { label: "Comprobantes Detallado", icon: Package2,   color: "text-orange-600" },
  bultos:                 { label: "Bultos",                  icon: Package,    color: "text-emerald-600" },
};

function buildMockData(source: string): ReporteriaExploreResponse {
  const dateFrom = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const dateTo   = new Date().toISOString().slice(0, 10);
  const baseKpis = {
    sigo: [
      { label: "Cobertura",       value: 78,  unit: "%" },
      { label: "Efectividad",     value: 62,  unit: "%" },
      { label: "Visitados",       value: 187 },
      { label: "Sin venta",       value: 71 },
      { label: "Visitas <14hs",   value: 143 },
      { label: "% Visitas <14hs", value: 76,  unit: "%" },
    ],
    comprobantes: [
      { label: "Facturación",   value: 4_820_000, unit: "" },
      { label: "Contado",       value: 1_880_000, unit: "" },
      { label: "Cta. Cte.",     value: 2_940_000, unit: "" },
      { label: "Recibos",       value: 640_000,   unit: "" },
      { label: "Operaciones",   value: 1_283 },
      { label: "Ticket Prom.",  value: 3_757,     unit: "" },
    ],
    bultos: [
      { label: "Bultos Totales",   value: 8_412 },
      { label: "Artículos únicos", value: 94 },
      { label: "Semanas",          value: 4 },
      { label: "Prom. Semanal",    value: 2_103, unit: " blts/sem" },
      { label: "PDVs >2.5/sem",    value: 38 },
      { label: "Vendedores",       value: 12 },
    ],
    comprobantes_detallado: [
      { label: "Facturación",       value: 3_200_000, unit: "" },
      { label: "Artículos únicos",  value: 48 },
      { label: "Clientes únicos",   value: 214 },
      { label: "Ticket promedio",   value: 14_953, unit: "" },
      { label: "Operaciones",       value: 214 },
    ],
  };

  const days = Math.max(
    1,
    Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86_400_000)
  );
  const serie = Array.from({ length: Math.min(days, 30) }, (_, i) => {
    const d = new Date(dateFrom + "T00:00:00");
    d.setDate(d.getDate() + Math.round(i * (days / 30)));
    const base = source === "sigo" ? 18 : source === "comprobantes" || source === "comprobantes_detallado" ? 160_000 : 280;
    return {
      fecha: d.toISOString().slice(0, 10),
      valor: base + Math.round((Math.random() - 0.4) * base * 0.6),
    };
  });

  const sigoClientes = [
    { nombre_cliente: "GARCIA ROBERTO",   vendedor_nombre: "187/240 visitados", sucursal_nombre: "Efectividad: 71%", importe_total: 78, cantidad_facturas: 133, ultimo_comprobante: null },
    { nombre_cliente: "LOPEZ MARIA",      vendedor_nombre: "162/210 visitados", sucursal_nombre: "Efectividad: 58%", importe_total: 77, cantidad_facturas: 94,  ultimo_comprobante: null },
    { nombre_cliente: "FERNANDEZ CARLOS", vendedor_nombre: "140/190 visitados", sucursal_nombre: "Efectividad: 65%", importe_total: 74, cantidad_facturas: 91,  ultimo_comprobante: null },
    { nombre_cliente: "TORRES ANA",       vendedor_nombre: "115/160 visitados", sucursal_nombre: "Efectividad: 48%", importe_total: 72, cantidad_facturas: 55,  ultimo_comprobante: null },
  ];
  const compClientes = [
    { nombre_cliente: "SUPERMERCADO EL PROGRESO",  vendedor_nombre: "GARCIA ROBERTO",  sucursal_nombre: "CENTRAL", importe_total: 420_000, cantidad_facturas: 12, ultimo_comprobante: "2026-05-01" },
    { nombre_cliente: "ALMACEN DEL SOL",           vendedor_nombre: "LOPEZ MARIA",     sucursal_nombre: "NORTE",   importe_total: 310_000, cantidad_facturas: 9,  ultimo_comprobante: "2026-04-29" },
    { nombre_cliente: "DISTRIBUIDORA HNOS. PEREZ", vendedor_nombre: "FERNANDEZ CARLOS",sucursal_nombre: "SUR",     importe_total: 284_000, cantidad_facturas: 8,  ultimo_comprobante: "2026-04-30" },
    { nombre_cliente: "KIOSCO LA ESQUINA",         vendedor_nombre: "GARCIA ROBERTO",  sucursal_nombre: "CENTRAL", importe_total: 198_000, cantidad_facturas: 15, ultimo_comprobante: "2026-05-02" },
  ];
  const bultosClientes = [
    { nombre_cliente: "[1042] ALMACEN SAN PEDRO",  vendedor_nombre: "GARCIA ROBERTO",  sucursal_nombre: "NORTE",   importe_total: 18.5, cantidad_facturas: 74,  ultimo_comprobante: null },
    { nombre_cliente: "[0831] SUPER LA ESTRELLA",  vendedor_nombre: "LOPEZ MARIA",     sucursal_nombre: "CENTRAL", importe_total: 12.3, cantidad_facturas: 49,  ultimo_comprobante: null },
    { nombre_cliente: "[1198] KIOSCO CENTRAL",     vendedor_nombre: "TORRES ANA",      sucursal_nombre: "ESTE",    importe_total: 9.8,  cantidad_facturas: 39,  ultimo_comprobante: null },
    { nombre_cliente: "[0722] FERRETERIA MARTIN",  vendedor_nombre: "FERNANDEZ CARLOS",sucursal_nombre: "SUR",     importe_total: 7.2,  cantidad_facturas: 29,  ultimo_comprobante: null },
  ];

  return {
    source: source as import("@/lib/api").ReporteriaSource,
    date_from: dateFrom,
    date_to: dateTo,
    snapshot_version: "demo-mock",
    snapshot_created_at: new Date().toISOString(),
    kpis: (baseKpis as Record<string, typeof baseKpis.sigo>)[source] ?? baseKpis.comprobantes,
    serie_temporal: serie,
    top_clientes: source === "sigo" ? sigoClientes : (source === "comprobantes" || source === "comprobantes_detallado") ? compClientes : bultosClientes,
    top_vendedores: source === "sigo"
      ? [
          { nombre: "GARCIA ROBERTO",    valor: 78 },
          { nombre: "LOPEZ MARIA",       valor: 77 },
          { nombre: "FERNANDEZ CARLOS",  valor: 74 },
          { nombre: "TORRES ANA",        valor: 72 },
        ]
      : (source === "comprobantes" || source === "comprobantes_detallado")
        ? [
            { nombre: "GARCIA ROBERTO",    valor: 820_000 },
            { nombre: "LOPEZ MARIA",       valor: 740_000 },
            { nombre: "FERNANDEZ CARLOS",  valor: 680_000 },
            { nombre: "TORRES ANA",        valor: 590_000 },
          ]
        : [
            { nombre: "[MADRUGON] TABACO RUBIO",   valor: 1_240 },
            { nombre: "[MADRUGON] MENTOLADO",       valor: 980 },
            { nombre: "[PREMIER] LARGO",            valor: 860 },
            { nombre: "[DERBY] CLASICO",            valor: 720 },
          ],
    origen_datos: {
      fuente: SOURCE_META[source].label,
      menu_referencia: source === "sigo"
        ? "SIGO → Módulo de Gestión → Visitas por rango"
        : source === "comprobantes"
          ? "CHESS → Comprobantes → Resumen por período"
          : source === "comprobantes_detallado"
            ? "CHESS → Comprobantes → Detalle por período"
            : "CHESS → Comprobantes → Detalle por artículo",
      filtros_aplicados: [`Desde: ${dateFrom}`, `Hasta: ${dateTo}`, "Datos de demostración"],
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
  const [completedJobId, setCompletedJobId] = useState<string | null>(null);
  const [exploreData, setExploreData] = useState<ReporteriaExploreResponse | null>(null);
  const [exportingFmt, setExportingFmt] = useState<string | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);

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
    if (jobData?.status === "completed" && reportType && activeJobId) {
      toast.success("Análisis completado. Cargando datos…");
      const jobIdForExport = activeJobId;
      fetchReporteriaExploreByJob(distId, activeJobId)
        .then((data) => {
          setExploreData(data);
          setCompletedJobId(jobIdForExport);
          setStep("panel");
        })
        .catch(() => {
          const mock = buildMockData(reportType);
          setExploreData(mock);
          setStep("panel");
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

  const handleFileReady = useCallback(async (f: File) => {
    if (!reportType) return;
    setFile(f);
    setUploadLoading(true);

    try {
      const job = await uploadReporteriaManualFile(distId, reportType, f);
      setActiveJobId(job.id);
      setStep("processing");
    } catch {
      const mock = buildMockData(reportType);
      setExploreData(mock);
      setStep("processing");
      setTimeout(() => {
        setStep("panel");
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
    setCompletedJobId(null);
    setExploreData(null);
  }, []);

  async function handleExport(fmt: "xlsx" | "pdf") {
    if (!exploreData) return;
    setExportingFmt(fmt);
    try {
      const blob = await exportReporteria(completedJobId ?? "mock", fmt);
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
                SIGO · Comprobantes · Detallado · Bultos — análisis interactivo on-demand
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
              <PanelView data={exploreData} />
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
}

function PanelView({ data }: PanelViewProps) {
  const sourceMeta = SOURCE_META[data.source];
  const SourceIcon = sourceMeta?.icon ?? BarChart2;
  const recordCount = data.top_clientes?.length ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="space-y-5"
    >
      {/* Premium header card */}
      <div className="relative rounded-2xl border border-[var(--shelfy-border)] bg-gradient-to-br from-white via-[var(--shelfy-primary)]/[0.03] to-white shadow-sm overflow-hidden p-5">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[var(--shelfy-primary)]/60 via-[var(--shelfy-primary)]/20 to-transparent rounded-t-2xl" />
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <span className={cn(
              "inline-flex items-center justify-center size-10 rounded-xl",
              data.source === "sigo"                   ? "bg-violet-100" :
              data.source === "comprobantes"            ? "bg-blue-100"   :
              data.source === "comprobantes_detallado"  ? "bg-orange-100" : "bg-emerald-100"
            )}>
              <SourceIcon size={18} className={sourceMeta?.color ?? "text-[var(--shelfy-primary)]"} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-black text-[var(--shelfy-text)]">
                  {sourceMeta?.label ?? data.source}
                </span>
                {data.snapshot_version === "demo-mock" && (
                  <span className="text-[9px] font-black bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
                    DEMO
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--shelfy-muted)] font-medium mt-0.5">
                {data.date_from} → {data.date_to}
              </p>
            </div>
          </div>
          {recordCount > 0 && (
            <div className="text-right">
              <p className="text-2xl font-black text-[var(--shelfy-primary)] tabular-nums leading-none">
                {recordCount.toLocaleString("es-AR")}
              </p>
              <p className="text-[10px] font-bold text-[var(--shelfy-muted)] uppercase tracking-wider mt-0.5">
                registros
              </p>
            </div>
          )}
        </div>
      </div>

      {/* KPIs */}
      <ReporteriaKpis kpis={data.kpis} />

      {/* Source-specific panel */}
      {data.source === "sigo" && <SigoPanel data={data} />}
      {data.source === "comprobantes" && <ComprobantesPanel data={data} />}
      {data.source === "comprobantes_detallado" && <DetalladoPanel data={data} />}
      {data.source === "bultos" && <BultosPanel data={data} />}
    </motion.div>
  );
}
