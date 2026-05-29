import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type OverlayMode = 'none' | 'compania' | 'distribuidor' | 'ambos';

interface EstadisticasStore {
  mesesSeleccionados: string[];
  setMesesSeleccionados: (meses: string[]) => void;
  toggleMes: (mes: string) => void;

  filterSucursal: string | null;
  setFilterSucursal: (suc: string | null) => void;

  activeVendorId: string | null;
  setActiveVendorId: (id: string | null) => void;

  overlayMode: OverlayMode;
  setOverlayMode: (mode: OverlayMode) => void;

  selectedTenantId: number | null;
  setSelectedTenantId: (id: number | null) => void;
}

export const useEstadisticasStore = create<EstadisticasStore>()(
  persist(
    (set) => ({
      mesesSeleccionados: [],
      setMesesSeleccionados: (meses) => set({ mesesSeleccionados: meses }),
      toggleMes: (mes) =>
        set((s) => ({
          mesesSeleccionados: s.mesesSeleccionados.includes(mes)
            ? s.mesesSeleccionados.filter((m) => m !== mes)
            : [...s.mesesSeleccionados, mes],
        })),

      filterSucursal: null,
      setFilterSucursal: (filterSucursal) => set({ filterSucursal }),

      activeVendorId: null,
      setActiveVendorId: (activeVendorId) => set({ activeVendorId }),

      overlayMode: 'none',
      setOverlayMode: (overlayMode) => set({ overlayMode }),

      selectedTenantId: null,
      setSelectedTenantId: (selectedTenantId) => set({ selectedTenantId }),
    }),
    {
      name: 'estadisticas-store',
      partialize: (s) => ({
        mesesSeleccionados: s.mesesSeleccionados,
        filterSucursal: s.filterSucursal,
        overlayMode: s.overlayMode,
      }),
    },
  ),
);
