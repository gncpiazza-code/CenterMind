"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart2, Receipt, Package, ArrowRight, AlertTriangle,
  ChevronDown, Download, FileSpreadsheet, MousePointer2, Settings2,
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
        label: "Ingresar a CHESS ERP",
        description: "Accedé a tu instancia de CHESS ERP (chesserp.com) e iniciá sesión con tu usuario.",
        highlight: "login",
      },
      {
        label: "REPORTE DE COMPROBANTES",
        description: "Navegá al módulo Ventas → Reporte de Comprobantes. Completá Fecha Desde y Fecha Hasta con el período deseado.",
        highlight: "filters",
      },
      {
        label: "Clic en Procesar",
        description: "Con las fechas completas, hacé clic en el botón Procesar. El sistema detectará que hay más de 1.000 registros.",
        highlight: "procesar",
      },
      {
        label: "Exportar reporte RESUMIDO",
        description: "En el modal 'Exportación de archivos', elegí RESUMIDO y hacé clic en Exportar. El archivo se llama 'ReporteComprobantesResumen.xlsx'.",
        highlight: "modal-resumido",
      },
    ],
    advertencia: "Usá el RESUMIDO, no el detallado. El parser de Shelfy espera el formato de resumen por comprobante.",
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
        label: "Ingresar a CHESS ERP",
        description: "Accedé a tu instancia de CHESS ERP (chesserp.com) e iniciá sesión con tu usuario.",
        highlight: "login",
      },
      {
        label: "REPORTE DE COMPROBANTES",
        description: "Navegá al módulo Ventas → Reporte de Comprobantes. Completá Fecha Desde y Fecha Hasta con el período deseado.",
        highlight: "filters",
      },
      {
        label: "Clic en Procesar",
        description: "Con las fechas completas, hacé clic en el botón Procesar. El sistema detectará que hay más de 1.000 registros.",
        highlight: "procesar",
      },
      {
        label: "Exportar reporte DETALLADO",
        description: "En el modal, elegí DETALLADO (a nivel de lineas) y hacé clic en Exportar. El archivo se llama 'ReporteComprobantesDetallado.xlsx'.",
        highlight: "modal-detallado",
      },
    ],
    advertencia: "Usá el DETALLADO (a nivel de lineas). Contiene artículo + bultos por factura, necesario para el análisis de stock.",
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
        label: "Login en Nextbyn",
        description: "Ingresá a portal.nextbyn.com con tu usuario y contraseña, luego hacé clic en Ingresar.",
        highlight: "sigo-login",
      },
      {
        label: "Abrir módulo SIGO",
        description: "Desde el menú principal de Nextbyn, navegá al módulo SIGO (sigo.aspx). El popup 'Entorno de trabajo' se abre automáticamente.",
        highlight: "sigo-entorno",
      },
      {
        label: "Configurar Entorno",
        description: "Elegí la Sucursal en el desplegable y la fecha del período. Hacé clic en Aplicar para cargar los datos.",
        highlight: "sigo-aplicar",
      },
      {
        label: "Exportar a XLS",
        description: "Con el entorno cargado, abrí el popup 'Puntos de venta' y hacé clic en 'Exportar a XLS'.",
        highlight: "sigo-export",
      },
    ],
    advertencia: "No filtres por vendedor antes de exportar. El archivo debe incluir TODOS los vendedores del período para el análisis de cobertura.",
  },
};

// ── CHESS ERP Mockup ──────────────────────────────────────────────────────────

