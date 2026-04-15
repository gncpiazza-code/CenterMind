"use client";

import { CheckCircle2, XCircle, Flame, Clock } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { GaleriaVendedorStats } from "@/lib/api";

interface GaleriaVendedorCardProps {
  vendedor: GaleriaVendedorStats;
  onClick: () => void;
}

export function GaleriaVendedorCard({ vendedor, onClick }: GaleriaVendedorCardProps) {
  const initials = vendedor.nombre_erp
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const total = vendedor.total_exhibiciones || 1;
  const aprobPct = Math.round((vendedor.aprobadas / total) * 100);
  const rechPct = Math.round((vendedor.rechazadas / total) * 100);
  const destPct = Math.round((vendedor.destacadas / total) * 100);

  return (
    <button
      onClick={onClick}
      className={cn(
        "group w-full text-left rounded-2xl border p-4 transition-all duration-200",
        "hover:shadow-md hover:-translate-y-0.5 hover:border-[var(--shelfy-primary)]",
        "flex flex-col gap-3 bg-[var(--shelfy-panel)]"
      )}
      style={{ borderColor: "var(--shelfy-border)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <Avatar className="size-11 rounded-xl shrink-0">
          {vendedor.foto_url && (
            <AvatarImage src={vendedor.foto_url} alt={vendedor.nombre_erp} className="object-cover" />
          )}
          <AvatarFallback className="rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 text-white text-sm font-black">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold truncate" style={{ color: "var(--shelfy-text)" }}>
            {vendedor.nombre_erp}
          </p>
          {vendedor.sucursal_nombre && (
            <p className="text-xs truncate" style={{ color: "var(--shelfy-muted)" }}>
              {vendedor.sucursal_nombre}
            </p>
          )}
        </div>
        <span className="text-xl font-black shrink-0" style={{ color: "var(--shelfy-primary)" }}>
          {vendedor.total_exhibiciones}
        </span>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-1">
        <KpiCell icon={<CheckCircle2 size={12} />} label="Aprobadas" value={vendedor.aprobadas} color="text-green-600 bg-green-50" />
        <KpiCell icon={<XCircle size={12} />} label="Rechazadas" value={vendedor.rechazadas} color="text-red-600 bg-red-50" />
        <KpiCell icon={<Flame size={12} />} label="Destacadas" value={vendedor.destacadas} color="text-amber-600 bg-amber-50" />
        <KpiCell icon={<Clock size={12} />} label="Pendientes" value={vendedor.pendientes} color="text-slate-600 bg-slate-50" />
      </div>

      {/* Progress bar */}
      <div className="flex h-1.5 rounded-full overflow-hidden gap-0.5">
        {aprobPct > 0 && <div className="bg-green-500 rounded-full" style={{ width: `${aprobPct}%` }} />}
        {destPct > 0 && <div className="bg-amber-400 rounded-full" style={{ width: `${destPct}%` }} />}
        {rechPct > 0 && <div className="bg-red-500 rounded-full" style={{ width: `${rechPct}%` }} />}
      </div>

      <p
        className="text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color: "var(--shelfy-primary)" }}
      >
        Ver clientes →
      </p>
    </button>
  );
}

function KpiCell({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-0.5 rounded-lg py-1.5 px-1", color)}>
      <span className="opacity-70">{icon}</span>
      <span className="text-sm font-black">{value}</span>
      <span className="text-[9px] font-semibold leading-none">{label}</span>
    </div>
  );
}
