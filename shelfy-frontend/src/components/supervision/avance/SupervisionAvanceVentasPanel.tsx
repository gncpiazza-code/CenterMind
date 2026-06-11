"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Award, Crosshair, Flame, Loader2, Target, TrendingDown } from "lucide-react";
import type { AvanceSkuInsight, AvanceSkuRankingRow, AvanceVentasModo } from "@/lib/api";
import type { SyncStatusEntry } from "@/lib/api";
import { useAvanceVentasQuery } from "@/hooks/useAvanceVentasQuery";
import { fmtBultos, fmtHoraAr } from "@/lib/avance-ventas-format";
import { SupervisionReveal, SupervisionRevealItem } from "@/components/supervision/SupervisionReveal";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AvanceVentasKpiStrip } from "./AvanceVentasKpiStrip";
import { AvanceVentasShareChart } from "./AvanceVentasShareChart";
import { AvanceVentasTopSkusChart } from "./AvanceVentasTopSkusChart";
import { AvanceVentasScatter } from "./AvanceVentasScatter";
import { AvanceVentasAgrupacionChart } from "./AvanceVentasAgrupacionChart";
import { AvanceVentasHeatmap } from "./AvanceVentasHeatmap";
import { AvanceVentasSkuRanking } from "./AvanceVentasSkuRanking";
import { AvanceVentasSkuDrillSheet } from "./AvanceVentasSkuDrillSheet";

interface SupervisionAvanceVentasPanelProps {
  distId: number;
  modo: AvanceVentasModo;
  fecha: string;
  sucursal?: string | null;
  /** Nombre display del vendedor, "__sin_vendedor__" o null = todos. */
  vendedor?: string | null;
  ventasSync?: SyncStatusEntry;
}

const INSIGHT_META: Array<{
  key: keyof {
    mas_vendido: unknown;
    menos_vendido: unknown;
    mayor_penetracion: unknown;
    mayor_intensidad: unknown;
    mayor_concentracion: unknown;
  };
  label: string;
  icon: React.ElementType;
  color: string;
}> = [
  { key: "mas_vendido", label: "Más vendido", icon: Award, color: "text-emerald-600" },
  { key: "menos_vendido", label: "Menos vendido", icon: TrendingDown, color: "text-slate-500" },
  { key: "mayor_penetracion", label: "Mayor penetración", icon: Target, color: "text-blue-600" },
  { key: "mayor_intensidad", label: "Mayor intensidad", icon: Flame, color: "text-amber-600" },
  { key: "mayor_concentracion", label: "Mayor concentración", icon: Crosshair, color: "text-violet-600" },
];

function InsightChip({
  label,
  icon: Icon,
  color,
  insight,
}: {
  label: string;
  icon: React.ElementType;
  color: string;
  insight: AvanceSkuInsight | null;
}) {
  if (!insight) return null;
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 min-w-0">
      <Icon size={13} className={cn("shrink-0", color)} strokeWidth={2.25} />
      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground leading-none">
          {label}
        </p>
        <p className="text-[11px] font-semibold truncate leading-tight" title={insight.articulo}>
          {insight.articulo}
        </p>
        <p className="text-[9px] text-muted-foreground tabular-nums leading-none">
          {fmtBultos(insight.bultos)} b · {insight.clientes} cli
        </p>
      </div>
    </div>
  );
}

