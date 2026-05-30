import { create } from "zustand";
import type { ClienteContacto, ERPContexto } from "@/lib/api";
import { visorCacheKey } from "@/lib/visor-query-keys";

/** `undefined` = sin fetch aún; `[]` = buscado, sin filas en padrón. */
export type VisorPdvCacheValue = ClienteContacto[] | undefined;

interface VisorContextState {
  pdvByKey: Record<string, VisorPdvCacheValue>;
  erpByKey: Record<string, ERPContexto | null | undefined>;
  setPdv: (distId: number, erp: string, rows: ClienteContacto[]) => void;
  getPdv: (distId: number, erp: string) => VisorPdvCacheValue;
  setErp: (distId: number, erp: string, ctx: ERPContexto | null) => void;
  getErp: (distId: number, erp: string) => ERPContexto | null | undefined;
  clearDist: (distId: number) => void;
}

export const useVisorContextStore = create<VisorContextState>((set, get) => ({
  pdvByKey: {},
  erpByKey: {},

  setPdv: (distId, erp, rows) => {
    const k = visorCacheKey(distId, erp);
    set((s) => ({ pdvByKey: { ...s.pdvByKey, [k]: rows } }));
  },

  getPdv: (distId, erp) => get().pdvByKey[visorCacheKey(distId, erp)],

  setErp: (distId, erp, ctx) => {
    const k = visorCacheKey(distId, erp);
    set((s) => ({ erpByKey: { ...s.erpByKey, [k]: ctx } }));
  },

  getErp: (distId, erp) => get().erpByKey[visorCacheKey(distId, erp)],

  clearDist: (distId) => {
    const prefix = `${distId}:`;
    set((s) => ({
      pdvByKey: Object.fromEntries(
        Object.entries(s.pdvByKey).filter(([k]) => !k.startsWith(prefix)),
      ),
      erpByKey: Object.fromEntries(
        Object.entries(s.erpByKey).filter(([k]) => !k.startsWith(prefix)),
      ),
    }));
  },
}));
