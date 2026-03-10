"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
    MapPin,
    Users,
    MessageSquare,
    Save,
    RefreshCw,
    AlertCircle,
    CheckCircle2,
    Database,
    ArrowRightLeft,
    Search
} from "lucide-react";
import { fetchHierarchyConfig, saveBulkHierarchy, type HierarchyConfig } from "@/lib/api";
import toast from "react-hot-toast";

export default function InteractiveHierarchy({ distId }: { distId: number }) {
    const [config, setConfig] = useState<HierarchyConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    // Per-integrante mapping state
    const [mappings, setMappings] = useState<Record<number, { location_id: string | null, id_vendedor_erp: string | null }>>({});

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await fetchHierarchyConfig(distId);
            setConfig(data);

            // Initialize mappings from existing data
            const initial: any = {};
            data.integrantes.forEach(int => {
                initial[int.id_integrante] = {
                    location_id: int.location_id,
                    id_vendedor_erp: int.id_vendedor_erp
                };
            });
            setMappings(initial);
        } catch (e) {
            toast.error("Error al cargar configuración");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [distId]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const items = Object.entries(mappings).map(([id, val]) => ({
                id_integrante: Number(id),
                ...val
            }));
            await saveBulkHierarchy(distId, items);
            toast.success("Jerarquía guardada correctamente");
            loadData();
        } catch (e) {
            toast.error("Error al guardar");
        } finally {
            setSaving(false);
        }
    };

    const updateMapping = (id: number, field: "location_id" | "id_vendedor_erp", value: any) => {
        setMappings(prev => ({
            ...prev,
            [id]: { ...prev[id], [field]: value }
        }));
    };

    const suggestMappings = () => {
        if (!config) return;
        const newMappings = { ...mappings };
        let count = 0;

        config.integrantes.forEach(int => {
            if (!int.id_vendedor_erp) {
                // Si el nombre del integrante coincide con algún vendedor del ERP
                const normalizedName = int.nombre_integrante.trim().toUpperCase();
                for (const branch of config.erp_hierarchy) {
                    const match = branch.vendedores.find(v => v.toUpperCase() === normalizedName);
                    if (match) {
                        newMappings[int.id_integrante] = {
                            ...newMappings[int.id_integrante],
                            id_vendedor_erp: match
                        };
                        count++;
                        break;
                    }
                }
            }
        });

        if (count > 0) {
            setMappings(newMappings);
            toast.success(`Se sugirieron ${count} mapeos por coincidencia de nombre.`);
        } else {
            toast.error("No se encontraron coincidencias inteligentes.");
        }
    };

    if (loading) return <div className="p-12 text-center flex items-center justify-center gap-3"><RefreshCw className="animate-spin text-violet-500" /> Cargando Maestro de Sincronización...</div>;
    if (!config) return null;

    const filteredIntegrantes = config.integrantes.filter(int =>
        int.nombre_integrante.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex flex-col gap-8 animate-in fade-in duration-700">

            {/* Cabecera de Control */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-3xl border shadow-sm sticky top-0 z-10 gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                        <Database className="text-violet-600" /> Maestro de Jerarquías
                    </h1>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest opacity-60">
                        Admin Master • Consolidación Automática
                    </p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <Button variant="outline" onClick={suggestMappings} className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 font-bold">
                        <CheckCircle2 size={16} className="mr-2" /> Sugerir Mapeos
                    </Button>
                    <Button variant="ghost" onClick={loadData} disabled={saving}>
                        <RefreshCw size={18} className={saving ? "animate-spin" : ""} />
                    </Button>
                    <Button
                        onClick={handleSave}
                        loading={saving}
                        className="bg-violet-600 hover:bg-violet-700 text-white px-8 shadow-lg shadow-violet-100 font-bold"
                    >
                        <Save className="mr-2" size={18} /> Guardar Cambios
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* Panel Izquierdo: Estructura del ERP (Detected) */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                            <ArrowRightLeft size={14} /> Detectado en ERP
                        </h3>
                        <span className="bg-slate-100 text-slate-500 text-[10px] font-black px-2 py-0.5 rounded-md">
                            {config.erp_hierarchy.length} SUC
                        </span>
                    </div>

                    <div className="max-h-[800px] overflow-y-auto pr-2 space-y-4 custom-scrollbar">
                        {config.erp_hierarchy.map(branch => (
                            <Card key={branch.sucursal_erp} className="border-l-4 border-l-violet-500 p-5 bg-white hover:shadow-md transition-all">
                                <div className="flex items-start justify-between mb-4">
                                    <div>
                                        <div className="font-black text-slate-900 text-sm uppercase leading-tight">{branch.sucursal_erp}</div>
                                        <div className="text-[10px] text-slate-400 font-mono mt-1">SINC: OK (EXCEL)</div>
                                    </div>
                                    <div className="bg-violet-100 text-violet-700 text-[9px] font-black px-2.5 py-1 rounded-lg">ERP DATA</div>
                                </div>
                                <div className="space-y-1.5">
                                    {branch.vendedores.map(v => (
                                        <div key={v} className="bg-slate-50 p-2.5 rounded-xl text-xs font-bold text-slate-600 border border-slate-100 flex items-center justify-between group hover:bg-white hover:border-violet-200 transition-colors">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                                                {v}
                                            </div>
                                            <div className="text-[9px] text-slate-300 opacity-0 group-hover:opacity-100">Ready</div>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>

                {/* Panel Central/Derecho: Mapeador Interactivo */}
                <div className="lg:col-span-8 space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                            <Users size={14} /> Integrantes de Telegram
                        </h3>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                            <input
                                type="text"
                                placeholder="Buscar vendedor..."
                                className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-violet-500 w-full sm:w-64 transition-all"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="bg-white rounded-[2rem] border border-slate-100 overflow-hidden shadow-sm">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50/50 text-slate-400 text-[10px] uppercase font-black tracking-[0.1em]">
                                <tr>
                                    <th className="px-8 py-5">Usuario Telegram</th>
                                    <th className="px-8 py-5">Sucursal Shelfy</th>
                                    <th className="px-8 py-5">Vínculo ERP</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredIntegrantes.map(int => {
                                    const m = mappings[int.id_integrante] || { location_id: null, id_vendedor_erp: null };
                                    const isMapped = !!m.id_vendedor_erp && !!m.location_id;

                                    return (
                                        <tr key={int.id_integrante} className={`transition-all hover:bg-slate-50/80 ${isMapped ? 'bg-emerald-50/10' : ''}`}>
                                            <td className="px-8 py-6">
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-12 h-12 rounded-[1rem] flex items-center justify-center font-black text-lg transition-transform hover:scale-105 cursor-default ${isMapped ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-100' : 'bg-slate-100 text-slate-400'}`}>
                                                        {int.nombre_integrante?.[0] || "?"}
                                                    </div>
                                                    <div>
                                                        <div className="font-black text-slate-800 text-sm leading-tight mb-1">{int.nombre_integrante}</div>
                                                        <div className="flex items-center gap-2">
                                                            <div className="bg-blue-50 text-blue-600 text-[8px] font-black tracking-widest uppercase px-2 py-0.5 rounded-full">{int.nombre_grupo || "S/N"}</div>
                                                            <span className="text-[10px] text-slate-300 font-mono">#{int.id_integrante}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-8 py-6">
                                                <select
                                                    className="w-full text-xs font-bold bg-slate-50 hover:bg-white border-2 border-transparent hover:border-violet-100 rounded-2xl px-5 py-3 outline-none focus:ring-4 focus:ring-violet-500/10 transition-all cursor-pointer appearance-none"
                                                    value={m.location_id || ""}
                                                    onChange={e => updateMapping(int.id_integrante, "location_id", e.target.value || null)}
                                                >
                                                    <option value="">-- Sin Sucursal --</option>
                                                    {config.locations.map(loc => (
                                                        <option key={loc.location_id} value={loc.location_id}>{loc.label}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td className="px-8 py-6">
                                                <select
                                                    className={`w-full text-xs font-bold border-2 rounded-2xl px-5 py-3 outline-none transition-all cursor-pointer appearance-none ${m.id_vendedor_erp ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-100 bg-white hover:border-violet-100'}`}
                                                    value={m.id_vendedor_erp || ""}
                                                    onChange={e => updateMapping(int.id_integrante, "id_vendedor_erp", e.target.value || null)}
                                                >
                                                    <option value="" className="text-slate-400">⚡ NO VINCULADO</option>
                                                    {config.erp_hierarchy.map(branch => (
                                                        <optgroup key={branch.sucursal_erp} label={branch.sucursal_erp} className="text-slate-900">
                                                            {branch.vendedores.map(v => (
                                                                <option key={v} value={v} className="text-slate-700 font-bold">{v}</option>
                                                            ))}
                                                        </optgroup>
                                                    ))}
                                                </select>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Sub-footer Info */}
            <div className="bg-slate-50 p-6 rounded-[2rem] border border-dashed border-slate-200 flex flex-wrap gap-8 items-center justify-center">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-500" />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Vinculados: {Object.values(mappings).filter(m => m.id_vendedor_erp && m.location_id).length}</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-slate-300" />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Incompletos: {config.integrantes.length - Object.values(mappings).filter(m => m.id_vendedor_erp && m.location_id).length}</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-violet-500" />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Sucursales ERP: {config.erp_hierarchy.length}</span>
                </div>
            </div>

            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #e2e8f0;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #cbd5e1;
                }
            `}</style>
        </div>
    );
}