function ChessMockup({ highlight, isResumido }: { highlight: string; isResumido: boolean }) {
  const isLogin   = highlight === "login";
  const isFilters = highlight === "filters";
  const isProcesar= highlight === "procesar";
  const isModal   = highlight === "modal-resumido" || highlight === "modal-detallado";

  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-200 shadow-lg bg-white text-[10px] select-none" style={{ minHeight: 220 }}>

      {/* ── Login view ── */}
      {isLogin && (
        <motion.div
          key="chess-login"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 flex"
          style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)" }}
        >
          {/* Login card */}
          <div className="m-auto w-44 bg-white rounded-xl shadow-2xl p-4">
            {/* CHESS logo */}
            <div className="flex items-center gap-1 mb-3">
              <div className="size-5 rounded bg-[#1976d2] flex items-center justify-center">
                <span className="text-white font-black text-[8px]">C</span>
              </div>
              <span className="font-black text-[#1976d2] text-[11px] tracking-tight">chess</span>
            </div>
            <p className="text-[11px] font-bold text-slate-700 mb-0.5">¡Hola, bienvenido!</p>
            <p className="text-[9px] text-slate-400 mb-2">Escaleá sus procesos y optimizá...</p>
            <div className="space-y-1.5 mb-2">
              <div>
                <p className="text-[9px] text-slate-500 mb-0.5">Usuario</p>
                <div className="border border-slate-300 rounded px-1.5 py-1 text-slate-700 text-[9px]">usuarioChess</div>
              </div>
              <div>
                <p className="text-[9px] text-slate-500 mb-0.5">Password</p>
                <div className="border border-slate-300 rounded px-1.5 py-1 text-slate-400 text-[9px]">••••••••••</div>
              </div>
            </div>
            <motion.div
              animate={{ boxShadow: ["0 0 0 0px rgba(25,118,210,0.4)", "0 0 0 4px rgba(25,118,210,0.15)", "0 0 0 0px rgba(25,118,210,0.4)"] }}
              transition={{ duration: 1.8, repeat: Infinity }}
              className="w-full py-1.5 bg-[#1976d2] text-white text-[10px] font-bold rounded text-center"
            >
              INICIAR SESIÓN
            </motion.div>
          </div>
          {/* Right marketing panel */}
          <div className="absolute right-0 top-0 bottom-0 w-2/5 flex items-center justify-center opacity-30">
            <div className="text-white text-center">
              <div className="flex items-center gap-1 justify-center mb-1">
                <div className="size-5 rounded bg-white/20 flex items-center justify-center">
                  <span className="text-white font-black text-[8px]">C</span>
                </div>
                <span className="font-black text-[11px]">chess</span>
              </div>
              <p className="text-[9px]">Escaleá sus procesos</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Report + Filters view ── */}
      {!isLogin && (
        <motion.div
          key="chess-report"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col h-full"
        >
          {/* Nav bar */}
          <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-slate-100 bg-white">
            <div className="size-4 text-slate-400 flex items-center justify-center font-bold text-[11px]">☰</div>
            <div className="flex items-center gap-1">
              <div className="size-4 rounded bg-[#1976d2] flex items-center justify-center shrink-0">
                <span className="text-white font-black text-[7px]">C</span>
              </div>
              <span className="font-black text-[#1976d2] text-[9px]">chess</span>
              <span className="text-[8px] text-slate-400 ml-0.5">6.0.58</span>
            </div>
            <span className="text-[9px] font-bold text-slate-600 ml-1">REPORTE DE COMPROBANTES</span>
            <span className="ml-auto text-[8px] text-slate-400">Distribuidora SRL - AR</span>
            <div className="flex items-center gap-1 ml-1">
              <div className="size-4 rounded-full bg-slate-200 flex items-center justify-center text-[7px] font-bold text-slate-600">US</div>
              <div className="flex gap-0.5">
                {["🔔","👤","🎧","⬇"].map(icon => (
                  <span key={icon} className="text-[8px] text-[#1976d2]">{icon}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Filter toolbar */}
          <motion.div
            animate={isProcesar
              ? {}
              : isFilters
              ? { backgroundColor: "#f0f7ff" }
              : {}
            }
            className="flex items-center gap-1 px-2 py-1.5 border-b border-slate-100 flex-wrap"
          >
            {/* Dropdowns */}
            {["Empresas", "Tipos Documento", "Sucursal"].map((label) => (
              <div key={label} className="flex items-center gap-0.5 border border-slate-200 rounded px-1 py-0.5 text-[8px] text-slate-600 bg-white">
                {label} <ChevronDown size={7} className="text-slate-400" />
              </div>
            ))}
            {/* Text inputs */}
            {["Tipo", "Serie", "Nro. Desde", "Nro. Hasta"].map((label) => (
              <div key={label} className="border border-slate-200 rounded px-1 py-0.5 text-[8px] text-slate-400 bg-white w-12">
                {label}
              </div>
            ))}
            {/* Date fields */}
            {[
              { label: "Fecha Desde", val: isFilters || isProcesar || isModal ? "01/04/2026" : "" },
              { label: "Fecha Hasta", val: isFilters || isProcesar || isModal ? "30/04/2026" : "" },
            ].map(({ label, val }) => (
              <motion.div
                key={label}
                animate={isFilters ? { borderColor: "#1976d2", backgroundColor: "#e3f2fd" } : { borderColor: "#e2e8f0", backgroundColor: "#ffffff" }}
                className="flex items-center gap-0.5 border rounded px-1 py-0.5 text-[8px] transition-all"
                style={{ minWidth: 66 }}
              >
                <span className="text-slate-400 text-[7px] shrink-0">{label}</span>
                <span className={cn("font-medium", val ? "text-slate-700" : "text-transparent")}>{val || "dd/mm/aaaa"}</span>
                <span className="text-slate-300 text-[7px] ml-auto">📅</span>
              </motion.div>
            ))}
            {/* Filtro + dropdown */}
            <span className="text-[7px] text-slate-400">Filtro</span>
            <div className="flex items-center gap-0.5 border border-slate-200 rounded px-1 py-0.5 text-[8px] text-slate-600 bg-white">
              Todos lo... <ChevronDown size={7} className="text-slate-400" />
            </div>
            {/* Procesar button */}
            <motion.button
              animate={isProcesar
                ? { boxShadow: "0 0 0 3px rgba(25,118,210,0.35)", scale: 1.05 }
                : { boxShadow: "0 0 0 0px rgba(25,118,210,0)", scale: 1 }
              }
              className={cn(
                "ml-auto flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold text-white transition-all",
                isProcesar ? "bg-[#1565c0]" : "bg-[#1976d2]"
              )}
            >
              <Settings2 size={8} />
              Procesar
            </motion.button>
          </motion.div>

          {/* Info bar */}
          <div className="px-2 py-1.5 bg-[#e3f2fd] border-b border-[#bbdefb]">
            <p className="text-[8px] text-[#0d47a1]">
              A continuación, puede buscar comprobantes utilizando los distintos atributos filtrables disponibles, y/o los comprobantes en un rango de fechas. Tenga en cuenta que no se pueden visualizar en la grilla más de 1.000 comprobantes.
            </p>
          </div>

          {/* Body placeholder */}
          <div className="flex-1 bg-white" />
        </motion.div>
      )}

      {/* ── Export modal overlay ── */}
      <AnimatePresence>
        {isModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/25 flex items-center justify-center z-20"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 6 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 6 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="bg-white rounded-lg shadow-2xl overflow-hidden"
              style={{ width: 310 }}
            >
              {/* Modal header */}
              <div className="flex items-center gap-2 px-3 py-2 bg-[#1976d2]">
                <Download size={11} className="text-white" />
                <span className="text-[10px] font-bold text-white flex-1">Exportación de archivos</span>
                <span className="text-white/80 text-[10px] cursor-pointer">✕</span>
              </div>
              {/* Modal body */}
              <div className="p-3">
                <p className="text-[9px] text-slate-600 mb-3 leading-relaxed">
                  Su consulta ha devuelto un número excesivo de registros (mas de 1.000). Refine su consulta o exporte los mismos a excel.
                </p>
                {/* Radio options */}
                <div className="space-y-2 mb-3">
                  {[
                    { label: "Exportar reporte resumido", key: "resumido" },
                    { label: "Exportar reporte detallado (a nivel de lineas)", key: "detallado" },
                  ].map(({ label, key }) => {
                    const sel = isResumido ? key === "resumido" : key === "detallado";
                    return (
                      <motion.div
                        key={key}
                        animate={sel && key === "detallado"
                          ? { backgroundColor: "#e8f5e9" }
                          : sel
                          ? { backgroundColor: "#e3f2fd" }
                          : {}
                        }
                        className={cn(
                          "flex items-start gap-1.5 p-1.5 rounded",
                          sel ? (isResumido ? "ring-1 ring-[#1976d2]" : "ring-1 ring-emerald-500") : ""
                        )}
                      >
                        <div className={cn(
                          "size-3 rounded-full border-2 shrink-0 flex items-center justify-center mt-0.5",
                          sel
                            ? (isResumido ? "border-[#1976d2]" : "border-emerald-600")
                            : "border-slate-300"
                        )}>
                          {sel && (
                            <div className={cn(
                              "size-1.5 rounded-full",
                              isResumido ? "bg-[#1976d2]" : "bg-emerald-600"
                            )} />
                          )}
                        </div>
                        <span className={cn(
                          "text-[9px] leading-tight",
                          sel
                            ? (isResumido ? "text-[#1565c0] font-bold" : "text-emerald-800 font-bold")
                            : "text-slate-600"
                        )}>
                          {label}
                        </span>
                      </motion.div>
                    );
                  })}
                </div>
                {/* Forma de agrupar (only visible for detallado) */}
                {!isResumido && (
                  <div className="grid grid-cols-3 gap-1 mb-3 opacity-90">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i}>
                        <p className="text-[7px] text-slate-400 mb-0.5">Forma de Agrupar</p>
                        <div className="flex items-center border border-slate-200 rounded px-1 py-0.5 text-[7px] text-slate-500 bg-white">
                          SELECCIONE... <ChevronDown size={6} className="ml-auto text-slate-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {isResumido && (
                  <div className="grid grid-cols-3 gap-1 mb-3 opacity-40 pointer-events-none">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i}>
                        <p className="text-[7px] text-slate-400 mb-0.5">Forma de Agrupar</p>
                        <div className="flex items-center border border-slate-200 rounded px-1 py-0.5 text-[7px] text-slate-400 bg-slate-50">
                          SELECCIONE... <ChevronDown size={6} className="ml-auto" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Buttons */}
                <div className="flex gap-2">
                  <motion.button
                    animate={{ boxShadow: ["0 0 0 0px rgba(25,118,210,0.4)", "0 0 0 3px rgba(25,118,210,0.25)", "0 0 0 0px rgba(25,118,210,0.4)"] }}
                    transition={{ duration: 1.6, repeat: Infinity }}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1 rounded text-[9px] font-bold text-white",
                      isResumido ? "bg-[#1976d2]" : "bg-emerald-600"
                    )}
                  >
                    <Download size={9} />
                    Exportar
                  </motion.button>
                  <button className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-medium text-slate-500 border border-slate-300">
                    × Cancelar
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Animated cursor */}
      <CursorDot source="chess" highlight={highlight} />
    </div>
  );
}

