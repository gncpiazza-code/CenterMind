"use client";

import { useEffect, useState } from "react";
import { Search, MapPin, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageSpinner } from "@/components/ui/Spinner";
import { fetchLocations, crearLocation, editarLocation, type Location } from "@/lib/api";

import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";

const INPUT_CLS = "rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--shelfy-primary)]";

// Arreglar ícono por defecto de Leaflet en Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
    iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

function LocationPicker({ position, setPosition }: { position: [number, number]; setPosition: (p: [number, number]) => void }) {
    useMapEvents({
        click(e) {
            setPosition([e.latlng.lat, e.latlng.lng]);
        },
    });
    return position[0] !== 0 ? <Marker position={position} /> : null;
}

export default function TabSucursales({ isSuperadmin, distId }: { isSuperadmin: boolean; distId: number }) {
    const [locations, setLocations] = useState<Location[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    // Para form de creación o edición
    const [editingLoc, setEditingLoc] = useState<Location | null>(null);
    const [form, setForm] = useState({ ciudad: "", provincia: "", label: "", lat: 0, lon: 0 });

    const load = () => {
        setLoading(true);
        fetchLocations(isSuperadmin ? 1 : distId)
            .then(setLocations)
            .catch((e: Error) => setError(e.message))
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, [distId]); // eslint-disable-line react-hooks/exhaustive-deps

    function handleOpenCrear() {
        setEditingLoc(null);
        setForm({ ciudad: "", provincia: "", label: "", lat: 0, lon: 0 });
        setShowForm(true);
    }

    function handleOpenEditar(loc: Location) {
        setEditingLoc(loc);
        setForm({ ciudad: loc.ciudad, provincia: loc.provincia, label: loc.label, lat: loc.lat || 0, lon: loc.lon || 0 });
        setShowForm(true);
    }

    async function handleGuardar(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
            if (editingLoc) {
                await editarLocation(editingLoc.location_id, form);
            } else {
                await crearLocation(distId, form);
            }
            setShowForm(false);
            load();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Error al guardar sucursal");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-[var(--shelfy-muted)] text-sm">{locations.length} sucursales</p>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--shelfy-muted)]" size={14} />
                        <input
                            type="text"
                            placeholder="Buscar sucursal..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8 rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-3 py-1.5 text-sm focus:outline-none focus:border-[var(--shelfy-primary)] w-[200px]"
                        />
                    </div>
                    <Button size="sm" onClick={handleOpenCrear}>
                        <MapPin size={14} /> Nueva sucursal
                    </Button>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                    {error}
                </div>
            )}

            {showForm && (
                <Card>
                    <h3 className="text-[var(--shelfy-text)] font-semibold mb-4 flex items-center gap-2">
                        <MapPin size={16} className="text-[var(--shelfy-primary)]" />
                        {editingLoc ? "Editar sucursal" : "Crear sucursal"}
                    </h3>
                    <form onSubmit={handleGuardar} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs text-[var(--shelfy-muted)] mb-1">Nombre / Título *</label>
                            <input required placeholder="Depósito Norte" value={form.label}
                                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} className={INPUT_CLS + " w-full"} />
                        </div>
                        <div>
                            <label className="block text-xs text-[var(--shelfy-muted)] mb-1">Ciudad *</label>
                            <input required placeholder="Ciudad" value={form.ciudad}
                                onChange={(e) => setForm((f) => ({ ...f, ciudad: e.target.value }))} className={INPUT_CLS + " w-full"} />
                        </div>
                        <div>
                            <label className="block text-xs text-[var(--shelfy-muted)] mb-1">Provincia *</label>
                            <input required placeholder="Provincia" value={form.provincia}
                                onChange={(e) => setForm((f) => ({ ...f, provincia: e.target.value }))} className={INPUT_CLS + " w-full"} />
                        </div>

                        <div className="col-span-1 md:col-span-2 lg:col-span-3">
                            <label className="block text-xs text-[var(--shelfy-muted)] mb-2 mt-2">
                                Ubicación en el Mapa (Clic central para asignar coordenadas)
                            </label>
                            <div className="h-[250px] w-full rounded-lg overflow-hidden border border-[var(--shelfy-border)] mb-2 z-0 relative">
                                <MapContainer
                                    center={form.lat && form.lon ? [form.lat, form.lon] : [-34.6037, -58.3816]}
                                    zoom={form.lat && form.lon ? 13 : 4}
                                    scrollWheelZoom={true}
                                    className="h-full w-full"
                                    style={{ zIndex: 0 }}
                                >
                                    <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
                                    <LocationPicker
                                        position={[form.lat, form.lon]}
                                        setPosition={(p) => setForm((f) => ({ ...f, lat: p[0], lon: p[1] }))}
                                    />
                                </MapContainer>
                            </div>
                            <p className="text-xs font-mono text-[var(--shelfy-muted)] bg-[var(--shelfy-bg)] p-2 rounded inline-block border border-[var(--shelfy-border)]">
                                {form.lat.toFixed(5)}, {form.lon.toFixed(5)}
                            </p>
                        </div>

                        <div className="md:col-span-2 lg:col-span-3 flex gap-2 pt-2">
                            <Button type="submit" loading={saving} size="sm">Guardar</Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
                        </div>
                    </form>
                </Card>
            )}

            {loading ? <PageSpinner /> : (
                <Card>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-[var(--shelfy-muted)] text-left border-b border-[var(--shelfy-border)]">
                                    <th className="pb-3 pr-4">Nombre (Label)</th>
                                    <th className="pb-3 pr-4">Ubicación</th>
                                    <th className="pb-3 pr-4">Coordenadas</th>
                                    <th className="pb-3 w-8"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {locations.filter(loc =>
                                    loc.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                    loc.ciudad.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                    loc.provincia.toLowerCase().includes(searchQuery.toLowerCase())
                                ).map((loc) => (
                                    <tr key={loc.location_id} className="border-b border-[var(--shelfy-border)] last:border-0 hover:bg-[var(--shelfy-bg)] transition-colors">
                                        <td className="py-3 pr-4 text-[var(--shelfy-text)] font-medium">{loc.label}</td>
                                        <td className="py-3 pr-4 text-[var(--shelfy-muted)]">{loc.ciudad}, {loc.provincia}</td>
                                        <td className="py-3 pr-4 text-[var(--shelfy-muted)] text-xs font-mono">{loc.lat}, {loc.lon}</td>
                                        <td className="py-3 text-right">
                                            <button onClick={() => handleOpenEditar(loc)} className="text-[var(--shelfy-muted)] hover:text-[var(--shelfy-primary)] transition-colors p-1 rounded">
                                                <Edit2 size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {locations.length === 0 && (
                                    <tr><td colSpan={4} className="py-8 text-center text-[var(--shelfy-muted)]">No hay sucursales registradas</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}
        </div>
    );
}
