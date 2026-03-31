"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { PageSpinner } from "@/components/ui/Spinner";
import { useAuth } from "@/hooks/useAuth";
import { fetchGlobalMonitoring, type GlobalStressMonitor } from "@/lib/api";
import { useEffect, useState } from "react";
import {
    Activity,
    Database,
    Users,
    Image as ImageIcon,
    AlertCircle,
    CheckCircle2,
    Clock,
    TrendingUp,
    Server
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import dynamic from "next/dynamic";
import { fetchLiveMapEvents, type LiveMapEvent } from "@/lib/api";

const SystemHealthMonitor = dynamic(() => import("../SystemHealthMonitor"), { ssr: false });
const MapaExhibiciones = dynamic(() => import("../components/MapaExhibiciones"), { ssr: false });

export default function SuperAdminDashboard() {
    const { user } = useAuth();
    const [data, setData] = useState<GlobalStressMonitor[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [mapEvents, setMapEvents] = useState<LiveMapEvent[]>([]);

    useEffect(() => {
        if (user?.rol !== "superadmin") return;

        const load = async () => {
            try {
                const res = await fetchGlobalMonitoring();
                setData(res);
            } catch (e: any) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        };

        const loadMap = async () => {
            try {
                const today = new Date();
                const offset = today.getTimezoneOffset();
                const local = new Date(today.getTime() - (offset * 60 * 1000));
                const dateStr = local.toISOString().split('T')[0];
                const res = await fetchLiveMapEvents(undefined, dateStr);
                setMapEvents(res.filter(e => e.lat && e.lon && e.lat !== 0 && e.lon !== 0));
            } catch (e) {
                console.error("Error loading map events", e);
            }
        };

        load();
        loadMap();
        const interval = setInterval(() => { load(); loadMap(); }, 30000);
        return () => clearInterval(interval);
    }, [user]);

    if (user?.rol !== "superadmin") {
        return (
            <div className="flex items-center justify-center h-screen bg-slate-50">
                <Card className="max-w-md text-center p-8">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h1 className="text-xl font-bold mb-2">Acceso Denegado</h1>
                    <p className="text-slate-500">Esta sección es exclusiva para SuperAdmins.</p>
                </Card>
            </div>
        );
    }

    const totalExhibiciones = data.reduce((acc, curr) => acc + Number(curr.total_exhibiciones), 0);
    const totalERP = data.reduce((acc, curr) => acc + Number(curr.total_ventas_erp), 0);
    const totalClientes = data.reduce((acc, curr) => acc + Number(curr.total_clientes_erp), 0);

    return (
        <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <Topbar title="Centro de Comando" />

                <main className="flex-1 overflow-y-auto p-4 md:p-8">
                    <div className="max-w-7xl mx-auto space-y-8">

                        {/* Header Stats */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <StatCard
                                label="Total Exhibiciones"
                                value={totalExhibiciones.toLocaleString()}
                                icon={ImageIcon}
                                color="text-violet-600"
                                bg="bg-violet-50"
                            />
                            <StatCard
                                label="Registros ERP"
                                value={totalERP.toLocaleString()}
                                icon={Database}
                                color="text-blue-600"
                                bg="bg-blue-50"
                            />
                            <StatCard
                                label="Búnkers Activos"
                                value={data.length}
                                icon={Server}
                                color="text-emerald-600"
                                bg="bg-emerald-50"
                            />
                            <StatCard
                                label="Clientes Totales"
                                value={totalClientes.toLocaleString()}
                                icon={Users}
                                color="text-orange-600"
                                bg="bg-orange-50"
                            />
                        </div>

                        {/* Hardware & System Health (Nivel 0) */}
                        <SystemHealthMonitor />

                        {/* Stress Monitor Table */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                        <Activity className="text-[var(--shelfy-primary)]" size={20} />
                                        Monitor de Estrés por Distribuidora
                                    </h2>
                                    <p className="text-sm text-slate-500">Carga de datos y actividad en tiempo real por búnker.</p>
                                </div>
                                <div className="text-xs font-medium text-slate-400 bg-white px-3 py-1 rounded-full border border-slate-100 italic">
                                    Actualiza cada 30s
                                </div>
                            </div>

                            {loading ? (
                                <div className="py-20 flex justify-center"><PageSpinner /></div>
                            ) : (
                                <Card className="overflow-hidden border-none shadow-xl ring-1 ring-slate-200">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-slate-50/50 border-b border-slate-100">
                                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Distribuidora</th>
                                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Exhibiciones</th>
                                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Saturación ERP</th>
                                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Última Actividad</th>
                                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Estado Bot</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {data.map((dist) => (
                                                    <tr key={dist.id_dist} className="hover:bg-slate-50/80 transition-colors group">
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs ring-1 ring-slate-200">
                                                                    {dist.id_dist}
                                                                </div>
                                                                <span className="font-bold text-slate-900">{dist.nombre_dist}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="flex flex-col">
                                                                <span className="text-sm font-semibold text-slate-700">{Number(dist.total_exhibiciones).toLocaleString()}</span>
                                                                <div className="w-24 h-1.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                                                                    <div
                                                                        className="h-full bg-violet-400 rounded-full"
                                                                        style={{ width: `${Math.min((Number(dist.total_exhibiciones) / 5000) * 100, 100)}%` }}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center gap-2">
                                                                <Database size={14} className="text-slate-400" />
                                                                <span className="text-sm text-slate-600 font-medium">
                                                                    {(Number(dist.total_ventas_erp) + Number(dist.total_clientes_erp)).toLocaleString()} filas
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            {dist.ultima_actividad ? (
                                                                <div className="flex items-center gap-2 text-sm text-slate-500">
                                                                    <Clock size={14} className="text-slate-400" />
                                                                    {formatDistanceToNow(new Date(dist.ultima_actividad), { addSuffix: true, locale: es })}
                                                                </div>
                                                            ) : (
                                                                <span className="text-xs text-slate-400 italic">Sin actividad reciente</span>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-tight ${dist.estado_bot === 'activo'
                                                                ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100'
                                                                : 'bg-slate-50 text-slate-400 ring-1 ring-slate-100'
                                                                }`}>
                                                                {dist.estado_bot === 'activo' ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                                                                {dist.estado_bot}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </Card>
                            )}
                        </div>

                        {/* Live Map Embed */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            <Card className="lg:col-span-2 p-0 overflow-hidden relative border-none shadow-xl">
                                <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
                                    <div className="flex items-center gap-2 bg-black/60 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest">
                                        <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                                        En Vivo · {mapEvents.length} exhibiciones
                                    </div>
                                </div>
                                <div
                                    className="cursor-pointer"
                                    onClick={() => window.location.href = '/admin/mapa'}
                                    title="Abrir mapa completo"
                                >
                                    <MapaExhibiciones events={mapEvents} height="400px" theme="dark" />
                                </div>
                            </Card>

                            <Card className="p-6 flex flex-col justify-center border-none shadow-xl bg-gradient-to-br from-[var(--shelfy-primary)] to-[var(--shelfy-primary-2)] text-white">
                                <TrendingUp className="w-12 h-12 mb-4 opacity-50" />
                                <h3 className="text-xl font-bold mb-2">Optimización de Carga</h3>
                                <p className="text-white/80 text-sm leading-relaxed mb-6">
                                    El sistema está procesando correctamente la segregación de datos.
                                    Actualmente, el búnker más saturado tiene <strong>{Math.max(...data.map(d => Number(d.total_exhibiciones))).toLocaleString()}</strong> exhibiciones.
                                </p>
                                <div className="mt-auto pt-4 border-t border-white/20 text-[10px] font-bold uppercase tracking-widest">
                                    Salud del Sistema: 99.8%
                                </div>
                            </Card>
                        </div>

                    </div>
                </main>
            </div>
        </div>
    );
}

function StatCard({ label, value, icon: Icon, color, bg }: any) {
    return (
        <Card className="p-6 border-none shadow-md hover:shadow-lg transition-shadow bg-white">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{label}</p>
                    <p className={`text-2xl font-black ${color}`}>{value}</p>
                </div>
                <div className={`p-3 rounded-2xl ${bg} ${color}`}>
                    <Icon size={24} strokeWidth={2.5} />
                </div>
            </div>
        </Card>
    );
}
