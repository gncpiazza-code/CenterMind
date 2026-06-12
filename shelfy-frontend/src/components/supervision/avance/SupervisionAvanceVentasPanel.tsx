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
import { SupervisionReveal, SupervisionRevealItem } from "@/components/supervision/SupervisionReveal";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
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
  /** Cuenta patrón bajo Ivan Soto: equipo | monchi | jorge_coronel */
  patronCuenta?: string | null;
  ventasSync?: SyncStatusEntry;
}

/** Cuerpo del modo "Avance de ventas" en /supervision (alternable con CC). */
export function SupervisionAvanceVentasPanel({
  distId,
  modo,
  fecha,
  sucursal,
  vendedor,
  patronCuenta,
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
    cuenta: patronCuenta,
    ventasLastUpdated: ventasSync?.last_attempt_at ?? ventasSync?.last_updated,
  });

  const data = query.data;
  const isInitialLoad = query.isLoading && !data;
  /** Cambio de sucursal/vendedor/período: keepPreviousData muestra datos viejos hasta que llega el fetch. */
  const isFilterTransition = query.isFetching && query.isPlaceholderData;
  const loading = isInitialLoad || isFilterTransition;
  const consolidado = !vendedor;

  const sinVentas = !isInitialLoad && !isFilterTransition && !!data && data.metadatos.comprobantes === 0;
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
            {query.error instanceof Error
              ? query.error.name === "TimeoutError"
                ? "La consulta tardó demasiado. Probá de nuevo o elegí un período más corto (Día)."
                : query.error.message
              : "Error desconocido"}
          </p>
        )}
      </div>
    );
  }

  if (isInitialLoad) {
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
    <div className="relative flex flex-col gap-4 min-h-[200px]">
      {isFilterTransition && (
        <div
          className="absolute inset-0 z-30 flex items-start justify-center pt-20 md:pt-28 rounded-xl bg-background/55 backdrop-blur-[2px]"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex items-center gap-2 rounded-full border border-border/80 bg-card px-4 py-2 text-xs font-medium text-foreground shadow-md">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500 shrink-0" />
            Actualizando avance para el filtro seleccionado…
          </div>
        </div>
      )}

      <SupervisionReveal
        className={cn(
          "flex flex-col gap-4 transition-opacity duration-200",
          isFilterTransition && "opacity-40 pointer-events-none select-none",
        )}
        animate={!isFilterTransition}
      >
      <SupervisionRevealItem className="shrink-0">
        <AvanceVentasKpiStrip
          cards={isFilterTransition ? undefined : data?.kpis_cards}
          modo={modo}
          coberturaPdvs={isFilterTransition ? undefined : coberturaPdvs}
          proyeccionContext={isFilterTransition ? undefined : data?.proyeccion_context}
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
            proyeccionContext={isFilterTransition ? undefined : data?.proyeccion_context}
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
        patronCuenta={patronCuenta}
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
        patronCuenta={patronCuenta}
        periodoLabel={data?.periodo?.label}
      />
    </SupervisionReveal>
    </div>
  );
}
