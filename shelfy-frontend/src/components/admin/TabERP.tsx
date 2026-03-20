"use client";

import { useEffect, useState } from "react";
import { FileSpreadsheet, UploadCloud, Building2, Plus, Trash2, AlertTriangle, RefreshCw, Check } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { 
  uploadERPFile, fetchERPMappings, saveERPMapping, deleteERPMapping, 
  fetchUnknownCompanies, mapUnknownCompany,
  fetchHierarchySucursales, fetchHierarchyVendedores, fetchHierarchyRutas, fetchHierarchyClientesPDV,
  type ERPMapping, type UnknownCompany
} from "@/lib/api";

const INPUT_CLS = "rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--shelfy-primary)]";

interface TabERPProps {
  distId: number;
  isSuperadmin: boolean;
}

export default function TabERP({ distId, isSuperadmin }: TabERPProps) {
  const [fileVentas, setFileVentas] = useState<File | null>(null);
  const [fileClientes, setFileClientes] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const [mappings, setMappings] = useState<ERPMapping[]>([]);
  const [showMapForm, setShowMapForm] = useState(false);
  const [mapForm, setMapForm] = useState({ nombre_erp: "", id_distribuidor: distId });

  const [unknownCompanies, setUnknownCompanies] = useState<UnknownCompany[]>([]);
  const [loadingUnknown, setLoadingUnknown] = useState(false);

  useEffect(() => {
    loadMappings();
    if (isSuperadmin) loadUnknown();
  }, [isSuperadmin]);

  async function loadUnknown() {
    setLoadingUnknown(true);
    try {
      const data = await fetchUnknownCompanies();
      setUnknownCompanies(data);
    } catch (e) { console.error(e); }
    finally { setLoadingUnknown(false); }
  }

  async function handleMapUnknown(nombre_erp: string, id_dist: number) {
    if (!id_dist) return;
    setLoading(true);
    try {
      await mapUnknownCompany({ nombre_erp, id_distribuidor: id_dist });
      setResult({ msg: `✅ Empresa ${nombre_erp} mapeada correctamente`, type: "ok" });
      loadMappings();
      loadUnknown();
    } catch (e: unknown) {
      setResult({ msg: `❌ Error: ${e instanceof Error ? e.message : "Error desconocido"}`, type: "err" });
    } finally {
      setLoading(false);
    }
  }

  async function loadMappings() {
    try {
      const data = await fetchERPMappings();
      setMappings(data);
    } catch (e) { console.error(e); }
  }

  async function handleSaveMapping(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await saveERPMapping(mapForm);
      setShowMapForm(false);
      setMapForm({ nombre_erp: "", id_distribuidor: distId });
      loadMappings();
    } catch (e: unknown) {
      setResult({ msg: `❌ Error: ${e instanceof Error ? e.message : "Error desconocido"}`, type: "err" });
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteMapping(nombre: string) {
    if (!confirm("¿Eliminar este mapeo?")) return;
    try {
      await deleteERPMapping(nombre);
      loadMappings();
    } catch (e: unknown) {
      setResult({ msg: `❌ Error: ${e instanceof Error ? e.message : "Error desconocido"}`, type: "err" });
    }
  }

  async function handleUpload(tipo: "ventas" | "clientes") {
    const file = tipo === "ventas" ? fileVentas : fileClientes;
    if (!file) return;

    setLoading(true);
    setResult(null);
    try {
      const res = await uploadERPFile(tipo, file);
      setResult({ msg: `✅ ${res.message} (${res.count} registros)`, type: "ok" });
      if (tipo === "ventas") setFileVentas(null);
      else setFileClientes(null);
    } catch (e: unknown) {
      setResult({ msg: `❌ Error: ${e instanceof Error ? e.message : "Error desconocido"}`, type: "err" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl animate-in fade-in slide-in-from-bottom-2 duration-400">
      <Card className="relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full -mr-16 -mt-16 blur-3xl" />
        
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-200">
            <FileSpreadsheet size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Gestión ERP</h1>
            <p className="text-sm text-slate-500 font-medium">Sincronización manual de datos y mapeo de empresas.</p>
          </div>
        </div>

        {result && (
          <div className={`mb-8 p-4 rounded-2xl text-sm font-bold border flex items-center gap-3 animate-in zoom-in-95 duration-200 ${
            result.type === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-rose-50 border-rose-200 text-rose-700"
          }`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
              result.type === "ok" ? "bg-emerald-200/50" : "bg-rose-200/50"
            }`}>
              {result.type === "ok" ? <Check size={16} /> : <AlertTriangle size={16} />}
            </div>
            {result.msg}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Ventas */}
          <div className="group p-8 rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/30 hover:bg-white hover:border-blue-400 hover:shadow-xl hover:shadow-blue-50 transition-all duration-300 flex flex-col items-center text-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-white shadow-md flex items-center justify-center text-slate-400 group-hover:text-blue-500 group-hover:scale-110 transition-all">
              <UploadCloud size={32} />
            </div>
            <div>
              <p className="font-black text-slate-900 text-base">Informe de Ventas</p>
              <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-bold">Planilla Excel (.xlsx)</p>
            </div>
            <div className="w-full relative">
               <input
                type="file"
                accept=".xlsx"
                onChange={e => setFileVentas(e.target.files?.[0] || null)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className="py-3 px-4 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-600 truncate">
                {fileVentas ? fileVentas.name : "Seleccionar archivo..."}
              </div>
            </div>
            <Button
              size="sm"
              disabled={!fileVentas || loading}
              loading={loading && !!fileVentas}
              onClick={() => handleUpload("ventas")}
              className="w-full shadow-lg shadow-blue-200"
            >
              Procesar Informe
            </Button>
          </div>

          {/* Clientes */}
          <div className="group p-8 rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/30 hover:bg-white hover:border-indigo-400 hover:shadow-xl hover:shadow-indigo-50 transition-all duration-300 flex flex-col items-center text-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-white shadow-md flex items-center justify-center text-slate-400 group-hover:text-indigo-500 group-hover:scale-110 transition-all">
              <UploadCloud size={32} />
            </div>
            <div>
              <p className="font-black text-slate-900 text-base">Padrón de Clientes</p>
              <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-bold">Planilla Excel (.xlsx)</p>
            </div>
            <div className="w-full relative">
               <input
                type="file"
                accept=".xlsx"
                onChange={e => setFileClientes(e.target.files?.[0] || null)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className="py-3 px-4 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-600 truncate">
                {fileClientes ? fileClientes.name : "Seleccionar archivo..."}
              </div>
            </div>
            <Button
              size="sm"
              disabled={!fileClientes || loading}
              loading={loading && !!fileClientes}
              onClick={() => handleUpload("clientes")}
              className="w-full shadow-lg shadow-indigo-200 variant-secondary"
            >
              Procesar Padrón
            </Button>
          </div>
        </div>

        <div className="mt-12 pt-10 border-t border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                <Building2 size={18} />
              </div>
              <h3 className="text-base font-black text-slate-900">Mapeo de Compañías ERP</h3>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setShowMapForm(!showMapForm)} className="gap-2">
              <Plus size={14} /> Nuevo Mapeo
            </Button>
          </div>

          {showMapForm && (
            <Card className="mb-6 bg-slate-50/50 border-blue-100 animate-in slide-in-from-top-2 duration-300">
              <form onSubmit={handleSaveMapping} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-black text-slate-400 ml-1">Nombre en Excel (dsempresa)</label>
                  <input required placeholder="Ej: REAL DISTRIBUCION - T&H" value={mapForm.nombre_erp}
                    onChange={(e) => setMapForm(f => ({ ...f, nombre_erp: e.target.value }))}
                    className={INPUT_CLS + " w-full font-bold"} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-black text-slate-400 ml-1">ID Distribuidora Shelfy</label>
                  <input required type="number" value={mapForm.id_distribuidor}
                    onChange={(e) => setMapForm(f => ({ ...f, id_distribuidor: Number(e.target.value) }))}
                    className={INPUT_CLS + " w-full font-bold"} />
                </div>
                <div className="lg:pt-5">
                  <Button type="submit" size="sm" loading={loading} className="w-full shadow-md">Guardar Configuración</Button>
                </div>
              </form>
            </Card>
          )}

          <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-400 text-left border-b border-slate-100">
                  <th className="py-3 px-6 text-[10px] uppercase font-black tracking-wider">Nombre ERP (Excel)</th>
                  <th className="py-3 px-6 text-[10px] uppercase font-black tracking-wider">Distribuidora Asignada</th>
                  <th className="py-3 px-6 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {mappings.map((m, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-4 px-6 font-bold text-slate-700">{m.nombre_erp}</td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-black text-xs">#{m.id_distribuidor}</span>
                        <span className="text-xs font-bold text-slate-500">{m.distribuidores?.nombre_empresa}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button onClick={() => handleDeleteMapping(m.nombre_erp)} 
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {mappings.length === 0 && (
                  <tr><td colSpan={3} className="py-12 text-center text-slate-400 italic font-medium">No se han configurado mapeos aún</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-8 p-6 bg-slate-900 rounded-3xl flex gap-4 shadow-2xl shadow-slate-200">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-amber-400 shrink-0">
            <AlertTriangle size={20} />
          </div>
          <div className="text-xs text-slate-300 leading-relaxed font-medium">
            <strong className="text-white">REGLA DE CARGA:</strong> El &quot;Nombre en Excel&quot; debe coincidir <span className="text-white italic">exactamente</span> con el texto de la columna <strong className="text-blue-400">dsempresa</strong> del reporte ERP. 
            Archivos con datos de sucursales no mapeadas serán ignorados para evitar contaminación de datos.
          </div>
        </div>
      </Card>

      {isSuperadmin && (
        <Card className="mt-2 border-rose-100 bg-rose-50/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full -mr-16 -mt-16 blur-3xl" />
          
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center text-white shadow-lg shadow-rose-200 animate-pulse">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900 tracking-tight text-rose-600">Detector de Anomalías</h2>
                <p className="text-sm text-slate-500 font-medium italic">Empresas desconocidas detectadas durante el procesamiento ETL.</p>
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={loadUnknown} disabled={loadingUnknown} className="hover:bg-rose-50">
              <RefreshCw size={14} className={loadingUnknown ? "animate-spin" : ""} />
            </Button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-rose-100 bg-white">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-rose-50 text-rose-400 text-left border-b border-rose-100">
                  <th className="py-3 px-6 text-[10px] uppercase font-black tracking-wider">Nombre Detectado (ERP)</th>
                  <th className="py-3 px-6 text-[10px] uppercase font-black tracking-wider">Última Detección</th>
                  <th className="py-3 px-6 text-[10px] uppercase font-black tracking-wider w-40">Asignar a Distribuidor</th>
                  <th className="py-3 px-6 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rose-50">
                {unknownCompanies.map((u, i) => (
                  <tr key={i} className="hover:bg-rose-50/30 transition-colors">
                    <td className="py-4 px-6 font-black text-rose-700 tracking-tight">{u.nombre_erp}</td>
                    <td className="py-4 px-6 text-slate-400 font-medium">{new Date(u.fecha).toLocaleString()}</td>
                    <td className="py-4 px-6">
                      <div className="relative">
                        <input
                          type="number"
                          placeholder="ID"
                          className={INPUT_CLS + " w-24 !py-1 text-center font-black focus:ring-2 focus:ring-rose-200"}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleMapUnknown(u.nombre_erp, Number((e.target as HTMLInputElement).value));
                            }
                          }}
                        />
                      </div>
                    </td>
                    <td className="py-4 px-6 text-[10px] font-black text-rose-400 uppercase tracking-tighter">Enter to Link</td>
                  </tr>
                ))}
                {unknownCompanies.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-20 text-center text-slate-300">
                      <div className="flex flex-col items-center gap-3 opacity-30 scale-125">
                        <Check className="text-emerald-500" size={48} />
                        <span className="font-black text-sm uppercase tracking-widest">Sistema Limpio de Anomalías</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
