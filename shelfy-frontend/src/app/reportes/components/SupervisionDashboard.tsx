"use client";

import { Activity } from "lucide-react";
import TabCuentasDashboard from "./TabCuentasDashboard";
import SupervisionOverview from "./SupervisionOverview";

interface UnifiedDashboardProps {
  distId: number;
}

export default function SupervisionDashboard({ distId }: UnifiedDashboardProps) {
  return (
    <div className="space-y-8 fade-in animate-in slide-in-from-bottom-2 duration-300">
      <SupervisionOverview />

      <div>
        <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
          <Activity size={20} className="text-rose-500" />
          Cuentas Corrientes
        </h3>
        <TabCuentasDashboard distId={distId} />
      </div>
    </div>
  );
}
