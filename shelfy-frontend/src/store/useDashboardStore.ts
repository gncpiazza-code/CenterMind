import { create } from 'zustand';

interface DashboardStore {
  año: number;
  mes: number;
  dia: number | null;
  sucursalFiltro: string;
  setAño: (año: number) => void;
  setMes: (mes: number) => void;
  setDia: (dia: number | null) => void;
  setSucursalFiltro: (sucursal: string) => void;
}

export const useDashboardStore = create<DashboardStore>()((set) => ({
  año: new Date().getFullYear(),
  mes: new Date().getMonth() + 1,
  dia: null,
  sucursalFiltro: "",
  setAño: (año) => set({ año }),
  setMes: (mes) => set({ mes }),
  setDia: (dia) => set({ dia }),
  setSucursalFiltro: (sucursalFiltro) => set({ sucursalFiltro }),
}));
