"use client";

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Award, FileText, Download, Loader2, RefreshCw, MoreHorizontal } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/Button';
import { fetchRanking, fetchRankingHistorico } from '@/lib/api';
import type {
  VendedorRanking,
  SucursalStats,
  KPIs,
  EvolucionTiempo,
} from '@/lib/api';
import { generateRankingHTML, reportFileName } from '@/lib/generateRankingHTML';
import { useReportStore } from '@/store/useReportStore';
import { cn } from '@/lib/utils';

interface RankingTableProps {
  ranking: VendedorRanking[];
  periodo: string;
  periodoLabel?: string;
  sucursalFiltro: string;
  sucursales: SucursalStats[];
  kpis?: KPIs | null;
  evolucion?: EvolucionTiempo[];
  distId?: number;
  nombreEmpresa?: string;
}

// ── Download helper ────────────────────────────────────────────────────────────

function downloadHTML(html: string, filename: string) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

// ── Iniciales helper ───────────────────────────────────────────────────────────
function getInitials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ── Component ──────────────────────────────────────────────────────────────────

export function RankingTable({
  ranking,
  periodo,
  periodoLabel,
  sucursalFiltro,
  sucursales,
  kpis,
  evolucion = [],
  distId = 0,
  nombreEmpresa = 'Distribuidora',
}: RankingTableProps) {
  const { savedReport, generating, sizeWarning, setGenerating, saveReport, clearSizeWarning } =
    useReportStore();

  const sucursalLabel = sucursalFiltro
    ? (sucursales.find((s) => s.location_id === sucursalFiltro)?.sucursal ?? sucursalFiltro)
    : null;

  const hasSavedReport =
    savedReport !== null &&
    savedReport.distId === distId &&
    savedReport.periodo === periodo;

  // Mejora #19: Barra de progreso relativa
  const maxPuntos = ranking[0]?.puntos ?? 1;

  async function handleGenerateReport() {
    if (!kpis || !distId) return;
    setGenerating(true);
    try {
      const label = periodoLabel ?? periodo;
      const [fullRanking, historico] = await Promise.all([
        fetchRanking(distId, periodo, sucursalFiltro || undefined, 999),
        fetchRankingHistorico(distId),
      ]);
      const html = generateRankingHTML({
        distId, nombreEmpresa, periodo, periodoLabel: label,
        ranking: fullRanking, kpis, evolucion, sucursales,
        rankingHistorico: historico,
      });
      saveReport({ distId, nombreEmpresa, periodo, html, generadoEn: new Date().toISOString() });
      downloadHTML(html, reportFileName(nombreEmpresa, periodo));
    } finally {
      setGenerating(false);
    }
  }

  async function handlePrintReport() {
    if (!kpis || !distId) return;
    const label = periodoLabel ?? periodo;
    const [fullRanking, historico] = await Promise.all([
      fetchRanking(distId, periodo, sucursalFiltro || undefined, 999),
      fetchRankingHistorico(distId),
    ]);
    const html = generateRankingHTML({
      distId, nombreEmpresa, periodo, periodoLabel: label,
      ranking: fullRanking, kpis, evolucion, sucursales,
      rankingHistorico: historico,
    });
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 300); }
  }

  function handleDownloadSaved() {
    if (!savedReport) return;
    downloadHTML(savedReport.html, reportFileName(savedReport.nombreEmpresa, savedReport.periodo));
  }

  if (ranking.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center p-12 border-slate-200 border-dashed border-2 h-full bg-slate-50/50 rounded-[2rem]">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
          <Award className="text-slate-300" size={32} />
        </div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-center">No hay actividad para el ranking todavía</p>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200/60 shadow-xl overflow-hidden flex flex-col h-full bg-white relative rounded-[2rem]">
      {/* Mejora #20: Barra superior violet */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-violet-500 via-indigo-400 to-violet-500 z-20" />

      {/* Mejora #22: shadow-sm permanente en thead header */}
      <div className="p-8 border-b border-slate-50 flex items-center justify-between sticky top-0 bg-white/80 backdrop-blur-xl z-20 gap-4 shadow-sm">
        <div className="shrink-0">
          <div className="flex items-center gap-3">
            <h3 className="text-slate-900 font-black text-2xl tracking-tighter">
              Ranking en Vivo
            </h3>
            <div className="bg-violet-100/50 p-1 rounded-lg">
              <Star className="text-violet-500 fill-violet-500 animate-pulse" size={18} />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-1.5 opacity-70">Líderes de rendimiento</p>
        </div>

        {/* Mejora #21: Botones de reporte consolidados — Generar + DropdownMenu */}
        <div className="flex items-center gap-2 ml-auto">
          {sizeWarning && (
            <span className="text-[9px] font-black text-amber-600 uppercase tracking-wider">
              Informe demasiado grande (+ 2 MB)
              <button onClick={clearSizeWarning} className="ml-1 underline opacity-70 hover:opacity-100">OK</button>
            </span>
          )}

          {/* Botón principal Generar */}
          <Button
            size="sm"
            onClick={handleGenerateReport}
            disabled={generating || !kpis}
            className="text-[10px] font-black uppercase tracking-wider bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-xl h-auto"
          >
            {generating ? <Loader2 size={12} className="animate-spin mr-1.5" /> : <FileText size={12} className="mr-1.5" />}
            {hasSavedReport ? "Actualizar" : "Generar"}
          </Button>

          {/* DropdownMenu con opciones extra */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8 rounded-xl border-slate-200">
                <MoreHorizontal size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl shadow-xl border-slate-100 text-[11px]">
              {hasSavedReport && (
                <DropdownMenuItem
                  onClick={handleDownloadSaved}
                  className="font-black uppercase tracking-wider text-[10px] cursor-pointer"
                >
                  <Download size={12} className="mr-2" />
                  Descargar último
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={handlePrintReport}
                disabled={!kpis}
                className="font-black uppercase tracking-wider text-[10px] cursor-pointer"
              >
                <FileText size={12} className="mr-2" />
                Imprimir PDF
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleGenerateReport}
                disabled={generating || !kpis}
                className="font-black uppercase tracking-wider text-[10px] cursor-pointer"
              >
                <RefreshCw size={12} className="mr-2" />
                Actualizar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {sucursalLabel && (
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="shrink-0 text-[10px] font-black tracking-[0.15em] uppercase text-blue-600 bg-blue-50/50 px-4 py-2 rounded-2xl border border-blue-100/50 shadow-sm"
          >
            {sucursalLabel}
          </motion.span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-6 pb-8 max-h-[580px]">
        <table className="w-full text-sm border-separate border-spacing-y-2">
          {/* Mejora #22: border-b + shadow-sm en thead sticky */}
          <thead className="sticky top-0 bg-white/95 backdrop-blur-md z-30 border-b border-slate-100 shadow-sm">
            <tr className="text-left">
              <th className="py-4 px-4 font-black uppercase tracking-[0.2em] text-[9px] text-slate-400 w-16">Pos</th>
              <th className="py-4 px-2 font-black uppercase tracking-[0.2em] text-[9px] text-slate-400">Integrante</th>
              <th className="py-4 px-2 text-right font-black uppercase tracking-[0.2em] text-[9px] text-emerald-500">Aprob</th>
              <th className="py-4 px-2 text-right font-black uppercase tracking-[0.2em] text-[9px] text-amber-500">Dest</th>
              <th className="py-4 px-6 text-right font-black uppercase tracking-[0.2em] text-[9px] text-slate-950">Puntos</th>
            </tr>
          </thead>
          <tbody className="z-10">
            <AnimatePresence initial={false}>
              {ranking.slice(0, 20).map((v, i) => (
                <motion.tr
                  key={`${v.vendedor}-${v.sucursal}-${i}`}
                  layout
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0, scale: i === 0 ? 1.01 : 1, zIndex: 20 - i }}
                  whileHover={{ x: 5, backgroundColor: "rgba(248, 250, 252, 0.9)", transition: { duration: 0.2 } }}
                  className={cn(
                    "relative group shadow-sm rounded-2xl overflow-hidden transition-all",
                    i === 0 ? "bg-gradient-to-r from-violet-50/60 to-white border-2 border-violet-100/50" :
                    i === 1 ? "bg-slate-50/40" :
                    i === 2 ? "bg-indigo-50/40" :
                    "bg-white border border-slate-100/50"
                  )}
                >
                  <td className="py-3 px-4 first:rounded-l-2xl">
                    <div className={cn(
                      "w-8 h-8 flex items-center justify-center text-[12px] font-black rounded-xl shadow-md transition-all group-hover:scale-110",
                      i === 0 ? "bg-violet-500 text-white shadow-violet-200/50" :
                      i === 1 ? "bg-slate-300 text-slate-800 shadow-slate-200/50" :
                      i === 2 ? "bg-indigo-300 text-indigo-950 shadow-indigo-200/50" :
                      "bg-slate-100 text-slate-500 shadow-sm"
                    )}>
                      {i + 1}
                    </div>
                  </td>
                  <td className="py-3 px-2">
                    <div className="flex items-start gap-2">
                      {/* Mejora #18: Avatar con iniciales */}
                      <Avatar className="size-7 rounded-lg shrink-0">
                        <AvatarFallback className={cn(
                          "rounded-lg text-[10px] font-black",
                          i === 0 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
                        )}>
                          {getInitials(v.vendedor)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex flex-col flex-1 min-w-0">
                        <span className={cn(
                          "font-black text-[14px] tracking-tight truncate max-w-[120px]",
                          i < 3 ? "text-slate-900" : "text-slate-700"
                        )}>
                          {v.vendedor}
                        </span>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider opacity-60">
                          {v.sucursal || "General"}
                        </span>
                        {/* Mejora #19: Barra de progreso relativa */}
                        <div className="h-0.5 rounded-full bg-slate-100 mt-1 w-full">
                          <div
                            className="h-0.5 rounded-full bg-violet-400 transition-all duration-700"
                            style={{ width: `${(v.puntos / maxPuntos) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-2 text-right">
                    <span className="inline-flex items-center justify-center bg-emerald-50 text-emerald-600 text-[10px] font-black px-2 py-0.5 rounded-lg border border-emerald-100/50">
                      {v.aprobadas}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-right">
                    <span className="inline-flex items-center justify-center bg-amber-50 text-amber-600 text-[10px] font-black px-2 py-0.5 rounded-lg border border-amber-100/50">
                      {v.destacadas || 0}
                    </span>
                  </td>
                  <td className="py-3 px-6 text-right last:rounded-r-2xl">
                    <div className="flex flex-col items-end">
                      <span className={cn("font-black text-lg tracking-tighter", i < 3 ? "text-slate-950" : "text-slate-800")}>
                        {v.puntos}
                      </span>
                      <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest -mt-1">Pts</span>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </Card>
  );
}
