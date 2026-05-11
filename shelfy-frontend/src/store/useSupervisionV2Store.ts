import { create } from 'zustand';

interface SupervisionV2State {
  // Filtros globales
  dateRange: 'hoy' | 'semana' | 'mes' | 'personalizado';
  setDateRange: (range: 'hoy' | 'semana' | 'mes' | 'personalizado') => void;
  
  selectedSucursal: string | null;
  setSelectedSucursal: (sucursal: string | null) => void;
  
  selectedVendedor: string | null;
  setSelectedVendedor: (vendedorId: string | null) => void;
  
  selectedRuta: string | null;
  setSelectedRuta: (ruta: string | null) => void;
  
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // Estado de la UI
  activeTab: 'ranking' | 'ventas' | 'articulos';
  setActiveTab: (tab: 'ranking' | 'ventas' | 'articulos') => void;

  // Drawers
  drawerOpen: boolean;
  drawerType: 'vendedor' | 'venta' | null;
  drawerId: string | number | null;
  openDrawer: (type: 'vendedor' | 'venta', id: string | number) => void;
  closeDrawer: () => void;
}

export const useSupervisionV2Store = create<SupervisionV2State>((set) => ({
  dateRange: 'mes',
  setDateRange: (dateRange) => set({ dateRange }),

  selectedSucursal: null,
  setSelectedSucursal: (selectedSucursal) => set({ selectedSucursal }),

  selectedVendedor: null,
  setSelectedVendedor: (selectedVendedor) => set({ selectedVendedor }),

  selectedRuta: null,
  setSelectedRuta: (selectedRuta) => set({ selectedRuta }),

  searchQuery: '',
  setSearchQuery: (searchQuery) => set({ searchQuery }),

  activeTab: 'ranking',
  setActiveTab: (activeTab) => set({ activeTab }),

  drawerOpen: false,
  drawerType: null,
  drawerId: null,
  openDrawer: (drawerType, drawerId) => set({ drawerOpen: true, drawerType, drawerId }),
  closeDrawer: () => set({ drawerOpen: false, drawerType: null, drawerId: null }),
}));
