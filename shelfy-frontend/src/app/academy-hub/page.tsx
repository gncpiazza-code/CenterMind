"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { GraduationCap, PlayCircle, BookOpen, Trophy } from "lucide-react";

export default function AcademyHubPage() {
    return (
        <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <Topbar title="Academy Hub" />
                <main className="flex-1 overflow-y-auto p-4 md:p-8">
                    <div className="max-w-4xl mx-auto space-y-8">
                        <header className="text-center space-y-4">
                            <div className="w-20 h-20 bg-[var(--shelfy-primary)]/10 rounded-2xl flex items-center justify-center mx-auto ring-1 ring-[var(--shelfy-primary)]/20 shadow-xl shadow-[var(--shelfy-primary)]/5">
                                <GraduationCap className="text-[var(--shelfy-primary)] w-10 h-10" />
                            </div>
                            <h1 className="text-4xl font-black text-slate-900 tracking-tight">Centro de Capacitación</h1>
                            <p className="text-slate-500 max-w-md mx-auto font-medium">Domina la plataforma Shelfy con nuestros cursos interactivos y material de soporte.</p>
                        </header>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FeatureCard 
                                icon={PlayCircle} 
                                title="Video Tutoriales" 
                                description="Guías paso a paso para supervisores, vendedores y admins."
                                color="text-blue-600"
                                bg="bg-blue-50"
                            />
                            <FeatureCard 
                                icon={BookOpen} 
                                title="Documentación" 
                                description="Manuales detallados sobre el motor RPA y auditoría de góndola."
                                color="text-violet-600"
                                bg="bg-violet-50"
                            />
                            <FeatureCard 
                                icon={Trophy} 
                                title="Certificaciones" 
                                description="Completa los módulos y obtén tu badge de Shelfy Expert."
                                color="text-emerald-600"
                                bg="bg-emerald-50"
                            />
                            <div className="p-8 border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center text-center space-y-2 opacity-60">
                                <span className="text-sm font-bold text-slate-400 uppercase tracking-widest italic">Próximamente</span>
                                <p className="text-xs text-slate-400">Nuevos contenidos cada semana.</p>
                            </div>
                        </div>

                        <Card className="p-8 bg-slate-900 text-white border-none shadow-2xl relative overflow-hidden group">
                           <div className="relative z-10 text-center space-y-4">
                                <h2 className="text-2xl font-black">¿Necesitas ayuda inmediata?</h2>
                                <p className="text-slate-400 text-sm max-w-sm mx-auto">Nuestro equipo de soporte técnico está disponible para asistirte con la integración del motor RPA.</p>
                                <button className="px-6 py-3 bg-[var(--shelfy-primary)] rounded-xl font-bold hover:scale-105 active:scale-95 transition-all shadow-lg shadow-[var(--shelfy-primary)]/20">
                                    Contactar Soporte
                                </button>
                           </div>
                           <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/5 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-1000"></div>
                        </Card>
                    </div>
                </main>
            </div>
        </div>
    );
}

function FeatureCard({ icon: Icon, title, description, color, bg }: any) {
    return (
        <Card className="p-6 border-none shadow-sm hover:shadow-xl transition-all duration-300 group cursor-default">
            <div className={`w-12 h-12 ${bg} rounded-xl flex items-center justify-center ${color} mb-4 group-hover:scale-110 transition-transform shadow-sm`}>
                <Icon size={24} />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">{title}</h3>
            <p className="text-sm text-slate-500 leading-relaxed font-medium">{description}</p>
        </Card>
    );
}
