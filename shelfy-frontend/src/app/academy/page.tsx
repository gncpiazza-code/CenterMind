import { Briefcase, BookOpen } from "lucide-react";
import Link from "next/link";
import { Metadata } from "next";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";

export const metadata: Metadata = {
    title: "Real Academy | Shelfy",
    description: "Centro de aprendizaje y extracciones financieras",
};

const modules = [
    {
        title: "Cuentas Corrientes",
        description: "Gestión de extracciones y balances de cuentas corrientes.",
        icon: Briefcase,
        href: "/academy/cuentas-corrientes",
        color: "from-blue-500 to-indigo-600",
    },
    {
        title: "Aula Virtual",
        description: "Accede a cursos, capacitaciones y material educativo.",
        icon: BookOpen,
        href: "/academy/aula-virtual",
        color: "from-emerald-500 to-teal-600",
    },
];

export default function RealAcademyPage() {
    return (
        <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
            <Sidebar />
            <BottomNav />

            <div className="flex flex-col flex-1 min-w-0">
                <Topbar title="Real Academy" />

                <main className="flex-1 p-4 md:p-8 pb-20 md:pb-8 overflow-auto max-w-7xl mx-auto w-full">
                    <div className="max-w-6xl mx-auto space-y-8 mt-4">

                        {/* Header */}
                        <div>
                            <h1 className="text-3xl font-black text-[var(--shelfy-text)] tracking-tight">
                                Real Academy
                            </h1>
                            <p className="mt-2 text-[var(--shelfy-muted)] max-w-2xl text-sm leading-relaxed">
                                Bienvenido al centro integral de aprendizaje y gestión. Aquí encontrarás tanto herramientas financieras como recursos educativos para impulsar tu crecimiento en la plataforma.
                            </p>
                        </div>

                        {/* Modules Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {modules.map((m) => {
                                const Icon = m.icon;
                                return (
                                    <Link
                                        key={m.href}
                                        href={m.href}
                                        className="group relative flex flex-col p-6 bg-white/80 backdrop-blur-xl rounded-3xl border border-violet-100/50 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                                    >
                                        <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${m.color} flex items-center justify-center text-white mb-6 shadow-inner`}>
                                            <Icon size={28} strokeWidth={2} />
                                        </div>
                                        <h3 className="text-xl font-bold text-slate-800 mb-2 group-hover:text-violet-700 transition-colors">
                                            {m.title}
                                        </h3>
                                        <p className="text-sm text-slate-500 leading-relaxed">
                                            {m.description}
                                        </p>
                                        <div className="absolute top-6 right-6 w-8 h-8 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transform translate-x-4 group-hover:translate-x-0 transition-all duration-300">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>

                    </div>
                </main>
            </div>
        </div>
    );
}
