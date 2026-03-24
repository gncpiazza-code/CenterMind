"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { 
  Shield, 
  Building2, 
  Users, 
  FileSpreadsheet, 
  Network 
} from "lucide-react";

import dynamic from "next/dynamic";
const UnifiedDashboard = dynamic(() => import("./UnifiedDashboard"), { ssr: false });

// Modular Components
import TabUsuarios from "@/components/admin/TabUsuarios";
import TabDistribuidoras from "@/components/admin/TabDistribuidoras";
import TabIntegrantes from "@/components/admin/TabIntegrantes";
import TabERP from "@/components/admin/TabERP";

export default function AdminPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isSuperadmin = user?.rol === "superadmin";

  const TABS = [
    { id: "jerarquia_global", label: "Jerarquía Global", icon: Network },
    { id: "usuarios", label: "Usuarios Admin", icon: Shield },
    { id: "erp", label: "Importar ERP / Mapeo", icon: FileSpreadsheet },
    ...(isSuperadmin ? [
      { id: "distribuidoras", label: "Distribuidoras", icon: Building2 },
      { id: "integrantes", label: "Integrantes Bot", icon: Users }
    ] : [])
  ];

  const [tab, setTab] = useState("jerarquia_global");

  useEffect(() => {
    if (user && user.rol === "supervisor") {
      router.replace("/dashboard");
    }
  }, [user, router]);

  if (user?.rol === "supervisor") return null;
  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <BottomNav />
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar title="Administración" />
        <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 overflow-auto">
          
          <div className="max-w-7xl mx-auto">
            {/* Header Section */}
            <div className="mb-8">
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">Panel de Control</h1>
              <p className="text-slate-500 font-medium mt-1">Gestiona usuarios, jerarquías y sincronización de datos.</p>
            </div>

            {/* Premium Style Tabs */}
            <div className="flex gap-2 bg-slate-100/50 backdrop-blur-md border border-slate-200 rounded-2xl p-1.5 mb-8 w-fit overflow-x-auto max-w-full no-scrollbar">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button 
                  key={id} 
                  onClick={() => setTab(id)}
                  className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 whitespace-nowrap
                    ${tab === id
                      ? "bg-white text-[var(--shelfy-primary)] shadow-md shadow-blue-100 ring-1 ring-slate-200"
                      : "text-slate-500 hover:text-slate-800 hover:bg-white/50"
                    }`}
                >
                  <Icon size={18} className={tab === id ? "text-[var(--shelfy-primary)]" : "text-slate-400"} />
                  {label}
                </button>
              ))}
            </div>

            {/* Tab Content with Animation Wrapper */}
            <div className="min-h-[500px]">
              {tab === "usuarios" && <TabUsuarios isSuperadmin={isSuperadmin} distId={user.id_distribuidor || 0} />}
              {tab === "jerarquia_global" && <UnifiedDashboard isSuperadmin={isSuperadmin} currentDistId={user.id_distribuidor || 0} />}
              {tab === "erp" && <TabERP distId={user.id_distribuidor || 0} isSuperadmin={isSuperadmin} />}
              {tab === "distribuidoras" && <TabDistribuidoras />}
              {tab === "integrantes" && <TabIntegrantes isSuperadmin={isSuperadmin} distId={user.id_distribuidor || 0} />}
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}
