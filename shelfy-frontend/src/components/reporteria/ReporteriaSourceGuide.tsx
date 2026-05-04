"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart2, Receipt, Package, ArrowRight, AlertTriangle,
  ChevronDown, Download, FileSpreadsheet, MousePointer2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { ReporteriaSource } from "@/lib/api";

// ── Step data ─────────────────────────────────────────────────────────────────

interface StepConfig {
  label: string;
  description: string;
  highlight: string;
}

interface GuideConfig {
  sistema: string;
  badge: string;
  badgeClass: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  steps: StepConfig[];
  advertencia: string;
  advertenciaType: "info" | "warn";
}

const GUIDES: Record<ReporteriaSource, GuideConfig> = {
  comprobantes: {
    sistema: "CHESS ERP",
    badge: "CHESS ERP",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
    icon: Receipt,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    steps: [
      {
        label: "Menú Ventas",
        description: "En la barra superior, hacé clic en Ventas para abrir el menú.",
        highlight: "nav-ventas",
      },
      {
        label: "Comprobantes Emitidos",
        description: "Seleccioná Comprobantes Emitidos del desplegable.",
        highlight: "menu-comp",
      },
      {
        label: "Clic en Exportar",
        description: "Configurá las fechas del período y presioná el botón Exportar.",
        highlight: "btn-export",
      },
      {
        label: "Elegir RESUMIDO",
        description: "En el modal, seleccioná RESUMIDO y confirmá. Se descarga 'ReporteComprobantesResumen.xlsx'.",
        highlight: "modal-resumido",
      },
    ],
    advertencia: "Usá la opción RESUMIDO, no la detallada. El parser espera el formato de resumen por comprobante.",
    advertenciaType: "warn",
  },
  bultos: {
    sistema: "CHESS ERP",
    badge: "CHESS ERP",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: Package,
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
    steps: [
      {
        label: "Menú Ventas",
        description: "En la barra superior, hacé clic en Ventas para abrir el menú.",
        highlight: "nav-ventas",
      },
      {
        label: "Comprobantes Emitidos",
        description: "Seleccioná Comprobantes Emitidos del desplegable.",
        highlight: "menu-comp",
      },
      {
        label: "Clic en Exportar",
        description: "Configurá las fechas del período y presioná el botón Exportar.",
        highlight: "btn-export",
      },
      {
        label: "Elegir DETALLADO",
        description: "En el modal, seleccioná DETALLADO y confirmá. Se descarga 'ReporteComprobantesDetallado.xlsx'.",
        highlight: "modal-detallado",
      },
    ],
    advertencia: "Usá la opción DETALLADO, que incluye artículo por artículo con bultos/unidades por factura.",
    advertenciaType: "warn",
  },
  sigo: {
    sistema: "Nextbyn / SIGO",
    badge: "SIGO",
    badgeClass: "bg-violet-50 text-violet-700 border-violet-200",
    icon: BarChart2,
    iconBg: "bg-violet-100",
    iconColor: "text-violet-600",
    steps: [
      {
        label: "Ir al módulo SIGO",
        description: "Desde el menú de Nextbyn, hacé clic en SIGO para abrir el módulo de gestión.",
        highlight: "nav-sigo",
      },
      {
        label: "Seleccionar Entorno",
        description: "Elegí la sucursal en el desplegable Entorno (arriba a la izquierda).",
        highlight: "entorno",
      },
      {
        label: "Configurar fechas",
        description: "Establecé el rango Desde/Hasta del período que querés analizar.",
        highlight: "fechas",
      },
      {
        label: "Exportar XLS",
        description: "Hacé clic en el botón XLS/Excel para descargar el reporte completo.",
        highlight: "btn-xls",
      },
    ],
    advertencia: "No filtres por vendedor antes de exportar. El archivo debe tener TODOS los vendedores del período.",
    advertenciaType: "warn",
  },
};

// ── CHESS ERP Mockup ──────────────────────────────────────────────────────────

