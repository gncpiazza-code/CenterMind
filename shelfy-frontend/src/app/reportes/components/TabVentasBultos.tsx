"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { PageSpinner } from "@/components/ui/Spinner";
import { Package, Search, Download, ChevronRight, UploadCloud, Check, AlertTriangle } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/Button";
import { uploadERPFile, fetchVentasBultos } from "@/lib/api";
import { reportesKeys } from "@/lib/query-keys";

interface VentasBultosItem {
  cliente_erp_id: string;
  cliente_nombre: string;
  canal: string;
  subcanal: string;
  vendedor: string;
  sucursal: string;
  articulo_codigo_desc: string;
  total_bultos: number;
  promedio_semanal: number;
}

export default function TabVentasBultos({ distId, desde, hasta }: { distId: number, desde: string, hasta: string }) {
  const queryClient = useQueryClient();
  const [proveedor, setProveedor] = useState("");
  const [uploadResult, setUploadResult] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const { data = [], isLoading } = useQuery<VentasBultosItem[]>({
    queryKey: reportesKeys.ventasBultos(distId, desde, hasta, proveedor),
    queryFn: () => fetchVentasBultos(distId, desde, hasta, proveedor || undefined),
    enabled: !!distId,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadERPFile("ventas", file),
    onSuccess: (res) => {
      setUploadResult({ msg: `Éxito: ${res.count} registros.`, type: "ok" });
      queryClient.invalidateQueries({ queryKey: ['reportes', 'ventas-bultos', distId] });
    },
    onError: (err: any) => {
      setUploadResult({ msg: err.message || "Error al subir", type: "err" });
    },
  });

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadResult(null);
    uploadMutation.mutate(file);
  };

  const highVolumePDVs = useMemo(() => {
    const map: Record<string, { nombre: string, total: number, promedio: number, canal: string }> = {};
    data.forEach(d => {
      if (!map[d.cliente_erp_id]) {
        map[d.cliente_erp_id] = { nombre: d.cliente_nombre, total: 0, promedio: 0, canal: d.canal };
      }
      map[d.cliente_erp_id].total += Number(d.total_bultos);
      map[d.cliente_erp_id].promedio += Number(d.promedio_semanal);
    });
    return Object.entries(map)
      .map(([id, val]) => ({ id, ...val }))
      .filter(v => v.promedio >= 2.5)
      .sort((a, b) => b.promedio - a.promedio);
  }, [data]);

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bultos Detalle");
    XLSX.writeFile(wb, `Analisis_Bultos_${proveedor || "Global"}_${desde}_${hasta}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold text-[var(--shelfy-text)]">Análisis de Bultos por Cliente</h2>
          <p className="text-xs text-[var(--shelfy-muted)]">Cálculo de volumen y promedio semanal por fabricante.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {uploadResult && (
            <div className={`px-2 py-1 rounded-lg text-[9px] font-bold border flex items-center gap-2 animate-in fade-in duration-300 ${
              uploadResult.type === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-rose-50 border-rose-200 text-rose-700"
            }`}>
              {uploadResult.type === "ok" ? <Check size={10} /> : <AlertTriangle size={10} />}
              {uploadResult.msg}
            </div>
          )}

          <div className="relative group">
            <input
              type="file"
              accept=".xlsx"
              onChange={handleUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              disabled={uploadMutation.isPending}
            />
            <Button
              size="sm"
              variant="outline"
              loading={uploadMutation.isPending}
              className="flex items-center gap-2 bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm whitespace-nowrap"
            >
              <UploadCloud size={14} />
              Subir Ventas
            </Button>
          </div>

          <div className="relative flex-1 md:w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--shelfy-muted)]" size={14} />
            <input
              type="text"
              placeholder="Proveedor..."
              value={proveedor}
              onChange={(e) => setProveedor(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] rounded-xl text-xs focus:border-[var(--shelfy-primary)] outline-none transition-all"
            />
          </div>
          <button
            onClick={handleExport}
            className="p-1.5 bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-xl text-[var(--shelfy-text)] hover:bg-[var(--shelfy-panel)] transition-colors"
            title="Exportar Detalle Excel"
          >
            <Download size={18} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-20"><PageSpinner /></div>
      ) : (
        <>
          {highVolumePDVs.length > 0 && (
            <Card className="p-4 border-l-4 border-l-emerald-500 bg-emerald-50">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
                  <Package size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-emerald-900">Se detectaron {highVolumePDVs.length} Clientes de Alto Volumen</h3>
                  <p className="text-[10px] text-emerald-700 mt-0.5">Estos PDV superan el promedio de 2.5 bultos semanales para el proveedor seleccionado.</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {highVolumePDVs.slice(0, 4).map(v => (
                  <div key={v.id} className="bg-white/50 p-2 rounded-lg border border-emerald-100 flex justify-between items-center">
                    <div className="truncate pr-2">
                       <p className="text-[10px] font-bold text-slate-800 truncate">{v.nombre}</p>
                       <p className="text-[9px] text-slate-500">{v.canal}</p>
                    </div>
                    <div className="text-right">
                       <p className="text-xs font-black text-emerald-600">{v.promedio.toFixed(1)}</p>
                       <p className="text-[8px] font-bold text-emerald-400 uppercase">B/Sem</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <Card className="xl:col-span-2 p-0 overflow-hidden">
               <div className="p-4 border-b border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] flex justify-between items-center">
                  <h3 className="text-sm font-bold text-[var(--shelfy-text)] uppercase tracking-wider">Desglose por Artículo</h3>
                  <span className="text-[10px] font-bold text-[var(--shelfy-muted)] bg-[var(--shelfy-panel)] px-2 py-0.5 rounded-full">
                    {data.length} registros
                  </span>
               </div>
               <div className="overflow-auto max-h-[600px]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-[var(--shelfy-panel)] text-[var(--shelfy-muted)] text-[10px] uppercase font-black border-b border-[var(--shelfy-border)] z-10">
                      <tr>
                        <th className="px-4 py-3 text-left">Cliente</th>
                        <th className="px-4 py-3 text-left">Artículo</th>
                        <th className="px-4 py-3 text-center">Bultos</th>
                        <th className="px-4 py-3 text-right">Prom. Sem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--shelfy-border)]">
                      {data.map((item, i) => (
                        <tr key={i} className="hover:bg-[var(--shelfy-bg)] transition-colors group">
                          <td className="px-4 py-3">
                            <p className="font-bold text-[var(--shelfy-text)] group-hover:text-[var(--shelfy-primary)] transition-colors">{item.cliente_nombre}</p>
                            <p className="text-[10px] text-[var(--shelfy-muted)]">{item.vendedor} | {item.sucursal}</p>
                          </td>
                          <td className="px-4 py-3">
                             <div className="flex items-center gap-2">
                               <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                               <span className="text-[11px] font-medium text-slate-600">{item.articulo_codigo_desc}</span>
                             </div>
                          </td>
                          <td className="px-4 py-3 text-center font-mono font-bold text-slate-700 bg-slate-50/50">
                            {item.total_bultos}
                          </td>
                          <td className="px-4 py-3 text-right">
                             <span className={`font-black ${item.promedio_semanal >= 2.5 ? "text-emerald-600" : "text-slate-400"}`}>
                               {Number(item.promedio_semanal).toFixed(2)}
                             </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
               </div>
            </Card>

            <div className="space-y-6">
              <Card className="p-6 bg-slate-900 border-none text-white overflow-hidden relative">
                <div className="absolute -right-4 -top-4 opacity-10">
                  <Package size={120} />
                </div>
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4">Métricas del Período</h4>
                <div className="space-y-6 relative z-10">
                  <div>
                    <p className="text-3xl font-black text-white">{data.reduce((a, b) => a + Number(b.total_bultos), 0).toLocaleString()}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Total Bultos (Cargo)</p>
                  </div>
                  <div className="pt-6 border-t border-white/10">
                    <p className="text-xl font-bold text-white">{new Set(data.map(d => d.cliente_erp_id)).size}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">PDVs Únicos con Venta</p>
                  </div>
                  <div className="pt-6 border-t border-white/10">
                    <div className="flex items-center justify-between mb-2">
                       <p className="text-[10px] font-bold text-slate-400 uppercase">Cobertura sobre Total</p>
                       <p className="text-xs font-black text-emerald-400">---%</p>
                    </div>
                    <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                       <div className="h-full bg-emerald-500 w-[65%]" />
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                 <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--shelfy-muted)] mb-4">PDVS {"\u003e"} 2.5 Bultos/Sem</h4>
                 <div className="space-y-3">
                    {highVolumePDVs.slice(0, 10).map(v => (
                       <div key={v.id} className="flex items-center justify-between group cursor-pointer hover:bg-[var(--shelfy-bg)] p-2 rounded-xl transition-all">
                          <div className="min-w-0">
                             <p className="text-xs font-bold text-[var(--shelfy-text)] truncate">{v.nombre}</p>
                             <p className="text-[10px] text-[var(--shelfy-muted)] uppercase">{v.canal}</p>
                          </div>
                          <div className="flex items-center gap-2">
                             <span className="text-sm font-black text-emerald-600">{v.promedio.toFixed(1)}</span>
                             <ChevronRight size={14} className="text-slate-300 group-hover:translate-x-1 transition-transform" />
                          </div>
                       </div>
                    ))}
                    {highVolumePDVs.length > 10 && (
                      <p className="text-[10px] text-center text-[var(--shelfy-muted)] mt-2 italic">+ {highVolumePDVs.length - 10} clientes más</p>
                    )}
                 </div>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
