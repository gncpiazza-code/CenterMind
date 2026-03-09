"use client";

import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Settings2, Plus, Trash2, Search, SlidersHorizontal, ShieldAlert, BadgeInfo, Check, Loader2 } from "lucide-react";

import { fetchERPConfig, saveERPConfig, fetchClientesListado } from "@/lib/api";

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

// Hook simple para clicks fuera
function useOnClickOutside(ref: React.RefObject<HTMLDivElement | null>, handler: () => void) {
    useEffect(() => {
        const listener = (event: MouseEvent | TouchEvent) => {
            if (!ref.current || ref.current.contains(event.target as Node)) return;
            handler();
        };
        document.addEventListener("mousedown", listener);
        document.addEventListener("touchstart", listener);
        return () => {
            document.removeEventListener("mousedown", listener);
            document.removeEventListener("touchstart", listener);
        };
    }, [ref, handler]);
}

export default function TabAlertasCredito({ distId }: { distId: number }) {
    const [reglas, setReglas] = useState<ReglasGenerales>(DEFAULT_REGLAS);
    const [excepciones, setExcepciones] = useState<Excepcion[]>([]);
    const [montoExt, setMontoExt] = useState("");
    const [cbteExt, setCbteExt] = useState("");
    const [diasExt, setDiasExt] = useState("");
    const [toastMessage, setToastMessage] = useState("");
    const [loading, setLoading] = useState(false);

    // Búsqueda de clientes para excepciones
    const [searchExcepcion, setSearchExcepcion] = useState("");
    const [filteredClients, setFilteredClients] = useState<any[]>([]);
    const [searching, setSearching] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const [selectedClient, setSelectedClient] = useState<any | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useOnClickOutside(dropdownRef, () => setShowDropdown(false));

    useEffect(() => {
        setLoading(true);
        fetchERPConfig(distId)
            .then(data => {
                setReglas({
                    limite_dinero: {
                        activo: data.limite_dinero_activo !== undefined ? data.limite_dinero_activo : true,
                        valor: data.limite_dinero || 500000
                    },
                    limite_cbte: {
                        activo: data.limite_cbte_activo !== undefined ? data.limite_cbte_activo : true,
                        valor: data.limite_cbte || 3
                    },
                    limite_dias: {
                        activo: data.limite_dias_activo !== undefined ? data.limite_dias_activo : true,
                        valor: data.limite_dias || 0
                    },
                });
                if (data.excepciones) {
                    setExcepciones(data.excepciones);
                }
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [distId]);

    // Llenar estados locales al cargar reglas
    useEffect(() => {
        setMontoExt(reglas.limite_dinero.valor.toString());
        setCbteExt(reglas.limite_cbte.valor.toString());
        setDiasExt(reglas.limite_dias.valor.toString());
    }, [reglas]);

    // Debounce búsqueda de clientes
    useEffect(() => {
        if (searchExcepcion.length < 2) {
            setFilteredClients([]);
            return;
        }
        setSearching(true);
        const timer = setTimeout(() => {
            fetchClientesListado(distId, searchExcepcion, 10)
                .then(setFilteredClients)
                .catch(console.error)
                .finally(() => setSearching(false));
        }, 300);
        return () => clearTimeout(timer);
    }, [searchExcepcion, distId]);

    const handleSave = async () => {
        setLoading(true);
        try {
            await saveERPConfig(distId, {
                limite_dinero: Number(montoExt) || 0,
                limite_cbte: Number(cbteExt) || 0,
                limite_dias: Number(diasExt) || 0,
                activo: true, // Master switch
                limite_dinero_activo: reglas.limite_dinero.activo,
                limite_cbte_activo: reglas.limite_cbte.activo,
                limite_dias_activo: reglas.limite_dias.activo,
                excepciones: excepciones // SAVE EXCEPTIONS TO DB
            });

            setToastMessage("Configuración guardada exitosamente");
            setTimeout(() => setToastMessage(""), 3000);
        } catch (e) {
            setToastMessage("Error al guardar");
            setTimeout(() => setToastMessage(""), 3000);
        } finally {
            setLoading(false);
        }
    };

    const handleAddException = () => {
        if (!selectedClient) return;

        const newException: Excepcion = {
            id: crypto.randomUUID(),
            cliente: `${selectedClient.numero_cliente_local} - ${selectedClient.nombre_cliente}`,
            limite_dinero: { activo: true, valor: Number(montoExt) * 1.5 },
            limite_cbte: { activo: reglas.limite_cbte.activo, valor: Number(cbteExt) },
            limite_dias: { activo: reglas.limite_dias.activo, valor: Number(diasExt) },
        };

        setExcepciones([...excepciones, newException]);
        setSearchExcepcion("");
        setSelectedClient(null);
        setShowDropdown(false);
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
                <div className="fixed top-4 right-4 z-[100] bg-green-50 text-green-700 border border-green-200 px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-in slide-in-from-top-4 fade-in">
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
                        <p className="text-sm text-slate-500">Control de alertas automáticas para todos los clientes.</p>
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
            <Card className="border-t-4 border-t-amber-500 overflow-visible">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
                        <ShieldAlert size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 tracking-tight">Excepciones de Clientes (Crédito Especial)</h2>
                        <p className="text-sm text-slate-500">Aumenta los límites para clientes específicos de confianza.</p>
                    </div>
                </div>

                {/* Buscador y Añadir */}
                <div className="flex flex-col md:flex-row gap-2 max-w-2xl mb-6 relative">
                    <div className="relative flex-1" ref={dropdownRef}>
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            value={searchExcepcion}
                            autoComplete="off"
                            onChange={e => { setSearchExcepcion(e.target.value); setShowDropdown(true); }}
                            onFocus={() => setShowDropdown(true)}
                            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none text-sm text-slate-700 transition-all font-medium"
                            placeholder="Buscar por ID, Razón Social o Nombre..."
                        />
                        {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400" size={16} />}

                        {showDropdown && searchExcepcion.length >= 2 && (
                            <div className="absolute z-50 top-full mt-1 left-0 w-full bg-white border border-slate-200 shadow-xl rounded-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                {filteredClients.length === 0 && !searching ? (
                                    <div className="p-4 text-center text-sm text-slate-400">Sin resultados</div>
                                ) : (
                                    <div className="max-h-60 overflow-y-auto">
                                        {filteredClients.map(c => (
                                            <button
                                                key={c.id_cliente}
                                                onClick={() => { setSelectedClient(c); setSearchExcepcion(`${c.numero_cliente_local} - ${c.nombre_cliente}`); setShowDropdown(false); }}
                                                className="w-full flex flex-col items-start px-4 py-3 hover:bg-slate-50 border-b border-slate-50 last:border-0 transition-colors"
                                            >
                                                <span className="text-xs font-black text-amber-600 uppercase tracking-widest">{c.numero_cliente_local}</span>
                                                <span className="text-sm font-bold text-slate-800">{c.nombre_cliente}</span>
                                                <span className="text-[10px] text-slate-400 uppercase font-medium">{c.localidad || '-'} | {c.razon_social || '-'}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <Button onClick={handleAddException} disabled={!selectedClient} className="bg-amber-500 hover:bg-amber-600 text-white rounded-xl px-4 h-[42px] shrink-0 transition-colors shadow-lg shadow-amber-200 disabled:opacity-50 disabled:shadow-none">
                        <Plus size={18} className="mr-1" />
                        Añadir Excepción
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
                                        <td className="px-4 py-2">
                                            <div className="flex items-center gap-2">
                                                <input type="checkbox" checked={exc.limite_dinero.activo} onChange={e => updateExceptionField(exc.id!, "limite_dinero", "activo", e.target.checked)} className="rounded text-amber-500 border-slate-300 focus:ring-amber-500 h-4 w-4" />
                                                <input type="number" disabled={!exc.limite_dinero.activo} value={exc.limite_dinero.valor} onChange={e => updateExceptionField(exc.id!, "limite_dinero", "valor", Number(e.target.value) || 0)} className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm disabled:bg-slate-50" />
                                            </div>
                                        </td>
                                        <td className="px-4 py-2">
                                            <div className="flex items-center gap-2">
                                                <input type="checkbox" checked={exc.limite_cbte.activo} onChange={e => updateExceptionField(exc.id!, "limite_cbte", "activo", e.target.checked)} className="rounded text-amber-500 border-slate-300 focus:ring-amber-500 h-4 w-4" />
                                                <input type="number" disabled={!exc.limite_cbte.activo} value={exc.limite_cbte.valor} onChange={e => updateExceptionField(exc.id!, "limite_cbte", "valor", Number(e.target.value) || 0)} className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm disabled:bg-slate-50" />
                                            </div>
                                        </td>
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
                        <Search size={32} className="mx-auto text-slate-300 mb-3" />
                        <p className="text-slate-500 text-sm font-medium">No hay excepciones configuradas</p>
                        <p className="text-slate-400 text-xs mt-1">Busca un cliente arriba para añadirle límites personalizados</p>
                    </div>
                )}
            </Card>

            {/* Acciones */}
            <div className="flex justify-end mt-4">
                <Button onClick={handleSave} loading={loading} className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl px-8 py-6 text-base font-bold shadow-xl shadow-violet-200 hover:-translate-y-0.5 transition-all duration-300">
                    Guardar Configuración
                </Button>
            </div>

        </div>
    );
}
