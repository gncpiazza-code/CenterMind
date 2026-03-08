"use client";

import React, { useEffect, useState } from "react";
import { fetchOrphanVendedores, fetchIntegrantes, mapSellerERP, type OrphanVendedor, type Integrante } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { PageSpinner } from "@/components/ui/Spinner";
import { AlertCircle, Link as LinkIcon, CheckCircle2 } from "lucide-react";

interface IdentityWallProps {
    distId: number;
    children: React.ReactNode;
}

export function IdentityWall({ distId, children }: IdentityWallProps) {
    const [orphans, setOrphans] = useState<OrphanVendedor[]>([]);
    const [integrantes, setIntegrantes] = useState<Integrante[]>([]);
    const [loading, setLoading] = useState(true);
    const [mapping, setMapping] = useState<Record<string, number>>({});
    const [processing, setProcessing] = useState(false);
    const [allLinked, setAllLinked] = useState(false);

    const loadData = async () => {
        try {
            const [o, i] = await Promise.all([
                fetchOrphanVendedores(distId),
                fetchIntegrantes(distId)
            ]);
            setOrphans(o);
            setIntegrantes(i);
            if (o.length === 0) setAllLinked(true);
        } catch (error) {
            console.error("Error loading identity wall data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [distId]);

    const handleLink = async () => {
        setProcessing(true);
        try {
            // Map each orphan to the selected integrante
            for (const [vendedorErp, integranteId] of Object.entries(mapping)) {
                if (integranteId) {
                    await mapSellerERP({
                        dist_id: distId,
                        id_integrante: integranteId,
                        id_vendedor_erp: vendedorErp // We use the name as ID for now or the ERP code
                    });
                }
            }
            // Refresh
            const o = await fetchOrphanVendedores(distId);
            setOrphans(o);
            if (o.length === 0) setAllLinked(true);
            setMapping({});
        } catch (error) {
            alert("Error al vincular vendedores. Revisa la consola.");
        } finally {
            setProcessing(false);
        }
    };

    if (loading) return <PageSpinner />;
    if (allLinked) return <>{children}</>;

    return (
        <div className="fixed inset-0 z-[9999] bg-slate-900/95 backdrop-blur-sm flex items-center justify-center p-4">
            <Card className="max-w-2xl w-full bg-white shadow-2xl border-t-4 border-red-500 overflow-hidden">
                <div className="p-6">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                            <AlertCircle size={28} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-900">Operación Bloqueada</h2>
                            <p className="text-sm text-slate-500">
                                Tienes <b>{orphans.length}</b> legajos comerciales del ERP sin vincular a usuarios de Telegram.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-2 mb-8 custom-scrollbar">
                        {orphans.map((o) => (
                            <div key={o.vendedor_erp} className="flex flex-col gap-2 p-3 rounded-lg border border-slate-100 bg-slate-50">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Vendedor ERP</span>
                                        <p className="font-semibold text-slate-800">{o.vendedor_erp}</p>
                                        <p className="text-xs text-slate-500">{o.sucursal_erp} · {o.total_clientes_erp} clientes</p>
                                    </div>
                                    <div className="flex items-center text-slate-400">
                                        <LinkIcon size={16} />
                                    </div>
                                    <div className="w-1/2">
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Usuario Telegram</span>
                                        <select
                                            className="w-full mt-1 text-sm p-2 rounded border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                            value={mapping[o.vendedor_erp] || ""}
                                            onChange={(e) => setMapping({ ...mapping, [o.vendedor_erp]: Number(e.target.value) })}
                                        >
                                            <option value="">Seleccionar...</option>
                                            {integrantes
                                                .filter(i => !i.id_vendedor_erp) // Only show unlinked members
                                                .map(i => (
                                                    <option key={i.id_integrante} value={i.id_integrante}>
                                                        {i.nombre_integrante} ({i.rol_telegram})
                                                    </option>
                                                ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex flex-col gap-3">
                        <button
                            onClick={handleLink}
                            disabled={processing || Object.keys(mapping).length === 0}
                            className="w-full py-3 px-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                        >
                            {processing ? (
                                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                            ) : (
                                <CheckCircle2 size={20} />
                            )}
                            {processing ? "Guardando..." : "Vincular y Desbloquear"}
                        </button>
                        <p className="text-[10px] text-center text-slate-400 uppercase tracking-widest">
                            Integridad de datos Shelfy v4.0
                        </p>
                    </div>
                </div>
            </Card>
        </div>
    );
}
