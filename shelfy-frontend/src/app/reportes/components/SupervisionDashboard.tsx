"use client";

import { useState } from "react";
import { Activity, DollarSign, Users, MapPin, Briefcase, Package, X, Maximize2 } from "lucide-react";

// Import existing detailed components
import TabVentasResumen from "./TabVentasResumen";
import TabVentasBultos from "./TabVentasBultos";
import TabAuditoriaSigo from "./TabAuditoriaSigo";
import TabPadronClientes from "@/app/academy/cuentas-corrientes/components/TabPadronClientes";
import TabCuentasDashboard from "./TabCuentasDashboard";
import SupervisionOverview from "./SupervisionOverview"; // The motor status component

interface UnifiedDashboardProps {
  distId: number;
  desde: string;
  hasta: string;
}

export default function SupervisionDashboard({ distId, desde, hasta }: UnifiedDashboardProps) {
  const [activeModal, setActiveModal] = useState<string | null>(null);

  const sections = [
    {
      id: "ventas_resumen",
      title: "Recaudación y Ventas",
      description: "Flujo de dinero, cobranzas al contado y recibos.",
      icon: DollarSign,
      color: "text-emerald-500",
      bg: "bg-emerald-50",
      border: "border-emerald-100",
      component: <TabVentasResumen distId={distId} desde={desde} hasta={hasta} />
    },
    {
      id: "ventas_bultos",
      title: "Volumen (Bultos)",
      description: "Análisis físico de cajas vendidas por sucursal y vendedor.",
      icon: Package,
      color: "text-indigo-500",
      bg: "bg-indigo-50",
      border: "border-indigo-100",
      component: <TabVentasBultos distId={distId} desde={desde} hasta={hasta} />
    },
    {
      id: "cuentas_corrientes",
      title: "Cuentas Corrientes",
      description: "Detalle de deuda, rangos de morosidad y saldo por cliente.",
      icon: Briefcase,
      color: "text-rose-500",
      bg: "bg-rose-50",
      border: "border-rose-100",
      component: <TabCuentasDashboard distId={distId} />
    },
    {
      id: "sigo_audit",
      title: "Mapa SIGO (Rendimiento)",
      description: "Geolocalización, efectividad y cobertura de visitas.",
      icon: MapPin,
      color: "text-amber-500",
      bg: "bg-amber-50",
      border: "border-amber-100",
      component: <TabAuditoriaSigo distId={distId} desde={desde} hasta={hasta} />
    },
    {
      id: "padron",
      title: "Padrón Jerárquico",
      description: "Explorar la estructura de Empresas, Sucursales y Clientes.",
      icon: Users,
      color: "text-blue-500",
      bg: "bg-blue-50",
      border: "border-blue-100",
      component: <TabPadronClientes distId={distId} />
    }
  ];

  return (
    <div className="space-y-8 fade-in animate-in slide-in-from-bottom-2 duration-300">
      
      {/* 1. Global Motor Status (Top Row) */}
      <SupervisionOverview />

      {/* 2. Unified KPIs / Modules Grid */}
      <div>
        <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
          <Activity size={20} className="text-indigo-500" /> 
          Módulos de Supervisión
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sections.map((sec) => (
            <div 
              key={sec.id}
              onClick={() => setActiveModal(sec.id)}
              className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group"
            >
              <div className="flex justify-between items-start mb-4">
                <div className={`p-4 rounded-2xl ${sec.bg} ${sec.color} group-hover:scale-110 transition-transform`}>
                  <sec.icon size={28} strokeWidth={2.5} />
                </div>
                <button className="text-slate-300 group-hover:text-indigo-500 transition-colors p-2 bg-slate-50 rounded-full">
                  <Maximize2 size={16} />
                </button>
              </div>
              <h4 className="text-xl font-black text-slate-800 mb-2">{sec.title}</h4>
              <p className="text-sm font-medium text-slate-500 leading-relaxed">
                {sec.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Fullscreen Drill-down Modal */}
      {activeModal && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-slate-100/90 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="flex-1 w-full max-w-[95vw] shadow-2xl mx-auto my-4 bg-white rounded-3xl border border-slate-200 overflow-hidden flex flex-col">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white">
              <div className="flex items-center gap-3">
                {(() => {
                  const activeSec = sections.find(s => s.id === activeModal);
                  if (!activeSec) return null;
                  const Icon = activeSec.icon;
                  return (
                    <>
                      <div className={`p-2 rounded-xl ${activeSec.bg} ${activeSec.color}`}>
                        <Icon size={20} strokeWidth={2.5} />
                      </div>
                      <div>
                        <h2 className="text-lg font-black text-slate-900 tracking-tight">{activeSec.title}</h2>
                        <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Vista Detallada</p>
                      </div>
                    </>
                  );
                })()}
              </div>
              <button 
                onClick={() => setActiveModal(null)}
                className="p-2 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-full transition-colors flex items-center gap-2 pr-4 bg-slate-50"
              >
                <X size={20} strokeWidth={3} />
                <span className="text-xs font-black uppercase tracking-widest">Cerrar</span>
              </button>
            </div>

            {/* Modal Content - Scrollable */}
            <div className="flex-1 overflow-auto p-6 bg-slate-50/50">
               {sections.find(s => s.id === activeModal)?.component}
            </div>
            
          </div>
        </div>
      )}

    </div>
  );
}
