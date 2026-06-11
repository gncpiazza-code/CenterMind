"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import type {
  AvanceClienteMixRow,
  AvanceSkuRankingRow,
  AvanceVentasModo,
} from "@/lib/api";
import type { SyncStatusEntry } from "@/lib/api";
import { useAvanceVentasQuery } from "@/hooks/useAvanceVentasQuery";
import { deriveCoberturaPdvs, skuRowTieneVenta } from "@/lib/avance-ventas-alcance";
import { fmtHoraAr } from "@/lib/avance-ventas-format";
import { SupervisionReveal, SupervisionRevealItem } from "@/components/supervision/SupervisionReveal";
import { Skeleton } from "@/components/ui/skeleton";
import { AvanceVentasKpiStrip } from "./AvanceVentasKpiStrip";
import { AvanceVentasControlsBar } from "./AvanceVentasControlsBar";
import { AvanceVentasChartCarousel } from "./AvanceVentasChartCarousel";
import { AvanceVentasSkuRanking } from "./AvanceVentasSkuRanking";
import { AvanceVentasSkuDrillSheet } from "./AvanceVentasSkuDrillSheet";
import { AvanceVentasClienteAuditoriaPanel } from "./AvanceVentasClienteAuditoriaPanel";
import { AvanceVentasClienteDrillSheet } from "./AvanceVentasClienteDrillSheet";

interface SupervisionAvanceVentasPanelProps {
  distId: number;
  modo: AvanceVentasModo;
  fecha: string;
  sucursal?: string | null;
  /** Nombre display del vendedor, "__sin_vendedor__" o null = todos. */
  vendedor?: string | null;
  ventasSync?: SyncStatusEntry;
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
  const [drillCliente, setDrillCliente] = useState<AvanceClienteMixRow | null>(null);
  const [drillClienteOpen, setDrillClienteOpen] = useState(false);
  const [soloConVenta, setSoloConVenta] = useState(false);

  const query = useAvanceVentasQuery({
    distId,
    modo,
    fecha,
    sucursal,
    vendedor,
    ventasLastUpdated: ventasSync?.last_attempt_at ?? ventasSync?.last_updated,
  });

  const data = query.data;
  const loading = query.isLoading;
  const consolidado = !vendedor;

  const sinVentas = !loading && !!data && data.metadatos.comprobantes === 0;
  const hayCatalogo = (data?.ranking_skus?.length ?? 0) > 0;
  const coberturaPdvs = useMemo(
    () => deriveCoberturaPdvs(data, data?.series?.cobertura_pdvs),
    [data],
  );
  const totalSinVenta = useMemo(
    () => (data?.ranking_skus ?? []).filter((r) => !skuRowTieneVenta(r)).length,
    [data?.ranking_skus],
  );

  const handleSelectSku = (row: AvanceSkuRankingRow) => {
    setDrillSku(row);
    setDrillOpen(true);
  };

  const handleSelectCliente = (row: AvanceClienteMixRow) => {
    setDrillCliente(row);
    setDrillClienteOpen(true);
  };

  const banner = useMemo(() => {
    if (!data?.periodo?.parcial) return null;
    const ultima = fmtHoraAr(data.sync?.last_updated);
    const proxima = fmtHoraAr(data.sync?.next_run_hint);
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-300/70 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200">
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
            desde <code className="text-[10px] bg-muted px-1 rounded">main</code>.
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
        <Skeleton className="h-11 rounded-xl" />
        <Skeleton className="h-[320px] rounded-2xl" />
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

      <SupervisionRevealItem className="shrink-0">
        <AvanceVentasKpiStrip
          cards={data?.kpis_cards}
          modo={modo}
          coberturaPdvs={coberturaPdvs}
          loading={loading}
        />
      </SupervisionRevealItem>

      {sinVentas && (
        <SupervisionRevealItem className="shrink-0">
          <p className="text-center text-xs text-muted-foreground py-2">
            Sin ventas registradas en {data?.periodo?.label ?? "el período"} para el filtro
            seleccionado{hayCatalogo ? " — el catálogo completo queda abajo para auditar foco." : "."}
          </p>
        </SupervisionRevealItem>
      )}

      {hayCatalogo && (
        <SupervisionRevealItem className="shrink-0">
          <AvanceVentasControlsBar
            totalSinVenta={totalSinVenta}
            soloConVenta={soloConVenta}
            onSoloConVentaChange={setSoloConVenta}
          />
        </SupervisionRevealItem>
      )}

      {/* Un solo bloque de gráficos rotativos (R5) — sin grilla de 5 cards */}
      {hayCatalogo && (
        <SupervisionRevealItem className="shrink-0">
          <AvanceVentasChartCarousel data={data} modo={modo} consolidado={consolidado} />
        </SupervisionRevealItem>
      )}

      {hayCatalogo && (
        <SupervisionRevealItem className="shrink-0">
          <AvanceVentasSkuRanking
            ranking={data?.ranking_skus}
            modo={modo}
            periodoLabel={data?.periodo?.label ?? fecha}
            onSelectSku={handleSelectSku}
            soloConVenta={soloConVenta}
            className="max-h-[560px]"
          />
        </SupervisionRevealItem>
      )}

      {!sinVentas && data?.auditoria_clientes && (
        <SupervisionRevealItem className="shrink-0">
          <AvanceVentasClienteAuditoriaPanel
            auditoria={data.auditoria_clientes}
            onSelectCliente={handleSelectCliente}
          />
        </SupervisionRevealItem>
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

      <AvanceVentasClienteDrillSheet
        distId={distId}
        cliente={drillCliente}
        open={drillClienteOpen}
        onOpenChange={setDrillClienteOpen}
        modo={modo}
        fecha={fecha}
        sucursal={sucursal}
        vendedor={vendedor}
        periodoLabel={data?.periodo?.label}
      />
    </SupervisionReveal>
  );
}
