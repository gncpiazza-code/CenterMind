"use client";

import React, { memo, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { CuentasSupervision, VendedorSupervision } from "@/lib/api";
import { useSupervisionMapPinsEngine } from "@/hooks/useSupervisionMapPinsEngine";
import { useMapaCapasQuery, CrearRutasPanel } from "./CrearRutasPanel";
import { useSupervisionStore, type DrawnPolygon } from "@/store/useSupervisionStore";
import { useObjetivosMenuStore } from "@/store/useObjetivosMenuStore";
import { useShallow } from "zustand/react/shallow";
import type { VendedorKpis } from "../MapaRutas";

const MapaRutas = dynamic(() => import("../MapaRutas"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[var(--shelfy-panel)]">
      <Loader2 className="w-5 h-5 animate-spin text-[var(--shelfy-muted)]" />
    </div>
  ),
});

export interface SupervisionMapViewProps {
  distId: number;
  isSuperadmin?: boolean;
  canEditObjetivos: boolean;
  vendedores: VendedorSupervision[];
  cuentasData: CuentasSupervision | null;
  getVendorColor: (vendorId: number, idx: number) => string;
  vendedorKpis?: VendedorKpis;
  getFullscreenPanel?: () => React.ReactNode;
  onFinishPolygonRef?: React.MutableRefObject<(() => void) | null>;
}

function SupervisionMapViewInner({
  distId,
  isSuperadmin,
  canEditObjetivos,
  vendedores,
  cuentasData,
  getVendorColor,
  vendedorKpis,
  getFullscreenPanel,
  onFinishPolygonRef,
}: SupervisionMapViewProps) {
  useSupervisionMapPinsEngine({ distId, vendedores, cuentasData, getVendorColor });

  const mapPins = useSupervisionStore((s) => s.mapPins);
  const finishPolygonRefLocal = useRef<(() => void) | null>(null);
  const finishPolygonRef = onFinishPolygonRef ?? finishPolygonRefLocal;

  const {
    mapToolMode,
    routeBuildEnabled,
    visibleCapaIds,
    visibleVends,
    selectedPDVsForObjective,
    activePolygonPdvIds,
    activePolygonGeoJson,
    toggleCapaVisibility,
    togglePDVForObjective,
    clearRouteBuildState,
  } = useSupervisionStore(
    useShallow((s) => ({
      mapToolMode: s.mapToolMode,
      routeBuildEnabled: s.routeBuildEnabled,
      visibleCapaIds: s.visibleCapaIds,
      visibleVends: s.visibleVends,
      selectedPDVsForObjective: s.selectedPDVsForObjective,
      activePolygonPdvIds: s.activePolygonPdvIds,
      activePolygonGeoJson: s.activePolygonGeoJson,
      toggleCapaVisibility: s.toggleCapaVisibility,
      togglePDVForObjective: s.togglePDVForObjective,
      clearRouteBuildState: s.clearRouteBuildState,
    })),
  );

  const { data: capasData } = useMapaCapasQuery(distId);
  const mapCapas = capasData?.items ?? [];

  const vendorNamesMap = useMemo(() => {
    const m: Record<number, string> = {};
    for (const v of vendedores) m[v.id_vendedor] = v.nombre_vendedor;
    return m;
  }, [vendedores]);

  const handlePolygonSelectionChange = useCallback((pdvIds: number[], geoJson: DrawnPolygon["geoJson"]) => {
    const store = useSupervisionStore.getState();
    store.setActivePolygon(pdvIds, geoJson);
    store.clearSelectedPDVs();
    pdvIds.forEach((id) => store.togglePDVForObjective(id));
    if (pdvIds.length > 0) {
      toast.success(`${pdvIds.length} PDVs seleccionados por polígono`);
      if (store.mapToolMode === "objetivo_zona") {
        useObjetivosMenuStore.getState().setObjMenuOpen(true);
      }
    }
  }, []);

  const handleToggleVendorCapas = useCallback(
    (ids: number[], visible: boolean) => {
      const next = new Set(useSupervisionStore.getState().visibleCapaIds);
      ids.forEach((id) => (visible ? next.add(id) : next.delete(id)));
      useSupervisionStore.getState().setVisibleCapaIds(next);
    },
    [],
  );

  const handleToggleRouteBuild = useCallback(() => {
    useSupervisionStore.getState().toggleRouteBuild();
  }, []);

  const layerPanelSlot =
    mapToolMode === "crear_rutas" && activePolygonPdvIds.length > 0 && visibleVends.size === 1 ? (
      <CrearRutasPanel
        distId={distId}
        idVendedor={[...visibleVends][0]}
        vendedorNombre={vendorNamesMap[[...visibleVends][0]] ?? ""}
        pdvIds={activePolygonPdvIds}
        geoJson={activePolygonGeoJson}
        onClearPolygon={clearRouteBuildState}
      />
    ) : undefined;

  return (
    <MapaRutas
      pines={mapPins}
      getFullscreenPanel={getFullscreenPanel}
      selectedPDVs={canEditObjetivos ? selectedPDVsForObjective : []}
      onTogglePDV={canEditObjetivos ? togglePDVForObjective : undefined}
      vendedorKpis={vendedorKpis}
      mapToolMode={mapToolMode}
      routeBuildEnabled={routeBuildEnabled}
      onToggleRouteBuild={canEditObjetivos ? handleToggleRouteBuild : undefined}
      distId={distId}
      isSuperadmin={isSuperadmin}
      capas={mapCapas}
      visibleCapaIds={visibleCapaIds}
      vendorNames={vendorNamesMap}
      onToggleCapa={toggleCapaVisibility}
      onToggleVendorCapas={handleToggleVendorCapas}
      onFinishPolygonRef={finishPolygonRef}
      layerPanelSlot={layerPanelSlot}
      onPolygonSelectionChange={handlePolygonSelectionChange}
      activePolygonGeoJson={activePolygonGeoJson}
    />
  );
}

export const SupervisionMapView = memo(SupervisionMapViewInner);
