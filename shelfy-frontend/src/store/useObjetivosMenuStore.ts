/**
 * UI state for the floating objectives panel in TabSupervision.
 * Kept in Zustand so that changes to this state do NOT re-render
 * sibling components (e.g. MapaRutas) that don't consume it.
 *
 * Usage: use fine-grained selectors —
 *   const open = useObjetivosMenuStore(s => s.objMenuOpen)
 * — never `const store = useObjetivosMenuStore()` (subscribes to all).
 */
import { create } from 'zustand';
import type { ObjetivoTipo } from '@/lib/api';

export type { ObjetivoTipo };
export type ObjRuteoAccion = 'cambio_ruta' | 'baja';
export type ObjCobranzaMode = 'total' | 'parcial';
export type ObjRuteoConfigMode = 'global' | 'per_pdv';

export interface ObjRuteoItem {
  accion: ObjRuteoAccion;
  id_ruta_destino?: number;
  motivo_baja?: string;
}

export interface ObjDeudor {
  cliente_nombre: string;
  deuda_total: number;
}

export interface ObjVendedorRoute {
  id_ruta: number;
  nro_ruta: string;
  dia_semana: string;
  total_pdv: number;
}

interface ObjetivosMenuStore {
  // Open state
  objMenuOpen: boolean;
  setObjMenuOpen: (v: boolean) => void;

  // Form fields
  objTipo: ObjetivoTipo;
  setObjTipo: (v: ObjetivoTipo) => void;
  objFecha: string;
  setObjFecha: (v: string) => void;
  objDesc: string;
  setObjDesc: (v: string) => void;

  // Loading / submission
  objSubmitting: boolean;
  setObjSubmitting: (v: boolean) => void;
  objLoadingContext: boolean;
  setObjLoadingContext: (v: boolean) => void;

  // Rutas for the selected vendedor
  objVendedorRoutes: ObjVendedorRoute[];
  setObjVendedorRoutes: (v: ObjVendedorRoute[]) => void;
  objSelectedRutaId: number | null;
  setObjSelectedRutaId: (v: number | null) => void;

  // Deuda / inactivos context
  objDebtList: ObjDeudor[];
  setObjDebtList: (v: ObjDeudor[]) => void;
  objInactivePdvCount: number;
  setObjInactivePdvCount: (v: number) => void;

  // Alteo
  objCantidadAlteo: number | '';
  setObjCantidadAlteo: (v: number | '') => void;

  // Cobranza
  objCobranzaMode: ObjCobranzaMode;
  setObjCobranzaMode: (v: ObjCobranzaMode) => void;
  objCobranzaMonto: number | '';
  setObjCobranzaMonto: (v: number | '') => void;
  objSelectedDeudor: ObjDeudor | null;
  setObjSelectedDeudor: (v: ObjDeudor | null) => void;

  // Ruteo
  objRuteoAccionGlobal: ObjRuteoAccion;
  setObjRuteoAccionGlobal: (v: ObjRuteoAccion) => void;
  objRuteoItemsMap: Record<number, ObjRuteoItem>;
  setObjRuteoItemsMap: (v: Record<number, ObjRuteoItem>) => void;
  updateObjRuteoItem: (pdvId: number, item: ObjRuteoItem) => void;
  objRuteoConfigMode: ObjRuteoConfigMode;
  setObjRuteoConfigMode: (v: ObjRuteoConfigMode) => void;
  objRuteoGlobalDestinoId: number | null;
  setObjRuteoGlobalDestinoId: (v: number | null) => void;
  objRuteoGlobalMotivo: string;
  setObjRuteoGlobalMotivo: (v: string) => void;

  // Reset everything except open state
  resetObjForm: () => void;
}

const INITIAL_FORM: Omit<
  ObjetivosMenuStore,
  | 'objMenuOpen' | 'setObjMenuOpen'
  | 'setObjTipo' | 'setObjFecha' | 'setObjDesc'
  | 'setObjSubmitting' | 'setObjLoadingContext'
  | 'setObjVendedorRoutes' | 'setObjSelectedRutaId'
  | 'setObjDebtList' | 'setObjInactivePdvCount'
  | 'setObjCantidadAlteo'
  | 'setObjCobranzaMode' | 'setObjCobranzaMonto' | 'setObjSelectedDeudor'
  | 'setObjRuteoAccionGlobal' | 'setObjRuteoItemsMap' | 'updateObjRuteoItem'
  | 'setObjRuteoConfigMode' | 'setObjRuteoGlobalDestinoId' | 'setObjRuteoGlobalMotivo'
  | 'resetObjForm'
> = {
  objTipo: 'exhibicion',
  objFecha: '',
  objDesc: '',
  objSubmitting: false,
  objLoadingContext: false,
  objVendedorRoutes: [],
  objSelectedRutaId: null,
  objDebtList: [],
  objInactivePdvCount: 0,
  objCantidadAlteo: '',
  objCobranzaMode: 'total',
  objCobranzaMonto: '',
  objSelectedDeudor: null,
  objRuteoAccionGlobal: 'cambio_ruta',
  objRuteoItemsMap: {},
  objRuteoConfigMode: 'global',
  objRuteoGlobalDestinoId: null,
  objRuteoGlobalMotivo: '',
};

export const useObjetivosMenuStore = create<ObjetivosMenuStore>()((set) => ({
  objMenuOpen: false,
  setObjMenuOpen: (v) => set({ objMenuOpen: v }),

  ...INITIAL_FORM,

  setObjTipo: (v) => set({ objTipo: v }),
  setObjFecha: (v) => set({ objFecha: v }),
  setObjDesc: (v) => set({ objDesc: v }),

  setObjSubmitting: (v) => set({ objSubmitting: v }),
  setObjLoadingContext: (v) => set({ objLoadingContext: v }),

  setObjVendedorRoutes: (v) => set({ objVendedorRoutes: v }),
  setObjSelectedRutaId: (v) => set({ objSelectedRutaId: v }),

  setObjDebtList: (v) => set({ objDebtList: v }),
  setObjInactivePdvCount: (v) => set({ objInactivePdvCount: v }),

  setObjCantidadAlteo: (v) => set({ objCantidadAlteo: v }),

  setObjCobranzaMode: (v) => set({ objCobranzaMode: v }),
  setObjCobranzaMonto: (v) => set({ objCobranzaMonto: v }),
  setObjSelectedDeudor: (v) => set({ objSelectedDeudor: v }),

  setObjRuteoAccionGlobal: (v) => set({ objRuteoAccionGlobal: v }),
  setObjRuteoItemsMap: (v) => set({ objRuteoItemsMap: v }),
  updateObjRuteoItem: (pdvId, item) =>
    set((s) => ({ objRuteoItemsMap: { ...s.objRuteoItemsMap, [pdvId]: item } })),
  setObjRuteoConfigMode: (v) => set({ objRuteoConfigMode: v }),
  setObjRuteoGlobalDestinoId: (v) => set({ objRuteoGlobalDestinoId: v }),
  setObjRuteoGlobalMotivo: (v) => set({ objRuteoGlobalMotivo: v }),

  resetObjForm: () => set(INITIAL_FORM),
}));
