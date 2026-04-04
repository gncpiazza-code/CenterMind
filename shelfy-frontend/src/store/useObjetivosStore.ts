import { create } from 'zustand';
import type { ObjetivoTipo } from '@/lib/api';

interface ObjetivosStore {
  filterVendedor: number | null;
  filterTipo: ObjetivoTipo | null;
  filterCumplido: boolean | null;
  searchText: string;
  viewMode: 'lista' | 'tablero';

  setFilterVendedor: (id: number | null) => void;
  setFilterTipo: (tipo: ObjetivoTipo | null) => void;
  setFilterCumplido: (val: boolean | null) => void;
  setSearchText: (text: string) => void;
  setViewMode: (mode: 'lista' | 'tablero') => void;
  resetFilters: () => void;
}

export const useObjetivosStore = create<ObjetivosStore>((set) => ({
  filterVendedor: null,
  filterTipo: null,
  filterCumplido: null,
  searchText: '',
  viewMode: 'lista',

  setFilterVendedor: (id) => set({ filterVendedor: id }),
  setFilterTipo: (tipo) => set({ filterTipo: tipo }),
  setFilterCumplido: (val) => set({ filterCumplido: val }),
  setSearchText: (text) => set({ searchText: text }),
  setViewMode: (mode) => set({ viewMode: mode }),
  resetFilters: () => set({ filterVendedor: null, filterTipo: null, filterCumplido: null, searchText: '' }),
}));
