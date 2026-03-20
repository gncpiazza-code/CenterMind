"use client";

import { useEffect, useState, useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { PageSpinner } from "@/components/ui/Spinner";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { DollarSign, Receipt, TrendingUp, Download } from "lucide-react";
import * as XLSX from "xlsx";

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

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/ventas-resumen/${distId}?desde=${desde}&hasta=${hasta}`, {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
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
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-[var(--shelfy-text)]">Resumen de Recaudación</h2>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--shelfy-primary)] text-white rounded-lg text-sm font-bold hover:opacity-90 transition-opacity"
        >
          <Download size={16} /> Exportar Excel
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border-blue-200">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500 rounded-xl text-white">
              <DollarSign size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Total Facturado</p>
              <h3 className="text-2xl font-black text-slate-900">${stats.totalFacturado.toLocaleString()}</h3>
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border-emerald-200">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-500 rounded-xl text-white">
              <TrendingUp size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Recaudación/Cobranza</p>
              <h3 className="text-2xl font-black text-slate-900">${stats.totalRecaudado.toLocaleString()}</h3>
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-orange-500/10 to-amber-500/10 border-orange-200">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-orange-500 rounded-xl text-white">
              <Receipt size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-orange-600 uppercase tracking-widest">Ventas Directas</p>
              <h3 className="text-2xl font-black text-slate-900">${stats.totalVentas.toLocaleString()}</h3>
            </div>
          </div>
        </Card>
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
