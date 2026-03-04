"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Settings2, Plus, Trash2, Search, SlidersHorizontal, ShieldAlert, BadgeInfo } from "lucide-react";

export interface ReglaCredito {
    activo: boolean;
    valor: number;
}

export interface ReglasGenerales {
    limite_dinero: ReglaCredito;
    limite_cbte: ReglaCredito;
    limite_dias: ReglaCredito;
}

export interface Excepcion {
    id?: string;
    cliente: string;
    limite_dinero: ReglaCredito;
    limite_cbte: ReglaCredito;
    limite_dias: ReglaCredito;
}

const DEFAULT_REGLAS: ReglasGenerales = {
    limite_dinero: { activo: true, valor: 500000 },
    limite_cbte: { activo: true, valor: 3 },
    limite_dias: { activo: false, valor: 0 },
};

export default function TabAlertasCredito() {
    const [reglas, setReglas] = useState<ReglasGenerales>(DEFAULT_REGLAS);
    const [excepciones, setExcepciones] = useState<Excepcion[]>([]);
    const [montoExt, setMontoExt] = useState("");
    const [cbteExt, setCbteExt] = useState("");
    const [diasExt, setDiasExt] = useState("");
    const [toastMessage, setToastMessage] = useState("");

    // Search state for exceptions
    const [searchExcepcion, setSearchExcepcion] = useState("");

    useEffect(() => {
        // Load config from LocalStorage on mount
        const savedReglas = localStorage.getItem("shelfy_alertas_reglas");
        const savedExcepciones = localStorage.getItem("shelfy_alertas_excepciones");

        if (savedReglas) setReglas(JSON.parse(savedReglas));
        if (savedExcepciones) setExcepciones(JSON.parse(savedExcepciones));
    }, []);

    // Hydrate local states based on variables
    useEffect(() => {
        setMontoExt(reglas.limite_dinero.valor.toString());
        setCbteExt(reglas.limite_cbte.valor.toString());
        setDiasExt(reglas.limite_dias.valor.toString());
    }, [reglas]);

    const handleSave = () => {
        const newReglas: ReglasGenerales = {
            limite_dinero: { activo: reglas.limite_dinero.activo, valor: Number(montoExt) || 0 },
            limite_cbte: { activo: reglas.limite_cbte.activo, valor: Number(cbteExt) || 0 },
            limite_dias: { activo: reglas.limite_dias.activo, valor: Number(diasExt) || 0 },
        };

        localStorage.setItem("shelfy_alertas_reglas", JSON.stringify(newReglas));
        localStorage.setItem("shelfy_alertas_excepciones", JSON.stringify(excepciones));
        setReglas(newReglas);

        // Show toast
        setToastMessage("Configuración guardada exitosamente");
        setTimeout(() => setToastMessage(""), 3000);
    };

    const handleAddException = () => {
        if (!searchExcepcion.trim()) return;

        const newException: Excepcion = {
            id: crypto.randomUUID(),
            cliente: searchExcepcion.trim().toUpperCase(),
            limite_dinero: { activo: true, valor: Number(montoExt) * 1.5 }, // Default to 50% more
            limite_cbte: { activo: reglas.limite_cbte.activo, valor: Number(cbteExt) },
            limite_dias: { activo: reglas.limite_dias.activo, valor: Number(diasExt) },
        };

        setExcepciones([...excepciones, newException]);
        setSearchExcepcion("");
    };

    const handleRemoveException = (id: string) => {
        setExcepciones(excepciones.filter(e => e.id !== id));
    };

    const toggleRegla = (key: keyof ReglasGenerales) => {
        setReglas(prev => ({
            ...prev,
            [key]: { ...prev[key], activo: !prev[key].activo }
        }));
    };

    const updateExceptionField = (id: string, field: keyof Excepcion, prop: keyof ReglaCredito, value: any) => {
        setExcepciones(prev => prev.map(e => {
            if (e.id === id) {
                return {
                    ...e,
                    [field]: { ...(e[field] as ReglaCredito), [prop]: value }
                };
            }
            return e;
        }));
    };

    return (
        <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-4 duration-500">

            {toastMessage && (
                <div className="fixed top-4 right-4 z-50 bg-green-50 text-green-700 border border-green-200 px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-in slide-in-from-top-4 fade-in">
                    <BadgeInfo size={16} />
                    <span className="text-sm font-semibold">{toastMessage}</span>
                </div>
            )}

            {/* Reglas Generales */}
            <Card className="border-t-4 border-t-violet-500">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-violet-100 text-violet-600 rounded-lg">
                        <SlidersHorizontal size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 tracking-tight">Reglas Generales de Crédito</h2>
                        <p className="text-sm text-slate-500">Se aplicarán a todos los clientes por defecto.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Límite Dinero */}
                    <div className={`p-4 rounded-xl border transition-all duration-300 ${reglas.limite_dinero.activo ? 'bg-white border-violet-200 shadow-[0_4px_20px_rgba(124,58,237,0.05)]' : 'bg-slate-50 border-slate-200 opacity-70'}`}>
                        <div className="flex justify-between items-center mb-3">
                            <label className="text-sm font-bold text-slate-700">Límite de Dinero ($)</label>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" checked={reglas.limite_dinero.activo} onChange={() => toggleRegla("limite_dinero")} />
                                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-violet-500"></div>
                            </label>
                        </div>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                            <input
                                type="number"
                                value={montoExt}
                                onChange={e => setMontoExt(e.target.value)}
                                disabled={!reglas.limite_dinero.activo}
                                className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none transition-all disabled:bg-slate-50 text-slate-700 font-semibold"
                                placeholder="Ej. 500000"
                            />
                        </div>
                    </div>

                    {/* Límite Comprobantes */}
                    <div className={`p-4 rounded-xl border transition-all duration-300 ${reglas.limite_cbte.activo ? 'bg-white border-violet-200 shadow-[0_4px_20px_rgba(124,58,237,0.05)]' : 'bg-slate-50 border-slate-200 opacity-70'}`}>
                        <div className="flex justify-between items-center mb-3">
                            <label className="text-sm font-bold text-slate-700">Límite Comprobantes</label>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" checked={reglas.limite_cbte.activo} onChange={() => toggleRegla("limite_cbte")} />
                                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-violet-500"></div>
                            </label>
                        </div>
                        <div className="relative">
                            <input
                                type="number"
                                value={cbteExt}
                                onChange={e => setCbteExt(e.target.value)}
                                disabled={!reglas.limite_cbte.activo}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none transition-all disabled:bg-slate-50 text-slate-700 font-semibold"
                                placeholder="Ej. 3"
                            />
                        </div>
                    </div>

                    {/* Límite Días */}
                    <div className={`p-4 rounded-xl border transition-all duration-300 ${reglas.limite_dias.activo ? 'bg-white border-violet-200 shadow-[0_4px_20px_rgba(124,58,237,0.05)]' : 'bg-slate-50 border-slate-200 opacity-70'}`}>
                        <div className="flex justify-between items-center mb-3">
                            <label className="text-sm font-bold text-slate-700">Límite de Días</label>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" checked={reglas.limite_dias.activo} onChange={() => toggleRegla("limite_dias")} />
                                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-violet-500"></div>
                            </label>
                        </div>
                        <div className="relative">
                            <input
                                type="number"
                                value={diasExt}
                                onChange={e => setDiasExt(e.target.value)}
                                disabled={!reglas.limite_dias.activo}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none transition-all disabled:bg-slate-50 text-slate-700 font-semibold"
                                placeholder="Ej. 30"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-xs">días</span>
                        </div>
                    </div>
                </div>
            </Card>

            {/* Excepciones */}
            <Card className="border-t-4 border-t-amber-500">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
                        <ShieldAlert size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 tracking-tight">Excepciones de Clientes</h2>
                        <p className="text-sm text-slate-500">Sobrescribe las reglas generales para clientes específicos.</p>
                    </div>
                </div>

                {/* Buscador y Añadir */}
                <div className="flex gap-2 max-w-md mb-6">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            value={searchExcepcion}
                            onChange={e => setSearchExcepcion(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAddException()}
                            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none text-sm text-slate-700 transition-all font-medium"
                            placeholder="Nombre del Cliente (Ej. JUAN PEREZ)"
                        />
                    </div>
                    <Button onClick={handleAddException} className="bg-amber-500 hover:bg-amber-600 text-white rounded-xl px-4 shrink-0 transition-colors shadow-lg shadow-amber-200">
                        <Plus size={18} className="mr-1" />
                        Añadir
                    </Button>
                </div>

                {/* Tabla Excepciones */}
                {excepciones.length > 0 ? (
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase text-xs">
                                <tr>
                                    <th className="px-4 py-3">Cliente</th>
                                    <th className="px-4 py-3 w-40">Límite Dinero ($)</th>
                                    <th className="px-4 py-3 w-32">Lím. Cbtes</th>
                                    <th className="px-4 py-3 w-32">Lím. Días</th>
                                    <th className="px-4 py-3 w-16 text-center"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {excepciones.map(exc => (
                                    <tr key={exc.id} className="hover:bg-amber-50/30 transition-colors">
                                        <td className="px-4 py-3 font-bold text-slate-700">{exc.cliente}</td>

                                        {/* Input Dinero Exception */}
                                        <td className="px-4 py-2">
                                            <div className="flex items-center gap-2">
                                                <input type="checkbox" checked={exc.limite_dinero.activo} onChange={e => updateExceptionField(exc.id!, "limite_dinero", "activo", e.target.checked)} className="rounded text-amber-500 border-slate-300 focus:ring-amber-500 h-4 w-4" />
                                                <input type="number" disabled={!exc.limite_dinero.activo} value={exc.limite_dinero.valor} onChange={e => updateExceptionField(exc.id!, "limite_dinero", "valor", Number(e.target.value) || 0)} className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm disabled:bg-slate-50" />
                                            </div>
                                        </td>

                                        {/* Input Cbtes Exception */}
                                        <td className="px-4 py-2">
                                            <div className="flex items-center gap-2">
                                                <input type="checkbox" checked={exc.limite_cbte.activo} onChange={e => updateExceptionField(exc.id!, "limite_cbte", "activo", e.target.checked)} className="rounded text-amber-500 border-slate-300 focus:ring-amber-500 h-4 w-4" />
                                                <input type="number" disabled={!exc.limite_cbte.activo} value={exc.limite_cbte.valor} onChange={e => updateExceptionField(exc.id!, "limite_cbte", "valor", Number(e.target.value) || 0)} className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm disabled:bg-slate-50" />
                                            </div>
                                        </td>

                                        {/* Input Dias Exception */}
                                        <td className="px-4 py-2">
                                            <div className="flex items-center gap-2">
                                                <input type="checkbox" checked={exc.limite_dias.activo} onChange={e => updateExceptionField(exc.id!, "limite_dias", "activo", e.target.checked)} className="rounded text-amber-500 border-slate-300 focus:ring-amber-500 h-4 w-4" />
                                                <input type="number" disabled={!exc.limite_dias.activo} value={exc.limite_dias.valor} onChange={e => updateExceptionField(exc.id!, "limite_dias", "valor", Number(e.target.value) || 0)} className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm disabled:bg-slate-50" />
                                            </div>
                                        </td>

                                        <td className="px-4 py-3 text-center">
                                            <button onClick={() => handleRemoveException(exc.id!)} className="text-slate-400 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-50">
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="text-center py-10 px-4 bg-slate-50 border border-slate-200 border-dashed rounded-xl">
                        <ShieldAlert size={32} className="mx-auto text-slate-300 mb-3" />
                        <p className="text-slate-500 text-sm font-medium">No hay excepciones configuradas</p>
                        <p className="text-slate-400 text-xs mt-1">Busca un cliente arriba para añadirle límites personalizados</p>
                    </div>
                )}
            </Card>

            {/* Acciones */}
            <div className="flex justify-end mt-4">
                <Button onClick={handleSave} className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl px-8 py-6 text-base font-bold shadow-xl shadow-violet-200 hover:-translate-y-0.5 transition-all duration-300">
                    Guardar Configuración
                </Button>
            </div>

        </div>
    );
}
