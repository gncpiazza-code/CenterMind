import { create } from "zustand";
import { persist } from "zustand/middleware";

type SortField = "exhibicion" | "compra";
type SortDir = "desc" | "asc";

interface GaleriaStore {
  searchVendedor: string;
  searchCliente: string;
  filtroSucursal: string;
  fechaDesde: string;
  fechaHasta: string;
  sortField: SortField;
  sortDir: SortDir;
  timelinePageSize: number;
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
      }),
    }
  )
);
