"use client";

import { motion } from "framer-motion";
import { BarChart2, Receipt, Package, ArrowRight, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { ReporteriaSource } from "@/lib/api";

interface GuideContent {
  sistema: string;
  modulo: string;
  exportar: string;
  advertencia: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  systemBadge: string;
  steps: string[];
}

const GUIDES: Record<ReporteriaSource, GuideContent> = {
  sigo: {
    sistema: "Nextbyn / SIGO",
    modulo: "Módulo SIGO → Gestión → Visitas / Ventas por rango",
    exportar: "Exportar a Excel el reporte de visitas y ventas del período deseado",
    advertencia: "El archivo debe contener columnas de fecha, vendedor, cliente y tipo de gestión",
    icon: BarChart2,
    iconBg: "bg-violet-100",
    iconColor: "text-violet-600",
    systemBadge: "bg-violet-50 text-violet-700 border-violet-200",
    steps: [
      "Ingresá al sistema Nextbyn con tus credenciales",
      "Navegá al módulo SIGO → Gestión → Visitas / Ventas por rango",
      "Configurá el rango de fechas del período a analizar",
      "Hacé clic en Exportar y guardá el archivo Excel",
    ],
  },
  comprobantes: {
    sistema: "CHESS ERP",
    modulo: "Comprobantes → Resumen por período (o Comprobantes Emitidos)",
    exportar: "Exportar Excel del resumen de comprobantes del período",
    advertencia: "Usar el export de RESUMEN, no el detallado por artículo",
    icon: Receipt,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    systemBadge: "bg-blue-50 text-blue-700 border-blue-200",
    steps: [
      "Ingresá al sistema CHESS ERP",
      "Navegá a Comprobantes → Resumen por período (o Comprobantes Emitidos)",
      "Seleccioná el rango de fechas del período a analizar",
      "Exportá el RESUMEN en formato Excel (no usar el detallado por artículo)",
    ],
  },
  bultos: {
    sistema: "CHESS ERP",
    modulo: "Comprobantes → Detalle por artículo / Bultos",
    exportar: "Exportar el DETALLADO con columnas de artículo y cantidad de bultos",
    advertencia: "Verificar que el archivo incluya las columnas de artículo y unidades/bultos",
    icon: Package,
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
    systemBadge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    steps: [
      "Ingresá al sistema CHESS ERP",
      "Navegá a Comprobantes → Detalle por artículo / Bultos",
      "Seleccioná el rango de fechas del período a analizar",
      "Exportá el DETALLADO con columnas de artículo y cantidad de bultos/unidades",
    ],
  },
};

interface Props {
  source: ReporteriaSource;
  onContinue: () => void;
  onBack: () => void;
}

export function ReporteriaSourceGuide({ source, onContinue, onBack }: Props) {
  const guide = GUIDES[source];
  const Icon = guide.icon;

  return (
    <div className="flex flex-col gap-5 max-w-2xl mx-auto">
      <div className="text-center">
        <h2 className="text-xl font-black text-[var(--shelfy-text)] tracking-tight mb-1">
          Cómo obtener el archivo
        </h2>
        <p className="text-sm text-[var(--shelfy-muted)]">
          Seguí estos pasos en tu ERP para exportar el Excel correcto
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="bg-white border border-[var(--shelfy-border)] rounded-2xl overflow-hidden shadow-sm"
      >
        {/* Header del sistema */}
        <div className="flex items-center gap-4 p-5 border-b border-[var(--shelfy-border)]">
          <div className={cn("size-11 rounded-xl flex items-center justify-center shrink-0", guide.iconBg)}>
            <Icon size={22} className={guide.iconColor} />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider mb-0.5">
              Sistema
            </p>
            <p className="text-[15px] font-black text-[var(--shelfy-text)]">{guide.sistema}</p>
          </div>
          <span className={cn("ml-auto text-[11px] font-bold px-3 py-1 rounded-full border", guide.systemBadge)}>
            {source === "sigo" ? "SIGO" : "CHESS ERP"}
          </span>
        </div>

        {/* Pasos */}
        <div className="p-5 space-y-3">
          <p className="text-[11px] font-black text-[var(--shelfy-muted)] uppercase tracking-wider mb-4">
            Pasos a seguir
          </p>
          {guide.steps.map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-start gap-3"
            >
              <div className={cn(
                "size-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5",
                guide.iconBg, guide.iconColor
              )}>
                {i + 1}
              </div>
              <p className="text-[13px] text-[var(--shelfy-text)] font-medium leading-relaxed">
                {step}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Advertencia */}
        <div className="mx-5 mb-5 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] font-black text-amber-800 uppercase tracking-wider mb-0.5">
              Importante
            </p>
            <p className="text-[12px] text-amber-700 font-medium leading-relaxed">
              {guide.advertencia}
            </p>
          </div>
        </div>
      </motion.div>

      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={onBack}
          className="rounded-xl h-11 px-6 font-bold border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] hover:border-[var(--shelfy-muted)]/40"
        >
          ← Atrás
        </Button>
        <Button
          onClick={onContinue}
          className="flex-1 h-11 rounded-xl font-bold text-[15px] bg-[var(--shelfy-primary)] hover:bg-[var(--shelfy-accent)] text-white shadow-md hover:shadow-lg shadow-[var(--shelfy-primary)]/20 transition-all duration-200"
        >
          <span className="flex items-center justify-center gap-2">
            Ya tengo el archivo
            <ArrowRight size={16} />
          </span>
        </Button>
      </div>
    </div>
  );
}
