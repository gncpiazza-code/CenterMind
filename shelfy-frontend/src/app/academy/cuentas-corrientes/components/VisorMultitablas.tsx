"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { Table, LayoutList, TrendingUp, AlertTriangle, ArrowUpDown, PieChart as PieChartIcon, Users, DollarSign } from "lucide-react";
import { Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Sector } from "recharts";

interface VisorData {
    resumen_alertas: any[];
    vendedores: Record<string, {
        tabla: any[];
        grafico_analisis: any[];
    }>;
}

const renderActiveShape = (props: any) => {
    const RADIAN = Math.PI / 180;
    const { cx, cy, midAngle, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props;
    const sin = Math.sin(-RADIAN * midAngle);
    const cos = Math.cos(-RADIAN * midAngle);
    const sx = cx + (outerRadius + 10) * cos;
    const sy = cy + (outerRadius + 10) * sin;
    const mx = cx + (outerRadius + 30) * cos;
    const my = cy + (outerRadius + 30) * sin;
    const ex = mx + (cos >= 0 ? 1 : -1) * 22;
    const ey = my;
    const textAnchor = cos >= 0 ? 'start' : 'end';

    return (
        <g>
            <text x={cx} y={cy} dy={8} textAnchor="middle" fill={fill} className="font-bold text-lg drop-shadow-sm">
                {payload.name}
            </text>
            <Sector
                cx={cx}
                cy={cy}
                innerRadius={innerRadius}
                outerRadius={outerRadius + 12}
                startAngle={startAngle}
                endAngle={endAngle}
                fill={fill}
                style={{ filter: `drop-shadow(0px 8px 16px ${fill}66)` }}
            />
            <Sector
                cx={cx}
                cy={cy}
                startAngle={startAngle}
                endAngle={endAngle}
                innerRadius={outerRadius + 14}
                outerRadius={outerRadius + 22}
                fill={fill}
                opacity={0.4}
            />
            <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={fill} strokeWidth={2} fill="none" />
            <circle cx={ex} cy={ey} r={4} fill={fill} stroke="white" strokeWidth={2} />
            <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} textAnchor={textAnchor} fill="#334155" className="font-extrabold text-sm">{`$${value.toLocaleString()}`}</text>
            <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} dy={18} textAnchor={textAnchor} fill="#64748b" className="text-xs font-semibold">
                {`( ${(percent * 100).toFixed(1)}% )`}
            </text>
        </g>
    );
};

export default function VisorMultitablas({ data }: { data: VisorData }) {
    const [activeTab, setActiveTab] = useState<string>("resumen");
    const vendNoms = Object.keys(data.vendedores || {});

    return (
        <Card className="border-t-4 border-t-indigo-500 shadow-xl shadow-indigo-100 p-0 overflow-hidden animate-in fade-in duration-500">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                        <LayoutList size={22} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 tracking-tight">Reporte Interactivo de Saldos</h2>
                        <p className="text-sm text-slate-500">Puedes ordenar las columnas y visualizar los gráficos generados dinámicamente.</p>
                    </div>
                </div>
            </div>

            <div className="flex border-b border-slate-200 bg-slate-50 overflow-x-auto custom-scrollbar">
                <button
                    onClick={() => setActiveTab("resumen")}
                    className={`px-6 py-4 font-bold text-sm whitespace-nowrap border-b-2 transition-colors flex items-center gap-2
            ${activeTab === "resumen"
                            ? "text-indigo-600 border-indigo-600 bg-indigo-50/50"
                            : "text-slate-500 border-transparent hover:text-slate-700 hover:bg-slate-100/50"}`}
                >
                    <AlertTriangle size={16} className={activeTab === "resumen" ? "text-indigo-500" : ""} />
                    Alertas Críticas ({data.resumen_alertas?.length || 0})
                </button>

                {vendNoms.map(v => (
                    <button
                        key={v}
                        onClick={() => setActiveTab(v)}
                        className={`px-6 py-4 font-bold text-sm whitespace-nowrap border-b-2 transition-colors flex items-center gap-2
              ${activeTab === v
                                ? "text-indigo-600 border-indigo-600 bg-indigo-50/50"
                                : "text-slate-500 border-transparent hover:text-slate-700 hover:bg-slate-100/50"}`}
                    >
                        <PieChartIcon size={16} />
                        {v}
                    </button>
                ))}
            </div>

            <div className="bg-white overflow-auto max-h-[800px] custom-scrollbar p-0">
                {activeTab === "resumen" ? (
                    <div className="p-6">
                        <ResumenTabla rows={data.resumen_alertas} />
                    </div>
                ) : (
                    <VendedorTab data={data.vendedores[activeTab]} vendName={activeTab} />
                )}
            </div>
        </Card>
    );
}

