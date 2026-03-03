"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Table, LayoutList, TrendingUp, AlertTriangle } from "lucide-react";

interface VisorData {
    resumen_alertas: any[];
    vendedores: Record<string, {
        tabla: any[];
        grafico_analisis: any[];
    }>;
}

export default function VisorMultitablas({ data }: { data: VisorData }) {
    const [activeTab, setActiveTab] = useState<string>("resumen");

    const vendNoms = Object.keys(data.vendedores || {});

    return (
        <Card className="border-t-4 border-t-indigo-500 shadow-xl shadow-indigo-100 p-0 overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                        <LayoutList size={22} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 tracking-tight">Cuentas Corrientes Generadas</h2>
                        <p className="text-sm text-slate-500">Previsualización de los datos calculados. El archivo Excel físico ya debería haberse descargado automáticamente.</p>
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
                    Resumen Alertas ({data.resumen_alertas?.length || 0})
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
                        <Table size={16} />
                        {v}
                    </button>
                ))}
            </div>

            <div className="p-6 bg-white overflow-auto max-h-[600px] custom-scrollbar">
                {activeTab === "resumen" ? (
                    <ResumenTabla rows={data.resumen_alertas} />
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
            <div className="text-center py-10">
                <AlertTriangle size={40} className="mx-auto text-green-400 mb-3" />
                <h3 className="font-bold text-slate-700 text-lg">Sin Alertas</h3>
                <p className="text-slate-500 text-sm">No se encontraron clientes que excedan los límites configurados.</p>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border border-slate-200 rounded-xl overflow-hidden">
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
                        <tr key={i} className="hover:bg-amber-50/30">
                            <td className="px-4 py-2 font-medium text-slate-700">{r.Vendedor}</td>
                            <td className="px-4 py-2 font-bold text-slate-800">{r.Cliente}</td>
                            <td className="px-4 py-2 text-right font-semibold text-slate-700">${r["Saldo Total"]?.toLocaleString()}</td>
                            <td className="px-4 py-2 text-center text-slate-600">{r["Cant. Cbtes"]}</td>
                            <td className="px-4 py-2 text-center text-slate-600">{r["Antigüedad"]} d</td>
                            <td className="px-4 py-2 text-amber-600 text-xs font-bold">{r["Alerta de Crédito"]}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function VendedorTab({ data, vendName }: { data: any, vendName: string }) {
    if (!data) return null;
    const { tabla, grafico_analisis } = data;

    return (
        <div className="flex flex-col gap-8 animate-in fade-in duration-300">

            {/* Análisis Header */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 flex flex-col md:flex-row gap-6">
                <div className="flex-1">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-3">
                        <TrendingUp size={18} className="text-indigo-500" />
                        Análisis de Antigüedad - {vendName}
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                            <thead className="bg-white text-slate-500 border-b">
                                <tr>
                                    <th className="py-2 px-2">Rango</th>
                                    <th className="py-2 px-2 text-right">% Clientes</th>
                                    <th className="py-2 px-2 text-right">Saldo Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {grafico_analisis?.map((a: any, i: number) => (
                                    <tr key={i}>
                                        <td className="py-1 px-2 font-medium">{a.rango_antiguedad}</td>
                                        <td className="py-1 px-2 text-right">{(a.porc_clientes * 100).toFixed(1)}%</td>
                                        <td className="py-1 px-2 text-right font-semibold">${a.saldo_total?.toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Tabla Completa */}
            <div>
                <h3 className="font-bold text-slate-800 mb-3">Detalle de Cuentas ({tabla?.length || 0})</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left border border-slate-200 rounded-xl overflow-hidden">
                        <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold tracking-wider">
                            <tr>
                                <th className="px-3 py-3 border-b">Cliente</th>
                                <th className="px-3 py-3 border-b text-center">Cbtes</th>
                                <th className="px-3 py-3 border-b text-right">Saldo</th>
                                <th className="px-3 py-3 border-b text-center">Edad</th>
                                <th className="px-3 py-3 border-b">Alertas</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                            {tabla?.map((r: any, i: number) => (
                                <tr key={i} className={`hover:bg-slate-50 ${r["Alerta de Crédito"] ? 'bg-amber-50/20' : ''}`}>
                                    <td className="px-3 py-2 font-bold text-slate-800 truncate max-w-[200px]" title={r.Cliente}>{r.Cliente}</td>
                                    <td className="px-3 py-2 text-center text-slate-600">{r["Cant. Comprobantes"]}</td>
                                    <td className="px-3 py-2 text-right font-semibold text-slate-700">${r["Saldo Total"]?.toLocaleString()}</td>
                                    <td className="px-3 py-2 text-center text-slate-600">{r["Antigüedad (días)"]} d</td>
                                    <td className="px-3 py-2 text-amber-600 font-bold truncate max-w-[150px]" title={r["Alerta de Crédito"]}>{r["Alerta de Crédito"]}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

        </div>
    );
}
