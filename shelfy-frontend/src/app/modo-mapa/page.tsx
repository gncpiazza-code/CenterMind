"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { useAuth } from "@/hooks/useAuth";

const TabSupervision = dynamic(() => import("@/components/admin/TabSupervision"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center bg-[var(--shelfy-bg)] min-h-0">
      <Loader2 className="h-6 w-6 animate-spin text-[var(--shelfy-muted)]" aria-hidden />
    </div>
  ),
});

const ALLOWED_ROLES = ["superadmin", "admin", "supervisor", "directorio", "compania", "espectador"];

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

        {/* No padding — map fills edge-to-edge under Topbar (R2) */}
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <TabSupervision distId={distId} isSuperadmin={isSuperadmin} fullscreen mapOnly />
        </main>
      </div>
    </div>
  );
}
