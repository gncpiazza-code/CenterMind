import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type MapMode = 'activos' | 'deudores' | 'ruteo';

interface SupervisionStore {
  // Selected filters
  selectedSucursal: string | null;
  setSelectedSucursal: (sucursal: string | null) => void;

  // Map mode
  mapMode: MapMode;
  setMapMode: (mode: MapMode) => void;

  // Visibility state (3-level hierarchy)
  visibleVends: Set<number>;
  visibleRutas: Set<number>;
  visibleClientes: Set<number>;

  // Actions
  toggleVendor: (vendorId: number) => void;
  toggleRuta: (rutaId: number) => void;
  toggleCliente: (clienteId: number) => void;

  // Batch operations
  setVisibleVends: (ids: Set<number>) => void;
  setVisibleRutas: (ids: Set<number>) => void;
  setVisibleClientes: (ids: Set<number>) => void;

  // Clear all
  clearAll: () => void;

  // Vendor color overrides (keyed by `${distId}:${vendorId}`)
  vendorColorOverrides: Record<string, string>;
  setVendorColorOverride: (distId: number, vendorId: number, color: string) => void;
  clearVendorColorOverride: (distId: number, vendorId: number) => void;

  // PDV selection for objective creation ("shopping cart")
  selectedPDVsForObjective: number[];
  togglePDVForObjective: (id: number) => void;
  clearSelectedPDVs: () => void;
}

export const useSupervisionStore = create<SupervisionStore>()(
  persist(
    (set) => ({
      selectedSucursal: null,
      mapMode: 'activos',
      visibleVends: new Set(),
      visibleRutas: new Set(),
      visibleClientes: new Set(),
      vendorColorOverrides: {},
      selectedPDVsForObjective: [],

      setSelectedSucursal: (sucursal) => set({ selectedSucursal: sucursal }),
      setMapMode: (mode) => set({ mapMode: mode }),

      toggleVendor: (vendorId) =>
        set((state) => {
          const newSet = new Set(state.visibleVends);
          if (newSet.has(vendorId)) {
            newSet.delete(vendorId);
          } else {
            newSet.add(vendorId);
          }
          return { visibleVends: newSet };
        }),

      toggleRuta: (rutaId) =>
        set((state) => {
          const newSet = new Set(state.visibleRutas);
          if (newSet.has(rutaId)) {
            newSet.delete(rutaId);
          } else {
            newSet.add(rutaId);
          }
          return { visibleRutas: newSet };
        }),

      toggleCliente: (clienteId) =>
        set((state) => {
          const newSet = new Set(state.visibleClientes);
          if (newSet.has(clienteId)) {
            newSet.delete(clienteId);
          } else {
            newSet.add(clienteId);
          }
          return { visibleClientes: newSet };
        }),

      setVisibleVends: (ids) => set({ visibleVends: new Set(ids) }),
      setVisibleRutas: (ids) => set({ visibleRutas: new Set(ids) }),
      setVisibleClientes: (ids) => set({ visibleClientes: new Set(ids) }),

      clearAll: () =>
        set({
          visibleVends: new Set(),
          visibleRutas: new Set(),
          visibleClientes: new Set(),
        }),

      setVendorColorOverride: (distId, vendorId, color) =>
        set((state) => {
          const key = `${distId}:${vendorId}`;
          return {
            vendorColorOverrides: {
              ...state.vendorColorOverrides,
              [key]: color,
            },
          };
        }),

      clearVendorColorOverride: (distId, vendorId) =>
        set((state) => {
          const key = `${distId}:${vendorId}`;
          const next = { ...state.vendorColorOverrides };
          delete next[key];
          return { vendorColorOverrides: next };
        }),

      togglePDVForObjective: (id) =>
        set((state) => {
          const exists = state.selectedPDVsForObjective.includes(id);
          return {
            selectedPDVsForObjective: exists
              ? state.selectedPDVsForObjective.filter(x => x !== id)
              : [...state.selectedPDVsForObjective, id],
          };
        }),

      clearSelectedPDVs: () => set({ selectedPDVsForObjective: [] }),
    }),
    {
      name: 'supervision-store',
      // No persistir visibilidad mapa: IDs viejos en localStorage seguían "prendidos"
      // tras bajas de padrón aunque el API ya no devuelva esos PDV.
      partialize: (state) => ({
        selectedSucursal: state.selectedSucursal,
        mapMode: state.mapMode,
        vendorColorOverrides: state.vendorColorOverrides,
      }),
      merge: (persistedState: any, currentState) => ({
        ...currentState,
        mapMode: persistedState?.mapMode ?? currentState.mapMode,
        selectedSucursal: persistedState?.selectedSucursal ?? currentState.selectedSucursal,
        vendorColorOverrides: persistedState?.vendorColorOverrides ?? currentState.vendorColorOverrides,
        visibleVends: new Set(),
        visibleRutas: new Set(),
        visibleClientes: new Set(),
      }),
    }
  )
);
