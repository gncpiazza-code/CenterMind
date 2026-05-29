import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AltasTab } from '@/hooks/useAltasCompradores';

interface SupervisionPanelStore {
  // Filtros
  selectedSucursal: string;            // "__all__" = todas
  selectedVendedorNombre: string | null;
  altasMes: string;                    // YYYY-MM
  altasTab: AltasTab;

  // Sorting CC
  ccSort: 'deuda' | 'antiguedad' | 'comprobantes' | 'ultima_compra';
  ccSortDir: 'desc' | 'asc';

  // UI
  ccResumenExpanded: boolean;
  /** ERP ID del cliente seleccionado en el panel izquierdo → perfil del deudor */
  selectedClienteErp: string | null;

  // Actions
  setSelectedSucursal: (s: string) => void;
  setSelectedVendedorNombre: (n: string | null) => void;
  setAltasMes: (m: string) => void;
  setAltasTab: (t: AltasTab) => void;
  setCCSort: (sort: 'deuda' | 'antiguedad' | 'comprobantes' | 'ultima_compra', dir: 'desc' | 'asc') => void;
  toggleCCSort: (sort: 'deuda' | 'antiguedad' | 'comprobantes' | 'ultima_compra') => void;
  setCcResumenExpanded: (open: boolean) => void;
  toggleCcResumen: () => void;
  setSelectedClienteErp: (erp: string | null) => void;
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
      altasTab: 'todos',
      ccSort: 'antiguedad',
      ccSortDir: 'desc',
      ccResumenExpanded: true,
      selectedClienteErp: null,

      setSelectedSucursal: (s) =>
        set({ selectedSucursal: s, selectedVendedorNombre: null, selectedClienteErp: null }),

      setSelectedVendedorNombre: (n) =>
        set({ selectedVendedorNombre: n, selectedClienteErp: null }),

      setAltasMes: (m) => set({ altasMes: m, altasTab: 'todos' }),

      setAltasTab: (t) => set({ altasTab: t }),

      setCCSort: (sort, dir) => set({ ccSort: sort, ccSortDir: dir }),

      toggleCCSort: (sort) => {
        const { ccSort, ccSortDir } = get();
        if (ccSort !== sort) {
          set({ ccSort: sort, ccSortDir: 'desc' });
        } else {
          set({ ccSortDir: ccSortDir === 'desc' ? 'asc' : 'desc' });
        }
      },

      setCcResumenExpanded: (open) => set({ ccResumenExpanded: open }),

      toggleCcResumen: () =>
        set({ ccResumenExpanded: !get().ccResumenExpanded }),

      setSelectedClienteErp: (erp) => set({ selectedClienteErp: erp }),
    }),
    {
      name: 'supervision-panel-store',
      partialize: (state) => ({
        selectedSucursal: state.selectedSucursal,
        selectedVendedorNombre: state.selectedVendedorNombre,
        altasMes: state.altasMes,
        altasTab: state.altasTab,
        ccSort: state.ccSort,
        ccSortDir: state.ccSortDir,
        ccResumenExpanded: state.ccResumenExpanded,
      }),
    }
  )
);