/** Cuerpo del modo "Avance de ventas" en /supervision (alternable con CC). */
export function SupervisionAvanceVentasPanel({
  distId,
  modo,
  fecha,
  sucursal,
  vendedor,
  ventasSync,
}: SupervisionAvanceVentasPanelProps) {
  const [drillSku, setDrillSku] = useState<AvanceSkuRankingRow | null>(null);
  const [drillOpen, setDrillOpen] = useState(false);

  const query = useAvanceVentasQuery({
    distId,
    modo,
    fecha,
    sucursal,
    vendedor,
    ventasLastUpdated: ventasSync?.last_updated,
  });

  const data = query.data;
  const loading = query.isLoading;
  const consolidado = !vendedor;

  const sinDatos =
    !loading && !!data && data.metadatos.comprobantes === 0 && data.ranking_skus.length === 0;

  const handleSelectSku = (row: AvanceSkuRankingRow) => {
    setDrillSku(row);
    setDrillOpen(true);
  };

  const banner = useMemo(() => {
    if (!data?.periodo?.parcial) return null;
    const ultima = fmtHoraAr(data.sync?.last_updated);
    const proxima = fmtHoraAr(data.sync?.next_run_hint);
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-300/70 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200">
        <AlertTriangle size={13} className="shrink-0" />
        <span className="min-w-0">
          <span className="font-bold">Avance parcial</span>
          {ultima ? <> · última sync {ultima}</> : null}
          {proxima ? <> · próximo batch ~{proxima}</> : null}
          <span className="text-amber-700/80 dark:text-amber-300/70">
            {" "}
            — comparativas contra período completo
          </span>
        </span>
      </div>
    );
  }, [data?.periodo?.parcial, data?.sync]);

  if (query.isError) {
    const httpStatus =
      query.error && typeof query.error === "object" && "status" in query.error
        ? Number((query.error as { status: number }).status)
        : null;
    const backendMissing = httpStatus === 404;
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2 text-center px-6">
        <AlertTriangle size={22} className="text-amber-500" />
        <p className="text-sm font-semibold">No se pudo cargar el avance de ventas</p>
        {backendMissing ? (
          <p className="text-xs text-muted-foreground max-w-md leading-relaxed">
            El portal ya tiene esta función, pero la API en producción aún no expone{" "}
            <code className="text-[10px] bg-muted px-1 rounded">/api/supervision/avance-ventas</code>.
            Hace falta un <strong className="font-semibold text-foreground">redeploy del servicio CenterMind en Railway</strong>{" "}
            desde <code className="text-[10px] bg-muted px-1 rounded">main</code> (commit{" "}
            <code className="text-[10px] bg-muted px-1 rounded">1d6a5e7</code> o posterior).
          </p>
        ) : (
          <p className="text-xs text-muted-foreground max-w-sm">
            {query.error instanceof Error ? query.error.message : "Error desconocido"}
          </p>
        )}
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-[260px] rounded-2xl" />
          <Skeleton className="h-[260px] rounded-2xl hidden lg:block" />
        </div>
        <Skeleton className="h-[300px] rounded-2xl" />
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Calculando avance…
        </div>
      </div>
    );
  }

  return (
    <SupervisionReveal className="flex flex-col gap-4" animate={!query.isFetching || !!data}>
      {banner && <SupervisionRevealItem className="shrink-0">{banner}</SupervisionRevealItem>}

      {/* KPIs 2×2 mobile / 4 cols desktop */}
      <SupervisionRevealItem className="shrink-0">
        <AvanceVentasKpiStrip cards={data?.kpis_cards} modo={modo} loading={loading} />
      </SupervisionRevealItem>

      {sinDatos ? (
        <SupervisionRevealItem>
          <p className="text-center text-xs text-muted-foreground py-12">
            Sin ventas registradas en {data?.periodo?.label ?? "el período"} para el filtro
            seleccionado.
          </p>
        </SupervisionRevealItem>
      ) : (
        <>
          {/* Insights */}
          {data && (
            <SupervisionRevealItem className="shrink-0">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {INSIGHT_META.map((m) => (
                  <InsightChip
                    key={m.key}
                    label={m.label}
                    icon={m.icon}
                    color={m.color}
                    insight={data.insights?.[m.key] ?? null}
                  />
                ))}
              </div>
            </SupervisionRevealItem>
          )}

          {/* Row 2 — mobile: 1 solo gráfico principal (share consolidado / top SKUs vendedor) */}
          <SupervisionRevealItem className="shrink-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {consolidado && data?.share_vendedores?.length ? (
                <>
                  <AvanceVentasShareChart data={data.share_vendedores} />
                  <AvanceVentasTopSkusChart
                    ranking={data?.ranking_skus}
                    className="hidden lg:block"
                  />
                </>
              ) : (
                <>
                  <AvanceVentasTopSkusChart ranking={data?.ranking_skus} />
                  <AvanceVentasAgrupacionChart
                    data={data?.series?.por_agrupacion}
                    className="hidden lg:block"
                  />
                </>
              )}
            </div>
          </SupervisionRevealItem>

          {/* Row 3 — solo desktop */}
          <SupervisionRevealItem className="shrink-0 hidden lg:block">
            <div className="grid grid-cols-2 gap-4">
              <AvanceVentasScatter data={data?.series?.scatter_penetracion_intensidad} />
              {consolidado && data?.share_vendedores?.length ? (
                <AvanceVentasAgrupacionChart data={data?.series?.por_agrupacion} />
              ) : (
                <AvanceVentasHeatmap data={data?.series?.heatmap_top_skus} modo={modo} />
              )}
            </div>
          </SupervisionRevealItem>

          {/* Row 4 — ranking + heatmap */}
          <SupervisionRevealItem className="shrink-0">
            <div className="grid grid-cols-1 xl:grid-cols-[3fr_2fr] gap-4 items-start">
              <AvanceVentasSkuRanking
                ranking={data?.ranking_skus}
                modo={modo}
                periodoLabel={data?.periodo?.label ?? fecha}
                onSelectSku={handleSelectSku}
                className="max-h-[520px]"
              />
              {consolidado && data?.share_vendedores?.length ? (
                <AvanceVentasHeatmap
                  data={data?.series?.heatmap_top_skus}
                  modo={modo}
                  className="hidden lg:block"
                />
              ) : null}
            </div>
          </SupervisionRevealItem>
        </>
      )}

      <AvanceVentasSkuDrillSheet
        distId={distId}
        sku={drillSku}
        open={drillOpen}
        onOpenChange={setDrillOpen}
        precomputed={data?.drill_clientes_por_sku}
        modo={modo}
        fecha={fecha}
        sucursal={sucursal}
        vendedor={vendedor}
        periodoLabel={data?.periodo?.label}
      />
    </SupervisionReveal>
  );
}
