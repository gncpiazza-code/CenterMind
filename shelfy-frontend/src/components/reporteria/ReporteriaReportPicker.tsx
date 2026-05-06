"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { BarChart2, Receipt, Package, Package2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { ReporteriaSource } from "@/lib/api";

interface ReportCard {
  value: ReporteriaSource;
  icon: React.ElementType;
  title: string;
  description: string;
  color: string;
  iconBg: string;
}

const REPORTS: ReportCard[] = [
  {
    value: "sigo",
    icon: BarChart2,
    title: "SIGO",
    description: "Visitas, cobertura, efectividad y ventas por vendedor",
    color: "from-violet-50 to-purple-50 border-violet-100",
    iconBg: "bg-violet-100 text-violet-600",
  },
  {
    value: "comprobantes",
    icon: Receipt,
    title: "Comprobantes",
    description: "Comprobantes emitidos, medios de pago y rankings",
    color: "from-blue-50 to-indigo-50 border-blue-100",
    iconBg: "bg-blue-100 text-blue-600",
  },
  {
    value: "bultos",
    icon: Package,
    title: "Bultos",
    description: "Bultos por artículo, canal, subcanal y vendedor",
    color: "from-emerald-50 to-teal-50 border-emerald-100",
    iconBg: "bg-emerald-100 text-emerald-600",
  },
  {
    value: "comprobantes_detallado",
    icon: Package2,
    title: "Comprobantes Detallado",
    description: "Análisis por artículo, canal y cliente con drill-down",
    color: "from-orange-50 to-amber-50 border-orange-100",
    iconBg: "bg-orange-100 text-orange-600",
  },
];

interface Props {
  onSelect: (source: ReporteriaSource) => void;
}

export function ReporteriaReportPicker({ onSelect }: Props) {
  const [selected, setSelected] = useState<ReporteriaSource | null>(null);

  return (
    <div className="flex flex-col gap-6 items-center">
      <div className="text-center">
        <h2 className="text-xl font-black text-[var(--shelfy-text)] tracking-tight mb-1">
          ¿Qué tipo de análisis necesitás?
        </h2>
        <p className="text-sm text-[var(--shelfy-muted)]">
          Elegí la fuente de datos para comenzar
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-3xl">
        {REPORTS.map((report, i) => {
          const Icon = report.icon;
          const isSelected = selected === report.value;

          return (
            <motion.button
              key={report.value}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              onClick={() => setSelected(report.value)}
              className={cn(
                "relative text-left rounded-2xl p-5 border-2 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--shelfy-primary)] bg-gradient-to-br",
                isSelected
                  ? "border-[var(--shelfy-primary)] shadow-lg shadow-[var(--shelfy-primary)]/10 bg-[var(--shelfy-primary)]/[0.03]"
                  : cn("hover:shadow-md", report.color),
                !isSelected && "hover:border-[var(--shelfy-primary)]/40"
              )}
              style={isSelected ? {
                background: "linear-gradient(135deg, rgba(168,85,247,0.04) 0%, rgba(124,58,237,0.03) 100%)",
              } : {}}
            >
              {isSelected && (
                <motion.div
                  layoutId="picker-selected"
                  className="absolute inset-0 rounded-2xl border-2 border-[var(--shelfy-primary)] pointer-events-none"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}

              <div className={cn("inline-flex items-center justify-center size-10 rounded-xl mb-3 transition-all duration-200", report.iconBg)}>
                <Icon size={20} />
              </div>

              <p className={cn(
                "text-[15px] font-black tracking-tight mb-1 transition-colors duration-200",
                isSelected ? "text-[var(--shelfy-primary)]" : "text-[var(--shelfy-text)]"
              )}>
                {report.title}
              </p>
              <p className="text-[12px] text-[var(--shelfy-muted)] leading-relaxed">
                {report.description}
              </p>

              {isSelected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-3 right-3 size-5 rounded-full bg-[var(--shelfy-primary)] flex items-center justify-center"
                >
                  <svg viewBox="0 0 10 10" className="size-3 fill-none stroke-white stroke-[2]">
                    <polyline points="1.5,5 4,7.5 8.5,2.5" />
                  </svg>
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: selected ? 1 : 0.4, y: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-2xl"
      >
        <Button
          onClick={() => selected && onSelect(selected)}
          disabled={!selected}
          className={cn(
            "w-full h-12 rounded-xl font-bold text-[15px] tracking-wide transition-all duration-200",
            selected
              ? "bg-[var(--shelfy-primary)] hover:bg-[var(--shelfy-accent)] text-white shadow-md hover:shadow-lg shadow-[var(--shelfy-primary)]/25"
              : "bg-[var(--shelfy-border)] text-[var(--shelfy-muted)] cursor-not-allowed"
          )}
        >
          <span className="flex items-center justify-center gap-2">
            Continuar
            <ArrowRight size={16} />
          </span>
        </Button>
      </motion.div>
    </div>
  );
}
