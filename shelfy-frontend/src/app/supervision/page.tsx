"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { useAuth } from "@/hooks/useAuth";
import TabSupervision from "@/components/admin/TabSupervision";

const ALLOWED_ROLES = ["superadmin", "admin", "supervisor"];

export default function SupervisionPage() {
  const { user } = useAuth();
  const router = useRouter();

  // Guard: solo roles permitidos
  useEffect(() => {
    if (user && !ALLOWED_ROLES.includes(user.rol)) {
      router.replace("/dashboard");
    }
  }, [user, router]);

  if (!user || !ALLOWED_ROLES.includes(user.rol)) return null;

  const isSuperadmin = user.rol === "superadmin";
  const distId       = user.id_distribuidor || 0;

  return (
    <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <BottomNav />

      <div className="flex flex-col flex-1 min-w-0">
        <Topbar title="Panel de Supervisión" />

        <main className="flex-1 p-4 md:p-8 pb-24 md:pb-12 overflow-auto">
          <div className="max-w-[1600px] mx-auto space-y-10">

            {/* Header */}
            <div>
              <h1 className="text-2xl font-black text-[var(--shelfy-text)] tracking-tight">
                Panel de Supervisión
              </h1>
              <p className="text-sm text-[var(--shelfy-muted)] mt-1">
                Visualizá rutas, vendedores y puntos de venta en tiempo real.
              </p>
            </div>

            {/* ── Mapa de Rutas ─────────────────────────────────────────── */}
            <section>
              <TabSupervision distId={distId} isSuperadmin={isSuperadmin} />
            </section>



          </div>
        </main>
      </div>
    </div>
  );
}
