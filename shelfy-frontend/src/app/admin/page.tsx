"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  Building2,
  Users,
  FileSpreadsheet,
  Network,
  BookUser,
  Link2,
  BarChart3,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import dynamic from "next/dynamic";
const UnifiedDashboard = dynamic(() => import("./UnifiedDashboard"), { ssr: false });

// Modular Components
import TabUsuarios from "@/components/admin/TabUsuarios";
import TabDistribuidoras from "@/components/admin/TabDistribuidoras";
import TabIntegrantes from "@/components/admin/TabIntegrantes";
import TabERP from "@/components/admin/TabERP";
import TabPadron from "@/components/admin/TabPadron";
import TabMapeoVendedores from "@/components/admin/TabMapeoVendedores";
import TabSupervision from "@/components/admin/TabSupervision";

export default function AdminPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isSuperadmin = user?.rol === "superadmin";

  const TABS = useMemo(() => {
    const head = [
      { id: "supervision",      label: "Supervisión",        icon: BarChart3 },
      { id: "jerarquia_global", label: "Jerarquía Global",   icon: Network },
    ] as const;
    const mid = [
      { id: "mapeo",     label: "Mapeo Vendedores",       icon: Link2 },
      { id: "usuarios",  label: "Usuarios Admin",         icon: Shield },
      { id: "erp",       label: "Importar ERP / Mapeo",  icon: FileSpreadsheet },
    ] as const;
    const tail = isSuperadmin
      ? [
          { id: "distribuidoras", label: "Distribuidoras", icon: Building2 },
          { id: "integrantes",    label: "Integrantes Bot", icon: Users },
        ] as const
      : [];
    if (isSuperadmin) {
      return [
        ...head,
        { id: "padron", label: "Padrón de Clientes", icon: BookUser },
        ...mid,
        ...tail,
      ];
    }
    return [...head, ...mid];
  }, [isSuperadmin]);

  const [tab, setTab] = useState("supervision");

  useEffect(() => {
    if (user && user.rol === "supervisor") {
      router.replace("/dashboard");
    }
  }, [user, router]);

  useEffect(() => {
    if (!isSuperadmin && tab === "padron") setTab("supervision");
  }, [isSuperadmin, tab]);

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

            {/* shadcn Tabs */}
            <Tabs value={tab} onValueChange={setTab} className="w-full">
              <TabsList className="flex h-auto gap-1 bg-slate-100/50 backdrop-blur-md border border-slate-200 rounded-2xl p-1.5 mb-8 w-fit overflow-x-auto max-w-full flex-wrap">
                {TABS.map(({ id, label, icon: Icon }) => (
                  <TabsTrigger
                    key={id}
                    value={id}
                    className="flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 whitespace-nowrap data-[state=active]:bg-white data-[state=active]:text-[var(--shelfy-primary)] data-[state=active]:shadow-md data-[state=inactive]:text-slate-500 data-[state=inactive]:hover:text-slate-800"
                  >
                    <Icon size={18} />
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* Tab Content */}
              <TabsContent value="supervision" className="min-h-[500px] mt-0">
                <TabSupervision distId={user.id_distribuidor || 0} isSuperadmin={isSuperadmin} />
              </TabsContent>
              <TabsContent value="jerarquia_global" className="min-h-[500px] mt-0">
                <UnifiedDashboard isSuperadmin={isSuperadmin} currentDistId={user.id_distribuidor || 0} />
              </TabsContent>
              {isSuperadmin && (
                <TabsContent value="padron" className="min-h-[500px] mt-0">
                  <TabPadron />
                </TabsContent>
              )}
              <TabsContent value="mapeo" className="min-h-[500px] mt-0">
                <TabMapeoVendedores distId={user.id_distribuidor || 0} isSuperadmin={isSuperadmin} />
              </TabsContent>
              <TabsContent value="usuarios" className="min-h-[500px] mt-0">
                <TabUsuarios isSuperadmin={isSuperadmin} distId={user.id_distribuidor || 0} />
              </TabsContent>
              <TabsContent value="erp" className="min-h-[500px] mt-0">
                <TabERP distId={user.id_distribuidor || 0} isSuperadmin={isSuperadmin} />
              </TabsContent>
              {isSuperadmin && (
                <>
                  <TabsContent value="distribuidoras" className="min-h-[500px] mt-0">
                    <TabDistribuidoras />
                  </TabsContent>
                  <TabsContent value="integrantes" className="min-h-[500px] mt-0">
                    <TabIntegrantes isSuperadmin={isSuperadmin} distId={user.id_distribuidor || 0} />
                  </TabsContent>
                </>
              )}
            </Tabs>
          </div>

        </main>
      </div>
    </div>
  );
}
