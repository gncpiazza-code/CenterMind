import { useEstadisticasStore } from "@/store/useEstadisticasStore";
import { useGaleriaStore } from "@/store/useGaleriaStore";
import { useSupervisionStore } from "@/store/useSupervisionStore";
import { useSupervisionPanelStore } from "@/store/useSupervisionPanelStore";
import { useReportStore } from "@/store/useReportStore";
import { useObjetivosStore } from "@/store/useObjetivosStore";
import { useVisorContextStore } from "@/store/useVisorContextStore";

// Resetea todos los stores con estado tenant-scoped al cambiar de distribuidora.
// Campos como vendedorId, sucursalFiltro, filterSucursal son específicos del tenant anterior
// y quedarían stale si el nuevo tenant no tiene los mismos vendedores/sucursales.
export function resetTenantScopedStores(previousDistId?: number): void {
  // Estadísticas: meses seleccionados y filtro de sucursal son tenant-scoped
  useEstadisticasStore.setState({
    mesesSeleccionados: [],
    filterSucursal: null,
    overlayMode: "none",
    activeVendorId: null,
  });

  // Galería: vendedorId y filtroSucursal son IDs del tenant anterior
  useGaleriaStore.setState({
    filtroSucursal: "todas",
    vendedorId: null,
    searchVendedor: "",
    searchCliente: "",
    filtroEstado: "all",
    mapPins: [],
  });

  // Supervisión: clearAll resetea selección de vendedor/sucursal y estado del mapa
  useSupervisionStore.getState().clearAll();
  useSupervisionStore.getState().clearSelectedPDVs();
  useSupervisionStore.getState().clearRouteBuildState();
  useSupervisionStore.getState().setDrawVertexCount(0);
  useSupervisionStore.getState().setMapPins([]);

  // Panel supervisión: filtros de UI por vendedor/sucursal
  useSupervisionPanelStore.setState({
    selectedSucursal: "__all__",
    selectedVendedorNombre: null,
    selectedClienteErp: null,
  });

  // Reporte: solo limpiar si el savedReport pertenecía al tenant anterior
  const savedReport = useReportStore.getState().savedReport;
  if (savedReport && previousDistId != null && savedReport.distId === previousDistId) {
    useReportStore.getState().clearReport();
  }

  // Objetivos: resetear filtros de UI
  useObjetivosStore.getState().resetFilters();

  // Visor context cache: limpiar PDV/ERP context del tenant anterior
  if (previousDistId != null) {
    useVisorContextStore.getState().clearDist(previousDistId);
  }
}
