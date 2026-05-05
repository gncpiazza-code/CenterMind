"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Shield } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TabUsuarios from "@/components/admin/TabUsuarios";
import TabDistribuidoras from "@/components/admin/TabDistribuidoras";

export default function AltasSistemaPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState("usuarios");

  useEffect(() => {
    if (!user) return;
    if (user.rol !== "superadmin") {
      router.replace("/dashboard");
    }
  }, [user, router]);

  if (!user || user.rol !== "superadmin") return null;

  return (
    <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <BottomNav />
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar title="Altas en Sistema" />
        <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 overflow-auto">
          <div className="max-w-7xl mx-auto">
            <div className="mb-8">
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">Altas en Sistema</h1>
              <p className="text-slate-500 font-medium mt-1">
                Alta y gestión inicial de distribuidoras y usuarios del portal (solo superadmin).
              </p>
            </div>

            <Tabs value={tab} onValueChange={setTab} className="w-full">
              <TabsList className="flex h-auto gap-1 bg-slate-100/50 backdrop-blur-md border border-slate-200 rounded-2xl p-1.5 mb-8 w-fit overflow-x-auto max-w-full">
                <TabsTrigger
                  value="usuarios"
                  className="flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 whitespace-nowrap data-[state=active]:bg-white data-[state=active]:text-[var(--shelfy-primary)] data-[state=active]:shadow-md"
                >
                  <Shield size={18} />
                  Usuarios Portal
                </TabsTrigger>
                <TabsTrigger
                  value="distribuidoras"
                  className="flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 whitespace-nowrap data-[state=active]:bg-white data-[state=active]:text-[var(--shelfy-primary)] data-[state=active]:shadow-md"
                >
                  <Building2 size={18} />
                  Distribuidoras
                </TabsTrigger>
              </TabsList>

              <TabsContent value="usuarios" className="min-h-[500px] mt-0">
                <TabUsuarios isSuperadmin={true} distId={user.id_distribuidor || 0} />
              </TabsContent>
              <TabsContent value="distribuidoras" className="min-h-[500px] mt-0">
                <TabDistribuidoras />
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </div>
  );
}
