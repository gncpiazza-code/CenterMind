"use client";

import { useEffect, useState, useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { PageSpinner } from "@/components/ui/Spinner";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { DollarSign, Receipt, TrendingUp, Download, UploadCloud, Check, AlertTriangle } from "lucide-react";
import * as XLSX from "xlsx";
import { uploadERPFile } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { API_URL, TOKEN_KEY } from "@/lib/constants";

interface VentasResumenItem {
  sucursal: string;
  vendedor: string;
  tipo_pago: string;
  total_neto: number;
  total_final: number;
  cantidad_comprobantes: number;
}

export default function TabVentasResumen({ distId, desde, hasta }: { distId: number, desde: string, hasta: string }) {
  const [data, setData] = useState<VentasResumenItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const res = await fetch(`${API_URL}/api/reports/ventas-resumen/${distId}?desde=${desde}&hasta=${hasta}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);
    try {
      const res = await uploadERPFile("ventas", file);
      setUploadResult({ msg: `Éxito: ${res.count} registros.`, type: "ok" });
      fetchData(); // Recargar datos
    } catch (err: any) {
      setUploadResult({ msg: err.message || "Error al subir", type: "err" });
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (distId) fetchData();
  }, [distId, desde, hasta]);

  const stats = useMemo(() => {
    const totalFacturado = data.reduce((acc, current) => acc + Number(current.total_final), 0);
    const totalRecaudado = data
      .filter(d => d.tipo_pago.includes("Recaudación"))
      .reduce((acc, current) => acc + Number(current.total_final), 0);
    const totalVentas = data
      .filter(d => d.tipo_pago.includes("Venta"))
      .reduce((acc, current) => acc + Number(current.total_final), 0);

    return { totalFacturado, totalRecaudado, totalVentas };
  }, [data]);

  const chartData = useMemo(() => {
    // Agrupar por sucursal
    const map: Record<string, { sucursal: string, ventas: number, recaudacion: number }> = {};
    data.forEach(d => {
      if (!map[d.sucursal]) map[d.sucursal] = { sucursal: d.sucursal, ventas: 0, recaudacion: 0 };
      if (d.tipo_pago.includes("Venta")) map[d.sucursal].ventas += Number(d.total_final);
      else map[d.sucursal].recaudacion += Number(d.total_final);
    });
    return Object.values(map);
  }, [data]);

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Resumen");
    XLSX.writeFile(wb, `Resumen_Ventas_${desde}_${hasta}.xlsx`);
  };

  if (loading) return <div className="py-20"><PageSpinner /></div>;

  return (
    <div className="space-y-6">
      {/* Header and Sync Status */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
          <DollarSign size={80} />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <DollarSign size={20} />
            </div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Rendimiento de Ventas</h2>
          </div>
          <p className="text-sm text-slate-500 font-medium ml-12">Monitoreo y análisis de facturación y cobranza.</p>
          
          {uploadResult && (
            <div className={`mt-3 ml-12 px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-2 w-fit animate-in fade-in duration-300 ${
              uploadResult.type === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-rose-50 border-rose-200 text-rose-700"
            }`}>
              {uploadResult.type === "ok" ? <Check size={14} /> : <AlertTriangle size={14} />}
              {uploadResult.msg}
            </div>
          )}
        </div>
        
        <div className="flex flex-col items-end gap-3 relative z-10">
          {/* Motor RPA Status Indicator */}
          <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-xl border border-emerald-200 text-xs font-bold shadow-sm">
            <div className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </div>
            <span>Motor RPA en línea</span>
            <span className="text-emerald-500/50">|</span>
            <span className="font-medium text-emerald-600">Sincronizado hoy 13:30</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative group">
              <input 
                type="file" 
                accept=".xlsx" 
                onChange={handleUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                disabled={uploading}
              />
              <Button
                size="sm"
                variant="outline"
                loading={uploading}
                className="flex items-center gap-2 bg-white border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 shadow-sm text-xs h-9"
              >
                <UploadCloud size={14} />
                Subida Manual
              </Button>
            </div>
            
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition-colors shadow-md h-9"
            >
              <Download size={14} /> Exportar
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="relative overflow-hidden p-6 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-3xl shadow-lg shadow-indigo-200 text-white transform hover:scale-[1.02] transition-transform duration-300 group">
          <div className="absolute top-0 right-0 -mr-4 -mt-4 p-8 opacity-10 group-hover:scale-110 transition-transform duration-500 pointer-events-none">
            <DollarSign size={100} />
          </div>
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2.5 bg-white/20 backdrop-blur-md rounded-xl text-white shadow-inner border border-white/10">
                <DollarSign size={22} strokeWidth={2.5} />
              </div>
              <span className="text-[10px] font-bold bg-white/10 px-3 py-1 rounded-full backdrop-blur-sm border border-white/10">General</span>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-100 mb-1">Total Facturado</p>
              <div className="flex items-baseline gap-2">
                <h3 className="text-4xl font-black tracking-tight">${stats.totalFacturado.toLocaleString()}</h3>
              </div>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden p-6 bg-slate-900 rounded-3xl shadow-lg shadow-slate-200 text-white transform hover:scale-[1.02] transition-transform duration-300 group">
          <div className="absolute top-0 right-0 -mr-4 -mt-4 p-8 opacity-5 group-hover:scale-110 transition-transform duration-500 pointer-events-none">
            <TrendingUp size={100} />
          </div>
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2.5 bg-emerald-500/20 backdrop-blur-md rounded-xl text-emerald-400 shadow-inner border border-emerald-500/20">
                <TrendingUp size={22} strokeWidth={2.5} />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Recaudación / Cobranza</p>
              <div className="flex items-baseline gap-2">
                <h3 className="text-4xl font-black text-emerald-400 tracking-tight">${stats.totalRecaudado.toLocaleString()}</h3>
              </div>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden p-6 bg-white rounded-3xl shadow-lg shadow-slate-100 border border-slate-100 transform hover:scale-[1.02] transition-transform duration-300 group">
          <div className="absolute top-0 right-0 -mr-4 -mt-4 p-8 opacity-5 group-hover:scale-110 transition-transform duration-500 pointer-events-none text-orange-500">
            <Receipt size={100} />
          </div>
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2.5 bg-orange-50 text-orange-500 rounded-xl shadow-inner border border-orange-100">
                <Receipt size={22} strokeWidth={2.5} />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Ventas Directas (Contado)</p>
              <div className="flex items-baseline gap-2">
                <h3 className="text-4xl font-black text-slate-900 tracking-tight">${stats.totalVentas.toLocaleString()}</h3>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="text-sm font-bold text-[var(--shelfy-muted)] uppercase mb-6">Comparativa por Sucursal</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="sucursal" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value / 1000}k`} />
                <Tooltip
                  formatter={(val: any) => [`$${val?.toLocaleString()}`, ""]}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                />
                <Legend />
                <Bar dataKey="ventas" name="Ventas" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="recaudacion" name="Recaudación" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6 overflow-auto max-h-[400px]">
          <h3 className="text-sm font-bold text-[var(--shelfy-muted)] uppercase mb-6">Detalle por Vendedor</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--shelfy-muted)] border-b border-[var(--shelfy-border)]">
                <th className="pb-3 font-medium">Vendedor</th>
                <th className="pb-3 font-medium">Tipo</th>
                <th className="pb-3 text-right font-medium">Importe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--shelfy-border)]">
              {data.map((item, i) => (
                <tr key={i} className="hover:bg-[var(--shelfy-bg)] transition-colors">
                  <td className="py-3 font-bold text-[var(--shelfy-text)]">{item.vendedor}</td>
                  <td className="py-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      item.tipo_pago.includes("Venta") ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
                    }`}>
                      {item.tipo_pago}
                    </span>
                  </td>
                  <td className="py-3 text-right font-mono font-bold">${item.total_final.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
