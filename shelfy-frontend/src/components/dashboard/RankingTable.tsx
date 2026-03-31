import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Award, FileText, Download, Loader2, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import {
  type VendedorRanking,
  type SucursalStats,
  type KPIs,
  type EvolucionTiempo,
} from '@/lib/api';
import { generateRankingHTML, reportFileName } from '@/lib/generateRankingHTML';
import { useReportStore } from '@/store/useReportStore';

interface RankingTableProps {
  ranking: VendedorRanking[];
  periodo: string;
  periodoLabel?: string;
  sucursalFiltro: string;
  sucursales: SucursalStats[];
  // New props for report generation
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

  // Whether the saved report belongs to the current dist + periodo
  const hasSavedReport =
    savedReport !== null &&
    savedReport.distId === distId &&
    savedReport.periodo === periodo;

  function handleGenerateReport() {
    if (!kpis) return;
    setGenerating(true);

    // Use setTimeout to let React flush the generating state before the sync work
    setTimeout(() => {
      try {
        const label = periodoLabel ?? periodo;
        const html = generateRankingHTML({
          distId,
          nombreEmpresa,
          periodo,
          periodoLabel: label,
          ranking,
          kpis,
          evolucion,
          sucursales,
        });

        saveReport({
          distId,
          nombreEmpresa,
          periodo,
          html,
          generadoEn: new Date().toISOString(),
        });

        downloadHTML(html, reportFileName(nombreEmpresa, periodo));
      } finally {
        setGenerating(false);
      }
    }, 20);
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

  // Top 15 solamente
  const top15 = ranking.slice(0, 15);

  return (
    <Card className="border-slate-200/60 shadow-xl overflow-hidden flex flex-col h-full bg-white relative rounded-[2rem]">
      {/* Luz decorativa en la parte superior del ranking */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-400 via-yellow-200 to-amber-400 z-20" />

      <div className="p-8 border-b border-slate-50 flex items-center justify-between sticky top-0 bg-white/80 backdrop-blur-xl z-20 gap-4">
        <div className="shrink-0">
          <div className="flex items-center gap-3">
            <h3 className="text-slate-900 font-black text-2xl tracking-tighter">
              Ranking en Vivo
            </h3>
            <div className="bg-amber-100/50 p-1 rounded-lg">
              <Star className="text-amber-500 fill-amber-500 animate-pulse" size={18} />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-1.5 opacity-70">Líderes de rendimiento</p>
        </div>

        {/* ── Report buttons ── */}
        <div className="flex items-center gap-2 ml-auto">
          {sizeWarning && (
            <span className="text-[9px] font-black text-amber-600 uppercase tracking-wider">
              Informe demasiado grande (+ 2 MB)
              <button
                onClick={clearSizeWarning}
                className="ml-1 underline opacity-70 hover:opacity-100"
              >
                OK
              </button>
            </span>
          )}

          {hasSavedReport ? (
            <>
              {/* Update button */}
              <button
                onClick={handleGenerateReport}
                disabled={generating || !kpis}
                className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-violet-600 bg-violet-50 hover:bg-violet-100 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-2 rounded-xl border border-violet-200/60 transition-colors"
                title="Regenerar informe con datos actuales"
              >
                {generating ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <RefreshCw size={12} />
                )}
                Actualizar
              </button>
              {/* Download last button */}
              <button
                onClick={handleDownloadSaved}
                className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl border border-slate-200/60 transition-colors"
                title={`Descargar informe guardado (${savedReport?.generadoEn ? new Date(savedReport.generadoEn).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''})`}
              >
                <Download size={12} />
                Descargar último
              </button>
            </>
          ) : (
            <button
              onClick={handleGenerateReport}
              disabled={generating || !kpis}
              className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 rounded-xl shadow-sm transition-colors"
              title="Generar informe HTML del período actual"
            >
              {generating ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <FileText size={12} />
              )}
              Generar Informe
            </button>
          )}
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

      <div className="overflow-x-auto flex-1 custom-scrollbar px-4 pb-6">
        <table className="w-full text-sm border-separate border-spacing-y-2">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="text-left">
              <th className="py-4 px-4 font-black uppercase tracking-[0.2em] text-[9px] text-slate-400 w-20">Pos</th>
              <th className="py-4 px-2 font-black uppercase tracking-[0.2em] text-[9px] text-slate-400">Integrante</th>
              <th className="py-4 px-2 text-right font-black uppercase tracking-[0.2em] text-[9px] text-emerald-500">Aprob</th>
              <th className="py-4 px-6 text-right font-black uppercase tracking-[0.2em] text-[9px] text-slate-900">Puntos</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {top15.map((v, i) => (
                <motion.tr
                  key={`${v.vendedor}-${v.sucursal}-${i}`}
                  layout
                  initial={{ opacity: 0, y: 15 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    scale: i === 0 ? 1.01 : 1,
                    zIndex: 15 - i
                  }}
                  whileHover={{ x: 5, backgroundColor: "rgba(248, 250, 252, 0.8)", transition: { duration: 0.2 } }}
                  className={`
                    relative group shadow-sm rounded-2xl overflow-hidden transition-all
                    ${i === 0 ? "bg-gradient-to-r from-amber-50/50 to-white border-2 border-amber-100" :
                      i === 1 ? "bg-slate-50/30" :
                        i === 2 ? "bg-orange-50/30" : "bg-white border border-slate-100/50"}
                  `}
                >
                  <td className="py-4 px-4 first:rounded-l-2xl">
                    <div className={`w-9 h-9 flex items-center justify-center text-[13px] font-black rounded-xl shadow-md transition-all group-hover:scale-110 ${
                      i === 0 ? "bg-amber-400 text-amber-950 shadow-amber-200/50" :
                      i === 1 ? "bg-slate-300 text-slate-800 shadow-slate-200/50" :
                      i === 2 ? "bg-orange-300 text-orange-950 shadow-orange-200/50" :
                      "bg-slate-100 text-slate-500 shadow-sm"
                    }`}>
                      {i + 1}
                    </div>
                  </td>
                  <td className="py-4 px-2">
                    <div className="flex flex-col">
                      <span className={`font-black text-[15px] tracking-tight ${i < 3 ? "text-slate-900" : "text-slate-700"}`}>
                        {v.vendedor}
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        {i < 3 && (
                          <span className="text-[9px] uppercase font-black tracking-widest text-slate-400/80">
                            {i === 0 ? "👑 Platinum" : i === 1 ? "🥈 Gold" : "🥉 Silver"}
                          </span>
                        )}
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider opacity-60">
                          {v.sucursal || "General"}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-2 text-right">
                    <span className="inline-flex items-center justify-center bg-emerald-100/50 text-emerald-700 text-[11px] font-black px-3 py-1 rounded-full border border-emerald-200/30">
                      {v.aprobadas}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-right last:rounded-r-2xl">
                    <div className="flex flex-col items-end">
                      <span className={`font-black text-xl tracking-tighter ${i < 3 ? "text-slate-950" : "text-slate-800"}`}>
                        {v.puntos}
                      </span>
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest -mt-1">Puntos</span>
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