// ── SIGO / Nextbyn Mockup ─────────────────────────────────────────────────────

function SigoMockup({ highlight }: { highlight: string }) {
  const isLogin   = highlight === "sigo-login";
  const isEntorno = highlight === "sigo-entorno";
  const isAplicar = highlight === "sigo-aplicar";
  const isExport  = highlight === "sigo-export";

  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-200 shadow-lg text-[10px] select-none" style={{ minHeight: 220 }}>

      {/* ── Login view ── */}
      <AnimatePresence mode="wait">
        {isLogin && (
          <motion.div
            key="sigo-login"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex"
            style={{ background: "linear-gradient(135deg, #f5f0eb 0%, #e8ddd4 50%, #f0ece8 100%)" }}
          >
            {/* Left photo silhouette */}
            <div className="w-1/5 bg-gradient-to-b from-slate-300/30 to-slate-400/20" />

            {/* Login card */}
            <div className="mx-auto my-auto bg-white rounded-xl shadow-xl p-4" style={{ width: 160 }}>
              <p className="text-[13px] font-black text-slate-800 mb-0.5">Bienvenido.</p>
              <p className="text-[8px] text-slate-400 mb-2.5">Iniciar sesión tu cuenta</p>
              <div className="space-y-1.5 mb-2">
                <div>
                  <p className="text-[8px] text-slate-500 mb-0.5">Usuario</p>
                  <div className="border-b border-slate-300 py-0.5 text-[9px] text-slate-600">Ingresá tu usuario</div>
                </div>
                <div>
                  <p className="text-[8px] text-slate-500 mb-0.5">Password</p>
                  <div className="border-b border-slate-300 py-0.5 text-[9px] text-slate-400">Ingresá tu password</div>
                </div>
              </div>
              <div className="flex items-center gap-1 mb-2">
                <div className="size-2.5 border border-slate-300 rounded-sm" />
                <span className="text-[8px] text-slate-500">Mantener conectado</span>
              </div>
              <motion.div
                animate={{ boxShadow: ["0 0 0 0px rgba(217,110,60,0.4)", "0 0 0 4px rgba(217,110,60,0.2)", "0 0 0 0px rgba(217,110,60,0.4)"] }}
                transition={{ duration: 1.8, repeat: Infinity }}
                className="w-full py-1.5 rounded-lg text-center text-[10px] font-bold text-white"
                style={{ background: "linear-gradient(135deg, #e07840 0%, #d4652a 100%)" }}
              >
                Ingresar
              </motion.div>
            </div>

            {/* Right marketing panel */}
            <div className="w-2/5 flex items-center justify-center" style={{ background: "linear-gradient(135deg, #e8ddd4 0%, #d4c4b4 100%)" }}>
              <div className="text-center">
                <p className="text-[13px] font-black text-slate-700">Vendo</p>
                <p className="text-[8px] text-slate-500 max-w-[90px] leading-relaxed">
                  Toma de pedidos, stock en línea, acciones comerciales
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── SIGO page views ── */}
        {!isLogin && (
          <motion.div
            key="sigo-page"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col"
            style={{ background: "#f0f0f0" }}
          >
            {/* ASP.NET master page top bar */}
            <div className="flex items-center gap-2 px-3 py-1 bg-white border-b border-slate-200 shadow-sm">
              <div className="flex items-center gap-1">
                <div className="size-4 rounded bg-[#e07840] flex items-center justify-center">
                  <span className="text-white font-black text-[7px]">N</span>
                </div>
                <span className="font-black text-[9px] text-slate-700">Nextbyn</span>
              </div>
              <span className="text-[8px] text-slate-400 ml-2">portal.nextbyn.com / sigo.aspx</span>
              <span className="ml-auto text-[8px] font-bold text-[#e07840]">SIGO — Mapa de Seguimiento</span>
            </div>

            {/* Page body */}
            <div className="flex-1 relative overflow-hidden bg-[#e8e8e8] p-2">
              {/* Main buttons row */}
              <div className="flex items-center gap-2 mb-2">
                <motion.div
                  animate={isExport ? { backgroundColor: "#c5e8c5", borderColor: "#4caf50" } : { backgroundColor: "#d0e4f0", borderColor: "#2196f3" }}
                  className="flex items-center gap-1 border rounded px-2 py-1 text-[9px] font-bold cursor-pointer transition-all"
                  style={{ borderColor: "#2196f3", color: "#0d47a1" }}
                >
                  <FileSpreadsheet size={10} className="text-[#2196f3]" />
                  Puntos de venta
                </motion.div>
                <div className="flex items-center gap-1 border border-[#2196f3] bg-[#d0e4f0] rounded px-2 py-1 text-[9px] font-bold text-[#0d47a1]">
                  Ventas fuera de ruta
                </div>
                <div className="ml-auto flex items-center gap-1 border border-[#e07840] bg-[#fde8d8] rounded px-2 py-1 text-[9px] font-bold text-[#c4622a]">
                  Entorno de trabajo
                </div>
              </div>

              {/* Map placeholder */}
              <div className="rounded border border-slate-300 bg-slate-200 flex items-center justify-center" style={{ height: 80 }}>
                <p className="text-[9px] text-slate-400">[ Mapa de puntos de venta ]</p>
              </div>
            </div>

            {/* Entorno popup */}
            <AnimatePresence>
              {(isEntorno || isAplicar) && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute inset-0 bg-black/20 flex items-center justify-center z-10"
                >
                  <div className="bg-white border border-[#2196f3] rounded shadow-xl overflow-hidden" style={{ width: 220 }}>
                    {/* DevExpress popup header */}
                    <div className="flex items-center justify-between px-3 py-1.5 bg-[#1976d2]">
                      <span className="text-white text-[9px] font-bold">Entorno de trabajo</span>
                      <span className="text-white/80 text-[9px]">✕</span>
                    </div>
                    <div className="p-3 space-y-2">
                      {/* Sucursal combobox */}
                      <div>
                        <p className="text-[8px] text-slate-500 mb-0.5">Sucursal</p>
                        <motion.div
                          animate={isEntorno
                            ? { borderColor: "#1976d2", backgroundColor: "#e3f2fd" }
                            : { borderColor: "#e2e8f0", backgroundColor: "#ffffff" }
                          }
                          className="flex items-center border rounded px-1.5 py-1 text-[9px] transition-all"
                        >
                          <span className={isEntorno ? "text-[#1565c0] font-bold" : "text-slate-500"}>
                            {isEntorno ? "CASA CENTRAL" : "SELECCIONE..."}
                          </span>
                          <div className="ml-auto flex gap-0.5">
                            <div className={cn("w-3 h-full flex items-center justify-center text-[7px]", isEntorno ? "text-[#1976d2]" : "text-slate-400")}>▼</div>
                          </div>
                        </motion.div>
                      </div>
                      {/* Fecha */}
                      <div>
                        <p className="text-[8px] text-slate-500 mb-0.5">Fecha</p>
                        <motion.div
                          animate={isAplicar
                            ? { borderColor: "#1976d2", backgroundColor: "#e3f2fd" }
                            : { borderColor: "#e2e8f0", backgroundColor: "#ffffff" }
                          }
                          className="flex items-center border rounded px-1.5 py-1 text-[9px] transition-all"
                        >
                          <span className={isAplicar ? "text-[#1565c0] font-bold" : "text-slate-400"}>
                            {isAplicar ? "30/4/2026" : "D/M/AAAA"}
                          </span>
                          <span className="ml-auto text-[7px] text-slate-400">📅</span>
                        </motion.div>
                      </div>
                      {/* Aplicar button */}
                      <motion.button
                        animate={isAplicar
                          ? { boxShadow: "0 0 0 3px rgba(25,118,210,0.35)", scale: 1.04 }
                          : { boxShadow: "0 0 0 0px rgba(25,118,210,0)", scale: 1 }
                        }
                        className="w-full py-1 bg-[#1976d2] text-white text-[9px] font-bold rounded"
                      >
                        Aplicar
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* PDV popup (export step) */}
            <AnimatePresence>
              {isExport && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute inset-0 bg-black/20 flex items-center justify-center z-10"
                >
                  <div className="bg-white border border-[#2196f3] rounded shadow-xl overflow-hidden" style={{ width: 200 }}>
                    <div className="flex items-center justify-between px-3 py-1.5 bg-[#1976d2]">
                      <span className="text-white text-[9px] font-bold">Puntos de venta</span>
                      <span className="text-white/80 text-[9px]">✕</span>
                    </div>
                    <div className="p-3 space-y-2">
                      <div className="flex items-center gap-1 text-[8px] text-slate-500">
                        <span>Desde</span>
                        <div className="border border-slate-200 rounded px-1 py-0.5 text-slate-600">30/4/2026</div>
                        <span>Hasta</span>
                        <div className="border border-slate-200 rounded px-1 py-0.5 text-slate-600">30/4/2026</div>
                      </div>
                      <motion.button
                        animate={{ boxShadow: ["0 0 0 0px rgba(76,175,80,0.4)", "0 0 0 4px rgba(76,175,80,0.2)", "0 0 0 0px rgba(76,175,80,0.4)"] }}
                        transition={{ duration: 1.6, repeat: Infinity }}
                        className="w-full flex items-center justify-center gap-1 py-1.5 bg-[#388e3c] text-white text-[9px] font-bold rounded"
                      >
                        <FileSpreadsheet size={9} />
                        Exportar a XLS
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Animated cursor */}
      <CursorDot source="sigo" highlight={highlight} />
    </div>
  );
}

// ── Animated cursor ───────────────────────────────────────────────────────────

const CURSOR_POS: Record<string, { x: string; y: string }> = {
  // CHESS
  "login":          { x: "48%",  y: "72%" },
  "filters":        { x: "72%",  y: "52px" },
  "procesar":       { x: "92%",  y: "52px" },
  "modal-resumido": { x: "44%",  y: "52%" },
  "modal-detallado":{ x: "44%",  y: "58%" },
  // SIGO
  "sigo-login":     { x: "48%",  y: "75%" },
  "sigo-entorno":   { x: "50%",  y: "52%" },
  "sigo-aplicar":   { x: "50%",  y: "62%" },
  "sigo-export":    { x: "50%",  y: "60%" },
};

function CursorDot({ highlight, source }: { highlight: string; source: "chess" | "sigo" }) {
  const pos = CURSOR_POS[highlight];
  if (!pos) return null;
  return (
    <motion.div
      key={highlight}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="absolute z-50 pointer-events-none"
      style={{ left: pos.x, top: pos.y, transform: "translate(-50%, -50%)" }}
    >
      <MousePointer2
        size={14}
        className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] fill-white text-slate-900"
      />
      <motion.div
        animate={{ scale: [1, 2.2, 1], opacity: [0.5, 0, 0.5] }}
        transition={{ duration: 1.5, repeat: Infinity }}
        className="absolute inset-0 -m-0.5 rounded-full bg-white/30"
      />
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
  const guide  = GUIDES[source];
  const Icon   = guide.icon;
  const steps  = guide.steps;

  const [animStep, setAnimStep] = useState(0);

  useEffect(() => {
    setAnimStep(0);
    const iv = setInterval(() => {
      setAnimStep((s) => (s + 1) % steps.length);
    }, 2800);
    return () => clearInterval(iv);
  }, [source, steps.length]);

  const currentStep = steps[animStep];
  const isSigo = source === "sigo";
  const isResumido = source === "comprobantes";

  return (
    <div className="flex flex-col gap-5 max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-xl font-black text-[var(--shelfy-text)] tracking-tight mb-1">
          Cómo descargar el archivo
        </h2>
        <p className="text-sm text-[var(--shelfy-muted)]">
          Simulación paso a paso del sistema{" "}
          <span className="font-semibold text-[var(--shelfy-text)]">{guide.sistema}</span>
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
        <div className="flex items-center gap-3.5 px-5 py-3.5 border-b border-[var(--shelfy-border)]">
          <div className={cn("size-9 rounded-xl flex items-center justify-center shrink-0", guide.iconBg)}>
            <Icon size={18} className={guide.iconColor} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider">Sistema</p>
            <p className="text-[14px] font-black text-[var(--shelfy-text)] leading-tight">{guide.sistema}</p>
          </div>
          <span className={cn("text-[11px] font-bold px-3 py-1 rounded-full border shrink-0", guide.badgeClass)}>
            {guide.badge}
          </span>
        </div>

        {/* Mockup */}
        <div className="px-5 pt-4">
          <AnimatePresence mode="wait">
            <motion.div key={source} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {isSigo
                ? <SigoMockup highlight={currentStep.highlight} />
                : <ChessMockup highlight={currentStep.highlight} isResumido={isResumido} />
              }
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
                    : "size-2 bg-[var(--shelfy-border)] hover:bg-[var(--shelfy-muted)]/40"
                )}
              />
            ))}
            <span className="ml-auto text-[10px] text-[var(--shelfy-muted)] font-medium">
              {animStep + 1}/{steps.length}
            </span>
          </div>

          {/* Current step */}
          <AnimatePresence mode="wait">
            <motion.div
              key={animStep}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="flex items-start gap-3"
            >
              <div className={cn(
                "size-6 rounded-full flex items-center justify-center text-[11px] font-black shrink-0 mt-0.5",
                guide.iconBg, guide.iconColor
              )}>
                {animStep + 1}
              </div>
              <div>
                <p className="text-[13px] font-bold text-[var(--shelfy-text)] mb-0.5">{currentStep.label}</p>
                <p className="text-[12px] text-[var(--shelfy-muted)] leading-relaxed">{currentStep.description}</p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Warning */}
        <div className="mx-5 mb-5 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[12px] text-amber-700 font-medium leading-relaxed">{guide.advertencia}</p>
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
