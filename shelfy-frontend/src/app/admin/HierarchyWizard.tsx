"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
    MapPin,
    Users,
    Network,
    ChevronRight,
    ChevronLeft,
    CheckCircle2,
    Search,
    UserPlus,
    Link2,
    Database,
    Table,
    MessageSquare,
    ArrowRightLeft
} from "lucide-react";
import { fetchLocations, fetchIntegrantes, fetchERPVendedores } from "@/lib/api";
import toast from "react-hot-toast";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export default function HierarchyWizard({ distId }: { distId: number }) {
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);

    // Data states
    const [locations, setLocations] = useState<any[]>([]);
    const [integrantes, setIntegrantes] = useState<any[]>([]);
    const [erpSellers, setErpSellers] = useState<string[]>([]);

    // Selection states
    const [selectedLocId, setSelectedLocId] = useState<number | null>(null);

    const loadInitialData = async () => {
        setLoading(true);
        try {
            const [locs, ints, erp] = await Promise.all([
                fetchLocations(distId),
                fetchIntegrantes(distId),
                fetchERPVendedores(distId)
            ]);
            setLocations(locs);
            setIntegrantes(ints);
            setErpSellers(erp);
        } catch (e) {
            console.error("Error loading wizard data", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadInitialData();
    }, [distId]);

    const handleMapSeller = async (integranteId: number, erpId: string) => {
        const token = localStorage.getItem("shelfy_token");
        try {
            const res = await fetch(`${API_URL}/admin/hierarchy/map-seller`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    dist_id: distId,
                    id_integrante: integranteId,
                    id_vendedor_erp: erpId
                })
            });
            if (res.ok) {
                toast.success("Mapeo guardado");
                loadInitialData();
            }
        } catch (e) {
            toast.error("Error al mapear");
        }
    };

    const nextStep = () => setStep(s => Math.min(s + 1, 4));
    const prevStep = () => setStep(s => Math.max(s - 1, 1));

    return (
        <div className="flex flex-col gap-6 animate-in fade-in duration-500">
            {/* Step Indicator */}
            <div className="grid grid-cols-4 gap-2 mb-2">
                {[
                    { n: 1, label: "Sucursales", icon: MapPin },
                    { n: 2, label: "Telegram", icon: MessageSquare },
                    { n: 3, label: "Mapeo ERP", icon: ArrowRightLeft },
                    { n: 4, label: "Finalizar", icon: CheckCircle2 }
                ].map((s) => (
                    <div key={s.n} className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${step >= s.n ? 'border-[var(--shelfy-primary)] bg-violet-50 text-[var(--shelfy-primary)]' : 'border-[var(--shelfy-border)] text-[var(--shelfy-muted)]'}`}>
                        <s.icon size={18} className={step === s.n ? "animate-pulse" : ""} />
                        <span className="text-[10px] font-black uppercase tracking-widest hidden md:block">{s.label}</span>
                    </div>
                ))}
            </div>

            {/* Step 1: Physical Nodes */}
            {step === 1 && (
                <Card className="min-h-[400px]">
                    <h2 className="text-xl font-black text-[var(--shelfy-text)] mb-4 flex items-center gap-2">
                        <MapPin className="text-violet-500" /> Rama 1.B: Nodos Físicos (Sucursales)
                    </h2>
                    <p className="text-sm text-[var(--shelfy-muted)] mb-6">
                        Define las sucursales o depósitos físicos donde operan tus equipos.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {locations.map(loc => (
                            <div key={loc.location_id} className="p-4 rounded-2xl border-2 border-slate-100 hover:border-violet-200 transition-all group relative bg-white">
                                <div className="font-bold text-slate-800">{loc.label}</div>
                                <div className="text-xs text-slate-500 capitalize">{loc.ciudad}, {loc.provincia}</div>
                                <div className="mt-3 flex items-center gap-2 text-[10px] font-bold text-slate-400">
                                    <Users size={12} /> {integrantes.filter(i => i.location_id === loc.location_id).length} integrantes
                                </div>
                            </div>
                        ))}
                        <button className="p-4 rounded-2xl border-2 border-dashed border-slate-200 hover:border-[var(--shelfy-primary)] hover:bg-violet-50 text-[var(--shelfy-muted)] hover:text-[var(--shelfy-primary)] transition-all flex flex-col items-center justify-center min-h-[100px] gap-2">
                            <Plus size={24} />
                            <span className="text-xs font-bold">Añadir Sucursal</span>
                        </button>
                    </div>
                </Card>
            )}

            {step === 2 && (
                <Card className="min-h-[400px]">
                    <h2 className="text-xl font-black text-[var(--shelfy-text)] mb-4 flex items-center gap-2">
                        <MessageSquare className="text-blue-500" /> Rama 1.C: Capa de Ejecución (Telegram)
                    </h2>
                    <p className="text-sm text-[var(--shelfy-muted)] mb-6">
                        Asocia a los integrantes detectados por el bot a sus sucursales correspondientes.
                    </p>

                    <div className="space-y-3">
                        {integrantes.map(int => (
                            <div key={int.id_integrante} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl group hover:shadow-md transition-all">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold uppercase">
                                        {int.nombre_integrante?.[0] || "?"}
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-800">{int.nombre_integrante}</div>
                                        <div className="text-[10px] font-mono text-slate-400">ID: {int.telegram_user_id}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <select
                                        value={int.location_id || ""}
                                        className="text-xs font-bold border-none bg-slate-100 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-[var(--shelfy-primary)] transition-all"
                                        onChange={(e) => {
                                            // Handle mapping to sucursal (logic would go here)
                                            toast.error("Funcionalidad en desarrollo");
                                        }}
                                    >
                                        <option value="">-- Sin Sucursal --</option>
                                        {locations.map(l => (
                                            <option key={l.location_id} value={l.location_id}>{l.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {step === 3 && (
                <Card className="min-h-[400px]">
                    <h2 className="text-xl font-black text-[var(--shelfy-text)] mb-4 flex items-center gap-2">
                        <ArrowRightLeft className="text-emerald-500" /> Mapeo Inteligente (Bot ↔ ERP)
                    </h2>
                    <p className="text-sm text-[var(--shelfy-muted)] mb-6">
                        Vincula a tus ejecutores de Telegram con sus legajos reales del ERP para habilitar auditorías.
                    </p>

                    <div className="space-y-3">
                        {integrantes.filter(i => i.rol_telegram === 'vendedor').map(int => (
                            <div key={int.id_integrante} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col md:flex-row md:items-center gap-4">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-black text-slate-900">{int.nombre_integrante}</span>
                                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[8px] font-black uppercase rounded-full">Telegram</span>
                                    </div>
                                    <div className="text-xs text-slate-500">{int.nombre_grupo}</div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <Link2 className="text-slate-300" size={16} />
                                    <select
                                        className={`text-sm font-bold rounded-xl px-4 py-2 border-2 transition-all ${int.id_vendedor_erp ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-white'}`}
                                        value={int.id_vendedor_erp || ""}
                                        onChange={(e) => handleMapSeller(int.id_integrante, e.target.value)}
                                    >
                                        <option value="">-- Seleccionar Legajo ERP --</option>
                                        {erpSellers.map(s => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {step === 4 && (
                <Card className="min-h-[400px] flex flex-col items-center justify-center text-center">
                    <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-green-100">
                        <CheckCircle2 size={50} />
                    </div>
                    <h2 className="text-3xl font-black text-slate-900 mb-2">¡Configuración Completa!</h2>
                    <p className="text-slate-500 max-w-sm mb-8">
                        Has mapeado exitosamente la jerarquía de tu distribuidora. "The Law of the System" ahora puede auditar cada carga.
                    </p>

                    <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                        <div className="p-4 rounded-2xl bg-slate-50 text-center">
                            <div className="text-2xl font-black text-slate-800">{locations.length}</div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase">Sucursales</div>
                        </div>
                        <div className="p-4 rounded-2xl bg-slate-50 text-center">
                            <div className="text-2xl font-black text-slate-800">{integrantes.filter(i => i.id_vendedor_erp).length}</div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase">Sellers Mapeados</div>
                        </div>
                    </div>
                </Card>
            )}

            {/* Navigation Buttons */}
            <div className="flex items-center justify-between mt-auto pt-6 border-t border-slate-100">
                <Button
                    variant="ghost"
                    onClick={prevStep}
                    disabled={step === 1}
                    className="text-slate-500 hover:bg-slate-50"
                >
                    <ChevronLeft className="mr-2" size={16} /> Anterior
                </Button>

                <div className="flex gap-2">
                    {step < 4 ? (
                        <Button
                            onClick={nextStep}
                            className="bg-[var(--shelfy-primary)] text-white px-8 shadow-lg shadow-violet-200"
                        >
                            Siguiente <ChevronRight className="ml-2" size={16} />
                        </Button>
                    ) : (
                        <Button
                            onClick={() => window.location.reload()}
                            className="bg-slate-900 text-white px-8"
                        >
                            Finalizar Wizard
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}

function Plus({ size }: { size: number }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>;
}
