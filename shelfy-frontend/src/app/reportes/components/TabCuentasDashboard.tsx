"use client";

import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageSpinner } from "@/components/ui/Spinner";
import { API_URL } from "@/lib/constants";
import { FileSpreadsheet, AlertCircle, RefreshCw, Briefcase, Download } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from "recharts";
import * as XLSX from "xlsx";

interface CuentasDashboardProps {
  distId: number;
}

interface CuentaRow {
  sucursal: string;
  vendedor: string;
  cliente: string;
  cantidad_comprobantes: number;
  deuda_total: number;
  antiguedad: number;
  rango_antiguedad: string;
  es_valido: boolean;
}

const RANGOS = ["1-7 Días", "8-15 Días", "16-21 Días", "22-30 Días", "+30 Días"];
const COLORS = ["#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#111827"];

export default function TabCuentasDashboard({ distId }: CuentasDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    fecha: string;
    detalle_cuentas: CuentaRow[];
    metadatos: any;
    file_b64: string | null;
  } | null>(null);

  const [selectedVendedor, setSelectedVendedor] = useState<string>("TODOS");

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("shelfy_token");
      const headersInit: HeadersInit = {};
      if (token) headersInit["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/cuentas-corrientes/${distId}`, {
        headers: headersInit
      });
      if (!res.ok) throw new Error("Error fetching cuentas corrientes");
      
      const resJson = await res.json();
      if (!resJson || !resJson.data) {
        setData(null);
      } else {
        setData({
          fecha: resJson.fecha,
          detalle_cuentas: resJson.data.detalle_cuentas || [],
          metadatos: resJson.data.metadatos || {},
          file_b64: resJson.file_b64
        });
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (distId) fetchData();
  }, [distId]);

  const vendedores = useMemo(() => {
    if (!data) return [];
    // Only vendors from valid rows (or all if preferred. Excel usually has valid only)
    const setV = new Set<string>();
    data.detalle_cuentas.forEach(r => {
      if (r.es_valido) setV.add(r.vendedor);
    });
    return Array.from(setV).sort();
  }, [data]);

  // Set default selected vendor to the first one available
  useEffect(() => {
    if (vendedores.length > 0 && selectedVendedor === "TODOS") {
      setSelectedVendedor(vendedores[0]);
    }
  }, [vendedores]);

  const filteredCuentas = useMemo(() => {
    if (!data) return [];
    let rows = data.detalle_cuentas.filter(r => r.es_valido);
    if (selectedVendedor !== "TODOS") {
      rows = rows.filter(r => r.vendedor === selectedVendedor);
    }
    // sorting by antiguedad descending like Excel
    return rows.sort((a, b) => b.antiguedad - a.antiguedad);
  }, [data, selectedVendedor]);

  const totalCuentas = useMemo(() => {
    return filteredCuentas.reduce((acc, row) => acc + row.deuda_total, 0);
  }, [filteredCuentas]);

  // Analystics by range for the selected vendor
  const analytics = useMemo(() => {
    const defaultStats = RANGOS.map((r, i) => ({ rango: r, clientes: 0, saldo: 0, pctClientes: 0, fill: COLORS[i] }));
    if (filteredCuentas.length === 0) return defaultStats;

    const totalClientes = filteredCuentas.length;
    let totals: Record<string, { clientes: number, saldo: number }> = {};
    RANGOS.forEach(r => totals[r] = { clientes: 0, saldo: 0 });

    filteredCuentas.forEach(row => {
      const r = row.rango_antiguedad;
      if (totals[r]) {
        totals[r].clientes += 1;
        totals[r].saldo += row.deuda_total;
      }
    });

    return RANGOS.map((rango, idx) => ({
      rango,
      clientes: totals[rango].clientes,
      saldo: totals[rango].saldo,
      pctClientes: totalClientes > 0 ? (totals[rango].clientes / totalClientes) * 100 : 0,
      fill: COLORS[idx]
    }));
  }, [filteredCuentas]);

  const handleDownloadOriginalExcel = () => {
    if (data?.file_b64) {
      const link = document.createElement("a");
      link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${data.file_b64}`;
      link.download = `Cuentas_Corrientes_${data.fecha}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleExportViewExcel = () => {
    if (filteredCuentas.length === 0) return;
    
    // Exact Excel replication logic
    // Add columns
    const sheetData: any[] = [];
    filteredCuentas.forEach(f => {
      sheetData.push({
        "Vendedor": f.vendedor,
        "Cliente": f.cliente,
        "Cant. Comprobantes": f.cantidad_comprobantes,
        "Saldo Total": f.deuda_total,
        "Antigüedad (días)": f.antiguedad
      });
    });

    const wsDetalle = XLSX.utils.json_to_sheet(sheetData);
    
    // Add total row
    XLSX.utils.sheet_add_json(wsDetalle, [{
      "Vendedor": "",
      "Cliente": "TOTAL",
      "Cant. Comprobantes": "",
      "Saldo Total": totalCuentas,
      "Antigüedad (días)": ""
    }], { skipHeader: true, origin: -1 });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsDetalle, "Detalle Cuentas");
    XLSX.writeFile(wb, `Reporte_Cuentas_${selectedVendedor}_${data?.fecha}.xlsx`);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(val);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 w-full h-full">
        <PageSpinner />
        <p className="text-sm font-medium text-slate-500 mt-4">Obteniendo cuentas corrientes...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-8 text-sm flex flex-col items-center gap-3">
        <AlertCircle size={32} />
        <p className="font-semibold text-lg">Error cargando Cuentas Corrientes</p>
        <p>{error}</p>
        <Button onClick={fetchData} variant="secondary" className="mt-4">Reintentar</Button>
      </div>
    );
  }

  if (!data || data.detalle_cuentas.length === 0) {
    return (
      <div className="bg-slate-50 border border-slate-200 text-slate-700 rounded-xl px-4 py-12 text-sm flex flex-col items-center gap-3">
        <Briefcase size={40} className="text-slate-300" />
        <p className="font-semibold text-lg text-slate-800">No hay datos de cuentas corrientes</p>
        <p className="text-slate-500">El motor RPA RPA aún no ha sincronizado datos para esta distribuidora.</p>
        <Button onClick={fetchData} className="mt-4"><RefreshCw size={16} /> Reintentar</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-4 duration-500">
      
      {/* Top Header & Toggles */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <Briefcase className="text-rose-500" size={24} />
            Cuentas Corrientes
          </h2>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Última sincronización: <span className="text-slate-800 font-bold">{data.fecha}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <label className="text-xs text-slate-400 font-semibold mb-1 uppercase tracking-wider">Vendedor</label>
            <select
              value={selectedVendedor}
              onChange={e => setSelectedVendedor(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-800 rounded-lg px-3 py-2 outline-none focus:border-rose-500 w-64"
            >
              <option value="TODOS">TODOS LOS VENDEDORES</option>
              {vendedores.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <Button onClick={handleExportViewExcel} variant="secondary" className="mt-5">
            <FileSpreadsheet size={16} /> Bajar Excel
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Main Table */}
        <div className="lg:col-span-2">
          <Card className="p-0 border-0 shadow-sm overflow-hidden flex flex-col h-full bg-white">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">Detalle Operativo</h3>
              <span className="text-xs font-semibold px-2.5 py-1 bg-white border border-slate-200 text-slate-600 rounded-md shadow-sm">
                {filteredCuentas.length} registros
              </span>
            </div>
            <div className="overflow-x-auto flex-1 h-[500px]">
              <table className="w-full text-sm text-left">
                <thead className="bg-[#e2efda] text-[#375623]">
                   <tr>
                     <th className="px-4 py-2 border border-[#c6e0b4]">Vendedor</th>
                     <th className="px-4 py-2 border border-[#c6e0b4]">Cliente</th>
                     <th className="px-4 py-2 border border-[#c6e0b4] text-center">Cant. Cbte</th>
                     <th className="px-4 py-2 border border-[#c6e0b4] text-right">Saldo Total</th>
                     <th className="px-4 py-2 border border-[#c6e0b4] text-center">Ant. (días)</th>
                   </tr>
                </thead>
                <tbody>
                  {filteredCuentas.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-4 py-1.5 border border-slate-200 text-slate-700 truncate max-w-[150px]">{row.vendedor}</td>
                      <td className="px-4 py-1.5 border border-slate-200 text-slate-700 truncate max-w-[200px]">{row.cliente}</td>
                      <td className="px-4 py-1.5 border border-slate-200 text-slate-600 text-center">{row.cantidad_comprobantes}</td>
                      <td className="px-4 py-1.5 border border-slate-200 text-slate-800 font-medium text-right tabular-nums">{formatCurrency(row.deuda_total)}</td>
                      <td className="px-4 py-1.5 border border-slate-200 text-slate-600 text-center">{row.antiguedad}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 sticky bottom-0 z-10 font-bold border-t-2 border-slate-300">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-right">TOTAL</td>
                    <td className="px-4 py-3 text-right text-rose-600">{formatCurrency(totalCuentas)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </div>

        {/* Right Column - Analytics (Chart & Subtable) */}
        <div className="flex flex-col gap-6">
          <Card className="h-auto">
            <h3 className="text-sm font-bold text-slate-800 mb-4 bg-[#e2efda] text-[#375623] px-3 py-1 text-center border border-[#c6e0b4]">Análisis por Antigüedad</h3>
            <div className="overflow-x-auto">
               <table className="w-full text-sm text-left border-collapse">
                 <thead>
                   <tr>
                     <th className="font-semibold text-slate-600 border-b border-slate-200 pb-2">Rango</th>
                     <th className="font-semibold text-slate-600 border-b border-slate-200 pb-2 text-center">% Clientes</th>
                     <th className="font-semibold text-slate-600 border-b border-slate-200 pb-2 text-right">Saldo Total</th>
                   </tr>
                 </thead>
                 <tbody>
                   {analytics.map(a => (
                     <tr key={a.rango}>
                       <td className="py-2 text-slate-700">{a.rango}</td>
                       <td className="py-2 text-slate-600 text-center">{a.pctClientes.toFixed(1)}%</td>
                       <td className="py-2 text-slate-800 text-right tabular-nums">{formatCurrency(a.saldo)}</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
            </div>
          </Card>

          <Card className="flex-1 min-h-[300px] flex flex-col justify-center items-center">
            <h3 className="text-sm font-bold text-slate-800 px-3 py-1 mb-2 text-center w-full">Distribución de Deuda por Antigüedad</h3>
            <p className="text-xs text-slate-500 mb-6 text-center">{selectedVendedor}</p>
            <div className="w-full h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={analytics}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="saldo"
                  >
                    {analytics.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    formatter={(value: any) => formatCurrency(value || 0)}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend 
                     verticalAlign="middle" 
                     align="right" 
                     layout="vertical"
                     iconType="square"
                     formatter={(value, entry: any) => <span className="text-xs font-medium text-slate-600">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </div>
      
    </div>
  );
}
