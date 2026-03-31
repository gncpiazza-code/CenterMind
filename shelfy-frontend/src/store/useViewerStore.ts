import { create } from "zustand";

interface ViewerState {
  currentIndex: number;
  currentFotoIdx: number;
  vistas: Set<number>;
  zoomLevel: number;
  isSidebarOpen: boolean;
  
  // Actions
  setCurrentIndex: (idx: number) => void;
  setCurrentFotoIdx: (idx: number) => void;
  markAsViewed: (idx: number) => void;
  resetGroupState: () => void;
  setZoomLevel: (level: number) => void;
  toggleSidebar: () => void;
  incrementIndex: () => void;
}

export const useViewerStore = create<ViewerState>((set) => ({
  currentIndex: 0,
  currentFotoIdx: 0,
  vistas: new Set([0]),
  zoomLevel: 1,
  isSidebarOpen: true,

  setCurrentIndex: (idx) => set({ currentIndex: idx }),
  setCurrentFotoIdx: (idx) => set((state) => {
    const newVistas = new Set(state.vistas);
    newVistas.add(idx);
    return { currentFotoIdx: idx, vistas: newVistas };
  }),
  markAsViewed: (idx) => set((state) => {
    const newVistas = new Set(state.vistas);
    newVistas.add(idx);
    return { vistas: newVistas };
  }),
  resetGroupState: () => set({ currentFotoIdx: 0, vistas: new Set([0]), zoomLevel: 1 }),
  setZoomLevel: (level) => set({ zoomLevel: level }),
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  incrementIndex: () => set((state) => ({ 
    currentIndex: state.currentIndex + 1,
    currentFotoIdx: 0,
    vistas: new Set([0]),
    zoomLevel: 1
  })),
}));
