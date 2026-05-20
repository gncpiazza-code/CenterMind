import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SupervisionPanelStore {
  // Filtros
  selectedSucursal: string;            // "__all__" = todas
  selectedVendedorNombre: string | null;
  altasMes: string;                    // YYYY-MM

  // Sorting CC
  ccSort: 'deuda' | 'antiguedad' | 'comprobantes' | 'ultima_compra';
  ccSortDir: 'desc' | 'asc';

  // Actions
  setSelectedSucursal: (s: string) => void;
  setSelectedVendedorNombre: (n: string | null) => void;
  setAltasMes: (m: string) => void;
  setCCSort: (sort: 'deuda' | 'antiguedad' | 'comprobantes' | 'ultima_compra', dir: 'desc' | 'asc') => void;
  toggleCCSort: (sort: 'deuda' | 'antiguedad' | 'comprobantes' | 'ultima_compra') => void;
}

function currentMes(): string {
  return new Date().toISOString().slice(0, 7);
}

export const useSupervisionPanelStore = create<SupervisionPanelStore>()(
  persist(
    (set, get) => ({
      selectedSucursal: '__all__',
      selectedVendedorNombre: null,
      altasMes: currentMes(),
      ccSort: 'antiguedad',
      ccSortDir: 'desc',

      setSelectedSucursal: (s) =>
        set({ selectedSucursal: s, selectedVendedorNombre: null }),

      setSelectedVendedorNombre: (n) => set({ selectedVendedorNombre: n }),

      setAltasMes: (m) => set({ altasMes: m }),

      setCCSort: (sort, dir) => set({ ccSort: sort, ccSortDir: dir }),

      toggleCCSort: (sort) => {
        const { ccSort, ccSortDir } = get();
        if (ccSort !== sort) {
          set({ ccSort: sort, ccSortDir: 'desc' });
        } else {
          set({ ccSortDir: ccSortDir === 'desc' ? 'asc' : 'desc' });
        }
      },
    }),
    {
      name: 'supervision-panel-store',
      partialize: (state) => ({
        selectedSucursal: state.selectedSucursal,
        selectedVendedorNombre: state.selectedVendedorNombre,
        altasMes: state.altasMes,
        ccSort: state.ccSort,
        ccSortDir: state.ccSortDir,
      }),
    }
  )
);
