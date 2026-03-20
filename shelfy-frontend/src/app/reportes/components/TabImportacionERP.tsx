"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { UploadCloud, FileSpreadsheet, Check, AlertTriangle, Info } from "lucide-react";
import { uploadERPFile } from "@/lib/api";

export default function TabImportacionERP() {
  const [fileVentas, setFileVentas] = useState<File | null>(null);
  const [fileClientes, setFileClientes] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  async function handleUpload(tipo: "ventas" | "clientes") {
    const file = tipo === "ventas" ? fileVentas : fileClientes;
    if (!file) return;

    setLoading(true);
    setResult(null);
    try {
      const res = await uploadERPFile(tipo, file);
      setResult({ msg: `✅ ${res.message} (${res.count} registros procesados)`, type: "ok" });
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
      <div className="flex flex-col gap-2 mb-4">
        <h2 className="text-xl font-black text-slate-900 tracking-tight">Carga de Datos ERP</h2>
        <p className="text-sm text-slate-500 font-medium">Actualiza la información comercial subiendo los archivos Excel exportados desde el ERP.</p>
      </div>

      {result && (
        <div className={`p-4 rounded-2xl text-sm font-bold border flex items-center gap-3 animate-in zoom-in-95 duration-200 ${
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
        {/* Card Ventas */}
        <Card className="group p-8 rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/30 hover:bg-white hover:border-blue-400 hover:shadow-xl hover:shadow-blue-50 transition-all duration-300 flex flex-col items-center text-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-white shadow-md flex items-center justify-center text-slate-400 group-hover:text-blue-500 group-hover:scale-110 transition-all">
            <UploadCloud size={32} />
          </div>
          <div>
            <p className="font-black text-slate-900 text-base">Informe de Ventas</p>
            <p className="text-xs text-[var(--shelfy-muted)] mt-1 uppercase tracking-widest font-bold">Planilla Excel (.xlsx)</p>
          </div>
          <div className="w-full relative">
             <input
              type="file"
              accept=".xlsx"
              onChange={e => setFileVentas(e.target.files?.[0] || null)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div className="py-3 px-4 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-600 truncate">
              {fileVentas ? fileVentas.name : "Seleccionar archivo de ventas..."}
            </div>
          </div>
          <Button
            size="sm"
            disabled={!fileVentas || loading}
            loading={loading && !!fileVentas}
            onClick={() => handleUpload("ventas")}
            className="w-full shadow-lg shadow-blue-200 bg-blue-600 hover:bg-blue-700"
          >
            Procesar Ventas
          </Button>
        </Card>

        {/* Card Clientes */}
        <Card className="group p-8 rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/30 hover:bg-white hover:border-emerald-400 hover:shadow-xl hover:shadow-emerald-50 transition-all duration-300 flex flex-col items-center text-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-white shadow-md flex items-center justify-center text-slate-400 group-hover:text-emerald-500 group-hover:scale-110 transition-all">
            <UploadCloud size={32} />
          </div>
          <div>
            <p className="font-black text-slate-900 text-base">Padrón de Clientes</p>
            <p className="text-xs text-[var(--shelfy-muted)] mt-1 uppercase tracking-widest font-bold">Planilla Excel (.xlsx)</p>
          </div>
          <div className="w-full relative">
             <input
              type="file"
              accept=".xlsx"
              onChange={e => setFileClientes(e.target.files?.[0] || null)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div className="py-3 px-4 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-600 truncate">
              {fileClientes ? fileClientes.name : "Seleccionar padrón de clientes..."}
            </div>
          </div>
          <Button
            size="sm"
            disabled={!fileClientes || loading}
            loading={loading && !!fileClientes}
            onClick={() => handleUpload("clientes")}
            className="w-full shadow-lg shadow-emerald-200 bg-emerald-600 hover:bg-emerald-700"
          >
            Procesar Clientes
          </Button>
        </Card>
      </div>

      <div className="p-6 bg-slate-50 border border-slate-200 rounded-3xl flex gap-4">
        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
          <Info size={20} />
        </div>
        <div className="text-xs text-slate-600 leading-relaxed">
          <strong className="text-slate-900 font-black">IMPORTANTE:</strong> Asegúrate de que los archivos tengan los encabezados correctos 
          (ej: <code className="bg-slate-200 px-1 rounded">nro_documento</code>, <code className="bg-slate-200 px-1 rounded">vendedor</code>, <code className="bg-slate-200 px-1 rounded">proveedor</code>). 
          El sistema procesará los datos en segundo plano y los resultados se verán reflejados inmediatamente en las pestañas de reporte.
        </div>
      </div>
    </div>
  );
}
