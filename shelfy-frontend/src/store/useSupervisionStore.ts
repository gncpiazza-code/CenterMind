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
      partialize: (state) => ({
        selectedSucursal: state.selectedSucursal,
        mapMode: state.mapMode,
        visibleVends: Array.from(state.visibleVends),
        visibleRutas: Array.from(state.visibleRutas),
        visibleClientes: Array.from(state.visibleClientes),
      }),
      merge: (persistedState: any, currentState) => ({
        ...currentState,
        ...persistedState,
        mapMode: persistedState?.mapMode ?? 'activos',
        visibleVends: new Set(persistedState?.visibleVends || []),
        visibleRutas: new Set(persistedState?.visibleRutas || []),
        visibleClientes: new Set(persistedState?.visibleClientes || []),
      }),
    }
  )
);
