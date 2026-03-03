import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { MapPin, Users, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

const INPUT_CLS = "rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--shelfy-primary)]";

export default function TabSucursales({ isSuperadmin, distId, role }: any) {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const token = typeof window !== 'undefined' ? localStorage.getItem("shelfy_token") : null;

    const [locations, setLocations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [showLocForm, setShowLocForm] = useState(false);
    const [locForm, setLocForm] = useState({ label: "", ciudad: "", provincia: "", lat: 0, lon: 0 });

    const [vendedores, setVendedores] = useState<any[]>([]);
    const [showVendForm, setShowVendForm] = useState(false);
    const [vendForm, setVendForm] = useState({ nombre_integrante: "", location_id: "" });

    const canEdit = isSuperadmin || role === "admin" || role === "supervisor";

    const fetchLocations = async () => {
        try {
            const dist = isSuperadmin ? 0 : distId;
            const res = await fetch(`${API_URL}/admin/locations/${dist || 0}`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (res.ok) setLocations(await res.json());
        } catch (e) { console.error(e); }
    };

    const fetchVendedores = async () => {
        try {
            const dist = distId || 0;
            const res = await fetch(`${API_URL}/admin/usuarios/${dist}`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (res.ok) setVendedores(await res.json());
        } catch (e) { console.error(e); }
    };

    useEffect(() => {
        Promise.all([fetchLocations(), fetchVendedores()]).finally(() => setLoading(false));
    }, [token, distId, isSuperadmin]);

    const handleCrearLocation = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canEdit) return;
        try {
            const res = await fetch(`${API_URL}/admin/locations/${distId || 0}`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ ...locForm, location_id: 0 })
            });
            if (res.ok) {
                toast.success("Sucursal creada");
                setShowLocForm(false);
                setLocForm({ label: "", ciudad: "", provincia: "", lat: 0, lon: 0 });
                fetchLocations();
            }
        } catch (e) {
            toast.error("Error al crear sucursal");
        }
    };

    const handleCrearVendedor = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canEdit) return;
        try {
            const res = await fetch(`${API_URL}/admin/integrantes/${distId || 0}`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    nombre_integrante: vendForm.nombre_integrante,
                    rol_telegram: "vendedor",
                    location_id: vendForm.location_id ? Number(vendForm.location_id) : null
                })
            });
            if (res.ok) {
                toast.success("Vendedor creado manualmente");
                setShowVendForm(false);
                setVendForm({ nombre_integrante: "", location_id: "" });
                fetchVendedores();
            }
        } catch (e) {
            toast.error("Error al crear vendedor");
        }
    };

    if (loading) return <div className="p-8 text-center text-[var(--shelfy-textSecondary)] flex items-center justify-center gap-2"><Loader2 className="animate-spin" /> Cargando configuraciones...</div>;

    return (
        <div className="space-y-8 animate-in fade-in duration-300">

            {/* 1. SECCIÓN SUCURSALES (LOCATIONS) */}
            <Card>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    <h3 className="text-lg font-bold text-[var(--shelfy-text)] flex items-center gap-2">
                        <MapPin size={20} className="text-violet-500" />
                        Sucursales
                    </h3>
                    {canEdit && (
                        <Button onClick={() => setShowLocForm(!showLocForm)} size="sm" className="bg-violet-600 hover:bg-violet-700">
                            {showLocForm ? "Cancelar" : "+ Nueva Sucursal"}
                        </Button>
                    )}
                </div>

                {showLocForm && (
                    <div className="mb-6 p-4 bg-slate-50 border border-slate-100 rounded-xl">
                        <form onSubmit={handleCrearLocation} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <input required placeholder="Código/Label (Ej: SUC-01)" value={locForm.label} onChange={e => setLocForm(f => ({ ...f, label: e.target.value }))} className={INPUT_CLS} />
                            <input required placeholder="Ciudad" value={locForm.ciudad} onChange={e => setLocForm(f => ({ ...f, ciudad: e.target.value }))} className={INPUT_CLS} />
                            <input required placeholder="Provincia" value={locForm.provincia} onChange={e => setLocForm(f => ({ ...f, provincia: e.target.value }))} className={INPUT_CLS} />
                            <Button type="submit" size="sm" className="md:col-span-2 lg:col-span-3">Guardar Sucursal</Button>
                        </form>
                    </div>
                )}

                {locations.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-4">No hay sucursales registradas.</p>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {locations.map((loc: any) => (
                            <div key={loc.location_id} className="p-4 rounded-xl border border-slate-200 bg-white hover:border-violet-300 transition-colors shadow-sm">
                                <div className="font-bold text-slate-800 text-lg mb-1">{loc.label}</div>
                                <div className="text-sm text-slate-500 mb-2">{loc.ciudad}, {loc.provincia}</div>
                                <div className="text-xs text-slate-400 font-mono">ID: {loc.location_id}</div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            {/* 2. SECCIÓN VENDEDORES (INTEGRANTES_GRUPO) */}
            <Card>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    <h3 className="text-lg font-bold text-[var(--shelfy-text)] flex items-center gap-2">
                        <Users size={20} className="text-indigo-500" />
                        Personal en Terreno (Vendedores)
                    </h3>
                    {canEdit && (
                        <Button onClick={() => setShowVendForm(!showVendForm)} size="sm" className="bg-indigo-600 hover:bg-indigo-700">
                            {showVendForm ? "Cancelar" : "+ Nuevo Vendedor Manual"}
                        </Button>
                    )}
                </div>

                {showVendForm && (
                    <div className="mb-6 p-4 bg-slate-50 border border-slate-100 rounded-xl">
                        <form onSubmit={handleCrearVendedor} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <input required placeholder="Nombre Apellido" value={vendForm.nombre_integrante} onChange={e => setVendForm(f => ({ ...f, nombre_integrante: e.target.value }))} className={INPUT_CLS} />

                            <select value={vendForm.location_id} onChange={e => setVendForm(f => ({ ...f, location_id: e.target.value }))} className={INPUT_CLS}>
                                <option value="">-- Sin Sucursal Asignada --</option>
                                {locations.map((l: any) => (
                                    <option key={l.location_id} value={l.location_id}>{l.label} - {l.ciudad}</option>
                                ))}
                            </select>

                            <Button type="submit" size="sm" className="md:col-span-2">Crear Vendedor</Button>
                        </form>
                    </div>
                )}

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-3">Nombre</th>
                                <th className="px-4 py-3">Rol</th>
                                <th className="px-4 py-3">Sucursal Asignada</th>
                                <th className="px-4 py-3 text-right">Telegram ID</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {vendedores.length === 0 ? (
                                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">No hay personal registrado.</td></tr>
                            ) : (
                                vendedores.map((v: any) => (
                                    <tr key={v.id_integrante} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 font-medium text-slate-800">{v.nombre_integrante}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 text-xs rounded-full font-bold uppercase tracking-wider ${v.rol_telegram === 'vendedor' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                                                {v.rol_telegram || "Sin rol"}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-600">{v.sucursal_label || 'Ninguna'}</td>
                                        <td className="px-4 py-3 text-right font-mono text-xs text-slate-400">{v.telegram_user_id || 'Manual'}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

        </div>
    );
}
