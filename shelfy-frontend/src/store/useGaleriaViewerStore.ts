import { create } from "zustand";

/** Sesión del visor galería (no persistida) — evita flash de PDV anterior. */
interface GaleriaViewerStore {
  /** Cliente cuyo carrusel está listo para mostrarse (datos + imagen precargada). */
  readyClienteId: number | null;
  /** Día activo (YYYY-MM-DD) para re-sync al volver al mismo PDV. */
  activePubDiaAr: string | null;
  /** Incrementa en cada cambio de PDV — invalida renders obsoletos. */
  transitionEpoch: number;
  beginPdvTransition: (idCliente: number) => void;
  commitPdvReady: (idCliente: number, pubDiaAr: string | null) => void;
  setActivePubDiaAr: (diaAr: string) => void;
  reset: () => void;
}

export const useGaleriaViewerStore = create<GaleriaViewerStore>((set) => ({
  readyClienteId: null,
  activePubDiaAr: null,
  transitionEpoch: 0,
  beginPdvTransition: (idCliente) =>
    set((s) => ({
      readyClienteId: null,
      activePubDiaAr: null,
      transitionEpoch: s.transitionEpoch + 1,
    })),
  commitPdvReady: (idCliente, pubDiaAr) =>
    set({ readyClienteId: idCliente, activePubDiaAr: pubDiaAr }),
  setActivePubDiaAr: (diaAr) => set({ activePubDiaAr: diaAr }),
  reset: () =>
    set({ readyClienteId: null, activePubDiaAr: null, transitionEpoch: 0 }),
}));
