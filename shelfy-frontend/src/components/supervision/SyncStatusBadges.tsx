"use client";

import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, Clock, Activity } from "lucide-react";

type SyncState = "fresh" | "aged" | "stale" | "processing";

function getStatus(iso: string | null): SyncState {
  if (!iso) return "stale";
  const ageMs = Date.now() - new Date(iso).getTime();
  const ageH = ageMs / 3_600_000;
  if (ageMs < 5 * 60_000) return "processing";
  if (ageH < 12) return "fresh";
  if (ageH < 48) return "aged";
  return "stale";
}

function fmtShort(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diffH = (now.getTime() - d.getTime()) / 3_600_000;
  const tz = "America/Argentina/Buenos_Aires";
  const time = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: tz });
  const date = d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", timeZone: tz });
  const todayDate = now.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", timeZone: tz });
  if (diffH < 24 && date === todayDate) return `hoy ${time}`;
  if (diffH < 48) return `ayer ${time}`;
  return `${date} ${time}`;
}

const STATE_STYLES: Record<SyncState, { className: string; icon: React.ElementType }> = {
  fresh:      { className: "border-emerald-300 text-emerald-700 bg-emerald-50",   icon: CheckCircle2 },
  aged:       { className: "border-slate-200   text-slate-500   bg-slate-50",     icon: Clock },
  stale:      { className: "border-amber-300   text-amber-600   bg-amber-50",     icon: AlertTriangle },
  processing: { className: "border-violet-300  text-violet-600  bg-violet-50",    icon: Activity },
};

interface SyncStatusBadgesProps {
  padronLastUpdated: string | null;
  ccLastUpdated: string | null;
}

export function SyncStatusBadges({ padronLastUpdated, ccLastUpdated }: SyncStatusBadgesProps) {
  const padronState = getStatus(padronLastUpdated);
  const ccState = getStatus(ccLastUpdated);

  const padronStyle = STATE_STYLES[padronState];
  const ccStyle = STATE_STYLES[ccState];

  const PadronIcon = padronStyle.icon;
  const CcIcon = ccStyle.icon;

  const processingStyle = padronState === "processing" || ccState === "processing"
    ? { animation: "badge-pulse 1.5s ease-in-out infinite" }
    : undefined;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <style>{`
        @keyframes badge-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.3); }
          50% { box-shadow: 0 0 0 3px rgba(139, 92, 246, 0); }
        }
      `}</style>
      <Badge
        variant="outline"
        className={`text-[10px] gap-1 ${padronStyle.className}`}
        title={
          padronLastUpdated
            ? `Padrón (última corrida/verificación): ${new Date(padronLastUpdated).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}`
            : "Sin datos de padrón"
        }
        style={padronState === "processing" ? processingStyle : undefined}
      >
        <PadronIcon size={10} />
        Padrón: {fmtShort(padronLastUpdated)}
      </Badge>
      <Badge
        variant="outline"
        className={`text-[10px] gap-1 ${ccStyle.className}`}
        title={ccLastUpdated ? `CC: ${new Date(ccLastUpdated).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}` : "Sin datos de CC"}
        style={ccState === "processing" ? processingStyle : undefined}
      >
        <CcIcon size={10} />
        CC: {fmtShort(ccLastUpdated)}
      </Badge>
    </div>
  );
}
