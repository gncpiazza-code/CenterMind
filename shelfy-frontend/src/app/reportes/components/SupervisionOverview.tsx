"use client";

import { Activity, Database, DollarSign, RefreshCw, Server, ShieldCheck, Users } from "lucide-react";

export default function SupervisionOverview() {
  return (
    <div className="space-y-6 fade-in animate-in slide-in-from-bottom-2 duration-300">
      
      {/* Welcome & Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: "Motores RPA Activos", value: "3", sub: "Sistemas en línea", icon: Server, color: "text-indigo-600", bg: "bg-indigo-50" },
          { title: "Ventas Procesadas", value: "24.5k", sub: "Últimas 24hs", icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
          { title: "Clientes Sincronizados", value: "89%", sub: "Padrón actualizado", icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
          { title: "Salud del Sistema", value: "99.9%", sub: "Sin incidencias", icon: ShieldCheck, color: "text-violet-600", bg: "bg-violet-50" },
        ].map((s, i) => (
          <div key={i} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
            <div className={`p-4 rounded-2xl ${s.bg} ${s.color}`}>
              <s.icon size={24} strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">{s.title}</p>
              <h3 className="text-2xl font-black text-slate-900 leading-none">{s.value}</h3>
              <p className="text-xs font-semibold text-slate-500 mt-1">{s.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Motores Status */}
      <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="text-lg font-black text-slate-900">Estado de Motores de Extracción</h3>
            <p className="text-sm font-medium text-slate-500">Monitoreo en tiempo real de los procesos RPA.</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold hover:bg-slate-100 transition-colors">
            <RefreshCw size={14} /> Refrescar
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Motor Ventas */}
          <div className="p-6 rounded-3xl bg-slate-50 border border-slate-200/60 relative overflow-hidden group hover:border-emerald-300 transition-colors">
            <div className="absolute top-0 right-0 p-4">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
            </div>
            <div className="p-3 bg-white w-fit rounded-2xl shadow-sm text-emerald-600 mb-4">
              <DollarSign size={24} />
            </div>
            <h4 className="text-base font-black text-slate-900 mb-1">Motor de Ventas</h4>
            <p className="text-xs font-medium text-slate-500 mb-4">Extrae tickets, comprobantes y valores en tiempo real.</p>
            
            <div className="flex items-center justify-between pt-4 border-t border-slate-200">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Última Ejecución</span>
              <span className="text-xs font-bold text-slate-700">Hoy, 13:30</span>
            </div>
          </div>

          {/* Motor Padrón */}
          <div className="p-6 rounded-3xl bg-slate-50 border border-slate-200/60 relative overflow-hidden group hover:border-blue-300 transition-colors">
            <div className="absolute top-0 right-0 p-4">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
              </span>
            </div>
            <div className="p-3 bg-white w-fit rounded-2xl shadow-sm text-blue-600 mb-4">
              <Users size={24} />
            </div>
            <h4 className="text-base font-black text-slate-900 mb-1">Motor Padrón</h4>
            <p className="text-xs font-medium text-slate-500 mb-4">Mantiene sincronizada la base de clientes y geolocalización.</p>
            
            <div className="flex items-center justify-between pt-4 border-t border-slate-200">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Última Ejecución</span>
              <span className="text-xs font-bold text-slate-700">Ayer, 23:00</span>
            </div>
          </div>

          {/* Motor Exhibiciones (Future) */}
          <div className="p-6 rounded-3xl bg-slate-50 border border-slate-200/60 relative overflow-hidden group opacity-60">
            <div className="absolute top-0 right-0 p-4">
              <div className="h-3 w-3 rounded-full bg-slate-300"></div>
            </div>
            <div className="p-3 bg-white w-fit rounded-2xl shadow-sm text-slate-400 mb-4">
              <Database size={24} />
            </div>
            <h4 className="text-base font-black text-slate-900 mb-1">Motor Inventario</h4>
            <p className="text-xs font-medium text-slate-500 mb-4">En desarrollo. Sincronización de stock y almacenes.</p>
            
            <div className="flex items-center justify-between pt-4 border-t border-slate-200">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Estado</span>
              <span className="text-xs font-bold text-slate-500">Pausado</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
