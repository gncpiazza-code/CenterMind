import { create } from 'zustand';
import type { ObjetivoTipo } from '@/lib/api';
import { currentMonthAR } from '@/lib/galeria-month';

type ViewMode = 'kanban' | 'lista' | 'timeline' | 'stats' | 'supervisor' | 'print';
type KanbanPhase = 'planificado' | 'pendiente' | 'en_progreso' | 'terminado' | 'liquidacion' | null;

const DEFAULT_FILTER_MES = currentMonthAR();

interface ObjetivosStore {
  // Filters
  filterVendedor: number | null;
  filterVendedores: number[]; // multi-vendedor for timeline
  filterTipo: ObjetivoTipo | null;
  filterCumplido: boolean | null;
  filterKanbanPhase: KanbanPhase;
  filterSucursal: string | null;
  filterMes: string | null;  // "YYYY-MM" format
  searchText: string;

  // View
  viewMode: ViewMode;

  // Cross-tenant selection (superadmin / directorio)
  selectedTenantId: number | null;

  // Actions
  setFilterVendedor: (id: number | null) => void;
  setFilterVendedores: (ids: number[]) => void;
  toggleFilterVendedor: (id: number) => void;
  setFilterTipo: (tipo: ObjetivoTipo | null) => void;
  setFilterCumplido: (val: boolean | null) => void;
  setFilterKanbanPhase: (phase: KanbanPhase) => void;
  setFilterSucursal: (suc: string | null) => void;
  setFilterMes: (mes: string | null) => void;
  setSearchText: (text: string) => void;
  setViewMode: (mode: ViewMode) => void;
  setSelectedTenantId: (id: number | null) => void;
  resetFilters: () => void;
}

export const useObjetivosStore = create<ObjetivosStore>((set) => ({
  filterVendedor: null,
  filterVendedores: [],
  filterTipo: null,
  filterCumplido: null,
  filterKanbanPhase: null,
  filterSucursal: null,
  filterMes: DEFAULT_FILTER_MES,
  searchText: '',
  viewMode: 'kanban',
  selectedTenantId: null,

  setFilterVendedor: (id) => set({ filterVendedor: id }),
  setFilterVendedores: (ids) => set({ filterVendedores: ids }),
  toggleFilterVendedor: (id) => set((s) => ({
    filterVendedores: s.filterVendedores.includes(id)
      ? s.filterVendedores.filter(v => v !== id)
      : [...s.filterVendedores, id],
  })),
  setFilterTipo: (tipo) => set({ filterTipo: tipo }),
  setFilterCumplido: (val) => set({ filterCumplido: val }),
  setFilterKanbanPhase: (phase) => set({ filterKanbanPhase: phase }),
  setFilterSucursal: (suc) => set({ filterSucursal: suc }),
  setFilterMes: (mes) => set({ filterMes: mes }),
  setSearchText: (text) => set({ searchText: text }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setSelectedTenantId: (id) => set({ selectedTenantId: id }),
  resetFilters: () => set({
    filterVendedor: null,
    filterVendedores: [],
    filterTipo: null,
    filterCumplido: null,
    filterKanbanPhase: null,
    filterSucursal: null,
    filterMes: currentMonthAR(),
    searchText: '',
  }),
}));