function ChessMockup({
  highlight,
  isResumido,
}: {
  highlight: string;
  isResumido: boolean;
}) {
  const isNavVentas = highlight === "nav-ventas";
  const isMenuComp  = highlight === "menu-comp";
  const isExport    = highlight === "btn-export";
  const isModal     = highlight === "modal-resumido" || highlight === "modal-detallado";

  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-white shadow-md text-[10px] select-none">
      {/* Top bar: browser chrome */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 border-b border-slate-200">
        <div className="flex gap-1">
          <div className="size-2 rounded-full bg-rose-400" />
          <div className="size-2 rounded-full bg-amber-400" />
          <div className="size-2 rounded-full bg-emerald-400" />
        </div>
        <div className="flex-1 bg-white border border-slate-200 rounded px-2 py-0.5 text-[9px] text-slate-400 truncate ml-2">
          {isResumido
            ? "chesserp.com /#/ventas/reportes/comprobantes"
            : "chesserp.com /#/ventas/reportes/comprobantes"
          }
        </div>
      </div>

      {/* Nav bar */}
      <div className="relative bg-[#1d4ed8] text-white flex items-center px-3 py-1.5 gap-1">
        <span className="font-black text-[10px] mr-3 tracking-tight">CHESS ERP</span>
        {["Inicio", "Ventas", "Compras", "Cuentas", "Config"].map((item) => (
          <motion.span
            key={item}
            animate={item === "Ventas" && isNavVentas ? {
              backgroundColor: "rgba(255,255,255,0.25)",
            } : {}}
            className={cn(
              "px-2 py-0.5 rounded cursor-default text-[10px] transition-all",
              item === "Ventas" && isNavVentas
                ? "text-white font-bold ring-1 ring-white/50"
                : "text-white/75 hover:text-white"
            )}
          >
            {item}
          </motion.span>
        ))}
      </div>

      {/* Dropdown */}
      <AnimatePresence>
        {(isNavVentas || isMenuComp) && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute top-[56px] left-[68px] z-30 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden"
            style={{ minWidth: 170 }}
          >
            {["Comprobantes Emitidos", "Pedidos de Venta", "Estadísticas", "Artículos"].map((item) => (
              <div
                key={item}
                className={cn(
                  "px-3 py-1.5 text-[10px] cursor-default transition-colors",
                  item === "Comprobantes Emitidos" && isMenuComp
                    ? "bg-blue-50 text-blue-700 font-bold border-l-2 border-blue-500"
                    : item === "Comprobantes Emitidos"
                    ? "bg-slate-50 text-slate-700"
                    : "text-slate-500 hover:bg-slate-50"
                )}
              >
                {item}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Page content */}
      <div className="p-3 pb-2">
        <p className="text-[9px] text-slate-400 mb-2 font-medium">
          Ventas &rsaquo; Comprobantes Emitidos
        </p>

        {/* Filter bar */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <div className="flex items-center gap-1">
            <span className="text-slate-400">Desde</span>
            <span className="bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-slate-600">01/04/2026</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-slate-400">Hasta</span>
            <span className="bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-slate-600">30/04/2026</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-slate-400">Vendedor</span>
            <span className="bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-slate-600 flex items-center gap-0.5">
              Todos <ChevronDown size={7} />
            </span>
          </div>
          <motion.button
            animate={isExport
              ? { boxShadow: "0 0 0 3px rgba(37,99,235,0.35)", scale: 1.05 }
              : { boxShadow: "0 0 0 0px rgba(37,99,235,0)", scale: 1 }
            }
            className={cn(
              "ml-auto px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1",
              isExport ? "bg-blue-600 text-white" : "bg-blue-500 text-white"
            )}
          >
            <Download size={8} />
            Exportar
          </motion.button>
        </div>

        {/* Mini table */}
        <div className="border border-slate-200 rounded overflow-hidden">
          <div className="bg-slate-50 grid grid-cols-5 border-b border-slate-200">
            {["Fecha", "N°", "Cliente", "Vendedor", "Importe"].map((h) => (
              <div key={h} className="px-1.5 py-1 text-[8px] font-bold text-slate-400 uppercase">{h}</div>
            ))}
          </div>
          {[
            ["03/04", "000001", "ALMACEN SOL", "GARCIA R.", "$42.800"],
            ["03/04", "000002", "KIOSCO CTR.", "LOPEZ M.",  "$18.200"],
            ["04/04", "000003", "SUPER ESTE",  "FDEZ. C.", "$91.500"],
          ].map((row, i) => (
            <div key={i} className="grid grid-cols-5 border-b border-slate-100 last:border-0">
              {row.map((cell, j) => (
                <div key={j} className="px-1.5 py-0.5 text-[9px] text-slate-600 truncate">{cell}</div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Export modal overlay */}
      <AnimatePresence>
        {isModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/25 flex items-center justify-center z-20"
          >
            <motion.div
              initial={{ scale: 0.88, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.88, opacity: 0, y: 8 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="bg-white rounded-xl border border-slate-200 shadow-2xl p-3 w-44"
            >
              <p className="text-[10px] font-black text-slate-700 mb-2 border-b border-slate-100 pb-2">
                Modalidad de exportación
              </p>
              <div className="space-y-1.5 mb-2.5">
                {(["Resumido", "Detallado"] as const).map((opt) => {
                  const sel = isResumido ? opt === "Resumido" : opt === "Detallado";
                  return (
                    <motion.div
                      key={opt}
                      animate={sel ? { backgroundColor: "#eff6ff" } : { backgroundColor: "#ffffff" }}
                      className={cn(
                        "flex items-center gap-2 p-1.5 rounded-lg border",
                        sel ? "border-blue-300 ring-1 ring-blue-300" : "border-transparent"
                      )}
                    >
                      <div className={cn(
                        "size-3 rounded-full border-2 shrink-0 flex items-center justify-center",
                        sel ? "border-blue-600" : "border-slate-300"
                      )}>
                        {sel && <div className="size-1.5 rounded-full bg-blue-600" />}
                      </div>
                      <span className={cn(
                        "text-[10px] font-medium flex-1",
                        sel ? "text-blue-700 font-bold" : "text-slate-600"
                      )}>
                        {opt}
                      </span>
                      {sel && (
                        <span className="text-[8px] bg-blue-600 text-white px-1 rounded font-bold">✓</span>
                      )}
                    </motion.div>
                  );
                })}
              </div>
              <button className="w-full py-1 bg-blue-600 text-white text-[10px] font-bold rounded-lg">
                Exportar Excel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cursor indicator */}
      <CursorDot highlight={highlight} />
    </div>
  );
}

// ── SIGO Mockup ───────────────────────────────────────────────────────────────

function SigoMockup({ highlight }: { highlight: string }) {
  const isNavSigo  = highlight === "nav-sigo";
  const isEntorno  = highlight === "entorno";
  const isFechas   = highlight === "fechas";
  const isXls      = highlight === "btn-xls";

  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-white shadow-md text-[10px] select-none">
      {/* Browser chrome */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 border-b border-slate-200">
        <div className="flex gap-1">
          <div className="size-2 rounded-full bg-rose-400" />
          <div className="size-2 rounded-full bg-amber-400" />
          <div className="size-2 rounded-full bg-emerald-400" />
        </div>
        <div className="flex-1 bg-white border border-slate-200 rounded px-2 py-0.5 text-[9px] text-slate-400 truncate ml-2">
          nextbyn.com / sigo / gestion / visitas
        </div>
      </div>

      {/* Nav */}
      <div className="bg-[#6d28d9] text-white flex items-center px-3 py-1.5 gap-1">
        <span className="font-black text-[10px] mr-3 tracking-tight">Nextbyn</span>
        {["Dashboard", "SIGO", "Gestión", "Ventas", "Config"].map((item) => (
          <motion.span
            key={item}
            animate={item === "SIGO" && isNavSigo ? { backgroundColor: "rgba(255,255,255,0.25)" } : {}}
            className={cn(
              "px-2 py-0.5 rounded cursor-default text-[10px] transition-all",
              item === "SIGO" && isNavSigo
                ? "text-white font-bold ring-1 ring-white/50"
                : "text-white/75"
            )}
          >
            {item}
          </motion.span>
        ))}
      </div>

      {/* Page */}
      <div className="p-3 pb-2">
        <p className="text-[9px] text-slate-400 mb-2 font-medium">SIGO &rsaquo; Gestión &rsaquo; Visitas por rango</p>

        {/* Controls row */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          {/* Entorno */}
          <motion.div
            animate={isEntorno
              ? { boxShadow: "0 0 0 2px rgba(109,40,217,0.4)" }
              : { boxShadow: "0 0 0 0px rgba(109,40,217,0)" }
            }
            className={cn(
              "flex items-center rounded-lg border overflow-hidden transition-colors",
              isEntorno ? "border-violet-400" : "border-slate-200"
            )}
          >
            <span className={cn(
              "px-2 py-1 text-[9px] border-r",
              isEntorno ? "text-violet-600 font-bold border-violet-300 bg-violet-50" : "text-slate-400 border-slate-200"
            )}>Entorno</span>
            <span className={cn(
              "px-2 py-1 flex items-center gap-0.5",
              isEntorno ? "text-violet-700 font-bold" : "text-slate-600"
            )}>
              Sucursal 1 <ChevronDown size={7} />
            </span>
          </motion.div>

          {/* Fechas */}
          <motion.div
            animate={isFechas
              ? { boxShadow: "0 0 0 2px rgba(109,40,217,0.4)" }
              : { boxShadow: "0 0 0 0px rgba(109,40,217,0)" }
            }
            className={cn(
              "flex items-center gap-1 rounded-lg border px-2 py-1 transition-colors",
              isFechas ? "border-violet-400 bg-violet-50" : "border-slate-200"
            )}
          >
            <span className={cn("text-[9px]", isFechas ? "text-violet-700 font-bold" : "text-slate-600")}>
              01/04/2026
            </span>
            <span className="text-slate-300 text-[9px]">→</span>
            <span className={cn("text-[9px]", isFechas ? "text-violet-700 font-bold" : "text-slate-600")}>
              30/04/2026
            </span>
          </motion.div>

          {/* XLS button */}
          <motion.button
            animate={isXls
              ? { boxShadow: "0 0 0 3px rgba(109,40,217,0.35)", scale: 1.06 }
              : { boxShadow: "0 0 0 0px rgba(109,40,217,0)", scale: 1 }
            }
            className={cn(
              "ml-auto px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1",
              isXls ? "bg-violet-600 text-white" : "bg-violet-500 text-white"
            )}
          >
            <FileSpreadsheet size={8} />
            XLS
          </motion.button>
        </div>

        {/* Table */}
        <div className="border border-slate-200 rounded overflow-hidden">
          <div className="bg-slate-50 grid grid-cols-5 border-b border-slate-200">
            {["Fecha", "Sector", "Cliente", "Visitado", "Hora"].map((h) => (
              <div key={h} className="px-1.5 py-1 text-[8px] font-bold text-slate-400 uppercase">{h}</div>
            ))}
          </div>
          {[
            ["03/04", "GARCIA R.", "ALMACEN S.", "SI",  "09:42"],
            ["03/04", "GARCIA R.", "KIOSCO CTR", "NO",  "-"],
            ["03/04", "LOPEZ M.",  "SUPER ESTE", "SI",  "11:15"],
          ].map((row, i) => (
            <div key={i} className="grid grid-cols-5 border-b border-slate-100 last:border-0">
              {row.map((cell, j) => (
                <div key={j} className={cn(
                  "px-1.5 py-0.5 text-[9px] truncate",
                  j === 3 && cell === "SI" ? "text-emerald-600 font-bold" :
                  j === 3 && cell === "NO" ? "text-rose-500 font-medium" : "text-slate-600"
                )}>{cell}</div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Cursor */}
      <CursorDot highlight={highlight} />
    </div>
  );
}

// ── Animated cursor dot ────────────────────────────────────────────────────────

const CURSOR_POSITIONS: Record<string, { x: string; y: string }> = {
  "nav-ventas":    { x: "30%",   y: "40px" },
  "menu-comp":     { x: "27%",   y: "68px" },
  "btn-export":    { x: "88%",   y: "78px" },
  "modal-resumido":{ x: "52%",   y: "55%" },
  "modal-detallado":{ x: "52%",  y: "55%" },
  "nav-sigo":      { x: "28%",   y: "40px" },
  "entorno":       { x: "20%",   y: "76px" },
  "fechas":        { x: "46%",   y: "76px" },
  "btn-xls":       { x: "86%",   y: "76px" },
};

function CursorDot({ highlight }: { highlight: string }) {
  const pos = CURSOR_POSITIONS[highlight];
  if (!pos) return null;
  return (
    <motion.div
      key={highlight}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.6 }}
      transition={{ duration: 0.2 }}
      className="absolute z-40 pointer-events-none"
      style={{ left: pos.x, top: pos.y, transform: "translate(-50%, -50%)" }}
    >
      <div className="relative">
        <MousePointer2
          size={16}
          className="text-slate-900 drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)] fill-white"
        />
        <motion.div
          animate={{ scale: [1, 1.6, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-0 -m-1 rounded-full bg-white/40"
        />
      </div>
    </motion.div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  source: ReporteriaSource;
  onContinue: () => void;
  onBack: () => void;
}

export function ReporteriaSourceGuide({ source, onContinue, onBack }: Props) {
  const guide   = GUIDES[source];
  const Icon    = guide.icon;
  const steps   = guide.steps;

  const [animStep, setAnimStep] = useState(0);

  useEffect(() => {
    setAnimStep(0);
    const iv = setInterval(() => {
      setAnimStep((s) => (s + 1) % steps.length);
    }, 2600);
    return () => clearInterval(iv);
  }, [source, steps.length]);

  const currentStep = steps[animStep];
  const isChess     = source === "comprobantes" || source === "bultos";

  return (
    <div className="flex flex-col gap-5 max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-xl font-black text-[var(--shelfy-text)] tracking-tight mb-1">
          Cómo descargar el archivo
        </h2>
        <p className="text-sm text-[var(--shelfy-muted)]">
          Seguí estos pasos en{" "}
          <span className="font-semibold text-[var(--shelfy-text)]">{guide.sistema}</span>{" "}
          para exportar el Excel correcto
        </p>
      </div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="bg-white border border-[var(--shelfy-border)] rounded-2xl overflow-hidden shadow-sm"
      >
        {/* Card header */}
        <div className="flex items-center gap-3.5 px-5 py-4 border-b border-[var(--shelfy-border)]">
          <div className={cn("size-10 rounded-xl flex items-center justify-center shrink-0", guide.iconBg)}>
            <Icon size={20} className={guide.iconColor} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider">
              Sistema
            </p>
            <p className="text-[15px] font-black text-[var(--shelfy-text)] leading-tight">
              {guide.sistema}
            </p>
          </div>
          <span className={cn(
            "text-[11px] font-bold px-3 py-1 rounded-full border shrink-0",
            guide.badgeClass
          )}>
            {guide.badge}
          </span>
        </div>

        {/* Mockup */}
        <div className="px-5 pt-5">
          <AnimatePresence mode="wait">
            <motion.div
              key={`mockup-${source}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {isChess ? (
                <ChessMockup
                  highlight={currentStep.highlight}
                  isResumido={source === "comprobantes"}
                />
              ) : (
                <SigoMockup highlight={currentStep.highlight} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Step description */}
        <div className="px-5 pt-3 pb-4">
          {/* Progress dots */}
          <div className="flex items-center gap-1.5 mb-3">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setAnimStep(i)}
                className={cn(
                  "rounded-full transition-all duration-200",
                  i === animStep
                    ? "w-5 h-2 bg-[var(--shelfy-primary)]"
                    : "size-2 bg-[var(--shelfy-border)] hover:bg-[var(--shelfy-muted)]/30"
                )}
              />
            ))}
            <span className="ml-auto text-[10px] text-[var(--shelfy-muted)] font-medium">
              Paso {animStep + 1}/{steps.length}
            </span>
          </div>

          {/* Step content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={animStep}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="flex items-start gap-3"
            >
              <div className={cn(
                "size-6 rounded-full flex items-center justify-center text-[11px] font-black shrink-0 mt-0.5",
                guide.iconBg, guide.iconColor
              )}>
                {animStep + 1}
              </div>
              <div>
                <p className="text-[13px] font-bold text-[var(--shelfy-text)] mb-0.5">
                  {currentStep.label}
                </p>
                <p className="text-[12px] text-[var(--shelfy-muted)] leading-relaxed">
                  {currentStep.description}
                </p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Warning */}
        <div className="mx-5 mb-5 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3.5">
          <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[12px] text-amber-700 font-medium leading-relaxed">
            {guide.advertencia}
          </p>
        </div>
      </motion.div>

      {/* Actions */}
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
