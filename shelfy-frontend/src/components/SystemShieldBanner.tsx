"use client";

import { AlertTriangle } from "lucide-react";
import { useSystemHealth } from "@/hooks/useSystemHealth";

export function SystemShieldBanner() {
  const { data } = useSystemHealth();

  if (!data) return null;

  const shieldState = data.shield?.state;
  const isDegraded = data.status === "degraded" || shieldState === "degraded" || shieldState === "open";

  if (!isDegraded) return null;

  const message =
    shieldState === "open"
      ? "La base de datos está bajo carga alta. Mostramos datos en caché cuando es posible; las actualizaciones pueden tardar."
      : "Rendimiento reducido en la base de datos. Si una pantalla no carga, esperá un momento y refrescá.";

  return (
    <div
      role="status"
      className="sticky top-0 z-[60] w-full border-b border-amber-500/40 bg-amber-50 px-4 py-2 text-amber-950 dark:border-amber-400/30 dark:bg-amber-950/80 dark:text-amber-100"
    >
      <div className="mx-auto flex max-w-[1800px] items-center gap-2 text-sm font-semibold">
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        <span>{message}</span>
      </div>
    </div>
  );
}
