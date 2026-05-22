"use client";

import { useQuery } from "@tanstack/react-query";
import { Building2, TrendingUp, TrendingDown, Minus, Loader2 } from "lucide-react";
import { fetchRankingCompania, type RankingCompaniaRow } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Props {
  distId: number;
  periodo: string;
  sucursalId?: string;
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta > 0)
    return (
      <span className="flex items-center gap-0.5 text-[10px] font-bold text-green-600">
        <TrendingUp size={10} />+{delta}
      </span>
    );
  if (delta < 0)
    return (
      <span className="flex items-center gap-0.5 text-[10px] font-bold text-red-500">
        <TrendingDown size={10} />{delta}
      </span>
    );
  return <Minus size={10} className="text-slate-400" />;
}

export function RankingCompaniaCompare({ distId, periodo, sucursalId }: Props) {
  const { data, isLoading, isError } = useQuery<RankingCompaniaRow[]>({
    queryKey: ["ranking-compania", distId, periodo, sucursalId],
    queryFn: () => fetchRankingCompania(distId, periodo, sucursalId),
    staleTime: 60_000,
    enabled: distId > 0,
  });

  if (isLoading) {
    return (
      <div className="space-y-2 pt-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-[12px] text-red-500 py-4 text-center">Error al cargar ranking Compañía</p>
    );
  }

  const rows = data ?? [];
  const hasChanges = rows.some((r) => r.delta_puntos !== 0);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Building2 size={14} style={{ color: "var(--shelfy-primary)" }} />
        <span className="text-[13px] font-bold" style={{ color: "var(--shelfy-text)" }}>
          Ranking Compañía
        </span>
        {hasChanges && (
          <Badge variant="outline" className="text-[10px] ml-auto border-amber-300 text-amber-700 bg-amber-50">
            Con revisiones
          </Badge>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-[12px] text-center py-6" style={{ color: "var(--shelfy-muted)" }}>
          Sin exhibiciones en el período
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--shelfy-border)" }}>
                <th className="text-left py-1.5 pr-3 font-semibold" style={{ color: "var(--shelfy-muted)" }}>#</th>
                <th className="text-left py-1.5 pr-3 font-semibold" style={{ color: "var(--shelfy-muted)" }}>Vendedor</th>
                <th className="text-right py-1.5 pr-2 font-semibold" style={{ color: "var(--shelfy-muted)" }}>Pts. Cía</th>
                <th className="text-right py-1.5 pr-2 font-semibold" style={{ color: "var(--shelfy-muted)" }}>Pts. Dist</th>
                <th className="text-right py-1.5 font-semibold" style={{ color: "var(--shelfy-muted)" }}>Δ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={row.vendedor}
                  className={cn(
                    "border-b transition-colors hover:bg-slate-50",
                    row.delta_puntos !== 0 && "bg-amber-50/40",
                  )}
                  style={{ borderColor: "var(--shelfy-border)" }}
                >
                  <td className="py-1.5 pr-3 font-semibold" style={{ color: "var(--shelfy-muted)" }}>
                    {idx + 1}
                  </td>
                  <td className="py-1.5 pr-3 font-medium truncate max-w-[160px]" style={{ color: "var(--shelfy-text)" }}>
                    {row.vendedor}
                  </td>
                  <td className="py-1.5 pr-2 text-right font-bold" style={{ color: "var(--shelfy-primary)" }}>
                    {row.puntos_compania}
                  </td>
                  <td className="py-1.5 pr-2 text-right" style={{ color: "var(--shelfy-muted)" }}>
                    {row.puntos_oficial}
                  </td>
                  <td className="py-1.5 text-right">
                    <DeltaBadge delta={row.delta_puntos} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
