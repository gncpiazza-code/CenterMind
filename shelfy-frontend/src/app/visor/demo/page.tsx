"use client";

import { Suspense } from "react";
import { PageSpinner } from "@/components/ui/Spinner";
import { VisorDemoProvider } from "@/components/visor/VisorDemoContext";
import { VisorPageContent } from "../page";

/** Misma pantalla que /visor?mock=fit, con PDV/ERP simulados y sin login. */
export default function VisorDemoPage() {
  return (
    <VisorDemoProvider>
      <Suspense
        fallback={
          <div className="flex min-h-screen bg-[var(--shelfy-bg)] items-center justify-center">
            <PageSpinner />
          </div>
        }
      >
        <VisorPageContent />
      </Suspense>
    </VisorDemoProvider>
  );
}
