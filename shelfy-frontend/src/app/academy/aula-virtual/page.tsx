import { BookOpen } from "lucide-react";
import { Metadata } from "next";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";

export const metadata: Metadata = {
    title: "Aula Virtual | Real Academy",
    description: "Cursos y capacitaciones de Real Academy",
};

export default function AulaVirtualPage() {
    return (
        <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
            <Sidebar />
            <BottomNav />

            <div className="flex flex-col flex-1 min-w-0">
                <Topbar title="Aula Virtual" />

                <main className="flex-1 p-4 md:p-8 pb-20 md:pb-8 overflow-auto max-w-7xl mx-auto w-full">
                    <div className="max-w-6xl mx-auto flex flex-col items-center justify-center text-center mt-20">
                        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-emerald-400 to-teal-500 shadow-xl shadow-teal-200 flex items-center justify-center text-white mb-8">
                            <BookOpen size={48} strokeWidth={1.5} />
                        </div>

                        <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-4">
                            Aula Virtual en Construcción
                        </h1>

                        <p className="text-lg text-slate-500 max-w-2xl leading-relaxed">
                            Próximamente encontrarás aquí todos los cursos, capacitaciones y material educativo de Real Academy.
                            Estamos preparando los mejores contenidos para impulsar tu desarrollo.
                        </p>

                        <div className="mt-12 p-6 bg-amber-50 rounded-2xl border border-amber-200/60 max-w-md">
                            <p className="text-sm font-medium text-amber-800">
                                🚧 Módulo en desarrollo activo 🚧
                            </p>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
