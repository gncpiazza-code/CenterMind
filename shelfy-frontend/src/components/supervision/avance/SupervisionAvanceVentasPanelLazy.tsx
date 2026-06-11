"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/** Precarga el chunk JS del panel avance (hover en toggle CC | Avance). */
export function prefetchSupervisionAvancePanelChunk(): void {
  void import("./SupervisionAvanceVentasPanel");
}

function AvancePanelLoadingShell() {
  return (
    <div className="flex flex-col gap-4 min-h-[320px]" aria-busy="true" aria-label="Cargando avance de ventas">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[4.5rem] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-10 w-full max-w-md rounded-lg" />
      <Skeleton className="h-[220px] w-full rounded-xl" />
      <Skeleton className="h-[280px] w-full rounded-xl" />
    </div>
  );
}

export const SupervisionAvanceVentasPanel = dynamic(
  () =>
    import("./SupervisionAvanceVentasPanel").then((m) => ({
      default: m.SupervisionAvanceVentasPanel,
    })),
  { loading: () => <AvancePanelLoadingShell /> },
);
