import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { GaleriaMapaPin } from "@/lib/api";
import { GALERIA_FILTER_ALL } from "@/lib/galeria-url";
import { currentMonthAR, mesFromLegacyRange } from "@/lib/galeria-month";

type SortField = "exhibicion" | "compra";
type SortDir = "desc" | "asc";
type ViewMode = "mapa" | "grid";

interface GaleriaStore {
  searchVendedor: string;
  searchCliente: string;
  filtroSucursal: string;
  /** YYYY-MM — mes activo para filtros de galería */
  mesGaleria: string;
  sortField: SortField;
  sortDir: SortDir;
  timelinePageSize: number;
  viewMode: ViewMode;
  filtroEstado: string;
  hideSinExhib: boolean;
  vendedorId: number | null;
  /** Pins del mapa actual (navegación ↑/↓ en visor) — no persistido */
  mapPins: GaleriaMapaPin[];
  setSearchVendedor: (value: string) => void;
  setSearchCliente: (value: string) => void;
  setFiltroSucursal: (value: string) => void;
  setMesGaleria: (value: string) => void;
  setSortField: (value: SortField) => void;
  setSortDir: (value: SortDir) => void;
  setTimelinePageSize: (value: number) => void;
  clearMesGaleria: () => void;
  clearClientSearch: () => void;
  setViewMode: (mode: ViewMode) => void;
  setFiltroEstado: (estado: string) => void;
  setHideSinExhib: (value: boolean) => void;
  setVendedorId: (id: number | null) => void;
  setMapPins: (pins: GaleriaMapaPin[]) => void;
}

export const useGaleriaStore = create<GaleriaStore>()(
  persist(
    (set) => ({
      searchVendedor: "",
      searchCliente: "",
      filtroSucursal: "todas",
      mesGaleria: currentMonthAR(),
      sortField: "exhibicion",
      sortDir: "desc",
      timelinePageSize: 30,
      viewMode: "mapa",
      filtroEstado: GALERIA_FILTER_ALL,
      hideSinExhib: false,
      vendedorId: null,
      mapPins: [],
      setSearchVendedor: (value) => set({ searchVendedor: value }),
      setSearchCliente: (value) => set({ searchCliente: value }),
      setFiltroSucursal: (value) => set({ filtroSucursal: value }),
      setMesGaleria: (value) => set({ mesGaleria: value }),
      setSortField: (value) => set({ sortField: value }),
      setSortDir: (value) => set({ sortDir: value }),
      setTimelinePageSize: (value) => set({ timelinePageSize: Math.max(10, Math.min(120, value)) }),
      clearMesGaleria: () => set({ mesGaleria: "" }),
      clearClientSearch: () => set({ searchCliente: "" }),
      setViewMode: (mode) => set({ viewMode: mode }),
      setFiltroEstado: (estado) => set({ filtroEstado: estado }),
      setHideSinExhib: (value) => set({ hideSinExhib: value }),
      setVendedorId: (id) => set({ vendedorId: id }),
      setMapPins: (pins) => set({ mapPins: pins }),
    }),
    {
      name: "galeria-store",
      version: 2,
      migrate: (persisted, version) => {
        const state = persisted as Record<string, unknown>;
        if (version < 2) {
          const legacyDesde = typeof state.fechaDesde === "string" ? state.fechaDesde : "";
          const legacyHasta = typeof state.fechaHasta === "string" ? state.fechaHasta : "";
          const fromLegacy = mesFromLegacyRange(legacyDesde, legacyHasta);
          state.mesGaleria = fromLegacy || currentMonthAR();
          delete state.fechaDesde;
          delete state.fechaHasta;
          delete state.clearDateRange;
        }
        return state as GaleriaStore;
      },
      partialize: (state) => ({
        filtroSucursal: state.filtroSucursal,
        mesGaleria: state.mesGaleria,
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
