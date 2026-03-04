"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { PageSpinner } from "@/components/ui/Spinner";
import { Briefcase, Settings2 } from "lucide-react";
import TabGenerarInforme from "./components/TabGenerarInforme";
import TabAlertasCredito from "./components/TabAlertasCredito";

export default function CuentasCorrientesPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState("generar");

    // Auth Guard
    useEffect(() => {
        if (user && user.rol !== "superadmin" && user.rol !== "admin") {
            router.replace("/dashboard");
        }
    }, [user, router]);

    if (!user || (user.rol !== "superadmin" && user.rol !== "admin")) return <PageSpinner />;

    return (
        <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
            <Sidebar />
            <BottomNav />

            <div className="flex flex-col flex-1 min-w-0">
                <Topbar title="Cuentas Corrientes" />

                <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 overflow-auto max-w-7xl mx-auto w-full">
                    {/* Header */}
                    <div className="mb-6">
                        <h1 className="text-2xl font-black text-[var(--shelfy-text)] tracking-tight">
                            Gestión de Cuentas Corrientes
                        </h1>
                        <p className="text-sm text-[var(--shelfy-muted)] mt-1">
                            Sube tus reportes de ERP, configura alertas de crédito y obtén informes enriquecidos al instante.
                        </p>
                    </div>

                    {/* Tabs Navigation */}
                    <div className="flex gap-1 bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] rounded-xl p-1 w-fit mb-6 shadow-sm">
                        <button
                            onClick={() => setActiveTab("generar")}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200
                ${activeTab === "generar"
                                    ? "bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-200/50"
                                    : "text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] hover:bg-[var(--shelfy-bg)]"
                                }`}
                        >
                            <Briefcase size={16} />
                            Generar Informe
                        </button>
                        <button
                            onClick={() => setActiveTab("configurar")}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200
                ${activeTab === "configurar"
                                    ? "bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-200/50"
                                    : "text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] hover:bg-[var(--shelfy-bg)]"
                                }`}
                        >
                            <Settings2 size={16} />
                            Configurar Alertas
                        </button>
                    </div>

                    {/* Tab Content */}
                    <div className="fade-in animate-in slide-in-from-bottom-2 duration-300">
                        {activeTab === "generar" && <TabGenerarInforme />}
                        {activeTab === "configurar" && <TabAlertasCredito />}
                    </div>
                </main>
            </div>
        </div>
    );
}
