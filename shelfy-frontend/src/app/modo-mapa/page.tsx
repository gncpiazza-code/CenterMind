"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { useAuth } from "@/hooks/useAuth";
import TabSupervision from "@/components/admin/TabSupervision";

const ALLOWED_ROLES = ["superadmin", "admin", "supervisor", "directorio", "compania"];

export default function ModoMapaPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user && !ALLOWED_ROLES.includes(user.rol)) {
      router.replace("/dashboard");
    }
  }, [user, router]);

  if (!user || !ALLOWED_ROLES.includes(user.rol)) return null;

  const isSuperadmin = user.rol === "superadmin";
  const distId = user.id_distribuidor || 0;

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--shelfy-bg)]">
      <Sidebar />
      <BottomNav />

      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        <Topbar title="Modo Mapa" />

        {/* No padding — TabSupervision fills all remaining height */}
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden p-3 md:p-4">
          <TabSupervision distId={distId} isSuperadmin={isSuperadmin} fullscreen mapOnly />
        </main>
      </div>
    </div>
  );
}
