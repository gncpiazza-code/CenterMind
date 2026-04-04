"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import {
    Activity,
    Cpu,
    HardDrive,
    Zap,
    Clock,
    Server,
    ShieldAlert,
    RefreshCw
} from "lucide-react";
import { fetchSystemHealth, type SystemHealth } from "@/lib/api";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

export default function SystemHealthMonitor() {
    const [health, setHealth] = useState<SystemHealth | null>(null);
    const [loading, setLoading] = useState(true);
    const [history, setHistory] = useState<any[]>([]);

    const load = async () => {
        try {
            const data = await fetchSystemHealth();
            setHealth(data);

            // Limit history to last 10 points
            setHistory(prev => {
                const newPoint = {
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    cpu: data?.hardware?.cpu_percent ?? 0,
                    ram: data?.hardware?.ram_percent ?? 0
                };
                const shifted = [...prev, newPoint];
                if (shifted.length > 20) return shifted.slice(1);
                return shifted;
            });
        } catch (e) {
            console.error("Error fetching system health", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        const interval = setInterval(load, 5000); // Poll every 5s for high-res monitoring
        return () => clearInterval(interval);
    }, []);

    if (loading && !health) return <div className="h-64 flex items-center justify-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400">Analizando Hardware...</div>;

    return (
        <div className="space-y-6 animate-in fade-in duration-700">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                    <Zap className="text-amber-500 fill-amber-500" size={24} />
                    Estado Vital del Búnker Central
                </h2>
                <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Real-Time Core</span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* CPU usage */}
                <HealthCard
                    label="Carga de CPU"
                    value={`${health?.hardware.cpu_percent || 0}%`}
                    icon={Cpu}
                    detail={`${health?.hardware.process_count || 0} procesos activos`}
                    status={(health?.hardware?.cpu_percent ?? 0) > 80 ? 'danger' : (health?.hardware?.cpu_percent ?? 0) > 50 ? 'warning' : 'success'}
                />
                {/* RAM usage */}
                <HealthCard
                    label="Uso de Memoria"
                    value={`${health?.hardware?.ram_percent ?? 0}%`}
                    icon={Activity}
                    detail={`${(health?.hardware?.ram_gb_used ?? 0).toFixed(1)}GB / ${(health?.hardware?.ram_gb_total ?? 0).toFixed(0)}GB`}
                    status={(health?.hardware?.ram_percent ?? 0) > 85 ? 'danger' : (health?.hardware?.ram_percent ?? 0) > 70 ? 'warning' : 'success'}
                />
                {/* Active Sessions */}
                <HealthCard
                    label="Sesiones Bot"
                    value={health?.sessions.active_bot_sessions || 0}
                    icon={Zap}
                    detail={`Hoy: ${health?.sessions.total_users_today || 0} usuarios`}
                    status="success"
                />
                {/* Storage */}
                <HealthCard
                    label="Almacenamiento DB"
                    value={health?.database.total_db_size || "0MB"}
                    icon={HardDrive}
                    detail={`${health?.database?.tables?.length || 0} tablas monitoreadas`}
                    status="success"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Real-time Graph */}
                <Card className="lg:col-span-2 p-6">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6">Gráfico de Stress (Tiempo Real)</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                            <AreaChart data={history}>
                                <defs>
                                    <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorRam" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ec4899" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                                <XAxis dataKey="time" hide />
                                <YAxis hide domain={[0, 100]} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                />
                                <Area type="monotone" dataKey="cpu" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorCpu)" strokeWidth={3} name="CPU %" />
                                <Area type="monotone" dataKey="ram" stroke="#ec4899" fillOpacity={1} fill="url(#colorRam)" strokeWidth={3} name="RAM %" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                {/* DB Table Stats */}
                <Card className="p-6">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6">Storage por Tabla</h3>
                    <div className="space-y-4">
                        {health?.database?.tables?.map(table => (
                            <div key={table.table_name} className="flex flex-col gap-1.5">
                                <div className="flex justify-between items-center px-1">
                                    <span className="text-xs font-black text-slate-700 font-mono">{table.table_name}</span>
                                    <span className="text-[10px] font-bold text-slate-400">{table.total_size}</span>
                                </div>
                                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                    <div
                                        className="bg-indigo-500 h-full rounded-full transition-all duration-1000"
                                        style={{ width: `${Math.min((table.row_count / 1000) * 100, 100)}%` }} // Scaling by 1k rows just for visual
                                    />
                                </div>
                                <div className="flex justify-end">
                                    <span className="text-[9px] font-bold text-slate-500">{table.row_count.toLocaleString()} filas</span>
                                </div>
                            </div>
                        )).slice(0, 5)}
                    </div>
                </Card>
            </div>
        </div>
    );
}

function HealthCard({ label, value, icon: Icon, detail, status }: any) {
    const statusColors = {
        success: 'text-emerald-500 bg-emerald-50 border-emerald-100',
        warning: 'text-amber-500 bg-amber-50 border-amber-100',
        danger: 'text-red-500 bg-red-50 border-red-100'
    };

    return (
        <Card className="p-5 border-none shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
            <div className="flex justify-between items-start mb-4 relative z-10">
                <div className={`p-2.5 rounded-xl ${statusColors[status as keyof typeof statusColors]}`}>
                    <Icon size={20} />
                </div>
                <div className="text-right">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
                    <p className="text-2xl font-black text-slate-900">{value}</p>
                </div>
            </div>
            <div className="relative z-10">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                    <ShieldAlert size={12} className="opacity-50" />
                    {detail}
                </div>
            </div>
            {/* Decoration */}
            <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-gradient-to-br from-slate-100 to-transparent rounded-full group-hover:scale-150 transition-transform duration-700"></div>
        </Card>
    );
}
