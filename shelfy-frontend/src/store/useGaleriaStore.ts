import { create } from "zustand";
import { persist } from "zustand/middleware";

type SortField = "exhibicion" | "compra";
type SortDir = "desc" | "asc";
type ViewMode = "mapa" | "grid";

interface GaleriaStore {
  searchVendedor: string;
  searchCliente: string;
  filtroSucursal: string;
  fechaDesde: string;
  fechaHasta: string;
  sortField: SortField;
  sortDir: SortDir;
  timelinePageSize: number;
  // Nuevos campos
  viewMode: ViewMode;
  filtroEstado: string;
  hideSinExhib: boolean;
  vendedorId: number | null;
  // Actions existentes
  setSearchVendedor: (value: string) => void;
  setSearchCliente: (value: string) => void;
  setFiltroSucursal: (value: string) => void;
  setFechaDesde: (value: string) => void;
  setFechaHasta: (value: string) => void;
  setSortField: (value: SortField) => void;
  setSortDir: (value: SortDir) => void;
  setTimelinePageSize: (value: number) => void;
  clearDateRange: () => void;
  clearClientSearch: () => void;
  // Nuevas actions
  setViewMode: (mode: ViewMode) => void;
  setFiltroEstado: (estado: string) => void;
  setHideSinExhib: (value: boolean) => void;
  setVendedorId: (id: number | null) => void;
}

export const useGaleriaStore = create<GaleriaStore>()(
  persist(
    (set) => ({
      searchVendedor: "",
      searchCliente: "",
      filtroSucursal: "todas",
      fechaDesde: "",
      fechaHasta: "",
      sortField: "exhibicion",
      sortDir: "desc",
      timelinePageSize: 30,
      // Nuevos defaults
      viewMode: "mapa",
      filtroEstado: "",
      hideSinExhib: false,
      vendedorId: null,
      // Actions existentes
      setSearchVendedor: (value) => set({ searchVendedor: value }),
      setSearchCliente: (value) => set({ searchCliente: value }),
      setFiltroSucursal: (value) => set({ filtroSucursal: value }),
      setFechaDesde: (value) => set({ fechaDesde: value }),
      setFechaHasta: (value) => set({ fechaHasta: value }),
      setSortField: (value) => set({ sortField: value }),
      setSortDir: (value) => set({ sortDir: value }),
      setTimelinePageSize: (value) => set({ timelinePageSize: Math.max(10, Math.min(120, value)) }),
      clearDateRange: () => set({ fechaDesde: "", fechaHasta: "" }),
      clearClientSearch: () => set({ searchCliente: "" }),
      // Nuevas actions
      setViewMode: (mode) => set({ viewMode: mode }),
      setFiltroEstado: (estado) => set({ filtroEstado: estado }),
      setHideSinExhib: (value) => set({ hideSinExhib: value }),
      setVendedorId: (id) => set({ vendedorId: id }),
    }),
    {
      name: "galeria-store",
      partialize: (state) => ({
        filtroSucursal: state.filtroSucursal,
        fechaDesde: state.fechaDesde,
        fechaHasta: state.fechaHasta,
        sortField: state.sortField,
        sortDir: state.sortDir,
        timelinePageSize: state.timelinePageSize,
        viewMode: state.viewMode,
        filtroEstado: state.filtroEstado,
        hideSinExhib: state.hideSinExhib,
        vendedorId: state.vendedorId,
      }),
    }
  )
);