function ResumenTabla({ rows }: { rows: any[] }) {
    if (!rows || rows.length === 0) {
        return (
            <div className="text-center py-10 animate-in zoom-in-95 duration-300">
                <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertTriangle size={32} className="text-green-500" />
                </div>
                <h3 className="font-bold text-slate-800 text-lg">Cuentas Sanas</h3>
                <p className="text-slate-500 text-sm mt-1 max-w-sm mx-auto">No se encontraron clientes que excedan las alertas de crédito configuradas.</p>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <h3 className="font-bold text-slate-800 mb-4 text-base">Cuentas que requieren atención inmediata</h3>
            <table className="w-full text-sm text-left border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <thead className="bg-slate-100 text-slate-600 uppercase text-xs font-bold">
                    <tr>
                        <th className="px-4 py-3 border-b">Vendedor</th>
                        <th className="px-4 py-3 border-b">Cliente</th>
                        <th className="px-4 py-3 border-b text-right">Saldo Total</th>
                        <th className="px-4 py-3 border-b text-center">Cbtes</th>
                        <th className="px-4 py-3 border-b text-center">Antigüedad</th>
                        <th className="px-4 py-3 border-b">Motivo Alerta</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {rows.map((r, i) => (
                        <tr key={i} className="hover:bg-red-50/40 transition-colors">
                            <td className="px-4 py-3 font-medium text-slate-700">{r.Vendedor}</td>
                            <td className="px-4 py-3 font-bold text-slate-800">{r.Cliente}</td>
                            <td className="px-4 py-3 text-right font-bold text-red-600">${r["Saldo Total"]?.toLocaleString()}</td>
                            <td className="px-4 py-3 text-center text-slate-600">{r["Cant. Cbtes"]}</td>
                            <td className="px-4 py-3 text-center font-medium text-slate-700">{r["Antigüedad"]} d</td>
                            <td className="px-4 py-3 text-red-600 text-xs font-bold bg-red-50/50">{r["Alerta de Crédito"]}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function VendedorTab({ data, vendName }: { data: any, vendName: string }) {
    const [sortKey, setSortKey] = useState<string>("Saldo Total");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
    const [activeIndex, setActiveIndex] = useState(0);

    const onPieEnter = (_: any, index: number) => {
        setActiveIndex(index);
    };

    const handleSort = (key: string) => {
        if (sortKey === key) {
            setSortDir(sortDir === "asc" ? "desc" : "asc");
        } else {
            setSortKey(key);
            setSortDir("desc");
        }
    };

    if (!data) return null;
    const { tabla, grafico_analisis } = data;

    // Calcular KPIs
    const totalSaldo = tabla?.reduce((acc: number, row: any) => acc + (Number(row["Saldo Total"]) || 0), 0) || 0;
    const totalClientes = tabla?.length || 0;

    // Apply Sorting
    const sortedTabla = useMemo(() => {
        if (!tabla) return [];
        return [...tabla].sort((a, b) => {
            const valA = a[sortKey] ?? 0;
            const valB = b[sortKey] ?? 0;
            if (valA < valB) return sortDir === "asc" ? -1 : 1;
            if (valA > valB) return sortDir === "asc" ? 1 : -1;
            return 0;
        });
    }, [tabla, sortKey, sortDir]);

    // Format for Recharts
    const chartData = grafico_analisis?.map((item: any) => ({
        ...item,
        name: item.rango_antiguedad.replace(' Días', 'd').replace('Días', 'd'),
        saldo: item.saldo_total || 0,
        clientes: item.cant_clientes || 0
    })) || [];

    return (
        <div className="flex flex-col animate-in fade-in duration-300">

            {/* KPIs Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 bg-slate-50 border-b border-slate-100">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                        <DollarSign size={20} />
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wide">Saldo Pendiente</p>
                        <p className="text-lg font-black text-slate-800">${totalSaldo.toLocaleString()}</p>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                        <Users size={20} />
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wide">Clientes</p>
                        <p className="text-lg font-black text-slate-800">{totalClientes}</p>
                    </div>
                </div>

                <div className="col-span-2 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wide mb-2">Vendedor Asignado</p>
                    <p className="text-lg font-black text-slate-800 truncate">{vendName}</p>
                </div>
            </div>

            <div className="p-6 flex flex-col xl:flex-row gap-8">
                {/* Gráfico Analítico Recharts (Sólo Torta Animada) */}
                <div className="w-full xl:w-2/5 flex flex-col gap-4 transition-all duration-500 hover:scale-[1.01]">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <PieChartIcon size={20} className="text-indigo-500" />
                        Composición de Saldos (Interactivo)
                    </h3>

                    <div className="bg-white/80 backdrop-blur border text-xs border-indigo-100 rounded-[2rem] p-6 shadow-xl shadow-indigo-100/50 h-[450px] flex items-center justify-center relative overflow-hidden group">

                        {/* Decorative background glow */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl group-hover:bg-indigo-500/10 transition-colors duration-700 pointer-events-none"></div>

                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    activeIndex={activeIndex}
                                    activeShape={renderActiveShape}
                                    data={chartData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={70}
                                    outerRadius={100}
                                    paddingAngle={3}
                                    dataKey="saldo"
                                    onMouseEnter={onPieEnter}
                                    stroke="none"
                                >
                                    {chartData.map((entry: any, index: number) => {
                                        // Vibrant colors inspired by the original excel colors
                                        const VIBRANT_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#0f172a'];
                                        return (
                                            <Cell
                                                key={`cell-${index}`}
                                                fill={VIBRANT_COLORS[index % VIBRANT_COLORS.length]}
                                                className="cursor-pointer transition-all duration-500 focus:outline-none"
                                            />
                                        );
                                    })}
                                </Pie>
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Tabla Interactiva de Cuentas */}
                <div className="w-full xl:w-3/5 flex flex-col gap-4">
                    <h3 className="font-bold text-slate-800 flex items-center justify-between">
                        Detalle de Clientes ({sortedTabla?.length || 0})
                        <span className="text-xs font-normal text-slate-500">Haz click en las columnas para ordenar</span>
                    </h3>
                    <div className="overflow-x-auto bg-white border border-slate-200 rounded-2xl shadow-sm">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold tracking-wider border-b">
                                <tr>
                                    <th className="px-3 py-3 cursor-pointer hover:bg-slate-100 transition-colors group" onClick={() => handleSort('Cliente')}>
                                        <div className="flex items-center gap-1">Cliente <ArrowUpDown size={12} className="opacity-50 group-hover:opacity-100" /></div>
                                    </th>
                                    <th className="px-3 py-3 cursor-pointer hover:bg-slate-100 transition-colors group text-center" onClick={() => handleSort('Cant. Comprobantes')}>
                                        <div className="flex items-center justify-center gap-1">Cbtes <ArrowUpDown size={12} className="opacity-50 group-hover:opacity-100" /></div>
                                    </th>
                                    <th className="px-3 py-3 cursor-pointer hover:bg-slate-100 transition-colors group text-center" onClick={() => handleSort('Antigüedad (días)')}>
                                        <div className="flex items-center justify-center gap-1">Edad <ArrowUpDown size={12} className="opacity-50 group-hover:opacity-100" /></div>
                                    </th>
                                    <th className="px-3 py-3 border-l cursor-pointer hover:bg-slate-100 transition-colors group text-right text-indigo-700 bg-indigo-50/50" onClick={() => handleSort('Saldo Total')}>
                                        <div className="flex items-center justify-end gap-1">Saldo <ArrowUpDown size={12} className="opacity-50 group-hover:opacity-100" /></div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs">
                                {sortedTabla?.map((r: any, i: number) => {
                                    const tieneAlerta = !!r["Alerta de Crédito"];
                                    return (
                                        <tr key={i} className={`hover:bg-slate-50 transition-colors ${tieneAlerta ? 'bg-amber-50/30' : ''}`}>
                                            <td className="px-3 py-3">
                                                <p className="font-bold text-slate-800 line-clamp-1" title={r.Cliente}>{r.Cliente}</p>
                                                {tieneAlerta && <p className="text-[10px] text-amber-600 font-bold mt-1 line-clamp-1">{r["Alerta de Crédito"]}</p>}
                                            </td>
                                            <td className="px-3 py-3 text-center text-slate-600 font-medium">{r["Cant. Comprobantes"]}</td>
                                            <td className="px-3 py-3 text-center text-slate-600 font-medium">{r["Antigüedad (días)"]} d</td>
                                            <td className={`px-3 py-3 text-right font-black border-l ${tieneAlerta ? 'text-amber-700' : 'text-indigo-700'}`}>
                                                ${r["Saldo Total"]?.toLocaleString()}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        </div>
    );
}

