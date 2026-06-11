import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AltasTab } from '@/hooks/useAltasCompradores';
import { SUPERVISION_PANEL_STORAGE_KEY } from '@/lib/supervision-panel-persist';

export type SupervisionViewMode = 'cc' | 'avance';
export type AvancePeriodoModo = 'dia' | 'semana' | 'mes';

/** Filtro vendedor exclusivo del modo avance (bucket sin vendedor ERP). */
export const SIN_VENDEDOR_VALUE = '__sin_vendedor__';

interface SupervisionPanelStore {
  // Modo de pantalla: Cuentas Corrientes | Avance de ventas
  viewMode: SupervisionViewMode;
  // Periodo del modo avance de ventas
  avanceModo: AvancePeriodoModo;
  avanceFecha: string;                 // YYYY-MM-DD ancla

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
  setViewMode: (m: SupervisionViewMode) => void;
  setAvancePeriodo: (modo: AvancePeriodoModo, fecha: string) => void;
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

function todayIso(): string {
  // Calendario AR (UTC-3)
  const now = new Date();
  const ar = new Date(now.getTime() + (now.getTimezoneOffset() - 180) * 60_000);
  return ar.toISOString().slice(0, 10);
}

export const useSupervisionPanelStore = create<SupervisionPanelStore>()(
  persist(
    (set, get) => ({
      viewMode: 'cc',
      avanceModo: 'dia',
      avanceFecha: todayIso(),
      selectedSucursal: '__all__',
      selectedVendedorNombre: null,
      altasMes: currentMes(),
      altasTab: 'todos',
      ccSort: 'antiguedad',
      ccSortDir: 'desc',
      ccResumenExpanded: true,
      selectedClienteErp: null,

      setViewMode: (m) => {
        const { selectedVendedorNombre } = get();
        set({
          viewMode: m,
          // "Sin vendedor" solo existe en avance: al volver a CC, resetear a todos.
          selectedVendedorNombre:
            m === 'cc' && selectedVendedorNombre === SIN_VENDEDOR_VALUE
              ? null
              : selectedVendedorNombre,
        });
      },

      setAvancePeriodo: (modo, fecha) => set({ avanceModo: modo, avanceFecha: fecha }),

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
      name: SUPERVISION_PANEL_STORAGE_KEY,
      partialize: (state) => ({
        viewMode: state.viewMode,
        avanceModo: state.avanceModo,
        selectedSucursal: state.selectedSucursal,
        selectedVendedorNombre: state.selectedVendedorNombre,
        altasMes: state.altasMes,
        altasTab: state.altasTab,
        ccSort: state.ccSort,
        ccSortDir: state.ccSortDir,
        ccResumenExpanded: state.ccResumenExpanded,
        // avanceFecha NO se persiste: cada sesión arranca en "hoy".
      }),
    }
  )
);
