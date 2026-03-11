"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
    Building2, MapPin, Users, RefreshCw, Save, Plus, ChevronDown, ChevronRight, AlertCircle, Database, Shield, Link as LinkIcon, Check
} from "lucide-react";
import { fetchUnifiedDashboard, UnifiedDistributor, editarDistribuidora, crearDistribuidora, saveERPMapping, editarIntegranteAdmin } from "@/lib/api";
import toast from "react-hot-toast";

export default function UnifiedDashboard({ isSuperadmin, currentDistId }: { isSuperadmin: boolean, currentDistId: number }) {
    const [data, setData] = useState<UnifiedDistributor[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [selectedDistId, setSelectedDistId] = useState<number | null>(null);
    const [expandedBranches, setExpandedBranches] = useState<Set<string>>(new Set());
    const [expandedVendors, setExpandedVendors] = useState<Set<string>>(new Set());

    // Edit config forms
    const [configForm, setConfigForm] = useState({ nombre: "", token: "", erp_mapping: "" });

    const loadData = async () => {
        setLoading(true);
        try {
            const res = await fetchUnifiedDashboard();
            // If not superadmin, filter to only show their own distribuidora
            const filtered = isSuperadmin ? res : res.filter(d => d.id_distribuidor === currentDistId);
            setData(filtered);

            if (filtered.length > 0 && !selectedDistId) {
                handleSelectDist(filtered[0]);
            } else if (selectedDistId) {
                // refresh selected details
                const current = filtered.find(d => d.id_distribuidor === selectedDistId);
                if (current) {
                    setConfigForm({
                        nombre: current.nombre_empresa,
                        token: current.token,
                        erp_mapping: current.erp_mapping_name || ""
                    });
                }
            }
        } catch (e: any) {
            toast.error("Error al cargar dashboard unificado");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleSelectDist = (d: UnifiedDistributor) => {
        setSelectedDistId(d.id_distribuidor);
        setConfigForm({
            nombre: d.nombre_empresa,
            token: d.token,
            erp_mapping: d.erp_mapping_name || ""
        });
    };

    const toggleBranch = (branchName: string) => {
        const next = new Set(expandedBranches);
        if (next.has(branchName)) next.delete(branchName);
        else next.add(branchName);
        setExpandedBranches(next);
    };

    const toggleVendor = (vendorName: string) => {
        const next = new Set(expandedVendors);
        if (next.has(vendorName)) next.delete(vendorName);
        else next.add(vendorName);
        setExpandedVendors(next);
    };

    const saveConfig = async () => {
        if (!selectedDistId) return;
        setSaving(true);
        try {
            // 1. Update Distribuidora name & token
            await editarDistribuidora(selectedDistId, {
                nombre: configForm.nombre,
                token: configForm.token
            });
            // 2. Update ERP Mapping name if changed
            await saveERPMapping({
                nombre_erp: configForm.erp_mapping,
                id_distribuidor: selectedDistId
            });
            toast.success("Configuración guardada");
            loadData();
        } catch (e) {
            toast.error("Error guardando configuración");
        } finally {
            setSaving(false);
        }
    };

    const assignVendorToUser = async (idIntegrante: number, idVendedorErp: string | null) => {
        setLoading(true); // show general loading state
        try {
            // Find the location of this vendor implicitly
            let sucursalErp: string | null = null;
            if (idVendedorErp && selectedDist) {
                for (const branch of selectedDist.sucursales) {
                    if (branch.vendedores.some(v => v.id_vendedor_erp === idVendedorErp)) {
                        sucursalErp = branch.nombre_sucursal;
                        break;
                    }
                }
            }

            await editarIntegranteAdmin(idIntegrante, {
                ...getIntegranteData(idIntegrante),
                location_id: sucursalErp,
                id_vendedor_erp: idVendedorErp
            });

            toast.success("Usuario reasignado");
            loadData();
        } catch (e) {
            toast.error("Error asignando usuario");
        }
    };

    // Helper to get existing data for simple updates
    const getIntegranteData = (id: number) => {
        for (const d of data) {
            for (const u of d.unmapped_integrantes) if (u.id_integrante === id) return { nombre_integrante: u.nombre, rol_telegram: u.rol_telegram };
            for (const b of d.sucursales) {
                for (const v of b.vendedores) {
                    for (const u of v.integrantes) if (u.id_integrante === id) return { nombre_integrante: u.nombre, rol_telegram: u.rol_telegram };
                }
            }
        }
        return { nombre_integrante: "Desconocido", rol_telegram: "observador" };
    };


    if (loading && data.length === 0) {
        return <div className="p-12 text-center flex items-center justify-center gap-3"><RefreshCw className="animate-spin text-violet-500" /> Cargando Maestro...</div>;
    }

    const selectedDist = data.find(d => d.id_distribuidor === selectedDistId);

    return (
        <div className="flex flex-col gap-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-center bg-white p-6 rounded-3xl border shadow-sm">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                        <Database className="text-violet-600" /> Centro de Comando Global
                    </h1>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1 opacity-70">
                        ERP 3.0 • Jerarquías y Operaciones
                    </p>
                </div>
                <Button variant="ghost" onClick={loadData} disabled={loading}>
                    <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* LADO IZQUIERDO: ARBOL DE JERARQUIA */}
                <div className="lg:col-span-8 space-y-4">

                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xs font-black uppercase text-slate-400">Jerarquía ERP</h3>
                        {isSuperadmin && (
                            <Button size="sm" variant="outline" className="h-8 border-violet-200 text-violet-700">
                                <Plus size={14} className="mr-1" /> Nuevo Distribuidor
                            </Button>
                        )}
                    </div>

                    <div className="space-y-4 max-h-[700px] overflow-y-auto pr-2 custom-scrollbar">
                        {data.map(dist => {
                            const isActive = dist.id_distribuidor === selectedDistId;
                            return (
                                <div key={dist.id_distribuidor} className={`rounded-2xl border transition-all ${isActive ? "border-violet-500 shadow-md ring-2 ring-violet-50" : "border-slate-200 bg-white opacity-80"}`}>

                                    {/* Distribuidor Header */}
                                    <div
                                        className={`p-4 flex items-center justify-between cursor-pointer rounded-t-2xl ${isActive ? "bg-violet-50/50" : "hover:bg-slate-50"}`}
                                        onClick={() => handleSelectDist(dist)}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isActive ? "bg-violet-100 text-violet-600" : "bg-slate-100 text-slate-500"}`}>
                                                <Building2 size={20} />
                                            </div>
                                            <div>
                                                <h4 className="font-black text-slate-900">{dist.nombre_empresa}</h4>
                                                <p className="text-[10px] text-slate-400 uppercase font-bold text-left tracking-wider">ID: #{dist.id_distribuidor} • {dist.sucursales.length} Sucursales</p>
                                            </div>
                                        </div>
                                        {isActive ? <ChevronDown size={20} className="text-violet-400" /> : <ChevronRight size={20} className="text-slate-300" />}
                                    </div>

                                    {/* Sucursales & Vendedores (Only if active) */}
                                    {isActive && (
                                        <div className="p-4 pt-2 space-y-3 bg-white rounded-b-2xl">
                                            {dist.sucursales.length === 0 && (
                                                <div className="text-center p-4 text-xs text-slate-400">No hay sucursales ERP cargadas para este distribuidor.</div>
                                            )}

                                            {dist.sucursales.map(suc => {
                                                const isSucExpanded = expandedBranches.has(suc.nombre_sucursal);
                                                return (
                                                    <div key={suc.nombre_sucursal} className="border border-slate-100 rounded-xl overflow-hidden">
                                                        <div
                                                            className="px-4 py-3 bg-slate-50 flex items-center justify-between cursor-pointer hover:bg-slate-100/50"
                                                            onClick={() => toggleBranch(suc.nombre_sucursal)}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <MapPin size={16} className="text-emerald-500" />
                                                                <span className="font-bold text-sm text-slate-700">{suc.nombre_sucursal}</span>
                                                            </div>
                                                            <span className="text-[10px] font-bold text-slate-400">{suc.vendedores.length} Rutas</span>
                                                        </div>

                                                        {isSucExpanded && (
                                                            <div className="p-3 space-y-2 bg-white">
                                                                {suc.vendedores.map(ven => {
                                                                    const isVenExpanded = expandedVendors.has(ven.id_vendedor_erp);
                                                                    return (
                                                                        <div key={ven.id_vendedor_erp} className="border border-slate-100 rounded-lg">
                                                                            <div
                                                                                className="px-3 py-2 flex items-center justify-between bg-slate-50/50 cursor-pointer hover:bg-slate-100"
                                                                                onClick={() => toggleVendor(ven.id_vendedor_erp)}
                                                                            >
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className="w-1.5 h-1.5 bg-violet-400 rounded-full" />
                                                                                    <span className="font-bold text-xs text-slate-700">{ven.id_vendedor_erp}</span>
                                                                                </div>
                                                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${ven.integrantes.length > 0 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-400"}`}>
                                                                                    {ven.integrantes.length} Telegrams
                                                                                </span>
                                                                            </div>

                                                                            {isVenExpanded && (
                                                                                <div className="p-2 space-y-1 pl-6 border-t border-slate-50">
                                                                                    {ven.integrantes.map(int => (
                                                                                        <div key={int.id_integrante} className="flex items-center justify-between p-2 bg-blue-50/50 rounded-md border border-blue-100/50">
                                                                                            <div className="flex items-center gap-2">
                                                                                                <Users size={12} className="text-blue-500" />
                                                                                                <span className="text-xs font-semibold text-blue-900">{int.nombre}</span>
                                                                                                <span className="text-[9px] px-1.5 rounded bg-blue-100 text-blue-600 uppercase font-black">{int.rol_telegram}</span>
                                                                                            </div>
                                                                                            {/* Simple action to un-assign */}
                                                                                            <Button
                                                                                                variant="ghost" size="sm"
                                                                                                className="h-6 text-[10px] text-red-500 hover:text-red-600 hover:bg-red-50 py-0"
                                                                                                onClick={() => {
                                                                                                    // Use custom api call to un-assign just to prove concept here
                                                                                                    // We will just do it nicely later or use a different endpoint
                                                                                                }}
                                                                                            >
                                                                                                Desvincular
                                                                                            </Button>
                                                                                        </div>
                                                                                    ))}
                                                                                    {ven.integrantes.length === 0 && (
                                                                                        <div className="text-[10px] text-slate-400 py-1 italic pl-2">Ruta ERP sin operador de Telegram asingado.</div>
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )
                                                                })}
                                                            </div>
                                                        )}

                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}

                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* LADO DERECHO: PANEL CONTEXTUAL */}
                {selectedDist && (
                    <div className="lg:col-span-4 space-y-6">

                        <Card className="p-5 border-t-4 border-t-blue-500 bg-white">
                            <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2">
                                <Shield size={16} className="text-blue-500" /> Configuración
                            </h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Nombre Distribuidor</label>
                                    <input
                                        className="w-full text-sm font-semibold rounded-lg border border-slate-200 px-3 py-2 bg-slate-50"
                                        value={configForm.nombre}
                                        onChange={e => setConfigForm({ ...configForm, nombre: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Token (Telegram Bot)</label>
                                    <input
                                        className="w-full text-sm font-mono text-slate-600 rounded-lg border border-slate-200 px-3 py-2 bg-slate-50"
                                        value={configForm.token}
                                        onChange={e => setConfigForm({ ...configForm, token: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Mapeo ERP (Archivo dsempresa)</label>
                                    <input
                                        className="w-full text-sm font-semibold text-slate-700 rounded-lg border border-slate-200 px-3 py-2 bg-slate-50"
                                        value={configForm.erp_mapping}
                                        onChange={e => setConfigForm({ ...configForm, erp_mapping: e.target.value })}
                                        placeholder="Ej: REAL DISTRIBUCION"
                                    />
                                </div>

                                <Button className="w-full bg-blue-600 hover:bg-blue-700 font-bold" loading={saving} onClick={saveConfig}>
                                    <Save size={16} className="mr-2" /> Guardar Ajustes
                                </Button>
                            </div>
                        </Card>

                        <Card className="p-5 border-t-4 border-t-amber-400 bg-amber-50/30">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-black text-amber-900 flex items-center gap-2">
                                    <AlertCircle size={16} className="text-amber-500" /> Sin Asignar
                                </h3>
                                <span className="bg-amber-100 text-amber-700 text-[10px] font-black px-2 py-0.5 rounded">
                                    {selectedDist.unmapped_integrantes.length}
                                </span>
                            </div>

                            <p className="text-[10px] text-amber-700 mb-3 opacity-80">
                                Estos usuarios de Telegram interactuaron con el bot pero no tienen una ruta de vendedor ERP asignada.
                            </p>

                            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                                {selectedDist.unmapped_integrantes.map(u => (
                                    <div key={u.id_integrante} className="p-3 bg-white border border-amber-200 rounded-xl shadow-sm">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-bold text-slate-800">{u.nombre}</span>
                                            <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 rounded uppercase font-black">{u.rol_telegram}</span>
                                        </div>
                                        {/* Select box logic can go here natively or open a modal */}
                                        <div className="flex gap-2 mt-2">
                                            <select className="text-[10px] rounded-lg border-slate-200 flex-1 py-1" defaultValue="">
                                                <option value="" disabled>Vincular a Vendedor ERP...</option>
                                                {selectedDist.sucursales.flatMap(s => s.vendedores).map(v => (
                                                    <option key={v.id_vendedor_erp} value={v.id_vendedor_erp}>{v.id_vendedor_erp}</option>
                                                ))}
                                            </select>
                                            <Button size="sm" variant="outline" className="h-auto py-1 px-2 border-emerald-200 text-emerald-600 hover:bg-emerald-50">
                                                <LinkIcon size={12} />
                                            </Button>
                                        </div>
                                    </div>
                                ))}

                                {selectedDist.unmapped_integrantes.length === 0 && (
                                    <div className="text-center p-4">
                                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-500 flex items-center justify-center mx-auto mb-2">
                                            <Check size={16} />
                                        </div>
                                        <p className="text-xs text-emerald-700 font-bold">Todo en orden</p>
                                    </div>
                                )}
                            </div>
                        </Card>

                    </div>
                )}

            </div>
        </div>
    );
}
